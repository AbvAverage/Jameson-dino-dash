// Jameson's Dino Dash on Cloudflare: the landing page and game are static files in public/,
// and /api/board is the family score server, kept in one Durable Object so every save is
// handled one at a time (simultaneous games on different devices are all counted).
import { DurableObject } from 'cloudflare:workers';
import { emptyBoard, mergeBoard, applyOp, publicBoard } from '../lib/boardlib.mjs';

const HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
};
// Where the scores lived before the move. On first start the board is copied from here once.
const OLD_BOARD = 'https://clever-chaja-58d8f0.netlify.app/api/board';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: HEADERS });

export class Board extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.board = null;
    // nothing else runs until the board is loaded (and, the very first time, imported)
    ctx.blockConcurrencyWhile(async () => {
      let b = await ctx.storage.get('board');
      if (!b) {
        b = emptyBoard();
        try {
          const r = await fetch(OLD_BOARD, { headers: { accept: 'application/json' } });
          if (r.ok) {
            const j = await r.json();
            if (j && j.players && typeof j.players === 'object' && Object.keys(j.players).length) b = { ...j, seen: [], importedFrom: 'netlify', importedAt: new Date().toISOString() };
          }
        } catch { /* old site gone: start from the built-in scores */ }
        await ctx.storage.put('board', b);
      }
      this.board = b;
    });
  }

  read() { return publicBoard(this.board); }

  // One save. Durable Objects run one request at a time with no awaits between read and
  // write here, so two devices can never overwrite each other.
  async save(body) {
    if (body && body.op) {
      const r = applyOp(this.board, body.op);
      if (r.error) return { status: 409, body: { error: r.error, board: publicBoard(r.board) } };
      if (r.changed) { this.board = r.board; await this.ctx.storage.put('board', this.board); }
      return { status: 200, body: { ok: true, board: publicBoard(this.board) } };
    }
    const next = mergeBoard(this.board, body && body.data);
    if (!next) return { status: 400, body: { error: 'Nothing to save' } };
    this.board = next; await this.ctx.storage.put('board', this.board);
    return { status: 200, body: publicBoard(this.board) };
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/board') {
      if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: HEADERS });
      const stub = env.BOARD.get(env.BOARD.idFromName('family'));
      if (req.method === 'GET') return json(await stub.read());
      if (req.method !== 'POST') return json({ error: 'Use GET or POST' }, 405);
      let body;
      try { body = await req.json(); } catch { return json({ error: 'Send JSON' }, 400); }
      const r = await stub.save(body);
      return json(r.body, r.status);
    }
    if (url.pathname === '/game' || url.pathname === '/game/') return Response.redirect(new URL('/play/', url).toString(), 301);
    return env.ASSETS.fetch(req);
  }
};
