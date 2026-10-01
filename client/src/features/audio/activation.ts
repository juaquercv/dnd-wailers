/**
 * Browser autoplay policy helpers. Audio (Web Audio or HTML5) may only start after the page received a
 * user gesture. `navigator.userActivation` is used when available; a capture listener is the fallback.
 */

type ActivationListener = () => void;

const ACTIVATION_EVENTS = ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'] as const;

let interacted = false;
const listeners = new Set<ActivationListener>();

function onGesture(): void {
  interacted = true;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (err) {
      console.error('[audio] activation listener error', err);
    }
  }
}

if (typeof window !== 'undefined') {
  for (const type of ACTIVATION_EVENTS) {
    window.addEventListener(type, onGesture, { capture: true, passive: true });
  }
}

interface UserActivationLike {
  hasBeenActive: boolean;
  isActive: boolean;
}

/** True once the page received a gesture that allows audio playback. */
export function hasUserActivation(): boolean {
  if (interacted) return true;
  if (typeof navigator === 'undefined') return false;
  const ua = (navigator as Navigator & { userActivation?: UserActivationLike }).userActivation;
  return ua ? ua.hasBeenActive || ua.isActive : false;
}

/** Called on every user gesture (inside the gesture handler, so audio may be started from it). */
export function onUserGesture(listener: ActivationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
