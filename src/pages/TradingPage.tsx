import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Lock } from 'lucide-react';
import { CandlestickChart } from '../components/CandlestickChart';
import { TradeBillModal, type TradeBillData } from '../components/TradeBillModal';
import { useExchange } from '../context/ExchangeContext';
import { formatFriendlyFirestoreError } from '../firebase/errorHandling';
import {
  calculateBrokerage,
  executeInvestorTrade,
  type TradeExecutionResult,
} from '../services/marketEngine';
import type { OrderType, TradeProductType } from '../types/exchange';
import {
  formatCompactVolume,
  formatINR,
  formatSignedINR,
  formatSignedPct,
} from '../utils/formatters';

export const TradingPage: React.FC = () => {
  const {
    stocks,
    selectedSymbol,
    setSelectedSymbol,
    settings,
    investorProfile,
    holdings,
    isAdmin,
    isSeededInFirestore,
    navigate,
  } = useExchange();

  const activeStocks = useMemo(() => stocks.filter((s) => s.isActive), [stocks]);
  const selectedStock = useMemo(
    () => activeStocks.find((s) => s.symbol === selectedSymbol) ?? activeStocks[0],
    [activeStocks, selectedSymbol]
  );

  const [orderType, setOrderType] = useState<OrderType>('BUY');
  const [productType, setProductType] = useState<TradeProductType>('INTRADAY');
  const [quantityInput, setQuantityInput] = useState<string>('1');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<TradeExecutionResult | null>(null);
  const [openBill, setOpenBill] = useState<TradeBillData | null>(null);

  const currentHolding = useMemo(
    () => holdings.find((h) => h.symbol === selectedStock?.symbol),
    [holdings, selectedStock]
  );

  const ownedQty = currentHolding?.quantity ?? 0;
  const parsedQty = Number(quantityInput);
  const isValidIntQty = Number.isInteger(parsedQty) && parsedQty > 0 && parsedQty <= 1_000_000;
  const orderValue =
    isValidIntQty && selectedStock ? Number((parsedQty * selectedStock.currentPrice).toFixed(2)) : 0;
  const estimatedBrokerage = calculateBrokerage(orderValue, productType);
  const netBillAmount =
    orderType === 'BUY'
      ? Number((orderValue + estimatedBrokerage).toFixed(2))
      : Number(Math.max(0, orderValue - estimatedBrokerage).toFixed(2));
  const projectedBalance = investorProfile
    ? Number(
        (orderType === 'BUY'
          ? investorProfile.balance - netBillAmount
          : investorProfile.balance + netBillAmount
        ).toFixed(2)
      )
    : 0;
  const willCauseBrokerageDue = Boolean(
    investorProfile &&
      orderType === 'BUY' &&
      isValidIntQty &&
      orderValue <= investorProfile.balance &&
      projectedBalance < 0
  );

  const maxAffordableQty =
    investorProfile && selectedStock && selectedStock.currentPrice > 0
      ? Math.max(0, Math.floor(investorProfile.balance / selectedStock.currentPrice))
      : 0;

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    setReceipt(null);

    if (!investorProfile) {
      setErrorMsg('Please sign in with your Investor ID and Access Code to place orders.');
      return;
    }
    if (!isSeededInFirestore) {
      setErrorMsg('Live exchange database has not been initialized by the Admin yet.');
      return;
    }
    if (settings.status !== 'OPEN') {
      setErrorMsg(`Market is currently ${settings.status}. Orders are paused.`);
      return;
    }
    if (!selectedStock) {
      setErrorMsg('Please select a listed company.');
      return;
    }
    if (!isValidIntQty) {
      setErrorMsg('Enter a valid whole share quantity greater than zero.');
      return;
    }
    if (orderType === 'BUY' && orderValue > investorProfile.balance) {
      setErrorMsg(
        investorProfile.balance < 0
          ? `Your account has a negative balance (${formatINR(investorProfile.balance)}) due to unpaid brokerage. Sell shares to settle dues before buying.`
          : `Insufficient available balance for share purchase (${formatINR(orderValue)} required).`
      );
      return;
    }
    if (orderType === 'SELL' && parsedQty > ownedQty) {
      setErrorMsg(`You only own ${ownedQty} shares of ${selectedStock.symbol}.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await executeInvestorTrade({
        investorUid: investorProfile.uid,
        symbol: selectedStock.symbol,
        type: orderType,
        productType,
        quantity: parsedQty,
      });
      setReceipt(res);
      setQuantityInput('1');
    } catch (err) {
      setErrorMsg(formatFriendlyFirestoreError(err, 'Order execution failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedStock) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-slate-600">
        No active listed companies available for trading.
      </div>
    );
  }

  const isPositive = selectedStock.change >= 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header & Stock Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-500">
            EQUITY ORDER TERMINAL · MARKET {settings.status}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
            Trading & Live Chart Desk
          </h1>
        </div>

        <div className="w-full md:w-80">
          <label htmlFor="stock-select" className="sr-only">
            Select Listed Company
          </label>
          <select
            id="stock-select"
            value={selectedStock.symbol}
            onChange={(e) => {
              setSelectedSymbol(e.target.value);
              setErrorMsg(null);
              setReceipt(null);
            }}
            className="w-full px-3.5 py-2.5 text-sm font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
          >
            {activeStocks.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} — {s.name} ({formatINR(s.currentPrice)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main 2-Column Split: Candlestick Chart + Order Ticket */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 cols: Live Quote Strip + Candlestick Graph + Company Summary */}
        <div className="lg:col-span-8 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono-num font-bold text-[#0A192F]">{selectedStock.symbol}</span>
                <span aria-hidden="true">·</span>
                <span>{selectedStock.sector}</span>
                <span aria-hidden="true">·</span>
                <span>{selectedStock.headquarters}</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-0.5">{selectedStock.name}</h2>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-2xl sm:text-3xl font-bold text-[#0A192F] font-mono-num">
                  {formatINR(selectedStock.currentPrice)}
                </span>
                <span
                  className={`text-sm font-semibold font-mono-num ${
                    isPositive ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {isPositive ? '▲ ' : '▼ '}
                  {formatSignedINR(selectedStock.change)} ({formatSignedPct(selectedStock.changePct)})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-xs font-mono-num pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
              <div>
                <div className="text-slate-500">Day High</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {formatINR(selectedStock.dayHigh)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Day Low</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {formatINR(selectedStock.dayLow)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Volume</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {formatCompactVolume(selectedStock.volume)}
                </div>
              </div>
            </div>
          </div>

          <CandlestickChart
            symbol={selectedStock.symbol}
            candles={selectedStock.candles}
            previousClose={selectedStock.previousClose}
            currentPrice={selectedStock.currentPrice}
          />

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#0A192F] mb-1.5">Company Profile</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{selectedStock.description}</p>
          </div>
        </div>

        {/* Right 4 cols: Order Execution Ticket */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#0A192F]">Order Ticket</h3>
            <span className="text-xs font-mono-num font-semibold text-slate-500">
              {selectedStock.symbol}
            </span>
          </div>

          {/* BUY / SELL Segmented Switch */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setOrderType('BUY');
                setErrorMsg(null);
                setReceipt(null);
              }}
              className={`py-2 text-sm font-semibold rounded-md transition-colors cursor-pointer ${
                orderType === 'BUY'
                  ? 'bg-green-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderType('SELL');
                setErrorMsg(null);
                setReceipt(null);
              }}
              className={`py-2 text-sm font-semibold rounded-md transition-colors cursor-pointer ${
                orderType === 'SELL'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              SELL
            </button>
          </div>

          {/* Product Mode: Intraday vs Delivery */}
          <div>
            <div className="text-[11px] font-semibold text-slate-600 mb-1.5">Order Product</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setProductType('INTRADAY');
                  setErrorMsg(null);
                }}
                className={`px-2.5 py-2 text-left rounded-lg border transition-colors cursor-pointer ${
                  productType === 'INTRADAY'
                    ? 'border-[#0A192F] bg-[#0A192F]/5 text-[#0A192F]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-bold">Intraday</div>
                <div className="text-[11px] font-mono-num text-slate-500">0.05% · Max ₹20</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProductType('DELIVERY');
                  setErrorMsg(null);
                }}
                className={`px-2.5 py-2 text-left rounded-lg border transition-colors cursor-pointer ${
                  productType === 'DELIVERY'
                    ? 'border-[#0A192F] bg-[#0A192F]/5 text-[#0A192F]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-bold">Delivery</div>
                <div className="text-[11px] font-mono-num text-green-700">0% · ₹0 Brokerage</div>
              </button>
            </div>
          </div>

          {!investorProfile ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 text-center space-y-3">
              <Lock className="w-6 h-6 text-[#0A192F] mx-auto" />
              <div className="text-sm font-semibold text-slate-900">
                {isAdmin ? 'Signed in as Administrator' : 'Investor Login Required'}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {isAdmin
                  ? 'Administrator accounts cannot place investor orders. Sign out and sign in with an Investor ID to test trading.'
                  : 'Sign in with your Investor Name, Investor ID, and Access Code to place BUY or SELL orders.'}
              </p>
              {!isAdmin && (
                <button
                  onClick={() => navigate('login')}
                  className="w-full py-2.5 text-xs font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] cursor-pointer"
                >
                  Go to Investor Login
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleConfirmOrder} className="space-y-4">
              {/* Investor Account Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Available Cash</span>
                  <span
                    className={`font-mono-num font-bold ${
                      investorProfile.balance < 0 ? 'text-red-600' : 'text-slate-900'
                    }`}
                  >
                    {formatINR(investorProfile.balance)}
                    {investorProfile.balance < 0 && ' (Due)'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Owned ({selectedStock.symbol})</span>
                  <span className="font-mono-num font-bold text-slate-900">{ownedQty} Shares</span>
                </div>
                {investorProfile.balance < 0 && (
                  <div className="pt-2 mt-1 border-t border-red-200 text-[11px] font-medium text-red-700 leading-snug">
                    Unpaid brokerage due ({formatINR(Math.abs(investorProfile.balance))}). Sell shares
                    to settle your balance before placing new BUY orders.
                  </div>
                )}
              </div>

              {/* Quantity Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="order-qty" className="text-xs font-semibold text-slate-700">
                    Quantity (Shares)
                  </label>
                  <span className="text-xs text-slate-500 font-mono-num">
                    {orderType === 'BUY'
                      ? `Max: ${maxAffordableQty}`
                      : `Available: ${ownedQty}`}
                  </span>
                </div>
                <input
                  id="order-qty"
                  type="number"
                  min={1}
                  step={1}
                  value={quantityInput}
                  onChange={(e) => {
                    setQuantityInput(e.target.value);
                    setErrorMsg(null);
                  }}
                  className="w-full px-3.5 py-2.5 text-base font-mono-num font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
                />
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[1, 5, 10].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setQuantityInput(String(preset))}
                      className="py-1.5 text-xs font-mono-num font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setQuantityInput(
                        String(
                          Math.min(
                            1_000_000,
                            Math.max(1, orderType === 'BUY' ? maxAffordableQty : ownedQty)
                          )
                        )
                      )
                    }
                    className="py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-[#0A192F] rounded cursor-pointer"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Price, Brokerage & Bill Total */}
              <div className="pt-3 border-t border-slate-200 space-y-2 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Current Share Price</span>
                  <span className="font-mono-num font-medium text-slate-900">
                    {formatINR(selectedStock.currentPrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>{orderType === 'BUY' ? 'Order Value' : 'Gross Sale Value'}</span>
                  <span className="font-mono-num font-medium text-slate-900">
                    {formatINR(orderValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>
                    Brokerage ({productType === 'DELIVERY' ? '0% Delivery' : '0.05% · Max ₹20'})
                  </span>
                  <span className="font-mono-num font-medium text-slate-900">
                    {orderType === 'BUY' ? '+' : '−'} {formatINR(estimatedBrokerage)}
                  </span>
                </div>
                <div className="flex items-center justify-between font-bold text-[#0A192F] text-base pt-1 border-t border-slate-100">
                  <span>{orderType === 'BUY' ? 'Total Bill Payable' : 'Net Proceeds'}</span>
                  <span className="font-mono-num">{formatINR(netBillAmount)}</span>
                </div>
                {isValidIntQty && (
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Balance After Trade</span>
                    <span
                      className={`font-mono-num font-semibold ${
                        projectedBalance < 0 ? 'text-red-600' : 'text-slate-700'
                      }`}
                    >
                      {formatINR(projectedBalance)}
                    </span>
                  </div>
                )}
              </div>

              {willCauseBrokerageDue && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Remaining cash cannot cover full brokerage ({formatINR(estimatedBrokerage)}).
                    Unpaid brokerage will put your balance at{' '}
                    <strong className="font-mono-num">{formatINR(projectedBalance)}</strong>.
                  </span>
                </div>
              )}

              {errorMsg && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {receipt && (
                <div className="p-3.5 rounded-lg bg-green-50 border border-green-200 text-xs text-green-900 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-green-700" />
                      Order Executed ({receipt.type} · {receipt.productType})
                    </div>
                    <span className="font-mono-num text-[11px] text-green-700">
                      {receipt.billNumber}
                    </span>
                  </div>

                  <div className="bg-white/80 border border-green-200/80 rounded-md p-2.5 space-y-1 font-mono-num">
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        {receipt.quantity} {receipt.symbol} @ {formatINR(receipt.price)}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {formatINR(receipt.totalAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Brokerage</span>
                      <span className="text-slate-800">{formatINR(receipt.brokerageAmount)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-[#0A192F] pt-1 border-t border-green-100">
                      <span>Net Bill</span>
                      <span>{formatINR(receipt.netAmount)}</span>
                    </div>
                  </div>

                  <div
                    className={`font-mono-num font-semibold ${
                      receipt.newBalance < 0 ? 'text-red-700' : 'text-green-800'
                    }`}
                  >
                    Updated Balance: {formatINR(receipt.newBalance)}
                    {receipt.newBalance < 0 &&
                      ` (Brokerage Due: ${formatINR(receipt.brokerageDue)})`}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenBill({
                          id: receipt.txId,
                          billNumber: receipt.billNumber,
                          clientOrderKey: receipt.clientOrderKey,
                          investorId: investorProfile.investorId,
                          investorName: investorProfile.name,
                          symbol: receipt.symbol,
                          companyName: receipt.companyName,
                          type: receipt.type,
                          productType: receipt.productType,
                          quantity: receipt.quantity,
                          price: receipt.price,
                          totalAmount: receipt.totalAmount,
                          brokerageAmount: receipt.brokerageAmount,
                          netAmount: receipt.netAmount,
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#0A192F] underline hover:text-green-900 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Open Trade Bill
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('portfolio')}
                      className="text-xs font-bold text-[#0A192F] underline hover:text-green-900 cursor-pointer"
                    >
                      View Updated Portfolio →
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || settings.status !== 'OPEN'}
                className={`w-full py-3 text-sm font-bold text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  orderType === 'BUY'
                    ? 'bg-green-700 hover:bg-green-800'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {submitting
                  ? 'Executing Order...'
                  : settings.status !== 'OPEN'
                    ? `Market ${settings.status}`
                    : `Confirm ${orderType} (${productType})`}
              </button>
            </form>
          )}
        </div>
      </div>

      <TradeBillModal bill={openBill} onClose={() => setOpenBill(null)} />
    </div>
  );
};
