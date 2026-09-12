import { config } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createMerchantApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

const PORT = parseInt(process.env.MERCHANT_PORT ?? '4021', 10);

if (!process.env.HEDERA_SERVICE_ACCOUNT_ID) {
  console.error('✗ HEDERA_SERVICE_ACCOUNT_ID is required in .env');
  process.exit(1);
}
if (!process.env.GRAPH_API_KEY) {
  console.error('✗ GRAPH_API_KEY is required in .env (Subgraph Studio)');
  process.exit(1);
}

const app = createMerchantApp();
app.listen(PORT, () => {
  console.log(`\n🚀 MeteredSignal merchant on http://localhost:${PORT}`);
  console.log(`   Catalog:  GET /v1/catalog`);
  console.log(`   Compare:  GET /v1/testnet/hbar/lending-compare  (x402 HBAR)`);
  console.log(`   Risk:     GET /v1/testnet/hbar/wallet-risk?address=0x…  (x402 HBAR)`);
  console.log(`   Arc GO:   GET /v1/arc/usdc/go-action  (Circle nanopayments)`);
  console.log(`   Pay to:   ${process.env.HEDERA_SERVICE_ACCOUNT_ID}`);
  console.log(`   Facilitator: Blocky402 testnet\n`);
});
