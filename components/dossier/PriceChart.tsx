'use client';

import { useEffect, useRef, useState } from 'react';
import type { SeriesMarker, Time } from 'lightweight-charts';
import type { DossierChart } from './dossier';

/**
 * The Dossier's price chart (CLAUDE.md §8): TradingView `lightweight-charts`
 * candles around the trade, the three sessions as bands behind them,
 * high-impact USD releases on the time axis, and the trade drawn on top —
 * entry, exit, initial stop, every stop modification, and its MFE and MAE.
 *
 * The library is loaded on mount, never in the page's first bundle, and the
 * box it draws into has a fixed height, so nothing moves when it arrives.
 * Without JavaScript the reader gets the chart in words (the figcaption). The
 * box is not hidden from assistive technology: the library puts its
 * attribution link in it, and a focusable link may not sit inside aria-hidden.
 *
 * Colours are read from the §9 tokens on `:root` — the chart has no palette
 * of its own. Quiet by rule (§2): no animation, no crosshair magnetism.
 */

interface NewsTick {
  x: number;
  label: string;
  name: string;
}

function token(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

/** `#d4af6a` at 30% → `rgba(212, 175, 106, 0.3)`. The library does not parse `color-mix`. */
function alpha(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return hex;
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

export function PriceChart({ chart }: { chart: DossierChart }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ticks, setTicks] = useState<NewsTick[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void import('lightweight-charts').then((lib) => {
      if (disposed) return;
      const {
        createChart,
        CandlestickSeries,
        HistogramSeries,
        LineStyle,
        CrosshairMode,
        createSeriesMarkers,
      } = lib;

      const c = {
        bg: token('--surface-1', '#111114'),
        line: token('--line', '#1e1d21'),
        text3: token('--text-3', '#8e897f'),
        text2: token('--text-2', '#b8b2a6'),
        gold: token('--gold', '#d4af6a'),
        goldLight: token('--gold-light', '#f3dfa8'),
        goldDeep: token('--gold-deep', '#8c6a2f'),
        champagne: token('--champagne', '#e9d8a6'),
        bronze: token('--bronze', '#a8743f'),
        slate: token('--slate', '#5e5b66'),
        jade: token('--jade', '#6fc291'),
        oxbloodText: token('--oxblood-text', '#e08a7e'),
        news: token('--news', '#c9953f'),
      };

      const api = createChart(container, {
        autoSize: true,
        layout: {
          background: { color: c.bg },
          textColor: c.text3,
          fontFamily: getComputedStyle(document.body).getPropertyValue('--font-jetbrains-mono') || 'monospace',
          fontSize: 11,
          attributionLogo: true,
        },
        grid: {
          vertLines: { color: alpha(c.line, 0.6) },
          horzLines: { color: alpha(c.line, 0.9) },
        },
        rightPriceScale: { borderColor: c.line },
        timeScale: { borderColor: c.line, timeVisible: true, secondsVisible: false },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: alpha(c.goldDeep, 0.8), labelBackgroundColor: c.goldDeep },
          horzLine: { color: alpha(c.goldDeep, 0.8), labelBackgroundColor: c.goldDeep },
        },
        localization: {
          priceFormatter: (price: number) => price.toFixed(chart.digits),
        },
        handleScale: { axisPressedMouseMove: { price: false, time: true } },
      });

      // Session bands, behind everything: one full-height column per candle.
      const bandOptions = {
        priceScaleId: 'sessions',
        priceLineVisible: false,
        lastValueVisible: false,
        base: 0,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 1 } }),
      };
      const bands: Array<[keyof Pick<(typeof chart.candles)[number], 'asia' | 'london' | 'newYork'>, string]> = [
        ['asia', alpha(c.slate, 0.16)],
        ['london', alpha(c.gold, 0.07)],
        ['newYork', alpha(c.bronze, 0.1)],
      ];
      for (const [key, color] of bands) {
        const series = api.addSeries(HistogramSeries, { ...bandOptions, color });
        series.setData(
          chart.candles.map((candle) => (candle[key] ? { time: candle.time as never, value: 1 } : { time: candle.time as never })),
        );
      }
      // News releases: a faint amber column at the candle of the release.
      const newsTimes = new Set(chart.news.map((event) => event.time));
      const newsColumn = api.addSeries(HistogramSeries, { ...bandOptions, color: alpha(c.news, 0.32) });
      newsColumn.setData(
        chart.candles.map((candle) =>
          newsTimes.has(candle.time) ? { time: candle.time as never, value: 1 } : { time: candle.time as never },
        ),
      );
      api.priceScale('sessions').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });

      const candles = api.addSeries(CandlestickSeries, {
        upColor: alpha(c.champagne, 0.9),
        downColor: c.slate,
        borderUpColor: c.champagne,
        borderDownColor: alpha(c.text2, 0.55),
        wickUpColor: alpha(c.champagne, 0.8),
        wickDownColor: alpha(c.text2, 0.55),
        priceLineVisible: false,
        lastValueVisible: false,
      });
      candles.setData(
        chart.candles.map((candle) => ({
          time: candle.time as never,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        })),
      );

      const line = (price: number, color: string, title: string, style: number, width: 1 | 2 = 1) =>
        candles.createPriceLine({
          price,
          color,
          title,
          lineStyle: style,
          lineWidth: width,
          axisLabelVisible: true,
          axisLabelColor: color,
          axisLabelTextColor: c.bg,
        });

      line(chart.entry.price, c.gold, 'Entry', LineStyle.Solid, 1);
      line(chart.exit.price, c.champagne, 'Exit', LineStyle.Dashed);
      if (chart.initialSl !== null) line(chart.initialSl, c.text2, 'Initial SL', LineStyle.Solid);
      if (chart.initialTp !== null) line(chart.initialTp, c.bronze, 'TP', LineStyle.Dashed);
      for (const move of chart.slMoves) {
        if (move.price !== null) line(move.price, c.slate, move.label, LineStyle.SparseDotted);
      }
      line(chart.mfe.price, alpha(c.jade, 0.85), chart.mfe.label, LineStyle.Dotted);
      line(chart.mae.price, alpha(c.oxbloodText, 0.85), chart.mae.label, LineStyle.Dotted);

      const buy = chart.direction === 'buy';
      const markers: SeriesMarker<Time>[] = [
        {
          time: chart.entry.time as never,
          position: buy ? 'belowBar' : 'aboveBar',
          shape: buy ? 'arrowUp' : 'arrowDown',
          color: c.gold,
          text: buy ? 'Buy' : 'Sell',
        },
        {
          time: chart.exit.time as never,
          position: buy ? 'aboveBar' : 'belowBar',
          shape: 'circle',
          color: c.champagne,
          text: 'Exit',
        },
        ...chart.slMoves.map((move): SeriesMarker<Time> => ({
          time: move.time as never,
          position: 'aboveBar',
          shape: 'square',
          color: c.text2,
          text: move.price === null ? 'SL removed' : 'SL',
        })),
      ];
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      createSeriesMarkers(candles, markers);

      api.timeScale().fitContent();

      // News labels sit on the time axis, under the chart, and follow it.
      const placeTicks = () => {
        const scale = api.timeScale();
        setTicks(
          chart.news.flatMap((event) => {
            const x = scale.timeToCoordinate(event.time as never);
            return x === null ? [] : [{ x, label: event.label, name: event.name }];
          }),
        );
      };
      placeTicks();
      api.timeScale().subscribeVisibleLogicalRangeChange(placeTicks);
      api.timeScale().subscribeSizeChange(placeTicks);
      setReady(true);

      cleanup = () => {
        api.timeScale().unsubscribeVisibleLogicalRangeChange(placeTicks);
        api.timeScale().unsubscribeSizeChange(placeTicks);
        api.remove();
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [chart]);

  return (
    <figure className="flex flex-col gap-3">
      <div className="relative">
        <div
          ref={containerRef}
          role="group"
          aria-label="Price chart. Described below."
          className="h-[300px] w-full overflow-hidden rounded-xl border border-line bg-surface-1 sm:h-[400px]"
        />
        {!ready ? (
          <span className="assaying pointer-events-none absolute inset-0 flex items-center justify-center text-sm">
            Assaying…
          </span>
        ) : null}
      </div>
      {/* The time axis's own news row: amber ticks where each release printed. */}
      <div className="relative h-5" aria-hidden="true">
        {ticks.map((tick) => (
          <span
            key={`${tick.x}-${tick.label}`}
            title={tick.name}
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: tick.x }}
          >
            <span className="h-1.5 w-px bg-news" />
            <span className="font-mono text-[10px] leading-none text-news">{tick.label}</span>
          </span>
        ))}
      </div>
      <figcaption className="text-xs leading-relaxed text-text-3">{chart.summary}</figcaption>
    </figure>
  );
}
