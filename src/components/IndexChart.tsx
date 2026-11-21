import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { IndexPoint } from '../types/exchange';
import { formatIndianNumber, formatSignedPct } from '../utils/formatters';

export type IndexChartType = 'line' | 'candlestick';

interface IndexOhlcCandle {
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface IndexChartProps {
  data: IndexPoint[];
  prevClose: number;
  currentValue: number;
  chartType?: IndexChartType;
  onChartTypeChange?: (next: IndexChartType) => void;
  showInternalToggle?: boolean;
  className?: string;
}

export const IndexChart: React.FC<IndexChartProps> = ({
  data,
  prevClose,
  currentValue,
  chartType,
  onChartTypeChange,
  showInternalToggle = false,
  className = 'w-full h-60 sm:h-72',
}) => {
  const [internalChartType, setInternalChartType] = useState<IndexChartType>('line');
  const activeType = chartType ?? internalChartType;
  const handleSelectType = (next: IndexChartType) => {
    if (onChartTypeChange) onChartTypeChange(next);
    else setInternalChartType(next);
  };

  const rawId = useId();
  const safeGradId = `nwsIdxGrad-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number }>({
    width: 640,
    height: 260,
  });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) {
        setDims({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeType]);

  const isPositive = currentValue >= prevClose;
  const strokeColor = isPositive ? '#15803d' : '#dc2626';

  const safeData = useMemo<IndexPoint[]>(() => {
    if (data && data.length >= 2) return data;
    if (data && data.length === 1) {
      return [{ label: 'Prev', value: prevClose }, data[0]];
    }
    return [
      { label: 'Open', value: prevClose },
      { label: 'Live', value: currentValue },
    ];
  }, [data, prevClose, currentValue]);

  const ohlcCandles = useMemo<IndexOhlcCandle[]>(() => {
    return safeData.map((pt, idx) => {
      const open = idx === 0 ? prevClose : safeData[idx - 1].value;
      const close = pt.value;
      const bodyMax = Math.max(open, close);
      const bodyMin = Math.min(open, close);
      const move = Math.abs(close - open);
      const wickPad = Math.max(pt.value * 0.00045, move * 0.3);
      return {
        label: pt.label,
        open: Number(open.toFixed(2)),
        high: Number((bodyMax + wickPad).toFixed(2)),
        low: Number((bodyMin - wickPad).toFixed(2)),
        close: Number(close.toFixed(2)),
      };
    });
  }, [safeData, prevClose]);

  const padLeft = 62;
  const padRight = 14;
  const padTop = 12;
  const padBottom = 26;
  const plotW = Math.max(80, dims.width - padLeft - padRight);
  const plotH = Math.max(60, dims.height - padTop - padBottom);

  const candleBounds = useMemo(() => {
    const lows = ohlcCandles.map((c) => c.low);
    const highs = ohlcCandles.map((c) => c.high);
    const minRaw = Math.min(...lows, prevClose);
    const maxRaw = Math.max(...highs, prevClose);
    const span = Math.max(10, maxRaw - minRaw);
    return {
      min: minRaw - span * 0.1,
      max: maxRaw + span * 0.1,
    };
  }, [ohlcCandles, prevClose]);

  const priceToY = (v: number) => {
    const ratio = (v - candleBounds.min) / Math.max(0.01, candleBounds.max - candleBounds.min);
    return padTop + plotH * (1 - ratio);
  };

  const yGridTicks = useMemo(() => {
    const count = 4;
    const out: number[] = [];
    for (let i = 0; i <= count; i++) {
      out.push(candleBounds.min + ((candleBounds.max - candleBounds.min) * i) / count);
    }
    return out;
  }, [candleBounds]);

  const stepX = ohlcCandles.length > 0 ? plotW / ohlcCandles.length : plotW;
  const bodyW = Math.max(4, Math.min(18, stepX * 0.58));
  const prevCloseY = priceToY(prevClose);
  const hoveredCandle =
    hoveredIdx !== null && ohlcCandles[hoveredIdx] ? ohlcCandles[hoveredIdx] : null;

  return (
    <div className={`flex flex-col ${className}`}>
      {showInternalToggle && (
        <div className="flex justify-end mb-2 shrink-0">
          <div
            role="group"
            aria-label="Index Chart Type"
            className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg"
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
                onClick={() => handleSelectType(opt.id)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeType === opt.id
                    ? 'bg-white text-[#0A192F] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={containerRef} className="w-full flex-1 min-h-[210px] relative">
        {activeType === 'line' ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={210}>
            <AreaChart data={safeData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={safeGradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                minTickGap={28}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={62}
                tickFormatter={(v: number) => formatIndianNumber(v, 0)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#cbd5e1',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono, monospace',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                }}
                formatter={(value: unknown) => {
                  const num = Number(value);
                  const pct = prevClose > 0 ? ((num - prevClose) / prevClose) * 100 : 0;
                  return [
                    `${formatIndianNumber(num, 2)} (${formatSignedPct(pct)})`,
                    'NWS 20 Composite Index',
                  ];
                }}
              />
              <ReferenceLine
                y={prevClose}
                stroke="#0A192F"
                strokeDasharray="4 4"
                strokeOpacity={0.4}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={strokeColor}
                strokeWidth={2.2}
                fill={`url(#${safeGradId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <>
            <svg
              width={dims.width}
              height={dims.height}
              className="block w-full h-full select-none"
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Horizontal Gridlines & Left Y-Axis Index Levels */}
              {yGridTicks.map((tick, idx) => {
                const y = priceToY(tick);
                return (
                  <g key={idx}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={dims.width - padRight}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="3 3"
                      strokeWidth={1}
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10.5"
                      fill="#64748b"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {formatIndianNumber(tick, 0)}
                    </text>
                  </g>
                );
              })}

              {/* X-Axis baseline */}
              <line
                x1={padLeft}
                y1={padTop + plotH}
                x2={dims.width - padRight}
                y2={padTop + plotH}
                stroke="#cbd5e1"
                strokeWidth={1}
              />

              {/* Previous Close reference line */}
              {prevCloseY >= padTop && prevCloseY <= padTop + plotH && (
                <line
                  x1={padLeft}
                  y1={prevCloseY}
                  x2={dims.width - padRight}
                  y2={prevCloseY}
                  stroke="#0A192F"
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                  strokeWidth={1.2}
                />
              )}

              {/* OHLC Candles */}
              {ohlcCandles.map((c, idx) => {
                const centerX = padLeft + idx * stepX + stepX / 2;
                const isBull = c.close >= c.open;
                const wickColor = isBull ? '#15803d' : '#dc2626';
                const bodyColor = isBull ? '#16a34a' : '#dc2626';
                const yHigh = priceToY(c.high);
                const yLow = priceToY(c.low);
                const yOpen = priceToY(c.open);
                const yClose = priceToY(c.close);
                const bodyTop = Math.min(yOpen, yClose);
                const bodyHeight = Math.max(2.5, Math.abs(yOpen - yClose));
                const isHovered = hoveredIdx === idx;

                const labelStep = Math.max(1, Math.floor(ohlcCandles.length / 5));
                const showLabel =
                  idx === 0 || idx === ohlcCandles.length - 1 || idx % labelStep === 0;

                return (
                  <g
                    key={`${c.label}-${idx}`}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    className="cursor-crosshair"
                  >
                    <rect
                      x={padLeft + idx * stepX}
                      y={padTop}
                      width={stepX}
                      height={plotH}
                      fill={isHovered ? '#0A192F' : 'transparent'}
                      fillOpacity={isHovered ? 0.04 : 0}
                    />
                    {isHovered && (
                      <line
                        x1={centerX}
                        y1={padTop}
                        x2={centerX}
                        y2={padTop + plotH}
                        stroke="#0A192F"
                        strokeOpacity={0.25}
                        strokeDasharray="3 3"
                        strokeWidth={1}
                      />
                    )}
                    <line
                      x1={centerX}
                      y1={yHigh}
                      x2={centerX}
                      y2={yLow}
                      stroke={wickColor}
                      strokeWidth={1.5}
                    />
                    <rect
                      x={centerX - bodyW / 2}
                      y={bodyTop}
                      width={bodyW}
                      height={bodyHeight}
                      fill={bodyColor}
                      rx={1}
                    />
                    {showLabel && (
                      <text
                        x={centerX}
                        y={dims.height - 6}
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

            {/* Floating Hover OHLC Tooltip */}
            {hoveredCandle && hoveredIdx !== null && (
              <div
                className="pointer-events-none absolute top-2 bg-white/95 border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-sm text-[11px] font-mono-num text-[#0A192F] z-10"
                style={{
                  left:
                    hoveredIdx > ohlcCandles.length / 2
                      ? `${Math.max(padLeft + 8, 70)}px`
                      : undefined,
                  right: hoveredIdx <= ohlcCandles.length / 2 ? '18px' : undefined,
                }}
              >
                <div className="font-bold text-[#0A192F] mb-0.5">
                  NWS 20 · {hoveredCandle.label}
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-slate-500">
                    O <strong className="text-slate-900">{formatIndianNumber(hoveredCandle.open, 2)}</strong>
                  </span>
                  <span className="text-slate-500">
                    H <strong className="text-green-700">{formatIndianNumber(hoveredCandle.high, 2)}</strong>
                  </span>
                  <span className="text-slate-500">
                    L <strong className="text-red-600">{formatIndianNumber(hoveredCandle.low, 2)}</strong>
                  </span>
                  <span className="text-slate-500">
                    C{' '}
                    <strong
                      className={
                        hoveredCandle.close >= hoveredCandle.open
                          ? 'text-green-700'
                          : 'text-red-600'
                      }
                    >
                      {formatIndianNumber(hoveredCandle.close, 2)}
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
