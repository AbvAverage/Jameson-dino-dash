// Local stand-in for the whole Netlify site: static files from public/ plus the real
// score function on /api/board (Netlify's own blobs emulator). Port 8900.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlobsServer } from '@netlify/blobs/server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blobs-'));
const blobs = new BlobsServer({ directory: dir, token: 'tok', port: 8897 });
await blobs.start();
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: 'http://localhost:8897', uncachedEdgeURL: 'http://localhost:8897', siteID: 'site1', token: 'tok' })).toString('base64');
const { default: handler } = await import('../netlify/functions/board.mjs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/board')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await handler(new Request('http://localhost' + req.url, { method: req.method, headers: { 'content-type': 'application/json' }, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text()); return;
    }
    let p = path.join(root, decodeURIComponent(url.pathname));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      if (!url.pathname.endsWith('/')) { res.writeHead(301, { location: url.pathname + '/' }); res.end(); return; }
      p = path.join(p, 'index.html');
    }
    if (!fs.existsSync(p)) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
    const data = fs.readFileSync(p);
    const type = TYPES[path.extname(p)] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && type === 'video/mp4') {
      const [a, b] = range.replace('bytes=', '').split('-');
      const start = +a, end = b ? +b : data.length - 1;
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${data.length}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
      res.end(data.subarray(start, end + 1)); return;
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes' }); res.end(data);
  } catch (e) { console.error(e); res.writeHead(500); res.end(String(e)); }
}).listen(8900, () => console.log('site on http://localhost:8900'));
