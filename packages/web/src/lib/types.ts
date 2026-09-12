export type RunMode = 'lending-compare' | 'wallet-risk'

export type PipelineStage =
  | 'connecting'
  | 'payment_required'
  | 'sending'
  | 'accepted'
  | 'payment_rejected'
  | 'querying_graph'
  | 'freshness_gate'
  | 'deciding'
  | 'arc_action'
  | 'complete'
  | 'error'

export type ProtocolSnapshot = {
  slug: string
  protocol: string
  network: string
  subgraphId: string
  status: 'ok' | 'stale' | 'unavailable'
  reason?: string
  meta?: { block: { number: number; timestamp: number; hash: string }; deployment: string }
  protocolName?: string
  totalValueLockedUSD?: string
  totalBorrowBalanceUSD?: string
  totalDepositBalanceUSD?: string
}

export type WalletPosition = {
  slug: string
  protocol: string
  network: string
  status: 'ok' | 'stale' | 'unavailable'
  reason?: string
  markets: Array<{
    marketId: string
    name: string
    inputTokenSymbol?: string
    depositedBalanceUSD?: string
    borrowedBalanceUSD?: string
  }>
}

export type LendingSignal = {
  queryTemplate?: string
  maxBlockLag?: number
  fetchedAt?: string
  freshnessDemo?: boolean
  protocols?: ProtocolSnapshot[]
  decision?: {
    verdict: string
    riskScore: number
    reasons: string[]
    recommendation?: {
      preferSlug: string
      preferProtocol: string
      summary: string
      ranking: Array<{
        slug: string
        protocol: string
        tvlUsd: number
        borrowUsd: number
        depositUsd: number
        utilization: number
      }>
    }
  }
  decisionHint?: { actionable: boolean; summary: string }
  hederaAudit?: unknown
}

export type WalletSignal = {
  address?: string
  queryTemplate?: string
  fetchedAt?: string
  freshnessDemo?: boolean
  positions?: WalletPosition[]
  decision?: { verdict: string; riskScore: number; reasons: string[] }
  hederaAudit?: unknown
}

export type ArcResult = {
  status: 'executed' | 'skipped' | 'dry_run'
  reason: string
  txHash?: string
  chainId?: number
  explorerUrl?: string
  balanceUsdc?: string
  gatewayBalanceUsdc?: string
  nanopay?: { amount?: string; settlementTx?: string; data?: unknown }
  policy?: {
    requireGoVerdict: true
    maxSpendUsdc: string
    treasury: string | null
    agentWallet: string | null
    stack?: 'circle-nanopayments' | 'native-fallback'
  }
}

export type RunResult = {
  mode: RunMode
  hederaPayer: string
  stages: PipelineStage[]
  signal: LendingSignal | WalletSignal
  decision: { verdict: string; rationale?: string[] }
  arc: ArcResult
  payment?: {
    responseHeader: string | null
    decoded: unknown
  }
  explorers: { hederaAccount: string; hederaTopic?: string; arcTx?: string }
  timingMs: number
}

export type Catalog = {
  name: string
  description: string
  facilitator: string
  network: string
  asset: string
  registry: Array<{
    slug: string
    protocol: string
    network: string
    subgraphId: string
    schemaVersion: string
  }>
  endpoints: Array<{
    path: string
    method: string
    priceTinybars: string
    sponsors: string[]
  }>
}

export type StageEvent = {
  stage: PipelineStage
  detail?: string
  at: string
}

export type LogEntry = {
  id: string
  at: string
  kind: 'info' | 'pay' | 'graph' | 'arc' | 'error'
  message: string
}
