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

The git tag `game-v1-before-landing` is the site exactly as it was before the landing page (game at `/`).

## Tests

```
npm install
npm test
```
