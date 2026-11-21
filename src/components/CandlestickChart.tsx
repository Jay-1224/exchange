import React, { useId, useMemo, useState } from 'react';
import type { CandlePoint } from '../types/exchange';
import { formatCompactVolume, formatINR } from '../utils/formatters';

export type ChartDisplayType = 'line' | 'candlestick';

interface CandlestickChartProps {
  symbol: string;
  candles: CandlePoint[];
  previousClose: number;
  currentPrice: number;
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  symbol,
  candles,
  previousClose,
  currentPrice,
}) => {
  const [chartType, setChartType] = useState<ChartDisplayType>('line');
  const [windowSize, setWindowSize] = useState<number>(24);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const rawGradId = useId();
  const areaGradId = `stockLineGrad-${rawGradId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const visibleCandles = useMemo(() => {
    if (!candles || candles.length === 0) return [];
    return windowSize === 0 ? candles : candles.slice(-windowSize);
  }, [candles, windowSize]);

  const chartWidth = 760;
  const chartHeight = 320;
  const padTop = 20;
  const padBottom = 64; // leaves space for volume bars + time labels
  const padLeft = 14;
  const padRight = 76;
  const pricePlotHeight = chartHeight - padTop - padBottom;
  const volPlotTop = chartHeight - padBottom + 10;
  const volPlotHeight = 32;

  const stats = useMemo(() => {
    if (visibleCandles.length === 0) {
      return {
        minPrice: currentPrice * 0.98,
        maxPrice: currentPrice * 1.02,
        maxVol: 1,
      };
    }
    const lows =
      chartType === 'line'
        ? visibleCandles.map((c) => c.close)
        : visibleCandles.map((c) => c.low);
    const highs =
      chartType === 'line'
        ? visibleCandles.map((c) => c.close)
        : visibleCandles.map((c) => c.high);
    const minVal = Math.min(...lows, previousClose);
    const maxVal = Math.max(...highs, previousClose);
    const span = Math.max(1, maxVal - minVal);
    return {
      minPrice: minVal - span * 0.12,
      maxPrice: maxVal + span * 0.12,
      maxVol: Math.max(...visibleCandles.map((c) => c.volume), 1),
    };
  }, [visibleCandles, previousClose, currentPrice, chartType]);

  const priceToY = (p: number) => {
    const ratio = (p - stats.minPrice) / Math.max(0.01, stats.maxPrice - stats.minPrice);
    return padTop + pricePlotHeight * (1 - ratio);
  };

  const plotWidth = chartWidth - padLeft - padRight;
  const stepX = visibleCandles.length > 0 ? plotWidth / visibleCandles.length : plotWidth;
  const candleBodyWidth = Math.max(4, Math.min(18, stepX * 0.62));

  const gridLevels = useMemo(() => {
    const count = 4;
    const arr: number[] = [];
    for (let i = 0; i <= count; i++) {
      arr.push(stats.minPrice + ((stats.maxPrice - stats.minPrice) * i) / count);
    }
    return arr;
  }, [stats]);

  const activeCandle =
    hoveredIdx !== null && visibleCandles[hoveredIdx]
      ? visibleCandles[hoveredIdx]
      : visibleCandles[visibleCandles.length - 1];

  const prevCloseY = priceToY(previousClose);
  const lastClose =
    visibleCandles.length > 0 ? visibleCandles[visibleCandles.length - 1].close : currentPrice;
  const isSessionPositive = lastClose >= previousClose;
  const lineColor = isSessionPositive ? '#15803d' : '#dc2626';

  const { linePath, areaPath, lineCoords } = useMemo(() => {
    if (visibleCandles.length === 0) {
      return { linePath: '', areaPath: '', lineCoords: [] as Array<{ x: number; y: number }> };
    }
    const coords = visibleCandles.map((c, idx) => {
      const x = padLeft + idx * stepX + stepX / 2;
      const ratio = (c.close - stats.minPrice) / Math.max(0.01, stats.maxPrice - stats.minPrice);
      const y = padTop + pricePlotHeight * (1 - ratio);
      return { x, y };
    });
    const dLine = coords
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
      .join(' ');
    const baselineY = padTop + pricePlotHeight;
    const dArea =
      coords.length >= 2
        ? `${dLine} L ${coords[coords.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)} L ${coords[0].x.toFixed(2)} ${baselineY.toFixed(2)} Z`
        : '';
    return { linePath: dLine, areaPath: dArea, lineCoords: coords };
  }, [visibleCandles, stepX, stats.minPrice, stats.maxPrice, pricePlotHeight]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-100">
        <div>
          <div className="text-xs font-medium text-slate-500">
            {symbol} · {chartType === 'line' ? 'Price Line & Volume' : 'OHLC Candlestick & Volume'}
          </div>
          {activeCandle ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs font-mono-num">
              <span className="text-slate-600">
                O <strong className="text-slate-900">{formatINR(activeCandle.open)}</strong>
              </span>
              <span className="text-slate-600">
                H <strong className="text-green-700">{formatINR(activeCandle.high)}</strong>
              </span>
              <span className="text-slate-600">
                L <strong className="text-red-600">{formatINR(activeCandle.low)}</strong>
              </span>
              <span className="text-slate-600">
                C{' '}
                <strong
                  className={
                    activeCandle.close >= activeCandle.open ? 'text-green-700' : 'text-red-600'
                  }
                >
                  {formatINR(activeCandle.close)}
                </strong>
              </span>
              <span className="text-slate-500">
                Vol <strong className="text-slate-800">{formatCompactVolume(activeCandle.volume)}</strong>
              </span>
            </div>
          ) : (
            <div className="text-xs text-slate-500 mt-1">Awaiting market ticks...</div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          {/* Line vs Candlestick Segmented Switch (Line by default) */}
          <div
            role="group"
            aria-label="Chart Type"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {(
              [
                { id: 'line', label: 'Line' },
                { id: 'candlestick', label: 'Candlestick' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setChartType(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  chartType === opt.id
                    ? 'bg-white text-[#0A192F] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Tick Window Segmented Switch */}
          <div
            role="group"
            aria-label="Tick Window"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {[
              { label: '12T', count: 12 },
              { label: '24T', count: 24 },
              { label: 'All', count: 0 },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setWindowSize(opt.count)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  windowSize === opt.count
                    ? 'bg-white text-[#0A192F] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto select-none"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={lineColor} stopOpacity={0.2} />
              <stop offset="95%" stopColor={lineColor} stopOpacity={0.01} />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {gridLevels.map((lvl, idx) => {
            const y = priceToY(lvl);
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={chartWidth - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <text
                  x={chartWidth - padRight + 8}
                  y={y + 4}
                  fontSize="11"
                  fill="#64748b"
                  fontFamily="JetBrains Mono, monospace"
                >
                  ₹{lvl.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Previous Close reference line */}
          {prevCloseY >= padTop && prevCloseY <= padTop + pricePlotHeight && (
            <line
              x1={padLeft}
              y1={prevCloseY}
              x2={chartWidth - padRight}
              y2={prevCloseY}
              stroke="#0f2544"
              strokeOpacity={0.35}
              strokeDasharray="5 4"
              strokeWidth={1.2}
            />
          )}

          {/* Line Graph Mode */}
          {chartType === 'line' && (
            <>
              {areaPath && <path d={areaPath} fill={`url(#${areaGradId})`} />}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {lineCoords.length === 1 && (
                <circle
                  cx={lineCoords[0].x}
                  cy={lineCoords[0].y}
                  r={4.5}
                  fill={lineColor}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}
            </>
          )}

          {/* Hover targets, Candlesticks (when selected), Crosshairs, Volume & Time Ticks */}
          {visibleCandles.map((c, idx) => {
            const centerX = padLeft + idx * stepX + stepX / 2;
            const isBull = c.close >= c.open;
            const color = isBull ? '#15803d' : '#dc2626';
            const fill = isBull ? '#16a34a' : '#dc2626';
            const yHigh = priceToY(c.high);
            const yLow = priceToY(c.low);
            const yOpen = priceToY(c.open);
            const yClose = priceToY(c.close);
            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(2.5, Math.abs(yOpen - yClose));

            const volH = Math.max(2, (c.volume / stats.maxVol) * volPlotHeight);
            const volY = volPlotTop + (volPlotHeight - volH);
            const isHovered = hoveredIdx === idx;

            return (
              <g
                key={`${c.t}-${idx}`}
                onMouseEnter={() => setHoveredIdx(idx)}
                className="cursor-crosshair"
              >
                {/* Full-column transparent hover capture */}
                <rect
                  x={padLeft + idx * stepX}
                  y={padTop}
                  width={stepX}
                  height={chartHeight - padTop - 18}
                  fill={isHovered ? '#0f2544' : 'transparent'}
                  fillOpacity={isHovered ? 0.04 : 0}
                />

                {chartType === 'line' ? (
                  <>
                    {isHovered && (
                      <>
                        <line
                          x1={centerX}
                          y1={padTop}
                          x2={centerX}
                          y2={padTop + pricePlotHeight}
                          stroke="#0A192F"
                          strokeOpacity={0.28}
                          strokeDasharray="3 3"
                          strokeWidth={1}
                        />
                        <circle
                          cx={centerX}
                          cy={yClose}
                          r={4.5}
                          fill={lineColor}
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {/* Wick */}
                    <line
                      x1={centerX}
                      y1={yHigh}
                      x2={centerX}
                      y2={yLow}
                      stroke={color}
                      strokeWidth={1.5}
                    />
                    {/* Body */}
                    <rect
                      x={centerX - candleBodyWidth / 2}
                      y={bodyTop}
                      width={candleBodyWidth}
                      height={bodyHeight}
                      fill={fill}
                      rx={1}
                    />
                  </>
                )}

                {/* Volume Bar */}
                <rect
                  x={centerX - candleBodyWidth / 2}
                  y={volY}
                  width={candleBodyWidth}
                  height={volH}
                  fill={fill}
                  fillOpacity={0.28}
                  rx={1}
                />

                {/* Sparse time ticks */}
                {(idx === 0 ||
                  idx === visibleCandles.length - 1 ||
                  idx % Math.max(1, Math.floor(visibleCandles.length / 5)) === 0) && (
                  <text
                    x={centerX}
                    y={chartHeight - 4}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#64748b"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {c.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
