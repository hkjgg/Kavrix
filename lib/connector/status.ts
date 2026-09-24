/**
 * The connector's status, from its real heartbeat and nothing else (CLAUDE.md
 * §17 Stage 8): "Synced · 4 s ago" is the time since the last request the
 * connector actually made. No invented latency, and never a green dot the
 * data does not support. Pure and browser-safe.
 */

/** The connector's default heartbeat interval (§12). */
export const HEARTBEAT_SECONDS = 60;
/** Missed heartbeats before a connection reads as stale rather than live. */
export const LIVE_HEARTBEATS = 3;

export type ConnectorTone = 'live' | 'stale' | 'never';

export interface ConnectorStatus {
  tone: ConnectorTone;
  /** `Synced · 4 s ago`, `Last heartbeat 3 h ago`, `No heartbeat yet`. */
  label: string;
  /** The heartbeat itself, `2026-09-24 09:41:07 UTC`, or `null`. */
  at: string | null;
}

/** `4 s`, `12 min`, `3 h`, `2 d` — the largest whole unit, rounded down. */
export function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export function connectorStatus(
  lastHeartbeat: string | null,
  nowMs: number,
  heartbeatSeconds: number = HEARTBEAT_SECONDS,
): ConnectorStatus {
  const ms = lastHeartbeat === null ? Number.NaN : Date.parse(lastHeartbeat);
  if (!Number.isFinite(ms)) return { tone: 'never', label: 'No heartbeat yet', at: null };
  const age = nowMs - ms;
  const at = `${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  if (age <= heartbeatSeconds * LIVE_HEARTBEATS * 1000) {
    return { tone: 'live', label: `Synced · ${formatAge(age)} ago`, at };
  }
  return { tone: 'stale', label: `Last heartbeat ${formatAge(age)} ago`, at };
}
