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
            className="rounded-xl border border-[color:var(--line)] bg-white/70 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[color:var(--ink)]">
                  {protocolLabel(p.slug)}
                </div>
                <div className="font-mono text-[10px] text-[color:var(--ink-soft)]">
                  {p.network} · {p.subgraphId.slice(0, 10)}…
                </div>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  p.status === 'ok' && 'bg-emerald-100 text-emerald-800',
                  p.status === 'stale' && 'bg-amber-100 text-amber-800',
                  p.status === 'unavailable' && 'bg-rose-100 text-rose-800',
                )}
              >
                {p.status}
              </span>
            </div>
            {p.status === 'ok' ? (
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-[color:var(--ink-soft)]">TVL</dt>
                  <dd className="text-sm font-semibold">{formatUsd(p.totalValueLockedUSD)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-[color:var(--ink-soft)]">Deposit</dt>
                  <dd className="text-sm font-semibold">{formatUsd(p.totalDepositBalanceUSD)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-[color:var(--ink-soft)]">Borrow</dt>
                  <dd className="text-sm font-semibold">{formatUsd(p.totalBorrowBalanceUSD)}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-xs text-[color:var(--ink-soft)]">{p.reason ?? 'No data'}</p>
            )}
            {ageSec != null && (
              <p className="mt-2 font-mono text-[10px] text-[color:var(--ink-soft)]">
                block {p.meta?.block.number?.toLocaleString()} · age {ageSec}s
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
