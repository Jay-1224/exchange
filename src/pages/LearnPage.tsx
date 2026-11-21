import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useExchange } from '../context/ExchangeContext';

interface TutorialChapter {
  id: number;
  title: string;
  durationSec: number;
  sectionLabel: string;
  narration: string;
  keyPoints: string[];
  visualType: 'home' | 'market' | 'companies' | 'login' | 'trading' | 'portfolio';
}

const CHAPTERS: TutorialChapter[] = [
  {
    id: 1,
    title: '01. Market Overview & NWS 20 Composite Index',
    durationSec: 12,
    sectionLabel: 'Home Page',
    narration:
      'Welcome to NWS Stock Exchange. On the Home page, you can check whether the market is Open, Paused, or Closed, follow the live NWS 20 Composite Index chart, and inspect Top Gainers and Top Losers in real time.',
    keyPoints: [
      'Check Market Status (OPEN, PAUSED, or CLOSED) before placing trades.',
      'Follow the NWS 20 Composite Index value, points change, and intraday chart.',
      'Click any Top Gainer or Top Loser row to jump directly to its trading chart.',
    ],
    visualType: 'home',
  },
  {
    id: 2,
    title: '02. Searching & Sorting Live Market',
    durationSec: 12,
    sectionLabel: 'Live Market',
    narration:
      'Open the Live Market tab to compare all 20 major Indian companies in one table. Search by company name or symbol, filter by sector, and sort columns by share price, percentage change, or volume.',
    keyPoints: [
      'Type any company name or ticker symbol in the search box.',
      'Click sector filter buttons such as Banking, Technology, or Energy.',
      'Click table headers to sort by Price, Change Percentage, or Volume.',
    ],
    visualType: 'market',
  },
  {
    id: 3,
    title: '03. Exploring the 20 Listed Companies',
    durationSec: 12,
    sectionLabel: 'Companies',
    narration:
      'In the Companies directory, explore profiles across 9 Indian sectors including Banking, Technology, Automobile, Energy, FMCG, Healthcare, Infrastructure, Telecommunications, and Manufacturing.',
    keyPoints: [
      'Review headquarters, market capitalization, listing price, and business summary.',
      'Click Open Chart & Trade on any company card to analyze its chart.',
    ],
    visualType: 'companies',
  },
  {
    id: 4,
    title: '04. Signing In with Investor ID & Access Code',
    durationSec: 12,
    sectionLabel: 'Investor Login',
    narration:
      'Click Investor Login in the top bar. Enter your registered Investor Name, your assigned Investor ID such as NWS-1001, and your private Access Code. No phone number or email address is needed.',
    keyPoints: [
      'Enter your exact registered Name, Investor ID, and Access Code.',
      'Your account balance and portfolio are completely private and isolated.',
    ],
    visualType: 'login',
  },
  {
    id: 5,
    title: '05. Live Charts (Line / Candlestick) & Placing BUY / SELL Orders',
    durationSec: 14,
    sectionLabel: 'Trading Desk',
    narration:
      'On the Trading page, view the live Line chart by default or switch to green and red OHLC candlesticks with volume bars for every stock. Choose BUY or SELL, select Intraday or Delivery, enter your share quantity, and click Confirm Order.',
    keyPoints: [
      'Line graph displays by default; toggle to OHLC Candlestick anytime on any chart.',
      'Green candles show closing price higher than opening price; red candles show declines.',
      'Hover over any point or candle to read exact Open, High, Low, Close, and Volume.',
      'Orders check cash balance and compute brokerage bills automatically.',
    ],
    visualType: 'trading',
  },
  {
    id: 6,
    title: '06. Tracking My Portfolio & Transactions',
    durationSec: 12,
    sectionLabel: 'Portfolio & Transactions',
    narration:
      'Your Portfolio page recalculates Total Investment, Current Portfolio Value, and individual stock Profit or Loss automatically as market prices move. Switch to Transactions anytime to review or export your order history.',
    keyPoints: [
      'Watch unrealized profit and loss update automatically with every market tick.',
      'Filter Transaction History by BUY or SELL and download a CSV statement.',
    ],
    visualType: 'portfolio',
  },
];

export const LearnPage: React.FC = () => {
  const { navigate } = useExchange();
  const [chapterIdx, setChapterIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressSec, setProgressSec] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speed, setSpeed] = useState<1 | 1.25>(1);

  const chapter = CHAPTERS[chapterIdx];

  // Auto-advance simulated video timeline
  useEffect(() => {
    if (!isPlaying) return;
    const stepMs = 200;
    const timer = window.setInterval(() => {
      setProgressSec((prev) => {
        const next = prev + (stepMs / 1000) * speed;
        if (next >= chapter.durationSec) {
          if (chapterIdx < CHAPTERS.length - 1) {
            setChapterIdx((c) => c + 1);
            return 0;
          } else {
            setIsPlaying(false);
            return chapter.durationSec;
          }
        }
        return next;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, chapterIdx, chapter.durationSec, speed]);

  // Browser Web Speech narration synchronized with chapter changes when playing + voiceEnabled
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (isPlaying && voiceEnabled) {
      const utter = new SpeechSynthesisUtterance(chapter.narration);
      utter.rate = speed;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    }
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [chapterIdx, isPlaying, voiceEnabled, speed, chapter.narration]);

  const overallPercent = useMemo(() => {
    return Math.min(100, Math.round((progressSec / chapter.durationSec) * 100));
  }, [progressSec, chapter.durationSec]);

  const selectChapter = (idx: number, autoPlay = true) => {
    setChapterIdx(idx);
    setProgressSec(0);
    setIsPlaying(autoPlay);
  };

  const togglePlay = () => {
    if (!isPlaying && progressSec >= chapter.durationSec) {
      setProgressSec(0);
    }
    setIsPlaying((v) => !v);
  };

  const renderAnimatedScene = () => {
    const animStep = Math.floor(progressSec * 2) % 4;
    switch (chapter.visualType) {
      case 'home':
        return (
          <div className="w-full h-full bg-slate-950 p-5 sm:p-8 flex flex-col justify-between text-white">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-white">NWS STOCK EXCHANGE</span>
              <span className="text-green-400 font-semibold">Market Open</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 my-auto py-3">
              <div className="sm:col-span-5 bg-[#0F2544] rounded-lg p-4 border border-slate-700">
                <div className="text-[11px] text-slate-300">NWS 20 COMPOSITE INDEX</div>
                <div className="text-2xl font-bold font-mono-num mt-1">20,418.65</div>
                <div className="text-xs text-green-400 font-mono-num mt-1">▲ +418.65 (+2.09%)</div>
              </div>
              <div className="sm:col-span-7 bg-slate-900 rounded-lg p-4 border border-slate-800 flex items-end gap-2 h-28">
                {[38, 46, 42, 55, 62, 58, 72, 84].map((h, i) => (
                  <div
                    key={i}
                    style={{
                      height: `${Math.min(95, h + (animStep === i % 4 ? 10 : 0))}%`,
                    }}
                    className="flex-1 bg-green-500/80 rounded-t transition-all duration-300"
                  />
                ))}
              </div>
            </div>
            <div className="text-xs text-slate-300">{chapter.narration}</div>
          </div>
        );

      case 'market':
        return (
          <div className="w-full h-full bg-slate-950 p-5 sm:p-8 flex flex-col justify-between text-white">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-bold">Live Market · 20 Listed Companies</div>
              <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-xs font-mono-num text-slate-300">
                Search: RELIANCE
              </div>
            </div>
            <div className="space-y-2 my-auto">
              {[
                { sym: 'RELIANCE', name: 'Reliance Industries Ltd', p: '₹1,310.40', c: '+1.98%', pos: true },
                { sym: 'TCS', name: 'Tata Consultancy Services Ltd', p: '₹4,195.00', c: '+1.82%', pos: true },
                { sym: 'TATAMOTORS', name: 'Tata Motors Ltd', p: '₹874.50', c: '-1.74%', pos: false },
              ].map((row, idx) => (
                <div
                  key={row.sym}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors ${
                    animStep === idx
                      ? 'bg-[#0F2544] border-blue-400'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold font-mono-num">{row.sym}</div>
                    <div className="text-[11px] text-slate-400">{row.name}</div>
                  </div>
                  <div className="text-right font-mono-num">
                    <div className="text-xs font-bold">{row.p}</div>
                    <div className={`text-[11px] ${row.pos ? 'text-green-400' : 'text-red-400'}`}>
                      {row.c}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-300">{chapter.narration}</div>
          </div>
        );

      case 'companies':
        return (
          <div className="w-full h-full bg-slate-950 p-5 sm:p-8 flex flex-col justify-between text-white">
            <div className="text-sm font-bold">9 Core Indian Market Sectors</div>
            <div className="grid grid-cols-3 gap-2.5 my-auto">
              {[
                'Banking',
                'Technology',
                'Automobile',
                'Energy',
                'FMCG',
                'Healthcare',
                'Infrastructure',
                'Telecom',
                'Manufacturing',
              ].map((sec, idx) => (
                <div
                  key={sec}
                  className={`p-3 rounded-lg border text-center text-xs font-semibold transition-colors ${
                    animStep === idx % 4
                      ? 'bg-[#0F2544] border-blue-400 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  {sec}
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-300">{chapter.narration}</div>
          </div>
        );

      case 'login':
        return (
          <div className="w-full h-full bg-slate-950 p-5 sm:p-8 flex flex-col justify-between text-white">
            <div className="text-sm font-bold">Investor Login · Zero Email / Zero Phone</div>
            <div className="max-w-sm mx-auto w-full bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-2.5 my-auto">
              <div>
                <div className="text-[10px] text-slate-400">Investor Name</div>
                <div className="mt-0.5 px-3 py-1.5 bg-slate-800 rounded text-xs font-medium">
                  Aarav Sharma
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Investor ID</div>
                <div className="mt-0.5 px-3 py-1.5 bg-slate-800 rounded text-xs font-mono-num">
                  NWS-1001
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Access Code</div>
                <div className="mt-0.5 px-3 py-1.5 bg-slate-800 rounded text-xs font-mono-num">
                  NWS-84K29P
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-300">{chapter.narration}</div>
          </div>
        );

      case 'trading':
        return (
          <div className="w-full h-full bg-slate-950 p-5 sm:p-8 flex flex-col justify-between text-white">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold">RELIANCE · Live Chart & Order Ticket</span>
              <span className="font-mono-num text-green-400">₹1,310.40 (+1.98%)</span>
            </div>
            <div className="grid grid-cols-12 gap-4 my-auto items-center">
              <div className="col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-around h-32">
                {[
                  { bull: true, h: 42 },
                  { bull: false, h: 30 },
                  { bull: true, h: 52 },
                  { bull: true, h: 64 },
                  { bull: false, h: 48 },
                  { bull: true, h: 74 },
                ].map((c, idx) => (
                  <div key={idx} className="flex flex-col items-center justify-center h-full">
                    <div
                      className={`w-0.5 h-3 ${c.bull ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                    <div
                      style={{ height: `${c.h}%` }}
                      className={`w-3 rounded-xs ${c.bull ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                    <div
                      className={`w-0.5 h-3 ${c.bull ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                  </div>
                ))}
              </div>
              <div className="col-span-5 bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-1 text-center font-bold">
                  <div className="py-1 bg-green-700 rounded">BUY</div>
                  <div className="py-1 bg-slate-800 text-slate-400 rounded">SELL</div>
                </div>
                <div className="font-mono-num text-[11px] text-slate-300">Qty: 10 Shares</div>
                <div className="font-mono-num font-bold text-white">Total: ₹15,124.00</div>
                <div className="py-1.5 bg-green-700 text-center rounded font-semibold">
                  Confirm BUY
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-300">{chapter.narration}</div>
          </div>
        );

      case 'portfolio':
      default:
        return (
          <div className="w-full h-full bg-slate-950 p-5 sm:p-8 flex flex-col justify-between text-white">
            <div className="text-sm font-bold">My Portfolio & Transaction Ledger</div>
            <div className="grid grid-cols-3 gap-3 my-auto">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] text-slate-400">Available Cash</div>
                <div className="text-sm font-bold font-mono-num mt-1">₹84,876.00</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] text-slate-400">Portfolio Value</div>
                <div className="text-sm font-bold font-mono-num mt-1">₹16,240.00</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] text-slate-400">Total Profit</div>
                <div className="text-sm font-bold font-mono-num text-green-400 mt-1">
                  +₹1,116.00
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-300">{chapter.narration}</div>
          </div>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-500">INVESTOR WALKTHROUGH GUIDE</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0A192F] mt-1">
            Learn How to Use NWS Stock Exchange
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Interactive 6-chapter guided video tutorial covering market browsing, investor login,
            line & candlestick trading, and portfolio tracking.
          </p>
        </div>

        <button
          onClick={() => navigate('trading')}
          className="self-start md:self-auto px-4 py-2 text-xs font-semibold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] cursor-pointer"
        >
          Try Trading Desk Now
        </button>
      </div>

      {/* Main Video Player + Chapter Playlist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Video Stage */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="aspect-video w-full relative overflow-hidden">
            {renderAnimatedScene()}
          </div>

          {/* Video Transport Controls */}
          <div className="p-4 bg-[#0A192F] text-white space-y-3">
            {/* Scrubber Bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono-num text-slate-300 w-10">
                {Math.floor(progressSec)}s
              </span>
              <input
                type="range"
                min={0}
                max={chapter.durationSec}
                step={0.5}
                value={progressSec}
                onChange={(e) => setProgressSec(Number(e.target.value))}
                aria-label="Tutorial timeline scrubber"
                className="flex-1 accent-white cursor-pointer"
              />
              <span className="text-xs font-mono-num text-slate-300 w-10 text-right">
                {chapter.durationSec}s
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-[#0A192F] text-xs font-bold rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Pause' : 'Play Tutorial'}
                </button>
                <button
                  onClick={() => selectChapter(Math.max(0, chapterIdx - 1), isPlaying)}
                  disabled={chapterIdx === 0}
                  aria-label="Previous chapter"
                  className="p-2 border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    selectChapter(Math.min(CHAPTERS.length - 1, chapterIdx + 1), isPlaying)
                  }
                  disabled={chapterIdx === CHAPTERS.length - 1}
                  aria-label="Next chapter"
                  className="p-2 border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => selectChapter(0, true)}
                  aria-label="Restart tutorial"
                  className="p-2 border border-slate-700 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSpeed((s) => (s === 1 ? 1.25 : 1))}
                  className="px-2.5 py-1.5 text-xs font-mono-num border border-slate-700 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  {speed}x
                </button>
                <button
                  onClick={() => setVoiceEnabled((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer ${
                    voiceEnabled
                      ? 'bg-green-700 border-green-600 text-white'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {voiceEnabled ? (
                    <Volume2 className="w-3.5 h-3.5" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  {voiceEnabled ? 'Voiceover On' : 'Voiceover Off'}
                </button>
              </div>
            </div>
          </div>

          {/* Current Chapter Key Takeaways */}
          <div className="p-5 sm:p-6 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-[#0A192F]">{chapter.sectionLabel}</span>
              <span className="font-mono-num">{overallPercent}% Complete</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">{chapter.title}</h2>
            <ul className="space-y-2 pt-1">
              {chapter.keyPoints.map((pt, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-green-700 shrink-0 mt-0.5" />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Chapter Playlist */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-base font-bold text-[#0A192F]">Tutorial Chapters</h3>
            <p className="text-xs text-slate-500 mt-0.5">Select any step to jump in the video</p>
          </div>
          <div className="divide-y divide-slate-100">
            {CHAPTERS.map((ch, idx) => {
              const active = idx === chapterIdx;
              return (
                <button
                  key={ch.id}
                  onClick={() => selectChapter(idx, true)}
                  className={`w-full px-5 py-4 text-left transition-colors cursor-pointer ${
                    active ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span className="font-semibold text-[#0A192F]">{ch.sectionLabel}</span>
                    <span className="font-mono-num">{ch.durationSec}s</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{ch.title}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
