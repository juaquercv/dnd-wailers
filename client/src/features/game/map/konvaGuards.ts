import Konva from 'konva';

/*
 * Konva keeps two pieces of global state that a single unexpected exception can wedge forever:
 *  - Util.requestAnimFrame runs every queued callback of a frame in one loop: if one throws (a draw that
 *    fails), the rest of that frame is dropped, so the layers queued after it keep `_waitingForDraw = true`
 *    and never redraw again (their hit canvas freezes and their tokens stop being clickable), and the
 *    animation loop can stop for good.
 *  - DD._dragElements: a drag whose mouseup never arrives (window lost focus, a handler threw inside the
 *    dragend dispatch, the node left the stage) stays registered; Konva then suppresses every later click
 *    (`_mouseListenClick = false`) or keeps "dragging" a node, and the layer under drag skips its hit graph.
 * These guards isolate failures and clean stale drags before every new press.
 */

type FrameCallback = () => void;

interface DragElement {
  node: Konva.Node;
  dragStatus: 'ready' | 'dragging' | 'stopped';
}

interface PatchedLayer {
  _waitingForDraw: boolean;
}

let installed = false;

function report(err: unknown): void {
  console.error('[mapa] Error al dibujar el mapa (se recupera solo):', err);
}

function dragElements(): Map<number, DragElement> | null {
  const dd = (Konva as unknown as { DD?: { _dragElements?: Map<number, DragElement> } }).DD;
  return dd?._dragElements ?? null;
}

function redraw(node: Konva.Node | null | undefined): void {
  try {
    node?.getLayer()?.batchDraw();
  } catch (err) {
    report(err);
  }
}

/**
 * Drops drag registrations that can no longer finish normally. With `pressStarting` (a new mouse/touch
 * press is about to be handled) every leftover drag is finished first: a new press means the previous
 * release was lost.
 */
export function cleanupStaleDrags(pressStarting: boolean): number {
  const elements = dragElements();
  if (!elements || elements.size === 0) return 0;
  let cleaned = 0;
  for (const [key, elem] of [...elements]) {
    const node = elem.node;
    const attached = !!node?.getStage();
    if (!attached || elem.dragStatus === 'stopped') {
      elements.delete(key);
      cleaned += 1;
      if (attached) redraw(node);
      continue;
    }
    if (pressStarting) {
      if (elem.dragStatus === 'dragging') {
        try {
          node.stopDrag();
        } catch (err) {
          report(err);
        }
      }
      elements.delete(key);
      cleaned += 1;
      redraw(node);
    }
  }
  if (cleaned > 0) {
    const g = Konva as unknown as { _mouseListenClick?: boolean; _touchListenClick?: boolean; _pointerListenClick?: boolean };
    g._mouseListenClick = false;
    g._touchListenClick = false;
    g._pointerListenClick = false;
  }
  return cleaned;
}

/** True while Konva is dragging a node (a live token drag). */
export function isKonvaDragging(): boolean {
  const elements = dragElements();
  if (!elements) return false;
  for (const elem of elements.values()) if (elem.dragStatus === 'dragging') return true;
  return false;
}

interface AnimationInternals {
  animations: { func?: AnimationFunc }[];
  animRunning: boolean;
  _runFrames: () => void;
  _animationLoop: () => void;
}

type AnimationFunc = (this: unknown, frame: unknown) => unknown;

const REPORT_EVERY_MS = 5000;
let lastAnimReport = -Infinity;

function reportAnimation(err: unknown): void {
  const now = performance.now();
  if (now - lastAnimReport < REPORT_EVERY_MS) return;
  lastAnimReport = now;
  report(err);
}

/**
 * Konva.Animation runs every animation (tweens, pulses, pings, spell fx) in one loop that requeues itself only
 * after all of them ran: one throwing frame would stop every map animation for good. Each animation frame is
 * isolated (a failing one skips its redraw) and the loop always requeues while animations remain.
 */
function guardAnimationLoop(util: { requestAnimFrame: (cb: FrameCallback) => void }): void {
  const anim = Konva.Animation as unknown as AnimationInternals;
  if (typeof anim._runFrames !== 'function' || !Array.isArray(anim.animations)) return;
  const guarded = new WeakSet<AnimationFunc>();
  const runFrames = anim._runFrames.bind(anim);
  anim._runFrames = () => {
    for (const a of anim.animations) {
      const func = a.func;
      if (!func || guarded.has(func)) continue;
      const safe: AnimationFunc = function safeFrame(this: unknown, frame: unknown) {
        try {
          return func.call(this, frame);
        } catch (err) {
          reportAnimation(err);
          return false;
        }
      };
      guarded.add(safe);
      a.func = safe;
    }
    runFrames();
  };
  anim._animationLoop = () => {
    if (anim.animations.length === 0) {
      anim.animRunning = false;
      return;
    }
    try {
      anim._runFrames();
    } catch (err) {
      reportAnimation(err);
    }
    util.requestAnimFrame(anim._animationLoop);
  };
}

/** Installs the guards once (idempotent). */
export function installKonvaGuards(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const util = Konva.Util as unknown as { requestAnimFrame: (cb: FrameCallback) => void };
  const original = util.requestAnimFrame.bind(Konva.Util);
  util.requestAnimFrame = (cb: FrameCallback) =>
    original(() => {
      try {
        cb();
      } catch (err) {
        report(err);
      }
    });

  const layerProto = Konva.Layer.prototype as unknown as Konva.Layer & PatchedLayer;
  layerProto.batchDraw = function batchDraw(this: Konva.Layer & PatchedLayer) {
    if (!this._waitingForDraw) {
      this._waitingForDraw = true;
      util.requestAnimFrame(() => {
        try {
          this.draw();
        } finally {
          this._waitingForDraw = false;
        }
      });
    }
    return this;
  };

  guardAnimationLoop(util);

  // Runs before Konva sees the press (capture on window): a lost release must not swallow this click.
  const onPress = () => {
    cleanupStaleDrags(true);
  };
  window.addEventListener('mousedown', onPress, true);
  window.addEventListener('touchstart', onPress, true);
  // Konva keeps dragging on mousemove without checking the buttons: with the left button up, the release was
  // lost, so the drag ends right there instead of the token following the cursor until the next click.
  const onMove = (e: MouseEvent) => {
    if (typeof e.buttons !== 'number' || (e.buttons & 1) !== 0) return;
    const elements = dragElements();
    if (elements && elements.size > 0) cleanupStaleDrags(true);
  };
  window.addEventListener('mousemove', onMove, true);
  // Releases that happen outside the page (alt-tab, dialogs): finish whatever was being dragged.
  const onLostFocus = () => {
    if (document.visibilityState === 'hidden' || !document.hasFocus()) cleanupStaleDrags(true);
  };
  window.addEventListener('blur', onLostFocus);
  document.addEventListener('visibilitychange', onLostFocus);
}
