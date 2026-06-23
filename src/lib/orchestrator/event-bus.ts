/**
 * In-process event bus — Release 13.
 *
 * This is the seam for AWS EventBridge later: today, `publish()` calls
 * subscriber callbacks synchronously in the same process. A future
 * EventBridge-backed implementation would keep the exact same
 * `publish(event)` / `subscribe(type, handler)` signature, just routing
 * through a real bus instead of an in-memory list — nothing that calls
 * `eventBus.publish(...)` needs to change.
 *
 * Events are fire-and-forget for now (no persistence, no replay). The
 * orchestrator publishes lifecycle events as workflows progress; agents or
 * future features can subscribe without the orchestrator knowing they exist.
 */

export type OrchestratorEventType =
  | "lead_created"
  | "lead_updated"
  | "lead_scored"
  | "followup_generated"
  | "crm_sync_completed"
  | "opportunity_created"
  | "roi_calculated";

export interface OrchestratorEvent<T = Record<string, unknown>> {
  type: OrchestratorEventType;
  tenantId: string;
  leadId?: string;
  eventId?: string;
  payload: T;
  occurredAt: string;
}

type Handler = (event: OrchestratorEvent) => void | Promise<void>;

class EventBus {
  private subscribers = new Map<OrchestratorEventType, Set<Handler>>();

  subscribe(type: OrchestratorEventType, handler: Handler): () => void {
    if (!this.subscribers.has(type)) this.subscribers.set(type, new Set());
    this.subscribers.get(type)!.add(handler);
    return () => this.subscribers.get(type)?.delete(handler);
  }

  async publish(event: Omit<OrchestratorEvent, "occurredAt">): Promise<void> {
    const full: OrchestratorEvent = { ...event, occurredAt: new Date().toISOString() };
    const handlers = this.subscribers.get(event.type);
    if (!handlers || handlers.size === 0) return;

    // Run handlers independently — one subscriber throwing must not break
    // others or the publisher (mirrors EventBridge's at-least-once,
    // independent-target delivery model).
    await Promise.allSettled([...handlers].map((h) => h(full)));
  }
}

// Singleton — process-local. A real EventBridge swap would replace this
// module's internals only; the exported `eventBus` name and API stay the same.
export const eventBus = new EventBus();
