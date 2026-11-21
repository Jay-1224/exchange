import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { useExchange } from '../context/ExchangeContext';
import { SECTORS } from '../data/seedCompanies';
import {
  formatCompactVolume,
  formatINR,
  formatSignedINR,
  formatSignedPct,
} from '../utils/formatters';

type SortKey = 'name' | 'symbol' | 'currentPrice' | 'previousClose' | 'change' | 'changePct' | 'volume';

export const LiveMarketPage: React.FC = () => {
  const { stocks, settings, navigate } = useExchange();
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('symbol');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(key === 'name' || key === 'symbol');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stocks
      .filter((s) => s.isActive)
      .filter((s) => (sectorFilter === 'ALL' ? true : s.sector === sectorFilter))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.symbol.toLowerCase().includes(q) ||
          s.sector.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === 'string' && typeof bv === 'string') {
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
      });
  }, [stocks, search, sectorFilter, sortKey, sortAsc]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />;
    return sortAsc ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#0A192F]" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#0A192F]" />
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-500">
            NWS STOCK EXCHANGE · {settings.status}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
            Live Equity Market
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Real-time quotes, daily price changes, and trading volume across listed companies.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, symbol, or sector..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
          />
        </div>
      </div>

      {/* Sector Filter Controls */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setSectorFilter('ALL')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
            sectorFilter === 'ALL'
              ? 'bg-[#0A192F] text-white border-[#0A192F]'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
        >
          All Sectors ({stocks.filter((s) => s.isActive).length})
        </button>
        {SECTORS.map((sec) => (
          <button
            key={sec}
            onClick={() => setSectorFilter(sec)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              sectorFilter === sec
                ? 'bg-[#0A192F] text-white border-[#0A192F]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {sec}
          </button>
        ))}
      </div>

      {/* High-Density Financial Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3.5 px-4">
                  <button
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-1.5 hover:text-[#0A192F] cursor-pointer"
                  >
                    Company <SortIcon col="name" />
                  </button>
                </th>
                <th className="py-3.5 px-4">
                  <button
                    onClick={() => toggleSort('symbol')}
                    className="inline-flex items-center gap-1.5 hover:text-[#0A192F] cursor-pointer"
                  >
                    Symbol <SortIcon col="symbol" />
                  </button>
                </th>
                <th className="py-3.5 px-4 text-right">
                  <button
                    onClick={() => toggleSort('currentPrice')}
                    className="inline-flex items-center gap-1.5 hover:text-[#0A192F] cursor-pointer"
                  >
                    Current Price <SortIcon col="currentPrice" />
                  </button>
                </th>
                <th className="py-3.5 px-4 text-right">
                  <button
                    onClick={() => toggleSort('previousClose')}
                    className="inline-flex items-center gap-1.5 hover:text-[#0A192F] cursor-pointer"
                  >
                    Prev Close <SortIcon col="previousClose" />
                  </button>
                </th>
                <th className="py-3.5 px-4 text-right">
                  <button
                    onClick={() => toggleSort('change')}
                    className="inline-flex items-center gap-1.5 hover:text-[#0A192F] cursor-pointer"
                  >
                    Change (₹) <SortIcon col="change" />
                  </button>
                </th>
                <th className="py-3.5 px-4 text-right">
                  <button
                    onClick={() => toggleSort('changePct')}
                    className="inline-flex items-center gap-1.5 hover:text-[#0A192F] cursor-pointer"
                  >
                    Change (%) <SortIcon col="changePct" />
                  </button>
                </th>
                <th className="py-3.5 px-4 text-right">
                  <button
                    onClick={() => toggleSort('volume')}
                    className="inline-flex items-center gap-1.5 hover:text-[#0A192F] cursor-pointer"
                  >
                    Volume <SortIcon col="volume" />
                  </button>
                </th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No listed companies match your search criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((stock) => {
                  const pos = stock.change >= 0;
                  return (
                    <tr key={stock.symbol} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{stock.name}</div>
                        <div className="text-xs text-slate-500">{stock.sector}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono-num font-bold text-[#0A192F]">
                        {stock.symbol}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num font-semibold text-slate-900">
                        {formatINR(stock.currentPrice)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num text-slate-600">
                        {formatINR(stock.previousClose)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono-num font-semibold ${
                          pos ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        {formatSignedINR(stock.change)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono-num font-semibold ${
                          pos ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        {pos ? '▲ ' : '▼ '}
                        {formatSignedPct(stock.changePct)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num text-slate-700">
                        {formatCompactVolume(stock.volume)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => navigate('trading', stock.symbol)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0A192F] rounded-md hover:bg-[#13294B] transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Trade
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
