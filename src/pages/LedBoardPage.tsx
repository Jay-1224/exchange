import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Lock,
  Maximize2,
  Minimize2,
  Newspaper,
  Play,
  Radio,
  SkipForward,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  OperationType,
  handleFirestoreError,
  isQuotaExceededError,
} from '../firebase/errorHandling';
import { useExchange } from '../context/ExchangeContext';
import { buildCompositeIndexSeries } from '../services/marketEngine';
import { AiNewsAnchor } from '../components/AiNewsAnchor';
import { IndexChart, type IndexChartType } from '../components/IndexChart';
import type { EnrichedStock, IndexPoint, Investor, PortfolioHolding } from '../types/exchange';
import {
  formatINR,
  formatIndianNumber,
  formatSignedPct,
} from '../utils/formatters';

const MALE_VOICE_TOKENS = new Set([
  'male',
  'man',
  'boy',
  'masculine',
  'masc',
  'prabhat',
  'ravi',
  'hemant',
  'madhur',
  'neeraj',
  'arjun',
  'aman',
  'rishi',
  'david',
  'daniel',
  'george',
  'mark',
  'james',
  'guy',
  'ryan',
  'andrew',
  'alex',
  'aaron',
  'arthur',
  'oliver',
  'thomas',
  'brian',
  'eric',
  'christopher',
  'william',
  'liam',
  'connor',
  'mitchell',
  'sam',
  'richard',
  'steffan',
  'roger',
  'tony',
  'brandon',
  'jacob',
  'davis',
  'jason',
  'alfie',
  'elliot',
  'ethan',
  'noah',
  'luke',
  'wayne',
  'abeo',
  'gordon',
  'lee',
  'fred',
  'malcolm',
  'albert',
  'bruce',
  'ralph',
  'eddy',
  'reed',
  'rocko',
  'harry',
  'charlie',
  'sean',
  // Google Android / ChromeOS Male Voice IDs
  'end',
  'ene',
  'ahp',
  'iom',
  'iol',
  'tpd',
  'gbb',
  'gbd',
  'rjs',
  'aub',
  'aud',
]);

const FEMALE_VOICE_TOKENS = new Set([
  'female',
  'woman',
  'girl',
  'feminine',
  'heera',
  'neerja',
  'swara',
  'priya',
  'raveena',
  'veena',
  'lekha',
  'sangeeta',
  'aditi',
  'kalpana',
  'kavya',
  'ananya',
  'aashi',
  'kajal',
  'isha',
  'tara',
  'divya',
  'meera',
  'neha',
  'pooja',
  'shreya',
  'anjali',
  'riya',
  'kavita',
  'geeta',
  'sunita',
  'lata',
  'shruti',
  'nandini',
  'pallavi',
  'vani',
  'zira',
  'susan',
  'hazel',
  'samantha',
  'victoria',
  'karen',
  'fiona',
  'tessa',
  'moira',
  'jenny',
  'aria',
  'sonia',
  'libby',
  'maisie',
  'natasha',
  'clara',
  'ava',
  'allison',
  'catherine',
  'ana',
  'ashley',
  'cora',
  'emma',
  'michelle',
  'monica',
  'sara',
  'molly',
  'emily',
  'steffi',
  'leah',
  'serena',
  'kate',
  'martha',
  'linda',
  'eva',
  'tracy',
  'nicky',
  'kathy',
  'princess',
  'sandy',
  'shelley',
  'flo',
  'grandma',
  'huihui',
  'yaoyao',
  'kyoko',
  'haruka',
  'yuna',
  'sora',
  'amelie',
  // Google Android / ChromeOS Female Voice IDs
  'ena',
  'enc',
  'sfg',
  'tpf',
  'iob',
  'iog',
  'gba',
  'gbc',
  'fis',
  'aua',
  'auc',
]);

const FEMALE_PHRASES = ['google us english', 'chrome os us english', 'chrome os uk english'];

function getVoiceTokens(voice: Pick<SpeechSynthesisVoice, 'name' | 'voiceURI'>): string[] {
  return `${voice.name} ${voice.voiceURI}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isExplicitMaleVoice(voice: Pick<SpeechSynthesisVoice, 'name' | 'voiceURI'>): boolean {
  const tokens = getVoiceTokens(voice);
  return tokens.some((tok) => MALE_VOICE_TOKENS.has(tok));
}

function isExplicitFemaleVoice(voice: Pick<SpeechSynthesisVoice, 'name' | 'voiceURI'>): boolean {
  const lowName = voice.name.toLowerCase();
  if (FEMALE_PHRASES.some((phrase) => lowName.includes(phrase))) return true;
  const tokens = getVoiceTokens(voice);
  return tokens.some((tok) => FEMALE_VOICE_TOKENS.has(tok));
}

const STUDIO_VOICE_PREFIX = 'studio:';
const DEFAULT_STUDIO_VOICE = 'studio:Charon';

const STUDIO_VOICES = [
  { id: 'studio:Charon', voiceName: 'Charon', label: '♂ Arjun · Studio Indian Male (Deep)' },
  { id: 'studio:Fenrir', voiceName: 'Fenrir', label: '♂ Vikram · Studio Male (Crisp)' },
  { id: 'studio:Orus', voiceName: 'Orus', label: '♂ Kabir · Studio Male (Baritone)' },
] as const;

const SPOKEN_TICKER_NAMES: Record<string, string> = {
  TCS: 'T.C.S.',
  HDFCBANK: 'H.D.F.C. Bank',
  ICICIBANK: 'I.C.I.C.I. Bank',
  SBIN: 'State Bank of India',
  BHARTIARTL: 'Bharti Airtel',
  RELIANCE: 'Reliance Industries',
  INFY: 'Infosys',
  HINDUNILVR: 'Hindustan Unilever',
  ITC: 'I.T.C.',
  LT: 'Larsen and Toubro',
  KOTAKBANK: 'Kotak Mahindra Bank',
  AXISBANK: 'Axis Bank',
  BAJFINANCE: 'Bajaj Finance',
  MARUTI: 'Maruti Suzuki',
  SUNPHARMA: 'Sun Pharma',
  TATAMOTORS: 'Tata Motors',
  TATASTEEL: 'Tata Steel',
  TITAN: 'Titan Company',
  WIPRO: 'Wipro',
  ADANIENT: 'Adani Enterprises',
  ASIANPAINT: 'Asian Paints',
  ULTRACEMCO: 'UltraTech Cement',
  NESTLEIND: 'Nestle India',
  POWERGRID: 'Power Grid',
  NTPC: 'N.T.P.C.',
  ONGC: 'O.N.G.C.',
  JSWSTEEL: 'J.S.W. Steel',
  HCLTECH: 'H.C.L. Tech',
  TECHM: 'Tech Mahindra',
};

function toSpokenCompanyName(symbol: string, stocksList: EnrichedStock[]): string {
  const upper = symbol.trim().toUpperCase();
  if (SPOKEN_TICKER_NAMES[upper]) {
    return SPOKEN_TICKER_NAMES[upper];
  }
  const matched = stocksList.find((s) => s.symbol.toUpperCase() === upper);
  if (matched?.name) {
    return matched.name.replace(/\b(Ltd\.?|Limited|Inc\.?|Corp\.?)\b/gi, '').replace(/\s+/g, ' ').trim();
  }
  return upper;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeScriptForSpeech(raw: string, stocksList: EnrichedStock[]): string {
  let out = raw.replace(/\s+/g, ' ').trim();
  if (!out) return '';

  out = out.replace(/\bNWS\s+20\b/g, 'N.W.S. Twenty');
  out = out.replace(/\bNWS\b/g, 'N.W.S.');
  out = out.replace(/₹\s*(\d[\d,]*(?:\.\d+)?)/g, '$1 rupees');
  out = out.replace(/\bINR\b/g, 'rupees');

  // Replace uppercase ticker symbols inside news headlines/summaries with natural company names
  const tickerSet = new Set<string>([
    ...Object.keys(SPOKEN_TICKER_NAMES),
    ...stocksList.map((s) => s.symbol.toUpperCase()),
  ]);
  for (const sym of tickerSet) {
    if (sym.length < 2) continue;
    const spoken = toSpokenCompanyName(sym, stocksList);
    if (spoken !== sym) {
      out = out.replace(new RegExp(`\\b${escapeRegExp(sym)}\\b`, 'g'), spoken);
    }
  }

  return out.replace(/\s+/g, ' ').trim();
}

function decodeBase64AudioBlob(base64: string, mimeType: string): Blob {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'audio/wav' });
}

function scoreMaleVoice(v: SpeechSynthesisVoice): number {
  const lang = v.lang.toLowerCase();
  if (!lang.startsWith('en')) return -1000;

  let score = 0;
  const lowName = v.name.toLowerCase();
  const male = isExplicitMaleVoice(v);
  const female = isExplicitFemaleVoice(v);

  if (male && !female) score += 450;
  else if (female) score -= 700;

  // Strongly prefer modern neural/natural voices over robotic legacy SAPI voices
  if (/(online|natural|neural)/i.test(lowName)) score += 190;
  else if (/google/i.test(lowName)) score += 130;

  // Accent priority for an Indian financial news anchor
  if (lang.includes('en-in')) score += 110;
  else if (lang.includes('en-gb')) score += 65;
  else if (lang.includes('en-au')) score += 35;
  else if (lang.includes('en-us')) score += 15;

  if (v.localService) score += 5;
  return score;
}

// Preserve full sentences up to 175 chars for natural broadcast accent & intonation, while preventing Chromium's 15s utterance timeout
function splitSpeechChunks(script: string): string[] {
  const normalized = script.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const segments: string[] = [];

  for (const sentence of sentences) {
    if (sentence.length <= 175) {
      segments.push(sentence);
      continue;
    }
    const clauses = sentence.split(/(?<=[,;:])\s+/).filter(Boolean);
    for (const clause of clauses) {
      if (clause.length <= 165) {
        segments.push(clause);
        continue;
      }
      const words = clause.split(/\s+/);
      let buf = '';
      for (const word of words) {
        if (buf && `${buf} ${word}`.length > 155) {
          segments.push(buf);
          buf = word;
        } else {
          buf = buf ? `${buf} ${word}` : word;
        }
      }
      if (buf) segments.push(buf);
    }
  }

  return segments.length > 0 ? segments : [normalized];
}

export const LedBoardPage: React.FC = () => {
  const { isAdmin, authLoading, stocks, prices, settings, navigate, loginAdminWithGoogle } =
    useExchange();

  const [allInvestors, setAllInvestors] = useState<Investor[]>([]);
  const [allHoldings, setAllHoldings] = useState<PortfolioHolding[]>([]);
  const [clock, setClock] = useState<string>(() =>
    new Date().toLocaleTimeString('en-IN', { hour12: true })
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [indexChartType, setIndexChartType] = useState<IndexChartType>('line');

  // News Anchor Voice & Lip-Sync State
  const [anchorAudioOn, setAnchorAudioOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [spokenWord, setSpokenWord] = useState<string>('');
  const [currentSpokenScript, setCurrentSpokenScript] = useState<string>('');
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>(DEFAULT_STUDIO_VOICE);

  const anchorAudioOnRef = useRef<boolean>(false);
  anchorAudioOnRef.current = anchorAudioOn;
  const selectedVoiceUriRef = useRef<string>(DEFAULT_STUDIO_VOICE);
  selectedVoiceUriRef.current = selectedVoiceUri;
  const userPickedVoiceRef = useRef<boolean>(false);
  const forceLocalFallbackRef = useRef<boolean>(false);
  const studioUnavailableRef = useRef<boolean>(false);

  const lastSpokenNewsIdRef = useRef<string>('');
  const bulletinCycleIdxRef = useRef<number>(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const wordSyncTimerRef = useRef<number | null>(null);
  const speakTokenRef = useRef<number>(0);
  const cancelTimerRef = useRef<number | null>(null);
  const nextBulletinTimerRef = useRef<number | null>(null);
  const healthMonitorRef = useRef<number | null>(null);
  const chunkStartedAtRef = useRef<number>(0);
  const chunkStartedSpeakingRef = useRef<boolean>(false);

  const latestSettingsRef = useRef(settings);
  latestSettingsRef.current = settings;
  const latestStocksRef = useRef(stocks);
  latestStocksRef.current = stocks;

  // Live clock
  useEffect(() => {
    const t = window.setInterval(() => {
      setClock(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  // Load & track browser SpeechSynthesis voices (for instant local male failover or explicit selection)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      const all = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
      all.sort((a, b) => scoreMaleVoice(b) - scoreMaleVoice(a));

      // Keep known female voices out of the male anchor selector when non-female voices exist
      const nonFemale = all.filter((v) => !isExplicitFemaleVoice(v));
      const listForMaleAnchor = nonFemale.length > 0 ? nonFemale : all;

      setAvailableVoices(listForMaleAnchor);
      setSelectedVoiceUri((prev) => {
        if (prev.startsWith(STUDIO_VOICE_PREFIX)) return prev;
        if (userPickedVoiceRef.current && prev && listForMaleAnchor.some((v) => v.voiceURI === prev)) {
          return prev;
        }
        return listForMaleAnchor[0]?.voiceURI || DEFAULT_STUDIO_VOICE;
      });
    };

    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      synth.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, []);

  // Admin-only listeners for Top Investors Leaderboard
  useEffect(() => {
    if (!isAdmin) return;
    const unsubInv = onSnapshot(
      query(collection(db, 'investors'), where('isDisabled', 'in', [false, true])),
      (snap) => {
        setAllInvestors(snap.docs.map((d) => d.data() as Investor));
      },
      (err) => {
        if (isQuotaExceededError(err)) {
          console.warn('LED Board leaderboard sync paused due to Firestore daily quota.');
          return;
        }
        handleFirestoreError(err, OperationType.LIST, 'investors');
      }
    );
    const unsubPort = onSnapshot(
      query(collection(db, 'portfolios'), where('quantity', '>=', 0)),
      (snap) => {
        setAllHoldings(snap.docs.map((d) => d.data() as PortfolioHolding));
      },
      (err) => {
        if (isQuotaExceededError(err)) {
          console.warn('LED Board holdings sync paused due to Firestore daily quota.');
          return;
        }
        handleFirestoreError(err, OperationType.LIST, 'portfolios');
      }
    );
    return () => {
      unsubInv();
      unsubPort();
    };
  }, [isAdmin]);

  const clearSpeechTimers = useCallback(() => {
    if (cancelTimerRef.current) {
      window.clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }
    if (nextBulletinTimerRef.current) {
      window.clearTimeout(nextBulletinTimerRef.current);
      nextBulletinTimerRef.current = null;
    }
    if (healthMonitorRef.current) {
      window.clearInterval(healthMonitorRef.current);
      healthMonitorRef.current = null;
    }
    if (wordSyncTimerRef.current) {
      window.clearInterval(wordSyncTimerRef.current);
      wordSyncTimerRef.current = null;
    }
  }, []);

  const stopStudioPlayback = useCallback(() => {
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (audioElRef.current) {
      try {
        audioElRef.current.pause();
        audioElRef.current.onended = null;
        audioElRef.current.onerror = null;
        audioElRef.current.removeAttribute('src');
        audioElRef.current.load();
      } catch {
        // ignore audio teardown errors
      }
      audioElRef.current = null;
    }
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current);
      audioObjectUrlRef.current = null;
    }
  }, []);

  const stopSpeech = useCallback(() => {
    speakTokenRef.current += 1;
    clearSpeechTimers();
    stopStudioPlayback();
    utteranceRef.current = null;
    chunkStartedSpeakingRef.current = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore synthesis cancel errors
      }
    }
    setIsSpeaking(false);
    setSpokenWord('');
  }, [clearSpeechTimers, stopStudioPlayback]);

  // Build rotating live financial broadcast scripts with spoken company names (news + index + market movers)
  const buildNextBulletinScript = useCallback((greet = false): string => {
    const cur = latestSettingsRef.current;
    const allStocks = latestStocksRef.current.filter((s) => s.isActive);
    const newsQueue =
      cur.recentNews && cur.recentNews.length > 0
        ? cur.recentNews
        : cur.activeNews
          ? [cur.activeNews]
          : [];

    const step = bulletinCycleIdxRef.current;
    bulletinCycleIdxRef.current += 1;

    const idxDelta = cur.indexValue - cur.indexPrevClose;
    const idxDir = idxDelta >= 0 ? 'up' : 'down';
    const idxPct = cur.indexPrevClose > 0 ? Math.abs((idxDelta / cur.indexPrevClose) * 100) : 0;
    const sortedByGain = [...allStocks].sort((a, b) => b.changePct - a.changePct);
    const topGainer = sortedByGain[0];
    const topLoser = sortedByGain[sortedByGain.length - 1];

    if (greet) {
      if (cur.activeNews) {
        const companyName = toSpokenCompanyName(cur.activeNews.targetSymbol, allStocks);
        const impactWord = cur.activeNews.impactPct >= 0 ? 'surge' : 'slide';
        return normalizeScriptForSpeech(
          `Good day, I'm Arjun Verma, live from the N.W.S. Business Desk. ${cur.activeNews.headline}. ${cur.activeNews.summary} Shares of ${companyName} ${impactWord} ${Math.abs(cur.activeNews.impactPct).toFixed(1)} percent.`,
          allStocks
        );
      }
      return normalizeScriptForSpeech(
        `Good day, I'm Arjun Verma, live from the N.W.S. Business Desk. The N.W.S. Twenty Composite Index stands at ${cur.indexValue.toFixed(2)}, ${idxDir} ${idxPct.toFixed(2)} percent. Market status is currently ${cur.status.toLowerCase()}.`,
        allStocks
      );
    }

    // Rotate between Market Summary + Movers and News Desk Bulletins for continuous broadcast
    if (step % 3 === 0 || newsQueue.length === 0) {
      const moverText =
        topGainer && topLoser
          ? ` Leading the board, ${toSpokenCompanyName(topGainer.symbol, allStocks)} is ${topGainer.changePct >= 0 ? 'up' : 'down'} ${Math.abs(topGainer.changePct).toFixed(1)} percent at ${topGainer.currentPrice.toFixed(0)} rupees, while ${toSpokenCompanyName(topLoser.symbol, allStocks)} trades at ${topLoser.currentPrice.toFixed(0)} rupees.`
          : '';
      return normalizeScriptForSpeech(
        `N.W.S. Exchange Market Pulse. The N.W.S. Twenty Composite Index is at ${cur.indexValue.toFixed(2)}, ${idxDir} ${idxPct.toFixed(2)} percent for the session.${moverText}`,
        allStocks
      );
    }

    const item = newsQueue[step % newsQueue.length];
    const companyName = toSpokenCompanyName(item.targetSymbol, allStocks);
    const impactWord = item.impactPct >= 0 ? 'rallies' : 'dips';
    return normalizeScriptForSpeech(
      `N.W.S. ${item.sector} Desk Update. ${item.headline}. ${item.summary} ${companyName} ${impactWord} ${Math.abs(item.impactPct).toFixed(1)} percent.`,
      allStocks
    );
  }, []);

  // Resilient browser male speech fallback (natural Indian/UK male scoring, clean pitch, and stall recovery)
  const speakWithBrowserFallback = useCallback(
    (script: string, token: number, options?: { onEnd?: () => void }) => {
      if (speakTokenRef.current !== token) return;
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setAudioNotice('Browser speech synthesis is not supported in this browser.');
        return;
      }

      const synth = window.speechSynthesis;
      const chunks = splitSpeechChunks(script);
      if (chunks.length === 0) {
        options?.onEnd?.();
        return;
      }

      let activeChunkIdx = 0;

      const pickVoice = (): SpeechSynthesisVoice | undefined => {
        const allVoices = synth.getVoices();
        const enVoices = allVoices.filter((v) => v.lang.toLowerCase().startsWith('en'));
        const pool = enVoices.length > 0 ? enVoices : allVoices;

        if (forceLocalFallbackRef.current) {
          const localMale = [...pool]
            .filter((v) => v.localService && !isExplicitFemaleVoice(v))
            .sort((a, b) => scoreMaleVoice(b) - scoreMaleVoice(a))[0];
          if (localMale) return localMale;

          const localAny = [...pool]
            .filter((v) => v.localService)
            .sort((a, b) => scoreMaleVoice(b) - scoreMaleVoice(a))[0];
          if (localAny) return localAny;
        }

        if (!selectedVoiceUriRef.current.startsWith(STUDIO_VOICE_PREFIX)) {
          const chosenSelected = pool.find((v) => v.voiceURI === selectedVoiceUriRef.current);
          if (
            chosenSelected &&
            (userPickedVoiceRef.current || !isExplicitFemaleVoice(chosenSelected))
          ) {
            return chosenSelected;
          }
        }
        return [...pool].sort((a, b) => scoreMaleVoice(b) - scoreMaleVoice(a))[0];
      };

      const speakChunk = (chunkIdx: number) => {
        if (speakTokenRef.current !== token) return;
        activeChunkIdx = chunkIdx;

        if (chunkIdx >= chunks.length) {
          clearSpeechTimers();
          utteranceRef.current = null;
          chunkStartedSpeakingRef.current = false;
          setIsSpeaking(false);
          setSpokenWord('');
          options?.onEnd?.();
          return;
        }

        const chunkText = chunks[chunkIdx];
        const utter = new SpeechSynthesisUtterance(chunkText);
        utteranceRef.current = utter;
        utter.volume = 1;

        const chosen = pickVoice();
        if (chosen) {
          utter.voice = chosen;
          utter.lang = chosen.lang || 'en-IN';
          if (isExplicitMaleVoice(chosen) && !isExplicitFemaleVoice(chosen)) {
            // Preserve authentic Indian/UK accent without robotic pitch warping
            utter.pitch = 0.92;
            utter.rate = 0.99;
          } else if (isExplicitFemaleVoice(chosen)) {
            // Last-resort device fallback when zero non-female voices exist
            utter.pitch = 0.72;
            utter.rate = 0.96;
          } else {
            utter.pitch = 0.78;
            utter.rate = 0.97;
          }
        } else {
          utter.lang = 'en-IN';
          utter.pitch = 0.78;
          utter.rate = 0.97;
        }

        chunkStartedAtRef.current = Date.now();
        chunkStartedSpeakingRef.current = false;

        utter.onstart = () => {
          if (speakTokenRef.current !== token) return;
          chunkStartedSpeakingRef.current = true;
          chunkStartedAtRef.current = Date.now();
          setIsSpeaking(true);
          setSpokenWord(chunkText.split(/\s+/)[0] || 'Live');
        };

        utter.onboundary = (event) => {
          if (speakTokenRef.current !== token) return;
          if (typeof event.charIndex === 'number') {
            const slice = chunkText.slice(event.charIndex);
            const match = slice.match(/^([A-Za-z0-9₹%.\-]+)/);
            if (match && match[1]) {
              setSpokenWord(match[1]);
            }
          }
        };

        utter.onend = () => {
          if (speakTokenRef.current !== token) return;
          chunkStartedSpeakingRef.current = false;
          speakChunk(chunkIdx + 1);
        };

        utter.onerror = (ev) => {
          if (speakTokenRef.current !== token) return;
          if (ev.error === 'interrupted' || ev.error === 'canceled') return;

          if (ev.error === 'not-allowed') {
            clearSpeechTimers();
            utteranceRef.current = null;
            setIsSpeaking(false);
            setSpokenWord('');
            setAudioNotice('Browser blocked autoplay. Click Speak to play anchor voice.');
            return;
          }

          if (!forceLocalFallbackRef.current) {
            forceLocalFallbackRef.current = true;
            window.setTimeout(() => speakChunk(chunkIdx), 120);
            return;
          }

          window.setTimeout(() => speakChunk(chunkIdx + 1), 150);
        };

        try {
          if (synth.paused) synth.resume();
          synth.speak(utter);
          setIsSpeaking(true);
        } catch {
          setIsSpeaking(false);
        }
      };

      healthMonitorRef.current = window.setInterval(() => {
        if (speakTokenRef.current !== token) return;

        if (synth.speaking && synth.paused) {
          synth.resume();
        }

        const elapsed = Date.now() - chunkStartedAtRef.current;
        const currentChunk = chunks[activeChunkIdx] || '';
        const maxChunkMs = Math.max(9000, currentChunk.length * 120 + 4000);

        if (
          utteranceRef.current &&
          !synth.speaking &&
          !synth.pending &&
          elapsed > 2400
        ) {
          if (!chunkStartedSpeakingRef.current && !forceLocalFallbackRef.current) {
            forceLocalFallbackRef.current = true;
            speakChunk(activeChunkIdx);
          } else {
            speakChunk(activeChunkIdx + 1);
          }
          return;
        }

        if (utteranceRef.current && elapsed > maxChunkMs) {
          try {
            synth.cancel();
          } catch {
            // ignore
          }
          cancelTimerRef.current = window.setTimeout(() => {
            if (speakTokenRef.current === token) {
              speakChunk(activeChunkIdx + 1);
            }
          }, 110);
        }
      }, 750);

      if (synth.speaking || synth.pending) {
        try {
          synth.cancel();
        } catch {
          // ignore
        }
        cancelTimerRef.current = window.setTimeout(() => speakChunk(0), 110);
      } else {
        speakChunk(0);
      }
    },
    [clearSpeechTimers]
  );

  // Studio-first anchor speech: uses natural Indian-English male Gemini TTS (/api/anchor-tts) with instant browser male failover
  const speakScript = useCallback(
    (script: string, options?: { onEnd?: () => void }) => {
      const token = speakTokenRef.current + 1;
      speakTokenRef.current = token;
      clearSpeechTimers();
      stopStudioPlayback();
      utteranceRef.current = null;
      chunkStartedSpeakingRef.current = false;
      setAudioNotice(null);

      const normalized = script.replace(/\s+/g, ' ').trim();
      if (!normalized) {
        options?.onEnd?.();
        return;
      }

      setCurrentSpokenScript(normalized);

      const selectedUri = selectedVoiceUriRef.current;
      const useStudio = selectedUri.startsWith(STUDIO_VOICE_PREFIX) && !studioUnavailableRef.current;

      if (!useStudio) {
        speakWithBrowserFallback(normalized, token, options);
        return;
      }

      const studioVoice =
        STUDIO_VOICES.find((v) => v.id === selectedUri)?.voiceName || 'Charon';

      const controller = new AbortController();
      ttsAbortRef.current = controller;

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }

      const words = normalized
        .replace(/[^A-Za-z0-9₹%.\-\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

      void (async () => {
        try {
          const res = await fetch('/api/anchor-tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: normalized, voiceName: studioVoice }),
            signal: controller.signal,
          });

          if (speakTokenRef.current !== token) return;

          const contentType = res.headers.get('content-type') || '';
          if (!res.ok || !contentType.includes('application/json')) {
            if (res.status === 404 || res.status === 503 || !contentType.includes('application/json')) {
              studioUnavailableRef.current = true;
            }
            ttsAbortRef.current = null;
            speakWithBrowserFallback(normalized, token, options);
            return;
          }

          const data = (await res.json()) as {
            audioBase64?: string;
            mimeType?: string;
            fallbackToBrowser?: boolean;
          };

          if (speakTokenRef.current !== token) return;

          if (!data.audioBase64 || data.fallbackToBrowser) {
            ttsAbortRef.current = null;
            speakWithBrowserFallback(normalized, token, options);
            return;
          }

          ttsAbortRef.current = null;
          const audioBlob = decodeBase64AudioBlob(data.audioBase64, data.mimeType || 'audio/wav');
          const objectUrl = URL.createObjectURL(audioBlob);
          audioObjectUrlRef.current = objectUrl;

          const audio = new Audio(objectUrl);
          audioElRef.current = audio;

          audio.onplay = () => {
            if (speakTokenRef.current !== token) return;
            setIsSpeaking(true);
            setSpokenWord(words[0] || 'Live');
            if (wordSyncTimerRef.current) window.clearInterval(wordSyncTimerRef.current);
            wordSyncTimerRef.current = window.setInterval(() => {
              if (speakTokenRef.current !== token || !audioElRef.current) return;
              const dur = audioElRef.current.duration;
              if (Number.isFinite(dur) && dur > 0 && words.length > 0) {
                const progress = Math.min(0.999, Math.max(0, audioElRef.current.currentTime / dur));
                const wordIdx = Math.min(words.length - 1, Math.floor(progress * words.length));
                setSpokenWord(words[wordIdx]);
              }
            }, 95);
          };

          audio.onended = () => {
            if (speakTokenRef.current !== token) return;
            clearSpeechTimers();
            stopStudioPlayback();
            setIsSpeaking(false);
            setSpokenWord('');
            options?.onEnd?.();
          };

          audio.onerror = () => {
            if (speakTokenRef.current !== token) return;
            clearSpeechTimers();
            stopStudioPlayback();
            speakWithBrowserFallback(normalized, token, options);
          };

          await audio.play();
        } catch (err) {
          if (speakTokenRef.current !== token) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          ttsAbortRef.current = null;
          stopStudioPlayback();
          speakWithBrowserFallback(normalized, token, options);
        }
      })();
    },
    [clearSpeechTimers, speakWithBrowserFallback, stopStudioPlayback]
  );

  // Chain next bulletin seamlessly with a brief 900ms studio breath while Anchor Audio is ON
  const runContinuousCycle = useCallback(
    (greet = false) => {
      if (!anchorAudioOnRef.current) return;
      const script = buildNextBulletinScript(greet);
      speakScript(script, {
        onEnd: () => {
          if (!anchorAudioOnRef.current) return;
          nextBulletinTimerRef.current = window.setTimeout(() => {
            if (anchorAudioOnRef.current) {
              runContinuousCycle(false);
            }
          }, 900);
        },
      });
    },
    [buildNextBulletinScript, speakScript]
  );

  // Interrupt immediately when a genuinely NEW breaking headline arrives while Anchor Audio is ON
  useEffect(() => {
    if (!isAdmin || !anchorAudioOn || !settings.activeNews) return;
    if (lastSpokenNewsIdRef.current === settings.activeNews.id) return;

    lastSpokenNewsIdRef.current = settings.activeNews.id;
    const n = settings.activeNews;
    const allStocks = latestStocksRef.current.filter((s) => s.isActive);
    const companyName = toSpokenCompanyName(n.targetSymbol, allStocks);
    const impactWord = n.impactPct >= 0 ? 'surge' : 'slide';
    const breakingScript = normalizeScriptForSpeech(
      `Breaking News from the N.W.S. Business Desk. ${n.headline}. ${n.summary} Shares of ${companyName} ${impactWord} ${Math.abs(n.impactPct).toFixed(1)} percent.`,
      allStocks
    );

    speakScript(breakingScript, {
      onEnd: () => {
        if (!anchorAudioOnRef.current) return;
        nextBulletinTimerRef.current = window.setTimeout(() => {
          if (anchorAudioOnRef.current) {
            runContinuousCycle(false);
          }
        }, 900);
      },
    });
  }, [isAdmin, anchorAudioOn, settings.activeNews, speakScript, runContinuousCycle]);

  // Safety-net watchdog: if anchorAudioOn is ON and speech unexpectedly sits idle, resume cycle
  useEffect(() => {
    if (!isAdmin || !anchorAudioOn) {
      stopSpeech();
      return;
    }

    const safetyNet = window.setInterval(() => {
      if (!anchorAudioOnRef.current) return;
      if (audioElRef.current || ttsAbortRef.current) return;
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const synth = window.speechSynthesis;
      if (!synth.speaking && !synth.pending && !utteranceRef.current && !nextBulletinTimerRef.current) {
        runContinuousCycle(false);
      }
    }, 3500);

    return () => {
      window.clearInterval(safetyNet);
    };
  }, [isAdmin, anchorAudioOn, runContinuousCycle, stopSpeech]);

  // Stop speech cleanly when leaving LED board
  useEffect(() => {
    return () => stopSpeech();
  }, [stopSpeech]);

  const handleToggleAnchorAudio = () => {
    const next = !anchorAudioOn;
    if (!next) {
      anchorAudioOnRef.current = false;
      setAnchorAudioOn(false);
      stopSpeech();
      return;
    }
    forceLocalFallbackRef.current = false;
    lastSpokenNewsIdRef.current = settings.activeNews?.id || '__initial__';
    anchorAudioOnRef.current = true;
    setAnchorAudioOn(true);
    runContinuousCycle(true);
  };

  const handleSpeakNow = () => {
    forceLocalFallbackRef.current = false;
    lastSpokenNewsIdRef.current = settings.activeNews?.id || '__manual__';
    anchorAudioOnRef.current = true;
    if (!anchorAudioOn) setAnchorAudioOn(true);
    runContinuousCycle(true);
  };

  const handleNextBulletin = () => {
    forceLocalFallbackRef.current = false;
    anchorAudioOnRef.current = true;
    if (!anchorAudioOn) setAnchorAudioOn(true);
    runContinuousCycle(false);
  };

  const handleVoiceChange = (nextUri: string) => {
    forceLocalFallbackRef.current = false;
    if (nextUri.startsWith(STUDIO_VOICE_PREFIX)) {
      studioUnavailableRef.current = false;
    }
    userPickedVoiceRef.current = true;
    selectedVoiceUriRef.current = nextUri;
    setSelectedVoiceUri(nextUri);
    if (anchorAudioOnRef.current) {
      runContinuousCycle(false);
    }
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  // Selected 10-12 companies for LED Board
  const ledStocks = useMemo(() => {
    const active = stocks.filter((s) => s.isActive);
    const chosenSet = new Set(settings.ledSymbols || []);
    const matched = active.filter((s) => chosenSet.has(s.symbol));
    return (matched.length > 0 ? matched : active).slice(0, 12);
  }, [stocks, settings.ledSymbols]);

  // Single Composite NWS 20 Index trajectory across all active listed companies
  const compositeIndexSeries = useMemo<IndexPoint[]>(
    () => buildCompositeIndexSeries(stocks, settings, 28),
    [stocks, settings]
  );

  const marketSummary = useMemo(() => {
    const active = stocks.filter((s) => s.isActive);
    const advancers = active.filter((s) => s.changePct >= 0).length;
    const decliners = active.length - advancers;
    const values = [...compositeIndexSeries.map((p) => p.value), settings.indexValue];
    const sessionHigh = values.length > 0 ? Math.max(...values) : settings.indexValue;
    const sessionLow = values.length > 0 ? Math.min(...values) : settings.indexValue;
    const topMover =
      [...active].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0] || null;
    return {
      activeCount: active.length,
      advancers,
      decliners,
      sessionHigh,
      sessionLow,
      topMover,
    };
  }, [stocks, compositeIndexSeries, settings.indexValue]);

  // Top Investors Leaderboard (Bottom-Right Panel)
  const topInvestors = useMemo(() => {
    const holdingsByUid: Record<string, PortfolioHolding[]> = {};
    for (const h of allHoldings) {
      if (h.quantity <= 0) continue;
      if (!holdingsByUid[h.investorUid]) holdingsByUid[h.investorUid] = [];
      holdingsByUid[h.investorUid].push(h);
    }

    return allInvestors
      .filter((inv) => !inv.isDisabled)
      .map((inv) => {
        const invHoldings = holdingsByUid[inv.uid] || [];
        const holdingsVal = invHoldings.reduce((sum, h) => {
          const liveP = prices[h.symbol]?.currentPrice ?? h.averageBuyPrice;
          return sum + h.quantity * liveP;
        }, 0);
        const netWorth = inv.balance + holdingsVal;
        const roiPct =
          inv.initialBalance > 0
            ? ((netWorth - inv.initialBalance) / inv.initialBalance) * 100
            : 0;
        return {
          ...inv,
          holdingsVal,
          netWorth,
          roiPct,
        };
      })
      .sort((a, b) => b.netWorth - a.netWorth)
      .slice(0, 6);
  }, [allInvestors, allHoldings, prices]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0A192F] flex items-center justify-center font-medium">
        Verifying Exchange Administrator Session...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0A192F] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4">
          <Lock className="w-10 h-10 text-amber-600 mx-auto" />
          <h1 className="text-xl font-bold text-[#0A192F]">
            Admin Access Only — Live LED Market Board
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            The Live LED Market Board is restricted exclusively to authorized NWS Stock Exchange
            Administrators inside the Admin Console.
          </p>
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              onClick={() => navigate('admin')}
              className="w-full py-2.5 px-4 bg-[#0A192F] text-white text-xs font-bold rounded-lg hover:bg-[#13294B] cursor-pointer"
            >
              Sign in with Admin Password
            </button>
            <button
              onClick={() => void loginAdminWithGoogle()}
              className="w-full py-2.5 px-4 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Owner Google Sign-In
            </button>
            <button
              onClick={() => navigate('home')}
              className="w-full py-2 px-4 text-slate-500 text-xs font-medium hover:text-[#0A192F] cursor-pointer"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const indexDelta = Number((settings.indexValue - settings.indexPrevClose).toFixed(2));
  const indexPct =
    settings.indexPrevClose > 0
      ? Number(((indexDelta / settings.indexPrevClose) * 100).toFixed(2))
      : 0;
  const indexPos = indexDelta >= 0;

  return (
    <div className="min-h-screen lg:h-screen w-full lg:overflow-hidden bg-[#F1F5F9] text-[#0A192F] flex flex-col p-2.5 sm:p-3 gap-2.5 select-none">
      {/* Crisp White Institutional Broadcast Header */}
      <header className="shrink-0 bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <span className="text-sm sm:text-base font-extrabold tracking-tight text-[#0A192F] whitespace-nowrap shrink-0">
            NWS STOCK EXCHANGE
          </span>

          <div className="h-4 w-px bg-slate-200 hidden sm:block shrink-0" />

          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500 whitespace-nowrap">
              NWS 20
            </span>
            <span className="text-base sm:text-xl font-bold font-mono-num text-[#0A192F] whitespace-nowrap">
              {formatIndianNumber(settings.indexValue, 2)}
            </span>
            <span
              className={`text-xs sm:text-sm font-bold font-mono-num whitespace-nowrap ${
                indexPos ? 'text-green-700' : 'text-red-600'
              }`}
            >
              {indexPos ? '▲' : '▼'} {indexDelta >= 0 ? '+' : ''}
              {indexDelta.toFixed(2)} ({formatSignedPct(indexPct)})
            </span>
          </div>

          <div className="hidden xl:flex items-center gap-2 text-xs text-slate-500 font-mono-num whitespace-nowrap">
            <span aria-hidden="true">·</span>
            <span
              className={`font-semibold ${
                settings.status === 'OPEN'
                  ? 'text-green-700'
                  : settings.status === 'PAUSED'
                    ? 'text-amber-700'
                    : 'text-red-600'
              }`}
            >
              Market {settings.status}
            </span>
            <span aria-hidden="true">·</span>
            <span>{clock}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleToggleAnchorAudio}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              anchorAudioOn
                ? 'bg-green-700 border-green-700 text-white hover:bg-green-800'
                : 'bg-[#0A192F] border-[#0A192F] text-white hover:bg-[#13294B]'
            }`}
          >
            {anchorAudioOn ? (
              <Volume2 className="w-3.5 h-3.5" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {anchorAudioOn ? 'AI Anchor: On Air' : 'Enable Anchor Voice'}
            </span>
            <span className="sm:hidden">{anchorAudioOn ? 'On Air' : 'Voice'}</span>
          </button>

          <button
            onClick={() => void toggleFullscreen()}
            aria-label="Toggle fullscreen"
            className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 hover:border-slate-300 cursor-pointer shrink-0"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={() => navigate('admin')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        </div>
      </header>

      {/* Proportional 12-Column White Broadcast Wallboard Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[minmax(0,1.18fr)_minmax(0,1fr)] gap-2.5">
        {/* TOP-LEFT (7 cols): Single Composite NWS 20 Composite Index Graph across all companies */}
        <section className="lg:col-span-7 min-h-[290px] lg:min-h-0 min-w-0 h-full bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 pb-2 mb-2 border-b border-slate-100 shrink-0">
            <div className="flex items-baseline gap-2.5 min-w-0">
              <h2 className="text-sm font-bold text-[#0A192F] truncate">
                NWS 20 Composite Index
              </h2>
              <span className="text-xs text-slate-500 hidden xl:inline truncate">
                Market-cap weighted benchmark across all {marketSummary.activeCount} companies
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-baseline gap-2 text-xs font-mono-num">
                <span className="font-bold text-[#0A192F]">
                  {formatIndianNumber(settings.indexValue, 2)}
                </span>
                <span className={indexPos ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}>
                  {indexPos ? '▲' : '▼'} {formatSignedPct(indexPct)}
                </span>
              </div>

              <div
                role="group"
                aria-label="LED Index Chart Type"
                className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg"
              >
                {(
                  [
                    { id: 'line', label: 'Line' },
                    { id: 'candlestick', label: 'Candlestick' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setIndexChartType(opt.id)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      indexChartType === opt.id
                        ? 'bg-white text-[#0A192F] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <IndexChart
            data={compositeIndexSeries}
            prevClose={settings.indexPrevClose}
            currentValue={settings.indexValue}
            chartType={indexChartType}
            className="flex-1 min-h-0"
          />

          {/* Clean Index Breadth & Session Telemetry Strip */}
          <div className="shrink-0 pt-2.5 mt-1.5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500">Previous Close</div>
              <div className="font-mono-num font-bold text-[#0A192F] truncate">
                {formatIndianNumber(settings.indexPrevClose, 2)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500">Session High / Low</div>
              <div className="font-mono-num font-bold text-[#0A192F] truncate">
                {formatIndianNumber(marketSummary.sessionHigh, 0)} /{' '}
                {formatIndianNumber(marketSummary.sessionLow, 0)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500">Market Breadth</div>
              <div className="font-mono-num font-bold truncate">
                <span className="text-green-700">{marketSummary.advancers} Adv</span>
                <span className="text-slate-300 mx-1">·</span>
                <span className="text-red-600">{marketSummary.decliners} Dec</span>
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500">Top Mover</div>
              {marketSummary.topMover ? (
                <div className="font-mono-num font-bold truncate">
                  <span className="text-[#0A192F]">{marketSummary.topMover.symbol}</span>{' '}
                  <span
                    className={
                      marketSummary.topMover.changePct >= 0 ? 'text-green-700' : 'text-red-600'
                    }
                  >
                    {formatSignedPct(marketSummary.topMover.changePct)}
                  </span>
                </div>
              ) : (
                <div className="font-mono-num font-bold text-slate-400">—</div>
              )}
            </div>
          </div>
        </section>

        {/* TOP-RIGHT (5 cols): 2-Column Edge-to-Edge Live Companies & Share Prices */}
        <section className="lg:col-span-5 min-h-[280px] lg:min-h-0 min-w-0 h-full bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100 shrink-0">
            <h2 className="text-sm font-bold text-[#0A192F] truncate">
              Companies & Live Quotes
            </h2>
            <span className="text-xs font-mono-num text-slate-500 shrink-0">
              {ledStocks.length} Tickers · INR
            </span>
          </div>

          <div className="grid grid-cols-2 auto-rows-fr gap-2 flex-1 min-h-0">
            {ledStocks.map((stock) => {
              const pos = stock.changePct >= 0;
              return (
                <div
                  key={stock.symbol}
                  className="rounded-lg px-2.5 py-1.5 border border-slate-200 bg-white flex items-center justify-between gap-2 min-h-0"
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold font-mono-num text-[#0A192F] truncate">
                      {stock.symbol}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{stock.name}</div>
                  </div>
                  <div className="text-right shrink-0 font-mono-num">
                    <div className="text-xs sm:text-sm font-bold text-[#0A192F]">
                      {formatINR(stock.currentPrice)}
                    </div>
                    <div
                      className={`text-[11px] font-bold ${
                        pos ? 'text-green-700' : 'text-red-600'
                      }`}
                    >
                      {pos ? '▲ ' : '▼ '}
                      {formatSignedPct(stock.changePct)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* BOTTOM-LEFT (7 cols): Live Financial News Channel & Lip-Synced AI Male Anchor */}
        <section className="lg:col-span-7 min-h-[260px] lg:min-h-0 min-w-0 h-full bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2.5 shrink-0">
            <div className="flex items-center gap-2 text-sm font-bold text-[#0A192F] min-w-0">
              <Newspaper className="w-4 h-4 text-[#0A192F] shrink-0" />
              <span className="truncate">NWS Business News Desk</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <select
                aria-label="Select Male Anchor Voice"
                value={selectedVoiceUri}
                onChange={(e) => handleVoiceChange(e.target.value)}
                className="hidden sm:block max-w-[185px] px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-700 truncate focus:outline-none focus:border-[#0A192F]"
              >
                <optgroup label="Studio Indian-English Male">
                  {STUDIO_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </optgroup>
                {availableVoices.length > 0 && (
                  <optgroup label="Device / Browser Male Voices">
                    {availableVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {isExplicitMaleVoice(v) ? '♂ ' : ''}
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              <button
                type="button"
                onClick={handleSpeakNow}
                title="Speak active bulletin now"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-[11px] font-semibold text-[#0A192F] cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3 h-3" />
                Speak
              </button>

              <button
                type="button"
                onClick={handleNextBulletin}
                title="Skip to next market bulletin"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-[11px] font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
              >
                <SkipForward className="w-3 h-3" />
                Next
              </button>

              <div className="flex items-center gap-1 pl-1 text-[11px] font-mono-num whitespace-nowrap">
                <Radio
                  className={`w-3.5 h-3.5 ${isSpeaking ? 'text-red-600' : 'text-slate-400'}`}
                />
                <span className={isSpeaking ? 'text-red-600 font-bold' : 'text-slate-500'}>
                  {isSpeaking ? 'LIVE' : anchorAudioOn ? 'READY' : 'MUTED'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-12 gap-3.5 items-stretch">
            {/* Lip-Synced AI Male News Anchor Studio Monitor */}
            <div className="col-span-4 min-h-0 h-full">
              <AiNewsAnchor
                isSpeaking={isSpeaking}
                isBreaking={Boolean(settings.activeNews)}
                spokenWord={spokenWord}
                spokenScript={currentSpokenScript}
                sentiment={settings.activeNews?.sentiment || 'NEUTRAL'}
              />
            </div>

            {/* Active Breaking Headline + Price Impact + Bulletins */}
            <div className="col-span-8 flex flex-col justify-between min-h-0 overflow-hidden gap-2">
              {settings.activeNews ? (
                <div className="space-y-1.5 min-h-0 overflow-y-auto pr-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono-num">
                    <span className="font-bold text-red-600 uppercase tracking-wide">
                      Breaking
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-[#0A192F] font-bold">
                      {settings.activeNews.targetSymbol}
                    </span>
                    <span
                      className={`font-bold ${
                        settings.activeNews.impactPct >= 0 ? 'text-green-700' : 'text-red-600'
                      }`}
                    >
                      {settings.activeNews.impactPct >= 0 ? '+' : ''}
                      {settings.activeNews.impactPct.toFixed(1)}%
                    </span>
                    <span aria-hidden="true" className="text-slate-300 hidden sm:inline">
                      ·
                    </span>
                    <span className="text-slate-500 hidden sm:inline">
                      {settings.activeNews.timestampLabel}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base xl:text-lg font-bold text-[#0A192F] leading-snug">
                    {settings.activeNews.headline}
                  </h3>
                  <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed">
                    {settings.activeNews.summary}
                  </p>
                  {audioNotice && (
                    <div className="text-xs text-amber-700 font-medium pt-0.5">
                      {audioNotice}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-slate-500">
                  Awaiting live market news bulletins...
                </div>
              )}

              {/* Recent Headlines Strip */}
              <div className="space-y-1 pt-2 border-t border-slate-100 shrink-0 hidden sm:block">
                <div className="text-[11px] font-semibold text-slate-500">
                  Recent Bulletins
                </div>
                {settings.recentNews &&
                  settings.recentNews.slice(1, 3).map((item) => (
                    <div
                      key={item.id}
                      className="text-xs text-slate-700 truncate font-mono-num"
                    >
                      <span
                        className={
                          item.impactPct >= 0
                            ? 'text-green-700 font-bold'
                            : 'text-red-600 font-bold'
                        }
                      >
                        {item.targetSymbol} {item.impactPct >= 0 ? '+' : ''}
                        {item.impactPct.toFixed(1)}%
                      </span>{' '}
                      <span className="text-slate-400">·</span>{' '}
                      <span className="font-sans text-slate-700">{item.headline}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </section>

        {/* BOTTOM-RIGHT (5 cols): Top Investors Leaderboard */}
        <section className="lg:col-span-5 min-h-[260px] lg:min-h-0 min-w-0 h-full bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <Trophy className="w-4 h-4 text-amber-600 shrink-0" />
              <h2 className="text-sm font-bold text-[#0A192F] truncate">
                Top Investors Leaderboard
              </h2>
            </div>
            <span className="text-xs font-mono-num text-slate-500 shrink-0">
              {allInvestors.length} Active
            </span>
          </div>

          {topInvestors.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500 text-center p-4">
              Investors will appear here automatically as participants register or trade.
            </div>
          ) : (
            <div className="grid auto-rows-fr divide-y divide-slate-100 flex-1 min-h-0">
              {topInvestors.map((inv, idx) => {
                const pos = inv.roiPct >= 0;
                return (
                  <div
                    key={inv.uid}
                    className="py-1.5 px-1 flex items-center justify-between gap-2 min-h-0 hover:bg-slate-50/70 rounded transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold font-mono-num shrink-0 ${
                          idx === 0
                            ? 'bg-[#0A192F] text-white'
                            : idx === 1
                              ? 'bg-slate-200 text-[#0A192F]'
                              : idx === 2
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-[#0A192F] truncate">
                          {inv.name}
                        </div>
                        <div className="text-[11px] font-mono-num text-slate-500 truncate">
                          {inv.investorId} · Cash:{' '}
                          <span className={inv.balance < 0 ? 'text-red-600 font-semibold' : ''}>
                            {formatINR(inv.balance, 0)}
                          </span>{' '}
                          · Eq: {formatINR(inv.holdingsVal, 0)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono-num">
                      <div className="text-xs sm:text-sm font-bold text-[#0A192F]">
                        {formatINR(inv.netWorth, 0)}
                      </div>
                      <div
                        className={`text-[11px] font-bold ${
                          pos ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        {formatSignedPct(inv.roiPct)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
