/** Placeholder — replaced by the audio-fx agent (Web Audio synthesized UI sounds). Silent until then. */
export interface UiSounds {
  diceShake(): void;
  diceLand(): void;
  tick(): void;
  critSuccess(): void;
  critFail(): void;
  ping(): void;
  notify(): void;
  whoosh(): void;
  turnStart(): void;
  reveal(): void;
}

const silent = (): void => undefined;

export const uiSounds: UiSounds = {
  diceShake: silent,
  diceLand: silent,
  tick: silent,
  critSuccess: silent,
  critFail: silent,
  ping: silent,
  notify: silent,
  whoosh: silent,
  turnStart: silent,
  reveal: silent,
};
