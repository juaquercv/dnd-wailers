import { useEffect, useState } from 'react';
import { Dices, Send } from 'lucide-react';
import type { RollMode, RollVisibility } from '@wailers/shared';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { TextInput } from '../../../components/ui/TextInput';
import { toast } from '../../../components/ui/toast';
import { emitAck } from '../../../api/socket';
import { DicePoolBuilder, effectivePoolMode } from '../../dice/DicePoolBuilder';
import { poolFormula, prettyFormula, type DicePool } from '../../dice/dicePool';

export interface RollRequestTarget {
  userId: string;
  name: string;
  heroName: string | null;
}

export interface RollRequestDialogProps {
  open: boolean;
  targets: RollRequestTarget[];
  onClose: () => void;
}

const QUICK_LABELS = ['Percepción', 'Sigilo', 'Salvación', 'Fuerza', 'Destreza', 'Iniciativa'];
const DEFAULT_POOL: DicePool = { groups: [{ sides: 20, count: 1 }], bonus: 0 };

/** DM: ask one or several players to roll the dice picked on the table (the result is only shown, never applied). */
export function RollRequestDialog({ open, targets, onClose }: RollRequestDialogProps) {
  const [label, setLabel] = useState('');
  const [pool, setPool] = useState<DicePool>(DEFAULT_POOL);
  const [mode, setMode] = useState<RollMode>('normal');
  const [visibility, setVisibility] = useState<RollVisibility>('public');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel('');
    setPool(DEFAULT_POOL);
    setMode('normal');
    setVisibility('public');
    setBusy(false);
  }, [open]);

  const formula = poolFormula(pool);

  const submit = async () => {
    if (!formula || targets.length === 0) return;
    setBusy(true);
    const finalLabel = label.trim() || `Tirada de ${prettyFormula(formula)}`;
    let sent = 0;
    for (const t of targets) {
      try {
        await emitAck('roll:request', {
          targetUserId: t.userId,
          label: finalLabel,
          formula,
          mode: effectivePoolMode(pool, mode),
          visibility,
        });
        sent += 1;
      } catch (err) {
        toast.fromError(err, `No se pudo pedir la tirada a ${t.name}`);
      }
    }
    setBusy(false);
    if (sent > 0) {
      toast.success(sent === 1 ? `Tirada pedida a ${targets[0]!.name}` : `Tirada pedida a ${sent} jugadores`);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pedir tirada"
      subtitle={targets.map((t) => t.heroName ?? t.name).join(', ')}
      icon={<Dices />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<Send />}
            loading={busy}
            disabled={!formula || targets.length === 0}
            title={formula ? undefined : 'Pon al menos un dado en la mesa'}
            onClick={() => void submit()}
          >
            Pedir
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextInput label="Motivo" value={label} onValueChange={setLabel} placeholder="Percepción, salvación de Destreza…" maxLength={80} data-autofocus />
        <div className="flex flex-wrap gap-1">
          {QUICK_LABELS.map((q) => (
            <button key={q} type="button" className="chip transition hover:border-gold-600 hover:text-gold-200" onClick={() => setLabel(q)}>
              {q}
            </button>
          ))}
        </div>
        <DicePoolBuilder compact pool={pool} onChange={setPool} mode={mode} onModeChange={setMode} emptyHint="Elige los dados que tendrán que tirar." />
        <Select<RollVisibility>
          label="Quién ve el resultado"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'public', label: 'Todos' },
            { value: 'player', label: 'El jugador y el DM' },
            { value: 'secret', label: 'Solo el DM' },
          ]}
        />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
