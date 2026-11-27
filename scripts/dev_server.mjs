#!/usr/bin/env node
/**
 * Local Dev Server untuk uji coba JC PORTAL V.2.0 Web App Real-Time (Zero Dependencies)
 * Melayani folder webapp/ + endpoint lokal /api/admin-users di http://localhost:8788
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequestPost as adminUsersPost } from '../webapp/functions/api/admin-users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const WEBAPP_DIR = path.join(ROOT_DIR, 'webapp');
const PORT = Number(process.env.PORT || 8788);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(path.join(ROOT_DIR, '.env.local'));
loadEnvFile(path.join(ROOT_DIR, '.env'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  // Local Cloudflare Pages Function: /api/admin-users
  if (pathname === '/api/admin-users' && req.method === 'POST') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bodyBuf = Buffer.concat(chunks);
      const webReq = new Request(`http://localhost:${PORT}${pathname}`, {
        method: 'POST',
        headers: req.headers,
        body: bodyBuf
      });
      const webRes = await adminUsersPost({
        request: webReq,
        env: {
          SUPABASE_URL: process.env.SUPABASE_URL || '',
          SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || ''
        }
      });
      const text = await webRes.text();
      res.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
      res.end(text);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: err.message }));
    }
    return;
  }

  // Static file serving from webapp/
  const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const fullPath = path.resolve(WEBAPP_DIR, relPath);
  if (!fullPath.startsWith(WEBAPP_DIR) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(fullPath).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`JC PORTAL V.2.0 Dev Server aktif di http://localhost:${PORT}`);
});
