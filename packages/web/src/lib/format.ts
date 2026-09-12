export function formatUsd(value?: string | number, compact = true): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(n)) return '—'
  if (compact) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(n)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatUsdNumber(value?: string | number): number {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function shortAddr(addr?: string, size = 4): string {
  if (!addr) return '—'
  if (addr.length < 12) return addr
  return `${addr.slice(0, 2 + size)}…${addr.slice(-size)}`
}

export function tinybarsToHbar(tinybars: string | number): string {
  const n = Number(tinybars)
  if (!Number.isFinite(n)) return '—'
  return `${(n / 1e8).toFixed(4)} HBAR`
}

export function protocolLabel(slug: string): string {
  return slug
    .replace(/-v3/g, ' v3')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
