/**
 * Production server: serves the built app from dist/ and the AI API.
 *   npm run build && npm start
 * Reads settings from the environment (npm start loads .env if present).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createApiHandler } from './api.ts';

const root = resolve(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 8787);
const api = createApiHandler(process.env);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  if (await api(req, res)) return;
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error('dir');
  } catch {
    file = join(root, 'index.html'); // single-page app fallback
  }
  try {
    const body = await readFile(file);
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
    if (file.includes(`${join(root, 'assets')}`)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Not found. Run `npm run build` first.');
  }
}).listen(port, () => console.log(`RS Analytics on http://localhost:${port}`));
