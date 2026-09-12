import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner } from '@x402/hedera';
import { PrivateKey } from '@hiero-ledger/sdk';

export type PaymentStage =
  | 'connecting'
  | 'payment_required'
  | 'sending'
  | 'accepted'
  | 'payment_rejected';

export function initX402() {
  const accountId = process.env.HEDERA_AGENT_ACCOUNT_ID;
  let privateKeyStr = process.env.HEDERA_AGENT_PRIVATE_KEY;

  if (!accountId || !privateKeyStr) {
    throw new Error('HEDERA_AGENT_ACCOUNT_ID and HEDERA_AGENT_PRIVATE_KEY must be set');
  }

  // Normalize hex key
  privateKeyStr = privateKeyStr.trim();
  if (!privateKeyStr.startsWith('0x')) {
    privateKeyStr = `0x${privateKeyStr}`;
  }

  const signer = createClientHederaSigner(
    accountId,
    // x402 bundles its own @hiero-ledger/sdk — cast across duplicate type identities
    PrivateKey.fromStringECDSA(privateKeyStr) as never,
    { network: 'hedera:testnet' },
  );

  // Match Hedera x402 PoC: register hedera:* and allow native HBAR micropayments
  const client = new x402Client()
    .register('hedera:*', new ExactHederaScheme(signer))
    .setSpendControls(false);

  function createFetchForRequest(onStatus: (stage: PaymentStage) => void): typeof fetch {
    const statusFetch: typeof fetch = async (input, init) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      const isPaymentRetry =
        req.headers.has('PAYMENT-SIGNATURE') || req.headers.has('X-PAYMENT');

      if (!isPaymentRetry) {
        onStatus('connecting');
        const res = await globalThis.fetch(req);
        if (res.status === 402) onStatus('payment_required');
        return res;
      }

      onStatus('sending');
      const res = await globalThis.fetch(req);
      if (res.ok) {
        onStatus('accepted');
      } else if (res.status === 402) {
        onStatus('payment_rejected');
      }
      return res;
    };

    return wrapFetchWithPayment(statusFetch, client);
  }

  return { createFetchForRequest, accountId };
}
