import React, { useState } from 'react';
import { AlertCircle, Check, Copy, KeyRound, Printer, ShieldCheck, UserPlus } from 'lucide-react';
import { useExchange } from '../context/ExchangeContext';
import { formatFriendlyFirestoreError } from '../firebase/errorHandling';
import { formatINR } from '../utils/formatters';

export const InvestorLoginPage: React.FC = () => {
  const { registerInvestorByName, loginInvestor, investorProfile, navigate } = useExchange();

  const [mode, setMode] = useState<'new' | 'returning'>('new');
  const [name, setName] = useState('');
  const [investorId, setInvestorId] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Newly generated credential pass shown right after auto-registration
  const [createdPass, setCreatedPass] = useState<{
    investorId: string;
    accessCode: string;
    name: string;
    balance: number;
  } | null>(null);

  if (createdPass) {
    const handleCopy = async () => {
      const text = `NWS Stock Exchange Pass\nName: ${createdPass.name}\nInvestor ID: ${createdPass.investorId}\nAccess Code: ${createdPass.accessCode}`;
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    };

    return (
      <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-2 text-green-700 text-xs font-bold">
            <ShieldCheck className="w-4 h-4" />
            ACCOUNT CREATED & SIGNED IN
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#0A192F]">Your NWS Investor Pass</h1>
            <p className="text-xs text-slate-600 mt-1">
              Save or screenshot your Investor ID and Access Code below so you can sign back in on
              any device.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-xs">Investor Name</span>
              <span className="font-bold text-slate-900">{createdPass.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-xs">Investor ID</span>
              <span className="font-mono-num font-bold text-[#0A192F] text-base">
                {createdPass.investorId}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-xs">Access Code</span>
              <span className="font-mono-num font-bold text-green-700 text-base">
                {createdPass.accessCode}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <span className="text-slate-500 text-xs">Starting Balance</span>
              <span className="font-mono-num font-bold text-slate-900">
                {formatINR(createdPass.balance)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 no-print">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-700" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Details'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Pass
            </button>
          </div>

          <button
            onClick={() => {
              setCreatedPass(null);
              navigate('trading');
            }}
            className="w-full py-3 text-sm font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] transition-colors cursor-pointer no-print"
          >
            Start Trading Now
          </button>
        </div>
      </div>
    );
  }

  if (investorProfile) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4">
          <ShieldCheck className="w-10 h-10 text-green-700 mx-auto" />
          <h1 className="text-xl font-bold text-[#0A192F]">Active Investor Session</h1>
          <p className="text-sm text-slate-600">
            Signed in as <strong>{investorProfile.name}</strong> (
            <span className="font-mono-num">{investorProfile.investorId}</span>).
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => navigate('portfolio')}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] cursor-pointer"
            >
              Open My Portfolio
            </button>
            <button
              onClick={() => navigate('trading')}
              className="px-5 py-2.5 text-sm font-semibold text-[#0A192F] border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Start Trading
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleNewInvestorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const pass = await registerInvestorByName(name);
      setCreatedPass(pass);
    } catch (err) {
      setError(formatFriendlyFirestoreError(err, 'Could not create investor account.'));
    } finally {
      setLoading(false);
    }
  };

  const handleReturningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await loginInvestor({ name, investorId, accessCode });
      navigate('portfolio');
    } catch (err) {
      setError(
        formatFriendlyFirestoreError(err, 'Unable to sign in. Please check your credentials.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#0A192F] mb-2">
            {mode === 'new' ? <UserPlus className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
            NWS INVESTOR ACCESS
          </div>
          <h1 className="text-2xl font-bold text-[#0A192F]">
            {mode === 'new' ? 'Get Your Investor ID' : 'Investor Login'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {mode === 'new'
              ? 'Enter your name to automatically generate your unique Investor ID, Access Code, and ₹1,00,000 starting capital.'
              : 'Already have an Investor ID and Access Code? Sign back into your portfolio.'}
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setMode('new');
              setError(null);
            }}
            className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'new'
                ? 'bg-white text-[#0A192F] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            New Investor
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('returning');
              setError(null);
            }}
            className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'returning'
                ? 'bg-white text-[#0A192F] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Returning Login
          </button>
        </div>

        {mode === 'new' ? (
          <form onSubmit={handleNewInvestorSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-inv-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Enter Your Full Name
              </label>
              <input
                id="new-inv-name"
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aarav Sharma"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs text-slate-600 space-y-1">
              <div>• Your unique Investor ID & Access Code are generated automatically.</div>
              <div>• No email address or phone number required.</div>
              <div>• Instant starting balance: <strong className="font-mono-num text-slate-900">₹1,00,000.00</strong></div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-sm font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Generating Your ID & Access Code...' : 'Generate My Investor ID & Enter'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReturningSubmit} className="space-y-4">
            <div>
              <label htmlFor="inv-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Investor Name
              </label>
              <input
                id="inv-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aarav Sharma"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
              />
            </div>

            <div>
              <label htmlFor="inv-id" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Investor ID
              </label>
              <input
                id="inv-id"
                type="text"
                required
                value={investorId}
                onChange={(e) => setInvestorId(e.target.value.toUpperCase())}
                placeholder="e.g. NWS-4821A"
                className="w-full px-3.5 py-2.5 text-sm font-mono-num uppercase bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
              />
            </div>

            <div>
              <label htmlFor="inv-code" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Access Code
              </label>
              <input
                id="inv-code"
                type="password"
                required
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Enter your access code"
                className="w-full px-3.5 py-2.5 text-sm font-mono-num bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-sm font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Verifying Credentials...' : 'Open Personal Dashboard'}
            </button>
          </form>
        )}

        <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 text-center">
          New to the platform?{' '}
          <button
            onClick={() => navigate('learn')}
            className="font-semibold text-[#0A192F] hover:underline cursor-pointer"
          >
            Watch the interactive tutorial
          </button>
        </div>
      </div>
    </div>
  );
};
