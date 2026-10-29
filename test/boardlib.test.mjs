import assert from 'node:assert/strict';
import { mergeBoard, emptyBoard } from '../lib/boardlib.mjs';
const b0 = emptyBoard();
assert.equal(b0.players.chris.best, 6742);
const b1 = mergeBoard(b0, { players: { addy: { best: 1200, games: 1, last: 1200, lastAt: '2026-10-29T04:00:00.000Z', bestAt: '2026-10-29T04:00:00.000Z' } } });
assert.equal(b1.players.addy.best, 1200);
const b2 = mergeBoard(b1, { players: { addy: { best: 900, games: 2, last: 900 } } });
assert.equal(b2.players.addy.best, 1200, 'a lower score never replaces a best');
assert.equal(b2.players.addy.last, 900);
assert.equal(mergeBoard(b2, { players: { hacker: { best: 1 } } }), null, 'unknown players ignored');
const b3 = mergeBoard(b2, { players: { aurora: { best: 10, bolts: 40, owned: ['dino'], outfit: 'dino' } } });
assert.equal(b3.players.aurora.bolts, undefined, 'devices cannot set bolts directly');
assert.equal(b3.players.aurora.owned, undefined, 'devices cannot give themselves items');
assert.equal(mergeBoard(b3, { players: { chris: { best: 'lots' } } }).players.chris.best, 6742);
console.log('boardlib tests passed');

// ---- actions
import { applyOp, PRICES, publicBoard } from '../lib/boardlib.mjs';
let b = emptyBoard();
let r = applyOp(b, { id: 'addy', type: 'earn', n: 50, opId: 'op-1' }); b = r.board;
assert.equal(b.players.addy.bolts, 50);
r = applyOp(b, { id: 'addy', type: 'earn', n: 50, opId: 'op-1' }); b = r.board;
assert.equal(b.players.addy.bolts, 50, 'a retried save is not counted twice');
r = applyOp(b, { id: 'addy', type: 'buy', item: 'fire', opId: 'op-2' });
assert.equal(r.error, 'not_enough_bolts', 'items cost what the server says');
r = applyOp(b, { id: 'addy', type: 'buy', item: 'dino', opId: 'op-3' }); b = r.board;
assert.equal(b.players.addy.bolts, 50 - PRICES.dino);
assert.deepEqual(b.players.addy.owned, ['dino']);
assert.equal(b.players.addy.outfit, 'dino');
r = applyOp(b, { id: 'addy', type: 'equip', outfit: 'space', opId: 'op-4' });
assert.equal(r.error, 'not_owned');
r = applyOp(b, { id: 'addy', type: 'equip', outfit: 'truck', opId: 'op-5' }); b = r.board;
assert.equal(b.players.addy.outfit, 'truck');
// two devices finishing runs at once both count
r = applyOp(b, { id: 'aurora', type: 'run', score: 500, opId: 'run-a' }); b = r.board;
r = applyOp(b, { id: 'aurora', type: 'run', score: 300, opId: 'run-b' }); b = r.board;
assert.equal(b.players.aurora.games, 2);
assert.equal(b.players.aurora.best, 500);
assert.equal(b.players.aurora.last, 300);
// old-style saves can no longer hand out bolts or items
const legacy = mergeBoard(b, { players: { addy: { bolts: 99999, owned: ['rex'] } } });
assert.equal(legacy.players.addy.bolts, b.players.addy.bolts);
assert.deepEqual(legacy.players.addy.owned, ['dino']);
assert.equal(publicBoard(b).seen, undefined);
console.log('action tests passed');

// ---- typed names ----
{
  const { applyOp, emptyBoard, MAX_PLAYERS } = await import('../lib/boardlib.mjs');
  let b = emptyBoard();
  let r = applyOp(b, { type: 'run', id: 'big-dawg', name: 'Big Dawg', score: 120, opId: 'n1aaaa' });
  assert.equal(r.error, null); assert.equal(r.board.players['big-dawg'].name, 'Big Dawg'); assert.equal(r.board.players['big-dawg'].best, 120);
  b = r.board;
  r = applyOp(b, { type: 'run', id: 'chris', name: 'CHRIS', score: 5, opId: 'n2aaaa' });
  assert.equal(r.board.players.chris.name, 'Chris', 'family names keep their spelling');
  assert.equal(r.board.players.chris.best, 6742, 'typing Chris keeps his saved best');
  r = applyOp(b, { type: 'run', id: 'Bad Id!', name: 'x', score: 5, opId: 'n3aaaa' });
  assert.equal(r.error, 'unknown_player');
  r = applyOp(b, { type: 'run', id: 'sam', name: '<b>Sam</b>', score: 5, opId: 'n4aaaa' });
  assert.equal(r.board.players.sam.name, 'bSamb', 'markup stripped from names');
  let full = emptyBoard();
  for (let i = 0; Object.keys(full.players).length < MAX_PLAYERS; i++) full = applyOp(full, { type: 'run', id: 'p' + i, name: 'P' + i, score: 1, opId: 'f' + i + 'xxxx' }).board;
  r = applyOp(full, { type: 'run', id: 'one-more', name: 'One More', score: 1, opId: 'fullxx' });
  assert.equal(r.error, 'unknown_player', 'board stops at MAX_PLAYERS');
  r = applyOp(full, { type: 'run', id: 'chris', name: 'Chris', score: 1, opId: 'fullyy' });
  assert.equal(r.error, null, 'existing players still save when full');
  console.log('name tests passed');
}
