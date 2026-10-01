import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { ArrowDown, Crown, Lock, MessageSquare, Send } from 'lucide-react';
import type { LogEntry } from '@wailers/shared';
import { emitAck } from '../../api/socket';
import { Badge, withAlpha } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { Select, type SelectOption } from '../../components/ui/Select';
import { TextArea } from '../../components/ui/TextArea';
import { toast } from '../../components/ui/toast';
import { Toggle } from '../../components/ui/Toggle';
import { formatDate, formatTime } from '../../lib/format';
import { useSessionStore } from '../../stores/session';
import { useSessionPlayers, useUserDirectory, type UserLookup } from '../lobby/lobbyUi';

export interface ChatPanelProps {
  compact?: boolean;
}

const EMOJIS = ['🎲', '⚔️', '🛡️', '🔥', '💀', '😂', '👍'];
const MAX_LEN = 1000;
const GROUP_WINDOW_MS = 2 * 60 * 1000;
const SHOW_SYSTEM_KEY = 'wailers.chat.showSystem';
const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u{FE0F}|\u{200D}|\s)+$/u;

function readShowSystem(): boolean {
  try {
    return localStorage.getItem(SHOW_SYSTEM_KEY) === '1';
  } catch {
    return false;
  }
}

function writeShowSystem(v: boolean): void {
  try {
    localStorage.setItem(SHOW_SYSTEM_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Adds the acknowledged entry to the session log unless the server push already did. */
function appendToLog(entry: LogEntry): void {
  useSessionStore.setState((s) => {
    if (s.sessionId !== entry.sessionId || s.log.some((e) => e.id === entry.id)) return {};
    return { log: [...s.log, entry].sort((a, b) => a.at.localeCompare(b.at)) };
  });
}

function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 12 && EMOJI_ONLY_RE.test(t);
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toDateString();
}

function sameThread(a: LogEntry, b: LogEntry): boolean {
  if (a.type !== 'chat' || b.type !== 'chat') return false;
  if (a.actorUserId !== b.actorUserId || a.visibility !== b.visibility || a.targetUserId !== b.targetUserId) return false;
  const gap = new Date(b.at).getTime() - new Date(a.at).getTime();
  return gap >= 0 && gap < GROUP_WINDOW_MS;
}

interface LineProps {
  entry: LogEntry;
  grouped: boolean;
  meUserId: string;
  hostUserId: string;
  lookup: UserLookup;
  compact: boolean;
}

const ChatLine = memo(function ChatLine({ entry, grouped, meUserId, hostUserId, lookup, compact }: LineProps) {
  if (entry.type !== 'chat') {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-[11px] leading-4 text-parchment-400" role="note">
        <span aria-hidden className="h-px min-w-[1rem] flex-1 bg-gradient-to-r from-transparent to-ink-500" />
        <span className="max-w-[85%] text-center italic">{entry.text}</span>
        <span aria-hidden className="h-px min-w-[1rem] flex-1 bg-gradient-to-l from-transparent to-ink-500" />
      </div>
    );
  }

  const author = lookup(entry.actorUserId, entry.actorName);
  const isDmMsg = entry.actorUserId !== null && entry.actorUserId === hostUserId;
  const isMine = entry.actorUserId === meUserId;
  const whisper = entry.visibility === 'user' && entry.targetUserId !== null;
  let whisperLabel: string | null = null;
  if (whisper) {
    const data = entry.data;
    const toName = data && typeof data === 'object' && typeof (data as { toName?: unknown }).toName === 'string' ? (data as { toName: string }).toName : null;
    const targetName = lookup(entry.targetUserId, toName).name;
    const target = entry.targetUserId === hostUserId ? `${targetName} (DM)` : targetName;
    whisperLabel = !isMine && entry.targetUserId === meUserId ? `Susurro de ${author.name}` : `Susurro a ${target}`;
  }
  const big = isEmojiOnly(entry.text);

  return (
    <div
      className={clsx(
        'group relative rounded-lg border-l-2 px-2.5 transition-colors',
        grouped ? 'pb-1 pt-0.5' : compact ? 'pb-1 pt-1.5' : 'pb-1.5 pt-2',
        whisper
          ? 'border-arcane-500/70 bg-arcane-500/[0.08]'
          : isDmMsg
            ? 'border-gold-500/70 bg-gold-500/[0.07]'
            : 'border-transparent hover:bg-ink-800/60',
      )}
    >
      {!grouped && (
        <div className="flex min-w-0 items-baseline gap-1.5">
          {isDmMsg && <Crown className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-gold-400" aria-hidden />}
          <span
            className={clsx('truncate font-semibold', compact ? 'text-xs' : 'text-sm', isDmMsg && 'font-display tracking-wide')}
            style={{ color: author.color, textShadow: `0 0 12px ${withAlpha(author.color, 0.35)}` }}
          >
            {author.name}
          </span>
          {isDmMsg && (
            <Badge tone="gold" size="xs" className="shrink-0 self-center">
              DM
            </Badge>
          )}
          {isMine && !isDmMsg && <span className="shrink-0 text-[10px] text-parchment-400">(tú)</span>}
          <time dateTime={entry.at} className="ml-auto shrink-0 pl-2 text-[10px] tabular-nums text-parchment-400">
            {formatTime(entry.at)}
          </time>
        </div>
      )}
      {grouped && (
        <time
          dateTime={entry.at}
          className="pointer-events-none absolute right-2 top-1 text-[10px] tabular-nums text-parchment-400 opacity-0 transition-opacity group-hover:opacity-100"
        >
          {formatTime(entry.at)}
        </time>
      )}
      {whisperLabel && !grouped && (
        <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium italic text-arcane-300">
          <span aria-hidden>🔒</span>
          <span className="sr-only">Privado:</span>
          {whisperLabel}
        </div>
      )}
      <p
        className={clsx(
          'whitespace-pre-wrap break-words pr-8 text-parchment-100 [overflow-wrap:anywhere]',
          big ? 'text-3xl leading-tight' : compact ? 'text-[13px] leading-snug' : 'text-sm leading-relaxed',
          whisper && 'italic text-parchment-50',
        )}
      >
        {entry.text}
      </p>
    </div>
  );
});

/** Session chat: public messages, whispers, DM highlights, optional system events, emoji quick bar. */
export function ChatPanel({ compact = false }: ChatPanelProps) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const meUserId = useSessionStore((s) => s.view?.meUserId ?? '');
  const hostUserId = useSessionStore((s) => s.view?.state.hostUserId ?? '');
  const isDm = useSessionStore((s) => s.view?.role === 'dm');
  const log = useSessionStore((s) => s.log);
  const players = useSessionPlayers();
  const lookup = useUserDirectory();

  const [showSystem, setShowSystem] = useState(readShowSystem);
  const [text, setText] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [unseen, setUnseen] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);
  const autoScrollUntilRef = useRef(0);
  const lastIdRef = useRef<string | null>(null);
  const lastShowSystemRef = useRef(showSystem);

  const messages = useMemo(
    () => log.filter((e) => e.sessionId === sessionId && (e.type === 'chat' || (showSystem && e.type === 'system'))),
    [log, sessionId, showSystem],
  );

  // Whisper targets: other players + the DM.
  const targetOptions = useMemo<SelectOption<string | null>[]>(() => {
    const opts: SelectOption<string | null>[] = [{ value: null, label: 'Todos' }];
    if (!isDm && hostUserId) opts.push({ value: hostUserId, label: `DM · ${lookup(hostUserId).name}`, group: 'Susurrar a…' });
    for (const p of players) {
      if (p.userId === meUserId) continue;
      opts.push({ value: p.userId, label: p.connected ? p.name : `${p.name} (desconectado)`, group: 'Susurrar a…' });
    }
    return opts;
  }, [players, meUserId, hostUserId, isDm, lookup]);

  // The chosen whisper target left the session: back to everyone.
  useEffect(() => {
    if (target !== null && !targetOptions.some((o) => o.value === target)) setTarget(null);
  }, [target, targetOptions]);

  const scrollToBottom = (smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    if (smooth) {
      // Scroll events fired during the animation must not be read as "the user scrolled up".
      autoScrollUntilRef.current = Date.now() + 600;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    atBottomRef.current = true;
    setUnseen((n) => (n === 0 ? n : 0));
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (!atBottom && Date.now() < autoScrollUntilRef.current) return;
    atBottomRef.current = atBottom;
    if (atBottom) setUnseen((n) => (n === 0 ? n : 0));
  };

  // Follow new messages unless the user scrolled up (then count them in the pill).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const last = messages[messages.length - 1];
    const prevLastId = lastIdRef.current;
    lastIdRef.current = last?.id ?? null;
    const toggled = lastShowSystemRef.current !== showSystem;
    lastShowSystemRef.current = showSystem;
    if (!el || !last) return;
    if (prevLastId === null || toggled) {
      if (prevLastId === null || atBottomRef.current) scrollToBottom(false);
      return;
    }
    if (last.id === prevLastId) return;
    const prevIndex = messages.findIndex((m) => m.id === prevLastId);
    const added = prevIndex >= 0 ? messages.length - 1 - prevIndex : 1;
    if (atBottomRef.current || last.actorUserId === meUserId) scrollToBottom(true);
    else setUnseen((n) => n + added);
  }, [messages, showSystem, meUserId]);

  // Keep pinned to the bottom when the panel or the content resizes (textarea growth, images, layout).
  useEffect(() => {
    const el = scrollRef.current;
    const list = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    if (list) ro.observe(list);
    return () => ro.disconnect();
  }, []);

  const send = async () => {
    const body = text.trim();
    if (!body || sending || !sessionId) return;
    if (body.length > MAX_LEN) {
      toast.warning(`El mensaje es demasiado largo (máximo ${MAX_LEN} caracteres)`);
      return;
    }
    setSending(true);
    setText('');
    atBottomRef.current = true;
    try {
      const entry = await emitAck('chat:send', { text: body, toUserId: target });
      appendToLog(entry);
    } catch (err) {
      setText((cur) => (cur ? cur : body));
      toast.fromError(err, 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    } else if (e.key === 'Escape' && target !== null) {
      e.preventDefault();
      setTarget(null);
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, MAX_LEN);
    setText(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = Math.min(start + emoji.length, next.length);
      el.setSelectionRange(pos, pos);
    });
  };

  const toggleSystem = (v: boolean) => {
    setShowSystem(v);
    writeShowSystem(v);
  };

  const whisperName = target !== null ? targetOptions.find((o) => o.value === target)?.label ?? '' : '';
  const remaining = MAX_LEN - text.length;

  const systemToggle = (
    <Toggle
      size="sm"
      checked={showSystem}
      onChange={toggleSystem}
      label={compact ? 'Eventos' : 'Mostrar eventos del sistema'}
      title="Mostrar eventos del sistema"
      className="items-center"
    />
  );

  const body = (
    <>
      {!compact && (
        <div className="panel-header">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" aria-hidden />
            Chat
          </span>
          <span className="font-sans text-[11px] font-normal normal-case tracking-normal">{systemToggle}</span>
        </div>
      )}
      {compact && <div className="flex items-center justify-end border-b border-ink-600/60 px-2 py-1.5">{systemToggle}</div>}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className={clsx('scroll-thin absolute inset-0 overflow-y-auto overscroll-contain', compact ? 'px-1.5 py-1.5' : 'px-2 py-2')}
          aria-live="polite"
          aria-relevant="additions"
          role="log"
          aria-label="Mensajes del chat"
        >
          <div ref={listRef} className={clsx('flex min-h-full flex-col gap-0.5', messages.length === 0 ? 'justify-center' : 'justify-end')}>
            {messages.length === 0 ? (
              <EmptyState
                compact
                icon={<MessageSquare />}
                title="Aún no hay mensajes"
                description="¡Saluda al grupo! Usa el selector para susurrar en privado."
              />
            ) : (
              messages.map((entry, i) => {
                const prev = i > 0 ? messages[i - 1] : undefined;
                const newDay = !prev || dayKey(prev.at) !== dayKey(entry.at);
                return (
                  <div key={entry.id}>
                    {newDay && (
                      <div className="my-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-500/80">
                        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-700/50" />
                        {formatDate(entry.at)}
                        <span aria-hidden className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-700/50" />
                      </div>
                    )}
                    <ChatLine
                      entry={entry}
                      grouped={!newDay && !!prev && sameThread(prev, entry)}
                      meUserId={meUserId}
                      hostUserId={hostUserId}
                      lookup={lookup}
                      compact={compact}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
        {unseen > 0 && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-2 left-1/2 z-10 inline-flex -translate-x-1/2 animate-slide-up items-center gap-1.5 rounded-full border border-gold-500/60 bg-ink-900/95 px-3 py-1 text-xs font-semibold text-gold-200 shadow-glow-gold backdrop-blur transition hover:bg-ink-800"
          >
            Nuevos mensajes ({unseen})
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      <div className={clsx('shrink-0 border-t border-ink-600/70 bg-ink-950/40', compact ? 'space-y-1.5 p-1.5' : 'space-y-2 p-2.5')}>
        <div className="flex items-center gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar" role="toolbar" aria-label="Emojis rápidos">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className={clsx(
                  'shrink-0 rounded-md leading-none transition hover:scale-110 hover:bg-ink-700 active:scale-95',
                  compact ? 'px-0.5 py-0.5 text-sm' : 'px-1 py-1 text-base',
                )}
                title={`Insertar ${emoji}`}
                aria-label={`Insertar ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <Select<string | null>
            size="sm"
            value={target}
            onChange={setTarget}
            options={targetOptions}
            aria-label="Destinatario del mensaje"
            title="Destinatario: todos o susurro privado"
            containerClassName={compact ? 'w-28 shrink-0' : 'w-32 shrink-0'}
            className={clsx(target !== null && 'border-arcane-500/70 text-arcane-200')}
          />
        </div>
        {target !== null && (
          <div className="flex items-center gap-1.5 text-[11px] text-arcane-300">
            <Lock className="h-3 w-3" aria-hidden />
            <span className="truncate">
              Susurro privado a <strong className="font-semibold">{whisperName}</strong>
              {!isDm && target !== hostUserId && ' (el DM también lo ve)'}
            </span>
            <button type="button" className="ml-auto shrink-0 text-parchment-400 underline-offset-2 hover:text-parchment-100 hover:underline" onClick={() => setTarget(null)}>
              Cancelar
            </button>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <TextArea
            ref={inputRef}
            value={text}
            onValueChange={(v) => setText(v.slice(0, MAX_LEN))}
            onKeyDown={onKeyDown}
            rows={1}
            autoResize
            maxRows={compact ? 4 : 6}
            maxLength={MAX_LEN}
            placeholder={target !== null ? `Susurrar a ${whisperName}…` : 'Escribe un mensaje…'}
            aria-label="Mensaje"
            containerClassName="min-w-0 flex-1"
            className={clsx('py-1.5', compact && 'text-xs', target !== null && 'border-arcane-500/60 focus:border-arcane-400 focus:ring-arcane-500/25')}
            disabled={!sessionId}
          />
          <IconButton
            icon={<Send />}
            title="Enviar (Intro)"
            variant="primary"
            size={compact ? 'sm' : 'md'}
            loading={sending}
            disabled={!text.trim() || !sessionId}
            onClick={() => void send()}
          />
        </div>
        {!compact && (
          <div className="flex items-center justify-between px-0.5 text-[10px] text-parchment-400">
            <span>
              <kbd className="font-sans font-semibold text-parchment-300">Intro</kbd> envía ·{' '}
              <kbd className="font-sans font-semibold text-parchment-300">Mayús+Intro</kbd> nueva línea
            </span>
            {remaining < 150 && <span className={clsx('tabular-nums', remaining < 30 && 'text-blood-400')}>{remaining}</span>}
          </div>
        )}
      </div>
    </>
  );

  if (compact) return <div className="flex h-full min-h-0 flex-col">{body}</div>;
  return <section className="panel flex h-full min-h-0 flex-col overflow-hidden">{body}</section>;
}
