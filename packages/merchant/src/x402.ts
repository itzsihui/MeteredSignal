import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';

export function createResourceServer(network: 'testnet' | 'mainnet' = 'testnet') {
  const envKey =
    network === 'mainnet' ? 'X402_MAINNET_FACILITATOR_URL' : 'X402_TESTNET_FACILITATOR_URL';
  // ETHOnline Hedera track: Blocky402 facilitator
  const defaultUrl =
    network === 'mainnet'
      ? 'https://api.blocky402.com'
      : 'https://api.testnet.blocky402.com';
  const facilitatorUrl = process.env[envKey] ?? defaultUrl;
  const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

  return new x402ResourceServer(facilitatorClient).register(
    'hedera:*',
    new ExactHederaScheme({}),
  );
}
