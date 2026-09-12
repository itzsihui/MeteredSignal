import type { LogEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

export function EventLog({ entries }: { entries: LogEntry[] }) {
  return (
    <div className="flex h-[22rem] flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="font-mono text-[11px] tracking-wide text-[#9ec0ff]">backend.process</span>
        <span className="font-mono text-[10px] text-white/40">{entries.length} events</span>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
        {entries.length === 0 && (
          <p className="text-white/40">Waiting for agent run — SSE stages stream here live.</p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="flex gap-2">
            <span className="shrink-0 text-white/35">{e.at.slice(11, 19)}</span>
            <span
              className={cn(
                'shrink-0 uppercase',
                e.kind === 'pay' && 'text-violet-300',
                e.kind === 'graph' && 'text-sky-300',
                e.kind === 'arc' && 'text-orange-300',
                e.kind === 'error' && 'text-rose-300',
                e.kind === 'info' && 'text-[#c9daff]',
              )}
            >
              {e.kind}
            </span>
            <span className="text-white/85">{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
