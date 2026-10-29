// The landing page draws with art code copied out of the game. This fails if the
// game changed and `npm run build:landing` wasn't re-run, so the two can't drift apart.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const f = new URL('../public/assets/dd-art.js', import.meta.url);
const before = fs.readFileSync(f, 'utf8');
execFileSync('node', [new URL('../scripts/build-landing-art.mjs', import.meta.url).pathname]);
const after = fs.readFileSync(f, 'utf8');
if (before !== after) { console.error('FAIL landing art is out of date with the game: run npm run build:landing and commit'); process.exit(1); }
console.log('PASS landing art matches the game');
