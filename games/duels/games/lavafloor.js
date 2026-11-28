// Floor Is Lava: everyone steers a dot around a tiled arena from their phone. Tiles glow, then melt into lava in
// patterns (scatter, stripes, checkerboard, rings, tiles right under you) and cool down again a few seconds later;
// after a while the edges start sinking for good. Bump into someone to shove them. Stand on lava and you're out.
// Last one standing takes the round; first to 2 rounds wins (5 rounds at most). Server ticks ~12 times a second.
const { ranked, seats } = require("../rank");
const COLS = 13;
const ROWS = 9;
const TICK_MS = 80;
const COUNT_MS = 3000;
const OVER_MS = 3500;
const WARN_MS = 1500;
const LAVA_MS = 3500;
const SPEED = 3.4; // tiles per second
const ACCEL = 9; // how fast you reach the stick's speed (per second)
const R = 0.3; // dot radius in tiles
const KNOCK = 1.7;
const SINK_AFTER = 40000;
const SINK_EVERY = 5000;
const WIN = 2;
const MAX_ROUNDS = 5;
const SOLID = 0;
const WARN = 1;
const LAVA = 2;
const GONE = 3;

const r2 = (n) => Math.round(n * 100) / 100;
const idx = (c, r) => r * COLS + c;

function spawnAt(n, i) {
    if (n === 1) return { x: COLS / 2, y: ROWS / 2 };
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: COLS / 2 + Math.cos(a) * Math.min(3.6, 1 + n * 0.4), y: ROWS / 2 + Math.sin(a) * Math.min(2.6, 0.8 + n * 0.3) };
}

function startRound(state, ctx) {
    state.round++;
    state.phase = "count";
    state.tiles = new Array(COLS * ROWS).fill(SOLID);
    state.until = new Array(COLS * ROWS).fill(0);
    state.alive = seats(state.n).map(() => true);
    state.outAt = seats(state.n).map(() => null);
    state.dots = seats(state.n).map((s) => ({ ...spawnAt(state.n, s), vx: 0, vy: 0 }));
    state.input = seats(state.n).map(() => [0, 0]);
    state.sunk = 0;
    state.pattern = null;
    const now = ctx.now();
    state.startAt = now + COUNT_MS;
    state.nextAt = null;
    const run = ++state.run;
    ctx.later(COUNT_MS, (t) => {
        if (state.run !== run || state.phase !== "count") return;
        state.phase = "play";
        state.playAt = t;
        state.tickAt = t;
        state.patternAt = t + 1500;
        state.sinkAt = t + SINK_AFTER;
        loop(state, ctx, t, run);
    });
}

function loop(state, ctx, at, run) {
    const next = at + TICK_MS;
    ctx.later(Math.max(0, next - ctx.now()), (now) => {
        if (state.run !== run || state.phase !== "play") return;
        step(state, ctx, Math.min(0.2, (now - state.tickAt) / 1000), now);
        if (state.phase === "play") loop(state, ctx, next, run);
    });
}

function step(state, ctx, dt, now) {
    state.tickAt = now;
    const t = state.tiles;
    for (let i = 0; i < t.length; i++) {
        if (t[i] === WARN && now >= state.until[i]) {
            t[i] = LAVA;
            state.until[i] = now + LAVA_MS;
        } else if (t[i] === LAVA && now >= state.until[i]) t[i] = SOLID;
    }
    if (now >= state.patternAt) pattern(state, ctx, now);
    if (now >= state.sinkAt) sink(state, now);
    const live = seats(state.n).filter((s) => state.alive[s]);
    for (const s of live) {
        const d = state.dots[s];
        const [ix, iy] = state.input[s];
        const k = Math.min(1, ACCEL * dt);
        d.vx += (ix * SPEED - d.vx) * k;
        d.vy += (iy * SPEED - d.vy) * k;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
    }
    for (let a = 0; a < live.length; a++) {
        for (let b = a + 1; b < live.length; b++) {
            const p = state.dots[live[a]];
            const q = state.dots[live[b]];
            let dx = q.x - p.x;
            let dy = q.y - p.y;
            let d = Math.hypot(dx, dy);
            if (d >= R * 2) continue;
            if (d < 0.001) {
                dx = 1;
                dy = 0;
                d = 1;
            }
            const nx = dx / d;
            const ny = dy / d;
            const over = R * 2 - d;
            p.x -= (nx * over) / 2;
            p.y -= (ny * over) / 2;
            q.x += (nx * over) / 2;
            q.y += (ny * over) / 2;
            const vn = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
            if (vn > 0) {
                const j = vn * KNOCK;
                p.vx -= j * nx * 0.5;
                p.vy -= j * ny * 0.5;
                q.vx += j * nx;
                q.vy += j * ny;
                state.bumps++;
            }
        }
    }
    for (const s of live) {
        const d = state.dots[s];
        d.x = Math.max(R, Math.min(COLS - R, d.x));
        d.y = Math.max(R, Math.min(ROWS - R, d.y));
        const c = Math.min(COLS - 1, Math.floor(d.x));
        const r = Math.min(ROWS - 1, Math.floor(d.y));
        if (t[idx(c, r)] >= LAVA) {
            state.alive[s] = false;
            state.outAt[s] = now - state.playAt;
            d.vx = d.vy = 0;
        }
    }
    const left = seats(state.n).filter((s) => state.alive[s]);
    if (left.length <= (state.n === 1 ? 0 : 1)) endRound(state, ctx, left, now);
}

function pick(rng, list) {
    return list[Math.floor(rng() * list.length)];
}

// warn a set of tiles (solid ones only); a few safe tiles always stay (one, once the edges are gone)
function warn(state, list, now, ms = WARN_MS) {
    const t = state.tiles;
    const solid = t.filter((x) => x === SOLID).length;
    const keep = state.sunk >= 4 ? 1 : 6;
    let hit = list.filter((i) => t[i] === SOLID);
    if (solid - hit.length < keep) hit = hit.slice(0, Math.max(0, solid - keep));
    for (const i of hit) {
        t[i] = WARN;
        state.until[i] = now + ms;
    }
}

function pattern(state, ctx, now) {
    const rng = ctx.rng;
    const age = now - state.playAt;
    const all = seats(COLS * ROWS);
    const kinds = ["scatter", "rows", "cols", "checker", "ring", "hunt", "half", "cross"];
    let kind = pick(rng, age < 8000 ? ["scatter", "rows", "cols", "half"] : kinds);
    if (kind === state.pattern) kind = pick(rng, kinds);
    state.pattern = kind;
    const cr = (i) => [i % COLS, Math.floor(i / COLS)];
    let list = [];
    if (kind === "scatter") list = all.filter(() => rng() < 0.22 + Math.min(0.15, age / 200000));
    else if (kind === "rows") {
        const a = Math.floor(rng() * ROWS);
        const b = (a + 2 + Math.floor(rng() * (ROWS - 3))) % ROWS;
        list = all.filter((i) => [a, b].includes(cr(i)[1]));
    } else if (kind === "cols") {
        const a = Math.floor(rng() * COLS);
        const b = (a + 3 + Math.floor(rng() * (COLS - 5))) % COLS;
        list = all.filter((i) => [a, b, (a + 1) % COLS].includes(cr(i)[0]));
    } else if (kind === "checker") {
        const par = rng() < 0.5 ? 0 : 1;
        list = all.filter((i) => (cr(i)[0] + cr(i)[1]) % 2 === par);
    } else if (kind === "ring") {
        const k = Math.floor(rng() * 4);
        list = all.filter((i) => {
            const [c, r] = cr(i);
            return Math.min(c, r, COLS - 1 - c, ROWS - 1 - r) === k;
        });
    } else if (kind === "hunt") {
        for (const s of seats(state.n)) {
            if (!state.alive[s]) continue;
            const c = Math.floor(state.dots[s].x);
            const r = Math.floor(state.dots[s].y);
            for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (c + dc >= 0 && c + dc < COLS && r + dr >= 0 && r + dr < ROWS) list.push(idx(c + dc, r + dr));
        }
    } else if (kind === "half") {
        const side = Math.floor(rng() * 4);
        list = all.filter((i) => {
            const [c, r] = cr(i);
            return [c < COLS / 2 - 1, c > COLS / 2, r < ROWS / 2 - 1, r > ROWS / 2][side];
        });
    } else if (kind === "cross") {
        const c0 = 2 + Math.floor(rng() * (COLS - 4));
        const r0 = 1 + Math.floor(rng() * (ROWS - 2));
        list = all.filter((i) => cr(i)[0] === c0 || cr(i)[1] === r0 || Math.abs(cr(i)[0] - c0) === Math.abs(cr(i)[1] - r0));
    }
    warn(state, list, now, kind === "hunt" ? WARN_MS + 300 : WARN_MS);
    state.patternAt = now + Math.max(1700, 3400 - age / 25);
}

// the outermost ring still standing sinks for good
function sink(state, now) {
    const k = state.sunk++;
    if (k >= Math.min(COLS, ROWS) / 2 - 1) return;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (Math.min(c, r, COLS - 1 - c, ROWS - 1 - r) !== k) continue;
            const i = idx(c, r);
            state.tiles[i] = GONE;
        }
    }
    state.sinkAt = now + SINK_EVERY;
}

function endRound(state, ctx, left, now) {
    const w = left.length === 1 ? left[0] : null;
    if (w !== null) state.wins[w]++;
    seats(state.n).forEach((s) => (state.survived[s] += state.alive[s] ? now - state.playAt : state.outAt[s] || 0));
    state.last = { round: state.round, winner: w };
    state.phase = "over";
    state.run++;
    state.nextAt = now + OVER_MS;
    const run = state.run;
    const done = Math.max(...state.wins) >= WIN || state.round + 1 >= MAX_ROUNDS || state.n === 1;
    ctx.later(OVER_MS, () => {
        if (state.run !== run || state.phase !== "over") return;
        if (done) state.phase = "done";
        else startRound(state, ctx);
    });
}

function pub(state) {
    return {
        phase: state.phase,
        round: state.round,
        win: WIN,
        dims: [COLS, ROWS, R],
        tickMs: TICK_MS,
        startAt: state.startAt,
        nextAt: state.nextAt,
        tiles: state.tiles.join(""),
        dots: state.dots.map((d) => [r2(d.x), r2(d.y)]),
        alive: state.alive,
        wins: state.wins,
        last: state.last,
        sinking: state.phase === "play" && state.tickAt >= state.sinkAt - 3000,
    };
}

module.exports = {
    id: "lavafloor",
    name: "Floor Is Lava",
    kind: "live",
    quick: true,
    players: [2, 10],
    init({ ctx, players = 2 }) {
        const state = { n: players, round: -1, run: 0, phase: "count", wins: new Array(players).fill(0), survived: new Array(players).fill(0), bumps: 0, last: null };
        startRound(state, ctx);
        return state;
    },
    view(state) {
        return pub(state);
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p) {
        if (!p || typeof p !== "object" || typeof p.x !== "number" || typeof p.y !== "number" || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return { error: "Bad move." };
        if (state.phase === "done") return { ok: true, quiet: true };
        if (!state.alive[seat]) return { error: "You're out this round." };
        let { x, y } = p;
        const m = Math.hypot(x, y);
        if (m > 1) {
            x /= m;
            y /= m;
        }
        state.input[seat] = [r2(x), r2(y)];
        return { ok: true, quiet: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const best = Math.max(...state.wins);
        return ranked(seats(state.n).map((s) => state.wins[s] * 1e7 + state.survived[s]), "high", best ? "Took " + best + " round" + (best === 1 ? "" : "s") + " · " + (state.round + 1) + " played" : "Nobody survived a round");
    },
};
