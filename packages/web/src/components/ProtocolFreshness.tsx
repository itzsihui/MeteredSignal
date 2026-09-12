import type { ProtocolSnapshot } from '@/lib/types'
import { formatUsd, protocolLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

export function ProtocolFreshness({ protocols }: { protocols: ProtocolSnapshot[] }) {
  if (!protocols.length) return null

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {protocols.map((p) => {
        const ageSec =
          p.meta?.block?.timestamp != null
            ? Math.max(0, Math.floor(Date.now() / 1000) - Number(p.meta.block.timestamp))
            : null
        return (
          <div
            key={p.slug}
            className="rounded-xl border border-white/15 bg-white/[0.03] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {protocolLabel(p.slug)}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {p.network} · {p.subgraphId.slice(0, 10)}…
                </div>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase',
                  p.status === 'ok' && 'border border-[#9ec0ff]/35 bg-[#9ec0ff]/15 text-[#c9daff]',
                  p.status === 'stale' && 'border border-amber-400/35 bg-amber-500/15 text-amber-200',
                  p.status === 'unavailable' && 'border border-rose-400/35 bg-rose-500/15 text-rose-200',
                )}
              >
                {p.status}
              </span>
            </div>
            {p.status === 'ok' ? (
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">TVL</dt>
                  <dd className="text-sm font-semibold">{formatUsd(p.totalValueLockedUSD)}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Deposit</dt>
                  <dd className="text-sm font-semibold">{formatUsd(p.totalDepositBalanceUSD)}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">Borrow</dt>
                  <dd className="text-sm font-semibold">{formatUsd(p.totalBorrowBalanceUSD)}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{p.reason ?? 'No data'}</p>
            )}
            {ageSec != null && (
              <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                block {p.meta?.block.number?.toLocaleString()} · age {ageSec}s
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
