# Duels / Game Night game contract

Each game is one file in `games/duels/games/<id>.js` (server, auto-loaded) plus one React component in the site repo at
`src/duels/games/<Name>.js`, registered in `src/duels/registry.js`.

The same games run in two kinds of room on the `/duels` namespace:
- **1v1 Duels** (`/duels`): exactly two seats.
- **Game Night** (`/gamenight`, `group: true`): open room, up to 16 people, the host picks. A match is played by the
  people connected when it starts; anyone else watches. The engine maps room seats to **game seats `0..n-1`**, so a game
  only ever sees `n` players numbered from 0 and never deals with joins, leaves, hosts or spectators.

## Server module

```js
module.exports = {
  id: "tictactoe",          // url-safe, unique
  name: "Tic-Tac-Toe",
  kind: "turn",             // "turn" | "race" | "sim" | "live" (informational)
  quick: true,              // quick games (under ~2 minutes) can be picked for a gauntlet
  players: [2, 2],          // [min, max] game seats supported. Omitted = [2, 2]. Any max up to 16 is fine.
  init({ seed, rng, options, ctx, players }) { return state },  // players = n (number of game seats). Default it: players = 2
  view(state, seat) { return {...} },       // what game seat `seat` (0..n-1) may see (hide secrets!). JSON only.
  move(state, seat, payload, ctx) { return { ok: true } | { ok: true, quiet: true } | { error: "message" } },
  result(state) { return null | { winner, places?, text } },
  tv(state, { players }) { return {...} },  // optional: public view for TV screens and spectators (no secrets at all)
};
```

- Size every per-player array from `players` in `init` (`new Array(players).fill(0)`), never `[0, 0]`.
- `result`: `null` while playing. `winner` = a game seat or `null` (draw / tied for first).
  `places` (optional, recommended for 3+): array of length `n`, `places[seat]` = 1-based finishing place, ties share a place
  (`[2, 1, 2]`). Use `require("../rank")`: `places(values, "high"|"low")`, `winnerOf(places)`,
  `ranked(values, better, text)` → `{ winner, places, text }` (null values rank last). `text` ≤ 140 chars, no names
  (the client shows names and the placement list).
- The room turns game seats back into room seats: session wins, gauntlet score and the `places` the client gets are per room seat.
- `{ ok: true, quiet: true }` from `move` skips the broadcast (use for no-op updates).
- `ctx.later(ms, fn)` runs `fn(now)` later; afterwards the room re-checks `result` and broadcasts. Timers of a finished or
  cancelled match are dropped. `ctx.now()` = `Date.now()`. `ctx.rng()` = seeded `[0,1)`.
- Never trust the payload: validate types, ranges and whose turn it is. Return `{ error }` for bad moves.
- `state` must be plain JSON-able data (only `view()` / `tv()` output is sent).
- A player leaving mid-match cancels it (no result). A disconnect does not; they can rejoin and keep playing.
- Race games: `require("../race")` (`makeRace({ id, name, players, seconds, better, setup, validate, describe })`),
  N-player aware, with a built-in `tv`.

### `tv(state, { players })`
Sent to TV screens (and to people watching on their phone) on every broadcast, including lite mid-match ones.
Must be safe for everyone to see. If a game has no `tv` (or the registry entry has no `TvComponent`), the TV/spectator
screen is generic and understands this optional shape:

```js
{ headline: "Big line", sub: "Smaller line", endAt: serverMs, scores: [per seat], status: ["text per seat"] }
```

## Client component

```jsx
export default function MyGame({ view, seat, send, names, colors, count, result }) { ... }
```

- `view` = what `view(state, seat)` returned (updates live). `seat` = your game seat.
- `names` / `colors` = arrays of length `count` (= n) by game seat. Colours follow the person all session.
  `names.length > 2` is the usual switch from a head-to-head layout to a group one; `src/duels/Players.js` is a compact
  scoreboard for that (`<Players seat names colors score status={s=>text} hl={s=>bool} dim={s=>bool} />`, wraps for 16).
- `send(payload)` → server `move()`; returns a Promise resolving to `{ ok, error }`.
- `result` = `{ winner, places, text }` once finished (the shell shows the result overlay with placements).
- Mobile-first: big touch targets, pointer events, `touch-action: none` on draggable areas, no hover-only UI.
  Must fit a 375px-wide phone with the max player count without sideways scrolling.
- Optional registry field `TvComponent({ tv, names, colors, count, result })` renders `tv()` output on a landscape TV
  (16:9, fill the screen, no scrolling at 1280x720 and 1920x1080, size text in `vh`).
- Registry entry: `id: { name, icon, blurb, Component, TvComponent? }`.
