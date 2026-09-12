import express, { type Request, type Response, type Express } from 'express';
import { paymentMiddleware } from '@x402/express';
import { assessWalletRisk, compareLendingProtocols, LENDING_REGISTRY } from '@meteredsignal/graph';
import { createResourceServer } from './x402.js';
import { appendAudit } from './hcs.js';
import { attachArcPaymentMeta, createArcGatewaySeller, usdcPriceTag } from './arc-gateway.js';

const PRICE_COMPARE = { asset: '0.0.0', amount: '100000' }; // 0.001 HBAR
const PRICE_RISK = { asset: '0.0.0', amount: '250000' }; // 0.0025 HBAR

export function createMerchantApp(): Express {
  const SERVICE_ACCOUNT = process.env.HEDERA_SERVICE_ACCOUNT_ID ?? '';
  const GRAPH_API_KEY = process.env.GRAPH_API_KEY ?? '';
  const MAX_LAG = parseInt(process.env.GRAPH_MAX_BLOCK_LAG ?? '50', 10);
  const ARC_SPEND = process.env.ARC_SPEND_AMOUNT_USDC ?? '0.01';
  const ARC_PRICE = usdcPriceTag(ARC_SPEND);

  const resourceServer = createResourceServer('testnet');
  const arcSeller = createArcGatewaySeller();
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    if (!SERVICE_ACCOUNT || !GRAPH_API_KEY) {
      if (req.path === '/health' || req.path === '/v1/catalog') return next();
      res.status(503).json({
        error: 'Merchant misconfigured',
        hint: 'Set HEDERA_SERVICE_ACCOUNT_ID and GRAPH_API_KEY',
      });
      return;
    }
    next();
  });

  app.use(
    paymentMiddleware(
      {
        'GET /v1/testnet/hbar/lending-compare': {
          accepts: [
            {
              scheme: 'exact',
              price: PRICE_COMPARE,
              network: 'hedera:testnet',
              payTo: SERVICE_ACCOUNT || '0.0.0',
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
              payTo: SERVICE_ACCOUNT || '0.0.0',
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
      status: SERVICE_ACCOUNT && GRAPH_API_KEY ? 'ok' : 'misconfigured',
      service: SERVICE_ACCOUNT || null,
      graphKey: GRAPH_API_KEY ? 'set' : 'missing',
      arcSeller: arcSeller.sellerAddress ? 'set' : 'missing',
    });
  });

  return app;
}
