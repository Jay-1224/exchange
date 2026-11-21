import React from 'react';
import { FileText, Printer, X } from 'lucide-react';
import type { OrderType, TradeProductType } from '../types/exchange';
import { formatINR, formatTimestamp } from '../utils/formatters';

export interface TradeBillData {
  id: string;
  billNumber?: string;
  clientOrderKey: string;
  investorId: string;
  investorName: string;
  symbol: string;
  companyName: string;
  type: OrderType;
  productType?: TradeProductType;
  quantity: number;
  price: number;
  totalAmount: number;
  brokerageAmount?: number;
  netAmount?: number;
  createdAt?: unknown;
}

interface TradeBillModalProps {
  bill: TradeBillData | null;
  onClose: () => void;
}

export const TradeBillModal: React.FC<TradeBillModalProps> = ({ bill, onClose }) => {
  if (!bill) return null;

  const productType: TradeProductType = bill.productType ?? 'DELIVERY';
  const brokerage = bill.brokerageAmount ?? 0;
  const netAmount =
    bill.netAmount ??
    (bill.type === 'BUY'
      ? Number((bill.totalAmount + brokerage).toFixed(2))
      : Number((bill.totalAmount - brokerage).toFixed(2)));
  const billNo = bill.billNumber || `NWS-BILL-${bill.id.slice(0, 8).toUpperCase()}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-bill-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Top Modal Header */}
        <div className="bg-[#0A192F] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-slate-300" />
            <div>
              <div className="text-[11px] font-mono-num text-slate-300 uppercase tracking-wider">
                NWS Stock Exchange · Official Contract Note
              </div>
              <h2 id="trade-bill-title" className="text-base font-bold">
                Trade Bill #{billNo}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Trade Bill"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer no-print"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Bill Body */}
        <div className="p-6 space-y-5 text-sm">
          <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs">
            <div>
              <div className="text-slate-500">Investor Name</div>
              <div className="font-semibold text-slate-900 mt-0.5">{bill.investorName}</div>
            </div>
            <div>
              <div className="text-slate-500">Investor ID</div>
              <div className="font-mono-num font-bold text-[#0A192F] mt-0.5">{bill.investorId}</div>
            </div>
            <div>
              <div className="text-slate-500">Order Reference</div>
              <div className="font-mono-num text-slate-700 mt-0.5 break-all">
                {bill.clientOrderKey}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Execution Date & Time</div>
              <div className="font-mono-num text-slate-700 mt-0.5">
                {bill.createdAt ? formatTimestamp(bill.createdAt) : 'Just Executed'}
              </div>
            </div>
          </div>

          {/* Security & Execution Summary */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>Particulars</span>
              <span>Amount (INR)</span>
            </div>
            <div className="divide-y divide-slate-100 px-4 text-xs sm:text-sm">
              <div className="py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-slate-900">
                    {bill.companyName}{' '}
                    <span className="font-mono-num text-xs text-slate-500">({bill.symbol})</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 font-mono-num">
                    <span
                      className={`font-bold ${
                        bill.type === 'BUY' ? 'text-green-700' : 'text-red-600'
                      }`}
                    >
                      {bill.type}
                    </span>{' '}
                    · {productType === 'INTRADAY' ? 'Intraday Trade' : 'Equity Delivery'} ·{' '}
                    {bill.quantity} × {formatINR(bill.price)}
                  </div>
                </div>
                <div className="font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                  {formatINR(bill.totalAmount)}
                </div>
              </div>

              <div className="py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-slate-700">Brokerage Charges</div>
                  <div className="text-xs text-slate-500">
                    {productType === 'DELIVERY'
                      ? '0% Equity Delivery (₹0)'
                      : '0.05% Intraday Brokerage (Capped at ₹20/order)'}
                  </div>
                </div>
                <div className="font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                  {bill.type === 'BUY' ? '+' : '−'} {formatINR(brokerage)}
                </div>
              </div>

              <div className="py-3.5 flex items-center justify-between gap-4 bg-slate-50/70 -mx-4 px-4">
                <div>
                  <div className="font-bold text-[#0A192F]">
                    {bill.type === 'BUY' ? 'Net Bill Payable' : 'Net Proceeds Credited'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {bill.type === 'BUY'
                      ? 'Gross Trade Value + Brokerage'
                      : 'Gross Sale Proceeds − Brokerage'}
                  </div>
                </div>
                <div className="text-base font-bold font-mono-num text-[#0A192F] whitespace-nowrap">
                  {formatINR(netAmount)}
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 leading-relaxed">
            Settlement Policy: Equity Delivery carries ₹0 brokerage. Intraday trades incur 0.05%
            brokerage (capped at ₹20 per executed order). If cash balance after share settlement is
            insufficient to cover brokerage, the unpaid fee is recorded as a negative balance.
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0A192F] border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Bill
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
