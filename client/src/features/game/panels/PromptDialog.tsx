import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { TextInput } from '../../../components/ui/TextInput';

export interface PromptField {
  key: string;
  label: string;
  type?: 'text' | 'number';
  placeholder?: string;
  initial?: string;
  hint?: string;
  required?: boolean;
  /** Return an error message or null. */
  validate?: (value: string) => string | null;
}

export interface PromptDialogProps {
  open: boolean;
  title: string;
  icon?: ReactNode;
  description?: ReactNode;
  fields: PromptField[];
  confirmLabel?: string;
  onClose: () => void;
  /** Return false (or a rejected promise) to keep the dialog open. */
  onSubmit: (values: Record<string, string>) => boolean | void | Promise<boolean | void>;
}

/** Small form dialog for one-off questions (custom names, exact values…). */
export function PromptDialog({ open, title, icon, description, fields, confirmLabel = 'Aceptar', onClose, onSubmit }: PromptDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = f.initial ?? '';
    setValues(init);
    setErrors({});
    setBusy(false);
    // Reset only when (re)opened: fields may be recreated on every parent render.
  }, [open]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const nextErrors: Record<string, string | null> = {};
    let ok = true;
    for (const f of fields) {
      const v = (values[f.key] ?? '').trim();
      let err: string | null = null;
      if (f.required && !v) err = 'Este campo es obligatorio';
      else if (f.type === 'number' && v && !Number.isFinite(Number(v.replace(',', '.')))) err = 'Debe ser un número';
      else if (f.validate) err = f.validate(v);
      nextErrors[f.key] = err;
      if (err) ok = false;
    }
    setErrors(nextErrors);
    if (!ok) return;
    setBusy(true);
    try {
      const trimmed: Record<string, string> = {};
      for (const f of fields) trimmed[f.key] = (values[f.key] ?? '').trim();
      const res = await onSubmit(trimmed);
      if (res !== false) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={icon}
      size="sm"
      layer="dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        {description && <div className="text-sm text-parchment-300">{description}</div>}
        {fields.map((f, i) => (
          <TextInput
            key={f.key}
            label={f.label}
            placeholder={f.placeholder}
            hint={f.hint}
            error={errors[f.key] ?? undefined}
            inputMode={f.type === 'number' ? 'decimal' : undefined}
            value={values[f.key] ?? ''}
            autoFocus={i === 0}
            data-autofocus={i === 0 ? true : undefined}
            onValueChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
          />
        ))}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
