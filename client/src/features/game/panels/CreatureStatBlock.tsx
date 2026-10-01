import type { ReactNode } from 'react';
import { Footprints, ShieldAlert, ShieldCheck, ShieldX, Star, Swords } from 'lucide-react';
import { abilityModifier, DEFAULT_ABILITIES, formatModifier, type AttributeDef, type TokenStats } from '@wailers/shared';
import { formatCr, formatNumber } from '../../../lib/format';

export interface CreatureStatBlockProps {
  stats: TokenStats;
  attributes: AttributeDef[];
  ac: number | null;
}

function abilityShort(key: string, attributes: AttributeDef[]): string {
  return attributes.find((a) => a.key === key)?.short ?? DEFAULT_ABILITIES.find((a) => a.key === key)?.short ?? key.toUpperCase().slice(0, 3);
}

/** Read-only creature sheet (reference only: nothing here is rolled or applied automatically). */
export function CreatureStatBlock({ stats, attributes, ac }: CreatureStatBlockProps) {
  const order = [...attributes.map((a) => a.key), ...Object.keys(stats.abilities)];
  const keys = order.filter((k, i) => order.indexOf(k) === i && typeof stats.abilities[k] === 'number');

  return (
    <div className="space-y-3 rounded-lg border border-blood-700/40 bg-gradient-to-b from-blood-800/20 to-transparent px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-parchment-200">
        {ac !== null && (
          <span className="inline-flex items-center gap-1" title="Clase de armadura">
            <ShieldCheck className="h-3.5 w-3.5 text-gold-400" />
            CA <strong className="text-parchment-50">{ac}</strong>
          </span>
        )}
        {stats.speed && (
          <span className="inline-flex items-center gap-1" title="Velocidad">
            <Footprints className="h-3.5 w-3.5 text-gold-400" />
            {stats.speed}
          </span>
        )}
        {stats.cr !== null && (
          <span className="inline-flex items-center gap-1" title="Valor de desafío">
            <Swords className="h-3.5 w-3.5 text-blood-400" />
            VD <strong className="text-parchment-50">{formatCr(stats.cr)}</strong>
          </span>
        )}
        {stats.xp > 0 && (
          <span className="inline-flex items-center gap-1" title="Experiencia de referencia">
            <Star className="h-3.5 w-3.5 text-emerald-400" />
            {formatNumber(stats.xp, 0)} PX
          </span>
        )}
      </div>

      {keys.length > 0 && (
        <div className="grid grid-cols-6 gap-1">
          {keys.map((k) => {
            const score = stats.abilities[k]!;
            return (
              <div key={k} className="flex flex-col items-center rounded-md border border-ink-600/80 bg-ink-900/70 py-1" title={`${score}`}>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-gold-400">{abilityShort(k, attributes)}</span>
                <span className="text-sm font-bold text-parchment-50">{formatModifier(abilityModifier(score))}</span>
                <span className="text-[9px] tabular-nums text-parchment-400">{score}</span>
              </div>
            );
          })}
        </div>
      )}

      {stats.attacks.length > 0 && (
        <StatSection title="Ataques">
          <ul className="space-y-1">
            {stats.attacks.map((a) => (
              <li key={a.id} className="rounded-md bg-ink-900/60 px-2 py-1 text-xs">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-parchment-50">{a.name}</span>
                  {a.bonus && <span className="font-mono text-gold-300">{a.bonus}</span>}
                  {a.damage && (
                    <span className="font-mono text-blood-300">
                      {a.damage}
                      {a.damageType ? ` ${a.damageType}` : ''}
                    </span>
                  )}
                  {a.range && <span className="text-parchment-400">· {a.range}</span>}
                </div>
                {a.notes && <p className="mt-0.5 text-[11px] text-parchment-300">{a.notes}</p>}
              </li>
            ))}
          </ul>
        </StatSection>
      )}

      {stats.traits.length > 0 && (
        <StatSection title="Rasgos">
          <ul className="space-y-1">
            {stats.traits.map((t) => (
              <li key={t.id} className="text-xs leading-relaxed text-parchment-300">
                <span className="font-semibold italic text-parchment-50">{t.name}. </span>
                {t.description}
              </li>
            ))}
          </ul>
        </StatSection>
      )}

      <DefenseRow icon={<ShieldAlert className="h-3.5 w-3.5 text-sky-300" />} label="Resistencias" values={stats.resistances} />
      <DefenseRow icon={<ShieldX className="h-3.5 w-3.5 text-blood-300" />} label="Debilidades" values={stats.weaknesses} />
      <DefenseRow icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />} label="Inmunidades" values={stats.immunities} />

      {stats.description && <p className="whitespace-pre-line border-t border-ink-600/60 pt-2 text-xs italic leading-relaxed text-parchment-300">{stats.description}</p>}
    </div>
  );
}

function StatSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blood-300">{title}</div>
      {children}
    </div>
  );
}

function DefenseRow({ icon, label, values }: { icon: ReactNode; label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="mr-1 inline-flex items-center gap-1 font-semibold text-parchment-200">
        {icon}
        {label}:
      </span>
      {values.map((v) => (
        <span key={v} className="chip">
          {v}
        </span>
      ))}
    </div>
  );
}
