import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatUsd, formatUsdNumber, protocolLabel } from '@/lib/format'
import type { ProtocolSnapshot, WalletPosition } from '@/lib/types'

const tipStyle = {
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.12)',
  background: '#0b1220',
  fontSize: 12,
  color: '#e2e8f0',
}

export function LendingCharts({ protocols }: { protocols: ProtocolSnapshot[] }) {
  const data = protocols
    .filter((p) => p.status === 'ok')
    .map((p) => ({
      name: protocolLabel(p.slug).replace(' Ethereum', '').replace(' Base', '·Base'),
      TVL: formatUsdNumber(p.totalValueLockedUSD),
      Deposits: formatUsdNumber(p.totalDepositBalanceUSD),
      Borrows: formatUsdNumber(p.totalBorrowBalanceUSD),
    }))

  if (!data.length) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-muted-foreground">
        Run lending compare to chart live Messari TVL / borrow / deposit.
      </div>
    )
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => formatUsd(v)}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip formatter={(value) => formatUsd(Number(value), false)} contentStyle={tipStyle} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Bar dataKey="TVL" fill="#14b8a6" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Deposits" fill="#38bdf8" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Borrows" fill="#fb923c" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function WalletExposureChart({ positions }: { positions: WalletPosition[] }) {
  const rows = positions
    .filter((p) => p.status === 'ok')
    .flatMap((p) =>
      p.markets.map((m) => ({
        name: `${m.inputTokenSymbol ?? m.name.slice(0, 10)} · ${protocolLabel(p.slug).split(' ')[0]}`,
        Deposit: formatUsdNumber(m.depositedBalanceUSD),
        Borrow: formatUsdNumber(m.borrowedBalanceUSD),
      })),
    )
    .slice(0, 8)

  if (!rows.length) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-muted-foreground">
        No indexed borrow/lend markets for this wallet across fresh protocols.
      </div>
    )
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={false} />
          <XAxis type="number" tickFormatter={(v) => formatUsd(v)} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <Tooltip formatter={(value) => formatUsd(Number(value), false)} contentStyle={tipStyle} />
          <Legend />
          <Bar dataKey="Deposit" fill="#38bdf8" radius={[0, 6, 6, 0]} />
          <Bar dataKey="Borrow" fill="#fb923c" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
