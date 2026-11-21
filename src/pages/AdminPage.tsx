import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type WriteBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileText,
  KeyRound,
  Lock,
  LogOut,
  Monitor,
  Newspaper,
  Pause,
  Play,
  Plus,
  Printer,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  Users,
} from 'lucide-react';
import { TradeBillModal, type TradeBillData } from '../components/TradeBillModal';
import { db } from '../firebase/config';
import {
  OperationType,
  formatFriendlyFirestoreError,
  isQuotaExceededError,
  withFirestoreTimeout,
} from '../firebase/errorHandling';
import { useExchange } from '../context/ExchangeContext';
import {
  NEWS_HEADLINES,
  SECTORS,
  SEED_COMPANIES,
  buildInitialCandles,
} from '../data/seedCompanies';
import {
  AUTO_TICK_BATCH_SIZE,
  INDEX_BASE_VALUE,
  MAX_INDEX_HISTORY,
  MAX_STORED_CANDLES,
  attachAdminProofToTransaction,
  calculateNws20Index,
  clearCollectionDocs,
  commitAdminOpsInChunks,
  createAdminBatch,
  logAdminAudit,
  runMarketTick,
} from '../services/marketEngine';
import type {
  AdminAccount,
  AuditLog,
  Company,
  GeneratedCredentialSlip,
  Investor,
  MarketBias,
  MarketStatus,
  PortfolioHolding,
  Sector,
  TransactionRecord,
} from '../types/exchange';
import {
  downloadCSV,
  formatINR,
  formatIndianNumber,
  formatSignedPct,
  formatTimeLabel,
  formatTimestamp,
  generateAccessCode,
  normalizeInvestorId,
  sha256Hex,
  slugifyAdminName,
  toAdminDocId,
  toInvestorDocId,
} from '../utils/formatters';

type AdminTab = 'market' | 'investors' | 'companies' | 'trades' | 'led' | 'admins' | 'reset';

export const AdminPage: React.FC = () => {
  const {
    authLoading,
    isAdmin,
    adminUid,
    adminDisplayName,
    adminIdentifier,
    loginAdminWithGoogle,
    loginAdminWithPassword,
    logout,
    navigate,
    companies,
    prices,
    stocks,
    settings,
    isSeededInFirestore,
    isBootstrapping,
    lastTickError,
  } = useExchange();

  const [tab, setTab] = useState<AdminTab>('market');
  const [authError, setAuthError] = useState<string | null>(null);
  const [adminLoginName, setAdminLoginName] = useState('');
  const [adminLoginPass, setAdminLoginPass] = useState('');
  const [adminLoginBusy, setAdminLoginBusy] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tickBusy, setTickBusy] = useState(false);

  // Admin collections
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [allHoldings, setAllHoldings] = useState<PortfolioHolding[]>([]);
  const [allTransactions, setAllTransactions] = useState<TransactionRecord[]>([]);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Named Admin Password Creator state
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [newAdminConfirm, setNewAdminConfirm] = useState('');
  const [adminTeamBusy, setAdminTeamBusy] = useState(false);
  const [adminTeamError, setAdminTeamError] = useState<string | null>(null);

  // Market Control state
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [selectedNewsIdx, setSelectedNewsIdx] = useState<number>(0);
  const [customHeadline, setCustomHeadline] = useState('');
  const [customNewsSymbol, setCustomNewsSymbol] = useState('RELIANCE');
  const [customNewsImpact, setCustomNewsImpact] = useState('2.5');

  // Investor Generator state
  const [genCount, setGenCount] = useState<number>(1);
  const [genStartNum, setGenStartNum] = useState<number>(1001);
  const lastSuggestedStartRef = useRef<number>(1001);
  const [genNamesRaw, setGenNamesRaw] = useState<string>('');
  const [genBalance, setGenBalance] = useState<string>('100000');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [generatedSlips, setGeneratedSlips] = useState<GeneratedCredentialSlip[]>([]);
  const [inspectedInvestor, setInspectedInvestor] = useState<Investor | null>(null);

  // Company Management state
  const [newSym, setNewSym] = useState('');
  const [newName, setNewName] = useState('');
  const [newSector, setNewSector] = useState<Sector>('Technology');
  const [newPrice, setNewPrice] = useState('1000');
  const [newHq, setNewHq] = useState('Mumbai, Maharashtra');
  const [newMcap, setNewMcap] = useState('150000');
  const [newDesc, setNewDesc] = useState('');
  const [companyBusy, setCompanyBusy] = useState(false);
  const [editingBaseCompany, setEditingBaseCompany] = useState<Company | null>(null);
  const [editingBasePrice, setEditingBasePrice] = useState('');

  // Trading Monitor filter & bill modal
  const [tradeFilter, setTradeFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [inspectedBill, setInspectedBill] = useState<TradeBillData | null>(null);

  // LED selection draft
  const [ledDraft, setLedDraft] = useState<string[]>([]);
  useEffect(() => {
    setLedDraft(settings.ledSymbols || []);
  }, [settings.ledSymbols]);

  // Reset confirmation modal
  const [pendingReset, setPendingReset] = useState<{
    id: 'trades' | 'balances' | 'prices' | 'investors' | 'full';
    title: string;
    description: string;
  } | null>(null);
  const [confirmWord, setConfirmWord] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Admin Firestore listeners (single-field filters work seamlessly for both Google Admins and Password Admins)
  useEffect(() => {
    if (!isAdmin) return;

    const toMillis = (ts: unknown) =>
      typeof ts === 'object' && ts && 'toMillis' in ts
        ? (ts as { toMillis: () => number }).toMillis()
        : 0;

    const handleAdminListenerErr = (_op: OperationType, path: string) => (err: unknown) => {
      if (isQuotaExceededError(err)) {
        setActionError(formatFriendlyFirestoreError(err));
        return;
      }
      console.error(`Admin listener error on ${path}:`, err);
      setActionError(formatFriendlyFirestoreError(err, `Failed to sync ${path}.`));
    };

    const unsubInv = onSnapshot(
      query(collection(db, 'investors'), where('isDisabled', 'in', [false, true])),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Investor);
        list.sort((a, b) => a.investorId.localeCompare(b.investorId));
        setInvestors(list);
        // Auto-suggest next ID number only when the highest ID changes so live trades do not clobber admin input
        const maxNum = list.reduce((max, inv) => {
          const m = inv.investorId.match(/(\d+)$/);
          return m ? Math.max(max, Number(m[1])) : max;
        }, 1000);
        const nextSuggested = maxNum + 1;
        if (nextSuggested !== lastSuggestedStartRef.current) {
          lastSuggestedStartRef.current = nextSuggested;
          setGenStartNum(nextSuggested);
        }
      },
      handleAdminListenerErr(OperationType.LIST, 'investors')
    );

    const unsubPort = onSnapshot(
      query(collection(db, 'portfolios'), where('quantity', '>=', 0)),
      (snap) => {
        setAllHoldings(snap.docs.map((d) => d.data() as PortfolioHolding));
      },
      handleAdminListenerErr(OperationType.LIST, 'portfolios')
    );

    const unsubTx = onSnapshot(
      query(collection(db, 'transactions'), where('type', 'in', ['BUY', 'SELL'])),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TransactionRecord, 'id'>),
        }));
        list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setAllTransactions(list);
      },
      handleAdminListenerErr(OperationType.LIST, 'transactions')
    );

    const unsubAdmins = onSnapshot(
      query(collection(db, 'admin_accounts'), where('role', '==', 'ADMIN')),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as AdminAccount);
        list.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setAdminAccounts(list);
      },
      handleAdminListenerErr(OperationType.LIST, 'admin_accounts')
    );

    const unsubAudit = onSnapshot(
      query(collection(db, 'audit_logs'), where('action', '>=', '')),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AuditLog, 'id'>),
        }));
        list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setAuditLogs(list.slice(0, 60));
      },
      handleAdminListenerErr(OperationType.LIST, 'audit_logs')
    );

    return () => {
      unsubInv();
      unsubPort();
      unsubTx();
      unsubAdmins();
      unsubAudit();
    };
  }, [isAdmin]);

  const adminEmail = adminIdentifier;

  const handleCreateNamedAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminTeamError(null);
    const cleanName = newAdminName.trim();
    const slug = slugifyAdminName(cleanName);
    if (!cleanName || !slug || cleanName.length < 2 || cleanName.length > 80) {
      setAdminTeamError('Please enter a valid admin name (2 to 80 characters with letters or numbers).');
      return;
    }
    if (newAdminPass.length < 6) {
      setAdminTeamError('Admin password must be at least 6 characters.');
      return;
    }
    if (newAdminPass !== newAdminConfirm) {
      setAdminTeamError('Passwords do not match.');
      return;
    }

    setAdminTeamBusy(true);
    try {
      const adminDocId = toAdminDocId(cleanName);
      const existing = await getDoc(doc(db, 'admin_accounts', adminDocId));
      if (existing.exists()) {
        setAdminTeamError(
          `An admin account with the name "${cleanName}" already exists. Use a distinct name.`
        );
        return;
      }

      const passwordHash = await sha256Hex(`${slug}:${newAdminPass}`);
      const identifier = `${slug}@admin.nws.exchange`;
      const batch = createAdminBatch();
      batch.set(doc(db, 'admin_accounts', adminDocId), {
        uid: adminDocId,
        email: identifier,
        displayName: cleanName,
        role: 'ADMIN',
        authType: 'PASSWORD',
        passwordHash,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      await logAdminAudit(
        'CREATE_ADMIN_PASSWORD',
        `Created named Admin password login "${cleanName}".`,
        adminUid,
        adminEmail
      );
      setNewAdminName('');
      setNewAdminPass('');
      setNewAdminConfirm('');
      notify(`Created Admin password access for ${cleanName}.`);
    } catch (err: unknown) {
      setAdminTeamError(formatFriendlyFirestoreError(err, 'Failed to create admin account.'));
    } finally {
      setAdminTeamBusy(false);
    }
  };

  const notify = (msg: string) => {
    setActionError(null);
    setStatusNotice(msg);
    window.setTimeout(() => setStatusNotice(null), 5000);
  };

  const reportError = (err: unknown, fallback: string) => {
    setStatusNotice(null);
    setActionError(err ? formatFriendlyFirestoreError(err, fallback) : fallback);
  };

  // Market Control Handlers
  const updateMarketStatus = async (status: MarketStatus) => {
    setActionError(null);
    try {
      const batch = createAdminBatch();
      batch.update(doc(db, 'market_settings', 'global'), {
        status,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      await logAdminAudit('MARKET_STATUS', `Changed market status to ${status}.`, adminUid, adminEmail);
      notify(`Market status updated to ${status}.`);
    } catch (err) {
      reportError(err, 'Failed to update market status.');
    }
  };

  const updateMarketConfig = async (patch: {
    marketBias?: MarketBias;
    updateIntervalSec?: number;
  }) => {
    setActionError(null);
    try {
      const batch = createAdminBatch();
      batch.update(doc(db, 'market_settings', 'global'), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      await logAdminAudit(
        'MARKET_CONFIG',
        `Updated market configuration: ${JSON.stringify(patch)}.`,
        adminUid,
        adminEmail
      );
      notify('Market engine settings saved.');
    } catch (err) {
      reportError(err, 'Failed to save market engine settings.');
    }
  };

  const handleStepTickNow = async () => {
    if (tickBusy) return;
    setActionError(null);
    setTickBusy(true);
    try {
      await runMarketTick(companies, prices, settings, undefined, true);
      notify('Stepped live market tick and updated NWS 20 Composite Index.');
    } catch (err) {
      reportError(err, 'Failed to execute market tick.');
    } finally {
      setTickBusy(false);
    }
  };

  const handleManualPriceOverride = async (symbol: string) => {
    setActionError(null);
    const raw = Number(priceEdits[symbol]);
    if (!Number.isFinite(raw) || raw <= 0 || raw > 10_000_000) {
      reportError(null, `Enter a valid share price between ₹0.01 and ₹1,00,00,000 for ${symbol}.`);
      return;
    }
    const newP = Number(raw.toFixed(2));
    const existingPrice = prices[symbol];
    const prevClose = existingPrice?.previousClose ?? newP;
    const candles = [...(existingPrice?.candles ?? [])];
    const lastOpen = candles.length > 0 ? candles[candles.length - 1].close : newP;
    const label = formatTimeLabel();
    candles.push({
      t: Date.now(),
      label,
      open: lastOpen,
      high: Math.max(lastOpen, newP),
      low: Math.min(lastOpen, newP),
      close: newP,
      volume: 1000,
    });

    const nextMap = { ...prices, [symbol]: { ...existingPrice, currentPrice: newP } };
    const nextIdx = calculateNws20Index(companies, nextMap);
    const nextHistory = [...(settings.indexHistory ?? []), { label, value: nextIdx }].slice(
      -MAX_INDEX_HISTORY
    );

    try {
      const batch = createAdminBatch();
      batch.update(doc(db, 'market_prices', symbol), {
        currentPrice: newP,
        dayHigh: Math.max(existingPrice?.dayHigh ?? newP, newP),
        dayLow: Math.min(existingPrice?.dayLow ?? newP, newP),
        candles: candles.slice(-MAX_STORED_CANDLES),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'market_settings', 'global'), {
        indexValue: nextIdx,
        indexHistory: nextHistory,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      await logAdminAudit(
        'PRICE_OVERRIDE',
        `Manually set ${symbol} share price to ₹${newP} (prev close ₹${prevClose}).`,
        adminUid,
        adminEmail
      );
      setPriceEdits((p) => ({ ...p, [symbol]: '' }));
      notify(`Updated ${symbol} share price to ${formatINR(newP)}.`);
    } catch (err) {
      reportError(err, `Failed to update ${symbol} share price.`);
    }
  };

  const handleFireCuratedNews = async () => {
    const tmpl = NEWS_HEADLINES[selectedNewsIdx];
    if (!tmpl) return;
    setActionError(null);
    try {
      await runMarketTick(companies, prices, settings, tmpl);
      await logAdminAudit(
        'BREAKING_NEWS',
        `Broadcast news for ${tmpl.targetSymbol} (${tmpl.impactPct >= 0 ? '+' : ''}${tmpl.impactPct}%): ${tmpl.headline}`,
        adminUid,
        adminEmail
      );
      notify(`Breaking news published for ${tmpl.targetSymbol} and applied to market price.`);
    } catch (err) {
      reportError(err, 'Failed to broadcast curated news flash.');
    }
  };

  const handleFireCustomNews = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const targetComp = companies.find((c) => c.symbol === customNewsSymbol);
    const impact = Math.max(-10, Math.min(10, Number(customNewsImpact) || 0));
    if (!targetComp || !customHeadline.trim()) return;

    try {
      await runMarketTick(companies, prices, settings, {
        headline: customHeadline.trim().slice(0, 220),
        summary: `Direct exchange desk bulletin impacting ${targetComp.name} (${targetComp.symbol}).`,
        targetSymbol: targetComp.symbol,
        sector: targetComp.sector,
        sentiment: impact >= 0 ? 'POSITIVE' : 'NEGATIVE',
        impactPct: impact,
      });
      await logAdminAudit(
        'CUSTOM_NEWS_FLASH',
        `Broadcast custom news for ${targetComp.symbol} (${impact}%): ${customHeadline.trim()}`,
        adminUid,
        adminEmail
      );
      setCustomHeadline('');
      notify(`Custom breaking news published for ${targetComp.symbol}.`);
    } catch (err) {
      reportError(err, 'Failed to publish custom breaking news.');
    }
  };

  // Investor Generation Handler
  const handleGenerateInvestors = async (e: React.FormEvent) => {
    e.preventDefault();
    if (genLoading) return;
    setGenError(null);

    const safeCount = Number.isFinite(genCount) ? genCount : 1;
    const count = Math.max(1, Math.min(20, Math.floor(safeCount)));
    const safeStart = Number.isFinite(genStartNum) && genStartNum >= 1 ? Math.floor(genStartNum) : 1001;
    const rawBal = Number(genBalance);
    const initialBal = Math.min(
      1_000_000_000,
      Math.max(1000, Number.isFinite(rawBal) ? rawBal : 100000)
    );
    const parsedNames = genNamesRaw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    setGenLoading(true);
    const slips: GeneratedCredentialSlip[] = [];

    try {
      const existingUidSet = new Set(investors.map((inv) => inv.uid));
      const planned = Array.from({ length: count }, (_, i) => {
        const investorId = normalizeInvestorId(`NWS-${safeStart + i}`);
        const uid = toInvestorDocId(investorId);
        return { index: i, investorId, uid };
      });

      const localDup = planned.find((p) => existingUidSet.has(p.uid));
      if (localDup) {
        setGenError(
          `Investor ID ${localDup.investorId} already exists. Increase the starting ID number.`
        );
        return;
      }

      const prepared = await Promise.all(
        planned.map(async (item) => {
          const accessCode = generateAccessCode();
          const accessCodeHash = await sha256Hex(`${item.investorId}:${accessCode}`);
          const candidateName = (
            parsedNames[item.index] || `Participant ${safeStart + item.index}`
          ).slice(0, 80);
          const name =
            candidateName.length >= 2 ? candidateName : `Participant ${safeStart + item.index}`;
          return { ...item, accessCode, accessCodeHash, name };
        })
      );

      await withFirestoreTimeout(
        runTransaction(db, async (tx) => {
          attachAdminProofToTransaction(tx);
          for (const item of prepared) {
            tx.set(doc(db, 'investors', item.uid), {
              uid: item.uid,
              investorId: item.investorId,
              name: item.name,
              accessCode: item.accessCode,
              accessCodeHash: item.accessCodeHash,
              balance: initialBal,
              initialBalance: initialBal,
              isDisabled: false,
              lastTxId: '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }),
        8000,
        'Could not generate Investor IDs right now (database timed out or daily free write limit reached).'
      );

      for (const item of prepared) {
        slips.push({
          uid: item.uid,
          investorId: item.investorId,
          accessCode: item.accessCode,
          name: item.name,
          initialBalance: initialBal,
        });
      }

      setGeneratedSlips(slips);
      setGenNamesRaw('');
      notify(`Successfully generated ${slips.length} investor account(s).`);

      // Record audit entry asynchronously so credential slips appear instantly
      void logAdminAudit(
        'GENERATE_INVESTORS',
        `Generated ${slips.length} investor account(s) starting at ${slips[0]?.investorId} with ${formatINR(initialBal)} balance.`,
        adminUid,
        adminEmail
      ).catch((auditErr) => {
        console.warn('Investors created, audit log deferred:', auditErr);
      });
    } catch (err: unknown) {
      setGenError(formatFriendlyFirestoreError(err, 'Failed to create investor accounts.'));
    } finally {
      setGenLoading(false);
    }
  };

  const handleRevokeAdmin = async (adm: AdminAccount) => {
    if (adm.uid === adminUid) return;
    setActionError(null);
    try {
      const batch = createAdminBatch();
      batch.delete(doc(db, 'admin_accounts', adm.uid));
      await batch.commit();
      await logAdminAudit(
        'REVOKE_ADMIN',
        `Revoked admin access for ${adm.displayName} (${adm.email}).`,
        adminUid,
        adminEmail
      );
      notify(`Revoked Admin access for ${adm.displayName}.`);
    } catch (err) {
      reportError(err, `Failed to revoke Admin access for ${adm.displayName}.`);
    }
  };

  const toggleInvestorDisabled = async (inv: Investor) => {
    setActionError(null);
    const nextDisabled = !inv.isDisabled;
    try {
      const batch = createAdminBatch();
      batch.update(doc(db, 'investors', inv.uid), {
        isDisabled: nextDisabled,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      await logAdminAudit(
        nextDisabled ? 'DISABLE_INVESTOR' : 'ENABLE_INVESTOR',
        `${nextDisabled ? 'Disabled' : 'Re-enabled'} investor ${inv.investorId} (${inv.name}).`,
        adminUid,
        adminEmail
      );
      notify(`${inv.investorId} is now ${nextDisabled ? 'disabled' : 'active'}.`);
    } catch (err) {
      reportError(err, `Failed to update status for ${inv.investorId}.`);
    }
  };

  // Company Management Handlers
  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const sym = newSym.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const cleanName = newName.trim().slice(0, 100);
    const price = Number(newPrice);
    const mcapRaw = Number(newMcap);
    const mcap = Number.isFinite(mcapRaw) && mcapRaw >= 0 ? mcapRaw : 100000;
    const hqClean = newHq.trim().slice(0, 80);
    const headquarters = hqClean.length >= 2 ? hqClean : 'Mumbai, Maharashtra';
    const rawDesc =
      newDesc.trim().length >= 10
        ? newDesc.trim()
        : `${cleanName} is a listed Indian enterprise operating in the ${newSector} sector.`;
    const description = rawDesc.slice(0, 600);

    if (sym.length < 2 || sym.length > 12) {
      reportError(null, 'Company symbol must be 2 to 12 uppercase letters/numbers.');
      return;
    }
    if (companies.some((c) => c.symbol === sym)) {
      reportError(null, `Company symbol ${sym} already exists on NWS Stock Exchange.`);
      return;
    }
    if (cleanName.length < 2) {
      reportError(null, 'Company name must be at least 2 characters.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
      reportError(null, 'Starting price must be between ₹1 and ₹10,00,000.');
      return;
    }

    setCompanyBusy(true);
    try {
      const roundedPrice = Number(price.toFixed(2));
      const candles = buildInitialCandles(roundedPrice, companies.length + 1);
      const totalVol = candles.reduce((s, c) => s + c.volume, 0);
      const batch = createAdminBatch();
      batch.set(doc(db, 'companies', sym), {
        symbol: sym,
        name: cleanName,
        sector: newSector,
        startingPrice: roundedPrice,
        previousClose: roundedPrice,
        description,
        headquarters,
        marketCapCr: mcap,
        isActive: true,
        showOnLed: false,
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'market_prices', sym), {
        symbol: sym,
        currentPrice: roundedPrice,
        previousClose: roundedPrice,
        dayHigh: Math.max(...candles.map((c) => c.high), roundedPrice),
        dayLow: Math.min(...candles.map((c) => c.low), roundedPrice),
        volume: totalVol,
        candles,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      await logAdminAudit('ADD_COMPANY', `Added listed company ${sym} (${cleanName}) at ₹${roundedPrice}.`, adminUid, adminEmail);
      setNewSym('');
      setNewName('');
      setNewDesc('');
      notify(`Listed ${sym} successfully.`);
    } catch (err) {
      reportError(err, `Failed to list company ${sym}.`);
    } finally {
      setCompanyBusy(false);
    }
  };

  const toggleCompanyActive = async (comp: Company) => {
    setActionError(null);
    try {
      const batch = createAdminBatch();
      batch.update(doc(db, 'companies', comp.symbol), {
        isActive: !comp.isActive,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      await logAdminAudit(
        'TOGGLE_COMPANY',
        `${comp.isActive ? 'Deactivated' : 'Activated'} company ${comp.symbol}.`,
        adminUid,
        adminEmail
      );
      notify(`${comp.symbol} is now ${!comp.isActive ? 'Active' : 'Inactive'}.`);
    } catch (err) {
      reportError(err, `Failed to toggle ${comp.symbol} status.`);
    }
  };

  const updateCompanyStartingPrice = async (comp: Company, newStart: number) => {
    if (!Number.isFinite(newStart) || newStart <= 0 || newStart > 1_000_000) {
      reportError(null, 'Starting price must be between ₹1 and ₹10,00,000.');
      return;
    }
    setActionError(null);
    const roundedStart = Number(newStart.toFixed(2));
    try {
      const updatedCompanies = companies.map((c) =>
        c.symbol === comp.symbol
          ? { ...c, startingPrice: roundedStart, previousClose: roundedStart }
          : c
      );
      const nextIdx = calculateNws20Index(updatedCompanies, prices);
      const label = formatTimeLabel();
      const nextHistory = [...(settings.indexHistory ?? []), { label, value: nextIdx }].slice(
        -MAX_INDEX_HISTORY
      );

      const batch = createAdminBatch();
      batch.update(doc(db, 'companies', comp.symbol), {
        startingPrice: roundedStart,
        previousClose: roundedStart,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'market_settings', 'global'), {
        indexValue: nextIdx,
        indexHistory: nextHistory,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      await logAdminAudit(
        'EDIT_COMPANY_BASE',
        `Updated ${comp.symbol} starting price to ₹${roundedStart}.`,
        adminUid,
        adminEmail
      );
      setEditingBaseCompany(null);
      setEditingBasePrice('');
      notify(`Updated ${comp.symbol} starting price to ${formatINR(roundedStart)}.`);
    } catch (err) {
      reportError(err, `Failed to update starting price for ${comp.symbol}.`);
    }
  };

  // LED Roster save
  const handleSaveLedRoster = async () => {
    setActionError(null);
    const trimmed = ledDraft.slice(0, 12);
    try {
      const batch = createAdminBatch();
      batch.update(doc(db, 'market_settings', 'global'), {
        ledSymbols: trimmed,
        updatedAt: serverTimestamp(),
      });
      companies.forEach((c) => {
        batch.update(doc(db, 'companies', c.symbol), {
          showOnLed: trimmed.includes(c.symbol),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      await logAdminAudit(
        'LED_ROSTER_UPDATE',
        `Updated LED Market Board to ${trimmed.length} symbols: ${trimmed.join(', ')}.`,
        adminUid,
        adminEmail
      );
      notify(`Saved ${trimmed.length} companies to LED Market Board.`);
    } catch (err) {
      reportError(err, 'Failed to save LED Market Board selection.');
    }
  };

  // Confirmed Reset Executor
  const executeConfirmedReset = async () => {
    if (!pendingReset || confirmWord.trim().toUpperCase() !== 'RESET' || resetBusy) return;
    setResetBusy(true);
    setResetError(null);
    setActionError(null);
    try {
      if (pendingReset.id === 'trades' || pendingReset.id === 'full') {
        await clearCollectionDocs('transactions');
        await clearCollectionDocs('portfolios');
      }

      if (pendingReset.id === 'balances' || pendingReset.id === 'full') {
        const invSnap = await getDocs(
          query(collection(db, 'investors'), where('isDisabled', 'in', [false, true]))
        );
        const targetInvestors = invSnap.docs.map((d) => d.data() as Investor);
        const balanceOps = targetInvestors.map((inv) => {
          const resetBal =
            typeof inv.initialBalance === 'number' &&
            Number.isFinite(inv.initialBalance) &&
            inv.initialBalance >= 0 &&
            inv.initialBalance <= 1_000_000_000
              ? Number(inv.initialBalance.toFixed(2))
              : 100000;
          return (batch: WriteBatch) => {
            batch.update(doc(db, 'investors', inv.uid), {
              balance: resetBal,
              initialBalance: resetBal,
              lastTxId: '',
              updatedAt: serverTimestamp(),
            });
          };
        });
        await commitAdminOpsInChunks(balanceOps, 350);
      }

      if (pendingReset.id === 'prices' || pendingReset.id === 'full') {
        const [companiesSnap, settingsSnap] = await Promise.all([
          getDocs(collection(db, 'companies')),
          getDoc(doc(db, 'market_settings', 'global')),
        ]);
        const targetCompanies = companiesSnap.empty
          ? SEED_COMPANIES
          : companiesSnap.docs.map((d) => d.data() as Company);
        const needsCompaniesSeed = companiesSnap.empty;

        const priceOps: Array<(batch: WriteBatch) => void> = [];
        targetCompanies.forEach((comp, idx) => {
          const basePrice = Math.max(1, Number(comp.startingPrice) || 100);
          const candles = buildInitialCandles(basePrice, idx + 1);
          if (needsCompaniesSeed) {
            priceOps.push((batch: WriteBatch) => {
              batch.set(doc(db, 'companies', comp.symbol), {
                symbol: comp.symbol,
                name: comp.name,
                sector: comp.sector,
                startingPrice: basePrice,
                previousClose: basePrice,
                description: comp.description,
                headquarters: comp.headquarters,
                marketCapCr: comp.marketCapCr,
                isActive: comp.isActive,
                showOnLed: comp.showOnLed,
                updatedAt: serverTimestamp(),
              });
            });
          }
          priceOps.push((batch: WriteBatch) => {
            batch.set(doc(db, 'market_prices', comp.symbol), {
              symbol: comp.symbol,
              currentPrice: basePrice,
              previousClose: basePrice,
              dayHigh: Math.max(...candles.map((c) => c.high), basePrice),
              dayLow: Math.min(...candles.map((c) => c.low), basePrice),
              volume: candles.reduce((s, c) => s + c.volume, 0),
              candles,
              updatedAt: serverTimestamp(),
            });
          });
        });

        priceOps.push((batch: WriteBatch) => {
          const settingsRef = doc(db, 'market_settings', 'global');
          if (settingsSnap.exists()) {
            batch.update(settingsRef, {
              indexValue: INDEX_BASE_VALUE,
              indexPrevClose: INDEX_BASE_VALUE,
              indexHistory: [{ label: formatTimeLabel(), value: INDEX_BASE_VALUE }],
              status: 'PAUSED',
              updatedAt: serverTimestamp(),
            });
          } else {
            batch.set(settingsRef, {
              status: 'PAUSED',
              updateIntervalSec: 45,
              marketBias: 'NEUTRAL',
              indexValue: INDEX_BASE_VALUE,
              indexPrevClose: INDEX_BASE_VALUE,
              indexBaseValue: INDEX_BASE_VALUE,
              indexHistory: [{ label: formatTimeLabel(), value: INDEX_BASE_VALUE }],
              ledSymbols: targetCompanies
                .filter((c) => c.showOnLed)
                .map((c) => c.symbol)
                .slice(0, 12),
              updatedAt: serverTimestamp(),
            });
          }
        });

        await commitAdminOpsInChunks(priceOps, 350);
      }

      if (pendingReset.id === 'investors') {
        await clearCollectionDocs('transactions');
        await clearCollectionDocs('portfolios');
        await clearCollectionDocs('investors');
      }

      try {
        await logAdminAudit(
          `SYSTEM_RESET_${pendingReset.id.toUpperCase()}`,
          `Executed reset: ${pendingReset.title}`,
          adminUid,
          adminEmail
        );
      } catch (auditErr) {
        console.warn('Reset succeeded, audit log deferred:', auditErr);
      }

      notify(`${pendingReset.title} completed successfully.`);
      setPendingReset(null);
      setConfirmWord('');
      setResetError(null);
    } catch (err) {
      const msg = formatFriendlyFirestoreError(err, `Failed to execute ${pendingReset.title}.`);
      setResetError(msg);
      reportError(err, `Failed to execute ${pendingReset.title}.`);
    } finally {
      setResetBusy(false);
    }
  };

  // Computed Admin Metrics
  const tradeStats = useMemo(() => {
    let buyVol = 0;
    let sellVol = 0;
    let turnover = 0;
    let totalBrokerage = 0;
    let intradayOrders = 0;
    let deliveryOrders = 0;
    const brokerageByInvestor: Record<string, number> = {};

    for (const t of allTransactions) {
      const fee = t.brokerageAmount ?? 0;
      turnover += t.totalAmount;
      totalBrokerage += fee;
      brokerageByInvestor[t.investorUid] = Number(
        ((brokerageByInvestor[t.investorUid] ?? 0) + fee).toFixed(2)
      );
      if ((t.productType ?? 'DELIVERY') === 'INTRADAY') intradayOrders += 1;
      else deliveryOrders += 1;
      if (t.type === 'BUY') buyVol += t.quantity;
      else sellVol += t.quantity;
    }

    const unpaidBrokerageDue = investors.reduce(
      (sum, inv) => sum + (inv.balance < 0 ? Math.abs(inv.balance) : 0),
      0
    );
    const totalBrokerageRounded = Number(totalBrokerage.toFixed(2));
    const unpaidDueRounded = Number(unpaidBrokerageDue.toFixed(2));
    const collectedBrokerage = Number(Math.max(0, totalBrokerageRounded - unpaidDueRounded).toFixed(2));

    return {
      buyVol,
      sellVol,
      turnover,
      totalBrokerage: totalBrokerageRounded,
      collectedBrokerage,
      unpaidBrokerageDue: unpaidDueRounded,
      intradayOrders,
      deliveryOrders,
      brokerageByInvestor,
    };
  }, [allTransactions, investors]);

  const holdingsByInvestorUid = useMemo(() => {
    const map: Record<string, PortfolioHolding[]> = {};
    for (const h of allHoldings) {
      if (h.quantity <= 0) continue;
      if (!map[h.investorUid]) map[h.investorUid] = [];
      map[h.investorUid].push(h);
    }
    return map;
  }, [allHoldings]);

  const effectiveAutoTickSec = Math.max(30, settings.updateIntervalSec || 45);

  const estimatedWritesPerHour = useMemo(() => {
    const activeStocks = companies.filter((c) => c.isActive).length;
    const docsPerTick = Math.min(activeStocks, AUTO_TICK_BATCH_SIZE) + 1;
    // Compact docs (~2 KiB each) use ~2 Firestore Enterprise write units per doc
    const unitsPerTick = docsPerTick * 2;
    const ticksPerHour = 3600 / effectiveAutoTickSec;
    return Math.round(unitsPerTick * ticksPerHour);
  }, [companies, effectiveAutoTickSec]);

  if (authLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-slate-600">
        Verifying Administrator Authentication...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <Lock className="w-9 h-9 text-[#0A192F] mx-auto" />
            <h1 className="text-2xl font-bold text-[#0A192F]">Exchange Admin Console</h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Protected portal. Sign in with your assigned Admin Name and Password to access
              market controls, investor management, and the Live LED Market Board.
            </p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setAuthError(null);
              setAdminLoginBusy(true);
              try {
                await loginAdminWithPassword(adminLoginName, adminLoginPass);
              } catch (err) {
                setAuthError(formatFriendlyFirestoreError(err, 'Admin login failed.'));
              } finally {
                setAdminLoginBusy(false);
              }
            }}
            className="space-y-3.5"
          >
            <div>
              <label htmlFor="adm-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Admin Name
              </label>
              <input
                id="adm-name"
                type="text"
                required
                value={adminLoginName}
                onChange={(e) => setAdminLoginName(e.target.value)}
                placeholder="Enter your assigned admin name"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
              />
            </div>

            <div>
              <label htmlFor="adm-pass" className="block text-xs font-semibold text-slate-700 mb-1">
                Admin Password
              </label>
              <input
                id="adm-pass"
                type="password"
                required
                value={adminLoginPass}
                onChange={(e) => setAdminLoginPass(e.target.value)}
                placeholder="Enter admin password"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
              />
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={adminLoginBusy}
              className="w-full py-3 bg-[#0A192F] text-white text-sm font-semibold rounded-lg hover:bg-[#13294B] cursor-pointer disabled:opacity-50"
            >
              {adminLoginBusy ? 'Verifying Password...' : 'Sign in with Admin Password'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-200 space-y-2.5 text-center">
            <div className="text-xs text-slate-500">
              First-time setup or owner access? Sign in once with your authorized Google account to
              set up your Admin Passwords.
            </div>
            <button
              type="button"
              onClick={async () => {
                setAuthError(null);
                try {
                  await loginAdminWithGoogle();
                } catch (err) {
                  setAuthError(formatFriendlyFirestoreError(err, 'Google Admin sign-in failed.'));
                }
              }}
              className="w-full py-2.5 border border-slate-300 text-[#0A192F] text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Owner Google Sign-In
            </button>
            <button
              type="button"
              onClick={() => navigate('home')}
              className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Return to Public Exchange
            </button>
          </div>
        </div>
      </div>
    );
  }

  const inspectedHoldings = inspectedInvestor
    ? allHoldings.filter((h) => h.investorUid === inspectedInvestor.uid && h.quantity > 0)
    : [];
  const inspectedTxs = inspectedInvestor
    ? allTransactions.filter((t) => t.investorUid === inspectedInvestor.uid)
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Admin Header Bar */}
      <div className="bg-[#0A192F] text-white rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <div className="text-xs font-semibold text-slate-300 font-mono-num">
            ADMIN CONSOLE · {adminDisplayName} ({adminEmail})
          </div>
          <h1 className="text-2xl font-bold mt-1">NWS Stock Exchange Control Center</h1>
          <div className="text-xs text-slate-300 mt-1 font-mono-num">
            Market: <strong>{settings.status}</strong> · NWS 20:{' '}
            <strong>{formatIndianNumber(settings.indexValue, 2)}</strong> · Investors:{' '}
            <strong>{investors.length}</strong> · Trades: <strong>{allTransactions.length}</strong> ·
            Platform Brokerage Earned:{' '}
            <strong className="text-green-300">{formatINR(tradeStats.totalBrokerage)}</strong>
            {tradeStats.unpaidBrokerageDue > 0 && (
              <span className="text-amber-300">
                {' '}
                (Due: {formatINR(tradeStats.unpaidBrokerageDue)})
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => navigate('led')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            <Monitor className="w-4 h-4" />
            Open Live LED Market Board
          </button>
          <button
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 border border-slate-600 text-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Automatic Database Sync Notice (only shown briefly while seeding/upgrading) */}
      {isBootstrapping && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-center gap-3 no-print">
          <Database className="w-5 h-5 text-sky-700 shrink-0" />
          <div className="text-xs font-semibold text-sky-900">
            Syncing the 20 real Indian companies and NWS 20 Composite Index into Firestore...
          </div>
        </div>
      )}

      {statusNotice && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-xs font-semibold flex items-center gap-2 no-print">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusNotice}</span>
        </div>
      )}

      {(actionError || lastTickError) && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-xs font-semibold flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{actionError || lastTickError}</span>
          </div>
          {actionError && (
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-red-700 hover:underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Admin Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-print">
        {(
          [
            { id: 'market', label: 'Market & News Control' },
            { id: 'investors', label: 'Investors & IDs' },
            { id: 'companies', label: `Companies (${companies.length})` },
            { id: 'trades', label: 'Trading Monitor' },
            { id: 'led', label: 'LED Board Setup' },
            { id: 'admins', label: 'Admin Passwords' },
            { id: 'reset', label: 'System Reset & Logs' },
          ] as { id: AdminTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              tab === t.id
                ? 'bg-[#0A192F] text-white border-[#0A192F]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: MARKET & NEWS CONTROL */}
      {tab === 'market' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Session & Interval Controls */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-[#0A192F]">Session & Movement Engine</h2>
                <span
                  className={`text-xs font-mono-num font-bold ${
                    settings.status === 'OPEN'
                      ? 'text-green-700'
                      : settings.status === 'PAUSED'
                        ? 'text-amber-700'
                        : 'text-red-700'
                  }`}
                >
                  {settings.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void updateMarketStatus('OPEN')}
                  disabled={!isSeededInFirestore || settings.status === 'OPEN'}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
                    settings.status === 'OPEN'
                      ? 'bg-green-100 text-green-900 border border-green-300 cursor-default'
                      : 'bg-green-700 text-white hover:bg-green-800 cursor-pointer disabled:opacity-50'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  {settings.status === 'OPEN'
                    ? 'Market Open (Active)'
                    : settings.status === 'PAUSED'
                      ? 'Resume Market'
                      : 'Start Market'}
                </button>
                <button
                  onClick={() => void updateMarketStatus('PAUSED')}
                  disabled={!isSeededInFirestore || settings.status === 'PAUSED'}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
                    settings.status === 'PAUSED'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300 cursor-default'
                      : 'bg-amber-600 text-white hover:bg-amber-700 cursor-pointer disabled:opacity-50'
                  }`}
                >
                  <Pause className="w-3.5 h-3.5" />
                  {settings.status === 'PAUSED' ? 'Market Paused' : 'Pause Market'}
                </button>
                <button
                  onClick={() => void updateMarketStatus('CLOSED')}
                  disabled={!isSeededInFirestore || settings.status === 'CLOSED'}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
                    settings.status === 'CLOSED'
                      ? 'bg-red-100 text-red-900 border border-red-300 cursor-default'
                      : 'bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50'
                  }`}
                >
                  <Square className="w-3.5 h-3.5" />
                  {settings.status === 'CLOSED' ? 'Market Closed' : 'Close Market'}
                </button>
                <button
                  onClick={() => void handleStepTickNow()}
                  disabled={!isSeededInFirestore || tickBusy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#0A192F] text-white rounded-lg hover:bg-[#13294B] cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${tickBusy ? 'animate-spin' : ''}`} />
                  {tickBusy ? 'Ticking...' : 'Step Tick Now'}
                </button>
              </div>

              <div className="text-xs text-slate-600 font-mono-num flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  Last Tick:{' '}
                  <strong className="text-slate-900">
                    {settings.lastTickAt ? formatTimestamp(settings.lastTickAt) : 'Waiting'}
                  </strong>
                </span>
                <span>
                  Auto-Tick:{' '}
                  <strong className="text-slate-900">
                    {settings.status === 'OPEN'
                      ? `Every ${effectiveAutoTickSec}s`
                      : `Stopped (${settings.status})`}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Market Trend Bias
                  </label>
                  <select
                    value={settings.marketBias}
                    onChange={(e) =>
                      void updateMarketConfig({ marketBias: e.target.value as MarketBias })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="NEUTRAL">Neutral (Balanced)</option>
                    <option value="BULLISH">Bullish (Upward Drift)</option>
                    <option value="BEARISH">Bearish (Downward Drift)</option>
                    <option value="VOLATILE">High Volatility</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Price Update Interval
                  </label>
                  <select
                    value={effectiveAutoTickSec}
                    onChange={(e) =>
                      void updateMarketConfig({ updateIntervalSec: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono-num"
                  >
                    {Array.from(new Set([30, 45, 60, 120, effectiveAutoTickSec]))
                      .filter((sec) => Number.isFinite(sec) && sec >= 30)
                      .sort((a, b) => a - b)
                      .map((sec) => (
                        <option key={sec} value={sec}>
                          Every {sec} seconds
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono-num">
                Quota-Safe Rotating Engine: ~{formatIndianNumber(estimatedWritesPerHour, 0)} write
                units/hour ({AUTO_TICK_BATCH_SIZE} stocks/tick · pauses automatically in hidden
                tabs · Free Spark limit: 20,000 write units/day).
              </div>
            </div>

            {/* Breaking News Flash Controller */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-[#0A192F]" />
                <h2 className="text-base font-bold text-[#0A192F]">
                  Broadcast News & Price Impact Engine
                </h2>
              </div>
              <p className="text-xs text-slate-600">
                Publishing a news flash immediately moves the target company share price, updates
                the NWS 20 Composite Index, and alerts the LED Board news anchor to read it live.
              </p>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Quick Curated Headline
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={selectedNewsIdx}
                    onChange={(e) => setSelectedNewsIdx(Number(e.target.value))}
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {NEWS_HEADLINES.map((n, idx) => (
                      <option key={idx} value={idx}>
                        [{n.targetSymbol} {n.impactPct >= 0 ? '+' : ''}
                        {n.impactPct}%] {n.headline.slice(0, 68)}...
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void handleFireCuratedNews()}
                    disabled={!isSeededInFirestore}
                    className="px-4 py-2 text-xs font-bold bg-[#0A192F] text-white rounded-lg hover:bg-[#13294B] whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    Broadcast Now
                  </button>
                </div>
              </div>

              <form onSubmit={handleFireCustomNews} className="pt-3 border-t border-slate-100 space-y-2.5">
                <div className="text-xs font-semibold text-slate-700">Custom Breaking Headline</div>
                <input
                  type="text"
                  value={customHeadline}
                  onChange={(e) => setCustomHeadline(e.target.value)}
                  placeholder="Enter headline to broadcast on LED News Desk..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={customNewsSymbol}
                    onChange={(e) => setCustomNewsSymbol(e.target.value)}
                    className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono-num"
                  >
                    {companies.map((c) => (
                      <option key={c.symbol} value={c.symbol}>
                        {c.symbol}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.5"
                    min="-10"
                    max="10"
                    value={customNewsImpact}
                    onChange={(e) => setCustomNewsImpact(e.target.value)}
                    placeholder="Impact %"
                    className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono-num"
                  />
                  <button
                    type="submit"
                    disabled={!isSeededInFirestore || !customHeadline.trim()}
                    className="px-3 py-2 text-xs font-bold bg-green-700 text-white rounded-lg hover:bg-green-800 cursor-pointer disabled:opacity-50"
                  >
                    Publish Flash
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Manual Share Price Overrides */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-[#0A192F]">Live Share Price Overrides</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Symbol</th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4 text-right">Live Price</th>
                    <th className="py-3 px-4 text-right">Change %</th>
                    <th className="py-3 px-4 text-right">Set New Price (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stocks.map((s) => (
                    <tr key={s.symbol}>
                      <td className="py-2.5 px-4 font-mono-num font-bold text-[#0A192F]">
                        {s.symbol}
                      </td>
                      <td className="py-2.5 px-4 text-slate-800">{s.name}</td>
                      <td className="py-2.5 px-4 text-right font-mono-num font-semibold">
                        {formatINR(s.currentPrice)}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono-num font-semibold ${
                          s.changePct >= 0 ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        {formatSignedPct(s.changePct)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            value={priceEdits[s.symbol] ?? ''}
                            onChange={(e) =>
                              setPriceEdits((p) => ({ ...p, [s.symbol]: e.target.value }))
                            }
                            placeholder={String(s.currentPrice)}
                            className="w-24 px-2.5 py-1 text-xs font-mono-num border border-slate-300 rounded"
                          />
                          <button
                            onClick={() => void handleManualPriceOverride(s.symbol)}
                            disabled={!isSeededInFirestore || !priceEdits[s.symbol]}
                            className="px-2.5 py-1 text-xs font-semibold bg-[#0A192F] text-white rounded hover:bg-[#13294B] cursor-pointer disabled:opacity-40"
                          >
                            Set
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INVESTOR MANAGEMENT */}
      {tab === 'investors' && (
        <div className="space-y-6">
          {/* Batch Investor Generator */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 no-print">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#0A192F]" />
              <h2 className="text-base font-bold text-[#0A192F]">
                Generate Investor IDs & Access Codes
              </h2>
            </div>

            <form onSubmit={handleGenerateInvestors} className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Account Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={genCount}
                  onChange={(e) => setGenCount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Start ID #
                </label>
                <input
                  type="number"
                  min={100}
                  value={genStartNum}
                  onChange={(e) => setGenStartNum(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Balance (₹)
                </label>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={genBalance}
                  onChange={(e) => setGenBalance(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>

              <div className="md:col-span-5">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Investor Names (optional, comma or line separated)
                </label>
                <input
                  type="text"
                  value={genNamesRaw}
                  onChange={(e) => setGenNamesRaw(e.target.value)}
                  placeholder="e.g. Aarav Sharma, Diya Patel, Kabir Verma"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  Access codes are generated per investor and remain visible to administrators in the
                  Registered Investors directory below.
                </span>
                <button
                  type="submit"
                  disabled={genLoading}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#0A192F] rounded-lg hover:bg-[#13294B] cursor-pointer disabled:opacity-50"
                >
                  {genLoading ? 'Generating Accounts...' : 'Generate Accounts'}
                </button>
              </div>
            </form>

            {genError && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  Account Provisioning Notice
                </div>
                <p>{genError}</p>
              </div>
            )}
          </div>

          {/* Newly Generated Credential Slips (Printable / Exportable) */}
          {generatedSlips.length > 0 && (
            <div className="bg-white border border-slate-300 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 no-print">
                <div>
                  <h3 className="text-base font-bold text-green-800">
                    New Investor Credential Slips ({generatedSlips.length})
                  </h3>
                  <p className="text-xs text-slate-600">
                    Distribute these credentials to participants. Access codes are also saved in the
                    Registered Investors directory below for authorized administrators.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Slips
                  </button>
                  <button
                    onClick={() =>
                      downloadCSV(
                        'NWS_Investor_Credentials.csv',
                        ['Investor Name', 'Investor ID', 'Access Code', 'Initial Balance (INR)'],
                        generatedSlips.map((s) => [
                          s.name,
                          s.investorId,
                          s.accessCode,
                          s.initialBalance,
                        ])
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0A192F] text-white rounded-lg hover:bg-[#13294B] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {generatedSlips.map((slip) => (
                  <div
                    key={slip.uid}
                    className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-1 text-xs"
                  >
                    <div className="font-bold text-[#0A192F]">NWS STOCK EXCHANGE · PASS</div>
                    <div>
                      Name: <strong className="text-slate-900">{slip.name}</strong>
                    </div>
                    <div className="font-mono-num">
                      Investor ID: <strong className="text-slate-900">{slip.investorId}</strong>
                    </div>
                    <div className="font-mono-num">
                      Access Code: <strong className="text-green-700">{slip.accessCode}</strong>
                    </div>
                    <div className="font-mono-num text-slate-600">
                      Balance: {formatINR(slip.initialBalance)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Investor Directory */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#0A192F]">
                  Registered Investors ({investors.length})
                </h2>
                <div className="text-xs text-slate-500 font-mono-num mt-0.5">
                  Platform Brokerage Earned:{' '}
                  <strong className="text-[#0A192F]">{formatINR(tradeStats.totalBrokerage)}</strong>
                  {tradeStats.unpaidBrokerageDue > 0 && (
                    <span className="text-red-600">
                      {' '}
                      · Unpaid Due: {formatINR(tradeStats.unpaidBrokerageDue)}
                    </span>
                  )}
                </div>
              </div>
              {investors.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    downloadCSV(
                      'NWS_Registered_Investors.csv',
                      [
                        'Investor ID',
                        'Name',
                        'Access Code',
                        'Cash Balance (INR)',
                        'Brokerage Paid (INR)',
                        'Status',
                      ],
                      investors.map((inv) => [
                        inv.investorId,
                        inv.name,
                        inv.accessCode || 'N/A',
                        inv.balance,
                        tradeStats.brokerageByInvestor[inv.uid] ?? 0,
                        inv.isDisabled ? 'Disabled' : 'Active',
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 text-[#0A192F] rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Directory CSV
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Investor ID</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Access Code</th>
                    <th className="py-3 px-4 text-right">Cash Balance</th>
                    <th className="py-3 px-4 text-right">Brokerage</th>
                    <th className="py-3 px-4 text-right">Net Worth</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {investors.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500">
                        No investors generated yet. Use the form above to create student accounts.
                      </td>
                    </tr>
                  ) : (
                    investors.map((inv) => {
                      const invH = holdingsByInvestorUid[inv.uid] || [];
                      const portVal = invH.reduce(
                        (s, h) => s + h.quantity * (prices[h.symbol]?.currentPrice ?? h.averageBuyPrice),
                        0
                      );
                      const invBrokerage = tradeStats.brokerageByInvestor[inv.uid] ?? 0;
                      return (
                        <tr key={inv.uid} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono-num font-bold text-[#0A192F]">
                            {inv.investorId}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">{inv.name}</td>
                          <td className="py-3 px-4 font-mono-num text-xs font-semibold text-green-800">
                            {inv.accessCode ? (
                              <span className="inline-block px-2 py-0.5 rounded bg-green-50 border border-green-200">
                                {inv.accessCode}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono-num ${
                              inv.balance < 0 ? 'text-red-600 font-semibold' : ''
                            }`}
                          >
                            {formatINR(inv.balance)}
                            {inv.balance < 0 && ' (Due)'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-num text-slate-700">
                            {formatINR(invBrokerage)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-num font-semibold text-[#0A192F]">
                            {formatINR(inv.balance + portVal)}
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold">
                            <span className={inv.isDisabled ? 'text-red-600' : 'text-green-700'}>
                              {inv.isDisabled ? 'Disabled' : 'Active'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <button
                              onClick={() => setInspectedInvestor(inv)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Inspect
                            </button>
                            <button
                              onClick={() => void toggleInvestorDisabled(inv)}
                              className={`px-2.5 py-1 text-xs font-semibold rounded border cursor-pointer ${
                                inv.isDisabled
                                  ? 'border-green-300 text-green-700 hover:bg-green-50'
                                  : 'border-red-300 text-red-700 hover:bg-red-50'
                              }`}
                            >
                              {inv.isDisabled ? 'Enable' : 'Disable'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Investor Inspector Modal */}
          {inspectedInvestor && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div>
                    <div className="text-xs font-mono-num text-slate-500">
                      {inspectedInvestor.investorId}
                      {inspectedInvestor.accessCode && (
                        <span className="ml-2 font-semibold text-green-700">
                          · Access Code: {inspectedInvestor.accessCode}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-[#0A192F]">{inspectedInvestor.name}</h3>
                    <div className="text-xs font-mono-num text-slate-600 mt-0.5">
                      Balance:{' '}
                      <strong className={inspectedInvestor.balance < 0 ? 'text-red-600' : ''}>
                        {formatINR(inspectedInvestor.balance)}
                      </strong>{' '}
                      · Brokerage Billed:{' '}
                      <strong>
                        {formatINR(tradeStats.brokerageByInvestor[inspectedInvestor.uid] ?? 0)}
                      </strong>
                    </div>
                  </div>
                  <button
                    onClick={() => setInspectedInvestor(null)}
                    className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-700 mb-2">
                    Holdings ({inspectedHoldings.length})
                  </h4>
                  {inspectedHoldings.length === 0 ? (
                    <div className="text-xs text-slate-500">No active share holdings.</div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                      {inspectedHoldings.map((h) => (
                        <div key={h.symbol} className="px-3 py-2 flex justify-between font-mono-num">
                          <span>
                            <strong>{h.symbol}</strong> · {h.quantity} shares @{' '}
                            {formatINR(h.averageBuyPrice)}
                          </span>
                          <span>
                            Live:{' '}
                            {formatINR(
                              h.quantity * (prices[h.symbol]?.currentPrice ?? h.averageBuyPrice)
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-700 mb-2">
                    Recent Orders ({inspectedTxs.length})
                  </h4>
                  {inspectedTxs.length === 0 ? (
                    <div className="text-xs text-slate-500">No trades executed yet.</div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs max-h-56 overflow-y-auto">
                      {inspectedTxs.map((t) => (
                        <div
                          key={t.id}
                          className="px-3 py-2 flex items-center justify-between gap-2 font-mono-num"
                        >
                          <span>
                            <strong
                              className={t.type === 'BUY' ? 'text-green-700' : 'text-red-600'}
                            >
                              {t.type}
                            </strong>{' '}
                            ({t.productType ?? 'DELIVERY'}) {t.quantity} {t.symbol} @{' '}
                            {formatINR(t.price)} · Fee: {formatINR(t.brokerageAmount ?? 0)}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-slate-500">{formatTimestamp(t.createdAt)}</span>
                            <button
                              type="button"
                              onClick={() => setInspectedBill(t)}
                              className="px-2 py-0.5 text-[11px] font-semibold text-[#0A192F] border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                            >
                              Bill
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: COMPANY MANAGEMENT */}
      {tab === 'companies' && (
        <div className="space-y-6">
          <form
            onSubmit={handleAddCompany}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#0A192F]" />
              <h2 className="text-base font-bold text-[#0A192F]">Add New Listed Company</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <input
                type="text"
                required
                value={newSym}
                onChange={(e) => setNewSym(e.target.value.toUpperCase())}
                placeholder="Symbol (e.g. KALY)"
                className="px-3 py-2 text-xs font-mono-num uppercase border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Company Name"
                className="lg:col-span-2 px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <select
                value={newSector}
                onChange={(e) => setNewSector(e.target.value as Sector)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="number"
                required
                min={1}
                step="0.5"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Starting Price ₹"
                className="px-3 py-2 text-xs font-mono-num border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                disabled={companyBusy || !isSeededInFirestore}
                className="px-4 py-2 text-xs font-bold bg-[#0A192F] text-white rounded-lg hover:bg-[#13294B] cursor-pointer disabled:opacity-50"
              >
                {companyBusy ? 'Adding...' : 'Add Company'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={newHq}
                onChange={(e) => setNewHq(e.target.value)}
                placeholder="Headquarters City"
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="number"
                value={newMcap}
                onChange={(e) => setNewMcap(e.target.value)}
                placeholder="Market Cap (Cr)"
                className="px-3 py-2 text-xs font-mono-num border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Short company profile description..."
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Symbol</th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Sector</th>
                    <th className="py-3 px-4 text-right">Starting Price</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map((c) => (
                    <tr key={c.symbol}>
                      <td className="py-3 px-4 font-mono-num font-bold text-[#0A192F]">
                        {c.symbol}
                      </td>
                      <td className="py-3 px-4 font-medium">{c.name}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{c.sector}</td>
                      <td className="py-3 px-4 text-right font-mono-num">
                        {formatINR(c.startingPrice)}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold">
                        <span className={c.isActive ? 'text-green-700' : 'text-red-600'}>
                          {c.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            setEditingBaseCompany(c);
                            setEditingBasePrice(String(c.startingPrice));
                          }}
                          disabled={!isSeededInFirestore}
                          className="px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                        >
                          Edit Base ₹
                        </button>
                        <button
                          onClick={() => void toggleCompanyActive(c)}
                          disabled={!isSeededInFirestore}
                          className="px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                        >
                          {c.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TRADING MONITOR */}
      {tab === 'trades' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Total Exchange Turnover</div>
              <div className="text-2xl font-bold text-[#0A192F] font-mono-num mt-1">
                {formatINR(tradeStats.turnover)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Brokerage Earned by Platform</div>
              <div className="text-2xl font-bold text-green-700 font-mono-num mt-1">
                {formatINR(tradeStats.totalBrokerage)}
              </div>
              <div className="text-[11px] font-mono-num text-slate-500 mt-1">
                Collected: {formatINR(tradeStats.collectedBrokerage)}
                {tradeStats.unpaidBrokerageDue > 0 && (
                  <span className="text-red-600 font-semibold">
                    {' '}
                    · Due: {formatINR(tradeStats.unpaidBrokerageDue)}
                  </span>
                )}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">BUY Volume Executed</div>
              <div className="text-2xl font-bold text-green-700 font-mono-num mt-1">
                {formatIndianNumber(tradeStats.buyVol)} Shares
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">SELL Volume Executed</div>
              <div className="text-2xl font-bold text-red-600 font-mono-num mt-1">
                {formatIndianNumber(tradeStats.sellVol)} Shares
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
            {(['ALL', 'BUY', 'SELL'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTradeFilter(t)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  tradeFilter === t ? 'bg-white text-[#0A192F] shadow-xs' : 'text-slate-600'
                }`}
              >
                {t} Orders
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Investor</th>
                    <th className="py-3 px-4">Stock</th>
                    <th className="py-3 px-4">Type / Mode</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4 text-right">Price</th>
                    <th className="py-3 px-4 text-right">Brokerage</th>
                    <th className="py-3 px-4 text-right">Net Bill</th>
                    <th className="py-3 px-4 text-right">Time</th>
                    <th className="py-3 px-4 text-right">Bill</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allTransactions
                    .filter((t) => (tradeFilter === 'ALL' ? true : t.type === tradeFilter))
                    .map((t) => {
                      const fee = t.brokerageAmount ?? 0;
                      const net =
                        t.netAmount ??
                        (t.type === 'BUY' ? t.totalAmount + fee : t.totalAmount - fee);
                      return (
                        <tr key={t.id}>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{t.investorName}</div>
                            <div className="text-xs font-mono-num text-slate-500">
                              {t.investorId}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono-num font-bold text-[#0A192F]">
                            {t.symbol}
                          </td>
                          <td className="py-3 px-4 font-mono-num text-xs">
                            <div
                              className={`font-bold ${
                                t.type === 'BUY' ? 'text-green-700' : 'text-red-600'
                              }`}
                            >
                              {t.type}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {t.productType ?? 'DELIVERY'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono-num">{t.quantity}</td>
                          <td className="py-3 px-4 text-right font-mono-num">
                            {formatINR(t.price)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-num text-slate-700">
                            {formatINR(fee)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-num font-semibold">
                            {formatINR(net)}
                          </td>
                          <td className="py-3 px-4 text-right text-xs font-mono-num text-slate-500">
                            {formatTimestamp(t.createdAt)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setInspectedBill(t)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#0A192F] border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Bill
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: LED DISPLAY SETUP */}
      {tab === 'led' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-[#0A192F]">
                LED Market Board Configuration (10–12 Companies)
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Select up to 12 companies to display on the Admin-Only 4-Quadrant Live LED Market
                Board ({ledDraft.length}/12 selected).
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => void handleSaveLedRoster()}
                disabled={!isSeededInFirestore || ledDraft.length === 0}
                className="px-4 py-2 text-xs font-bold bg-[#0A192F] text-white rounded-lg hover:bg-[#13294B] cursor-pointer disabled:opacity-50"
              >
                Save LED Selection
              </button>
              <button
                onClick={() => navigate('led')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-green-700 text-white rounded-lg hover:bg-green-800 cursor-pointer"
              >
                <Monitor className="w-4 h-4" />
                Launch Live LED Board
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {companies.map((c) => {
              const checked = ledDraft.includes(c.symbol);
              return (
                <label
                  key={c.symbol}
                  className={`flex items-center justify-between p-3.5 rounded-lg border cursor-pointer transition-colors ${
                    checked ? 'border-[#0A192F] bg-slate-50' : 'border-slate-200'
                  }`}
                >
                  <div>
                    <div className="text-xs font-mono-num font-bold text-[#0A192F]">{c.symbol}</div>
                    <div className="text-xs text-slate-700">{c.name}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      if (checked) {
                        setLedDraft((prev) => prev.filter((s) => s !== c.symbol));
                      } else if (ledDraft.length < 12) {
                        setLedDraft((prev) => [...prev, c.symbol]);
                      }
                    }}
                    className="w-4 h-4 accent-[#0A192F]"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 6: NAMED ADMIN PASSWORDS */}
      {tab === 'admins' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#0A192F]" />
              <h2 className="text-base font-bold text-[#0A192F]">
                Create Named Admin Passwords
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Create individual Admin Name + Password logins for yourself and each exhibition
              coordinator. Passwords are converted into one-way cryptographic SHA-256 hashes (never
              stored in plain text in Firestore), and without a valid password no one can open the
              Admin Portal or Live LED Market Board.
            </p>

            <form onSubmit={handleCreateNamedAdmin} className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Person&apos;s Admin Name
                </label>
                <input
                  type="text"
                  required
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  placeholder="e.g. Rohan Coordinator"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Admin Password (min 6 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newAdminPass}
                  onChange={(e) => setNewAdminPass(e.target.value)}
                  placeholder="Create password"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newAdminConfirm}
                  onChange={(e) => setNewAdminConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="md:col-span-2 flex items-end">
                <button
                  type="submit"
                  disabled={adminTeamBusy}
                  className="w-full py-2.5 px-4 text-xs font-bold bg-[#0A192F] text-white rounded-lg hover:bg-[#13294B] cursor-pointer disabled:opacity-50"
                >
                  {adminTeamBusy ? 'Saving...' : 'Create Admin'}
                </button>
              </div>
            </form>

            {adminTeamError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {adminTeamError}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-700" />
                <h3 className="text-base font-bold text-[#0A192F]">
                  Authorized Administrators ({adminAccounts.length})
                </h3>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Admin Name</th>
                    <th className="py-3 px-4">Auth Identifier</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4 text-right">Created</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminAccounts.map((adm) => {
                    const isSelf = adm.uid === adminUid;
                    return (
                      <tr key={adm.uid}>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {adm.displayName}{' '}
                          {isSelf && (
                            <span className="text-xs font-normal text-green-700">(You)</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono-num text-slate-500">
                          {adm.email}
                        </td>
                        <td className="py-3 px-4 text-xs font-bold text-[#0A192F]">{adm.role}</td>
                        <td className="py-3 px-4 text-right text-xs font-mono-num text-slate-500">
                          {formatTimestamp(adm.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isSelf ? (
                            <span className="text-xs text-slate-400">Active Session</span>
                          ) : (
                            <button
                              onClick={() => void handleRevokeAdmin(adm)}
                              className="px-3 py-1 text-xs font-semibold text-red-700 border border-red-300 rounded hover:bg-red-50 cursor-pointer"
                            >
                              Revoke Access
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: SYSTEM RESET & AUDIT LOGS */}
      {tab === 'reset' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="text-base font-bold">Destructive System Resets</h2>
            </div>
            <p className="text-xs text-slate-600">
              All reset actions preserve permanent company listings and administrator accounts, and
              are permanently recorded in the Audit Log.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {[
                {
                  id: 'trades' as const,
                  title: 'Clear Trades & Holdings',
                  description:
                    'Deletes all transaction records and clears all investor stock holdings.',
                },
                {
                  id: 'balances' as const,
                  title: 'Reset Investor Balances',
                  description:
                    'Restores every investor cash balance back to their initial starting allocation.',
                },
                {
                  id: 'prices' as const,
                  title: 'Reset Market Prices & Index',
                  description:
                    'Restores all 20 stocks to starting prices, clears OHLC spikes, and resets NWS 20 Composite Index to 20,000.',
                },
                {
                  id: 'investors' as const,
                  title: 'Delete All Investor Profiles',
                  description:
                    'Deletes all investor profiles, holdings, and transaction histories from Firestore.',
                },
                {
                  id: 'full' as const,
                  title: 'Full Exhibition Round Reset',
                  description:
                    'Clears trades & holdings, resets balances, and resets market prices for a fresh exhibition session.',
                },
              ].map((item) => (
                <div
                  key={item.id}
                  className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="text-sm font-bold text-slate-900">{item.title}</div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmWord('');
                      setResetError(null);
                      setPendingReset(item);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-red-700 border border-red-300 rounded-lg hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Execute Reset
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Audit Log */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-[#0A192F]">Administrative Audit Log</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Details</th>
                    <th className="py-3 px-4">Admin</th>
                    <th className="py-3 px-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2.5 px-4 font-mono-num font-bold text-[#0A192F]">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{log.details}</td>
                      <td className="py-2.5 px-4 text-slate-500">{log.adminEmail}</td>
                      <td className="py-2.5 px-4 text-right font-mono-num text-slate-500 whitespace-nowrap">
                        {formatTimestamp(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Typed Reset Confirmation Modal */}
      {pendingReset && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void executeConfirmedReset();
            }}
            className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold">{pendingReset.title}</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{pendingReset.description}</p>
            <div>
              <label
                htmlFor="confirm-reset-word"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Type <span className="font-mono-num text-red-700">RESET</span> to confirm
              </label>
              <input
                id="confirm-reset-word"
                type="text"
                autoFocus
                value={confirmWord}
                onChange={(e) => {
                  setConfirmWord(e.target.value);
                  if (resetError) setResetError(null);
                }}
                placeholder="RESET"
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>

            {resetError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{resetError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => {
                  setPendingReset(null);
                  setConfirmWord('');
                  setResetError(null);
                }}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetBusy || confirmWord.trim().toUpperCase() !== 'RESET'}
                className="px-4 py-2 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer disabled:opacity-40"
              >
                {resetBusy ? 'Resetting...' : 'Confirm Permanent Reset'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Starting Price Modal (replaces window.prompt for iframe compatibility) */}
      {editingBaseCompany && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void updateCompanyStartingPrice(editingBaseCompany, Number(editingBasePrice));
            }}
            className="bg-white rounded-xl max-w-sm w-full p-6 space-y-4"
          >
            <div>
              <div className="text-xs font-mono-num font-bold text-slate-500">
                {editingBaseCompany.symbol}
              </div>
              <h3 className="text-base font-bold text-[#0A192F]">
                Edit Base Starting Price
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {editingBaseCompany.name} · Current base:{' '}
                <span className="font-mono-num font-semibold">
                  {formatINR(editingBaseCompany.startingPrice)}
                </span>
              </p>
            </div>
            <div>
              <label
                htmlFor="edit-base-price"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                New Starting Price (₹)
              </label>
              <input
                id="edit-base-price"
                type="number"
                required
                min={1}
                max={1000000}
                step="0.01"
                value={editingBasePrice}
                onChange={(e) => setEditingBasePrice(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A192F]"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingBaseCompany(null);
                  setEditingBasePrice('');
                }}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold bg-[#0A192F] text-white rounded-lg hover:bg-[#13294B] cursor-pointer"
              >
                Save Base Price
              </button>
            </div>
          </form>
        </div>
      )}

      <TradeBillModal bill={inspectedBill} onClose={() => setInspectedBill(null)} />
    </div>
  );
};
