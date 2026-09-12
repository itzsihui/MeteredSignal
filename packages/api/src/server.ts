import { config } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import express, { type Express } from 'express';
import { createMerchantApp } from '../../merchant/src/app.js';
import { createAgentApp, resolveMerchantUrl } from '../../agent/src/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

/**
 * Single Express app for Vercel: merchant (/v1, /health) + agent (/api, static UI).
 * MERCHANT_URL defaults to https://$VERCEL_URL so the agent can pay itself.
 */
export function createCombinedApp(): Express {
  const merchantUrl = resolveMerchantUrl();
  const merchant = createMerchantApp();
  // On Vercel, static UI is served from /public — API process only needs routes.
  const serveStatic = !process.env.VERCEL;
  const agent = createAgentApp({ merchantUrl, serveStatic });

  const app = express();
  app.use((req, res, next) => {
    const path = req.path || '';
    if (path === '/health' || path.startsWith('/v1')) {
      return merchant(req, res, next);
    }
    return next();
  });
  app.use(agent);
  return app;
}

const app = createCombinedApp();
export default app;
