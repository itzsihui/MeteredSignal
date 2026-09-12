import { motion } from 'framer-motion'
import type { PipelineStage } from '@/lib/types'
import { cn } from '@/lib/utils'

const STEPS: Array<{ id: PipelineStage; label: string; sponsor: string }> = [
  { id: 'connecting', label: 'Discover', sponsor: 'Merchant' },
  { id: 'payment_required', label: '402', sponsor: 'x402' },
  { id: 'sending', label: 'Settle', sponsor: 'Blocky402' },
  { id: 'accepted', label: 'Paid', sponsor: 'Hedera' },
  { id: 'querying_graph', label: 'Graph', sponsor: 'Messari' },
  { id: 'freshness_gate', label: 'Fresh', sponsor: '_meta' },
  { id: 'deciding', label: 'Decide', sponsor: 'Agent' },
  { id: 'arc_action', label: 'USDC', sponsor: 'Arc' },
  { id: 'complete', label: 'Done', sponsor: 'Receipts' },
]

const ORDER = STEPS.map((s) => s.id)

function rank(stage: PipelineStage | null): number {
  if (!stage) return -1
  return ORDER.indexOf(stage)
}

export function PipelineRail({
  active,
  seen,
}: {
  active: PipelineStage | null
  seen: Set<PipelineStage>
}) {
  const activeRank = rank(active)

  return (
    <div className="w-full overflow-x-auto pb-1">
      <ol className="flex min-w-[720px] items-stretch gap-2">
        {STEPS.map((step, i) => {
          const done = seen.has(step.id) || activeRank > i
          const current = active === step.id
          return (
            <li key={step.id} className="relative flex flex-1 flex-col gap-2">
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-[15px] left-[calc(50%+18px)] h-px w-[calc(100%-12px)]',
                    done || current ? 'bg-primary' : 'bg-white/15',
                  )}
                />
              )}
              <motion.div
                animate={current ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                transition={current ? { repeat: Infinity, duration: 1.35 } : undefined}
                className={cn(
                  'relative z-[1] flex h-8 w-8 items-center justify-center self-center rounded-full border text-xs font-semibold',
                  current && 'border-primary bg-primary text-primary-foreground',
                  done && !current && 'border-teal-600 bg-teal-700 text-white',
                  !done && !current && 'border-white/20 bg-background/60 text-muted-foreground',
                )}
              >
                {i + 1}
              </motion.div>
              <div className="text-center">
                <div className="text-[11px] font-semibold tracking-wide">{step.label}</div>
                <div className="text-[10px] text-muted-foreground">{step.sponsor}</div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
