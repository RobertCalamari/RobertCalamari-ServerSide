# Duels game contract

Each game is one file in `games/duels/games/<id>.js` (server) plus one React component in the site repo at
`src/duels/games/<Name>.js`, registered in `src/duels/registry.js`. Seats are `0` and `1`.

## Server module

```js
module.exports = {
  id: "tictactoe",          // url-safe, unique
  name: "Tic-Tac-Toe",
  kind: "turn",             // "turn" (take turns), "race" (both play the same seeded challenge, best score wins),
                            // "sim" (both decide at the same time, server resolves), or "live" (real-time, server judges)
  quick: true,              // quick games (under ~2 minutes) can be picked for a gauntlet
  init({ seed, rng, options, ctx }) { return state },   // rng() -> [0,1) seeded; same seed => same game
  view(state, seat) { return {...} },                   // what THIS player may see (hide secrets!). JSON only.
  move(state, seat, payload, ctx) { return { ok: true } | { error: "message" } },  // mutate state
  result(state) { return null | { winner: 0 | 1 | null, text: "Short reason" } },   // null = still playing
};
```

- `ctx.later(ms, fn)` runs `fn(now)` later (for timers/rounds); afterwards the room re-checks `result` and re-broadcasts.
  Timers from a finished/abandoned match are cancelled automatically.
- `ctx.now()` = `Date.now()`.
- Never trust the payload: validate types, ranges and whose turn it is. Return `{ error }` for bad moves.
- `state` must be plain JSON-able data (it's not sent directly; only `view()` output is sent).
- For race games use `../race.js`.

## Client component

```jsx
export default function TicTacToe({ view, seat, send, names, colors, result }) { ... }
```

- `view` = what the server's `view(state, seat)` returned (updates live).
- `send(payload)` → server `move()`; returns a Promise resolving to `{ ok, error }`.
- `names` = `[name0, name1]`, `colors` = `[seatColor0, seatColor1]` (seat 0 cyan, seat 1 pink).
- `result` = `{ winner, text }` once finished (the shell shows the result overlay; the component can show the final board).
- Mobile-first: big touch targets, pointer events (`onPointerDown/Move/Up`) for dragging, `touch-action: none` on
  draggable/board areas, no hover-only UI. Must fit a 375px-wide phone without sideways scrolling.
- Keep styles in `src/duels/duels.css` under a `.dg-<id>` class prefix.
