import { useCallback, useEffect, useRef, useState } from 'react';
import { Dices, Disc3, RotateCw } from 'lucide-react';
import { newId, pickWeighted, rollFormula, type Roller, type RollResult } from '@wailers/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useCurrentUser } from '../../stores/auth';
import { useSettingsStore } from '../../stores/settings';
import { RollStage } from '../dice/RollStage';
import { errorMessage } from '../dice/diceUtils';

export interface RollerPreviewModalProps {
  /** Roller to try (null = closed). */
  roller: Roller | null;
  onClose: () => void;
}

/** Builds a local, never-sent roll for a roller. Throws (Spanish message) when the roller is not rollable. */
function localRoll(roller: Roller, user: { id: string; name: string } | null): RollResult {
  const base = {
    id: newId('prueba'),
    sessionId: '',
    at: new Date().toISOString(),
    rollerUserId: user?.id ?? '',
    rollerName: user?.name ?? 'Tú',
    byDm: false,
    label: roller.name,
    mode: 'normal' as const,
    rollerId: roller.id,
    visibility: 'secret' as const,
    targetUserId: null,
    requestId: null,
  };
  if (roller.kind === 'roulette') {
    const segment = pickWeighted(roller.segments, Math.random);
    return { ...base, kind: 'roulette', formula: null, dice: [], modifier: 0, total: null, segments: roller.segments, segment, faces: null, face: null, crit: null };
  }
  if (roller.faces && roller.faces.length > 0) {
    const face = roller.faces[Math.floor(Math.random() * roller.faces.length)] ?? roller.faces[0]!;
    return { ...base, kind: 'custom_die', formula: null, dice: [], modifier: 0, total: null, segments: null, segment: null, faces: roller.faces, face, crit: null };
  }
  const outcome = rollFormula(roller.formula ?? '', 'normal', Math.random);
  return {
    ...base,
    kind: 'dice',
    formula: outcome.formula,
    dice: outcome.dice,
    modifier: outcome.modifier,
    total: outcome.total,
    segments: null,
    segment: null,
    faces: null,
    face: null,
    crit: outcome.crit,
  };
}

/** "Probar": local preview spin/roll of a roller. Nothing is sent to any session. */
export function RollerPreviewModal({ roller, onClose }: RollerPreviewModalProps) {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const user = useCurrentUser();
  const [roll, setRoll] = useState<RollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  const doRoll = useCallback(() => {
    if (!roller) return;
    try {
      setRoll(localRoll(roller, user));
      setError(null);
      setSettled(false);
    } catch (err) {
      setRoll(null);
      setError(errorMessage(err, 'No se puede probar: revisa la configuración'));
      setSettled(true);
    }
  }, [roller, user]);

  const doRollRef = useRef(doRoll);
  doRollRef.current = doRoll;
  const rollerId = roller?.id ?? null;

  // Roll once each time a different roller is opened.
  useEffect(() => {
    if (rollerId) doRollRef.current();
    else {
      setRoll(null);
      setError(null);
    }
  }, [rollerId]);

  return (
    <Modal
      open={!!roller}
      onClose={onClose}
      size="lg"
      icon={roller?.kind === 'roulette' ? <Disc3 /> : <Dices />}
      title={roller ? `Probar «${roller.name}»` : 'Probar'}
      subtitle="Prueba local: solo la ves tú y no se envía a ninguna partida."
      bodyClassName="overflow-x-hidden"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="primary" icon={<RotateCw />} onClick={doRoll} disabled={!settled || !!error}>
            {roller?.kind === 'roulette' ? 'Girar otra vez' : 'Lanzar otra vez'}
          </Button>
        </>
      }
    >
      <div className="relative flex min-h-[20rem] flex-col items-center justify-center py-2">
        {error ? (
          <EmptyState compact icon={<Dices />} title="No se puede probar" description={error} />
        ) : (
          roll && (
            <RollStage
              key={roll.id}
              roll={roll}
              variant="inline"
              reducedMotion={reducedMotion}
              onSettled={() => setSettled(true)}
              hideVisibility
              wheelSize={320}
              badge={
                <Badge tone="outline" size="xs">
                  Prueba local
                </Badge>
              }
            />
          )
        )}
      </div>
    </Modal>
  );
}
