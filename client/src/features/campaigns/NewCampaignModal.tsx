import { useEffect, useState, type FormEvent } from 'react';
import { Info, ScrollText, Sparkles } from 'lucide-react';
import type { Campaign, MagicMode } from '@wailers/shared';
import { api } from '../../api/http';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { TextArea } from '../../components/ui/TextArea';
import { TextInput } from '../../components/ui/TextInput';
import { toast } from '../../components/ui/toast';
import { MagicModePicker } from './magicModes';

export interface NewCampaignModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (campaign: Campaign) => void;
}

const NAME_MAX = 80;
const DESCRIPTION_MAX = 1000;

/** "Nueva campaña": name, description and magic system preset. */
export function NewCampaignModal({ open, onClose, onCreated }: NewCampaignModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [magicMode, setMagicMode] = useState<MagicMode>('mana');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setMagicMode('mana');
    setTouched(false);
    setSubmitting(false);
  }, [open]);

  const trimmed = name.trim();
  const nameError = touched && !trimmed ? 'Ponle un nombre a tu campaña' : undefined;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const campaign = await api.campaigns.create({ name: trimmed, description: description.trim(), magicMode });
      toast.success(`Campaña «${campaign.name}» creada`, { description: 'Empieza creando su primera zona.' });
      onCreated(campaign);
    } catch (err) {
      toast.fromError(err, 'No se pudo crear la campaña');
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Nueva campaña"
      subtitle="Dale nombre a tu mundo y elige cómo funciona la magia. Todo se puede cambiar después."
      icon={<ScrollText />}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" epic icon={<Sparkles />} loading={submitting} onClick={() => void submit()}>
            Crear campaña
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-5" noValidate>
        <TextInput
          label="Nombre"
          required
          autoFocus
          value={name}
          maxLength={NAME_MAX}
          placeholder="Por ejemplo: El Ocaso de las Siete Coronas"
          onValueChange={setName}
          onBlur={() => setTouched(true)}
          error={nameError}
          hint={`${trimmed.length}/${NAME_MAX}`}
        />
        <TextArea
          label="Descripción"
          value={description}
          maxLength={DESCRIPTION_MAX}
          rows={3}
          autoResize
          maxRows={8}
          placeholder="Un resumen para tus jugadores: el tono, el conflicto, dónde empieza la aventura…"
          onValueChange={setDescription}
        />
        <Field
          label="Sistema de magia"
          hint={
            <span className="inline-flex items-start gap-1.5">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              Podrás renombrar el recurso y ajustar regeneración, tablas y descansos en la pestaña Reglas del editor.
            </span>
          }
        >
          <MagicModePicker value={magicMode} onChange={setMagicMode} />
        </Field>
        {/* Enables Enter-to-submit from the name field. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
