import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/cinzel/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '../../../index.css';
import type { RollResult } from '@wailers/shared';
import { DicePoolBuilder } from '../DicePoolBuilder';
import { RollStage } from '../RollStage';
import type { DicePool } from '../dicePool';

const params = new URLSearchParams(location.search);
const kase = params.get('case') ?? 'pool';

function fakeRoll(dice: { sides: number; value: number; dropped?: boolean }[], formula: string, modifier: number, crit: RollResult['crit'] = null): RollResult {
  const total = dice.filter((d) => !d.dropped).reduce((s, d) => s + d.value, 0) + modifier;
  return {
    id: `r-${kase}`,
    sessionId: 's',
    at: new Date().toISOString(),
    rollerUserId: 'u',
    rollerName: 'Aria',
    byDm: false,
    kind: 'dice',
    label: 'Ataque con espada',
    formula,
    mode: 'normal',
    dice: dice.map((d) => ({ sides: d.sides, value: d.value, dropped: !!d.dropped })),
    modifier,
    total,
    rollerId: null,
    segments: null,
    segment: null,
    faces: null,
    face: null,
    visibility: 'public',
    targetUserId: null,
    requestId: null,
    crit,
  };
}

function PoolDemo() {
  const [pool, setPool] = useState<DicePool>({ groups: [{ sides: 20, count: 2 }, { sides: 4, count: 1 }], bonus: 3 });
  const [mode, setMode] = useState<'normal' | 'advantage' | 'disadvantage'>('normal');
  const [pool2, setPool2] = useState<DicePool>({ groups: [], bonus: 0 });
  return (
    <div className="flex gap-6 p-4">
      <div className="w-[22rem] rounded-xl border border-ink-600 bg-ink-900 p-3">
        <DicePoolBuilder pool={pool} onChange={setPool} mode={mode} onModeChange={setMode} />
      </div>
      <div className="w-[22rem] rounded-xl border border-ink-600 bg-ink-900 p-3">
        <DicePoolBuilder pool={pool2} onChange={setPool2} mode={mode} onModeChange={setMode} />
        <div className="mt-4" />
        <DicePoolBuilder compact pool={pool} onChange={setPool} mode={mode} onModeChange={setMode} />
      </div>
    </div>
  );
}

function StageDemo() {
  const roll =
    kase === 'crit'
      ? fakeRoll([{ sides: 20, value: 20 }], '1d20+5', 5, 'success')
      : kase === 'many'
        ? fakeRoll(Array.from({ length: 16 }, (_, i) => ({ sides: i % 3 === 0 ? 8 : 6, value: (i % 6) + 1 })), '10d6+6d8', 0)
        : fakeRoll([{ sides: 20, value: 14 }, { sides: 20, value: 7 }, { sides: 4, value: 3 }, { sides: 100, value: 42 }], '2d20+1d4+1d100+3', 3);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <RollStage roll={roll} variant="overlay" reducedMotion={false} hint="Clic o Esc para continuar" />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(kase === 'pool' ? <PoolDemo /> : <StageDemo />);
