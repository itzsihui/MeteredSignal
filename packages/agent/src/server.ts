import { config } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createAgentApp, resolveMerchantUrl } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

const PORT = parseInt(process.env.AGENT_PORT ?? '3001', 10);
const MERCHANT_URL = resolveMerchantUrl();

const app = createAgentApp({ merchantUrl: MERCHANT_URL, serveStatic: true });
app.listen(PORT, () => {
  console.log(`\n🤖 MeteredSignal on http://localhost:${PORT}`);
  console.log(`   Merchant ${MERCHANT_URL}`);
  console.log(`   Landing: http://localhost:${PORT}/`);
  console.log(`   Demo:    http://localhost:${PORT}/demo\n`);
});
