import type { CandlePoint, Company, NewsItem, Sector } from '../types/exchange';

export const SECTORS: Sector[] = [
  'Banking',
  'Technology',
  'Automobile',
  'Energy',
  'FMCG',
  'Healthcare',
  'Infrastructure',
  'Telecommunications',
  'Manufacturing',
];

export const SEED_COMPANIES: Omit<Company, 'updatedAt'>[] = [
  {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Ltd',
    sector: 'Energy',
    startingPrice: 1285.0,
    previousClose: 1285.0,
    description:
      'India’s largest private conglomerate spanning oil-to-chemicals refining, green hydrogen energy, Jio telecom, and pan-India omnichannel retail.',
    headquarters: 'Mumbai, Maharashtra',
    marketCapCr: 1740000,
    isActive: true,
    showOnLed: true,
  },
  {
    symbol: 'TCS',
    name: 'Tata Consultancy Services Ltd',
    sector: 'Technology',
    startingPrice: 4120.0,
    previousClose: 4120.0,
    description:
      'Global IT services, enterprise cloud transformation, and mission-critical banking software powerhouse headquartered in Mumbai.',
    headquarters: 'Mumbai, Maharashtra',
    marketCapCr: 1490000,
    isActive: true,
    showOnLed: true,
  },
  {
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Ltd',
    sector: 'Banking',
    startingPrice: 1745.0,
    previousClose: 1745.0,
    description:
      'India’s largest private sector bank by assets, leading retail mortgages, corporate treasury, and digital UPI payments infrastructure.',
    headquarters: 'Mumbai, Maharashtra',
    marketCapCr: 1330000,
    isActive: true,
    showOnLed: true,
  },
  {
    symbol: 'BHARTIARTL',
    name: 'Bharti Airtel Ltd',
    sector: 'Telecommunications',
    startingPrice: 1620.0,
    previousClose: 1620.0,
    description:
      'Premier integrated telecommunications operator delivering nationwide 5G mobility, FTTH broadband, and enterprise cloud connectivity.',
    headquarters: 'New Delhi, Delhi',
    marketCapCr: 955000,
    isActive: true,
    showOnLed: true,
  },
  {
    symbol: 'ICICIBANK',
    name: 'ICICI Bank Ltd',
    sector: 'Banking',
    startingPrice: 1290.0,
    previousClose: 1290.0,
    description:
      'Major private commercial bank serving retail credit, SME business banking, wealth management, and international trade corridors.',
    headquarters: 'Mumbai, Maharashtra',
    marketCapCr: 910000,
    isActive: true,
    showOnLed: true,
  },
  {
    symbol: 'INFY',
    name: 'Infosys Ltd',
    sector: 'Technology',
    startingPrice: 1865.0,
    previousClose: 1865.0,
    description:
      'Multinational digital engineering, enterprise AI consulting, and Finacle core-banking software leader.',
    headquarters: 'Bengaluru, Karnataka',
    marketCapCr: 775000,
    isActive: true,
    showOnLed: true,
  },
  {
    symbol: 'SBIN',
    name: 'State Bank of India',
    sector: 'Banking',
    startingPrice: 825.0,
    previousClose: 825.0,
    description:
      'India’s largest public sector banking and financial services institution with nationwide branch reach and YONO digital banking.',
    headquarters: 'Mumbai, Maharashtra',
    marketCapCr: 736000,
    isActive: true,
    showOnLed: true,
  },
  {
    symbol: 'ITC',
    name: 'ITC Ltd',
    sector: 'FMCG',
    startingPrice: 478.0,
    previousClose: 478.0,
    description:
      'Diversified FMCG, agribusiness, paperboards, and hospitality conglomerate with deep rural kirana distribution across India.',
    headquarters: 'Kolkata, West Bengal',
    marketCapCr: 598000,
    isActive: true,
    showOnLed: true,
  },
  {
    symbol: 'HINDUNILVR',
    name: 'Hindustan Unilever Ltd',
    sector: 'FMCG',
    startingPrice: 2480.0,
    previousClose: 2480.0,
    description:
      'India’s flagship consumer goods company marketing household, personal care, and packaged food brands across urban and rural markets.',
    headquarters: 'Mumbai, Maharashtra',
    marketCapCr: 582000,
    isActive: true,
    showOnLed: true,
  },
  {
    symbol: 'LT',
    name: 'Larsen & Toubro Ltd',
    sector: 'Infrastructure',
    startingPrice: 3640.0,
    previousClose: 3640.0,
    description:
      'Premier engineering, EPC construction, metro rail, defence manufacturing, and heavy infrastructure conglomerate.',
    headquarters: 'Mumbai, Maharashtra',
    marketCapCr: 501000,
    isActive: true,
    showOnLed: true,
  },
  {
    symbol: 'SUNPHARMA',
    name: 'Sun Pharmaceutical Industries Ltd',
    sector: 'Healthcare',
    startingPrice: 1810.0,
    previousClose: 1810.0,
    description:
      'India’s largest pharmaceutical company specializing in specialty dermatology, chronic generics, and global API exports.',
    headquarters: 'Mumbai, Maharashtra',
    marketCapCr: 434000,
    isActive: true,
    showOnLed: true,
  },
  {
    symbol: 'MARUTI',
    name: 'Maruti Suzuki India Ltd',
    sector: 'Automobile',
    startingPrice: 11450.0,
    previousClose: 11450.0,
    description:
      'Market-leading passenger vehicle manufacturer producing hatchbacks, SUVs, CNG hybrids, and export models across Haryana and Gujarat.',
    headquarters: 'New Delhi, Delhi',
    marketCapCr: 360000,
    isActive: true,
    showOnLed: true,
  },
  {
    symbol: 'HCLTECH',
    name: 'HCL Technologies Ltd',
    sector: 'Technology',
    startingPrice: 1840.0,
    previousClose: 1840.0,
    description:
      'Global IT infrastructure, engineering R&D, cybersecurity, and enterprise software products company.',
    headquarters: 'Noida, Uttar Pradesh',
    marketCapCr: 499000,
    isActive: true,
    showOnLed: false,
  },
  {
    symbol: 'NTPC',
    name: 'NTPC Ltd',
    sector: 'Energy',
    startingPrice: 388.0,
    previousClose: 388.0,
    description:
      'India’s largest integrated power utility operating thermal, hydro, and utility-scale solar and green energy parks.',
    headquarters: 'New Delhi, Delhi',
    marketCapCr: 376000,
    isActive: true,
    showOnLed: false,
  },
  {
    symbol: 'ONGC',
    name: 'Oil and Natural Gas Corporation Ltd',
    sector: 'Energy',
    startingPrice: 268.0,
    previousClose: 268.0,
    description:
      'India’s flagship upstream oil and natural gas explorer and producer supplying domestic refining and energy security.',
    headquarters: 'New Delhi, Delhi',
    marketCapCr: 337000,
    isActive: true,
    showOnLed: false,
  },
  {
    symbol: 'TATAMOTORS',
    name: 'Tata Motors Ltd',
    sector: 'Automobile',
    startingPrice: 890.0,
    previousClose: 890.0,
    description:
      'Integrated commercial vehicle, passenger EV, and luxury SUV manufacturer owning domestic EV leadership and Jaguar Land Rover.',
    headquarters: 'Mumbai, Maharashtra',
    marketCapCr: 328000,
    isActive: true,
    showOnLed: false,
  },
  {
    symbol: 'ADANIPORTS',
    name: 'Adani Ports and Special Economic Zone Ltd',
    sector: 'Infrastructure',
    startingPrice: 1260.0,
    previousClose: 1260.0,
    description:
      'India’s largest private commercial port developer and multi-modal logistics operator across eastern and western coastlines.',
    headquarters: 'Ahmedabad, Gujarat',
    marketCapCr: 272000,
    isActive: true,
    showOnLed: false,
  },
  {
    symbol: 'JSWSTEEL',
    name: 'JSW Steel Ltd',
    sector: 'Manufacturing',
    startingPrice: 965.0,
    previousClose: 965.0,
    description:
      'Leading integrated flat and long steel manufacturer serving automotive alloys, infrastructure construction, and clean energy.',
    headquarters: 'Mumbai, Maharashtra',
    marketCapCr: 236000,
    isActive: true,
    showOnLed: false,
  },
  {
    symbol: 'TATASTEEL',
    name: 'Tata Steel Ltd',
    sector: 'Manufacturing',
    startingPrice: 152.0,
    previousClose: 152.0,
    description:
      'Global steelmaker with captive iron ore operations in Jamshedpur and Kalinganagar producing high-grade industrial steel.',
    headquarters: 'Mumbai, Maharashtra',
    marketCapCr: 190000,
    isActive: true,
    showOnLed: false,
  },
  {
    symbol: 'CIPLA',
    name: 'Cipla Ltd',
    sector: 'Healthcare',
    startingPrice: 1535.0,
    previousClose: 1535.0,
    description:
      'Global pharmaceutical leader in respiratory inhalation therapies, acute generics, and chronic formulations across 80+ countries.',
    headquarters: 'Mumbai, Maharashtra',
    marketCapCr: 124000,
    isActive: true,
    showOnLed: false,
  },
];

export function buildInitialCandles(basePrice: number, seedOffset: number): CandlePoint[] {
  const candles: CandlePoint[] = [];
  let cursor = basePrice * 0.985;
  const now = Date.now();
  for (let i = 15; i >= 0; i--) {
    const wave =
      Math.sin((i + seedOffset) * 0.85) * 0.008 + Math.cos((i + seedOffset) * 1.3) * 0.004;
    const open = Number(cursor.toFixed(2));
    const close = i === 0 ? basePrice : Number(Math.max(0.5, open * (1 + wave)).toFixed(2));
    const spread = Math.abs(close - open) + open * 0.0045;
    const high = Number((Math.max(open, close) + spread * 0.65).toFixed(2));
    const low = Number(Math.max(0.25, Math.min(open, close) - spread * 0.65).toFixed(2));
    const dt = new Date(now - i * 60_000);
    candles.push({
      t: dt.getTime(),
      label: dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      open,
      high,
      low,
      close,
      volume: Math.round(18000 + ((seedOffset * 1379 + i * 2411) % 45000)),
    });
    cursor = close;
  }
  return candles;
}

export interface CuratedHeadlineTemplate {
  headline: string;
  summary: string;
  targetSymbol: string;
  sector: Sector;
  sentiment: 'POSITIVE' | 'NEGATIVE';
  impactPct: number;
}

export const NEWS_HEADLINES: CuratedHeadlineTemplate[] = [
  {
    headline: 'Reliance Industries accelerates Jamnagar solar gigafactory & Jio 5G enterprise rollout',
    summary: 'Retail and telecom EBITDA expansion lifts consolidated quarterly operating cash flows.',
    targetSymbol: 'RELIANCE',
    sector: 'Energy',
    sentiment: 'POSITIVE',
    impactPct: 3.1,
  },
  {
    headline: 'TCS signs multi-year ₹4,800 Cr European core banking cloud modernization contract',
    summary: 'Total contract value order book rises to record visibility across BFSI and manufacturing verticals.',
    targetSymbol: 'TCS',
    sector: 'Technology',
    sentiment: 'POSITIVE',
    impactPct: 3.4,
  },
  {
    headline: 'HDFC Bank posts 18% YoY deposit growth with steady net interest margins and low NPAs',
    summary: 'Retail loan disbursements and credit-deposit ratio improvements beat street consensus.',
    targetSymbol: 'HDFCBANK',
    sector: 'Banking',
    sentiment: 'POSITIVE',
    impactPct: 2.9,
  },
  {
    headline: 'Bharti Airtel adds 4.4 million postpaid & 5G subscribers as ARPU climbs past ₹230',
    summary: 'Strong rural tower densification and enterprise data demand boost free cash flow.',
    targetSymbol: 'BHARTIARTL',
    sector: 'Telecommunications',
    sentiment: 'POSITIVE',
    impactPct: 3.2,
  },
  {
    headline: 'Infosys trims near-term discretionary IT consulting guidance amid European client caution',
    summary: 'Delayed project ramp-ups in financial services soften sequential revenue outlook.',
    targetSymbol: 'INFY',
    sector: 'Technology',
    sentiment: 'NEGATIVE',
    impactPct: -2.6,
  },
  {
    headline: 'Larsen & Toubro wins ₹7,500 Cr high-speed rail electrification and metro EPC mandate',
    summary: 'Infrastructure order backlog crosses new milestone with healthy execution margins.',
    targetSymbol: 'LT',
    sector: 'Infrastructure',
    sentiment: 'POSITIVE',
    impactPct: 3.6,
  },
  {
    headline: 'Tata Motors reports temporary semiconductor supply bottleneck at Pune EV assembly line',
    summary: 'Management schedules short two-week production realignment for select passenger variants.',
    targetSymbol: 'TATAMOTORS',
    sector: 'Automobile',
    sentiment: 'NEGATIVE',
    impactPct: -2.8,
  },
  {
    headline: 'Sun Pharma receives regulatory clearance for specialty dermatology exports to US & EU',
    summary: 'High-margin branded pipeline drives upward revision in annual R&D return metrics.',
    targetSymbol: 'SUNPHARMA',
    sector: 'Healthcare',
    sentiment: 'POSITIVE',
    impactPct: 2.9,
  },
  {
    headline: 'Maruti Suzuki monthly SUV dispatches hit record high ahead of festive bookings surge',
    summary: 'CNG and strong-hybrid models account for over 36% of domestic retail showroom orders.',
    targetSymbol: 'MARUTI',
    sector: 'Automobile',
    sentiment: 'POSITIVE',
    impactPct: 2.7,
  },
  {
    headline: 'ICICI Bank expands SME digital credit portfolio with 22% YoY operating profit growth',
    summary: 'Treasury gains and disciplined provisioning keep return on assets above 2.3%.',
    targetSymbol: 'ICICIBANK',
    sector: 'Banking',
    sentiment: 'POSITIVE',
    impactPct: 2.5,
  },
  {
    headline: 'Tata Steel flags elevated coking coal import costs compressing European strip spreads',
    summary: 'Domestic Kalinganagar blast furnace ramp-up partially cushions consolidated margins.',
    targetSymbol: 'TATASTEEL',
    sector: 'Manufacturing',
    sentiment: 'NEGATIVE',
    impactPct: -2.5,
  },
  {
    headline: 'ITC FMCG-Others segment posts strong rural volume recovery in packaged foods & staples',
    summary: 'Hotel occupancy and paperboard exports contribute steadily to quarterly profitability.',
    targetSymbol: 'ITC',
    sector: 'FMCG',
    sentiment: 'POSITIVE',
    impactPct: 2.3,
  },
  {
    headline: 'State Bank of India corporate credit pipeline strengthens on infrastructure capex demand',
    summary: 'Clean asset quality and YONO digital origination lower cost-to-income ratio.',
    targetSymbol: 'SBIN',
    sector: 'Banking',
    sentiment: 'POSITIVE',
    impactPct: 2.6,
  },
  {
    headline: 'Hindustan Unilever notes near-term palm oil inflation pressuring personal care gross margins',
    summary: 'Gradual rural demand pickup offsets selective input price volatility across SKUs.',
    targetSymbol: 'HINDUNILVR',
    sector: 'FMCG',
    sentiment: 'NEGATIVE',
    impactPct: -2.1,
  },
  {
    headline: 'NTPC commissions 1.5 GW renewable solar capacity in Rajasthan ahead of schedule',
    summary: 'Long-term power purchase agreements bolster green energy subsidiary valuation.',
    targetSymbol: 'NTPC',
    sector: 'Energy',
    sentiment: 'POSITIVE',
    impactPct: 3.0,
  },
  {
    headline: 'Adani Ports handles record 38 million metric tonnes monthly cargo across western terminals',
    summary: 'Automated container berths cut vessel turnaround time by 19% year-on-year.',
    targetSymbol: 'ADANIPORTS',
    sector: 'Infrastructure',
    sentiment: 'POSITIVE',
    impactPct: 2.8,
  },
];
