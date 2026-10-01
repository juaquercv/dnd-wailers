import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Clock, Copy, Crown, Map as MapIcon, PenLine, Trash2 } from 'lucide-react';
import type { CampaignSummary } from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { useContextMenu } from '../../components/ui/ContextMenu';
import { formatDateTime, formatRelative, plural } from '../../lib/format';
import { CampaignArt } from './CampaignArt';
import { MagicModeBadge } from './magicModes';

export interface CampaignCardProps {
  campaign: CampaignSummary;
  /** Resource name for mana campaigns (rules.magic.manaName), when known. */
  manaName?: string | null;
  isOwner: boolean;
  ownerColor: string | null;
  /** Animation stagger index. */
  index: number;
  busy: 'duplicate' | 'delete' | null;
  editorPath: string;
  onDuplicate: () => void;
  onDelete: () => void;
}

const MAX_TAGS = 4;

/** Campaign tile: cover art, magic system, zones, owner, last update and quick actions. */
export function CampaignCard({ campaign, manaName, isOwner, ownerColor, index, busy, editorPath, onDuplicate, onDelete }: CampaignCardProps) {
  const menu = useContextMenu();
  const description = campaign.description.trim();
  const extraTags = campaign.tags.length - MAX_TAGS;

  const openMenu = (e: MouseEvent) => {
    menu.open(e, [
      { heading: true, label: campaign.name },
      { label: 'Duplicar', icon: <Copy className="h-4 w-4" />, onClick: onDuplicate, disabled: busy !== null },
      { separator: true },
      {
        label: 'Eliminar',
        icon: <Trash2 className="h-4 w-4" />,
        onClick: onDelete,
        danger: true,
        disabled: !isOwner || busy !== null,
      },
    ]);
  };

  return (
    <div className="animate-slide-up" style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}>
      <article
        onContextMenu={openMenu}
        className={clsx(
          'group panel flex h-full flex-col overflow-hidden p-0 transition duration-200 ease-out',
          'hover:-translate-y-0.5 hover:border-gold-600/60 hover:shadow-glow-gold',
          busy === 'delete' && 'pointer-events-none opacity-50',
        )}
      >
        <Link
          to={editorPath}
          className="relative block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
          title={`Abrir el editor de «${campaign.name}»`}
        >
          <CampaignArt
            id={campaign.id}
            name={campaign.name}
            coverUrl={campaign.coverUrl}
            magicMode={campaign.magicMode}
            className="aspect-[16/9] w-full"
          />
          <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            {/* Dark backdrop keeps the translucent badge readable on light cover art. */}
            <span className="inline-flex rounded-full bg-ink-950/85 shadow-lg backdrop-blur-sm">
              <MagicModeBadge mode={campaign.magicMode} manaName={manaName} />
            </span>
            <span className="chip border-ink-500/70 bg-ink-950/75 text-parchment-100 shadow-lg backdrop-blur-sm">
              <MapIcon className="h-3 w-3 text-gold-400" />
              {plural(campaign.zoneCount, 'zona', 'zonas')}
            </span>
          </div>
          <div className="absolute inset-x-4 bottom-3">
            <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug text-parchment-50 text-shadow transition group-hover:text-gold-200">
              {campaign.name}
            </h3>
          </div>
        </Link>

        <div className="flex flex-1 flex-col gap-3 px-4 pb-3 pt-3">
          <p className={clsx('line-clamp-3 text-sm leading-relaxed', description ? 'text-parchment-300' : 'italic text-parchment-400/80')}>
            {description || 'Sin descripción todavía.'}
          </p>
          {campaign.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {campaign.tags.slice(0, MAX_TAGS).map((tag) => (
                <span key={tag} className="chip text-[11px] text-parchment-300">
                  #{tag}
                </span>
              ))}
              {extraTags > 0 && <span className="chip text-[11px] text-parchment-400">+{extraTags}</span>}
            </div>
          )}
          <div className="mt-auto flex items-center gap-2.5 pt-1 text-xs text-parchment-400">
            <Avatar name={campaign.ownerName} color={ownerColor} size="xs" />
            <span className="flex min-w-0 items-center gap-1 truncate text-parchment-300">
              {isOwner && <Crown className="h-3 w-3 shrink-0 text-gold-400" aria-label="Tuya" />}
              <span className="truncate">{isOwner ? 'Tú' : campaign.ownerName}</span>
            </span>
            <span aria-hidden className="text-ink-400">·</span>
            <span className="flex shrink-0 items-center gap-1" title={`Actualizada el ${formatDateTime(campaign.updatedAt)}`}>
              <Clock className="h-3 w-3" />
              actualizada {formatRelative(campaign.updatedAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 border-t border-ink-600/70 bg-ink-950/30 px-3 py-2">
          <Link to={editorPath} className="btn btn-primary btn-sm">
            <PenLine className="h-3.5 w-3.5" />
            Abrir editor
          </Link>
          <Button
            variant="ghost"
            size="sm"
            icon={<Copy />}
            loading={busy === 'duplicate'}
            disabled={busy !== null}
            onClick={onDuplicate}
            title="Crear una copia independiente de la campaña"
          >
            Duplicar
          </Button>
          <span className="flex-1" />
          {isOwner && (
            <IconButton
              icon={<Trash2 />}
              title="Eliminar campaña"
              variant="danger"
              size="sm"
              loading={busy === 'delete'}
              disabled={busy !== null}
              onClick={onDelete}
            />
          )}
        </div>
      </article>
    </div>
  );
}

/** Loading placeholder with the card layout. */
export function CampaignCardSkeleton() {
  return (
    <div className="panel overflow-hidden p-0" aria-hidden>
      <div className="skeleton aspect-[16/9] w-full rounded-none" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
        <div className="flex items-center gap-2 pt-2">
          <div className="skeleton h-5 w-5 rounded-full" />
          <div className="skeleton h-3 w-24" />
        </div>
      </div>
      <div className="flex gap-2 border-t border-ink-600/70 px-3 py-2">
        <div className="skeleton h-7 w-28" />
        <div className="skeleton h-7 w-20" />
      </div>
    </div>
  );
}
