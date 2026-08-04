import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pool } from '../infrastructure/database.js';
import { redis } from '../infrastructure/redis.js';
import { logger } from '../logging/index.js';

let server: ReturnType<typeof createServer> | null = null;
let isReady = false;

export function setReady(ready: boolean): void {
  isReady = ready;
}

async function handleLiveness(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'alive', ts: new Date().toISOString() }));
}

async function handleReadiness(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isReady) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'not_ready' }));
    return;
  }

  try {
    // Check database
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }

    // Check Redis
    await redis.ping();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ready', ts: new Date().toISOString() }));
  } catch (err: unknown) {
    const error = err as Error;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'not_ready', error: error.message }));
  }
}

export function startHealthServer(port: number = 3001): void {
  server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || '';

    if (url === '/health/live') {
      await handleLiveness(req, res);
    } else if (url === '/health/ready') {
      await handleReadiness(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    }
  });

  server.listen(port, () => {
    logger.info('Health server started', { port });
  });
}

export function stopHealthServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        logger.info('Health server stopped');
        resolve();
      });
    } else {
      resolve();
    }
  });
}
