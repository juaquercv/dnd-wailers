import type { ReactNode } from 'react';
import { Ban, Hourglass, Layers, Sparkles } from 'lucide-react';
import { createRuleSystem, type MagicMode } from '@wailers/shared';
import { Badge, type BadgeProps, type BadgeTone } from '../../components/ui/Badge';
import { RadioCards } from './RadioCards';

export const MAGIC_MODES: readonly MagicMode[] = ['mana', 'slots', 'uses', 'none'];

export interface MagicModeInfo {
  mode: MagicMode;
  /** Label of the mode. For 'mana' prefer the campaign's own resource name (see magicModeLabel). */
  label: string;
  description: string;
  tone: BadgeTone;
  accent: string;
}

/** Default resource name created by createRuleSystem(); campaigns may rename it (rules.magic.manaName). */
const DEFAULT_RESOURCE_NAME = createRuleSystem('mana').magic.manaName;

export const MAGIC_MODE_INFO: Record<MagicMode, MagicModeInfo> = {
  mana: {
    mode: 'mana',
    label: DEFAULT_RESOURCE_NAME,
    description: 'Una reserva de puntos que se gasta al usar poderes y se regenera (a mano o al inicio del turno).',
    tone: 'arcane',
    accent: '#a98bff',
  },
  slots: {
    mode: 'slots',
    label: 'Espacios de conjuro',
    description: 'Espacios por nivel de hechizo según el nivel del personaje, como en D&D 5e. Se recuperan al descansar.',
    tone: 'sky',
    accent: '#38bdf8',
  },
  uses: {
    mode: 'uses',
    label: 'Usos limitados',
    description: 'Cada poder tiene un número de usos que se reinician con un descanso corto o largo.',
    tone: 'emerald',
    accent: '#34d399',
  },
  none: {
    mode: 'none',
    label: 'Sin magia',
    description: 'Campaña sin recursos mágicos: la hoja de personaje no muestra reservas ni espacios.',
    tone: 'neutral',
    accent: '#a8946b',
  },
};

export function magicModeIcon(mode: MagicMode): ReactNode {
  switch (mode) {
    case 'mana':
      return <Sparkles />;
    case 'slots':
      return <Layers />;
    case 'uses':
      return <Hourglass />;
    default:
      return <Ban />;
  }
}

/** Display label of a magic mode; 'mana' shows the campaign's resource name when known. */
export function magicModeLabel(mode: MagicMode, manaName?: string | null): string {
  if (mode === 'mana') {
    const name = manaName?.trim();
    return name || MAGIC_MODE_INFO.mana.label;
  }
  return MAGIC_MODE_INFO[mode].label;
}

function manaDescription(manaName?: string | null): string {
  const name = manaName?.trim();
  if (!name || name === DEFAULT_RESOURCE_NAME) return MAGIC_MODE_INFO.mana.description;
  return `Puntos de ${name} que se gastan al usar poderes y se regeneran (a mano o al inicio del turno).`;
}

export interface MagicModeBadgeProps {
  mode: MagicMode;
  manaName?: string | null;
  size?: BadgeProps['size'];
  className?: string;
}

/** Pill with the icon and label of a campaign magic system. */
export function MagicModeBadge({ mode, manaName, size = 'sm', className }: MagicModeBadgeProps) {
  const info = MAGIC_MODE_INFO[mode];
  const label = magicModeLabel(mode, manaName);
  const title = mode === 'mana' ? `Sistema de magia: puntos de ${label}` : `Sistema de magia: ${label}`;
  return (
    <Badge tone={info.tone} size={size} icon={magicModeIcon(mode)} title={title} className={className}>
      {label}
    </Badge>
  );
}

export interface MagicModePickerProps {
  value: MagicMode;
  onChange: (mode: MagicMode) => void;
  /** Resource name shown on the 'mana' card (defaults to "Maná"). */
  manaName?: string | null;
  columns?: 1 | 2 | 4;
  size?: 'sm' | 'md';
  className?: string;
}

/** Radio cards to choose the magic system of a campaign, each one with an explanation. */
export function MagicModePicker({ value, onChange, manaName, columns = 2, size = 'md', className }: MagicModePickerProps) {
  return (
    <RadioCards<MagicMode>
      aria-label="Sistema de magia"
      value={value}
      onChange={onChange}
      columns={columns}
      size={size}
      className={className}
      options={MAGIC_MODES.map((mode) => ({
        value: mode,
        title: mode === 'mana' ? magicModeLabel('mana', manaName) : MAGIC_MODE_INFO[mode].label,
        description: mode === 'mana' ? manaDescription(manaName) : MAGIC_MODE_INFO[mode].description,
        icon: magicModeIcon(mode),
        accent: MAGIC_MODE_INFO[mode].accent,
      }))}
    />
  );
}
