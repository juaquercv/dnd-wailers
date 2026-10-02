import { zoneVisionFor, type LiveState, type SessionZone, type ZoneVision } from '@wailers/shared';

/** Default vision stored in the campaign for a zone (as the server copied it into the state, else the zone document). */
export function savedZoneVision(state: LiveState, zone: SessionZone): ZoneVision | null {
  const copied = state.zoneVision;
  if (copied && zone.id in copied) return copied[zone.id] ?? null;
  return zone.vision ?? null;
}

/** Vision in force in a zone: the DM's live change, else the zone default, else null (starting values). */
export function zoneVisionInForce(state: LiveState, zone: SessionZone): ZoneVision | null {
  return zoneVisionFor(state, zone.id) ?? savedZoneVision(state, zone);
}
