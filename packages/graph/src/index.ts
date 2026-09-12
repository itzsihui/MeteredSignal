export type GraphMeta = {
  block: { number: number; timestamp: number; hash: string };
  deployment: string;
};

export type ProtocolSnapshot = {
  slug: string;
  protocol: string;
  network: string;
  subgraphId: string;
  status: 'ok' | 'stale' | 'unavailable';
  reason?: string;
  meta?: GraphMeta;
  protocolName?: string;
  totalValueLockedUSD?: string;
  totalBorrowBalanceUSD?: string;
  totalDepositBalanceUSD?: string;
};

export type LendingDecision = {
  verdict: 'GO' | 'NO_GO' | 'UNAVAILABLE';
  riskScore: number;
  reasons: string[];
  recommendation?: {
    preferSlug: string;
    preferProtocol: string;
    summary: string;
    ranking: Array<{
      slug: string;
      protocol: string;
      tvlUsd: number;
      borrowUsd: number;
      depositUsd: number;
      utilization: number;
    }>;
  };
};

export type LendingCompareResult = {
  queryTemplate: string;
  maxBlockLag: number;
  fetchedAt: string;
  /** When true, tip lag was injected so the video can show a freshness reject. */
  freshnessDemo?: boolean;
  protocols: ProtocolSnapshot[];
  /** Structured agent decision — not a raw Graph dump. */
  decision: LendingDecision;
  decisionHint: {
    actionable: boolean;
    summary: string;
  };
};

export type WalletRiskResult = {
  address: string;
  queryTemplate: string;
  maxBlockLag: number;
  fetchedAt: string;
  freshnessDemo?: boolean;
  positions: Array<{
    slug: string;
    protocol: string;
    network: string;
    status: 'ok' | 'stale' | 'unavailable';
    reason?: string;
    meta?: GraphMeta;
    markets: Array<{
      marketId: string;
      name: string;
      inputTokenSymbol?: string;
      depositedBalanceUSD?: string;
      borrowedBalanceUSD?: string;
    }>;
  }>;
  decision: {
    verdict: 'GO' | 'NO_GO' | 'UNAVAILABLE';
    riskScore: number;
    reasons: string[];
  };
};

const PROTOCOL_QUERY = /* GraphQL */ `
  query LendingProtocolSnapshot {
    _meta {
      block {
        number
        timestamp
        hash
      }
      deployment
    }
    lendingProtocols(first: 1) {
      name
      slug
      network
      totalValueLockedUSD
      totalBorrowBalanceUSD
      totalDepositBalanceUSD
    }
  }
`;

const POSITION_QUERY = /* GraphQL */ `
  query WalletPositions($account: String!) {
    _meta {
      block {
        number
        timestamp
        hash
      }
      deployment
    }
    positions(
      first: 25
      where: { account: $account, side: BORROWER, timestampClosed: null }
    ) {
      id
      balance
      market {
        id
        name
        inputToken {
          symbol
          decimals
        }
        inputTokenPriceUSD
      }
    }
    deposits: positions(
      first: 25
      where: { account: $account, side: COLLATERAL, timestampClosed: null }
    ) {
      id
      balance
      market {
        id
        name
        inputToken {
          symbol
          decimals
        }
        inputTokenPriceUSD
      }
    }
  }
`;

/** Messari Position.balance is native units — convert with market price + decimals. */
function balanceUsd(
  balance: string,
  decimals: number | undefined,
  priceUsd: string | undefined,
): string {
  const dec = Number.isFinite(decimals) ? Number(decimals) : 18;
  const price = Number(priceUsd ?? 0);
  const raw = Number(balance);
  if (!Number.isFinite(raw) || !Number.isFinite(price) || price <= 0) return '0';
  return String((raw / 10 ** dec) * price);
}

function gatewayUrl(subgraphId: string, apiKey: string): string {
  return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;
}

async function querySubgraph<T>(
  subgraphId: string,
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(gatewayUrl(subgraphId, apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Graph gateway HTTP ${res.status} for ${subgraphId}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  if (!json.data) throw new Error(`Empty Graph response for ${subgraphId}`);
  return json.data;
}

function freshnessStatus(
  meta: GraphMeta | undefined,
  expectedDeployment: string,
  maxBlockLag: number,
  tipBlock?: number,
): { status: 'ok' | 'stale' | 'unavailable'; reason?: string } {
  if (!meta?.block?.number) {
    return { status: 'unavailable', reason: 'missing _meta.block' };
  }
  void expectedDeployment;
  if (typeof tipBlock === 'number') {
    const lag = tipBlock - meta.block.number;
    if (lag > maxBlockLag) {
      return { status: 'stale', reason: `block lag ${lag} > ${maxBlockLag}` };
    }
  }
  // Without a tip oracle, treat very old unix timestamps as stale (> 30 min)
  const ageSec = Math.floor(Date.now() / 1000) - Number(meta.block.timestamp);
  if (Number.isFinite(ageSec) && ageSec > 30 * 60) {
    return { status: 'stale', reason: `block age ${ageSec}s > 1800s` };
  }
  return { status: 'ok' };
}

/** Synthetic tip so the real lag gate fires — still uses live `_meta.block.number`. */
function tipForDemo(meta: GraphMeta | undefined, maxBlockLag: number, forceStale: boolean): number | undefined {
  if (!forceStale || !meta?.block?.number) return undefined;
  return meta.block.number + maxBlockLag + 25;
}

function rankLendingProtocols(ok: ProtocolSnapshot[]): LendingDecision['recommendation'] {
  const ranking = ok
    .map((p) => {
      const tvlUsd = Number(p.totalValueLockedUSD ?? 0);
      const borrowUsd = Number(p.totalBorrowBalanceUSD ?? 0);
      const depositUsd = Number(p.totalDepositBalanceUSD ?? 0);
      const utilization = depositUsd > 0 ? borrowUsd / depositUsd : 0;
      return {
        slug: p.slug,
        protocol: p.protocol,
        tvlUsd,
        borrowUsd,
        depositUsd,
        utilization,
      };
    })
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  const best = ranking[0];
  if (!best) return undefined;

  const utilPct = (best.utilization * 100).toFixed(1);
  return {
    preferSlug: best.slug,
    preferProtocol: best.protocol,
    summary: `Prefer ${best.slug} — deepest TVL ($${best.tvlUsd.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}) with ${utilPct}% utilization across Messari-standardized markets.`,
    ranking,
  };
}

function decideLendingCompare(protocols: ProtocolSnapshot[]): LendingDecision {
  const ok = protocols.filter((p) => p.status === 'ok');
  const stale = protocols.filter((p) => p.status === 'stale' || p.status === 'unavailable');

  if (ok.length < 2) {
    const staleBits = stale
      .map((p) => `${p.slug}: ${p.reason ?? p.status}`)
      .slice(0, 3)
      .join('; ');
    return {
      verdict: 'UNAVAILABLE',
      riskScore: 100,
      reasons: [
        `Freshness gate: need ≥2 fresh Messari sources; got ${ok.length}/${protocols.length}`,
        ...(staleBits ? [`Stale/unavailable: ${staleBits}`] : []),
        'Agent refuses Arc USDC spend until _meta.block freshness recovers',
      ],
    };
  }

  const recommendation = rankLendingProtocols(ok);
  const top = recommendation?.ranking[0];
  const second = recommendation?.ranking[1];
  const reasons: string[] = [
    `Live standardized scan across ${ok.length} protocols (one Messari query template)`,
  ];
  if (recommendation) reasons.push(recommendation.summary);
  if (top && second) {
    const delta = top.tvlUsd - second.tvlUsd;
    reasons.push(
      `TVL lead vs #2 (${second.slug}): $${delta.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    );
  }
  if (top && top.utilization > 0.9) {
    reasons.push(
      `Note: top venue utilization ${(top.utilization * 100).toFixed(1)}% — size cautiously`,
    );
  }

  return {
    verdict: 'GO',
    riskScore: top && top.utilization > 0.9 ? 45 : 25,
    reasons,
    recommendation,
  };
}

import { getDeployments, type ProtocolDeployment } from './registry.js';

export async function compareLendingProtocols(opts: {
  apiKey: string;
  maxBlockLag?: number;
  slugs?: string[];
  /** Inject tip ahead of indexed block so freshness gate fails (demo / video). */
  forceStale?: boolean;
}): Promise<LendingCompareResult> {
  const maxBlockLag = opts.maxBlockLag ?? 50;
  const forceStale = Boolean(opts.forceStale);
  const deployments = getDeployments(opts.slugs);

  const protocols: ProtocolSnapshot[] = await Promise.all(
    deployments.map(async (d) => {
      try {
        const data = await querySubgraph<{
          _meta: GraphMeta;
          lendingProtocols: Array<{
            name: string;
            slug: string;
            network: string;
            totalValueLockedUSD: string;
            totalBorrowBalanceUSD: string;
            totalDepositBalanceUSD: string;
          }>;
        }>(d.subgraphId, opts.apiKey, PROTOCOL_QUERY);

        const meta = data._meta;
        const tipBlock = tipForDemo(meta, maxBlockLag, forceStale);
        const fresh = freshnessStatus(meta, d.subgraphId, maxBlockLag, tipBlock);
        const p = data.lendingProtocols?.[0];
        if (fresh.status !== 'ok') {
          return {
            slug: d.slug,
            protocol: d.protocol,
            network: d.network,
            subgraphId: d.subgraphId,
            status: fresh.status,
            reason: fresh.reason,
            meta,
          };
        }
        return {
          slug: d.slug,
          protocol: d.protocol,
          network: d.network,
          subgraphId: d.subgraphId,
          status: 'ok' as const,
          meta,
          protocolName: p?.name,
          totalValueLockedUSD: p?.totalValueLockedUSD,
          totalBorrowBalanceUSD: p?.totalBorrowBalanceUSD,
          totalDepositBalanceUSD: p?.totalDepositBalanceUSD,
        };
      } catch (err) {
        return {
          slug: d.slug,
          protocol: d.protocol,
          network: d.network,
          subgraphId: d.subgraphId,
          status: 'unavailable' as const,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  const decision = decideLendingCompare(protocols);
  return {
    queryTemplate: 'LendingProtocolSnapshot (Messari standardized lending schema)',
    maxBlockLag,
    fetchedAt: new Date().toISOString(),
    freshnessDemo: forceStale || undefined,
    protocols,
    decision,
    decisionHint: {
      actionable: decision.verdict === 'GO',
      summary: decision.reasons[0] ?? decision.verdict,
    },
  };
}

export async function assessWalletRisk(opts: {
  apiKey: string;
  address: string;
  maxBlockLag?: number;
  slugs?: string[];
  forceStale?: boolean;
}): Promise<WalletRiskResult> {
  const maxBlockLag = opts.maxBlockLag ?? 50;
  const forceStale = Boolean(opts.forceStale);
  const address = opts.address.toLowerCase();
  const deployments = getDeployments(opts.slugs);

  const positions = await Promise.all(
    deployments.map(async (d: ProtocolDeployment) => {
      try {
        type PosRow = {
          id: string;
          balance: string;
          market: {
            id: string;
            name: string;
            inputToken?: { symbol: string; decimals: number };
            inputTokenPriceUSD?: string;
          };
        };
        const data = await querySubgraph<{
          _meta: GraphMeta;
          positions: PosRow[];
          deposits: PosRow[];
        }>(d.subgraphId, opts.apiKey, POSITION_QUERY, { account: address });

        const tipBlock = tipForDemo(data._meta, maxBlockLag, forceStale);
        const fresh = freshnessStatus(data._meta, d.subgraphId, maxBlockLag, tipBlock);
        if (fresh.status !== 'ok') {
          return {
            slug: d.slug,
            protocol: d.protocol,
            network: d.network,
            status: fresh.status,
            reason: fresh.reason,
            meta: data._meta,
            markets: [],
          };
        }

        const byMarket = new Map<
          string,
          { marketId: string; name: string; inputTokenSymbol?: string; depositedBalanceUSD?: string; borrowedBalanceUSD?: string }
        >();

        for (const dep of data.deposits ?? []) {
          const id = dep.market.id;
          const cur = byMarket.get(id) ?? {
            marketId: id,
            name: dep.market.name,
            inputTokenSymbol: dep.market.inputToken?.symbol,
          };
          const usd = Number(
            balanceUsd(dep.balance, dep.market.inputToken?.decimals, dep.market.inputTokenPriceUSD),
          );
          cur.depositedBalanceUSD = String(Number(cur.depositedBalanceUSD ?? 0) + usd);
          byMarket.set(id, cur);
        }
        for (const bor of data.positions ?? []) {
          const id = bor.market.id;
          const cur = byMarket.get(id) ?? {
            marketId: id,
            name: bor.market.name,
            inputTokenSymbol: bor.market.inputToken?.symbol,
          };
          const usd = Number(
            balanceUsd(bor.balance, bor.market.inputToken?.decimals, bor.market.inputTokenPriceUSD),
          );
          cur.borrowedBalanceUSD = String(Number(cur.borrowedBalanceUSD ?? 0) + usd);
          byMarket.set(id, cur);
        }

        return {
          slug: d.slug,
          protocol: d.protocol,
          network: d.network,
          status: 'ok' as const,
          meta: data._meta,
          markets: [...byMarket.values()],
        };
      } catch (err) {
        return {
          slug: d.slug,
          protocol: d.protocol,
          network: d.network,
          status: 'unavailable' as const,
          reason: err instanceof Error ? err.message : String(err),
          markets: [],
        };
      }
    }),
  );

  const fresh = positions.filter((p) => p.status === 'ok');
  const reasons: string[] = [];
  let riskScore = 20;
  let verdict: 'GO' | 'NO_GO' | 'UNAVAILABLE' = 'GO';

  if (fresh.length < 2) {
    verdict = 'UNAVAILABLE';
    const stale = positions.filter((p) => p.status !== 'ok');
    reasons.push(`Need ≥2 fresh standardized sources; got ${fresh.length}`);
    for (const p of stale.slice(0, 3)) {
      reasons.push(`${p.slug}: ${p.reason ?? p.status}`);
    }
    reasons.push('Agent refuses Arc USDC spend until _meta.block freshness recovers');
  } else {
    let totalBorrow = 0;
    let totalDeposit = 0;
    const byProtocol: Array<{ slug: string; borrow: number; deposit: number }> = [];
    for (const p of fresh) {
      let borrow = 0;
      let deposit = 0;
      for (const m of p.markets) {
        borrow += Number(m.borrowedBalanceUSD ?? 0);
        deposit += Number(m.depositedBalanceUSD ?? 0);
      }
      totalBorrow += borrow;
      totalDeposit += deposit;
      byProtocol.push({ slug: p.slug, borrow, deposit });
    }
    if (totalBorrow > 0 && totalDeposit === 0) {
      riskScore += 40;
      reasons.push(`Borrow-only exposure ~$${totalBorrow.toFixed(2)} across protocols`);
    }
    if (totalBorrow > 50_000) {
      riskScore += 25;
      reasons.push(`Large borrow notional ~$${totalBorrow.toFixed(0)}`);
    }
    if (totalBorrow > totalDeposit * 0.8 && totalDeposit > 0) {
      riskScore += 20;
      reasons.push('High borrow/deposit ratio across indexed markets');
    }
    const hot = byProtocol.filter((p) => p.borrow > 0).sort((a, b) => b.borrow - a.borrow)[0];
    if (hot) {
      reasons.push(`Largest borrow pocket: ${hot.slug} (~$${hot.borrow.toFixed(2)})`);
    }
    if (reasons.length === 0) {
      reasons.push(
        `Fresh multi-protocol scan clean (borrow $${totalBorrow.toFixed(2)}, deposit $${totalDeposit.toFixed(2)})`,
      );
    }
    if (riskScore >= 60) verdict = 'NO_GO';
  }

  return {
    address,
    queryTemplate: 'WalletPositions (Messari standardized lending schema)',
    maxBlockLag,
    fetchedAt: new Date().toISOString(),
    freshnessDemo: forceStale || undefined,
    positions,
    decision: { verdict, riskScore: Math.min(riskScore, 100), reasons },
  };
}

export { LENDING_REGISTRY, getDeployments } from './registry.js';
export type { ProtocolDeployment } from './registry.js';
