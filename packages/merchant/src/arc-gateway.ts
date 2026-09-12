import { BatchFacilitatorClient } from '@circle-fin/x402-batching/server';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Arc Testnet — Circle Gateway batching (from @circle-fin/x402-batching). */
const ARC_TESTNET_NETWORK = 'eip155:5042002';
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000';
const ARC_TESTNET_GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';

const facilitator = new BatchFacilitatorClient();

type PaymentPayload = {
  x402Version: number;
  resource?: { url: string; description: string; mimeType: string };
  accepted?: Record<string, unknown>;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
};

function buildPaymentRequirements(price: string, payTo: string) {
  const amount = Math.round(parseFloat(price.replace('$', '')) * 1_000_000);
  return {
    scheme: 'exact' as const,
    network: ARC_TESTNET_NETWORK,
    asset: ARC_TESTNET_USDC,
    amount: String(amount),
    payTo,
    maxTimeoutSeconds: 345_600,
    extra: {
      name: 'GatewayWalletBatched',
      version: '1',
      verifyingContract: ARC_TESTNET_GATEWAY_WALLET,
    },
  };
}

/**
 * Circle Agent Stack nanopayments seller (Gateway-batched x402 on Arc Testnet).
 * Mirrors circlefin/arc-nanopayments `withGateway` for Express.
 */
export function createArcGatewaySeller(): {
  requirePayment: (price: string) => RequestHandler;
  sellerAddress: string | null;
} {
  const sellerAddress =
    process.env.ARC_NANOPAY_SELLER_ADDRESS?.trim() ||
    process.env.ARC_TREASURY_ADDRESS?.trim() ||
    null;

  if (!sellerAddress || !/^0x[a-fA-F0-9]{40}$/.test(sellerAddress)) {
    const noop: RequestHandler = (_req, res) => {
      res.status(503).json({
        error: 'Arc nanopayments seller not configured',
        hint: 'Set ARC_NANOPAY_SELLER_ADDRESS (preferred) or ARC_TREASURY_ADDRESS',
      });
    };
    return { requirePayment: () => noop, sellerAddress: null };
  }

  const requirePayment = (price: string): RequestHandler => {
    const requirements = buildPaymentRequirements(price, sellerAddress);

    return async (req: Request, res: Response, next: NextFunction) => {
      const paymentSignature =
        req.header('PAYMENT-SIGNATURE') ||
        req.header('payment-signature') ||
        req.header('X-PAYMENT');

      if (!paymentSignature) {
        const paymentRequired = {
          x402Version: 2,
          resource: {
            url: req.originalUrl,
            description: `MeteredSignal Arc GO action (${price} USDC nanopayment)`,
            mimeType: 'application/json',
          },
          accepts: [requirements],
        };
        res.setHeader(
          'PAYMENT-REQUIRED',
          Buffer.from(JSON.stringify(paymentRequired)).toString('base64'),
        );
        res.status(402).json({});
        return;
      }

      try {
        const paymentPayload = JSON.parse(
          Buffer.from(paymentSignature, 'base64').toString('utf8'),
        ) as PaymentPayload;

        const verifyResult = await facilitator.verify(paymentPayload, requirements);
        if (!verifyResult.isValid) {
          console.warn('[arc-gateway] verify failed:', verifyResult.invalidReason);
          res.status(402).json({
            error: 'Payment verification failed',
            reason: verifyResult.invalidReason,
          });
          return;
        }

        const settleResult = await facilitator.settle(paymentPayload, requirements);
        if (!settleResult.success) {
          console.warn('[arc-gateway] settle failed:', settleResult.errorReason);
          res.status(402).json({
            error: 'Payment settlement failed',
            reason: settleResult.errorReason,
          });
          return;
        }

        const payer = settleResult.payer ?? verifyResult.payer ?? 'unknown';
        res.setHeader(
          'PAYMENT-RESPONSE',
          Buffer.from(
            JSON.stringify({
              success: true,
              transaction: settleResult.transaction,
              network: requirements.network,
              payer,
              stack: 'circle-agent-nanopayments',
            }),
          ).toString('base64'),
        );
        // Stash for handlers if needed
        (req as Request & { arcSettlement?: unknown }).arcSettlement = settleResult;
        next();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[arc-gateway] payment error:', message);
        res.status(500).json({ error: 'Payment processing error', message });
      }
    };
  };

  return { sellerAddress, requirePayment };
}

export function usdcPriceTag(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '$0.01';
  const fixed = n.toFixed(6).replace(/\.?0+$/, '');
  return `$${fixed || '0.01'}`;
}

export function attachArcPaymentMeta(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-MeteredSignal-Stack', 'circle-agent-nanopayments');
  next();
}
