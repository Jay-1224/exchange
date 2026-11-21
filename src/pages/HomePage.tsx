import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  PauseCircle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { IndexChart, type IndexChartType } from '../components/IndexChart';
import { useExchange } from '../context/ExchangeContext';
import { SECTORS } from '../data/seedCompanies';
import { buildCompositeIndexSeries } from '../services/marketEngine';
import {
  formatCompactVolume,
  formatINR,
  formatIndianNumber,
  formatSignedINR,
  formatSignedPct,
} from '../utils/formatters';

export const HomePage: React.FC = () => {
  const { stocks, settings, navigate, investorProfile } = useExchange();
  const [indexChartType, setIndexChartType] = useState<IndexChartType>('line');

  const activeStocks = useMemo(() => stocks.filter((s) => s.isActive), [stocks]);
  const compositeIndexSeries = useMemo(
    () => buildCompositeIndexSeries(stocks, settings, 36),
    [stocks, settings]
  );

  const indexDelta = Number((settings.indexValue - settings.indexPrevClose).toFixed(2));
  const indexPct =
    settings.indexPrevClose > 0
      ? Number(((indexDelta / settings.indexPrevClose) * 100).toFixed(2))
      : 0;
  const indexPositive = indexDelta >= 0;

  const { topGainers, topLosers, advancers, decliners, totalVolume } = useMemo(() => {
    const sortedDesc = [...activeStocks].sort((a, b) => b.changePct - a.changePct);
    const sortedAsc = [...activeStocks].sort((a, b) => a.changePct - b.changePct);
    const adv = activeStocks.filter((s) => s.change > 0).length;
    const dec = activeStocks.filter((s) => s.change < 0).length;
    const vol = activeStocks.reduce((sum, s) => sum + s.volume, 0);
    return {
      topGainers: sortedDesc.slice(0, 5),
      topLosers: sortedAsc.slice(0, 5),
      advancers: adv,
      decliners: dec,
      totalVolume: vol,
    };
  }, [activeStocks]);

  const sectorHighlights = useMemo(() => {
    return SECTORS.map((sector) => {
      const items = activeStocks.filter((s) => s.sector === sector);
      const avgPct =
        items.length > 0
          ? items.reduce((sum, s) => sum + s.changePct, 0) / items.length
          : 0;
      return { sector, count: items.length, avgPct };
    });
  }, [activeStocks]);

  const statusMeta =
    settings.status === 'OPEN'
      ? { label: 'Market Open', icon: CheckCircle2, color: 'text-green-700' }
      : settings.status === 'PAUSED'
        ? { label: 'Market Paused', icon: PauseCircle, color: 'text-amber-700' }
        : { label: 'Market Closed', icon: Clock, color: 'text-red-700' };

  const StatusIcon = statusMeta.icon;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">
      {/* Hero Section: Brand Proposition + NWS 20 Composite Index Anchor */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-5 flex flex-col justify-between bg-[#0A192F] text-white rounded-xl p-6 sm:p-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300 mb-4">
              <span>NWS STOCK EXCHANGE</span>
              <span aria-hidden="true">·</span>
              <span className={`inline-flex items-center gap-1.5 font-semibold ${
                settings.status === 'OPEN'
                  ? 'text-green-400'
                  : settings.status === 'PAUSED'
                    ? 'text-amber-300'
                    : 'text-red-400'
              }`}>
                <StatusIcon className="w-3.5 h-3.5" />
                {statusMeta.label}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight [text-wrap:balance]">
              The Future of Trading.
            </h1>
            <p className="text-sm sm:text-base text-slate-300 mt-4 leading-relaxed">
              Track 20 leading Indian companies across 9 core sectors, monitor the NWS 20 Composite
              Index in real time, analyze line & candlestick charts, and execute equity orders seamlessly.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800 flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate(investorProfile ? 'trading' : 'login')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-[#0A192F] text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
            >
              {investorProfile ? 'Open Trading Desk' : 'Investor Login'}
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate('market')}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-700 text-slate-200 text-sm font-medium rounded-lg hover:bg-slate-800/70 transition-colors whitespace-nowrap cursor-pointer"
            >
              Explore Live Market
            </button>
          </div>
        </div>

        {/* NWS 20 COMPOSITE INDEX Live Chart Panel */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-7 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 mb-4 border-b border-slate-100">
            <div>
              <div className="text-xs font-semibold text-slate-500 tracking-wide">
                NWS 20 COMPOSITE INDEX · BENCHMARK
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-3xl sm:text-4xl font-bold text-[#0A192F] font-mono-num">
                  {formatIndianNumber(settings.indexValue, 2)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-sm font-semibold font-mono-num ${
                    indexPositive ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {indexPositive ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  {indexDelta >= 0 ? '+' : ''}
                  {formatIndianNumber(indexDelta, 2)} ({formatSignedPct(indexPct)})
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-5 text-xs text-slate-500 font-mono-num">
              <div>
                <div>Prev Close</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {formatIndianNumber(settings.indexPrevClose, 2)}
                </div>
              </div>
              <div>
                <div>Trend</div>
                <div
                  className={`font-semibold mt-0.5 ${
                    indexDelta > 0
                      ? 'text-green-700'
                      : indexDelta < 0
                        ? 'text-red-600'
                        : 'text-slate-700'
                  }`}
                >
                  {indexDelta > 0 ? 'Bullish' : indexDelta < 0 ? 'Bearish' : 'Neutral'}
                </div>
              </div>
              <div
                role="group"
                aria-label="NWS 20 Chart Type"
                className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg font-sans"
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
                    onClick={() => setIndexChartType(opt.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      indexChartType === opt.id
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

          <IndexChart
            data={compositeIndexSeries}
            prevClose={settings.indexPrevClose}
            currentValue={settings.indexValue}
            chartType={indexChartType}
          />
        </div>
      </section>

      {/* Market Overview Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Listed Equities</div>
          <div className="text-2xl font-bold text-[#0A192F] font-mono-num mt-1">
            {activeStocks.length} Companies
          </div>
          <div className="text-xs text-slate-500 mt-1">9 Indian Market Sectors</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Exchange Volume</div>
          <div className="text-2xl font-bold text-[#0A192F] font-mono-num mt-1">
            {formatCompactVolume(totalVolume)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Cumulative Shares Traded</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Market Breadth</div>
          <div className="text-2xl font-bold font-mono-num mt-1">
            <span className="text-green-700">{advancers} Adv</span>
            <span className="text-slate-300 mx-1.5">/</span>
            <span className="text-red-600">{decliners} Dec</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {activeStocks.length - advancers - decliners} Unchanged
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Session Status</div>
          <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${statusMeta.color}`}>
            <StatusIcon className="w-5 h-5" />
            <span>{settings.status}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Tick Interval: {Math.max(30, settings.updateIntervalSec || 45)}s
          </div>
        </div>
      </section>

      {/* Market Highlight Bulletin */}
      {settings.activeNews && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-[#0A192F]">Market Highlight</span>
              <span aria-hidden="true">·</span>
              <span>{settings.activeNews.targetSymbol}</span>
              <span aria-hidden="true">·</span>
              <span>{settings.activeNews.sector}</span>
              <span aria-hidden="true">·</span>
              <span>{settings.activeNews.timestampLabel}</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {settings.activeNews.headline}
            </h2>
            <p className="text-sm text-slate-600">{settings.activeNews.summary}</p>
          </div>
          <button
            onClick={() => navigate('trading', settings.activeNews?.targetSymbol)}
            className="shrink-0 px-4 py-2 text-xs font-semibold text-[#0A192F] border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            Inspect {settings.activeNews.targetSymbol} Chart
          </button>
        </section>
      )}

      {/* Top Gainers & Top Losers */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Gainers */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#0A192F] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-700" />
              Top Gainers
            </h2>
            <button
              onClick={() => navigate('market')}
              className="text-xs font-medium text-[#0A192F] hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {topGainers.map((stock) => (
              <button
                key={stock.symbol}
                onClick={() => navigate('trading', stock.symbol)}
                className="w-full px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors text-left cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{stock.name}</div>
                  <div className="text-xs text-slate-500">
                    {stock.symbol} · {stock.sector}
                  </div>
                </div>
                <div className="text-right shrink-0 font-mono-num">
                  <div className="text-sm font-semibold text-slate-900">
                    {formatINR(stock.currentPrice)}
                  </div>
                  <div
                    className={`text-xs font-semibold inline-flex items-center gap-0.5 ${
                      stock.changePct >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {stock.changePct >= 0 ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {formatSignedPct(stock.changePct)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Top Losers */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#0A192F] flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-600" />
              Top Losers
            </h2>
            <button
              onClick={() => navigate('market')}
              className="text-xs font-medium text-[#0A192F] hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {topLosers.map((stock) => (
              <button
                key={stock.symbol}
                onClick={() => navigate('trading', stock.symbol)}
                className="w-full px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors text-left cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{stock.name}</div>
                  <div className="text-xs text-slate-500">
                    {stock.symbol} · {stock.sector}
                  </div>
                </div>
                <div className="text-right shrink-0 font-mono-num">
                  <div className="text-sm font-semibold text-slate-900">
                    {formatINR(stock.currentPrice)}
                  </div>
                  <div
                    className={`text-xs font-semibold inline-flex items-center gap-0.5 ${
                      stock.changePct >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {stock.changePct >= 0 ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {formatSignedPct(stock.changePct)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Sector Performance Highlights */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-[#0A192F]">Sector Performance Overview</h2>
            <p className="text-xs text-slate-500">
              Average intraday movement across all 9 benchmark Indian equity sectors
            </p>
          </div>
          <button
            onClick={() => navigate('companies')}
            className="text-xs font-semibold text-[#0A192F] hover:underline self-start sm:self-auto cursor-pointer"
          >
            Browse All {activeStocks.length} Companies
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sectorHighlights.map((sec) => {
            const pos = sec.avgPct >= 0;
            return (
              <div
                key={sec.sector}
                className="flex items-center justify-between p-4 rounded-lg border border-slate-200 bg-slate-50/50"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">{sec.sector}</div>
                  <div className="text-xs text-slate-500">{sec.count} Listed Stocks</div>
                </div>
                <div
                  className={`text-sm font-bold font-mono-num ${
                    pos ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {formatSignedPct(sec.avgPct)}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
