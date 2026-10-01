import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { OverviewMap, OverviewPin, SessionZone } from '@wailers/shared';
import { LINK_STYLES, PIN_TYPE_STYLES } from '../../editor/extras/overview/overviewStyles';

/** A party member drawn next to the pin of the zone they are in. */
export interface PartyMarker {
  id: string;
  name: string;
  color: string;
  imageUrl: string | null;
}

export interface OverviewViewProps {
  overview: OverviewMap;
  zonesById: Record<string, SessionZone>;
  /** zoneId -> heroes standing there (sub-zones fall back to the parent pin). */
  party?: Map<string, PartyMarker[]>;
  /** Zone highlighted as "you are here". */
  currentZoneId?: string | null;
  /** Clickable pins (DM). */
  onPinClick?: (pin: OverviewPin) => void;
  /** Show 'secret' links (DM only). */
  showSecret?: boolean;
  className?: string;
}

const UNKNOWN_COLOR = '#a8946b';
const PIN_R = 15;
const MARKER_R = 11;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function pinText(pin: OverviewPin, zone: SessionZone | undefined): string {
  return pin.label?.trim() || zone?.name || 'Lugar sin explorar';
}

function pinGlyph(pin: OverviewPin, zone: SessionZone | undefined): string {
  return pin.icon?.trim() || (zone ? PIN_TYPE_STYLES[zone.zoneType]?.icon : null) || '📍';
}

function pinColor(zone: SessionZone | undefined): string {
  return zone ? PIN_TYPE_STYLES[zone.zoneType]?.color ?? UNKNOWN_COLOR : UNKNOWN_COLOR;
}

/**
 * Read-only campaign overview (SVG scaled to fit): background image, routes, zone pins with names,
 * party markers on the zones where heroes stand and an optional "you are here" highlight.
 * Pins and labels keep a constant on-screen size whatever the map resolution.
 */
export function OverviewView({ overview, zonesById, party, currentZoneId = null, onPinClick, showSecret = false, className }: OverviewViewProps) {
  const uid = useId().replace(/:/g, '');
  const ids = { vignette: `ov-vig-${uid}`, grid: `ov-grid-${uid}`, clip: `ov-clip-${uid}` };
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const width = Math.max(1, overview.width);
  const height = Math.max(1, overview.height);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setBox((b) => (b.width === el.clientWidth && b.height === el.clientHeight ? b : { width: el.clientWidth, height: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // User units per screen px (the SVG is scaled with "meet").
  const fit = box.width > 0 && box.height > 0 ? Math.min(box.width / width, box.height / height) : 1;
  const u = 1 / Math.max(0.0001, fit);

  const pinsById = useMemo(() => new Map(overview.pins.map((p) => [p.id, p])), [overview.pins]);

  // Party markers per pin: heroes in a zone without its own pin appear on the parent's pin.
  const markersByPin = useMemo(() => {
    const out = new Map<string, PartyMarker[]>();
    if (!party || party.size === 0) return out;
    const pinForZone = new Map<string, OverviewPin>();
    for (const p of overview.pins) if (!pinForZone.has(p.zoneId)) pinForZone.set(p.zoneId, p);
    for (const [zoneId, heroes] of party) {
      let pin = pinForZone.get(zoneId);
      let guard = 0;
      let cursor = zonesById[zoneId]?.parentZoneId ?? null;
      while (!pin && cursor && guard < 10) {
        pin = pinForZone.get(cursor);
        cursor = zonesById[cursor]?.parentZoneId ?? null;
        guard += 1;
      }
      if (!pin) continue;
      out.set(pin.id, [...(out.get(pin.id) ?? []), ...heroes]);
    }
    return out;
  }, [party, overview.pins, zonesById]);

  const currentPinIds = useMemo(() => {
    const here = new Set<string>();
    if (!currentZoneId) return here;
    let zoneId: string | null = currentZoneId;
    let guard = 0;
    while (zoneId && guard < 10) {
      const found = overview.pins.filter((p) => p.zoneId === zoneId);
      if (found.length > 0) {
        for (const p of found) here.add(p.id);
        break;
      }
      zoneId = zonesById[zoneId]?.parentZoneId ?? null;
      guard += 1;
    }
    return here;
  }, [currentZoneId, overview.pins, zonesById]);

  const links = overview.links.filter((l) => showSecret || l.style !== 'secret');

  return (
    <div ref={wrapRef} className={clsx('relative h-full w-full overflow-hidden', className)}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full select-none" role="img" aria-label="Mapa general">
        <defs>
          <radialGradient id={ids.vignette} cx="50%" cy="50%" r="70%">
            <stop offset="0.65" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.55" />
          </radialGradient>
          <pattern id={ids.grid} width={Math.max(40, width / 16)} height={Math.max(40, width / 16)} patternUnits="userSpaceOnUse">
            <path d={`M ${Math.max(40, width / 16)} 0 L 0 0 0 ${Math.max(40, width / 16)}`} fill="none" stroke="rgba(205,185,143,0.08)" strokeWidth={u} />
          </pattern>
          <clipPath id={ids.clip}>
            <circle r={MARKER_R * u} />
          </clipPath>
        </defs>

        {overview.imageUrl ? (
          <image href={overview.imageUrl} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />
        ) : (
          <>
            <rect width={width} height={height} fill="#1c1915" />
            <rect width={width} height={height} fill={`url(#${ids.grid})`} />
          </>
        )}
        <rect width={width} height={height} fill={`url(#${ids.vignette})`} pointerEvents="none" />

        {links.map((link) => {
          const a = pinsById.get(link.fromPinId);
          const b = pinsById.get(link.toPinId);
          if (!a || !b) return null;
          const style = LINK_STYLES[link.style];
          const dash = style.dash ? style.dash.map((d) => d * u).join(' ') : undefined;
          return (
            <g key={link.id} pointerEvents="none">
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={style.casing} strokeWidth={(style.width + 3) * u} strokeLinecap="round" opacity={0.85} />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={style.color}
                strokeWidth={style.width * u}
                strokeDasharray={dash}
                strokeLinecap={style.lineCap}
              />
            </g>
          );
        })}

        {overview.pins.map((pin) => {
          const zone = zonesById[pin.zoneId];
          const color = pinColor(zone);
          const label = pinText(pin, zone);
          const here = currentPinIds.has(pin.id);
          const markers = markersByPin.get(pin.id) ?? [];
          const clickable = !!onPinClick;
          const r = PIN_R * u;
          const fontSize = 13 * u;
          return (
            <g
              key={pin.id}
              transform={`translate(${pin.x} ${pin.y})`}
              className={clsx(clickable && 'cursor-pointer [&:hover_.ov-pin-head]:brightness-125 [&:hover_.ov-pin-ring]:opacity-100')}
              onClick={clickable ? () => onPinClick(pin) : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPinClick(pin);
                      }
                    }
                  : undefined
              }
            >
              <title>{clickable ? `${label} — clic para ir a esta zona` : label}</title>
              {here && (
                <circle r={r * 1.9} fill="none" stroke="#f3d58a" strokeWidth={2.5 * u} opacity={0.9}>
                  <animate attributeName="r" values={`${r * 1.3};${r * 2.4};${r * 1.3}`} dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.1;0.9" dur="2.4s" repeatCount="indefinite" />
                </circle>
              )}
              <circle className="ov-pin-ring transition-opacity" r={r * 1.45} fill="none" stroke={color} strokeWidth={2 * u} opacity={here ? 0.9 : 0} />
              <g className="ov-pin-head transition">
                <circle r={r} fill="rgba(11,10,8,0.92)" stroke={color} strokeWidth={2.5 * u} />
                <text y={0.36 * r} textAnchor="middle" fontSize={r * 1.05} style={{ fontFamily: '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif' }}>
                  {pinGlyph(pin, zone)}
                </text>
              </g>
              <text
                y={r + fontSize * 1.25}
                textAnchor="middle"
                fontSize={fontSize}
                fontWeight={700}
                fill={here ? '#f3d58a' : '#f3ead6'}
                stroke="rgba(11,10,8,0.92)"
                strokeWidth={3.5 * u}
                paintOrder="stroke"
                style={{ fontFamily: 'Cinzel, Georgia, serif', letterSpacing: '0.04em' }}
              >
                {label}
              </text>
              {markers.length > 0 && (
                <g transform={`translate(0 ${-(r + MARKER_R * u * 1.6)})`}>
                  {markers.slice(0, 6).map((m, i) => {
                    const count = Math.min(markers.length, 6);
                    const step = MARKER_R * 1.55 * u;
                    const x = (i - (count - 1) / 2) * step;
                    return (
                      <g key={m.id} transform={`translate(${x} 0)`}>
                        <title>{m.name}</title>
                        <circle r={(MARKER_R + 2) * u} fill={m.color} opacity={0.95} />
                        {m.imageUrl ? (
                          <image
                            href={m.imageUrl}
                            x={-MARKER_R * u}
                            y={-MARKER_R * u}
                            width={MARKER_R * 2 * u}
                            height={MARKER_R * 2 * u}
                            preserveAspectRatio="xMidYMid slice"
                            clipPath={`url(#${ids.clip})`}
                          />
                        ) : (
                          <>
                            <circle r={MARKER_R * u} fill="#13110e" />
                            <text y={4 * u} textAnchor="middle" fontSize={10 * u} fontWeight={700} fill={m.color} style={{ fontFamily: 'Inter, sans-serif' }}>
                              {initials(m.name)}
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}
                  {markers.length > 6 && (
                    <text x={(MARKER_R * 1.55 * u * 6) / 2 + 6 * u} y={4 * u} fontSize={11 * u} fontWeight={700} fill="#f3ead6" stroke="#0b0a08" strokeWidth={3 * u} paintOrder="stroke">
                      +{markers.length - 6}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
