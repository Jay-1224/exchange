import React, { useMemo, useState } from 'react';
import { Download, FileText, Search } from 'lucide-react';
import { TradeBillModal, type TradeBillData } from '../components/TradeBillModal';
import { useExchange } from '../context/ExchangeContext';
import { downloadCSV, formatINR, formatTimestamp } from '../utils/formatters';

export const TransactionsPage: React.FC = () => {
  const { investorProfile, transactions, navigate } = useExchange();
  const [filterType, setFilterType] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [search, setSearch] = useState('');
  const [selectedBill, setSelectedBill] = useState<TradeBillData | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions
      .filter((t) => (filterType === 'ALL' ? true : t.type === filterType))
      .filter(
        (t) =>
          !q ||
          t.symbol.toLowerCase().includes(q) ||
          t.companyName.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.billNumber || '').toLowerCase().includes(q)
      );
  }, [transactions, filterType, search]);

  const summary = useMemo(() => {
    let grossTurnover = 0;
    let totalBrokerage = 0;
    for (const tx of filtered) {
      grossTurnover += tx.totalAmount;
      totalBrokerage += tx.brokerageAmount ?? 0;
    }
    return {
      grossTurnover: Number(grossTurnover.toFixed(2)),
      totalBrokerage: Number(totalBrokerage.toFixed(2)),
    };
  }, [filtered]);

  if (!investorProfile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
          <h1 className="text-2xl font-bold text-[#0A192F]">Transaction History & Trade Bills</h1>
          <p className="text-sm text-slate-600">
            Sign in with your Investor ID and Access Code to inspect your executed BUY and SELL
            order ledger, brokerage fees, and trade bills.
          </p>
          <button
            onClick={() => navigate('login')}
            className="px-6 py-2.5 bg-[#0A192F] text-white text-sm font-semibold rounded-lg hover:bg-[#13294B] cursor-pointer"
          >
            Investor Login
          </button>
        </div>
      </div>
    );
  }

  const handleExport = () => {
    downloadCSV(
      `NWS_${investorProfile.investorId}_TradeBills.csv`,
      [
        'Bill Number',
        'Transaction ID',
        'Symbol',
        'Company',
        'Type',
        'Product',
        'Quantity',
        'Price (INR)',
        'Gross Amount (INR)',
        'Brokerage (INR)',
        'Net Bill Amount (INR)',
        'Date & Time',
      ],
      filtered.map((t) => {
        const brokerage = t.brokerageAmount ?? 0;
        const net =
          t.netAmount ??
          (t.type === 'BUY' ? t.totalAmount + brokerage : t.totalAmount - brokerage);
        return [
          t.billNumber || `NWS-BILL-${t.id.slice(0, 8).toUpperCase()}`,
          t.id,
          t.symbol,
          t.companyName,
          t.type,
          t.productType ?? 'DELIVERY',
          t.quantity,
          t.price,
          t.totalAmount,
          brokerage,
          net,
          formatTimestamp(t.createdAt),
        ];
      })
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-500 font-mono-num">
            {investorProfile.investorId} · {investorProfile.name}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
            Transaction History & Trade Bills
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('portfolio')}
            className="px-4 py-2 text-xs font-semibold text-[#0A192F] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            Back to Portfolio
          </button>
          {filtered.length > 0 && (
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Bills CSV
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Executed Bills Shown</div>
          <div className="text-xl font-bold text-[#0A192F] font-mono-num mt-0.5">
            {filtered.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Gross Trade Turnover</div>
          <div className="text-xl font-bold text-slate-900 font-mono-num mt-0.5">
            {formatINR(summary.grossTurnover)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Brokerage Paid</div>
          <div className="text-xl font-bold text-[#0A192F] font-mono-num mt-0.5">
            {formatINR(summary.totalBrokerage)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {(['ALL', 'BUY', 'SELL'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                filterType === t
                  ? 'bg-white text-[#0A192F] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol, company, or Bill No..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
          />
        </div>
      </div>

      {/* Ledger & Trade Bills Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3.5 px-4">Bill No.</th>
                <th className="py-3.5 px-4">Company</th>
                <th className="py-3.5 px-4">Type / Mode</th>
                <th className="py-3.5 px-4 text-right">Qty × Price</th>
                <th className="py-3.5 px-4 text-right">Gross Value</th>
                <th className="py-3.5 px-4 text-right">Brokerage</th>
                <th className="py-3.5 px-4 text-right">Net Bill</th>
                <th className="py-3.5 px-4 text-right">Date & Time</th>
                <th className="py-3.5 px-4 text-right">Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No executed transactions recorded yet.
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => {
                  const brokerage = tx.brokerageAmount ?? 0;
                  const product = tx.productType ?? 'DELIVERY';
                  const netBill =
                    tx.netAmount ??
                    (tx.type === 'BUY' ? tx.totalAmount + brokerage : tx.totalAmount - brokerage);
                  const billNo = tx.billNumber || `NWS-BILL-${tx.id.slice(0, 8).toUpperCase()}`;

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 font-mono-num text-xs font-semibold text-[#0A192F] whitespace-nowrap">
                        {billNo}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{tx.companyName}</div>
                        <div className="text-xs font-mono-num text-slate-500">{tx.symbol}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div
                          className={`font-mono-num text-xs font-bold ${
                            tx.type === 'BUY' ? 'text-green-700' : 'text-red-600'
                          }`}
                        >
                          {tx.type}
                        </div>
                        <div className="text-[11px] font-mono-num text-slate-500">{product}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num text-xs text-slate-700 whitespace-nowrap">
                        <span className="font-semibold text-slate-900">{tx.quantity}</span> ×{' '}
                        {formatINR(tx.price)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num text-slate-700 whitespace-nowrap">
                        {formatINR(tx.totalAmount)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num text-slate-700 whitespace-nowrap">
                        {formatINR(brokerage)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num font-semibold text-[#0A192F] whitespace-nowrap">
                        {formatINR(netBill)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-xs text-slate-500 font-mono-num whitespace-nowrap">
                        {formatTimestamp(tx.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedBill(tx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#0A192F] border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          View Bill
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

      <TradeBillModal bill={selectedBill} onClose={() => setSelectedBill(null)} />
    </div>
  );
};
