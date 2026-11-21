import React from 'react';
import { useExchange } from '../context/ExchangeContext';

export const Footer: React.FC = () => {
  const { navigate } = useExchange();

  return (
    <footer className="bg-[#0A192F] text-slate-300 border-t border-slate-800 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-8 border-b border-slate-800">
          <div>
            <div className="text-base font-bold text-white tracking-tight">NWS STOCK EXCHANGE</div>
            <p className="text-sm text-slate-400 mt-1.5">The Future of Trading.</p>
            <p className="text-xs text-slate-400 mt-3 max-w-sm leading-relaxed">
              Class 12 Commerce Exhibition equity market platform featuring 20 major Indian
              companies, the NWS 20 Composite Index, interactive candlestick analytics, and
              synchronized portfolio execution.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-400 tracking-wide mb-3">
              Exchange Sections
            </div>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
              <button
                onClick={() => navigate('home')}
                className="text-left hover:text-white transition-colors cursor-pointer"
              >
                Home
              </button>
              <button
                onClick={() => navigate('market')}
                className="text-left hover:text-white transition-colors cursor-pointer"
              >
                Live Market
              </button>
              <button
                onClick={() => navigate('companies')}
                className="text-left hover:text-white transition-colors cursor-pointer"
              >
                Companies
              </button>
              <button
                onClick={() => navigate('trading')}
                className="text-left hover:text-white transition-colors cursor-pointer"
              >
                Trading
              </button>
              <button
                onClick={() => navigate('portfolio')}
                className="text-left hover:text-white transition-colors cursor-pointer"
              >
                My Portfolio
              </button>
              <button
                onClick={() => navigate('transactions')}
                className="text-left hover:text-white transition-colors cursor-pointer"
              >
                Transactions
              </button>
              <button
                onClick={() => navigate('learn')}
                className="text-left hover:text-white transition-colors cursor-pointer"
              >
                Learn Tutorial
              </button>
              <button
                onClick={() => navigate('login')}
                className="text-left hover:text-white transition-colors cursor-pointer"
              >
                Investor Login
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-400 tracking-wide mb-3">
              Exchange Administration
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Authorized exhibition coordinators may sign in to manage market sessions, investor
              credentials, and the live venue LED Market Board.
            </p>
            <button
              onClick={() => navigate('admin')}
              className="text-xs font-medium text-slate-200 underline underline-offset-4 hover:text-white cursor-pointer"
            >
              Exchange Admin Portal
            </button>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} NWS Stock Exchange · Commerce Exhibition Platform</span>
          <span>All prices quoted in Indian Rupees (INR ₹)</span>
        </div>
      </div>
    </footer>
  );
};
