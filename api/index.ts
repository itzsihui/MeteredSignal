import type { Express } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let cached: Handler | null = null;

async function loadApp(): Promise<Handler> {
  if (cached) return cached;
  const mod = await import('../packages/api/src/server.js');
  const app = mod.default as Express;
  cached = app as unknown as Handler;
  return cached;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await loadApp();
  return app(req, res);
}
