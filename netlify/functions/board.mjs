// Family high-score board for Jameson's Dino Dash.
// GET  /api/board  -> the whole board (anyone can read it; the TV dashboard uses this too)
// POST /api/board  -> {data: {players: {<id>: {...}}}} merges one player's update
import { getStore } from '@netlify/blobs';
import { emptyBoard, mergeBoard } from '../../lib/boardlib.mjs';

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
    return new Response(JSON.stringify(cur), { headers: HEADERS });
  }
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Use GET or POST' }), { status: 405, headers: HEADERS });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Send JSON' }), { status: 400, headers: HEADERS }); }

  // Retry a few times if two devices save at the same moment.
  for (let attempt = 0; attempt < 4; attempt++) {
    const entry = await store.getWithMetadata('board', { type: 'json' });
    const cur = entry ? entry.data : null;
    const next = mergeBoard(cur, body && body.data);
    if (!next) return new Response(JSON.stringify({ error: 'Nothing to save' }), { status: 400, headers: HEADERS });
    // guard against two saves at once when the store gives us a version tag
    const opts = !entry ? { onlyIfNew: true } : entry.etag ? { onlyIfMatch: entry.etag } : {};
    try {
      const res = await store.setJSON('board', next, opts);
      if (res && res.modified === false) continue;
      return new Response(JSON.stringify(next), { headers: HEADERS });
    } catch (e) {
      if (attempt === 3) throw e;
    }
  }
  return new Response(JSON.stringify({ error: 'Busy, try again' }), { status: 503, headers: HEADERS });
};

export const config = { path: '/api/board' };
