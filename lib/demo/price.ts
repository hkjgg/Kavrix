/**
 * Demo XAUUSD price path — 90 days of M1 bars (CLAUDE.md §11).
 *
 * The path is the ground truth every demo trade is priced against: entries,
 * exits, stop hits and excursions all come out of these bars, so nothing in
 * the demo data can quote a price the market never printed.
 *
 * Shape of the model, in the order it matters for Gold:
 *  - a slow trend the price is pulled back towards, so 90 days of minutes do
 *    not random-walk to an absurd number;
 *  - a session volatility profile: quiet Asia, busy London, busiest during
 *    the London/New York overlap, dead after the New York close;
 *  - sharp, short-lived spikes around high-impact USD releases;
 *  - a spread that widens at rollover and on news, which is exactly where the
 *    engine's Market Conditions pillar looks (CLAUDE.md §5).
 *
 * Bars are stored as parallel typed arrays rather than objects: 129,600
 * minutes is a lot of small objects, and the generator reads these arrays
 * millions of times while it walks trades forward.
 */

import type { Rng } from './rng';

/** One minute in milliseconds. */
export const MINUTE_MS = 60_000;

/**
 * Where the demo path starts, in USD per ounce. A plausible 2026 Gold price
 * and nothing more — this is demo data, not a forecast or a real quote.
 */
export const DEMO_START_PRICE = 2418.4;

/** Baseline per-minute standard deviation in USD, before session weighting. */
const BASE_MINUTE_SIGMA = 0.42;

/** Pull towards the slow trend, per minute. Keeps the walk from drifting off. */
const MEAN_REVERSION = 0.0016;

/** Amplitude of the slow trend the path is pulled towards, in USD. */
const TREND_AMPLITUDE = 96;

/** Net drift across the whole window, in USD. Gold grinds up in the demo. */
const TREND_DRIFT = 58;

/** Normal spread, in points (1 point = 0.01 on a 2-digit symbol). */
const BASE_SPREAD_POINTS = 22;

/** Spread multiplier during the rollover window. Gold is notorious here. */
const ROLLOVER_SPREAD_MULTIPLIER = 11;

/** Spread multiplier at the peak of a high-impact release. */
const NEWS_SPREAD_MULTIPLIER = 7;

/** Minutes either side of broker midnight that count as rollover (§5). */
export const ROLLOVER_WINDOW_MINUTES = 15;

/**
 * The demo broker's server clock offset from UTC, in hours.
 *
 * Zero: the demo broker runs on UTC, so "server midnight" is 00:00 UTC and
 * the rollover window is 23:45–00:15. Real accounts read this from the
 * connector, where it is usually UTC+2 or UTC+3.
 */
export const DEMO_SERVER_UTC_OFFSET_HOURS = 0;

/** Minutes after a release during which volatility stays elevated. */
const NEWS_VOLATILITY_MINUTES = 14;

function read(values: Float64Array, index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`price path index out of range: ${index}`);
  }
  return value;
}

function readInt(values: Int32Array | Uint8Array, index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`price path index out of range: ${index}`);
  }
  return value;
}

/** Rounds to `digits` decimals. XAUUSD prices are always 2. */
export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Is the Gold market open at this instant?
 *
 * MT5 Gold trades from Sunday 22:00 UTC to Friday 21:00 UTC. Outside that the
 * demo path simply holds its last price and no trade is ever placed.
 */
export function isMarketOpenAt(timeMs: number): boolean {
  const date = new Date(timeMs);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();
  if (day === 6) return false;
  if (day === 0) return hour >= 22;
  if (day === 5) return hour < 21;
  return true;
}

/**
 * Relative volatility for a UTC hour, from the session table in CLAUDE.md §5:
 * Asia 00:00–09:00, London 07:00–16:00, New York 12:30–21:00.
 */
export function sessionVolatility(hourOfDay: number): number {
  let weight = 0.3;
  if (hourOfDay >= 0 && hourOfDay < 9) weight += 0.3; // Asia
  if (hourOfDay >= 7 && hourOfDay < 16) weight += 0.7; // London
  if (hourOfDay >= 12.5 && hourOfDay < 21) weight += 0.85; // New York
  if (hourOfDay >= 7 && hourOfDay < 9.5) weight += 0.4; // London open burst
  if (hourOfDay >= 21) weight -= 0.12; // after the New York close
  return Math.max(0.15, weight);
}

/** A 90-day M1 path: mid prices, and the spread around them. */
export class PricePath {
  readonly startMs: number;
  readonly length: number;
  private readonly openValues: Float64Array;
  private readonly highValues: Float64Array;
  private readonly lowValues: Float64Array;
  private readonly closeValues: Float64Array;
  private readonly spreadValues: Int32Array;
  private readonly openMarket: Uint8Array;

  constructor(startMs: number, length: number) {
    this.startMs = startMs;
    this.length = length;
    this.openValues = new Float64Array(length);
    this.highValues = new Float64Array(length);
    this.lowValues = new Float64Array(length);
    this.closeValues = new Float64Array(length);
    this.spreadValues = new Int32Array(length);
    this.openMarket = new Uint8Array(length);
  }

  /** Mid price at the open of bar `index`. */
  open(index: number): number {
    return read(this.openValues, index);
  }

  /** Highest mid price printed in bar `index`. */
  high(index: number): number {
    return read(this.highValues, index);
  }

  /** Lowest mid price printed in bar `index`. */
  low(index: number): number {
    return read(this.lowValues, index);
  }

  /** Mid price at the close of bar `index`. */
  close(index: number): number {
    return read(this.closeValues, index);
  }

  /** Spread at bar `index`, in points. Bid is mid − half, ask is mid + half. */
  spreadPoints(index: number): number {
    return readInt(this.spreadValues, index);
  }

  /** Half the spread at bar `index`, in price. */
  halfSpread(index: number): number {
    return (this.spreadPoints(index) * 0.01) / 2;
  }

  /** Was the market open during bar `index`? */
  isOpen(index: number): boolean {
    return readInt(this.openMarket, index) === 1;
  }

  /** Start time of bar `index`, in epoch milliseconds. */
  timeAt(index: number): number {
    return this.startMs + index * MINUTE_MS;
  }

  /** Bar containing `timeMs`, clamped to the path. */
  indexAt(timeMs: number): number {
    const raw = Math.floor((timeMs - this.startMs) / MINUTE_MS);
    if (raw < 0) return 0;
    if (raw >= this.length) return this.length - 1;
    return raw;
  }

  /** @internal — used by the builder only. */
  write(
    index: number,
    bar: { open: number; high: number; low: number; close: number },
    spreadPoints: number,
    marketOpen: boolean,
  ): void {
    this.openValues[index] = bar.open;
    this.highValues[index] = bar.high;
    this.lowValues[index] = bar.low;
    this.closeValues[index] = bar.close;
    this.spreadValues[index] = spreadPoints;
    this.openMarket[index] = marketOpen ? 1 : 0;
  }
}

/** Is `timeMs` inside the broker's rollover window (§5)? */
export function isRolloverTime(timeMs: number): boolean {
  const shifted = timeMs - DEMO_SERVER_UTC_OFFSET_HOURS * 3_600_000;
  const date = new Date(shifted);
  const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (
    minuteOfDay >= 24 * 60 - ROLLOVER_WINDOW_MINUTES ||
    minuteOfDay <= ROLLOVER_WINDOW_MINUTES
  );
}

interface NewsMinute {
  /** Extra volatility multiplier at this minute. */
  volatility: number;
  /** One-off directional push, in USD. */
  impulse: number;
  /** Spread multiplier at this minute. */
  spread: number;
}

/**
 * Pre-computes the per-minute news effect: a spike in the first few minutes
 * after a release, decaying over roughly a quarter of an hour.
 */
function buildNewsEffects(
  rng: Rng,
  eventTimes: readonly number[],
  startMs: number,
  length: number,
): Map<number, NewsMinute> {
  const effects = new Map<number, NewsMinute>();
  for (const eventMs of eventTimes) {
    const eventIndex = Math.round((eventMs - startMs) / MINUTE_MS);
    // Size and sign of this release's move, drawn once per event.
    const magnitude = rng.float(3.4, 9.2);
    const direction = rng.bool(0.5) ? 1 : -1;
    for (let offset = -2; offset <= NEWS_VOLATILITY_MINUTES; offset += 1) {
      const index = eventIndex + offset;
      if (index < 0 || index >= length) continue;
      const decay = offset <= 0 ? 0.55 : Math.exp(-offset / 4);
      const previous = effects.get(index);
      const effect: NewsMinute = {
        volatility: 1 + 7 * decay,
        impulse: offset >= 0 && offset <= 2 ? direction * magnitude * (offset === 0 ? 0.6 : 0.2) : 0,
        spread: 1 + (NEWS_SPREAD_MULTIPLIER - 1) * Math.max(decay, offset <= 2 ? 0.8 : 0),
      };
      effects.set(
        index,
        previous === undefined
          ? effect
          : {
              volatility: Math.max(previous.volatility, effect.volatility),
              impulse: previous.impulse + effect.impulse,
              spread: Math.max(previous.spread, effect.spread),
            },
      );
    }
  }
  return effects;
}

/**
 * Builds the demo path.
 *
 * @param rng seeded generator — the path is a pure function of it
 * @param highImpactTimes epoch ms of the high-impact releases to spike around
 * @param startMs first bar, epoch ms
 * @param minutes number of M1 bars
 */
export function buildPricePath(
  rng: Rng,
  highImpactTimes: readonly number[],
  startMs: number,
  minutes: number,
): PricePath {
  const path = new PricePath(startMs, minutes);
  const news = buildNewsEffects(rng, highImpactTimes, startMs, minutes);

  let price = DEMO_START_PRICE;
  let closedFor = 0;

  for (let index = 0; index < minutes; index += 1) {
    const timeMs = startMs + index * MINUTE_MS;
    const marketOpen = isMarketOpenAt(timeMs);
    const progress = index / minutes;

    if (!marketOpen) {
      closedFor += 1;
      const flat = roundTo(price, 2);
      path.write(index, { open: flat, high: flat, low: flat, close: flat }, 0, false);
      continue;
    }

    // A weekend's worth of closure reopens with a gap, the way Gold does.
    if (closedFor > 120) {
      price += rng.gaussian(0, 2.6);
    }
    closedFor = 0;

    const date = new Date(timeMs);
    const hourOfDay = date.getUTCHours() + date.getUTCMinutes() / 60;
    const effect = news.get(index);

    const trend =
      DEMO_START_PRICE +
      TREND_DRIFT * progress +
      TREND_AMPLITUDE * Math.sin(progress * Math.PI * 1.7 + 0.4);

    const sigma =
      BASE_MINUTE_SIGMA * sessionVolatility(hourOfDay) * (effect?.volatility ?? 1);

    const barOpen = price;
    price +=
      rng.gaussian(0, sigma) +
      MEAN_REVERSION * (trend - price) +
      (effect?.impulse ?? 0);
    const barClose = price;

    const wickScale = sigma * 0.65;
    const high = Math.max(barOpen, barClose) + Math.abs(rng.normal()) * wickScale;
    const low = Math.min(barOpen, barClose) - Math.abs(rng.normal()) * wickScale;

    let spread = BASE_SPREAD_POINTS * rng.float(0.82, 1.25);
    if (hourOfDay >= 21 || hourOfDay < 1) spread *= 1.7; // thin book
    if (isRolloverTime(timeMs)) spread *= ROLLOVER_SPREAD_MULTIPLIER;
    if (effect !== undefined) spread *= effect.spread;

    path.write(
      index,
      {
        open: roundTo(barOpen, 2),
        high: roundTo(high, 2),
        low: roundTo(low, 2),
        close: roundTo(barClose, 2),
      },
      Math.max(10, Math.round(spread)),
      true,
    );
  }

  return path;
}
