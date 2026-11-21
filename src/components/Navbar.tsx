import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useExchange } from '../context/ExchangeContext';
import type { AppRoute } from '../types/exchange';
import { formatINR } from '../utils/formatters';

export const Navbar: React.FC = () => {
  const { route, navigate, investorProfile, isAdmin, logout } = useExchange();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: { label: string; route: AppRoute }[] = [
    { label: 'Home', route: 'home' },
    { label: 'Live Market', route: 'market' },
    { label: 'Companies', route: 'companies' },
    { label: 'Trading', route: 'trading' },
    { label: 'Portfolio', route: 'portfolio' },
    { label: 'Learn', route: 'learn' },
  ];

  const handleNav = (r: AppRoute) => {
    navigate(r);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          onClick={() => handleNav('home')}
          className="text-left text-base sm:text-lg font-extrabold tracking-tight text-[#0A192F] whitespace-nowrap shrink-0 cursor-pointer hover:text-[#1E3A8A] transition-colors"
        >
          NWS STOCK EXCHANGE
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden lg:flex items-center gap-6">
          {navItems.map((item) => {
            const active =
              route === item.route || (item.route === 'portfolio' && route === 'transactions');
            return (
              <button
                key={item.route}
                onClick={() => handleNav(item.route)}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'text-[#0A192F] border-[#0A192F]'
                    : 'text-slate-600 border-transparent hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          {investorProfile ? (
            <button
              onClick={() => handleNav('portfolio')}
              className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer font-mono-num ${
                investorProfile.balance < 0
                  ? 'bg-red-700 hover:bg-red-800'
                  : 'bg-[#0A192F] hover:bg-[#13294B]'
              }`}
            >
              {investorProfile.investorId} · {formatINR(investorProfile.balance, 0)}
              {investorProfile.balance < 0 ? ' (Due)' : ''}
            </button>
          ) : isAdmin ? (
            <button
              onClick={() => handleNav('admin')}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Admin Console
            </button>
          ) : (
            <button
              onClick={() => handleNav('login')}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Investor Login
            </button>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle navigation menu"
          className="lg:hidden p-2.5 text-slate-700 hover:text-slate-900 rounded-lg border border-slate-200 cursor-pointer"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-4 space-y-1">
          {navItems.map((item) => {
            const active = route === item.route;
            return (
              <button
                key={item.route}
                onClick={() => handleNav(item.route)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  active ? 'bg-slate-100 text-[#0A192F]' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            );
          })}
          <button
            onClick={() => handleNav('transactions')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              route === 'transactions'
                ? 'bg-slate-100 text-[#0A192F]'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            Transactions
          </button>

          <div className="pt-3 mt-2 border-t border-slate-200 flex items-center justify-between gap-3">
            {investorProfile ? (
              <>
                <div className="text-xs text-slate-700">
                  <div className="font-semibold text-slate-900">{investorProfile.name}</div>
                  <div
                    className={`font-mono-num ${
                      investorProfile.balance < 0 ? 'text-red-600 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {investorProfile.investorId} · {formatINR(investorProfile.balance)}
                    {investorProfile.balance < 0 ? ' (Due)' : ''}
                  </div>
                </div>
                <button
                  onClick={() => {
                    void logout();
                    setMobileOpen(false);
                  }}
                  className="px-3 py-2 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer"
                >
                  Sign Out
                </button>
              </>
            ) : isAdmin ? (
              <button
                onClick={() => handleNav('admin')}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#0A192F] rounded-lg cursor-pointer"
              >
                Open Admin Console
              </button>
            ) : (
              <button
                onClick={() => handleNav('login')}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#0A192F] rounded-lg cursor-pointer"
              >
                Investor Login
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
