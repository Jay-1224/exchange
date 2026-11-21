export type Sector =
  | 'Banking'
  | 'Technology'
  | 'Automobile'
  | 'Energy'
  | 'FMCG'
  | 'Healthcare'
  | 'Infrastructure'
  | 'Telecommunications'
  | 'Manufacturing';

export type MarketStatus = 'OPEN' | 'PAUSED' | 'CLOSED';
export type MarketBias = 'NEUTRAL' | 'BULLISH' | 'BEARISH' | 'VOLATILE';
export type OrderType = 'BUY' | 'SELL';
export type TradeProductType = 'DELIVERY' | 'INTRADAY';

export type AppRoute =
  | 'home'
  | 'market'
  | 'companies'
  | 'trading'
  | 'portfolio'
  | 'transactions'
  | 'learn'
  | 'login'
  | 'admin'
  | 'led';

export interface CandlePoint {
  t: number;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Company {
  symbol: string;
  name: string;
  sector: Sector;
  startingPrice: number;
  previousClose: number;
  description: string;
  headquarters: string;
  marketCapCr: number;
  isActive: boolean;
  showOnLed: boolean;
  updatedAt?: unknown;
}

export interface MarketPrice {
  symbol: string;
  currentPrice: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  candles: CandlePoint[];
  updatedAt?: unknown;
}

export interface IndexPoint {
  label: string;
  value: number;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  targetSymbol: string;
  sector: Sector | 'MARKET';
  sentiment: 'POSITIVE' | 'NEGATIVE';
  impactPct: number;
  timestampLabel: string;
}

export interface MarketSettings {
  status: MarketStatus;
  updateIntervalSec: number;
  marketBias: MarketBias;
  indexValue: number;
  indexPrevClose: number;
  indexBaseValue: number;
  indexHistory: IndexPoint[];
  ledSymbols: string[];
  activeNews?: NewsItem;
  recentNews?: NewsItem[];
  lastTickAt?: unknown;
  updatedAt?: unknown;
}

export interface Investor {
  uid: string;
  investorId: string;
  name: string;
  accessCode?: string;
  accessCodeHash?: string;
  balance: number;
  initialBalance: number;
  isDisabled: boolean;
  lastTxId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PortfolioHolding {
  id?: string;
  investorUid: string;
  investorId: string;
  symbol: string;
  companyName: string;
  quantity: number;
  averageBuyPrice: number;
  updatedAt?: unknown;
}

export interface TransactionRecord {
  id: string;
  investorUid: string;
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
  billNumber?: string;
  clientOrderKey: string;
  createdAt?: unknown;
}

export interface AdminAccount {
  uid: string;
  email: string;
  displayName: string;
  role: 'ADMIN';
  authType?: 'GOOGLE' | 'PASSWORD';
  passwordHash?: string;
  createdAt?: unknown;
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  adminUid: string;
  adminEmail: string;
  createdAt?: unknown;
}

export interface EnrichedStock extends Company {
  currentPrice: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  candles: CandlePoint[];
  change: number;
  changePct: number;
}

export interface GeneratedCredentialSlip {
  uid: string;
  investorId: string;
  accessCode: string;
  name: string;
  initialBalance: number;
}
