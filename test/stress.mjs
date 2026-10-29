// Two separate server instances sharing one store, hit by 30 saves at once.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blobs-'));
const blobs = new BlobsServer({ directory: dir, token: 'tok', port: 8897 });
await blobs.start();
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: 'http://localhost:8897', uncachedEdgeURL: 'http://localhost:8897', siteID: 'site1', token: 'tok' })).toString('base64');
const A = (await import('../netlify/functions/board.mjs?a')).default;
const B = (await import('../netlify/functions/board.mjs?b')).default;
const post = (h, op) => h(new Request('http://x/api/board', { method: 'POST', body: JSON.stringify({ op }) }));
const N = 30;
const res = await Promise.all(Array.from({ length: N }, (_, i) => post(i % 2 ? A : B, { type: 'earn', id: 'jameson', n: 5, opId: 'op' + i + 'x' })));
const codes = res.map(r => r.status);
const board = await (await A(new Request('http://x/api/board'))).json();
const got = board.players.jameson.bolts;
console.log('statuses', [...new Set(codes)].join(','), 'bolts', got, 'expected', N * 5, got === N * 5 ? 'PASS' : 'FAIL');
await blobs.stop(); process.exit(got === N * 5 ? 0 : 1);
