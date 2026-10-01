import { useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Dumbbell, Lock, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { IconButton } from '../../../../components/ui/IconButton';
import { Toggle } from '../../../../components/ui/Toggle';
import { InfoNote, SettingsSection, SubHeading } from '../SettingsSection';
import { attributeKeyFrom, isBuiltInAttribute, shortFrom, type RuleSectionProps } from './ruleUtils';

/** Ability scores used by the campaign: toggle, rename, add and remove custom ones. */
export function AttributesSection({ rules, update, id }: RuleSectionProps & { id: string }) {
  const [newLabel, setNewLabel] = useState('');
  const [newShort, setNewShort] = useState('');
  const enabledCount = rules.attributes.filter((a) => a.enabled).length;

  const add = (e: FormEvent) => {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    const short = (newShort.trim() || shortFrom(label)).toUpperCase().slice(0, 4);
    update((d) => {
      const key = attributeKeyFrom(label, d.attributes.map((a) => a.key));
      d.attributes.push({ key, label, short, enabled: true });
    });
    setNewLabel('');
    setNewShort('');
  };

  return (
    <SettingsSection
      id={id}
      icon={<Dumbbell />}
      title="Atributos"
      description="Las puntuaciones que aparecen en las hojas de héroes y enemigos. Los atributos estándar se pueden desactivar o renombrar."
    >
      <div className="overflow-hidden rounded-lg border border-ink-600">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_5.5rem_minmax(0,7rem)_2rem] items-center gap-x-3 border-b border-ink-600 bg-ink-800/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-parchment-300">
          <span>Activo</span>
          <span>Nombre</span>
          <span>Abrev.</span>
          <span>Clave</span>
          <span />
        </div>
        <ul className="divide-y divide-ink-700/70">
          {rules.attributes.map((attr, i) => {
            const builtIn = isBuiltInAttribute(attr);
            return (
              <li
                key={attr.key}
                className={clsx(
                  'grid grid-cols-[auto_minmax(0,1fr)_5.5rem_minmax(0,7rem)_2rem] items-center gap-x-3 px-3 py-1.5 transition',
                  !attr.enabled && 'bg-ink-950/40',
                )}
              >
                <Toggle
                  size="sm"
                  checked={attr.enabled}
                  title={attr.enabled ? 'Desactivar' : 'Activar'}
                  onChange={(v) =>
                    update((d) => {
                      d.attributes[i]!.enabled = v;
                    })
                  }
                />
                <input
                  value={attr.label}
                  aria-label={`Nombre del atributo ${attr.short}`}
                  maxLength={32}
                  onChange={(e) =>
                    update((d) => {
                      d.attributes[i]!.label = e.target.value;
                    })
                  }
                  className={clsx('input input-sm', !attr.label.trim() && 'input-error', !attr.enabled && 'opacity-60')}
                />
                <input
                  value={attr.short}
                  aria-label={`Abreviatura de ${attr.label}`}
                  maxLength={4}
                  onChange={(e) =>
                    update((d) => {
                      d.attributes[i]!.short = e.target.value.toUpperCase();
                    })
                  }
                  className={clsx('input input-sm text-center font-semibold uppercase tracking-wider', !attr.enabled && 'opacity-60')}
                />
                <span className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] text-parchment-400" title="Identificador interno">
                  {builtIn && <Lock className="h-3 w-3 shrink-0" aria-label="Atributo estándar" />}
                  <span className="truncate">{attr.key}</span>
                </span>
                {builtIn ? (
                  <span />
                ) : (
                  <IconButton
                    icon={<Trash2 />}
                    title={`Eliminar ${attr.label || 'atributo'}`}
                    variant="danger"
                    size="xs"
                    onClick={() =>
                      update((d) => {
                        d.attributes = d.attributes.filter((a) => a.key !== attr.key);
                      })
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {enabledCount === 0 && (
        <InfoNote icon={<TriangleAlert />} tone="warning">
          No hay ningún atributo activo: las hojas no mostrarán puntuaciones.
        </InfoNote>
      )}

      <div className="space-y-2">
        <SubHeading>Añadir atributo personalizado</SubHeading>
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <label className="min-w-[10rem] flex-1">
            <span className="label">Nombre</span>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Por ejemplo: Cordura"
              maxLength={32}
              className="input input-sm"
            />
          </label>
          <label className="w-24">
            <span className="label">Abrev.</span>
            <input
              value={newShort}
              onChange={(e) => setNewShort(e.target.value.toUpperCase())}
              placeholder={newLabel.trim() ? shortFrom(newLabel) : 'COR'}
              maxLength={4}
              className="input input-sm text-center uppercase"
            />
          </label>
          <Button type="submit" size="sm" variant="secondary" icon={<Plus />} disabled={!newLabel.trim()}>
            Añadir
          </Button>
        </form>
        {newLabel.trim() && (
          <p className="text-[11px] text-parchment-400">
            Clave interna: <span className="font-mono text-parchment-300">{attributeKeyFrom(newLabel, rules.attributes.map((a) => a.key))}</span>
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
