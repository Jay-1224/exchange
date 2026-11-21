import React, { useMemo } from 'react';
import { LogOut, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import { useExchange } from '../context/ExchangeContext';
import {
  formatINR,
  formatSignedINR,
  formatSignedPct,
} from '../utils/formatters';

export const PortfolioPage: React.FC = () => {
  const { investorProfile, holdings, prices, transactions, navigate, logout } = useExchange();

  const portfolioStats = useMemo(() => {
    let totalInvested = 0;
    let currentValue = 0;

    const brokerageBySymbol: Record<string, number> = {};
    let totalBrokeragePaid = 0;
    let intradayOrders = 0;
    let deliveryOrders = 0;

    for (const tx of transactions) {
      const fee = tx.brokerageAmount ?? 0;
      totalBrokeragePaid += fee;
      brokerageBySymbol[tx.symbol] = Number(((brokerageBySymbol[tx.symbol] ?? 0) + fee).toFixed(2));
      if ((tx.productType ?? 'DELIVERY') === 'INTRADAY') intradayOrders += 1;
      else deliveryOrders += 1;
    }

    const rows = holdings.map((h) => {
      const livePrice = prices[h.symbol]?.currentPrice ?? h.averageBuyPrice;
      const invested = h.quantity * h.averageBuyPrice;
      const marketVal = h.quantity * livePrice;
      const pnl = marketVal - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      const brokeragePaid = brokerageBySymbol[h.symbol] ?? 0;

      totalInvested += invested;
      currentValue += marketVal;

      return {
        ...h,
        livePrice,
        invested,
        marketVal,
        pnl,
        pnlPct,
        brokeragePaid,
      };
    });

    const totalPnl = currentValue - totalInvested;
    const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
    const netPnlAfterBrokerage = totalPnl - totalBrokeragePaid;
    const netWorth = (investorProfile?.balance ?? 0) + currentValue;
    const brokerageDue =
      investorProfile && investorProfile.balance < 0
        ? Number(Math.abs(investorProfile.balance).toFixed(2))
        : 0;

    return {
      rows,
      totalInvested,
      currentValue,
      totalPnl,
      totalPnlPct,
      totalBrokeragePaid: Number(totalBrokeragePaid.toFixed(2)),
      intradayOrders,
      deliveryOrders,
      netPnlAfterBrokerage,
      netWorth,
      brokerageDue,
    };
  }, [holdings, prices, transactions, investorProfile]);

  if (!investorProfile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
          <h1 className="text-2xl font-bold text-[#0A192F]">My Portfolio</h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Sign in using your Investor Name, Investor ID, and Access Code to view your cash
            balance, owned shares, and real-time profit and loss.
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

  const pnlPos = portfolioStats.totalPnl >= 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Investor Profile Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-500 font-mono-num">
            INVESTOR ID: {investorProfile.investorId}
          </div>
          <h1 className="text-2xl font-bold text-[#0A192F] mt-0.5">{investorProfile.name}</h1>
          <div className="text-xs text-slate-500 mt-1 font-mono-num">
            Initial Allocation: {formatINR(investorProfile.initialBalance)} · Net Account Value:{' '}
            <strong className="text-slate-900">{formatINR(portfolioStats.netWorth)}</strong>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => navigate('transactions')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0A192F] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <Receipt className="w-4 h-4" />
            Transaction History
          </button>
          <button
            onClick={() => navigate('trading')}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] cursor-pointer"
          >
            Trade Stocks
          </button>
          <button
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Portfolio Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div
          className={`rounded-xl p-5 border ${
            portfolioStats.brokerageDue > 0
              ? 'bg-red-50/70 border-red-200'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="text-xs font-medium text-slate-500">Available Balance</div>
          <div
            className={`text-2xl font-bold font-mono-num mt-1 ${
              investorProfile.balance < 0 ? 'text-red-600' : 'text-[#0A192F]'
            }`}
          >
            {formatINR(investorProfile.balance)}
          </div>
          {portfolioStats.brokerageDue > 0 && (
            <div className="text-[11px] font-semibold text-red-700 mt-1 font-mono-num">
              Brokerage Due: {formatINR(portfolioStats.brokerageDue)}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Total Investment</div>
          <div className="text-2xl font-bold text-slate-900 font-mono-num mt-1">
            {formatINR(portfolioStats.totalInvested)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Current Portfolio Value</div>
          <div className="text-2xl font-bold text-[#0A192F] font-mono-num mt-1">
            {formatINR(portfolioStats.currentValue)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Brokerage Paid</div>
          <div className="text-2xl font-bold text-slate-900 font-mono-num mt-1">
            {formatINR(portfolioStats.totalBrokeragePaid)}
          </div>
          <div className="text-[11px] text-slate-500 font-mono-num mt-1">
            {portfolioStats.intradayOrders} Intraday · {portfolioStats.deliveryOrders} Delivery
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Total Profit / Loss</div>
          <div
            className={`text-2xl font-bold font-mono-num mt-1 flex items-center gap-1.5 ${
              pnlPos ? 'text-green-700' : 'text-red-600'
            }`}
          >
            {pnlPos ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            <span>{formatSignedINR(portfolioStats.totalPnl)}</span>
          </div>
          <div
            className={`text-xs font-semibold font-mono-num mt-0.5 ${
              pnlPos ? 'text-green-700' : 'text-red-600'
            }`}
          >
            {formatSignedPct(portfolioStats.totalPnlPct)} · Net:{' '}
            {formatSignedINR(portfolioStats.netPnlAfterBrokerage)}
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#0A192F]">Owned Equity Holdings</h2>
          <span className="text-xs text-slate-500 font-mono-num">
            {portfolioStats.rows.length} Active Positions
          </span>
        </div>

        {portfolioStats.rows.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-3">
            <p className="text-sm text-slate-600">
              You do not own any shares yet. Open the Trading Desk to place your first BUY order.
            </p>
            <button
              onClick={() => navigate('trading')}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] cursor-pointer"
            >
              Browse Trading Desk
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4 text-right">Shares</th>
                  <th className="py-3 px-4 text-right">Avg Buy Price</th>
                  <th className="py-3 px-4 text-right">Current Price</th>
                  <th className="py-3 px-4 text-right">Current Value</th>
                  <th className="py-3 px-4 text-right">Brokerage Paid</th>
                  <th className="py-3 px-4 text-right">Profit / Loss</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {portfolioStats.rows.map((row) => {
                  const rowPos = row.pnl >= 0;
                  return (
                    <tr key={row.symbol} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{row.companyName}</div>
                        <div className="text-xs font-mono-num text-slate-500">{row.symbol}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num font-semibold text-slate-900">
                        {row.quantity}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num text-slate-600">
                        {formatINR(row.averageBuyPrice)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num font-semibold text-slate-900">
                        {formatINR(row.livePrice)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num font-semibold text-[#0A192F]">
                        {formatINR(row.marketVal)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num text-slate-700">
                        {formatINR(row.brokeragePaid)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono-num font-semibold ${
                          rowPos ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        <div>{formatSignedINR(row.pnl)}</div>
                        <div className="text-xs">{formatSignedPct(row.pnlPct)}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => navigate('trading', row.symbol)}
                          className="px-3 py-1.5 text-xs font-semibold text-[#0A192F] border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
                        >
                          Buy / Sell
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Brokerage & Trade Bills Summary */}
      {transactions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-bold text-[#0A192F]">
              Brokerage & Official Trade Bills Summary
            </div>
            <div className="text-xs text-slate-600 font-mono-num">
              Total Brokerage Billed across {transactions.length} orders:{' '}
              <strong className="text-slate-900">
                {formatINR(portfolioStats.totalBrokeragePaid)}
              </strong>{' '}
              ({portfolioStats.intradayOrders} Intraday @ 0.05% max ₹20 ·{' '}
              {portfolioStats.deliveryOrders} Delivery @ ₹0)
              {portfolioStats.brokerageDue > 0 && (
                <span className="text-red-600 font-semibold">
                  {' '}
                  · Unpaid Brokerage Due: {formatINR(portfolioStats.brokerageDue)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => navigate('transactions')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0A192F] border border-slate-300 rounded-lg hover:bg-slate-50 shrink-0 cursor-pointer"
          >
            <Receipt className="w-3.5 h-3.5" />
            View All Trade Bills
          </button>
        </div>
      )}
    </div>
  );
};
