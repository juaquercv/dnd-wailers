import clsx from 'clsx';
import { BedDouble, Moon, Tent } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RestRule, RuleSystem } from '@wailers/shared';
import { Slider } from '../../../../components/ui/Slider';
import { TextInput } from '../../../../components/ui/TextInput';
import { Toggle } from '../../../../components/ui/Toggle';
import { SegmentedControl } from '../SegmentedControl';
import { InfoNote, SettingsSection } from '../SettingsSection';
import { resourceName, type RuleSectionProps, type RulesUpdater } from './ruleUtils';

type RestKey = keyof RuleSystem['rest'];

/** Short and long rest presets used by the DM's manual "Descanso" buttons. */
export function RestsSection({ rules, update, id }: RuleSectionProps & { id: string }) {
  return (
    <SettingsSection
      id={id}
      icon={<BedDouble />}
      title="Descansos"
      description="Lo que recuperan los héroes cuando el DM pulsa el botón de descanso. Nunca ocurre de forma automática."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <RestCard restKey="short" icon={<Tent />} title="Descanso corto" rules={rules} update={update} />
        <RestCard restKey="long" icon={<Moon />} title="Descanso largo" rules={rules} update={update} />
      </div>
      <InfoNote>
        Un descanso largo también reinicia los usos que se recuperan con descanso corto. El DM puede aplicar el descanso a todo el grupo o
        a un héroe concreto, y después ajustar cualquier valor a mano.
      </InfoNote>
    </SettingsSection>
  );
}

function RestCard({
  restKey,
  icon,
  title,
  rules,
  update,
}: {
  restKey: RestKey;
  icon: ReactNode;
  title: string;
  rules: RuleSystem;
  update: RulesUpdater;
}) {
  const rest = rules.rest[restKey];
  const mode = rules.magic.mode;
  const name = resourceName(rules);
  const set = (patch: Partial<RestRule>) =>
    update((d) => {
      d.rest[restKey] = { ...d.rest[restKey], ...patch };
    });

  return (
    <div
      className={clsx(
        'rounded-xl border p-4 transition',
        rest.enabled ? 'border-ink-500 bg-ink-800/50' : 'border-ink-700 bg-ink-950/40',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border [&>svg]:h-[18px] [&>svg]:w-[18px]',
            rest.enabled ? 'border-gold-700/50 bg-gold-500/10 text-gold-300' : 'border-ink-600 text-parchment-400',
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-semibold text-parchment-50">{title}</div>
          <div className="text-[11px] text-parchment-400">{rest.enabled ? 'Disponible en la partida' : 'Desactivado'}</div>
        </div>
        <Toggle checked={rest.enabled} onChange={(v) => set({ enabled: v })} title={rest.enabled ? 'Desactivar' : 'Activar'} />
      </div>

      <fieldset disabled={!rest.enabled} className={clsx('mt-4 space-y-4', !rest.enabled && 'opacity-50')}>
        <TextInput
          size="sm"
          label="Nombre del botón"
          value={rest.label}
          maxLength={32}
          placeholder={title}
          onValueChange={(v) => set({ label: v })}
        />
        <Slider
          label="Puntos de vida recuperados"
          min={0}
          max={100}
          step={5}
          value={rest.restoreHpPct}
          formatValue={(v) => `${v} %`}
          onChange={(v) => set({ restoreHpPct: v })}
        />
        <div className={clsx(mode !== 'mana' && 'opacity-60')}>
          <span className="label">Recuperar {name}</span>
          <SegmentedControl<RestRule['restoreMana']>
            size="sm"
            fill
            aria-label={`Recuperar ${name}`}
            value={rest.restoreMana}
            onChange={(v) => set({ restoreMana: v })}
            options={[
              { value: 'none', label: 'Nada' },
              { value: 'half', label: 'La mitad' },
              { value: 'full', label: 'Todo' },
            ]}
          />
          {mode !== 'mana' && <p className="mt-1 text-[11px] text-parchment-400">Solo se usa con el sistema de puntos de recurso.</p>}
        </div>
        <div className={clsx(mode !== 'slots' && 'opacity-60')}>
          <Toggle
            size="sm"
            checked={rest.restoreSlots}
            onChange={(v) => set({ restoreSlots: v })}
            label="Restaurar espacios de conjuro"
            description={mode === 'slots' ? 'Devuelve todos los espacios gastados.' : 'Solo se usa con espacios de conjuro.'}
          />
        </div>
        <Toggle
          size="sm"
          checked={rest.resetUses}
          onChange={(v) => set({ resetUses: v })}
          label="Reiniciar usos limitados"
          description={restKey === 'short' ? 'Los que se recuperan con descanso corto.' : 'Los de descanso corto y largo.'}
        />
      </fieldset>
    </div>
  );
}
