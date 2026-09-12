import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import express, { type Express } from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { initX402, type PaymentStage } from './x402-client.js';
import { maybeExecuteArcUsdc } from './arc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function resolveMerchantUrl(): string {
  if (process.env.MERCHANT_URL?.trim()) return process.env.MERCHANT_URL.trim().replace(/\/$/, '');
  // Stable production alias when available (avoids ephemeral *.vercel.app self-fetch HTML)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, '')}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}`;
  return 'http://localhost:4021';
}

type RunBody = {
  mode?: 'lending-compare' | 'wallet-risk';
  address?: string;
  slugs?: string[];
  forceStale?: boolean;
};

type PipelineStage =
  | PaymentStage
  | 'querying_graph'
  | 'freshness_gate'
  | 'deciding'
  | 'arc_action'
  | 'complete'
  | 'error';

type RunResult = {
  mode: string;
  hederaPayer: string;
  stages: PipelineStage[];
  signal: unknown;
  decision: { verdict: string; rationale?: string[] };
  arc: Awaited<ReturnType<typeof maybeExecuteArcUsdc>>;
  payment: { responseHeader: string | null; decoded: unknown };
  explorers: { hederaAccount: string; hederaTopic?: string; arcTx?: string };
  timingMs: number;
};

function decodePaymentResponse(header: string | null): unknown {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    try {
      return JSON.parse(header);
    } catch {
      return { raw: header.slice(0, 200) };
    }
  }
}

function topicExplorerFromAudit(audit: unknown): string | undefined {
  if (typeof audit !== 'string') return undefined;
  const topicId = audit.split('@')[0];
  if (!/^0\.0\.\d+$/.test(topicId)) return undefined;
  return `https://hashscan.io/testnet/topic/${topicId}`;
}

let x402:
  | ReturnType<typeof initX402>
  | { error: string }
  | null = null;

function getX402() {
  if (x402) return x402;
  try {
    x402 = initX402();
  } catch (err) {
    x402 = { error: err instanceof Error ? err.message : String(err) };
  }
  return x402;
}

export function createAgentApp(opts?: { merchantUrl?: string; serveStatic?: boolean }): Express {
  const MERCHANT_URL = opts?.merchantUrl ?? resolveMerchantUrl();
  const serveStatic = opts?.serveStatic !== false;
  const app = express();
  app.use(cors());
  app.use(express.json());

  function buildMerchantUrl(body: RunBody): { url: string; mode: 'lending-compare' | 'wallet-risk' } | { error: string } {
    const mode = body.mode ?? 'lending-compare';
    const qs = new URLSearchParams();
    if (body.slugs?.length) qs.set('slugs', body.slugs.join(','));
    if (body.forceStale) qs.set('forceStale', '1');

    if (mode === 'wallet-risk') {
      if (!body.address || !/^0x[a-fA-F0-9]{40}$/.test(body.address)) {
        return { error: 'address required for wallet-risk' };
      }
      qs.set('address', body.address);
      return { url: `${MERCHANT_URL}/v1/testnet/hbar/wallet-risk?${qs}`, mode };
    }
    const q = qs.toString();
    return {
      url: `${MERCHANT_URL}/v1/testnet/hbar/lending-compare${q ? `?${q}` : ''}`,
      mode,
    };
  }

  async function executeRun(
    body: RunBody,
    onStage: (stage: PipelineStage, detail?: string) => void,
  ): Promise<RunResult> {
    const started = Date.now();
    const stages: PipelineStage[] = [];
    const track = (stage: PipelineStage, detail?: string) => {
      stages.push(stage);
      onStage(stage, detail);
    };

    const x = getX402();
    if ('error' in x) {
      throw Object.assign(new Error(x.error), { status: 503 });
    }
    const { createFetchForRequest, accountId } = x;

    const built = buildMerchantUrl(body);
    if ('error' in built) {
      throw Object.assign(new Error(built.error), { status: 400 });
    }
    const { url, mode } = built;

    const paidFetch = createFetchForRequest((stage) => {
      track(stage, stage === 'payment_required' ? 'HTTP 402 — signing Hedera x402' : undefined);
    });

    const response = await paidFetch(url, { method: 'GET' });
    const paymentResponseHeader =
      response.headers.get('PAYMENT-RESPONSE') ||
      response.headers.get('X-PAYMENT-RESPONSE') ||
      null;
    const text = await response.text();
    let signal: unknown;
    try {
      signal = JSON.parse(text);
    } catch {
      signal = { raw: text };
    }

    if (!response.ok) {
      track('error', `Merchant HTTP ${response.status}`);
      throw Object.assign(new Error(`Merchant request failed (${response.status})`), {
        status: response.status,
        stages,
        error: signal,
        paymentResponse: paymentResponseHeader,
      });
    }

    track('querying_graph', 'Messari standardized subgraphs returned');

    const lending = signal as {
      freshnessDemo?: boolean;
      decision?: {
        verdict?: 'GO' | 'NO_GO' | 'UNAVAILABLE';
        reasons?: string[];
        recommendation?: { summary?: string };
      };
      decisionHint?: { actionable?: boolean; summary?: string };
      protocols?: Array<{ status?: string; reason?: string }>;
    };
    const wallet = signal as {
      freshnessDemo?: boolean;
      decision?: { verdict?: 'GO' | 'NO_GO' | 'UNAVAILABLE'; reasons?: string[] };
      positions?: Array<{ status?: string; reason?: string }>;
    };

    const staleRows =
      mode === 'wallet-risk'
        ? (wallet.positions ?? []).filter((p) => p.status && p.status !== 'ok')
        : (lending.protocols ?? []).filter((p) => p.status && p.status !== 'ok');
    const freshDetail =
      staleRows.length > 0
        ? `Freshness reject: ${staleRows
            .slice(0, 2)
            .map((p) => p.reason ?? p.status)
            .join('; ')}${(lending.freshnessDemo || wallet.freshnessDemo) ? ' (demo tip lag)' : ''}`
        : 'Evaluating _meta block freshness';
    track('freshness_gate', freshDetail);

    const verdict =
      mode === 'wallet-risk'
        ? (wallet.decision?.verdict ?? 'UNAVAILABLE')
        : (lending.decision?.verdict ??
          (lending.decisionHint?.actionable ? 'GO' : 'UNAVAILABLE'));

    track('deciding', `Verdict ${verdict}`);
    track('arc_action', 'Arc USDC policy check');

    let arc: Awaited<ReturnType<typeof maybeExecuteArcUsdc>>;
    try {
      arc = await maybeExecuteArcUsdc({ verdict });
    } catch (arcErr) {
      arc = {
        status: 'skipped' as const,
        reason: `Arc action failed: ${arcErr instanceof Error ? arcErr.message : String(arcErr)}`,
        policy: {
          requireGoVerdict: true,
          maxSpendUsdc: process.env.ARC_SPEND_AMOUNT_USDC ?? '0.01',
          treasury: process.env.ARC_TREASURY_ADDRESS?.trim() || null,
          agentWallet: null,
          stack: 'circle-nanopayments',
        },
      };
    }

    const hederaAudit = (signal as { hederaAudit?: unknown }).hederaAudit;
    track('complete', hederaAudit ? `HCS audit ${hederaAudit}` : 'Pipeline finished');

    const rationale =
      mode === 'wallet-risk'
        ? wallet.decision?.reasons
        : lending.decision?.reasons ??
          [lending.decision?.recommendation?.summary, lending.decisionHint?.summary].filter(Boolean);

    return {
      mode,
      hederaPayer: accountId,
      stages,
      signal,
      decision: {
        verdict,
        rationale: (rationale ?? []).filter(Boolean) as string[],
      },
      arc,
      payment: {
        responseHeader: paymentResponseHeader,
        decoded: decodePaymentResponse(paymentResponseHeader),
      },
      explorers: {
        hederaAccount: `https://hashscan.io/testnet/account/${accountId}`,
        hederaTopic: topicExplorerFromAudit(hederaAudit),
        arcTx: arc.explorerUrl,
      },
      timingMs: Date.now() - started,
    };
  }

  app.get('/api/health', async (_req, res) => {
    const x = getX402();
    let merchant: unknown = null;
    try {
      const r = await fetch(`${MERCHANT_URL}/health`);
      merchant = await r.json();
    } catch (err) {
      merchant = { status: 'down', error: String(err) };
    }
    res.json({
      status: 'ok',
      hederaAgent: 'error' in x ? null : x.accountId,
      hederaError: 'error' in x ? x.error : undefined,
      merchantUrl: MERCHANT_URL,
      merchant,
      vercel: Boolean(process.env.VERCEL),
    });
  });

  app.get('/api/catalog', async (_req, res) => {
    try {
      const r = await fetch(`${MERCHANT_URL}/v1/catalog`);
      res.status(r.status).json(await r.json());
    } catch (err) {
      res.status(502).json({ error: String(err) });
    }
  });

  app.post('/api/run', async (req, res) => {
    const body = req.body as RunBody;
    try {
      const result = await executeRun(body, () => {});
      res.json(result);
    } catch (err) {
      console.error(err);
      const e = err as {
        status?: number;
        stages?: PipelineStage[];
        error?: unknown;
        paymentResponse?: string | null;
        message?: string;
      };
      res.status(e.status ?? 500).json({
        stages: e.stages ?? [],
        error: e.error ?? e.message ?? String(err),
        paymentResponse: e.paymentResponse ?? null,
      });
    }
  });

  app.post('/api/run/stream', async (req, res) => {
    const body = req.body as RunBody;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const x = getX402();
    send('hello', {
      merchant: MERCHANT_URL,
      hederaPayer: 'error' in x ? null : x.accountId,
    });

    try {
      const result = await executeRun(body, (stage, detail) => {
        send('stage', { stage, detail, at: new Date().toISOString() });
      });
      send('result', result);
    } catch (err) {
      console.error(err);
      const e = err as {
        status?: number;
        stages?: PipelineStage[];
        error?: unknown;
        paymentResponse?: string | null;
        message?: string;
      };
      send('error', {
        status: e.status ?? 500,
        stages: e.stages ?? [],
        error: e.error ?? e.message ?? String(err),
        paymentResponse: e.paymentResponse ?? null,
      });
    } finally {
      res.end();
    }
  });

  if (serveStatic) {
    const landingDir = resolve(__dirname, '../../../landing');
    const landingIndex = resolve(landingDir, 'index.html');
    const landingAssets = resolve(landingDir, 'assets');
    const webDist = resolve(__dirname, '../../web/dist');
    const legacyPublic = resolve(__dirname, '../public');

    if (existsSync(landingIndex)) {
      app.get(['/', '/landing', '/landing/'], (_req, res) => {
        res.sendFile(landingIndex);
      });
    }
    if (existsSync(landingAssets)) {
      app.use('/landing/assets', express.static(landingAssets));
    }

    if (existsSync(webDist)) {
      app.use('/demo', express.static(webDist));
      app.get(['/demo', '/demo/'], (_req, res) => {
        res.sendFile(resolve(webDist, 'index.html'));
      });
      app.use(express.static(webDist));
    } else if (existsSync(legacyPublic)) {
      app.use('/demo', express.static(legacyPublic));
      app.get(['/demo', '/demo/'], (_req, res) => {
        res.sendFile(resolve(legacyPublic, 'index.html'));
      });
      app.use(express.static(legacyPublic));
    }
  }

  return app;
}
