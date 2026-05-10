import { OAuthTraceEvent, OAuthTraceSink } from './trace-events';

/** Default ring-buffer capacity. Keeps latest N events; oldest are dropped. */
export const MEMORY_SINK_MAX_EVENTS = 1000;

/**
 * In-memory ring buffer sink. Used for diagnose-failure analysis after a flow ends.
 * Caps at MAX_EVENTS to bound memory; oldest are dropped when full.
 * `droppedCount` tracks how many events were discarded so callers know data loss occurred.
 */
export function createMemorySink(
  maxEvents = MEMORY_SINK_MAX_EVENTS
): OAuthTraceSink & { snapshot(): OAuthTraceEvent[]; droppedCount(): number } {
  const events: OAuthTraceEvent[] = [];
  let dropped = 0;
  return {
    write(event) {
      if (events.length >= maxEvents) {
        events.shift();
        dropped++;
      }
      events.push(event);
    },
    snapshot() {
      return events.slice();
    },
    droppedCount() {
      return dropped;
    },
  };
}
