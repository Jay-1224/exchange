import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type Transaction,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  OperationType,
  handleFirestoreError,
  isQuotaExceededError,
} from '../firebase/errorHandling';
import {
  NEWS_HEADLINES,
  SEED_COMPANIES,
  buildInitialCandles,
  type CuratedHeadlineTemplate,
} from '../data/seedCompanies';
import type {
  CandlePoint,
  Company,
  MarketBias,
  MarketPrice,
  MarketSettings,
  NewsItem,
  OrderType,
  TradeProductType,
} from '../types/exchange';
import { formatTimeLabel } from '../utils/formatters';

export const INDEX_BASE_VALUE = 20000;
export const INTRADAY_BROKERAGE_RATE = 0.0005; // 0.05% (within standard 0.03%–0.1% intraday range)
export const INTRADAY_BROKERAGE_CAP = 20; // ₹20 max per executed order
export const AUTO_TICK_BATCH_SIZE = 2;
export const MAX_STORED_CANDLES = 18;
export const MAX_INDEX_HISTORY = 24;
export const MAX_RECENT_NEWS = 4;

export function calculateBrokerage(tradeValue: number, productType: TradeProductType): number {
  if (!Number.isFinite(tradeValue) || tradeValue <= 0 || productType === 'DELIVERY') {
    return 0;
  }
  return Number(Math.min(INTRADAY_BROKERAGE_CAP, tradeValue * INTRADAY_BROKERAGE_RATE).toFixed(2));
}

export interface PasswordAdminProof {
  adminUid: string;
  passwordHash: string;
}

let activePasswordAdminProof: PasswordAdminProof | null = null;

export function setActivePasswordAdminProof(proof: PasswordAdminProof | null) {
  activePasswordAdminProof = proof;
}

export function createAdminBatch() {
  const batch = writeBatch(db);
  if (activePasswordAdminProof) {
    batch.set(doc(db, 'admin_sessions', 'active'), {
      adminUid: activePasswordAdminProof.adminUid,
      passwordHash: activePasswordAdminProof.passwordHash,
      updatedAt: serverTimestamp(),
    });
  }
  return batch;
}

export function attachAdminProofToTransaction(tx: Transaction) {
  if (activePasswordAdminProof) {
    tx.set(doc(db, 'admin_sessions', 'active'), {
      adminUid: activePasswordAdminProof.adminUid,
      passwordHash: activePasswordAdminProof.passwordHash,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function commitAdminOpsInChunks(
  ops: Array<(batch: WriteBatch) => void>,
  chunkSize = 350
): Promise<void> {
  if (ops.length === 0) return;
  for (let i = 0; i < ops.length; i += chunkSize) {
    const batch = createAdminBatch();
    const slice = ops.slice(i, i + chunkSize);
    for (const op of slice) {
      op(batch);
    }
    await batch.commit();
  }
}

export function calculateNws20Index(
  companies: Company[],
  priceMap: Record<string, MarketPrice>
): number {
  const active = companies.filter((c) => c.isActive);
  if (active.length === 0) return INDEX_BASE_VALUE;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const c of active) {
    const mp = priceMap[c.symbol];
    const current = mp?.currentPrice ?? c.startingPrice;
    const base = c.startingPrice > 0 ? c.startingPrice : 1;
    const weight = Math.max(1, c.marketCapCr);
    weightedSum += (current / base) * weight;
    totalWeight += weight;
  }
  const ratio = totalWeight > 0 ? weightedSum / totalWeight : 1;
  return Number((INDEX_BASE_VALUE * ratio).toFixed(2));
}

export function buildCompositeIndexSeries(
  stocks: Array<Pick<Company, 'symbol' | 'isActive' | 'startingPrice' | 'marketCapCr'> & {
    currentPrice: number;
    candles: CandlePoint[];
  }>,
  settings: Pick<MarketSettings, 'indexHistory' | 'indexPrevClose' | 'indexValue'>,
  maxLivePoints = 28
): Array<{ label: string; value: number }> {
  const history = settings.indexHistory || [];
  if (history.length >= 6) {
    const sliced = history.slice(-maxLivePoints);
    const last = sliced[sliced.length - 1];
    if (!last || Math.abs(last.value - settings.indexValue) > 0.01) {
      return [...sliced, { label: 'Live', value: settings.indexValue }];
    }
    return sliced;
  }

  const active = stocks.filter((s) => s.isActive);
  if (active.length === 0) {
    return [
      { label: 'Prev', value: settings.indexPrevClose },
      { label: 'Live', value: settings.indexValue },
    ];
  }

  const maxPoints = Math.min(18, Math.max(...active.map((s) => s.candles.length), 1));
  const derived: Array<{ label: string; value: number }> = [];

  for (let i = 0; i < maxPoints; i++) {
    let label = `T-${maxPoints - i}`;
    let weightedSum = 0;
    let totalWeight = 0;

    for (const stock of active) {
      const candles = stock.candles;
      const offset = Math.max(0, candles.length - maxPoints) + i;
      const c = candles[offset];
      const priceAtPoint = c ? c.close : stock.currentPrice;
      if (c) label = c.label;
      const base = stock.startingPrice > 0 ? stock.startingPrice : 1;
      const weight = Math.max(1, stock.marketCapCr);
      weightedSum += (priceAtPoint / base) * weight;
      totalWeight += weight;
    }

    const ratio = totalWeight > 0 ? weightedSum / totalWeight : 1;
    derived.push({
      label,
      value: Number((INDEX_BASE_VALUE * ratio).toFixed(2)),
    });
  }

  const last = derived[derived.length - 1];
  if (!last || Math.abs(last.value - settings.indexValue) > 0.01) {
    derived.push({ label: 'Live', value: settings.indexValue });
  }
  return derived;
}

export async function initializeExchangeDatabase(adminUid: string, adminEmail: string) {
  try {
    // Remove any legacy company or price records before seeding the 20 real Indian companies
    await clearCollectionDocs('companies');
    await clearCollectionDocs('market_prices');

    const batch = createAdminBatch();
    const nowLabel = formatTimeLabel();

    const defaultLedSymbols: string[] = [];
    const priceMap: Record<string, MarketPrice> = {};
    const seededCompanies: Company[] = [];

    SEED_COMPANIES.forEach((comp, idx) => {
      const candles = buildInitialCandles(comp.startingPrice, idx + 1);
      const highs = candles.map((c) => c.high);
      const lows = candles.map((c) => c.low);
      const totalVol = candles.reduce((acc, c) => acc + c.volume, 0);

      const companyRef = doc(db, 'companies', comp.symbol);
      batch.set(companyRef, {
        ...comp,
        updatedAt: serverTimestamp(),
      });
      seededCompanies.push({ ...comp });

      const priceDoc: MarketPrice = {
        symbol: comp.symbol,
        currentPrice: comp.startingPrice,
        previousClose: comp.previousClose,
        dayHigh: Math.max(...highs, comp.startingPrice),
        dayLow: Math.min(...lows, comp.startingPrice),
        volume: totalVol,
        candles,
      };
      priceMap[comp.symbol] = priceDoc;

      const priceRef = doc(db, 'market_prices', comp.symbol);
      batch.set(priceRef, {
        ...priceDoc,
        updatedAt: serverTimestamp(),
      });

      if (comp.showOnLed && defaultLedSymbols.length < 12) {
        defaultLedSymbols.push(comp.symbol);
      }
    });

    const firstTemplate = NEWS_HEADLINES[0];
    const initialNews: NewsItem = {
      id: `news-${Date.now()}`,
      headline: firstTemplate.headline,
      summary: firstTemplate.summary,
      targetSymbol: firstTemplate.targetSymbol,
      sector: firstTemplate.sector,
      sentiment: firstTemplate.sentiment,
      impactPct: firstTemplate.impactPct,
      timestampLabel: nowLabel,
    };

    const settingsRef = doc(db, 'market_settings', 'global');
    const initialIndex = calculateNws20Index(seededCompanies, priceMap);
    batch.set(settingsRef, {
      status: 'OPEN',
      updateIntervalSec: 45,
      marketBias: 'NEUTRAL',
      indexValue: initialIndex,
      indexPrevClose: INDEX_BASE_VALUE,
      indexBaseValue: INDEX_BASE_VALUE,
      indexHistory: [{ label: nowLabel, value: initialIndex }],
      ledSymbols: defaultLedSymbols,
      activeNews: initialNews,
      recentNews: [initialNews],
      lastTickAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    await logAdminAudit(
      'INITIALIZE_EXCHANGE',
      'Seeded 20 real Indian companies, initial OHLC candlesticks, and NWS 20 Composite Index.',
      adminUid,
      adminEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'companies/market_prices/market_settings');
  }
}

export async function logAdminAudit(
  action: string,
  details: string,
  adminUid: string,
  adminEmail: string
) {
  try {
    const batch = createAdminBatch();
    const logRef = doc(collection(db, 'audit_logs'));
    batch.set(logRef, {
      action,
      details: details.slice(0, 480),
      adminUid,
      adminEmail,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'audit_logs');
  }
}

function getBiasDrift(bias: MarketBias): { drift: number; volatility: number } {
  switch (bias) {
    case 'BULLISH':
      return { drift: 0.0028, volatility: 0.009 };
    case 'BEARISH':
      return { drift: -0.0028, volatility: 0.009 };
    case 'VOLATILE':
      return { drift: 0.0002, volatility: 0.022 };
    case 'NEUTRAL':
    default:
      return { drift: 0.0003, volatility: 0.0085 };
  }
}

let tickRotationCursor = 0;

export async function runMarketTick(
  companies: Company[],
  priceMap: Record<string, MarketPrice>,
  settings: MarketSettings,
  forcedNews?: CuratedHeadlineTemplate,
  fullTick = false
) {
  try {
    const batch = createAdminBatch();
    const activeCompanies = companies.filter((c) => c.isActive);
    if (activeCompanies.length === 0) return;

    const now = new Date();
    const label = formatTimeLabel(now);
    const { drift, volatility } = getBiasDrift(settings.marketBias);

    // Decide whether a curated breaking news flash fires this tick (every ~4th tick or when forced)
    let newsToPublish: NewsItem | undefined = settings.activeNews;
    let recentNews: NewsItem[] = settings.recentNews ? [...settings.recentNews] : [];
    let selectedTemplate: CuratedHeadlineTemplate | undefined = forcedNews;

    if (!selectedTemplate && Math.random() < 0.28) {
      const activeSymbols = new Set(activeCompanies.map((c) => c.symbol));
      const eligible = NEWS_HEADLINES.filter((n) => activeSymbols.has(n.targetSymbol));
      if (eligible.length > 0) {
        selectedTemplate = eligible[Math.floor(Math.random() * eligible.length)];
      }
    }

    if (selectedTemplate) {
      newsToPublish = {
        id: `news-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        headline: selectedTemplate.headline,
        summary: selectedTemplate.summary,
        targetSymbol: selectedTemplate.targetSymbol,
        sector: selectedTemplate.sector,
        sentiment: selectedTemplate.sentiment,
        impactPct: selectedTemplate.impactPct,
        timestampLabel: label,
      };
      recentNews = [newsToPublish, ...recentNews].slice(0, MAX_RECENT_NEWS);
    } else if (recentNews.length > MAX_RECENT_NEWS) {
      recentNews = recentNews.slice(0, MAX_RECENT_NEWS);
    }

    // Rotate through AUTO_TICK_BATCH_SIZE stocks per automatic tick to stay well under Spark free write-unit limits,
    // while manual Step Tick Now (fullTick=true) updates all active stocks.
    let targetCompanies = activeCompanies;
    if (!fullTick && activeCompanies.length > AUTO_TICK_BATCH_SIZE) {
      const chosen = new Map<string, Company>();
      for (let i = 0; i < AUTO_TICK_BATCH_SIZE; i++) {
        const comp = activeCompanies[(tickRotationCursor + i) % activeCompanies.length];
        chosen.set(comp.symbol, comp);
      }
      tickRotationCursor = (tickRotationCursor + AUTO_TICK_BATCH_SIZE) % activeCompanies.length;
      if (selectedTemplate) {
        const targetComp = activeCompanies.find((c) => c.symbol === selectedTemplate.targetSymbol);
        if (targetComp) {
          chosen.set(targetComp.symbol, targetComp);
        }
      }
      targetCompanies = Array.from(chosen.values());
    }

    const updatedPrices: Record<string, MarketPrice> = { ...priceMap };

    for (const company of targetCompanies) {
      const currentDoc = priceMap[company.symbol];
      const openPrice = currentDoc?.currentPrice ?? company.startingPrice;

      // Random Brownian shock + bias drift + targeted news impact
      const randShock = (Math.random() - 0.495) * 2 * volatility;
      let newsShock = 0;
      if (selectedTemplate) {
        if (selectedTemplate.targetSymbol === company.symbol) {
          newsShock = selectedTemplate.impactPct / 100;
        } else if (selectedTemplate.sector === company.sector) {
          newsShock = (selectedTemplate.impactPct / 100) * 0.28;
        }
      }

      const pctMove = Math.max(-0.08, Math.min(0.08, drift + randShock + newsShock));
      const rawClose = Math.max(5, openPrice * (1 + pctMove));
      const closePrice = Number(rawClose.toFixed(2));
      const wickFactor = Math.max(0.002, Math.abs(pctMove) * 0.55 + Math.random() * 0.003);
      const candleHigh = Number((Math.max(openPrice, closePrice) * (1 + wickFactor)).toFixed(2));
      const candleLow = Number(
        Math.max(2, Math.min(openPrice, closePrice) * (1 - wickFactor)).toFixed(2)
      );
      const tickVol = Math.round(800 + Math.random() * 5400 + (newsShock !== 0 ? 9500 : 0));

      const nextCandle: CandlePoint = {
        t: now.getTime(),
        label: now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
        open: openPrice,
        high: candleHigh,
        low: candleLow,
        close: closePrice,
        volume: tickVol,
      };

      const prevCandles = currentDoc?.candles ?? [];
      const nextCandles = [...prevCandles, nextCandle].slice(-MAX_STORED_CANDLES);
      const prevHigh = currentDoc?.dayHigh ?? openPrice;
      const prevLow = currentDoc?.dayLow ?? openPrice;
      const prevVol = currentDoc?.volume ?? 0;

      const updated: MarketPrice = {
        symbol: company.symbol,
        currentPrice: closePrice,
        previousClose: currentDoc?.previousClose ?? company.previousClose,
        dayHigh: Number(Math.max(prevHigh, candleHigh).toFixed(2)),
        dayLow: Number(Math.min(prevLow, candleLow).toFixed(2)),
        volume: prevVol + tickVol,
        candles: nextCandles,
      };
      updatedPrices[company.symbol] = updated;

      batch.update(doc(db, 'market_prices', company.symbol), {
        currentPrice: updated.currentPrice,
        dayHigh: updated.dayHigh,
        dayLow: updated.dayLow,
        volume: updated.volume,
        candles: updated.candles,
        updatedAt: serverTimestamp(),
      });
    }

    const nextIndexValue = calculateNws20Index(activeCompanies, updatedPrices);
    const nextHistory = [...(settings.indexHistory ?? []), { label, value: nextIndexValue }].slice(
      -MAX_INDEX_HISTORY
    );

    batch.update(doc(db, 'market_settings', 'global'), {
      indexValue: nextIndexValue,
      indexHistory: nextHistory,
      ...(newsToPublish ? { activeNews: newsToPublish } : {}),
      recentNews,
      lastTickAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    if (isQuotaExceededError(err)) throw err;
    handleFirestoreError(err, OperationType.UPDATE, 'market_prices/market_settings');
  }
}

export interface TradeExecutionResult {
  txId: string;
  billNumber: string;
  clientOrderKey: string;
  symbol: string;
  companyName: string;
  type: OrderType;
  productType: TradeProductType;
  quantity: number;
  price: number;
  totalAmount: number;
  brokerageAmount: number;
  netAmount: number;
  newBalance: number;
  brokerageDue: number;
}

function isTransientContentionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code?: unknown }).code || '').toLowerCase() : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    code === 'aborted' ||
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    msg.includes('too much contention') ||
    msg.includes('transaction lock') ||
    msg.includes('aborted')
  );
}

export async function executeInvestorTrade(params: {
  investorUid: string;
  symbol: string;
  type: OrderType;
  productType?: TradeProductType;
  quantity: number;
}): Promise<TradeExecutionResult> {
  const { investorUid, symbol, type, productType = 'INTRADAY', quantity } = params;

  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) {
    throw new Error('Quantity must be a whole number between 1 and 10,00,000.');
  }

  const clientOrderKey = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const billNumber = `NWS-BILL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const investorRef = doc(db, 'investors', investorUid);
  const companyRef = doc(db, 'companies', symbol);
  const priceRef = doc(db, 'market_prices', symbol);
  const settingsRef = doc(db, 'market_settings', 'global');
  const holdingRef = doc(db, 'portfolios', `${investorUid}_${symbol}`);

  try {
    let result: TradeExecutionResult | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const txRef = doc(collection(db, 'transactions'));
      try {
        result = await runTransaction(db, async (tx) => {
          const [settingsSnap, companySnap, priceSnap, investorSnap, holdingSnap] = await Promise.all([
            tx.get(settingsRef),
            tx.get(companyRef),
            tx.get(priceRef),
            tx.get(investorRef),
            tx.get(holdingRef),
          ]);

          if (!settingsSnap.exists()) {
            throw new Error('Exchange settings not initialized yet.');
          }
          const settingsData = settingsSnap.data() as MarketSettings;
          if (settingsData.status !== 'OPEN') {
            throw new Error(`Market is currently ${settingsData.status}. Orders can only be placed when OPEN.`);
          }

          if (!companySnap.exists() || !companySnap.data().isActive) {
            throw new Error('This company is not currently active for trading.');
          }
          const companyData = companySnap.data() as Company;

          if (!priceSnap.exists()) {
            throw new Error('Live market price unavailable for this stock.');
          }
          const priceData = priceSnap.data() as MarketPrice;

          if (!investorSnap.exists()) {
            throw new Error('Investor profile not found.');
          }
          const investorData = investorSnap.data();
          if (investorData.isDisabled) {
            throw new Error('Your investor account is currently disabled by the exchange administrator.');
          }

          const executionPrice = Number(priceData.currentPrice.toFixed(2));
          const totalAmount = Number((executionPrice * quantity).toFixed(2));
          const brokerageAmount = calculateBrokerage(totalAmount, productType);
          const existingQty = holdingSnap.exists() ? Number(holdingSnap.data().quantity) : 0;
          const existingAvg = holdingSnap.exists() ? Number(holdingSnap.data().averageBuyPrice) : 0;

          const currentBalance = Number(investorData.balance);
          let newBalance = currentBalance;
          let netAmount = totalAmount;
          let nextQty = existingQty;
          let nextAvg = existingAvg;

          if (type === 'BUY') {
            if (currentBalance < totalAmount) {
              throw new Error(
                `Insufficient balance for shares. Required ₹${totalAmount.toLocaleString('en-IN')}, available ₹${currentBalance.toLocaleString('en-IN')}.`
              );
            }
            netAmount = Number((totalAmount + brokerageAmount).toFixed(2));
            // If remaining balance cannot cover brokerage, investor gets a negative balance (brokerage due)
            newBalance = Number((currentBalance - netAmount).toFixed(2));
            nextQty = existingQty + quantity;
            nextAvg = Number(
              ((existingQty * existingAvg + totalAmount) / nextQty).toFixed(2)
            );
          } else {
            if (existingQty < quantity) {
              throw new Error(`Insufficient shares. You own ${existingQty} shares of ${symbol}.`);
            }
            netAmount = Number((totalAmount - brokerageAmount).toFixed(2));
            newBalance = Number((currentBalance + netAmount).toFixed(2));
            nextQty = existingQty - quantity;
            nextAvg = nextQty === 0 ? 0 : existingAvg;
          }

          // Write ONLY to this investor's isolated documents so 50+ concurrent traders never contend
          tx.set(txRef, {
            investorUid,
            investorId: investorData.investorId,
            investorName: investorData.name,
            symbol,
            companyName: companyData.name,
            type,
            productType,
            quantity,
            price: executionPrice,
            totalAmount,
            brokerageAmount,
            netAmount,
            billNumber,
            clientOrderKey,
            createdAt: serverTimestamp(),
          });

          tx.update(investorRef, {
            balance: newBalance,
            lastTxId: txRef.id,
            updatedAt: serverTimestamp(),
          });

          if (holdingSnap.exists()) {
            tx.update(holdingRef, {
              quantity: nextQty,
              averageBuyPrice: nextAvg,
              updatedAt: serverTimestamp(),
            });
          } else {
            tx.set(holdingRef, {
              investorUid,
              investorId: investorData.investorId,
              symbol,
              companyName: companyData.name,
              quantity: nextQty,
              averageBuyPrice: nextAvg,
              updatedAt: serverTimestamp(),
            });
          }

          return {
            txId: txRef.id,
            billNumber,
            clientOrderKey,
            symbol,
            companyName: companyData.name,
            type,
            productType,
            quantity,
            price: executionPrice,
            totalAmount,
            brokerageAmount,
            netAmount,
            newBalance,
            brokerageDue: newBalance < 0 ? Number(Math.abs(newBalance).toFixed(2)) : 0,
          };
        });
        break;
      } catch (innerErr) {
        if (attempt < 4 && isTransientContentionError(innerErr) && !isQuotaExceededError(innerErr)) {
          const jitterMs = 120 * (attempt + 1) + Math.floor(Math.random() * 180);
          await new Promise((r) => setTimeout(r, jitterMs));
          continue;
        }
        throw innerErr;
      }
    }

    if (!result) {
      throw new Error('Unable to complete order right now. Please try again.');
    }

    return result;
  } catch (err) {
    if (isQuotaExceededError(err)) throw err;
    if (
      err instanceof Error &&
      !err.message.toLowerCase().includes('permission') &&
      !err.message.toLowerCase().includes('insufficient permissions')
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, 'transactions/investors/portfolios');
  }
}

export async function clearCollectionDocs(collectionName: string): Promise<number> {
  try {
    const targetQuery =
      collectionName === 'investors'
        ? query(collection(db, collectionName), where('isDisabled', 'in', [false, true]))
        : collectionName === 'portfolios'
          ? query(collection(db, collectionName), where('quantity', '>=', 0))
          : collectionName === 'transactions'
            ? query(collection(db, collectionName), where('type', 'in', ['BUY', 'SELL']))
            : collection(db, collectionName);
    const snap = await getDocs(targetQuery);
    if (snap.empty) return 0;
    const ops = snap.docs.map((d) => (batch: WriteBatch) => batch.delete(d.ref));
    await commitAdminOpsInChunks(ops, 350);
    return snap.docs.length;
  } catch (err) {
    if (isQuotaExceededError(err)) throw err;
    handleFirestoreError(err, OperationType.DELETE, collectionName);
  }
}

export async function ensureAdminRecord(uid: string, email: string, displayName: string) {
  const sessionKey = `nws_admin_ensured_${uid}`;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(sessionKey)) {
      return;
    }
    const adminRef = doc(db, 'admin_accounts', uid);
    const snap = await getDoc(adminRef);
    if (!snap.exists()) {
      const batch = writeBatch(db);
      batch.set(adminRef, {
        uid,
        email,
        displayName: displayName || 'Exchange Administrator',
        role: 'ADMIN',
        createdAt: serverTimestamp(),
      });
      await batch.commit();
    }
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(sessionKey, '1');
    }
  } catch (err) {
    if (isQuotaExceededError(err)) return;
    handleFirestoreError(err, OperationType.WRITE, `admin_accounts/${uid}`);
  }
}
