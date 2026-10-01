import { useEffect, useState } from 'react';
import { Dices, Send } from 'lucide-react';
import { isValidFormula, supportsAdvantage, type RollMode, type RollVisibility } from '@wailers/shared';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { TextInput } from '../../../components/ui/TextInput';
import { toast } from '../../../components/ui/toast';
import { emitAck } from '../../../api/socket';

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

/** DM: ask one or several players to roll (they get a button; the result is only shown, never applied). */
export function RollRequestDialog({ open, targets, onClose }: RollRequestDialogProps) {
  const [label, setLabel] = useState('');
  const [formula, setFormula] = useState('1d20');
  const [mode, setMode] = useState<RollMode>('normal');
  const [visibility, setVisibility] = useState<RollVisibility>('public');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel('');
    setFormula('1d20');
    setMode('normal');
    setVisibility('public');
    setBusy(false);
  }, [open]);

  const formulaOk = isValidFormula(formula);
  const advantageOk = formulaOk && supportsAdvantage(formula);

  const submit = async () => {
    if (!formulaOk || targets.length === 0) return;
    setBusy(true);
    const finalLabel = label.trim() || `Tirada de ${formula.trim()}`;
    let sent = 0;
    for (const t of targets) {
      try {
        await emitAck('roll:request', {
          targetUserId: t.userId,
          label: finalLabel,
          formula: formula.trim(),
          mode: advantageOk ? mode : 'normal',
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
          <Button variant="primary" icon={<Send />} loading={busy} disabled={!formulaOk || targets.length === 0} onClick={() => void submit()}>
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
        <TextInput label="Motivo" value={label} onValueChange={setLabel} placeholder="Percepción, salvación de Destreza…" data-autofocus />
        <div className="flex flex-wrap gap-1">
          {QUICK_LABELS.map((q) => (
            <button
              key={q}
              type="button"
              className="chip transition hover:border-gold-600 hover:text-gold-200"
              onClick={() => setLabel(q)}
            >
              {q}
            </button>
          ))}
        </div>
        <TextInput
          label="Fórmula"
          value={formula}
          onValueChange={setFormula}
          error={formulaOk ? undefined : 'Fórmula no válida (ej.: 1d20, 2d6+3)'}
          className="font-mono"
        />
        <div className="grid grid-cols-2 gap-2">
          <Select<RollMode>
            label="Modo"
            value={advantageOk ? mode : 'normal'}
            disabled={!advantageOk}
            onChange={setMode}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'advantage', label: 'Con ventaja' },
              { value: 'disadvantage', label: 'Con desventaja' },
            ]}
          />
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
        </div>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
