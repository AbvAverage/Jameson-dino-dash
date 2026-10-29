// Local stand-in for Netlify: real function code + Netlify's own blobs emulator.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blobs-'));
const blobs = new BlobsServer({ directory: dir, token: 'tok', port: 8898 });
await blobs.start();
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: 'http://localhost:8898', uncachedEdgeURL: 'http://localhost:8898', siteID: 'site1', token: 'tok' })).toString('base64');
const { default: handler } = await import('../netlify/functions/board.mjs');
const page = fs.readFileSync(new URL('../public/index.html', import.meta.url));
http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/board')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await handler(new Request('http://localhost' + req.url, { method: req.method, headers: { 'content-type': 'application/json' }, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text());
    } else { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page); }
  } catch (e) { console.error(e); res.writeHead(500); res.end(String(e)); }
}).listen(8899, () => console.log('dev server on 8899'));
