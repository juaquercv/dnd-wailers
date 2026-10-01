/** Keyframes used by the visual effects, injected once into <head>. */

const STYLE_ID = 'wailers-fx-styles';

function shakeFrame(pct: number, x: number, y: number, rot: number): string {
  return `${pct}% { transform: translate3d(calc(var(--wfx-amp, 10px) * ${x}), calc(var(--wfx-amp, 10px) * ${y}), 0) rotate(calc(var(--wfx-rot, 0.4deg) * ${rot})); }`;
}

const SHAKE_FRAMES = [
  shakeFrame(6, -1, 0.45, -1),
  shakeFrame(13, 0.92, -0.6, 0.9),
  shakeFrame(21, -0.78, -0.4, -0.7),
  shakeFrame(30, 0.64, 0.55, 0.55),
  shakeFrame(40, -0.5, 0.3, -0.42),
  shakeFrame(51, 0.38, -0.36, 0.3),
  shakeFrame(62, -0.26, 0.22, -0.2),
  shakeFrame(73, 0.16, -0.14, 0.12),
  shakeFrame(84, -0.08, 0.07, -0.06),
  shakeFrame(93, 0.03, -0.03, 0.02),
].join('\n  ');

const CSS = `
@keyframes wailers-fx-shake {
  0% { transform: translate3d(0, 0, 0) rotate(0deg); }
  ${SHAKE_FRAMES}
  100% { transform: translate3d(0, 0, 0) rotate(0deg); }
}
.wailers-fx-shake {
  animation: wailers-fx-shake var(--wfx-dur, 500ms) linear both;
  will-change: transform;
}

@keyframes wfx-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes wfx-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes wfx-bar-top { from { transform: translateY(-100%); } to { transform: translateY(0); } }
@keyframes wfx-bar-bottom { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes wfx-flash {
  0% { opacity: 0; }
  14% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes wfx-portrait-in {
  0% { opacity: 0; transform: scale(1.9); filter: blur(14px) brightness(2.4) saturate(0.6); }
  55% { opacity: 1; transform: scale(0.97); filter: blur(0) brightness(1.35) saturate(1.1); }
  100% { opacity: 1; transform: scale(1); filter: blur(0) brightness(1) saturate(1); }
}
@keyframes wfx-push { from { transform: scale(1); } to { transform: scale(1.07); } }
@keyframes wfx-glow {
  0%, 100% { box-shadow: 0 0 0 3px rgba(233, 192, 99, 0.85), 0 0 38px 8px rgba(196, 61, 51, 0.6), 0 0 110px 28px rgba(233, 192, 99, 0.22); }
  50% { box-shadow: 0 0 0 3px rgba(252, 241, 210, 0.95), 0 0 64px 16px rgba(224, 98, 90, 0.85), 0 0 160px 48px rgba(233, 192, 99, 0.34); }
}
@keyframes wfx-name-in {
  0% { opacity: 0; letter-spacing: 0.65em; filter: blur(12px); transform: scale(1.12); }
  100% { opacity: 1; letter-spacing: 0.05em; filter: blur(0); transform: scale(1); }
}
@keyframes wfx-rise-in {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes wfx-line-in { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
@keyframes wfx-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes wfx-heat {
  0% { background-position: 50% 0%; }
  100% { background-position: 50% 100%; }
}
@keyframes wfx-pulse-soft {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
`;

export function ensureFxStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
