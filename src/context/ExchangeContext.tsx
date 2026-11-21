import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase/config';
import {
  OperationType,
  formatFriendlyFirestoreError,
  handleFirestoreError,
  isQuotaExceededError,
  withFirestoreTimeout,
} from '../firebase/errorHandling';
import {
  NEWS_HEADLINES,
  SEED_COMPANIES,
  buildInitialCandles,
} from '../data/seedCompanies';
import {
  INDEX_BASE_VALUE,
  calculateNws20Index,
  ensureAdminRecord,
  initializeExchangeDatabase,
  runMarketTick,
  setActivePasswordAdminProof,
} from '../services/marketEngine';
import type {
  AdminAccount,
  AppRoute,
  Company,
  EnrichedStock,
  Investor,
  MarketPrice,
  MarketSettings,
  PortfolioHolding,
  TransactionRecord,
} from '../types/exchange';
import {
  generateAccessCode,
  generateInvestorId,
  normalizeInvestorId,
  sha256Hex,
  slugifyAdminName,
  toAdminDocId,
  toInvestorDocId,
} from '../utils/formatters';

const INVESTOR_STORAGE_KEY = 'nws_investor_session_v1';
const ADMIN_STORAGE_KEY = 'nws_admin_session_v1';
const MARKET_CACHE_KEY = 'nws_market_cache_v1';
const TICK_LEADER_KEY = 'nws_tick_leader_v1';
const TAB_INSTANCE_ID = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface MarketCachePayload {
  companies?: Company[];
  prices?: Record<string, MarketPrice>;
  settings?: MarketSettings | null;
}

interface TickLeaderLease {
  tabId: string;
  expiresAt: number;
  lastTickClientAt?: number;
}

interface StoredInvestorSession {
  uid: string;
  investorId: string;
}

interface StoredAdminSession {
  uid: string;
  displayName: string;
  email: string;
  passwordHash: string;
}

interface ExchangeContextValue {
  route: AppRoute;
  navigate: (nextRoute: AppRoute, symbol?: string) => void;
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;

  // Market data
  companies: Company[];
  prices: Record<string, MarketPrice>;
  stocks: EnrichedStock[];
  settings: MarketSettings;
  isSeededInFirestore: boolean;
  marketLoading: boolean;
  lastTickError: string | null;

  // Auth & Role
  authUser: User | null;
  authLoading: boolean;
  isAdmin: boolean;
  adminUid: string;
  adminDisplayName: string;
  adminIdentifier: string;
  investorProfile: Investor | null;
  holdings: PortfolioHolding[];
  transactions: TransactionRecord[];

  // Actions
  registerInvestorByName: (name: string) => Promise<{
    investorId: string;
    accessCode: string;
    name: string;
    balance: number;
  }>;
  loginInvestor: (params: { name: string; investorId: string; accessCode: string }) => Promise<void>;
  loginAdminWithGoogle: () => Promise<void>;
  loginAdminWithPassword: (adminName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrapExchange: () => Promise<void>;
  isBootstrapping: boolean;
}

const BOOTSTRAP_ADMIN_EMAIL = 'ytscom1@gmail.com';
const BOOTSTRAP_ADMIN_EMAILS = ['ytscom1@gmail.com', 'jay.stud.agrawal@gmail.com'];

const LEGACY_FICTIONAL_SYMBOLS = new Set([
  'BMBL',
  'SFBL',
  'INDC',
  'VJCT',
  'DCMI',
  'AEVM',
  'SGPL',
  'KVPE',
  'ACGL',
  'NFCL',
  'DHVP',
  'AMTL',
  'BRIC',
  'SPLG',
  'VYTC',
  'NVFN',
  'LPST',
  'CHEL',
]);

const FALLBACK_PRICES: Record<string, MarketPrice> = Object.fromEntries(
  SEED_COMPANIES.map((c, idx) => {
    const candles = buildInitialCandles(c.startingPrice, idx + 1);
    return [
      c.symbol,
      {
        symbol: c.symbol,
        currentPrice: c.startingPrice,
        previousClose: c.previousClose,
        dayHigh: Math.max(...candles.map((p) => p.high), c.startingPrice),
        dayLow: Math.min(...candles.map((p) => p.low), c.startingPrice),
        volume: candles.reduce((sum, p) => sum + p.volume, 0),
        candles,
      },
    ];
  })
);

const FALLBACK_SETTINGS: MarketSettings = {
  status: 'PAUSED',
  updateIntervalSec: 45,
  marketBias: 'NEUTRAL',
  indexValue: INDEX_BASE_VALUE,
  indexPrevClose: INDEX_BASE_VALUE,
  indexBaseValue: INDEX_BASE_VALUE,
  indexHistory: [{ label: '09:15', value: INDEX_BASE_VALUE }],
  ledSymbols: SEED_COMPANIES.filter((c) => c.showOnLed).map((c) => c.symbol).slice(0, 12),
  activeNews: {
    id: 'preview-news-1',
    ...NEWS_HEADLINES[0],
    timestampLabel: '09:15:00',
  },
  recentNews: [
    {
      id: 'preview-news-1',
      ...NEWS_HEADLINES[0],
      timestampLabel: '09:15:00',
    },
  ],
};

function parseRouteFromPath(): AppRoute {
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  switch (path) {
    case '/market':
      return 'market';
    case '/companies':
      return 'companies';
    case '/trading':
      return 'trading';
    case '/portfolio':
      return 'portfolio';
    case '/transactions':
      return 'transactions';
    case '/learn':
      return 'learn';
    case '/login':
      return 'login';
    case '/admin':
      return 'admin';
    case '/led':
      return 'led';
    case '/':
    default:
      return 'home';
  }
}

function routeToPath(route: AppRoute): string {
  return route === 'home' ? '/' : `/${route}`;
}

function readStoredJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeMarketCache(patch: Partial<MarketCachePayload>) {
  try {
    const existing = readStoredJson<MarketCachePayload>(MARKET_CACHE_KEY) || {};
    window.localStorage.setItem(
      MARKET_CACHE_KEY,
      JSON.stringify({
        ...existing,
        ...patch,
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

function readTickLeaderLease(): TickLeaderLease | null {
  return readStoredJson<TickLeaderLease>(TICK_LEADER_KEY);
}

function tryAcquireTickLeaderLease(ttlMs: number): boolean {
  try {
    const now = Date.now();
    const current = readTickLeaderLease();
    if (current && current.tabId !== TAB_INSTANCE_ID && current.expiresAt > now) {
      return false;
    }
    window.localStorage.setItem(
      TICK_LEADER_KEY,
      JSON.stringify({
        tabId: TAB_INSTANCE_ID,
        expiresAt: now + ttlMs,
        lastTickClientAt: current?.lastTickClientAt ?? 0,
      })
    );
    return true;
  } catch {
    return true;
  }
}

function markTickLeaderSuccess(ttlMs: number, clientTimeMs: number) {
  try {
    window.localStorage.setItem(
      TICK_LEADER_KEY,
      JSON.stringify({
        tabId: TAB_INSTANCE_ID,
        expiresAt: clientTimeMs + ttlMs,
        lastTickClientAt: clientTimeMs,
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

function releaseTickLeaderLease() {
  try {
    const current = readTickLeaderLease();
    if (current && current.tabId === TAB_INSTANCE_ID) {
      window.localStorage.removeItem(TICK_LEADER_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

const ExchangeContext = createContext<ExchangeContextValue | null>(null);

export const ExchangeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRoute] = useState<AppRoute>(() => parseRouteFromPath());
  const [selectedSymbol, setSelectedSymbol] = useState<string>('RELIANCE');

  const [fsCompanies, setFsCompanies] = useState<Company[]>(
    () => readStoredJson<MarketCachePayload>(MARKET_CACHE_KEY)?.companies || []
  );
  const [fsPrices, setFsPrices] = useState<Record<string, MarketPrice>>(
    () => readStoredJson<MarketCachePayload>(MARKET_CACHE_KEY)?.prices || {}
  );
  const [fsSettings, setFsSettings] = useState<MarketSettings | null>(
    () => readStoredJson<MarketCachePayload>(MARKET_CACHE_KEY)?.settings || null
  );
  const [marketLoading, setMarketLoading] = useState<boolean>(
    () => !(readStoredJson<MarketCachePayload>(MARKET_CACHE_KEY)?.companies?.length)
  );

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isGoogleAdmin, setIsGoogleAdmin] = useState<boolean>(false);
  const [passwordAdminSession, setPasswordAdminSession] = useState<StoredAdminSession | null>(() => {
    const stored = readStoredJson<StoredAdminSession>(ADMIN_STORAGE_KEY);
    if (stored && stored.uid && stored.passwordHash) {
      setActivePasswordAdminProof({
        adminUid: stored.uid,
        passwordHash: stored.passwordHash,
      });
      return stored;
    }
    try {
      window.localStorage.removeItem(ADMIN_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    return null;
  });
  const [activeInvestorUid, setActiveInvestorUid] = useState<string | null>(
    () => readStoredJson<StoredInvestorSession>(INVESTOR_STORAGE_KEY)?.uid || null
  );

  const [investorProfile, setInvestorProfile] = useState<Investor | null>(null);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(false);
  const [lastTickError, setLastTickError] = useState<string | null>(null);
  const lastTickClientAtRef = useRef<number>(0);
  const lastObservedTickMillisRef = useRef<number>(0);
  const lastRemoteTickArrivedAtRef = useRef<number>(0);
  const settingsSyncCountRef = useRef<number>(0);

  // Browser back/forward sync
  useEffect(() => {
    const onPopState = () => setRoute(parseRouteFromPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (nextRoute: AppRoute, symbol?: string) => {
    if (symbol) setSelectedSymbol(symbol);
    setRoute(nextRoute);
    const targetPath = routeToPath(nextRoute);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Public real-time Firestore listeners (paused on login/learn/unauthenticated-admin pages to prevent quota reads & speed up auth)
  const isAuthScreen =
    route === 'login' ||
    route === 'learn' ||
    (route === 'admin' && !isGoogleAdmin && !passwordAdminSession);

  useEffect(() => {
    if (isAuthScreen) {
      setMarketLoading(false);
      return;
    }

    const unsubSettings = onSnapshot(
      doc(db, 'market_settings', 'global'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as MarketSettings;
          const ts = data.lastTickAt as { toMillis?: () => number } | undefined;
          const tickMs = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
          if (settingsSyncCountRef.current > 0 && tickMs > 0 && tickMs !== lastObservedTickMillisRef.current) {
            lastRemoteTickArrivedAtRef.current = Date.now();
          }
          if (tickMs > 0) {
            lastObservedTickMillisRef.current = tickMs;
          }
          settingsSyncCountRef.current += 1;
          setFsSettings(data);
          writeMarketCache({ settings: data });
        } else {
          setFsSettings(null);
        }
      },
      (err) => {
        if (isQuotaExceededError(err)) {
          console.warn('Firestore quota reached while syncing market settings; using cached state.');
          setMarketLoading(false);
          return;
        }
        handleFirestoreError(err, OperationType.GET, 'market_settings/global');
      }
    );

    const unsubCompanies = onSnapshot(
      collection(db, 'companies'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Company);
        list.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setFsCompanies(list);
        writeMarketCache({ companies: list });
        setMarketLoading(false);
      },
      (err) => {
        if (isQuotaExceededError(err)) {
          console.warn('Firestore quota reached while syncing companies; using cached/seed data.');
          setMarketLoading(false);
          return;
        }
        handleFirestoreError(err, OperationType.LIST, 'companies');
      }
    );

    const unsubPrices = onSnapshot(
      collection(db, 'market_prices'),
      (snap) => {
        const next: Record<string, MarketPrice> = {};
        snap.docs.forEach((d) => {
          next[d.id] = d.data() as MarketPrice;
        });
        setFsPrices(next);
        writeMarketCache({ prices: next });
      },
      (err) => {
        if (isQuotaExceededError(err)) {
          console.warn('Firestore quota reached while syncing market prices; using cached/seed data.');
          return;
        }
        handleFirestoreError(err, OperationType.LIST, 'market_prices');
      }
    );

    return () => {
      unsubCompanies();
      unsubPrices();
      unsubSettings();
    };
  }, [isAuthScreen]);

  // Google Owner / Admin Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (!user) {
        setIsGoogleAdmin(false);
        setAuthLoading(false);
        return;
      }

      try {
        let adminVerified = false;
        if (
          user.emailVerified &&
          user.email &&
          BOOTSTRAP_ADMIN_EMAILS.includes(user.email.toLowerCase())
        ) {
          adminVerified = true;
          void ensureAdminRecord(
            user.uid,
            user.email,
            user.displayName || 'Exchange Administrator'
          ).catch((e) => console.warn('Deferred admin record sync:', e));
        } else {
          const adminSnap = await getDoc(doc(db, 'admin_accounts', user.uid));
          if (adminSnap.exists()) adminVerified = true;
        }
        setIsGoogleAdmin(adminVerified);
      } catch (err) {
        console.error('Admin verification error:', err);
        setIsGoogleAdmin(false);
      } finally {
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Keep Named Admin Password session verified against Firestore (revocation or password change takes effect immediately)
  useEffect(() => {
    if (!passwordAdminSession) return;
    const unsub = onSnapshot(
      doc(db, 'admin_accounts', passwordAdminSession.uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as AdminAccount) : null;
        if (!data || data.passwordHash !== passwordAdminSession.passwordHash) {
          window.localStorage.removeItem(ADMIN_STORAGE_KEY);
          setPasswordAdminSession(null);
        }
      },
      () => undefined
    );
    return () => unsub();
  }, [passwordAdminSession]);

  const isAdmin = isGoogleAdmin || Boolean(passwordAdminSession);
  const adminUid = isGoogleAdmin
    ? authUser?.uid || ''
    : passwordAdminSession?.uid || '';
  const adminDisplayName = isGoogleAdmin
    ? authUser?.displayName || 'Exchange Owner'
    : passwordAdminSession?.displayName || 'Exchange Admin';
  const adminIdentifier = isGoogleAdmin
    ? authUser?.email || BOOTSTRAP_ADMIN_EMAIL
    : passwordAdminSession?.email || 'password-admin';

  // Sync active password-admin proof so all admin writes include atomic verification
  useEffect(() => {
    if (!isGoogleAdmin && passwordAdminSession?.uid && passwordAdminSession?.passwordHash) {
      setActivePasswordAdminProof({
        adminUid: passwordAdminSession.uid,
        passwordHash: passwordAdminSession.passwordHash,
      });
    } else {
      setActivePasswordAdminProof(null);
    }
  }, [isGoogleAdmin, passwordAdminSession]);

  // Investor-isolated listeners keyed by activeInvestorUid (zero Email/Phone Auth required)
  useEffect(() => {
    if (!activeInvestorUid) {
      setInvestorProfile(null);
      setHoldings([]);
      setTransactions([]);
      return;
    }

    const unsubInvestor = onSnapshot(
      doc(db, 'investors', activeInvestorUid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Investor;
          if (data.isDisabled) {
            window.localStorage.removeItem(INVESTOR_STORAGE_KEY);
            setActiveInvestorUid(null);
            setInvestorProfile(null);
          } else {
            setInvestorProfile(data);
          }
        } else if (!snap.metadata.fromCache) {
          window.localStorage.removeItem(INVESTOR_STORAGE_KEY);
          setActiveInvestorUid(null);
          setInvestorProfile(null);
        }
      },
      (err) => {
        if (isQuotaExceededError(err)) {
          console.warn('Firestore quota reached on investor listener.');
          return;
        }
        handleFirestoreError(err, OperationType.GET, `investors/${activeInvestorUid}`);
      }
    );

    const holdingsQuery = query(
      collection(db, 'portfolios'),
      where('investorUid', '==', activeInvestorUid)
    );
    const unsubHoldings = onSnapshot(
      holdingsQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as PortfolioHolding) }))
          .filter((h) => h.quantity > 0)
          .sort((a, b) => a.symbol.localeCompare(b.symbol));
        setHoldings(list);
      },
      (err) => {
        if (isQuotaExceededError(err)) {
          console.warn('Firestore quota reached on portfolio listener.');
          return;
        }
        handleFirestoreError(err, OperationType.LIST, 'portfolios');
      }
    );

    const txQuery = query(
      collection(db, 'transactions'),
      where('investorUid', '==', activeInvestorUid)
    );
    const unsubTx = onSnapshot(
      txQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TransactionRecord, 'id'>),
        }));
        list.sort((a, b) => {
          const at =
            typeof a.createdAt === 'object' && a.createdAt && 'toMillis' in a.createdAt
              ? (a.createdAt as { toMillis: () => number }).toMillis()
              : 0;
          const bt =
            typeof b.createdAt === 'object' && b.createdAt && 'toMillis' in b.createdAt
              ? (b.createdAt as { toMillis: () => number }).toMillis()
              : 0;
          return bt - at;
        });
        setTransactions(list);
      },
      (err) => {
        if (isQuotaExceededError(err)) {
          console.warn('Firestore quota reached on transactions listener.');
          return;
        }
        handleFirestoreError(err, OperationType.LIST, 'transactions');
      }
    );

    return () => {
      unsubInvestor();
      unsubHoldings();
      unsubTx();
    };
  }, [activeInvestorUid]);

  const hasLegacyFictionalData = useMemo(
    () => fsCompanies.some((c) => LEGACY_FICTIONAL_SYMBOLS.has(c.symbol)),
    [fsCompanies]
  );

  const isSeededInFirestore = fsCompanies.length > 0 && fsSettings !== null;

  // Automatically replace legacy fictional companies or empty DB with the 20 real companies when admin is active
  const autoMigratedRef = useRef(false);
  useEffect(() => {
    if (marketLoading || !isAdmin || !adminUid) return;
    if (!hasLegacyFictionalData && isSeededInFirestore) return;
    if (autoMigratedRef.current) return;

    if (!isGoogleAdmin && passwordAdminSession?.uid && passwordAdminSession?.passwordHash) {
      setActivePasswordAdminProof({
        adminUid: passwordAdminSession.uid,
        passwordHash: passwordAdminSession.passwordHash,
      });
    }

    autoMigratedRef.current = true;
    setIsBootstrapping(true);
    void initializeExchangeDatabase(adminUid, adminIdentifier)
      .catch((err) => {
        console.error('Automatic company migration failed:', err);
        autoMigratedRef.current = false;
      })
      .finally(() => {
        setIsBootstrapping(false);
      });
  }, [
    marketLoading,
    isAdmin,
    adminUid,
    adminIdentifier,
    isGoogleAdmin,
    passwordAdminSession,
    hasLegacyFictionalData,
    isSeededInFirestore,
  ]);

  const companies = useMemo<Company[]>(
    () => (fsCompanies.length > 0 && !hasLegacyFictionalData ? fsCompanies : SEED_COMPANIES),
    [fsCompanies, hasLegacyFictionalData]
  );

  const prices = useMemo<Record<string, MarketPrice>>(
    () =>
      Object.keys(fsPrices).length > 0 && !hasLegacyFictionalData ? fsPrices : FALLBACK_PRICES,
    [fsPrices, hasLegacyFictionalData]
  );

  const settings = useMemo<MarketSettings>(() => {
    if (fsSettings && !hasLegacyFictionalData) return fsSettings;
    const computedIdx = calculateNws20Index(companies, prices);
    return {
      ...FALLBACK_SETTINGS,
      indexValue: computedIdx,
    };
  }, [fsSettings, hasLegacyFictionalData, companies, prices]);

  const stocks = useMemo<EnrichedStock[]>(() => {
    return companies.map((comp) => {
      const mp = prices[comp.symbol];
      const currentPrice = mp?.currentPrice ?? comp.startingPrice;
      const previousClose = mp?.previousClose ?? comp.previousClose;
      const change = Number((currentPrice - previousClose).toFixed(2));
      const changePct = previousClose > 0 ? Number(((change / previousClose) * 100).toFixed(2)) : 0;
      return {
        ...comp,
        currentPrice,
        previousClose,
        dayHigh: mp?.dayHigh ?? currentPrice,
        dayLow: mp?.dayLow ?? currentPrice,
        volume: mp?.volume ?? 0,
        candles: mp?.candles ?? [],
        change,
        changePct,
      };
    });
  }, [companies, prices]);

  // Authenticated Admin (Google or Admin Password) drives synchronized Firestore market ticks
  const latestMarketRef = useRef({
    companies,
    prices,
    settings,
    isSeededInFirestore,
    hasLegacyFictionalData,
    isBootstrapping,
    isAdmin,
  });
  latestMarketRef.current = {
    companies,
    prices,
    settings,
    isSeededInFirestore,
    hasLegacyFictionalData,
    isBootstrapping,
    isAdmin,
  };
  const tickInFlightRef = useRef(false);
  const quotaBackoffUntilRef = useRef(0);

  // Release tab leader lease on page close/refresh so the reloaded tab starts ticking immediately
  useEffect(() => {
    const onUnload = () => releaseTickLeaderLease();
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
    };
  }, []);

  const isLiveTickRoute = route === 'admin' || route === 'led' || route === 'market';

  useEffect(() => {
    if (
      !isAdmin ||
      !isLiveTickRoute ||
      !isSeededInFirestore ||
      hasLegacyFictionalData ||
      isBootstrapping ||
      settings.status !== 'OPEN'
    ) {
      setLastTickError(null);
      return;
    }

    // Enforce a 30s minimum auto-tick floor so Firestore free-tier daily write units are preserved for trading
    const safeIntervalSec = Math.max(30, Math.min(300, settings.updateIntervalSec || 45));
    const intervalMs = safeIntervalSec * 1000;
    const leaseTtlMs = Math.max(12000, Math.min(intervalMs * 0.75, 30000));
    const cooldownMs = Math.max(15000, intervalMs * 0.75);

    const triggerAutoTick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      const cur = latestMarketRef.current;
      if (
        !cur.isAdmin ||
        !cur.isSeededInFirestore ||
        cur.hasLegacyFictionalData ||
        cur.isBootstrapping ||
        cur.settings.status !== 'OPEN'
      ) {
        return;
      }
      const now = Date.now();
      if (now < quotaBackoffUntilRef.current) return;
      if (tickInFlightRef.current) return;

      // Prevent duplicate ticks across same-browser tabs using local monotonic client clock
      const lease = readTickLeaderLease();
      const latestLocalTick = Math.max(
        lastTickClientAtRef.current,
        lease?.lastTickClientAt ?? 0,
        lastRemoteTickArrivedAtRef.current
      );
      if (latestLocalTick > 0 && now - latestLocalTick < cooldownMs) {
        return;
      }

      // Also check server lastTickAt only when device clock is not behind server clock
      const lastTickTs = cur.settings.lastTickAt as { toMillis?: () => number } | undefined;
      const lastTickMillis =
        lastTickTs && typeof lastTickTs.toMillis === 'function' ? lastTickTs.toMillis() : 0;
      const serverElapsed = lastTickMillis > 0 ? now - lastTickMillis : Infinity;
      if (serverElapsed >= -1500 && serverElapsed < cooldownMs) {
        return;
      }

      if (!tryAcquireTickLeaderLease(leaseTtlMs)) {
        return;
      }

      tickInFlightRef.current = true;
      try {
        await runMarketTick(cur.companies, cur.prices, cur.settings, undefined, false);
        const completedAt = Date.now();
        lastTickClientAtRef.current = completedAt;
        markTickLeaderSuccess(leaseTtlMs, completedAt);
        setLastTickError(null);
      } catch (err) {
        if (isQuotaExceededError(err)) {
          quotaBackoffUntilRef.current = Date.now() + 15 * 60 * 1000;
          setLastTickError(
            'Auto market tick paused because the daily free Firebase write limit was reached. It resumes after the daily reset.'
          );
          console.warn('Auto market tick paused for 15 minutes due to Firestore daily write limit.');
        } else {
          const msg = formatFriendlyFirestoreError(err, 'Automatic market tick failed.');
          setLastTickError(msg);
          console.error('Market tick error:', err);
        }
      } finally {
        tickInFlightRef.current = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void triggerAutoTick();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const initialTimer = window.setTimeout(() => {
      void triggerAutoTick();
    }, 1500);
    const intervalTimer = window.setInterval(() => {
      void triggerAutoTick();
    }, intervalMs);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
      releaseTickLeaderLease();
    };
  }, [
    isAdmin,
    isLiveTickRoute,
    isSeededInFirestore,
    hasLegacyFictionalData,
    isBootstrapping,
    settings.status,
    settings.updateIntervalSec,
  ]);

  const bootstrapExchange = async () => {
    if (!isAdmin || !adminUid) {
      throw new Error('Administrator sign-in is required to initialize Firestore data.');
    }
    setIsBootstrapping(true);
    try {
      await initializeExchangeDatabase(adminUid, adminIdentifier);
    } finally {
      setIsBootstrapping(false);
    }
  };

  // Zero-setup self-service investor registration: Name only -> ID + Access Code + ₹1,00,000
  const registerInvestorByName = async (rawName: string) => {
    const cleanName = rawName.trim();
    if (cleanName.length < 2 || cleanName.length > 80) {
      throw new Error('Please enter your full name (2 to 80 characters).');
    }

    const defaultBalance = 100000;
    const retryableCodes = new Set([
      'permission-denied',
      'already-exists',
      'aborted',
      'unavailable',
      'deadline-exceeded',
    ]);
    for (let attempt = 0; attempt < 5; attempt++) {
      const investorId = generateInvestorId();
      const uid = toInvestorDocId(investorId);
      const accessCode = generateAccessCode();
      const accessCodeHash = await sha256Hex(`${investorId}:${accessCode}`);

      try {
        await withFirestoreTimeout(
          runTransaction(db, async (tx) => {
            tx.set(doc(db, 'investors', uid), {
              uid,
              investorId,
              name: cleanName,
              accessCode,
              accessCodeHash,
              balance: defaultBalance,
              initialBalance: defaultBalance,
              isDisabled: false,
              lastTxId: '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }),
          8000,
          'Could not save your new Investor ID right now (database timed out or daily free write limit reached).'
        );
      } catch (err: unknown) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code || '').toLowerCase()
            : '';
        if (!isQuotaExceededError(err) && retryableCodes.has(code) && attempt < 4) {
          const jitterMs = 60 + Math.floor(Math.random() * 100);
          await new Promise((resolve) => setTimeout(resolve, jitterMs));
          continue;
        }
        throw new Error(formatFriendlyFirestoreError(err, 'Could not create investor account.'));
      }

      const session: StoredInvestorSession = { uid, investorId };
      try {
        window.localStorage.setItem(INVESTOR_STORAGE_KEY, JSON.stringify(session));
      } catch {
        // ignore storage quota errors
      }
      setInvestorProfile({
        uid,
        investorId,
        name: cleanName,
        accessCode,
        accessCodeHash,
        balance: defaultBalance,
        initialBalance: defaultBalance,
        isDisabled: false,
        lastTxId: '',
      });
      setActiveInvestorUid(uid);

      return {
        investorId,
        accessCode,
        name: cleanName,
        balance: defaultBalance,
      };
    }

    throw new Error('Could not allocate a unique Investor ID. Please try again.');
  };

  // Returning investor login using Name + Investor ID + Access Code (SHA-256 verified)
  const loginInvestor = async (params: {
    name: string;
    investorId: string;
    accessCode: string;
  }) => {
    const cleanId = normalizeInvestorId(params.investorId);
    const cleanName = params.name.trim();
    const cleanCode = params.accessCode.trim().toUpperCase();
    if (!cleanName || !cleanId || !cleanCode) {
      throw new Error('Please enter your Name, Investor ID, and Access Code.');
    }

    const uid = toInvestorDocId(cleanId);
    let snap;
    try {
      snap = await getDoc(doc(db, 'investors', uid));
    } catch (err) {
      throw new Error(formatFriendlyFirestoreError(err, 'Unable to verify your Investor ID right now.'));
    }

    if (!snap.exists()) {
      throw new Error('Investor ID not found. Check your ID or register as a New Investor.');
    }

    const profile = snap.data() as Investor;
    if (profile.isDisabled) {
      throw new Error('This investor account has been disabled by the administrator.');
    }
    if (profile.name.trim().toLowerCase() !== cleanName.toLowerCase()) {
      throw new Error(
        `Investor name does not match ID ${profile.investorId}. Please enter your exact registered name.`
      );
    }

    if (profile.accessCodeHash) {
      const candidateHash = await sha256Hex(`${profile.investorId}:${cleanCode}`);
      if (candidateHash !== profile.accessCodeHash) {
        throw new Error('Invalid Access Code. Please verify your Investor Pass.');
      }
    }

    const session: StoredInvestorSession = { uid: profile.uid, investorId: profile.investorId };
    try {
      window.localStorage.setItem(INVESTOR_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore storage quota errors
    }
    setInvestorProfile(profile);
    setActiveInvestorUid(profile.uid);
  };

  const loginAdminWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    const email = cred.user.email?.toLowerCase() || '';
    if (BOOTSTRAP_ADMIN_EMAILS.includes(email)) {
      window.localStorage.removeItem(ADMIN_STORAGE_KEY);
      setPasswordAdminSession(null);
      setActivePasswordAdminProof(null);
      void ensureAdminRecord(
        cred.user.uid,
        cred.user.email || BOOTSTRAP_ADMIN_EMAIL,
        cred.user.displayName || 'Exchange Administrator'
      ).catch((e) => console.warn('Deferred admin record sync:', e));
      return;
    }

    let adminSnap;
    try {
      adminSnap = await getDoc(doc(db, 'admin_accounts', cred.user.uid));
    } catch (err) {
      await signOut(auth).catch(() => undefined);
      throw new Error(formatFriendlyFirestoreError(err, 'Unable to verify administrator account.'));
    }
    if (!adminSnap.exists()) {
      await signOut(auth);
      throw new Error(
        `Account ${cred.user.email} is not authorized as an NWS Stock Exchange Administrator.`
      );
    }
    window.localStorage.removeItem(ADMIN_STORAGE_KEY);
    setPasswordAdminSession(null);
    setActivePasswordAdminProof(null);
  };

  // Named Admin Password login verified via SHA-256 against admin_accounts/adm_{slug}
  const loginAdminWithPassword = async (adminName: string, password: string) => {
    const slug = slugifyAdminName(adminName);
    if (!slug || !password.trim()) {
      throw new Error('Please enter your Admin Name and Admin Password.');
    }

    const adminDocId = toAdminDocId(adminName);
    let snap;
    try {
      snap = await getDoc(doc(db, 'admin_accounts', adminDocId));
    } catch (err) {
      throw new Error(formatFriendlyFirestoreError(err, 'Unable to verify admin credentials right now.'));
    }
    if (!snap.exists()) {
      throw new Error('Admin Name not found. Ask the Owner to create your Admin Password first.');
    }

    const data = snap.data() as AdminAccount;
    const expectedHash = data.passwordHash;
    if (!expectedHash) {
      throw new Error('This admin account uses Google Sign-In.');
    }

    const enteredHash = await sha256Hex(`${slug}:${password}`);
    if (enteredHash !== expectedHash) {
      throw new Error('Incorrect Admin Password.');
    }

    if (auth.currentUser) {
      await signOut(auth).catch(() => undefined);
    }

    const session: StoredAdminSession = {
      uid: data.uid,
      displayName: data.displayName,
      email: data.email,
      passwordHash: enteredHash,
    };
    try {
      window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore storage quota errors
    }
    setActivePasswordAdminProof({ adminUid: data.uid, passwordHash: enteredHash });
    setPasswordAdminSession(session);
  };

  const logout = async () => {
    releaseTickLeaderLease();
    window.localStorage.removeItem(INVESTOR_STORAGE_KEY);
    window.localStorage.removeItem(ADMIN_STORAGE_KEY);
    setActivePasswordAdminProof(null);
    setActiveInvestorUid(null);
    setPasswordAdminSession(null);
    setInvestorProfile(null);
    setHoldings([]);
    setTransactions([]);
    await signOut(auth).catch(() => undefined);
    if (route === 'led' || route === 'admin') {
      navigate('home');
    }
  };

  return (
    <ExchangeContext.Provider
      value={{
        route,
        navigate,
        selectedSymbol,
        setSelectedSymbol,
        companies,
        prices,
        stocks,
        settings,
        isSeededInFirestore,
        marketLoading,
        lastTickError,
        authUser,
        authLoading,
        isAdmin,
        adminUid,
        adminDisplayName,
        adminIdentifier,
        investorProfile,
        holdings,
        transactions,
        registerInvestorByName,
        loginInvestor,
        loginAdminWithGoogle,
        loginAdminWithPassword,
        logout,
        bootstrapExchange,
        isBootstrapping,
      }}
    >
      {children}
    </ExchangeContext.Provider>
  );
};

export function useExchange() {
  const ctx = useContext(ExchangeContext);
  if (!ctx) throw new Error('useExchange must be used inside ExchangeProvider');
  return ctx;
}
