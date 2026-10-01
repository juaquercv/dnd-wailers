import { Avatar } from '../../../components/ui/Avatar';
import { ImageUpload } from '../../../components/ui/ImageUpload';
import { TagInput } from '../../../components/ui/TagInput';
import { TextArea } from '../../../components/ui/TextArea';
import { TextInput } from '../../../components/ui/TextInput';
import type { CreatorState } from './state';
import { IssueList, StepIntro } from './ui';

export interface IdentityStepProps {
  state: CreatorState;
  onChange: (patch: Partial<CreatorState>) => void;
  ownerName: string | null;
  ownerColor: string | null;
  issues: string[];
}

export function IdentityStep({ state, onChange, ownerName, ownerColor, issues }: IdentityStepProps) {
  const nameError = issues.find((m) => m.toLowerCase().includes('nombre'));
  return (
    <div>
      <StepIntro title="¿Quién es tu héroe?">Dale un nombre, un rostro y una historia. Todo se puede cambiar más adelante en su ficha.</StepIntro>
      <IssueList messages={issues.filter((m) => m !== nameError)} />
      <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <ImageUpload
            label="Retrato"
            value={state.imageUrl}
            onChange={(imageUrl) => onChange({ imageUrl })}
            aspect="square"
            hint="Se usa en su ficha y en el mapa."
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <TextInput
            label="Nombre"
            required
            data-autofocus
            value={state.name}
            maxLength={120}
            error={nameError}
            placeholder="Lyra de Vientoalto"
            onValueChange={(name) => onChange({ name })}
          />
          <TextArea
            label="Trasfondo"
            autoResize
            rows={4}
            maxRows={12}
            value={state.description}
            placeholder="Origen, aspecto, personalidad, motivaciones, secretos…"
            onValueChange={(description) => onChange({ description })}
          />
          <TagInput
            label="Etiquetas"
            kind="hero"
            value={state.tags}
            onChange={(tags) => onChange({ tags })}
            hint="Opcional: palabras clave para encontrarlo en la biblioteca."
          />
          {ownerName && (
            <div className="flex items-center gap-2 rounded-lg border border-ink-600/60 bg-ink-950/40 px-3 py-2 text-sm text-parchment-200">
              <Avatar name={ownerName} color={ownerColor} size="sm" />
              <span>
                Héroe de <span className="font-semibold text-parchment-50">{ownerName}</span>
              </span>
              <span className="ml-auto text-[11px] text-parchment-400">Solo su jugador podrá modificarlo</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
