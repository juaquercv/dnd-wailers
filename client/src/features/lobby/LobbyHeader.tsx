import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Crown, EyeOff, History, Layers, ScrollText } from 'lucide-react';
import type { Campaign } from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { formatDateTime, formatRelative, plural } from '../../lib/format';
import { useSessionStore } from '../../stores/session';
import { MAGIC_MODE_INFO, magicModeLabel, useUserDirectory } from './lobbyUi';

export interface LobbyHeaderProps {
  /** Full campaign (DM only; players only learn the name). */
  campaign: Campaign | null;
  /** Campaign name fallback from the public session summary. */
  campaignNameFallback: string | null;
  hostConnected: boolean | null;
}

/** Epic lobby banner: campaign (hidden details for players), session name and the DM. */
export function LobbyHeader({ campaign, campaignNameFallback, hostConnected }: LobbyHeaderProps) {
  const isDm = useSessionStore((s) => s.view?.role === 'dm');
  const sessionName = useSessionStore((s) => s.view?.state.name ?? '');
  const hostUserId = useSessionStore((s) => s.view?.state.hostUserId ?? '');
  const storeCampaign = useSessionStore((s) => s.campaign);
  const lookup = useUserDirectory();
  const dm = lookup(hostUserId);
  const campaignName = storeCampaign?.name || campaign?.name || campaignNameFallback || 'Campaña misteriosa';
  const rules = campaign?.rules ?? storeCampaign?.rules ?? null;
  const cover = isDm ? campaign?.coverUrl ?? null : null;
  const [coverOk, setCoverOk] = useState(true);
  useEffect(() => setCoverOk(true), [cover]);

  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-gold-700/40 bg-ink-900 shadow-panel">
      {cover && coverOk ? (
        <img
          src={cover}
          alt=""
          aria-hidden
          draggable={false}
          onError={() => setCoverOk(false)}
          className="absolute inset-0 -z-10 h-full w-full scale-105 object-cover opacity-40 blur-[1px]"
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background: isDm
              ? 'radial-gradient(ellipse 60% 120% at 85% 0%, rgba(212,166,63,0.28), transparent 65%), radial-gradient(ellipse 50% 90% at 0% 100%, rgba(138,99,240,0.18), transparent 70%)'
              : 'radial-gradient(ellipse 70% 120% at 80% 10%, rgba(138,99,240,0.22), transparent 65%), radial-gradient(ellipse 60% 100% at 10% 100%, rgba(212,166,63,0.16), transparent 70%)',
          }}
        />
      )}
      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-950/95 via-ink-950/75 to-ink-950/35" />
      <span
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.06] [background-image:repeating-linear-gradient(45deg,#f3ead6_0_1px,transparent_1px_16px)]"
      />
      <span aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/70 to-transparent" />

      <div className="flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-400/90">
            <span className="h-px w-6 bg-gold-500/70" aria-hidden />
            Sala de espera
          </div>
          <h1 className="title-epic mt-2 break-words text-3xl leading-tight sm:text-4xl">{campaignName}</h1>
          {isDm ? (
            <div className="mt-3 space-y-2">
              {campaign?.description && <p className="line-clamp-2 max-w-2xl text-sm leading-relaxed text-parchment-200/90">{campaign.description}</p>}
              <div className="flex flex-wrap items-center gap-1.5">
                {rules && (
                  <Badge tone={MAGIC_MODE_INFO[rules.magic.mode].tone} size="sm" icon={MAGIC_MODE_INFO[rules.magic.mode].icon}>
                    {magicModeLabel(rules.magic.mode, rules.magic.manaName)}
                  </Badge>
                )}
                {campaign && (
                  <Badge size="sm" icon={<Layers />}>
                    {plural(campaign.zoneCount, 'zona', 'zonas')}
                  </Badge>
                )}
                {rules && (
                  <Badge size="sm" icon={<ScrollText />}>
                    Héroes nv. {rules.heroCreation.startingLevel}–{rules.heroCreation.maxLevel}
                    {rules.heroCreation.allowNew ? ' · se pueden crear' : ' · sin creación'}
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-sm italic text-parchment-300">
              <EyeOff className="h-4 w-4 shrink-0 text-arcane-300" aria-hidden />
              La campaña se revelará cuando el DM la inicie
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-3 md:items-end md:text-right">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-parchment-400">Sesión</div>
            <div className="max-w-xs truncate font-display text-lg font-semibold text-parchment-50" title={sessionName}>
              {sessionName}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-gold-700/40 bg-ink-950/60 px-3 py-2 backdrop-blur md:flex-row-reverse">
            <Avatar
              name={dm.name}
              color={dm.color}
              size="lg"
              ring
              status={isDm ? 'online' : hostConnected === null ? null : hostConnected ? 'online' : 'offline'}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-400 md:justify-end">
                <Crown className="h-3 w-3" aria-hidden />
                Dungeon Master
              </div>
              <div className="truncate font-display text-base font-semibold" style={{ color: dm.color }}>
                {dm.name}
                {isDm && <span className="ml-1 font-sans text-xs font-normal text-parchment-400">(tú)</span>}
              </div>
              {!isDm && hostConnected !== null && (
                <div className={clsx('text-[11px]', hostConnected ? 'text-emerald-300' : 'text-parchment-400')}>
                  {hostConnected ? 'DM conectado' : 'DM desconectado'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Shown when the session was already started once (resumed from a save). */
export function ResumedBanner() {
  const startedAt = useSessionStore((s) => s.view?.state.startedAt ?? null);
  const savedAt = useSessionStore((s) => s.view?.state.savedAt ?? null);
  if (!startedAt) return null;
  return (
    <div className="flex animate-slide-up items-start gap-3 rounded-xl border border-sky-500/40 bg-gradient-to-r from-sky-500/15 to-ink-900/60 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-400/40 bg-ink-950/60 text-sky-300">
        <History className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="font-semibold text-sky-100">Partida guardada: se conservan héroes, posiciones e inventarios</div>
        <div className="mt-0.5 text-xs text-parchment-300">
          Empezó el {formatDateTime(startedAt)}
          {savedAt && <> · guardada {formatRelative(savedAt)}</>}
        </div>
      </div>
    </div>
  );
}
