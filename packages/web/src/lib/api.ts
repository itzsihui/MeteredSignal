import type { Catalog, RunMode, RunResult, StageEvent } from './types'

export async function fetchCatalog(): Promise<Catalog> {
  const res = await fetch('/api/catalog')
  if (!res.ok) throw new Error(`Catalog failed (${res.status})`)
  return res.json() as Promise<Catalog>
}

export async function fetchHealth(): Promise<{
  status: string
  hederaAgent?: string
  merchantUrl?: string
  merchant?: { status?: string }
}> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error(`Health failed (${res.status})`)
  return res.json()
}

export async function runAgentStream(opts: {
  mode: RunMode
  address?: string
  slugs?: string[]
  forceStale?: boolean
  onStage: (event: StageEvent) => void
  onHello?: (data: { merchant: string; hederaPayer: string }) => void
  signal?: AbortSignal
}): Promise<RunResult> {
  const res = await fetch('/api/run/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      mode: opts.mode,
      address: opts.address,
      slugs: opts.slugs,
      forceStale: opts.forceStale,
    }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`Stream failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: RunResult | null = null
  let streamError: unknown = null

  const consumeBlock = (block: string) => {
    const lines = block.split('\n')
    let event = 'message'
    const dataLines: string[] = []
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (!dataLines.length) return
    const raw = dataLines.join('\n')
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return
    }
    if (event === 'hello' && opts.onHello) {
      opts.onHello(data as { merchant: string; hederaPayer: string })
    }
    if (event === 'stage') opts.onStage(data as StageEvent)
    if (event === 'result') result = data as RunResult
    if (event === 'error') streamError = data
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      if (part.trim()) consumeBlock(part)
    }
  }
  if (buffer.trim()) consumeBlock(buffer)

  if (streamError) {
    const err = streamError as { error?: unknown; message?: string }
    throw new Error(
      typeof err.error === 'string'
        ? err.error
        : err.message ?? JSON.stringify(err.error ?? streamError),
    )
  }
  if (!result) throw new Error('Stream ended without result')
  return result
}
