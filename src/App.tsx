import React from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { ExchangeProvider, useExchange } from './context/ExchangeContext';
import { AdminPage } from './pages/AdminPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { HomePage } from './pages/HomePage';
import { InvestorLoginPage } from './pages/InvestorLoginPage';
import { LearnPage } from './pages/LearnPage';
import { LedBoardPage } from './pages/LedBoardPage';
import { LiveMarketPage } from './pages/LiveMarketPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { TradingPage } from './pages/TradingPage';
import { TransactionsPage } from './pages/TransactionsPage';

const AppShell: React.FC = () => {
  const { route } = useExchange();

  // Dedicated Full-Screen Admin LED Market Board (no standard website navbar/footer)
  if (route === 'led') {
    return <LedBoardPage />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar />
      <main className="flex-1">
        {route === 'home' && <HomePage />}
        {route === 'market' && <LiveMarketPage />}
        {route === 'companies' && <CompaniesPage />}
        {route === 'trading' && <TradingPage />}
        {route === 'portfolio' && <PortfolioPage />}
        {route === 'transactions' && <TransactionsPage />}
        {route === 'learn' && <LearnPage />}
        {route === 'login' && <InvestorLoginPage />}
        {route === 'admin' && <AdminPage />}
      </main>
      <Footer />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ExchangeProvider>
        <AppShell />
      </ExchangeProvider>
    </ErrorBoundary>
  );
}
