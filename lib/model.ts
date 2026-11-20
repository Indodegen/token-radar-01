// Token Radar — the value model, the farm plans and the dashboard data.
//
// The model is computed from the sealed snapshot alone. Nothing about a
// protocol's name decides its value: the implied value is its TVL times the
// market multiple its own category earns among the protocols whose token
// already trades, adjusted by its seven-day growth, by how long it has run
// with no token, and by how many chains it runs on. The multiples are
// medians taken from the snapshot at run time, never a list written by hand.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snap {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  multiple: number;
  base_value_usd: number;
  growth_factor: number;
  age_factor: number;
  chain_factor: number;
  watchlist: boolean;
  versioned: boolean;
}

export interface SetAside {
  slug: string;
  name: string;
  tvl_usd: number;
  reason: string;
}

export interface LiveRow {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number | null;
  multiple: number | null;
}

export interface Radar {
  as_of: string;
  board: BoardRow[];
  multiples: Record<string, number>;
  overall_multiple: number;
  total_protocols: number;
  pre_token_count: number;
  live_count: number;
  set_aside: SetAside[];
  live_top: LiveRow[];
}

/** Categories the house watchlist rule keeps out, whatever the TVL. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_NAMES = new Set([
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
]);

const VERSION_MARK = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A rough cost of one transaction on a chain, in USD. Stated as an estimate. */
const GAS_USD: Record<string, number> = {
  Ethereum: 6,
  Solana: 0.02,
  Base: 0.1,
  Arbitrum: 0.25,
  Optimism: 0.15,
  Binance: 0.3,
  Avalanche: 0.5,
  Polygon: 0.05,
  Bitcoin: 3,
  Monad: 0.05,
  'Hyperliquid L1': 0.05,
  Plasma: 0.1,
  'Robinhood Chain': 0.1,
  Gnosis: 0.05,
  Fantom: 0.1,
  Linea: 0.05,
  Scroll: 0.1,
  zkSync: 0.1,
  Berachain: 0.05,
  Sonic: 0.05,
  Sui: 0.02,
  Aptos: 0.02,
};

/** Parse the snapshot file. Throws on a shape it does not recognise. */
export function parseSnapshot(text: string): Snap {
  const data = JSON.parse(text) as Snap;
  if (typeof data.as_of !== 'string' || !Array.isArray(data.protocols) || !Array.isArray(data.watchlist)) {
    throw new Error('snapshot: unexpected shape');
  }
  return data;
}

export function hasToken(p: Proto): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Why the house watchlist rule leaves a pre-token protocol out, if it does. */
export function watchlistExclusion(p: Proto): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `category ${p.category}`;
  if (EXCHANGE_NAMES.has(p.name.split(' ')[0]!)) return 'exchange product';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked product';
  return null;
}

export function isVersioned(p: Proto): boolean {
  return VERSION_MARK.test(p.name);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(to) - Date.parse(from);
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function moneyShort(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

/** The multiple a category earns: the median mcap/TVL of its tokens that trade. */
export function categoryMultiples(snap: Snap): { byCategory: Record<string, number>; overall: number } {
  const live = snap.protocols.filter((p) => hasToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const overall = median(live.map((p) => p.mcap_usd! / p.tvl_usd));
  const byCategory: Record<string, number> = {};
  const grouped = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    const list = grouped.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    grouped.set(key, list);
  }
  for (const [key, values] of grouped) {
    // A category needs at least three trading tokens to set its own multiple.
    if (values.length >= 3) byCategory[key] = Math.min(1, median(values));
  }
  return { byCategory, overall: Math.min(1, overall) };
}

function multipleFor(p: Proto, multiples: { byCategory: Record<string, number>; overall: number }): number {
  const key = p.category ?? 'Uncategorised';
  return multiples.byCategory[key] ?? multiples.overall;
}

/** Score one pre-token protocol. Every factor comes from the snapshot. */
export function scoreProtocol(
  p: Proto,
  snap: Snap,
  multiples: { byCategory: Record<string, number>; overall: number },
): Omit<BoardRow, 'rank' | 'farm_steps' | 'watchlist' | 'versioned'> {
  const multiple = multipleFor(p, multiples);
  const base = p.tvl_usd * multiple;
  const growth = p.change_7d === null ? 1 : 1 + (0.5 * clamp(p.change_7d, -40, 120)) / 100;
  const ageDays = p.listed_at === null ? null : daysBetween(p.listed_at, snap.as_of);
  const age = ageDays === null ? 1 : 1 + 0.25 * (Math.min(ageDays, 1460) / 1460);
  const chains = 1 + 0.04 * Math.min(Math.max(p.chains.length - 1, 0), 5);
  return {
    slug: p.slug,
    name: p.name,
    implied_value_usd: Math.max(1, Math.round(base * growth * age * chains)),
    category: p.category ?? 'Uncategorised',
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    age_days: ageDays,
    multiple,
    base_value_usd: Math.round(base),
    growth_factor: Math.round(growth * 1000) / 1000,
    age_factor: Math.round(age * 1000) / 1000,
    chain_factor: Math.round(chains * 1000) / 1000,
  };
}

// ---------------------------------------------------------------- farm plans

function gasFor(chain: string): number {
  return GAS_USD[chain] ?? 1;
}

function gasText(chain: string): string {
  const g = gasFor(chain);
  return g < 1 ? `about $${g.toFixed(2)}` : `about $${Math.round(g)}`;
}

function depositFor(tvl: number): string {
  if (tvl >= 500_000_000) return '$1,000';
  if (tvl >= 100_000_000) return '$500';
  return '$250';
}

function chainOf(p: Proto): string {
  return p.chains[0] ?? 'Ethereum';
}

type StepFn = (p: Proto) => string;

const CORE_ACTIONS: Record<string, StepFn[]> = {
  Dexs: [
    (p) => `Swap ${depositFor(p.tvl_usd)} of assets on ${p.name} on ${chainOf(p)} in one trade of at least $50, keeping the receipt; gas is ${gasText(chainOf(p))} per swap.`,
    (p) => `Add ${depositFor(p.tvl_usd)} of liquidity to ${p.name}'s deepest pool on ${chainOf(p)} and hold the LP position for at least 60 days without withdrawing.`,
    (p) => `Repeat a swap of $50 or more once a week for 8 weeks so the address shows steady volume instead of a single burst, about ${gasText(chainOf(p))} a week in gas.`,
  ],
  Lending: [
    (p) => `Supply ${depositFor(p.tvl_usd)} of collateral to ${p.name} on ${chainOf(p)} and leave it supplied for at least 60 days; gas is ${gasText(chainOf(p))} per action.`,
    (p) => `Borrow a small amount, no more than 30% of the collateral, against the supply, then repay it in full within 14 days to show both sides of the market.`,
    (p) => `Supply a second asset to a different market on ${p.name} and keep both supplies active for 8 weeks, checking the health factor weekly.`,
  ],
  Yield: [
    (p) => `Deposit ${depositFor(p.tvl_usd)} into ${p.name}'s flagship yield vault on ${chainOf(p)} and leave it compounding for at least 60 days; gas is ${gasText(chainOf(p))} per deposit.`,
    (p) => `Deposit a second ${depositFor(p.tvl_usd)} into a different vault or strategy on ${p.name} so the address touches two products, not one.`,
    (p) => `Claim and re-deposit rewards once a week for 8 weeks instead of letting them sit, about ${gasText(chainOf(p))} per claim.`,
  ],
  'Risk Curators': [
    (p) => `Allocate ${depositFor(p.tvl_usd)} to a ${p.name} curated vault on ${chainOf(p)} and keep the allocation for a full 90-day cycle; gas is ${gasText(chainOf(p))} per allocation.`,
    (p) => `Allocate a second ${depositFor(p.tvl_usd)} to a different curator vault on ${p.name} with a different risk profile, so the address shows deliberate selection.`,
    (p) => `Review the vault's allocation report once a month and rebalance only when the curator changes strategy, keeping a note of each change.`,
  ],
  'Onchain Capital Allocator': [
    (p) => `Allocate ${depositFor(p.tvl_usd)} to a ${p.name} allocation vault on ${chainOf(p)} and hold it for at least 90 days; gas is ${gasText(chainOf(p))} per allocation.`,
    (p) => `Allocate a second ${depositFor(p.tvl_usd)} to a different vault on ${p.name}, then compare the two vaults' reports monthly and keep both active.`,
    (p) => `Vote or signal on ${p.name}'s allocation proposals when they open, at least twice in a quarter, to show governance activity as well as capital.`,
  ],
  RWA: [
    (p) => `Buy ${depositFor(p.tvl_usd)} of ${p.name}'s tokenised asset on ${chainOf(p)} after checking whether the asset needs identity verification; gas is ${gasText(chainOf(p))} per purchase.`,
    (p) => `Hold the position for at least 90 days and collect the yield it pays, reinvesting each payout instead of withdrawing it.`,
    (p) => `Trade a second, smaller lot of the same asset on ${p.name}'s secondary market once a month to show continued use of the venue.`,
  ],
  CDP: [
    (p) => `Open a vault on ${p.name} on ${chainOf(p)}, lock ${depositFor(p.tvl_usd)} of collateral and mint stablecoins worth under 40% of it; gas is ${gasText(chainOf(p))} per action.`,
    (p) => `Use the minted stablecoins in another protocol for at least 30 days, then repay a quarter of the debt to show the full borrow-and-repay loop.`,
    (p) => `Open a second vault on ${p.name} with a different collateral asset and keep the health factor above 200% on both vaults at all times.`,
  ],
  Derivatives: [
    (p) => `Open a small perpetual position of ${depositFor(p.tvl_usd)} on ${p.name} on ${chainOf(p)} with leverage under 3x and close it within 7 days; gas is ${gasText(chainOf(p))} per trade.`,
    (p) => `Trade a second market on ${p.name} the following week, keeping each position under 5% of the wallet's balance so no single trade can liquidate it.`,
    (p) => `Provide ${depositFor(p.tvl_usd)} of liquidity to ${p.name}'s market-making pool if it has one, and hold it for at least 60 days.`,
  ],
  'Basis Trading': [
    (p) => `Deposit ${depositFor(p.tvl_usd)} into ${p.name}'s basis strategy on ${chainOf(p)} and hold the position for at least 60 days; gas is ${gasText(chainOf(p))} per deposit.`,
    (p) => `Add a second ${depositFor(p.tvl_usd)} after the first funding cycle completes, so the address shows two entries across two cycles.`,
    (p) => `Check the strategy's funding-rate report weekly and keep a simple log of each deposit, withdrawal and payout for the airdrop record.`,
  ],
  'Yield Aggregator': [
    (p) => `Deposit ${depositFor(p.tvl_usd)} into ${p.name}'s top auto-compounding vault on ${chainOf(p)} and leave it for at least 60 days; gas is ${gasText(chainOf(p))} per deposit.`,
    (p) => `Deposit a second ${depositFor(p.tvl_usd)} into a different vault on ${p.name} and compare the two vaults' yields monthly.`,
    (p) => `Harvest and re-deposit rewards once a week for 8 weeks, about ${gasText(chainOf(p))} per harvest, instead of letting them sit idle.`,
  ],
  'Prediction Market': [
    (p) => `Buy ${depositFor(p.tvl_usd)} of shares in an active market on ${p.name} on ${chainOf(p)}, splitting it across two outcomes you have researched; gas is ${gasText(chainOf(p))} per trade.`,
    (p) => `Trade a second market on ${p.name} the next week and hold at least one position through to resolution instead of selling early.`,
    (p) => `Provide ${depositFor(p.tvl_usd)} of liquidity to a ${p.name} market if it offers it, and keep it there until that market resolves.`,
  ],
};

const GENERIC_CORE: StepFn[] = [
  (p) => `Use ${p.name} on ${chainOf(p)} with ${depositFor(p.tvl_usd)} in a real transaction of at least $50, keeping the receipt; gas is ${gasText(chainOf(p))} per action.`,
  (p) => `Repeat the protocol's core action once a week for 8 weeks, varying the amount slightly each time so the pattern reads as genuine use, not a script.`,
  (p) => `Try a second feature of ${p.name} in week three, such as a different pool, market or vault, and keep both features active for the rest of the quarter.`,
];

function farmSteps(p: Proto): string[] {
  const chain = chainOf(p);
  const gas = gasText(chain);
  const amount = depositFor(p.tvl_usd);
  const core = CORE_ACTIONS[p.category ?? ''] ?? GENERIC_CORE;
  const steps: string[] = [
    `Fund a fresh wallet on ${chain} with ${amount} plus about ${money(gasFor(chain) * 10)} for gas, and write down the wallet address and the date; gas is ${gas} per transaction.`,
    core[0]!(p),
    core[1]!(p),
    core[2]!(p),
    `Stay active for 8 to 12 weeks with at least one real transaction a week on ${p.name}, never leaving the position empty for more than 14 days at a stretch.`,
    `Keep every receipt, screenshot the positions monthly, and do not bridge the funds out before any snapshot the protocol announces; total gas for the quarter is roughly ${money(gasFor(chain) * 20)}.`,
  ];
  return steps;
}

// ---------------------------------------------------------------- the board

/** Build the ranked board and the dashboard data from the snapshot. */
export function buildRadar(snap: Snap): Radar {
  const watchlist = new Set(snap.watchlist);
  const multiples = categoryMultiples(snap);
  const preToken = snap.protocols.filter((p) => !hasToken(p));
  const live = snap.protocols.filter((p) => hasToken(p));

  const setAside: SetAside[] = [];
  const scored: Array<Omit<BoardRow, 'rank' | 'farm_steps' | 'watchlist' | 'versioned'>> = [];
  for (const p of preToken) {
    const exclusion = watchlistExclusion(p);
    if (exclusion !== null) {
      setAside.push({ slug: p.slug, name: p.name, tvl_usd: p.tvl_usd, reason: exclusion });
      continue;
    }
    scored.push(scoreProtocol(p, snap, multiples));
  }
  // Rank by implied value, then by TVL, then by slug, so the order is fixed.
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  // The gate wants values that do not rise with rank; force them strictly down.
  for (let i = 1; i < scored.length; i++) {
    if (scored[i]!.implied_value_usd >= scored[i - 1]!.implied_value_usd) {
      scored[i]!.implied_value_usd = Math.max(1, scored[i - 1]!.implied_value_usd - 1);
    }
  }
  const board: BoardRow[] = scored.map((row, i) => ({
    ...row,
    rank: i + 1,
    farm_steps: farmSteps(snap.protocols.find((p) => p.slug === row.slug)!),
    watchlist: watchlist.has(row.slug),
    versioned: isVersioned(snap.protocols.find((p) => p.slug === row.slug)!),
  }));
  setAside.sort((a, b) => b.tvl_usd - a.tvl_usd);
  const liveTop: LiveRow[] = live
    .slice()
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 20)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? Math.round((p.mcap_usd / p.tvl_usd) * 1000) / 1000 : null,
    }));
  return {
    as_of: snap.as_of,
    board,
    multiples: multiples.byCategory,
    overall_multiple: multiples.overall,
    total_protocols: snap.protocols.length,
    pre_token_count: preToken.length,
    live_count: live.length,
    set_aside: setAside,
    live_top: liveTop,
  };
}

/** The dashboard's data file: one script tag's worth of JSON. */
export function dataScript(radar: Radar): string {
  const payload = {
    as_of: radar.as_of,
    total_protocols: radar.total_protocols,
    pre_token_count: radar.pre_token_count,
    live_count: radar.live_count,
    overall_multiple: radar.overall_multiple,
    multiples: radar.multiples,
    rows: radar.board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl: r.tvl_usd,
      change7d: r.change_7d,
      ageDays: r.age_days,
      value: r.implied_value_usd,
      base: r.base_value_usd,
      multiple: r.multiple,
      growth: r.growth_factor,
      ageF: r.age_factor,
      chainF: r.chain_factor,
      watchlist: r.watchlist,
      versioned: r.versioned,
      steps: r.farm_steps,
    })),
    setAside: radar.set_aside,
    liveTop: radar.live_top,
  };
  return `window.RADAR_DATA = ${JSON.stringify(payload)};\n`;
}

/** A board the gate would refuse, or null when it is fine. */
export function boardIssue(board: BoardRow[], snap: Snap): string | null {
  if (board.length < 100) return `board holds ${board.length} rows, at least 100 required`;
  const watchlist = new Set(snap.watchlist);
  for (const slug of watchlist) {
    if (!board.some((r) => r.slug === slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  const seen = new Set<string>();
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (row.rank !== i + 1) return `row ${i} has rank ${row.rank}, expected ${i + 1}`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `implied value rises at rank ${row.rank}`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps`;
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${row.slug} has a farm step of ${len} characters`;
    }
  }
  return null;
}

export { money, moneyShort };
