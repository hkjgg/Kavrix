import { describe, expect, it } from 'vitest';
import { connectorStatus, formatAge } from './status';

const NOW = Date.parse('2026-09-24T12:00:00.000Z');

describe('connector status', () => {
  it('is live within three heartbeats, with the real age', () => {
    expect(connectorStatus('2026-09-24T11:59:56.000Z', NOW)).toEqual({
      tone: 'live',
      label: 'Synced · 4 s ago',
      at: '2026-09-24 11:59:56 UTC',
    });
    expect(connectorStatus('2026-09-24T11:57:00.000Z', NOW).tone).toBe('live');
  });

  it('is stale past three missed heartbeats, and says how stale', () => {
    const status = connectorStatus('2026-09-24T11:56:59.000Z', NOW);
    expect(status.tone).toBe('stale');
    expect(status.label).toBe('Last heartbeat 3 min ago');
    expect(connectorStatus('2026-09-21T12:00:00.000Z', NOW).label).toBe('Last heartbeat 3 d ago');
  });

  it('never shows a dot the data does not support', () => {
    expect(connectorStatus(null, NOW)).toEqual({ tone: 'never', label: 'No heartbeat yet', at: null });
    expect(connectorStatus('garbage', NOW).tone).toBe('never');
  });

  it('reads Postgres timestamps', () => {
    expect(connectorStatus('2026-09-24 11:59:30+00', NOW).label).toBe('Synced · 30 s ago');
  });

  it('formats ages by their largest whole unit', () => {
    expect(formatAge(0)).toBe('0 s');
    expect(formatAge(59_999)).toBe('59 s');
    expect(formatAge(60_000)).toBe('1 min');
    expect(formatAge(3_599_999)).toBe('59 min');
    expect(formatAge(3_600_000)).toBe('1 h');
    expect(formatAge(47 * 3_600_000)).toBe('47 h');
    expect(formatAge(48 * 3_600_000)).toBe('2 d');
    expect(formatAge(-5)).toBe('0 s');
  });
});
