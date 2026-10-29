# Jameson's Dino Dash

A runner game starring Jameson, with a family high-score board that syncs across every device.

- `public/index.html` is the whole game.
- `netlify/functions/board.mjs` is the score keeper. It stores the family board in Netlify Blobs.
- `lib/boardlib.mjs` holds the rules for merging scores (a lower score never replaces a best).

## Scores for the TV dashboard

`GET /api/board` returns the board as JSON, for example:

```json
{ "players": { "chris": { "name": "Chris", "best": 6742, "games": 10 }, "addy": { "name": "Addy", "best": 1200 } } }
```

## Tests

```
npm install
npm test
```
