// Shape Shifter: tangram race. Everyone gets the same silhouette and the same seven pieces, and drags, turns and flips
// them to fill it. Pieces are checked on the server by how well they cover the shape. Three shapes; solving scores 100
// plus a speed bonus, an unsolved board scores for how much it covers. options.timer = false: no clock, the host moves on.
const { ranked, seats } = require("../rank");
const geo = require("../shapeshift/geo");
const { DESIGNS } = require("../shapeshift/designs");
const ROUNDS = 3;
const W = 12;
const H = 15;
const COUNT_MS = 3000;
const PLAY_MS = 150000;
const REVEAL_MS = 6000;
const COVER = 0.97;
const ERR = 0.6;
const STEP = 0.0917;
const TRAY = [
    ["L", [2.3, 9.9]], ["L", [6.9, 9.9]], ["M", [10.3, 9.9]],
    ["S", [1.5, 13]], ["S", [4.2, 13]], ["Q", [7, 13.2]], ["P", [10.2, 13]],
];
const r4 = (v) => Math.round(v * 1e4) / 1e4;

function placeDesign(d) {
    const pts = d.parts.flatMap((p) => p.pts);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const dx = W / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
    const dy = 4.2 - (Math.min(...ys) + Math.max(...ys)) / 2;
    const polys = d.parts.map((p) => p.pts.map(([x, y]) => [r4(x + dx), r4(y + dy)]));
    const box = [Math.min(...xs) + dx - 0.5, Math.min(...ys) + dy - 0.5, Math.max(...xs) + dx + 0.5, Math.max(...ys) + dy + 0.5];
    return { name: d.name, polys, box, outline: geo.outline(polys), solution: d.parts.map((p) => ({ t: p.t, at: [r4(p.at[0] + dx), r4(p.at[1] + dy), p.at[2], p.at[3]] })) };
}

const tray = () => TRAY.map(([t, [x, y]]) => ({ t, at: [x, y, 0, 0] }));

function startRound(state, ctx) {
    state.round++;
    state.phase = "count";
    state.target = placeDesign(DESIGNS[state.picks[state.round]]);
    state.boards = seats(state.n).map(() => tray());
    state.cover = seats(state.n).map(() => 0);
    state.solvedAt = seats(state.n).map(() => null);
    state.got = seats(state.n).map(() => 0);
    const now = ctx.now();
    state.startAt = now + COUNT_MS;
    state.endAt = state.timed ? state.startAt + PLAY_MS : null;
    const run = ++state.run;
    ctx.later(COUNT_MS, () => {
        if (state.run !== run) return;
        state.phase = "play";
        if (state.timed) ctx.later(PLAY_MS, () => state.run === run && state.phase === "play" && endRound(state, ctx));
    });
}

// progress only counts pieces sitting on the shape's box, so the ones still in the tray don't count against you
function check(state, seat, now) {
    const polys = state.boards[seat].map((p) => geo.poly(p.t, p.at));
    const { cover, err } = geo.compare(state.target.polys, polys, STEP);
    const [x0, y0, x1, y1] = state.target.box;
    const near = state.boards[seat].filter((p) => p.at[0] > x0 && p.at[0] < x1 && p.at[1] > y0 && p.at[1] < y1).map((p) => geo.poly(p.t, p.at));
    const part = near.length ? geo.compare(state.target.polys, near, STEP) : { cover: 0, err: 0 };
    const spill = Math.max(0, part.err - (1 - part.cover) * 16);
    state.cover[seat] = Math.max(0, Math.min(0.99, part.cover - spill / 16));
    if (state.solvedAt[seat] === null && cover >= COVER && err <= ERR) {
        state.solvedAt[seat] = now - state.startAt;
        state.cover[seat] = 1;
    }
}

function endRound(state, ctx) {
    const order = seats(state.n).filter((s) => state.solvedAt[s] !== null).sort((a, b) => state.solvedAt[a] - state.solvedAt[b]);
    for (const s of seats(state.n)) {
        let pts;
        if (state.solvedAt[s] !== null) pts = 100 + (state.timed ? Math.round((50 * Math.max(0, PLAY_MS - state.solvedAt[s])) / PLAY_MS) : Math.max(0, 50 - order.indexOf(s) * 10));
        else pts = Math.round(60 * state.cover[s]);
        state.got[s] = pts;
        state.points[s] += pts;
    }
    state.phase = "reveal";
    state.revealAt = ctx.now() + REVEAL_MS;
    const run = ++state.run;
    ctx.later(REVEAL_MS, () => {
        if (state.run !== run) return;
        if (state.round + 1 >= ROUNDS) state.phase = "done";
        else startRound(state, ctx);
    });
}

function pub(state) {
    const t = state.target;
    return {
        phase: state.phase,
        round: state.round,
        rounds: ROUNDS,
        dims: [W, H],
        name: t.name,
        outline: t.outline,
        timed: state.timed,
        startAt: state.startAt,
        endAt: state.endAt,
        revealAt: state.phase === "reveal" ? state.revealAt : null,
        cover: state.cover.map((c) => Math.round(c * 100)),
        solvedAt: state.solvedAt,
        got: state.got,
        points: state.points,
        solution: state.phase === "reveal" || state.phase === "done" ? t.solution : null,
    };
}

module.exports = {
    id: "shapeshift",
    name: "Shape Shifter",
    kind: "race",
    quick: false,
    players: [1, 10],
    options: { timer: [true, false] },
    init({ rng, ctx, players = 2, options = {} }) {
        const pool = seats(DESIGNS.length);
        const picks = seats(ROUNDS).map(() => pool.splice(Math.floor(rng() * pool.length), 1)[0]);
        const state = { n: players, picks, round: -1, run: 0, phase: "count", timed: options.timer !== false, points: new Array(players).fill(0) };
        startRound(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.mine = state.boards[seat];
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.act === "skip") {
            if (!ctx.host) return { error: "Only the host can move on." };
            if (state.phase !== "play") return { ok: true, quiet: true };
            endRound(state, ctx);
            return { ok: true };
        }
        if (state.phase !== "play") return { error: state.phase === "count" ? "Not yet!" : "Time's up for this shape." };
        if (state.solvedAt[seat] !== null) return { error: "You've solved this one." };
        if (p.act === "reset") {
            state.boards[seat] = tray();
            state.cover[seat] = 0;
            return { ok: true };
        }
        if (p.act !== "place") return { error: "Bad move." };
        const { i, at } = p;
        if (!Number.isInteger(i) || i < 0 || i > 6 || !Array.isArray(at) || at.length !== 4) return { error: "Bad piece." };
        const [x, y, r, f] = at;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > W || y < 0 || y > H) return { error: "Keep it on the board." };
        if (!Number.isInteger(r) || r < 0 || r > 7 || (f !== 0 && f !== 1)) return { error: "Bad turn." };
        state.boards[seat][i].at = [r4(x), r4(y), r, f];
        check(state, seat, ctx.now());
        if (state.solvedAt.every((t) => t !== null)) endRound(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const best = Math.max(...state.points);
        const r = ranked(state.points, "high", "Top score " + best + " over " + ROUNDS + " shapes");
        if (state.n === 1) r.score = state.points[0];
        return r;
    },
};
