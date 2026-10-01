import { useEffect, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  Backpack,
  BookOpen,
  Brain,
  CalendarClock,
  Castle,
  Coins,
  Eye,
  Gem,
  Heart,
  Info,
  Layers,
  Link2,
  NotebookPen,
  Package,
  Repeat,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  User,
  Volume2,
  Wind,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_ABILITIES,
  ENTRY_KIND_LABELS,
  LIGHTING_INFO,
  RARITY_INFO,
  SIZE_INFO,
  SOUND_TYPE_LABELS,
  SPELL_ANIMATION_LABELS,
  STATUSES,
  WEATHER_LABELS,
  ZONE_TYPE_LABELS,
  abilityModifier,
  formatModifier,
  inventoryLoad,
  type AbilityScores,
  type CategoryDTO,
  type HeroEntry,
  type CreatureEntry,
  type ItemEntry,
  type LibraryEntry,
  type RuleSystem,
  type SoundEntry,
  type SpellAnimation,
  type SpellEntry,
  type ZoneTemplateEntry,
} from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { RarityBadge, withAlpha } from '../../components/ui/Badge';
import { formatCr, formatDate, formatDuration, formatGold, formatNumber, formatRelative, formatWeight } from '../../lib/format';
import { useCategoriesStore } from '../../stores/categories';
import { useSessionStore } from '../../stores/session';
import { useUser } from '../../stores/users';
import { CategoryChips, EntryThumb, SectionTitle, TagList } from './common';
import { KIND_ACCENT, KindIcon, SPELL_ANIMATION_COLORS, asAny, entryImage, entryRarityColor, spellLevelLabel } from './meta';
import { SoundPlayer } from './SoundPlayer';

export interface EntryDetailsProps {
  entry: LibraryEntry;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Prop({ label, children, icon, className }: { label: string; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={clsx('min-w-0 rounded-lg border border-ink-600/60 bg-ink-950/40 px-2.5 py-1.5', className)}>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-parchment-400">
        {icon && <span className="text-parchment-400 [&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm text-parchment-50">{children}</div>
    </div>
  );
}

function TextBox({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'dm' }) {
  return (
    <div
      className={clsx(
        'whitespace-pre-line rounded-lg border px-3 py-2 text-sm leading-relaxed',
        tone === 'dm' ? 'border-gold-700/40 bg-gold-500/[0.06] text-parchment-200' : 'border-ink-600/60 bg-ink-950/40 text-parchment-200',
      )}
    >
      {children}
    </div>
  );
}

function Flag({ children, color, icon }: { children: ReactNode; color: string; icon?: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ color, borderColor: withAlpha(color, 0.45), backgroundColor: withAlpha(color, 0.12) }}
    >
      {icon && <span className="[&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      {children}
    </span>
  );
}

function StatRule({ color = '#c43d33' }: { color?: string }) {
  return <div className="my-2 h-[3px] rounded-full" style={{ background: `linear-gradient(90deg, ${color}, ${withAlpha(color, 0.35)} 60%, transparent)` }} aria-hidden />;
}

function abilityLabel(key: string, rules: RuleSystem | null): { short: string; label: string } {
  const fromRules = rules?.attributes.find((a) => a.key === key);
  if (fromRules) return { short: fromRules.short, label: fromRules.label };
  const def = DEFAULT_ABILITIES.find((a) => a.key === key);
  if (def) return { short: def.short, label: def.label };
  return { short: key.slice(0, 3).toUpperCase(), label: key };
}

/** Ability scores with modifiers (stat block style). */
export function AbilityGrid({ abilities, rules = null, compact = false }: { abilities: AbilityScores; rules?: RuleSystem | null; compact?: boolean }) {
  const order: string[] = DEFAULT_ABILITIES.map((a) => a.key);
  const enabled = rules ? new Set(rules.attributes.filter((a) => a.enabled).map((a) => a.key)) : null;
  const keys = [
    ...order.filter((k) => typeof abilities[k] === 'number'),
    ...Object.keys(abilities).filter((k) => !order.includes(k) && typeof abilities[k] === 'number'),
  ].filter((k) => !enabled || enabled.has(k));
  if (keys.length === 0) return null;
  return (
    <div className={clsx('grid gap-1.5', keys.length <= 6 ? 'grid-cols-3 sm:grid-cols-6' : 'grid-cols-4 sm:grid-cols-7')}>
      {keys.map((k) => {
        const score = abilities[k] ?? 10;
        const { short, label } = abilityLabel(k, rules);
        return (
          <div
            key={k}
            title={label}
            className="flex flex-col items-center rounded-lg border border-ink-600/70 bg-gradient-to-b from-ink-800 to-ink-900 py-1.5 shadow-[inset_0_1px_0_rgba(243,234,214,0.05)]"
          >
            <span className="text-[10px] font-bold tracking-wider text-gold-400">{short}</span>
            <span className={clsx('font-display font-bold leading-none text-parchment-50', compact ? 'text-base' : 'text-lg')}>{score}</span>
            <span className="text-[11px] font-semibold tabular-nums text-parchment-300">{formatModifier(abilityModifier(score))}</span>
          </div>
        );
      })}
    </div>
  );
}

function SpellOrb({ animation, size = 56 }: { animation: SpellAnimation; size?: number }) {
  const color = SPELL_ANIMATION_COLORS[animation] ?? '#a98bff';
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <span
        className="absolute inset-0 animate-glow-pulse rounded-full"
        style={{ background: `radial-gradient(circle at 40% 35%, #ffffff, ${color} 35%, ${withAlpha(color, 0.25)} 70%, transparent 72%)` }}
      />
      <span className="absolute inset-[-6px] animate-spin-slow rounded-full border border-dashed" style={{ borderColor: withAlpha(color, 0.55) }} />
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute h-1.5 w-1.5 animate-float rounded-full"
          style={{
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}`,
            left: `${18 + i * 30}%`,
            top: `${i % 2 === 0 ? 4 : 78}%`,
            animationDelay: `${i * 0.6}s`,
          }}
        />
      ))}
    </span>
  );
}

function useSessionRules(): RuleSystem | null {
  return useSessionStore((s) => s.campaign?.rules ?? null);
}

function specificCategoryNames(ids: string[], byId: Record<string, CategoryDTO>, max: number): string[] {
  const parents = new Set<string>();
  for (const id of ids) {
    const guard = new Set<string>();
    let cur = byId[id]?.parentId ?? null;
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      parents.add(cur);
      cur = byId[cur]?.parentId ?? null;
    }
  }
  return ids
    .filter((id) => byId[id] && !parents.has(id) && byId[id]?.parentId)
    .map((id) => byId[id]?.name ?? '')
    .filter(Boolean)
    .slice(0, max);
}

function subtitleFor(entry: LibraryEntry, byId: Record<string, CategoryDTO>): string {
  const e = asAny(entry);
  const cats = specificCategoryNames(entry.categoryIds, byId, 2);
  switch (e.kind) {
    case 'creature':
      return [e.size ? SIZE_INFO[e.size]?.label : null, ...cats, e.data?.isNpc ? 'NPC' : null].filter(Boolean).join(' · ');
    case 'item':
      return [...cats, e.rarity ? RARITY_INFO[e.rarity]?.label : null, e.data?.attunement ? 'requiere sintonización' : null]
        .filter(Boolean)
        .join(' · ');
    case 'spell': {
      const school = e.data?.school?.trim();
      if ((e.level ?? 0) <= 0) return school ? `Truco de ${school.toLowerCase()}` : 'Truco';
      return school ? `${school} de nivel ${e.level}` : `Hechizo de nivel ${e.level}`;
    }
    case 'zone':
      return [e.data?.content?.zoneType ? ZONE_TYPE_LABELS[e.data.content.zoneType] : null, e.data?.content?.biome || null].filter(Boolean).join(' · ');
    case 'sound':
      return e.data?.soundType ? SOUND_TYPE_LABELS[e.data.soundType] : '';
    case 'hero':
      return [...specificCategoryNames(entry.categoryIds, byId, 3), e.level !== null ? `Nivel ${e.level}` : null].filter(Boolean).join(' · ');
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function DetailsHeader({ entry, compact }: { entry: LibraryEntry; compact: boolean }) {
  const image = entry.kind === 'zone' ? null : entryImage(entry);
  const rarity = entryRarityColor(entry);
  const accent = rarity ?? KIND_ACCENT[entry.kind];
  const byId = useCategoriesStore((s) => s.byId);
  const subtitle = subtitleFor(entry, byId);
  const isHero = entry.kind === 'hero';

  const titleBlock = (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>
        <KindIcon kind={entry.kind} className="h-3 w-3" />
        {ENTRY_KIND_LABELS[entry.kind].singular}
      </div>
      <h2 className={clsx('title-epic leading-tight', compact ? 'text-lg' : 'text-2xl')}>{entry.name}</h2>
      {subtitle && <p className="mt-0.5 text-xs italic text-parchment-300">{subtitle}</p>}
    </div>
  );

  return (
    <header className="flex flex-col gap-3">
      {!compact && image && !isHero ? (
        <div
          className="relative overflow-hidden rounded-xl border bg-ink-950"
          style={{ borderColor: withAlpha(accent, 0.5), boxShadow: `0 0 30px -12px ${accent}` }}
        >
          <img src={image} alt="" className="max-h-72 w-full object-cover" draggable={false} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4">{titleBlock}</div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {(isHero || compact || image) && (
            <EntryThumb
              entry={entry}
              size={compact ? 48 : isHero ? 84 : 64}
              round={isHero}
              className={clsx(isHero && 'ring-2 ring-gold-600/60 ring-offset-2 ring-offset-ink-900')}
            />
          )}
          {titleBlock}
        </div>
      )}
      {entry.description && (
        <p className={clsx('whitespace-pre-line text-sm leading-relaxed text-parchment-200', compact && 'line-clamp-3 text-xs')}>{entry.description}</p>
      )}
      {(entry.categoryIds.length > 0 || entry.tags.length > 0) && (
        <div className="flex flex-col gap-1.5">
          <CategoryChips ids={entry.categoryIds} max={compact ? 4 : 12} />
          <TagList tags={entry.tags} max={compact ? 4 : 20} />
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Creature
// ---------------------------------------------------------------------------

function CreatureBlock({ entry, compact }: { entry: CreatureEntry; compact: boolean }) {
  const d = entry.data;
  const attacks = d.attacks ?? [];
  const traits = d.traits ?? [];
  const loot = d.suggestedLoot ?? [];
  const lists: { label: string; values: string[] }[] = [
    { label: 'Resistencias', values: d.resistances ?? [] },
    { label: 'Debilidades', values: d.weaknesses ?? [] },
    { label: 'Inmunidades', values: d.immunities ?? [] },
  ].filter((l) => l.values.length > 0);
  return (
    <section
      className="rounded-xl border border-blood-700/40 bg-gradient-to-b from-[#1f1512] to-ink-900 p-3.5 shadow-[inset_0_1px_0_rgba(243,234,214,0.05)]"
      aria-label="Bloque de estadísticas"
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-blood-300">Clase de armadura</div>
          <div className="flex items-center justify-center gap-1 font-display text-xl font-bold text-parchment-50">
            <Shield className="h-4 w-4 text-[#9fb3c8]" />
            {d.ac ?? '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-blood-300">Puntos de vida</div>
          <div className="flex items-center justify-center gap-1 font-display text-xl font-bold text-parchment-50">
            <Heart className="h-4 w-4 text-blood-400" />
            {entry.hp !== null ? formatNumber(entry.hp, 0) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-blood-300">Velocidad</div>
          <div className="truncate pt-0.5 font-display text-base font-bold text-parchment-50" title={d.speed}>
            {d.speed || '—'}
          </div>
        </div>
      </div>
      <StatRule />
      <AbilityGrid abilities={d.abilities ?? {}} compact={compact} />
      <StatRule />
      <dl className="grid gap-1 text-sm">
        <div className="flex flex-wrap gap-x-1.5">
          <dt className="font-semibold text-blood-300">Desafío</dt>
          <dd className="text-parchment-100">
            {entry.cr !== null ? formatCr(entry.cr) : '—'}
            {d.xp > 0 && <span className="text-parchment-400"> ({formatNumber(d.xp, 0)} PX)</span>}
          </dd>
        </div>
        {lists.map((l) => (
          <div key={l.label} className="flex flex-wrap gap-x-1.5">
            <dt className="font-semibold text-blood-300">{l.label}</dt>
            <dd className="text-parchment-100">{l.values.join(', ')}</dd>
          </div>
        ))}
        {!compact && (
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="font-semibold text-blood-300">Ficha</dt>
            <dd className="text-parchment-100">
              {d.tokenCells ? `${formatNumber(d.tokenCells, 1)} casillas` : `${formatNumber(SIZE_INFO[entry.size ?? 'medium']?.cells ?? 1, 1)} casillas (según tamaño)`}
            </dd>
          </div>
        )}
      </dl>
      {traits.length > 0 && (
        <>
          <StatRule />
          <div className="flex flex-col gap-1.5">
            {traits.map((t) => (
              <p key={t.id} className="text-sm leading-relaxed text-parchment-200">
                <span className="font-semibold italic text-parchment-50">{t.name}.</span> {t.description}
              </p>
            ))}
          </div>
        </>
      )}
      {attacks.length > 0 && (
        <>
          <div className="mt-3 border-b border-blood-600/50 pb-1 font-display text-sm font-semibold uppercase tracking-[0.14em] text-blood-300">
            Acciones
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {attacks.map((a) => (
              <div key={a.id} className="rounded-lg border border-ink-600/50 bg-ink-950/40 px-2.5 py-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Swords className="h-3.5 w-3.5 shrink-0 text-blood-400" />
                  <span className="font-semibold italic text-parchment-50">{a.name}</span>
                  {a.bonus && <span className="rounded bg-ink-700 px-1.5 text-xs font-bold tabular-nums text-gold-300">{a.bonus}</span>}
                  {a.damage && (
                    <span className="text-xs text-parchment-200">
                      <span className="font-semibold tabular-nums text-blood-300">{a.damage}</span>
                      {a.damageType && <span> {a.damageType.toLowerCase()}</span>}
                    </span>
                  )}
                  {a.range && <span className="text-xs text-parchment-400">· {a.range}</span>}
                </div>
                {a.notes && <p className="mt-0.5 text-xs leading-snug text-parchment-300">{a.notes}</p>}
              </div>
            ))}
          </div>
        </>
      )}
      {loot.length > 0 && (
        <>
          <div className="mt-3 flex items-baseline gap-2 border-b border-gold-700/50 pb-1">
            <span className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-gold-300">Botín sugerido</span>
            <span className="text-[11px] italic text-parchment-400">(referencia, no se reparte automáticamente)</span>
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {loot.map((l) => (
              <li key={l.id} className="flex items-baseline gap-2 text-sm text-parchment-200">
                <Gem className="h-3 w-3 shrink-0 translate-y-0.5 text-gold-400" />
                <span className="font-semibold tabular-nums text-gold-200">{l.quantity}×</span>
                <span className="text-parchment-50">{l.name}</span>
                {l.notes && <span className="text-xs text-parchment-400">— {l.notes}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {!compact && d.notes && (
        <div className="mt-3">
          <SectionTitle icon={<NotebookPen />}>Notas del DM</SectionTitle>
          <div className="mt-2">
            <TextBox tone="dm">{d.notes}</TextBox>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

function ItemBlock({ entry, compact }: { entry: ItemEntry; compact: boolean }) {
  const d = entry.data;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <RarityBadge rarity={entry.rarity} size="md" showEmpty />
        {d.magic && (
          <Flag color="#a98bff" icon={<Sparkles />}>
            Mágico
          </Flag>
        )}
        {d.attunement && (
          <Flag color="#c7b4ff" icon={<Link2 />}>
            Requiere sintonización
          </Flag>
        )}
        {d.stackable && (
          <Flag color="#9fb3c8" icon={<Layers />}>
            Apilable
          </Flag>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Prop label="Valor" icon={<Coins />}>
          <span className="text-gold-200">{entry.value !== null ? formatGold(entry.value) : '—'}</span>
        </Prop>
        <Prop label="Peso">{entry.weight !== null ? formatWeight(entry.weight) : '—'}</Prop>
        <Prop label="Espacios" icon={<Backpack />}>
          {d.slots ?? 1}
        </Prop>
        {d.damage && (
          <Prop label="Daño" icon={<Swords />}>
            <span className="text-blood-300">{d.damage}</span>
          </Prop>
        )}
        {d.armorClass !== null && d.armorClass !== undefined && (
          <Prop label="Clase de armadura" icon={<Shield />}>
            {d.armorClass}
          </Prop>
        )}
        {d.charges !== null && d.charges !== undefined && (
          <Prop label="Cargas" icon={<Zap />}>
            {d.charges}
          </Prop>
        )}
      </div>
      {d.effects && (
        <div>
          {!compact && <SectionTitle icon={<ScrollText />}>Efectos</SectionTitle>}
          <div className={compact ? '' : 'mt-2'}>
            <TextBox>{d.effects}</TextBox>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Spell
// ---------------------------------------------------------------------------

function SpellBlock({ entry, compact }: { entry: SpellEntry; compact: boolean }) {
  const d = entry.data;
  const rules = useSessionRules();
  const mode = rules?.magic.mode ?? null;
  const animation = d.animation ?? 'arcane';
  const color = SPELL_ANIMATION_COLORS[animation];
  const showMana = mode === null || mode === 'mana';
  const showSlot = mode === null || mode === 'slots';
  const resourceName = mode === 'mana' && rules ? rules.magic.manaName : 'recurso';
  return (
    <section className="flex flex-col gap-3">
      <div
        className="flex items-center gap-4 rounded-xl border p-3"
        style={{ borderColor: withAlpha(color, 0.35), background: `radial-gradient(ellipse at 10% 50%, ${withAlpha(color, 0.16)}, transparent 70%)` }}
      >
        <SpellOrb animation={animation} size={compact ? 40 : 56} />
        <div className="min-w-0">
          <div className="font-display text-base font-semibold text-parchment-50">{spellLevelLabel(entry.level)}</div>
          <div className="text-xs text-parchment-300">
            Animación: <span style={{ color }}>{SPELL_ANIMATION_LABELS[animation]}</span>
          </div>
          {d.concentration && (
            <div className="mt-1">
              <Flag color="#8ab4ff" icon={<Brain />}>
                Concentración
              </Flag>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Prop label="Lanzamiento">{d.castingTime || '—'}</Prop>
        <Prop label="Alcance">{d.range || '—'}</Prop>
        <Prop label="Componentes">{d.components || '—'}</Prop>
        <Prop label="Duración">{d.duration || '—'}</Prop>
        {showMana && (
          <Prop label={`Coste de ${resourceName}`} icon={<Sparkles />}>
            <span className="text-arcane-300">{d.manaCost ?? 0}</span>
          </Prop>
        )}
        {showSlot && (
          <Prop label="Espacio de conjuro" icon={<Layers />}>
            {(d.slotLevel ?? 0) > 0 ? `Nivel ${d.slotLevel}` : 'No gasta espacio'}
          </Prop>
        )}
        {d.damage && (
          <Prop label="Daño / curación" icon={<Swords />} className="col-span-2">
            <span className="text-blood-300">{d.damage}</span>
            {d.damageType && <span className="text-parchment-300"> · {d.damageType}</span>}
          </Prop>
        )}
      </div>
      {(d.classes?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-parchment-400">Clases</span>
          {d.classes.map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
        </div>
      )}
      {d.effect && (
        <div>
          {!compact && <SectionTitle icon={<BookOpen />}>Efecto</SectionTitle>}
          <div className={compact ? '' : 'mt-2'}>
            <TextBox>{d.effect}</TextBox>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

function SoundBlock({ entry, compact }: { entry: SoundEntry; compact: boolean }) {
  const d = entry.data;
  return (
    <section className="flex flex-col gap-3">
      {d.url ? (
        <SoundPlayer key={d.url} url={d.url} soundType={d.soundType} loop={d.loop} volume={d.volume} compact={compact} />
      ) : (
        <TextBox>Este sonido todavía no tiene archivo de audio.</TextBox>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Prop label="Tipo" icon={<Wind />}>
          {SOUND_TYPE_LABELS[d.soundType] ?? d.soundType}
        </Prop>
        <Prop label="Bucle" icon={<Repeat />}>
          {d.loop ? 'Sí' : 'No'}
        </Prop>
        <Prop label="Volumen" icon={<Volume2 />}>
          {Math.round((d.volume ?? 1) * 100)}%
        </Prop>
        <Prop label="Duración">{d.durationSec ? formatDuration(d.durationSec) : '—'}</Prop>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Zone template
// ---------------------------------------------------------------------------

function elevationLabel(elevation: number): string {
  if (elevation === 0) return 'Planta baja';
  if (elevation < 0) return `Sótano ${Math.abs(elevation)}`;
  return `Piso ${elevation}`;
}

function ZoneBlock({ entry, compact }: { entry: ZoneTemplateEntry; compact: boolean }) {
  const content = entry.data?.content;
  const image = entryImage(entry);
  const levels = content?.levels ?? [];
  return (
    <section className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl border border-emerald-500/25 bg-[repeating-conic-gradient(#1c1915_0%_25%,#13110e_0%_50%)] bg-[length:18px_18px]">
        {image ? (
          <img src={image} alt="" className={clsx('w-full object-contain', compact ? 'max-h-36' : 'max-h-72')} draggable={false} />
        ) : (
          <div className="flex aspect-video items-center justify-center text-xs text-parchment-400">Sin imagen de vista previa</div>
        )}
      </div>
      {content && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Prop label="Tipo">{ZONE_TYPE_LABELS[content.zoneType] ?? content.zoneType}</Prop>
          <Prop label="Bioma">{content.biome || '—'}</Prop>
          <Prop label="Clima">{WEATHER_LABELS[content.weather] ?? content.weather}</Prop>
          <Prop label="Iluminación">{LIGHTING_INFO[content.lighting]?.label ?? content.lighting}</Prop>
        </div>
      )}
      <div>
        <SectionTitle icon={<Layers />}>{levels.length === 1 ? '1 nivel' : `${levels.length} niveles`}</SectionTitle>
        <ul className="mt-2 flex flex-col gap-1.5">
          {[...levels]
            .sort((a, b) => b.elevation - a.elevation)
            .map((l) => (
              <li key={l.id} className="flex items-center gap-3 rounded-lg border border-ink-600/60 bg-ink-950/40 px-2.5 py-1.5">
                <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md border border-ink-600" style={{ backgroundColor: l.background?.color ?? '#2b2a24' }}>
                  {l.background?.url && <img src={l.background.url} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-parchment-50">{l.name}</span>
                    {l.id === content?.defaultLevelId && <span className="chip px-1.5 py-0 text-[9px] text-gold-300">Inicial</span>}
                  </div>
                  <div className="text-[11px] text-parchment-400">
                    {elevationLabel(l.elevation)} · {formatNumber(l.background?.width ?? 0, 0)}×{formatNumber(l.background?.height ?? 0, 0)} px · cuadrícula{' '}
                    {l.grid?.type === 'hex' ? 'hexagonal' : 'cuadrada'} de {l.grid?.size ?? 0} px
                  </div>
                  {!compact && (
                    <div className="text-[11px] text-parchment-500">
                      {l.elements?.length ?? 0} elementos · {l.walls?.length ?? 0} paredes · {l.lights?.length ?? 0} luces · {l.fogRegions?.length ?? 0} zonas de niebla
                    </div>
                  )}
                </div>
              </li>
            ))}
        </ul>
      </div>
      {!compact && (
        <p className="flex items-start gap-2 text-xs leading-snug text-parchment-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
          El contenido del mapa (niveles, elementos, paredes y luces) se edita en el editor de campañas. Al crear una zona desde esta plantilla se hace una copia independiente.
        </p>
      )}
      {!compact && content?.notes && (
        <div>
          <SectionTitle icon={<NotebookPen />}>Notas del DM</SectionTitle>
          <div className="mt-2">
            <TextBox tone="dm">{content.notes}</TextBox>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Bar({ value, max, color, label, extra }: { value: number; max: number; color: string; label: ReactNode; extra?: ReactNode }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-semibold text-parchment-200">{label}</span>
        <span className="tabular-nums text-parchment-100">
          {formatNumber(value, 0)} / {formatNumber(max, 0)}
          {extra}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full border border-ink-600 bg-ink-950">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${withAlpha(color, 0.75)}, ${color})` }} />
      </div>
    </div>
  );
}

function HeroBlock({ entry, compact }: { entry: HeroEntry; compact: boolean }) {
  const d = entry.data;
  const rules = useSessionRules();
  const owner = useUser(entry.ownerId);
  const ownerName = owner?.name ?? entry.ownerName;
  const inventory = d.inventory ?? [];
  const spells = d.spells ?? [];
  const slots = d.resources?.slots ?? [];
  const uses = d.resources?.uses ?? [];
  const mana = d.resources?.mana ?? { current: 0, max: 0 };
  const mode = rules?.magic.mode ?? null;
  const showMana = mode === 'mana' || (mode === null && mana.max > 0);
  const showSlots = mode === 'slots' || (mode === null && slots.length > 0);
  const showUses = uses.length > 0;
  const manaLabel = mode === 'mana' && rules ? rules.magic.manaName : 'Recurso mágico';
  const currency = rules?.currency.short ?? 'po';
  const load = inventoryLoad(d);
  const statuses = STATUSES.filter((s) => d.statuses?.includes(s.key));

  return (
    <section className="flex flex-col gap-4">
      {ownerName && (
        <div className="flex items-center gap-2 text-sm text-parchment-200">
          <Avatar name={ownerName} color={owner?.color} size="sm" />
          <span>
            Jugador: <span className="font-semibold text-parchment-50">{ownerName}</span>
          </span>
        </div>
      )}
      <div className="flex flex-col gap-2.5 rounded-xl border border-ink-600/70 bg-ink-950/40 p-3">
        <Bar
          value={d.hp?.current ?? 0}
          max={d.hp?.max ?? 0}
          color="#e0625a"
          label={
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3.5 w-3.5 text-blood-400" /> Puntos de vida
            </span>
          }
          extra={(d.hp?.temp ?? 0) > 0 ? <span className="ml-1 text-sky-300">(+{d.hp.temp} temp.)</span> : null}
        />
        {showMana && (
          <Bar
            value={mana.current}
            max={mana.max}
            color="#8a63f0"
            label={
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-arcane-400" /> {manaLabel}
              </span>
            }
          />
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Prop label="Nivel">{entry.level ?? '—'}</Prop>
          <Prop label="CA" icon={<Shield />}>
            {d.ac}
          </Prop>
          <Prop label="Velocidad">{d.speed || '—'}</Prop>
          <Prop label="Iniciativa">{formatModifier(d.initiativeBonus ?? 0)}</Prop>
          <Prop label="PX">{formatNumber(d.xp ?? 0, 0)}</Prop>
          <Prop label="Oro" icon={<Coins />}>
            <span className="text-gold-200">{formatGold(d.gold ?? 0, true, currency)}</span>
          </Prop>
        </div>
      </div>

      <AbilityGrid abilities={d.abilities ?? {}} rules={rules} compact={compact} />

      {(showSlots || showUses) && (
        <div className="flex flex-col gap-2">
          {!compact && <SectionTitle icon={<Zap />}>Recursos</SectionTitle>}
          {showSlots && slots.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <div key={s.level} className="rounded-lg border border-arcane-600/40 bg-arcane-500/[0.07] px-2 py-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-arcane-300">Nivel {s.level}</div>
                  <div className="mt-0.5 flex gap-1">
                    {Array.from({ length: s.max }, (_, i) => (
                      <span
                        key={i}
                        className={clsx('h-2.5 w-2.5 rotate-45 border', i < s.max - s.used ? 'border-arcane-300 bg-arcane-400' : 'border-ink-500 bg-transparent')}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {showUses && (
            <div className="flex flex-wrap gap-2">
              {uses.map((u) => (
                <span key={u.id} className="chip gap-1.5" title={u.resetOn === 'short' ? 'Se recupera con descanso corto' : 'Se recupera con descanso largo'}>
                  {u.name}
                  <span className="tabular-nums text-gold-300">
                    {u.max - u.used}/{u.max}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {statuses.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <Flag key={s.key} color={s.color}>
              <span>{s.icon}</span> {s.label}
            </Flag>
          ))}
        </div>
      )}

      {compact ? (
        <p className="text-xs text-parchment-400">
          {inventory.length} objetos en el inventario · {spells.length} hechizos
        </p>
      ) : (
        <>
          <div>
            <SectionTitle
              icon={<Backpack />}
              aside={
                <span className="text-[11px] text-parchment-400">
                  {formatWeight(load.weight)} · {load.slots} espacios · {formatGold(load.value, true, currency)}
                </span>
              }
            >
              Inventario
            </SectionTitle>
            {inventory.length === 0 ? (
              <p className="mt-2 text-xs italic text-parchment-500">Inventario vacío.</p>
            ) : (
              <ul className="mt-2 divide-y divide-ink-700/60 overflow-hidden rounded-lg border border-ink-600/60 bg-ink-950/30">
                {inventory.map((it) => (
                  <li key={it.id} className="flex items-center gap-2.5 px-2.5 py-1.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink-600 bg-ink-800">
                      {it.imageUrl ? (
                        <img src={it.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <Package className="h-3.5 w-3.5 text-parchment-400" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: it.rarity ? RARITY_INFO[it.rarity]?.color : '#f3ead6' }}>
                      {it.name}
                    </span>
                    {it.equipped && <span className="chip px-1.5 py-0 text-[9px] text-emerald-300">Equipado</span>}
                    <span className="w-10 text-right text-xs tabular-nums text-parchment-300">×{it.quantity}</span>
                    <span className="hidden w-16 text-right text-xs tabular-nums text-parchment-400 sm:block">{formatWeight(it.weight * it.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <SectionTitle icon={<Sparkles />}>Hechizos</SectionTitle>
            {spells.length === 0 ? (
              <p className="mt-2 text-xs italic text-parchment-500">Sin hechizos.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {[...spells]
                  .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'es'))
                  .map((s) => (
                    <li key={s.id} className="flex items-center gap-2 rounded-md border border-ink-600/50 bg-ink-950/30 px-2.5 py-1">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SPELL_ANIMATION_COLORS[s.animation] ?? '#a98bff' }} />
                      <span className={clsx('min-w-0 flex-1 truncate text-sm', s.prepared ? 'text-parchment-50' : 'text-parchment-400')}>{s.name}</span>
                      <span className="text-[11px] text-parchment-400">{spellLevelLabel(s.level)}</span>
                      {(mode === null || mode === 'mana') && s.manaCost > 0 && (
                        <span className="text-[11px] tabular-nums text-arcane-300" title={`Coste de ${manaLabel.toLowerCase()}`}>
                          {s.manaCost}
                        </span>
                      )}
                      {!s.prepared && <span className="text-[10px] italic text-parchment-500">no preparado</span>}
                    </li>
                  ))}
              </ul>
            )}
          </div>
          {d.visionCells !== null && d.visionCells !== undefined && (
            <p className="flex items-center gap-2 text-xs text-parchment-300">
              <Eye className="h-3.5 w-3.5 text-sky-300" /> Visión de {formatNumber(d.visionCells, 1)} casillas
            </p>
          )}
          {d.notes && (
            <div>
              <SectionTitle icon={<NotebookPen />}>Notas</SectionTitle>
              <div className="mt-2">
                <TextBox>{d.notes}</TextBox>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Meta (origin, usage, dates)
// ---------------------------------------------------------------------------

function MetaBlock({ entry }: { entry: LibraryEntry }) {
  const used = entry.usedInCampaigns ?? [];
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-ink-600/60 bg-ink-950/30 p-3 text-xs text-parchment-300">
      {entry.originCampaignName && (
        <div className="flex items-center gap-2">
          <Castle className="h-3.5 w-3.5 shrink-0 text-arcane-300" />
          <span>
            Creado en <span className="font-semibold text-arcane-200">{entry.originCampaignName}</span>
          </span>
        </div>
      )}
      {used.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-parchment-400">Usado en:</span>
          {used.map((c) => (
            <span key={c.id} className="chip py-0 text-[10px]">
              {c.name}
            </span>
          ))}
        </div>
      )}
      {entry.ownerName && entry.kind !== 'hero' && (
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 shrink-0" /> Autor: {entry.ownerName}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-parchment-400">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" /> Creado el {formatDate(entry.createdAt)}
        </span>
        {entry.updatedAt !== entry.createdAt && <span>Actualizado {formatRelative(entry.updatedAt)}</span>}
        {entry.lastUsedAt && <span>Último uso {formatRelative(entry.lastUsedAt)}</span>}
      </div>
    </section>
  );
}

/** Rich read-only card of a library entry. */
export function EntryDetails({ entry, compact = false }: EntryDetailsProps) {
  const e = asAny(entry);
  useEffect(() => {
    const s = useCategoriesStore.getState();
    if (!s.loaded && !s.loading) void s.load();
  }, []);
  return (
    <div className={clsx('flex min-w-0 flex-col', compact ? 'gap-3' : 'gap-5')}>
      <DetailsHeader entry={entry} compact={compact} />
      {e.kind === 'creature' && <CreatureBlock entry={e} compact={compact} />}
      {e.kind === 'item' && <ItemBlock entry={e} compact={compact} />}
      {e.kind === 'spell' && <SpellBlock entry={e} compact={compact} />}
      {e.kind === 'sound' && <SoundBlock entry={e} compact={compact} />}
      {e.kind === 'zone' && <ZoneBlock entry={e} compact={compact} />}
      {e.kind === 'hero' && <HeroBlock entry={e} compact={compact} />}
      {!compact && <MetaBlock entry={entry} />}
    </div>
  );
}
