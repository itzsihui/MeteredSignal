import { config } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import express, { type Request, type Response } from 'express';
import { paymentMiddleware } from '@x402/express';
import { assessWalletRisk, compareLendingProtocols, LENDING_REGISTRY } from '@meteredsignal/graph';
import { createResourceServer } from './x402.js';
import { appendAudit } from './hcs.js';
import { attachArcPaymentMeta, createArcGatewaySeller, usdcPriceTag } from './arc-gateway.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

const PORT = parseInt(process.env.MERCHANT_PORT ?? '4021', 10);
const SERVICE_ACCOUNT = process.env.HEDERA_SERVICE_ACCOUNT_ID ?? '';
const GRAPH_API_KEY = process.env.GRAPH_API_KEY ?? '';
const MAX_LAG = parseInt(process.env.GRAPH_MAX_BLOCK_LAG ?? '50', 10);
const ARC_SPEND = process.env.ARC_SPEND_AMOUNT_USDC ?? '0.01';
const ARC_PRICE = usdcPriceTag(ARC_SPEND);

if (!SERVICE_ACCOUNT) {
  console.error('✗ HEDERA_SERVICE_ACCOUNT_ID is required in .env');
  process.exit(1);
}
if (!GRAPH_API_KEY) {
  console.error('✗ GRAPH_API_KEY is required in .env (Subgraph Studio)');
  process.exit(1);
}

// Metered pricing — cheap for compare, slightly higher for wallet risk (more queries)
const PRICE_COMPARE = { asset: '0.0.0', amount: '100000' }; // 0.001 HBAR
const PRICE_RISK = { asset: '0.0.0', amount: '250000' }; // 0.0025 HBAR

const resourceServer = createResourceServer('testnet');
const arcSeller = createArcGatewaySeller();
const app = express();
app.use(express.json({ limit: '1mb' }));

app.use(
  paymentMiddleware(
    {
      'GET /v1/testnet/hbar/lending-compare': {
        accepts: [
          {
            scheme: 'exact',
            price: PRICE_COMPARE,
            network: 'hedera:testnet',
            payTo: SERVICE_ACCOUNT,
          },
        ],
        description: 'Messari standardized lending compare across protocols (The Graph)',
        mimeType: 'application/json',
      },
      'GET /v1/testnet/hbar/wallet-risk': {
        accepts: [
          {
            scheme: 'exact',
            price: PRICE_RISK,
            network: 'hedera:testnet',
            payTo: SERVICE_ACCOUNT,
          },
        ],
        description: 'Multi-protocol wallet risk scan via Messari standardized subgraphs',
        mimeType: 'application/json',
      },
    },
    resourceServer,
  ),
);

app.get('/v1/testnet/hbar/lending-compare', async (req: Request, res: Response) => {
  try {
    const slugs = typeof req.query.slugs === 'string' ? req.query.slugs.split(',') : undefined;
    const forceStale =
      req.query.forceStale === '1' ||
      req.query.forceStale === 'true' ||
      req.query.demo === 'stale';
    const result = await compareLendingProtocols({
      apiKey: GRAPH_API_KEY,
      maxBlockLag: MAX_LAG,
      slugs,
      forceStale,
    });
    const audit = await appendAudit({
      kind: 'lending-compare',
      paidTo: SERVICE_ACCOUNT,
      verdict: result.decision.verdict,
      freshnessDemo: result.freshnessDemo ?? false,
      protocols: result.protocols.map((p) => ({ slug: p.slug, status: p.status })),
      at: result.fetchedAt,
    });
    res.json({ ...result, hederaAudit: audit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/v1/testnet/hbar/wallet-risk', async (req: Request, res: Response) => {
  try {
    const address = String(req.query.address ?? '');
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({ error: 'address query param required (0x…)' });
      return;
    }
    const slugs = typeof req.query.slugs === 'string' ? req.query.slugs.split(',') : undefined;
    const forceStale =
      req.query.forceStale === '1' ||
      req.query.forceStale === 'true' ||
      req.query.demo === 'stale';
    const result = await assessWalletRisk({
      apiKey: GRAPH_API_KEY,
      address,
      maxBlockLag: MAX_LAG,
      slugs,
      forceStale,
    });
    const audit = await appendAudit({
      kind: 'wallet-risk',
      address,
      verdict: result.decision.verdict,
      freshnessDemo: result.freshnessDemo ?? false,
      paidTo: SERVICE_ACCOUNT,
      at: result.fetchedAt,
    });
    res.json({ ...result, hederaAudit: audit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Circle Agent Stack — Arc USDC nanopayment (Gateway-batched x402). */
app.get(
  '/v1/arc/usdc/go-action',
  attachArcPaymentMeta,
  arcSeller.requirePayment(ARC_PRICE),
  async (req: Request, res: Response) => {
    const verdict = String(req.query.verdict ?? 'GO');
    const signalRef = typeof req.query.signalRef === 'string' ? req.query.signalRef : undefined;
    res.json({
      stack: 'Circle Agent Nanopayments',
      network: 'eip155:5042002',
      asset: 'USDC',
      price: ARC_PRICE,
      seller: arcSeller.sellerAddress,
      action: 'execute-after-graph-go',
      verdict,
      signalRef,
      message:
        'Graph GO confirmed — Arc nanopayment settled via Circle Gateway. Agent may proceed with USDC economic action.',
      at: new Date().toISOString(),
    });
  },
);

/** Free discovery — lists endpoints + registry (not gated). */
app.get('/v1/catalog', (_req, res) => {
  res.json({
    name: 'MeteredSignal',
    description: 'x402-metered Graph intelligence for agents',
    facilitator: process.env.X402_TESTNET_FACILITATOR_URL ?? 'https://api.testnet.blocky402.com',
    network: 'hedera:testnet',
    asset: 'HBAR',
    arcNanopayments: {
      enabled: Boolean(arcSeller.sellerAddress),
      network: 'eip155:5042002',
      path: '/v1/arc/usdc/go-action',
      price: ARC_PRICE,
      seller: arcSeller.sellerAddress,
      stack: 'Circle Agent Nanopayments / Gateway',
    },
    registry: LENDING_REGISTRY,
    endpoints: [
      {
        path: '/v1/testnet/hbar/lending-compare',
        method: 'GET',
        priceTinybars: PRICE_COMPARE.amount,
        sponsors: ['The Graph', 'Hedera'],
      },
      {
        path: '/v1/testnet/hbar/wallet-risk?address=0x…',
        method: 'GET',
        priceTinybars: PRICE_RISK.amount,
        sponsors: ['The Graph', 'Hedera'],
      },
      {
        path: '/v1/arc/usdc/go-action',
        method: 'GET',
        priceUsdc: ARC_PRICE,
        sponsors: ['Arc', 'Circle Agent Stack'],
      },
    ],
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: SERVICE_ACCOUNT,
    graphKey: GRAPH_API_KEY ? 'set' : 'missing',
    arcSeller: arcSeller.sellerAddress ? 'set' : 'missing',
    port: PORT,
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 MeteredSignal merchant on http://localhost:${PORT}`);
  console.log(`   Catalog:  GET /v1/catalog`);
  console.log(`   Compare:  GET /v1/testnet/hbar/lending-compare  (x402 HBAR)`);
  console.log(`   Risk:     GET /v1/testnet/hbar/wallet-risk?address=0x…  (x402 HBAR)`);
  console.log(`   Arc GO:   GET /v1/arc/usdc/go-action  (Circle nanopayments ${ARC_PRICE})`);
  console.log(`   Pay to:   ${SERVICE_ACCOUNT}`);
  console.log(`   Arc seller: ${arcSeller.sellerAddress ?? '(unset)'}`);
  console.log(`   Facilitator: Blocky402 testnet\n`);
});
