import React, { useMemo, useState } from 'react';
import { Building2, MapPin, Search } from 'lucide-react';
import { useExchange } from '../context/ExchangeContext';
import { SECTORS } from '../data/seedCompanies';
import { formatINR, formatIndianNumber, formatSignedPct } from '../utils/formatters';

export const CompaniesPage: React.FC = () => {
  const { stocks, navigate } = useExchange();
  const [sector, setSector] = useState<string>('ALL');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stocks
      .filter((s) => s.isActive)
      .filter((s) => (sector === 'ALL' ? true : s.sector === sector))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.symbol.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
  }, [stocks, sector, query]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-500">LISTED ISSUER DIRECTORY</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
            Listed Indian Companies
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Explore company fundamentals, sector classification, listing prices, and live market
            valuations across 9 sectors.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter companies..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
          />
        </div>
      </div>

      {/* Sector Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setSector('ALL')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
            sector === 'ALL'
              ? 'bg-[#0A192F] text-white border-[#0A192F]'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
        >
          All ({stocks.filter((s) => s.isActive).length})
        </button>
        {SECTORS.map((sec) => (
          <button
            key={sec}
            onClick={() => setSector(sec)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              sector === sec
                ? 'bg-[#0A192F] text-white border-[#0A192F]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {sec}
          </button>
        ))}
      </div>

      {/* Company Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((c) => {
          const pos = c.changePct >= 0;
          return (
            <div
              key={c.symbol}
              className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-2">
                  <span className="font-mono-num font-bold text-[#0A192F]">{c.symbol}</span>
                  <span>{c.sector}</span>
                </div>

                <h2 className="text-lg font-bold text-slate-900 leading-snug">{c.name}</h2>

                <div className="flex items-baseline justify-between mt-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="text-xs text-slate-500">Live Price</div>
                    <div className="text-xl font-bold text-[#0A192F] font-mono-num">
                      {formatINR(c.currentPrice)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Session Move</div>
                    <div
                      className={`text-sm font-bold font-mono-num ${
                        pos ? 'text-green-700' : 'text-red-600'
                      }`}
                    >
                      {pos ? '▲ ' : '▼ '}
                      {formatSignedPct(c.changePct)}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-slate-600 mt-4 leading-relaxed">{c.description}</p>

                <div className="mt-4 space-y-1.5 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{c.headquarters}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono-num">
                      Market Cap: ₹{formatIndianNumber(c.marketCapCr, 0)} Cr · Listing:{' '}
                      {formatINR(c.startingPrice)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <button
                  onClick={() => navigate('trading', c.symbol)}
                  className="w-full py-2.5 text-xs font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] transition-colors cursor-pointer"
                >
                  Open Chart & Trade {c.symbol}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
