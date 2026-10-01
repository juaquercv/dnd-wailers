import { EventEmitter } from 'node:events';
import type { Campaign, LibraryEntry, Roller, Zone } from '@wailers/shared';

/**
 * In-process domain events. REST modules emit them after persisting changes;
 * the live session engine listens to refresh running sessions.
 */
export interface DomainEvents {
  'campaign:changed': { campaign: Campaign };
  'campaign:deleted': { campaignId: string };
  'zone:changed': { campaignId: string; zone: Zone };
  'zone:deleted': { campaignId: string; zoneId: string };
  'zones:reordered': { campaignId: string };
  'rollers:changed': { campaignId: string; rollers: Roller[] };
  /** A hero was edited from the library (outside a session). */
  'hero:changed': { hero: LibraryEntry<'hero'> };
  'library:changed': { entry: LibraryEntry };
  'library:deleted': { entryId: string; kind: string };
  /** User availability changed (claim/release). */
  'users:changed': Record<string, never>;
}

class TypedBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof DomainEvents>(event: K, listener: (payload: DomainEvents[K]) => void): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }
}

export const bus = new TypedBus();
