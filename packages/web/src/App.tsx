import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Cable,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Radio,
  Shield,
  Sparkles,
  Wallet,
} from 'lucide-react'
import Aurora from '@/components/Aurora'
import { LendingCharts, WalletExposureChart } from '@/components/Charts'
import { EventLog } from '@/components/EventLog'
import { PipelineRail } from '@/components/PipelineRail'
import { Spotlight } from '@/components/ui/spotlight'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchCatalog, fetchHealth, runAgentStream } from '@/lib/api'
import { formatUsd, protocolLabel, tinybarsToHbar } from '@/lib/format'
import type {
  Catalog,
  LendingSignal,
  LogEntry,
  PipelineStage,
  RunMode,
  RunResult,
  WalletSignal,
} from '@/lib/types'
import { cn } from '@/lib/utils'

/** Presets for the video: clean GO vs live Messari high-borrow → NO_GO refuse spend. */
const DEMO_WALLETS = [
  {
    label: 'NO_GO · high borrow',
    address: '0x6142eb927529974c5cded66dafc57cb5aaaf73ab',
    hint: 'Live Aave v3 borrower — expect NO_GO + Arc skipped',
  },
  {
    label: 'GO · empty',
    address: '0x0000000000000000000000000000000000000000',
    hint: 'No indexed positions — clean scan / GO',
  },
  {
    label: 'Vitalik',
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    hint: 'Usually empty on these Messari deployments',
  },
]

function verdictTone(v?: string) {
  if (v === 'GO') return 'bg-[#9ec0ff]/15 text-[#c9daff] border-[#9ec0ff]/35'
  if (v === 'NO_GO') return 'bg-rose-500/15 text-rose-300 border-rose-500/30'
  return 'bg-amber-500/15 text-amber-200 border-amber-500/30'
}

function stageKind(stage: PipelineStage): LogEntry['kind'] {
  if (stage === 'error' || stage === 'payment_rejected') return 'error'
  if (
    stage === 'connecting' ||
    stage === 'payment_required' ||
    stage === 'sending' ||
    stage === 'accepted'
  )
    return 'pay'
  if (stage === 'querying_graph' || stage === 'freshness_gate') return 'graph'
  if (stage === 'arc_action') return 'arc'
  return 'info'
}

function stageMessage(stage: PipelineStage, detail?: string): string {
  const map: Partial<Record<PipelineStage, string>> = {
    connecting: 'Agent → paywalled merchant route',
    payment_required: 'HTTP 402 — Hedera x402 required',
    sending: 'Signing + settling HBAR via Blocky402',
    accepted: 'Payment accepted',
    querying_graph: 'Messari standardized subgraphs queried',
    freshness_gate: '_meta.block freshness gate',
    deciding: 'Forming GO / NO_GO / UNAVAILABLE',
    arc_action: 'Arc USDC policy evaluation',
    complete: 'Pipeline complete',
    error: 'Pipeline error',
  }
  const base = map[stage] ?? stage
  return detail ? `${base} — ${detail}` : base
}

export default function App() {
  const [mode, setMode] = useState<RunMode>('lending-compare')
  const [address, setAddress] = useState(DEMO_WALLETS[0].address)
  const [forceStale, setForceStale] = useState(false)
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState<{ hederaAgent?: string; merchant?: { status?: string } } | null>(
    null,
  )
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [activeStage, setActiveStage] = useState<PipelineStage | null>(null)
  const [seen, setSeen] = useState<Set<PipelineStage>>(() => new Set())
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const logId = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    document.documentElement.classList.add('dark')
    void (async () => {
      try {
        const [h, c] = await Promise.all([fetchHealth(), fetchCatalog()])
        setHealth(h)
        setCatalog(c)
      } catch {
        setHealth(null)
      }
    })()
  }, [])

  const pushLog = (kind: LogEntry['kind'], message: string) => {
    logId.current += 1
    setLogs((prev) => [
      ...prev,
      { id: String(logId.current), at: new Date().toISOString(), kind, message },
    ])
  }

  const lending = result?.signal as LendingSignal | undefined
  const wallet = result?.signal as WalletSignal | undefined
  const protocols = lending?.protocols ?? []
  const positions = wallet?.positions ?? []

  const priceHint = useMemo(() => {
    const ep = catalog?.endpoints.find((e) =>
      mode === 'wallet-risk' ? e.path.includes('wallet-risk') : e.path.includes('lending-compare'),
    )
    return ep ? tinybarsToHbar(ep.priceTinybars) : null
  }, [catalog, mode])

  async function run() {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setResult(null)
    setError(null)
    setActiveStage(null)
    setSeen(new Set())
    setLogs([])
    pushLog('info', `Starting ${mode}`)

    try {
      const data = await runAgentStream({
        mode,
        address,
        forceStale,
        signal: ac.signal,
        onHello: (h) => pushLog('info', `SSE · payer ${h.hederaPayer}`),
        onStage: ({ stage, detail }) => {
          setActiveStage(stage)
          setSeen((prev) => new Set(prev).add(stage))
          pushLog(stageKind(stage), stageMessage(stage, detail))
        },
      })
      setResult(data)
      pushLog('info', `Done in ${data.timingMs}ms · ${data.decision.verdict}`)
      if (data.signal && 'freshnessDemo' in data.signal && data.signal.freshnessDemo) {
        pushLog('graph', 'Demo tip lag active — freshness gate rejected live _meta blocks')
      }
      if (data.arc?.status === 'skipped' && data.decision.verdict !== 'GO') {
        pushLog(
          'arc',
          `Refuse spend — ${data.decision.verdict} (policy: require GO · cap ${data.arc.policy?.maxSpendUsdc ?? '?'} USDC)`,
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if ((err as { name?: string }).name !== 'AbortError') {
        setError(msg)
        pushLog('error', msg)
        setActiveStage('error')
        setSeen((prev) => new Set(prev).add('error'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <Aurora colorStops={['#1a1a1a', '#9ec0ff', '#050505']} amplitude={0.55} blend={0.65} />
      </div>
      <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" fill="#9ec0ff" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row md:px-6 md:py-8">
        <aside className="flex w-full shrink-0 flex-col gap-4 md:w-64">
          <Card className="border-white/15 bg-black/55 backdrop-blur-xl">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <Radio className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base tracking-tight">MeteredSignal</CardTitle>
                  <CardDescription className="text-xs">Agent console</CardDescription>
                </div>
              </div>
              <a
                href="/"
                className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-[10px] font-medium tracking-[0.16em] uppercase text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              >
                ← Landing
              </a>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2">
                <span className="text-muted-foreground">Network</span>
                <Badge variant="secondary">Hedera testnet</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2">
                <span className="text-muted-foreground">Merchant</span>
                <Badge variant="outline">{health?.merchant?.status === 'ok' ? 'online' : '…'}</Badge>
              </div>
              <div className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2">
                <div className="mb-1 text-xs text-muted-foreground">Payer</div>
                <div className="break-all font-mono text-xs">{health?.hederaAgent ?? '…'}</div>
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Sponsors
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">The Graph</Badge>
                  <Badge variant="secondary">Hedera</Badge>
                  <Badge variant="secondary">Arc</Badge>
                </div>
              </div>
              {catalog && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                    Registry
                  </p>
                  {catalog.registry.map((r) => (
                    <div key={r.slug} className="font-mono text-[10px] text-muted-foreground">
                      {protocolLabel(r.slug)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/15 bg-black/55 backdrop-blur-xl">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield className="size-4 text-primary" />
                Payment path
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>1. Agent hits x402 gate</p>
              <p>2. Settles HBAR via Blocky402</p>
              <p>3. Reads Messari standardized subgraphs</p>
              <p>4. Spends USDC on Arc if GO</p>
              {priceHint && (
                <p className="pt-2 font-mono text-primary">metered ≈ {priceHint}</p>
              )}
            </CardContent>
          </Card>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <Card className="relative overflow-hidden border-white/15 bg-black/55 backdrop-blur-xl">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-2xl tracking-tight">
                    <Sparkles className="size-5 text-primary" />
                    Paid intelligence run
                  </CardTitle>
                  <CardDescription className="mt-1 max-w-xl">
                    Buy live multi-protocol lending signal with Hedera x402, then act on Arc. Backend
                    stages stream live over SSE.
                  </CardDescription>
                </div>
                <Badge className="border border-primary/30 bg-primary/10 text-primary">
                  ETHOnline demo
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={mode} onValueChange={(v) => setMode(v as RunMode)} className="w-full">
                <TabsList className="mb-4 grid w-full max-w-md grid-cols-2">
                  <TabsTrigger value="lending-compare">Lending compare</TabsTrigger>
                  <TabsTrigger value="wallet-risk">Wallet risk</TabsTrigger>
                </TabsList>
                <TabsContent value="lending-compare" className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    One Messari query template across Aave / Compound / Spark — freshness gated.
                  </p>
                </TabsContent>
                <TabsContent value="wallet-risk" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Pay for a Messari wallet scan, then Arc spends USDC only on GO.
                  </p>
                  <div className="grid gap-2">
                    <Label htmlFor="address">Wallet address</Label>
                    <Input
                      id="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="font-mono"
                      placeholder="0x…"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {DEMO_WALLETS.map((w) => (
                      <Button
                        key={w.address}
                        type="button"
                        size="sm"
                        variant={address.toLowerCase() === w.address.toLowerCase() ? 'default' : 'outline'}
                        title={w.hint}
                        onClick={() => setAddress(w.address)}
                      >
                        {w.label}
                      </Button>
                    ))}
                  </div>
                  {DEMO_WALLETS.find((w) => w.address.toLowerCase() === address.toLowerCase())?.hint && (
                    <p className="text-xs text-muted-foreground">
                      {DEMO_WALLETS.find((w) => w.address.toLowerCase() === address.toLowerCase())?.hint}
                    </p>
                  )}
                </TabsContent>
              </Tabs>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={() => void run()} disabled={loading} size="lg" className="min-w-44">
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Streaming…
                    </>
                  ) : (
                    <>
                      <Cable />
                      Pay x402 + run
                    </>
                  )}
                </Button>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  <input
                    type="checkbox"
                    className="accent-amber-400"
                    checked={forceStale}
                    onChange={(e) => setForceStale(e.target.checked)}
                  />
                  Simulate indexer lag
                </label>
                {result?.timingMs != null && (
                  <span className="font-mono text-xs text-muted-foreground">{result.timingMs} ms</span>
                )}
              </div>
              {forceStale && (
                <p className="mt-2 text-xs text-amber-200/80">
                  Injects tip ahead of live <span className="font-mono">_meta.block</span> so the
                  freshness gate rejects → UNAVAILABLE → Arc refuses spend (video beat).
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/15 bg-black/55 backdrop-blur-xl">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="size-4" />
                Live backend path
              </CardTitle>
              <CardDescription>Visible hops: x402 → Graph → freshness → Arc</CardDescription>
            </CardHeader>
            <CardContent>
              <PipelineRail active={activeStage} seen={seen} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-white/15 bg-black/55 backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {(result?.mode ?? mode) === 'wallet-risk'
                    ? 'Wallet exposure'
                    : 'Messari protocol liquidity'}
                </CardTitle>
                <CardDescription>Live Graph data — Aave / Compound / Spark</CardDescription>
              </CardHeader>
              <CardContent>
                {(result?.mode ?? mode) === 'wallet-risk' ? (
                  <WalletExposureChart positions={positions} />
                ) : (
                  <LendingCharts protocols={protocols} />
                )}
              </CardContent>
            </Card>

            <EventLog entries={logs} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-white/15 bg-black/55 backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Decision</CardTitle>
                <CardDescription>
                  Agent reasons on Graph evidence — not a raw dump
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className={cn(
                      'inline-flex rounded-md border px-3 py-1.5 text-lg font-semibold',
                      verdictTone(result?.decision?.verdict),
                    )}
                  >
                    {result?.decision?.verdict ?? '—'}
                  </div>
                  {((result?.mode ?? mode) === 'wallet-risk'
                    ? wallet?.decision?.riskScore
                    : lending?.decision?.riskScore) != null && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      risk{' '}
                      {(result?.mode ?? mode) === 'wallet-risk'
                        ? wallet?.decision?.riskScore
                        : lending?.decision?.riskScore}
                    </Badge>
                  )}
                  {(lending?.freshnessDemo || wallet?.freshnessDemo) && (
                    <Badge className="border border-amber-500/40 bg-amber-500/15 text-amber-100">
                      tip-lag demo
                    </Badge>
                  )}
                </div>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {(result?.decision?.rationale ?? ['Run the agent to produce a live verdict.']).map(
                    (r) => (
                      <li key={r}>• {r}</li>
                    ),
                  )}
                </ul>
                {(result?.mode ?? mode) === 'lending-compare' &&
                  lending?.decision?.recommendation?.ranking &&
                  lending.decision.recommendation.ranking.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-white/15 pt-3">
                      <p className="text-[11px] font-medium text-foreground/80">Protocol ranking</p>
                      {lending.decision.recommendation.ranking.slice(0, 4).map((row, i) => (
                        <div
                          key={row.slug}
                          className="flex items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground"
                        >
                          <span>
                            #{i + 1} {row.slug}
                          </span>
                          <span>
                            TVL {formatUsd(String(row.tvlUsd))} · util{' '}
                            {(row.utilization * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
              </CardContent>
            </Card>

            <Card
              className={cn(
                'border-white/15 bg-black/55 backdrop-blur-xl lg:col-span-2',
                result?.arc?.status === 'skipped' &&
                  result.decision.verdict !== 'GO' &&
                  'border-rose-500/35',
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Wallet className="size-4" />
                  Arc action + receipts
                </CardTitle>
                <CardDescription>
                  {result?.arc?.reason ?? 'Waiting for a GO verdict to spend USDC on Arc.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    result?.arc?.status === 'skipped' &&
                      result.decision.verdict !== 'GO' &&
                      'border border-rose-500/40 bg-rose-500/15 text-rose-200',
                    result?.arc?.status === 'executed' &&
                      'border border-[#9ec0ff]/40 bg-[#9ec0ff]/15 text-[#c9daff]',
                  )}
                >
                  {result?.arc?.status === 'skipped' && result.decision.verdict !== 'GO'
                    ? 'refused spend'
                    : (result?.arc?.status ?? 'idle')}
                </Badge>
                {result?.arc?.policy?.requireGoVerdict && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    policy: GO-only
                  </Badge>
                )}
                {result?.arc?.policy && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    cap {result.arc.policy.maxSpendUsdc} USDC
                  </Badge>
                )}
                {result?.arc?.policy?.stack && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {result.arc.policy.stack === 'circle-nanopayments'
                      ? 'Circle nanopayments'
                      : 'native fallback'}
                  </Badge>
                )}
                {result?.arc?.nanopay?.amount && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    paid {result.arc.nanopay.amount} USDC
                  </Badge>
                )}
                {result?.arc?.gatewayBalanceUsdc && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    gateway {result.arc.gatewayBalanceUsdc}
                  </Badge>
                )}
                {(result?.arc?.explorerUrl || result?.explorers?.arcTx) && (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={result.arc?.explorerUrl || result.explorers?.arcTx}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ArcScan
                      <ArrowUpRight />
                    </a>
                  </Button>
                )}
                {result?.explorers?.hederaAccount ? (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={result.explorers.hederaAccount} target="_blank" rel="noreferrer">
                      HashScan
                      <ArrowUpRight />
                    </a>
                  </Button>
                ) : null}
                {result?.explorers?.hederaTopic ? (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={result.explorers.hederaTopic} target="_blank" rel="noreferrer">
                      HCS topic
                      <ArrowUpRight />
                    </a>
                  </Button>
                ) : null}
              </CardContent>
              {result?.payment?.decoded != null && (
                <CardFooter>
                  <pre className="max-h-28 w-full overflow-auto rounded-lg border border-white/15 bg-black/30 p-2 font-mono text-[10px] text-muted-foreground">
                    {JSON.stringify(result.payment.decoded, null, 2)}
                  </pre>
                </CardFooter>
              )}
            </Card>
          </div>

          <Card className="border-white/15 bg-black/55 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-sm">Standardized subgraph sources</CardTitle>
              <CardDescription>Messari lending schema — freshness after paid Graph query</CardDescription>
            </CardHeader>
            <CardContent>
              {protocols.length === 0 && positions.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-white/15 px-4 py-8 text-sm text-muted-foreground">
                  <CircleAlert className="size-4" />
                  Run lending-compare or wallet-risk to populate live protocol rows.
                </div>
              ) : protocols.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {protocols.map((p) => (
                    <div
                      key={p.slug}
                      className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-3"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{p.slug}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            p.status === 'ok' && 'border-[#9ec0ff]/40 text-[#c9daff]',
                            p.status !== 'ok' && 'border-amber-500/40 text-amber-200',
                          )}
                        >
                          {p.status === 'ok' ? <CheckCircle2 className="size-3" /> : null}
                          {p.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.totalValueLockedUSD
                          ? `TVL ${formatUsd(p.totalValueLockedUSD)} · dep ${formatUsd(p.totalDepositBalanceUSD)} · bor ${formatUsd(p.totalBorrowBalanceUSD)}`
                          : p.reason || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {positions.map((p) => (
                    <div
                      key={p.slug}
                      className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-3"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{p.slug}</span>
                        <Badge variant="outline">{p.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.markets.length} market(s) · {p.reason ?? 'fresh'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <Card className="border-white/15 bg-black/55 backdrop-blur-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Raw agent payload</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64 rounded-lg border border-white/15 bg-black/30 p-3">
                <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {result ? JSON.stringify(result, null, 2) : 'Awaiting run…'}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
