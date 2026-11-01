# Jameson's Dino Dash

A runner game starring Jameson, with a family high-score board that syncs across every device.

- `public/index.html` is the landing page. Its Play Now buttons go to `/play/`.
- `public/play/index.html` is the whole game (unchanged; it used to live at `public/index.html`).
- `public/assets/` holds the landing page's code (`landing.js`, `landing.css`), fonts, gameplay video and the art copied from the game.
- `netlify/functions/board.mjs` is the score keeper. It stores the family board in Netlify Blobs.
- `lib/boardlib.mjs` holds the rules for merging scores (a lower score never replaces a best).

## Scores for the TV dashboard

`GET /api/board` returns the board as JSON, for example:

```json
{ "players": { "chris": { "name": "Chris", "best": 6742, "games": 10 }, "addy": { "name": "Addy", "best": 1200 } } }
```

## Landing page art

The landing page draws Rex, Jameson, the worlds and the shop with the game's own drawing code,
so the characters always match. After changing art or shop items in the game, run:

```
npm run build:landing
```

That rewrites `public/assets/dd-art.js`, `jameson-head.png` and `jungle-far.webp` from `public/play/index.html`.
`npm test` fails if you forget.

To try the whole site locally (landing page, game and score board): `node test/siteserver.mjs`, then open http://localhost:8900.

## Rolling back

Commit `a51ce2e` on `main` is the site exactly as it was before the landing page (game at `/`).

## Tests

```
npm install
npm test
```

## Hosting on Cloudflare (current)

The site now runs on Cloudflare Workers (free plan):

- `public/` is served as static files (landing page at `/`, game at `/play/`, `/game` redirects there).
- `/api/board` is the family score server: `worker/index.mjs`, one Durable Object that handles
  saves one at a time, using the same rules as before (`lib/boardlib.mjs`).
- On its very first start the server copies the board from the old Netlify site once; if that
  site is gone it starts from the built-in scores.
- `wrangler.jsonc` holds the config. Cloudflare's GitHub integration deploys every push to `main`
  (`npx wrangler deploy`).

Local run: `npm install`, then `npx wrangler dev` and open http://localhost:8787.
Test the Cloudflare version end to end: `E2E_SITE=http://localhost:8787 python3 test/e2e.py`.
