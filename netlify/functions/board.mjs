// Family high-score board for Jameson's Dino Dash.
// GET  /api/board  -> the whole board (anyone can read it; the TV dashboard uses this too)
// POST /api/board  -> {data: {players: {<id>: {...}}}} merges one player's update
import { getStore } from '@netlify/blobs';
import { emptyBoard, mergeBoard, applyOp, publicBoard } from '../../lib/boardlib.mjs';

const HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: HEADERS });
  const store = getStore({ name: 'dino-dash', consistency: 'strong' });

  if (req.method === 'GET') {
    const cur = (await store.get('board', { type: 'json' })) || emptyBoard();
    return new Response(JSON.stringify(publicBoard(cur)), { headers: HEADERS });
  }
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Use GET or POST' }), { status: 405, headers: HEADERS });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Send JSON' }), { status: 400, headers: HEADERS }); }

  // One save at a time: take a short lock (a create-only-if-missing write), so two devices
  // saving at the same moment can never overwrite each other.
  // Saves reaching this server instance also wait their turn here.
  const run = chain.then(async () => {
    const lock = await takeLock(store);
    try {
      return await save(store, body);
    } finally {
      if (lock) await store.delete('lock').catch(() => {});
    }
  });
  chain = run.catch(() => {});
  return run;
};

let chain = Promise.resolve();

async function takeLock(store) {
  const me = Math.random().toString(36).slice(2);
  for (let i = 0; i < 60; i++) {
    const res = await store.setJSON('lock', { me, at: Date.now() }, { onlyIfNew: true });
    if (res && res.modified) return me;
    const held = await store.get('lock', { type: 'json' }).catch(() => null);
    if (held && Date.now() - held.at > 4000) await store.delete('lock').catch(() => {}); // a save that crashed
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 60));
  }
  return null; // give up waiting; the version check below still guards the write
}

async function save(store, body) {
  // Retry a few times if two devices save at the same moment.
  for (let attempt = 0; attempt < 6; attempt++) {
    const entry = await store.getWithMetadata('board', { type: 'json' });
    const cur = entry ? entry.data : null;
    let next;
    if (body && body.op) {
      // an action from a device: run finished, bolts earned, item bought, outfit changed
      const r = applyOp(cur, body.op);
      if (r.error) return new Response(JSON.stringify({ error: r.error, board: publicBoard(r.board) }), { status: 409, headers: HEADERS });
      if (!r.changed) return new Response(JSON.stringify({ ok: true, board: publicBoard(r.board) }), { headers: HEADERS });
      next = r.board;
    } else {
      next = mergeBoard(cur, body && body.data);
      if (!next) return new Response(JSON.stringify({ error: 'Nothing to save' }), { status: 400, headers: HEADERS });
    }
    // guard against two saves at once when the store gives us a version tag
    const opts = !entry ? { onlyIfNew: true } : entry.etag ? { onlyIfMatch: entry.etag } : {};
    try {
      const res = await store.setJSON('board', next, opts);
      if (res && res.modified === false) continue;
      if (body && body.op) {
        // read it back: if another save landed on top of ours, apply this action again
        const check = await store.get('board', { type: 'json' });
        if (!check || !Array.isArray(check.seen) || !check.seen.includes(body.op.opId)) continue;
      }
      const pub = publicBoard(next);
      return new Response(JSON.stringify(body && body.op ? { ok: true, board: pub } : pub), { headers: HEADERS });
    } catch (e) {
      if (attempt === 5) throw e;
    }
  }
  return new Response(JSON.stringify({ error: 'Busy, try again' }), { status: 503, headers: HEADERS });
}

export const config = { path: '/api/board' };
