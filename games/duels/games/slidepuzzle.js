// Slide Puzzle Race: everyone gets the same shuffled sliding puzzle (3×3, then two 4×4s) and slides the tiles back into
// order. Solving = 10, plus up to 10 for speed and up to 5 for few moves. The phone plays moves locally and sends the
// whole list when it thinks it's solved; the server replays it from the shuffle and checks. Solo: your total time is the
// personal best. options.timer = false (casual): no clock; a round ends once everyone solves it or gives up.
const { ranked, seats } = require("../rank");
const { scramble, play, isSolved, distance } = require("../slide");
const ROUNDS = [[3, 30, 60000], [4, 46, 150000], [4, 60, 150000]];
const READY_MS = 3000;
const REVEAL_MS = 5000;

function ask(state, ctx) {
    state.phase = "ask";
    state.doneAt = state.score.map(() => null);
    state.moves = state.score.map(() => 0);
    state.home = state.score.map(() => null);
    state.out = state.score.map(() => false);
    state.got = null;
    state.askAt = ctx.now();
    if (!state.timed) return (state.deadline = null);
    const limit = state.rounds[state.index].limit;
    state.deadline = state.askAt + limit;
    const i = state.index;
    ctx.later(limit, () => state.index === i && state.phase === "ask" && reveal(state, ctx));
}

const allDone = (state) => state.doneAt.every((d, s) => d !== null || state.out[s]);

function reveal(state, ctx) {
    const r = state.rounds[state.index];
    const par = 1.5 * distance(r.tiles, r.size);
    state.phase = "reveal";
    state.got = state.doneAt.map((d, s) => (d === null ? 0 : 10 + Math.round(10 * Math.max(0, 1 - d / r.limit)) + Math.round(5 * Math.min(1, par / state.moves[s]))));
    state.got.forEach((g, s) => {
        state.score[s] += g;
        if (state.doneAt[s] === null) return;
        state.solved[s]++;
        state.totalMs[s] += state.doneAt[s];
        state.totalMoves[s] += state.moves[s];
    });
    state.deadline = ctx.now() + REVEAL_MS;
    const i = state.index;
    ctx.later(REVEAL_MS, () => {
        if (state.index !== i || state.phase !== "reveal") return;
        if (i + 1 >= state.rounds.length) state.phase = "done";
        else {
            state.index++;
            ask(state, ctx);
        }
    });
}

function pub(state) {
    const r = state.rounds[state.index];
    return {
        phase: state.phase,
        index: state.index,
        total: state.rounds.length,
        timed: state.timed,
        deadline: state.deadline,
        size: r.size,
        tiles: state.phase === "ready" ? null : r.tiles,
        score: state.score,
        done: state.doneAt.map((d) => d !== null),
        ms: state.doneAt,
        moves: state.moves,
        home: state.home,
        out: state.out,
        got: state.phase === "reveal" || state.phase === "done" ? state.got : null,
        solved: state.solved,
        totalMs: state.totalMs,
    };
}

const clock = (ms) => {
    const t = Math.round(ms / 100) / 10;
    return t >= 60 ? Math.floor(t / 60) + ":" + (t % 60).toFixed(1).padStart(4, "0") : t.toFixed(1) + "s";
};

module.exports = {
    id: "slidepuzzle",
    name: "Slide Puzzle Race",
    kind: "race",
    quick: true,
    players: [1, 10],
    clock,
    options: { timer: [true, false] },
    init({ rng, ctx, options = {}, players = 2 }) {
        const rounds = ROUNDS.map(([size, steps, limit]) => ({ size, limit, tiles: scramble(rng, size, steps) }));
        const zero = () => new Array(players).fill(0);
        const state = { rounds, index: 0, phase: "ready", timed: options.timer !== false, doneAt: new Array(players).fill(null), moves: zero(), home: new Array(players).fill(null), out: new Array(players).fill(false), got: null, score: zero(), solved: zero(), totalMs: zero(), totalMoves: zero(), askAt: 0, deadline: ctx.now() + READY_MS };
        ctx.later(READY_MS, () => ask(state, ctx));
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.mine = { done: state.doneAt[seat] !== null, out: state.out[seat], askAt: state.askAt };
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object" || p.q !== state.index) return { error: "Bad move." };
        if (state.phase !== "ask") return { error: "Round's over." };
        if (p.act === "skip") {
            if (state.timed || !ctx.host) return { error: "Only the host can skip." };
            reveal(state, ctx);
            return { ok: true };
        }
        if (state.doneAt[seat] !== null || state.out[seat]) return { error: "You're done with this one." };
        const r = state.rounds[state.index];
        if (p.act === "out") state.out[seat] = true;
        else if (p.act === "progress") {
            const n = Number(p.n), h = Number(p.home);
            if (!Number.isInteger(n) || n < 0 || n > 5000 || !Number.isInteger(h) || h < 0 || h >= r.tiles.length) return { ok: true, quiet: true };
            state.moves[seat] = n;
            state.home[seat] = h;
            return { ok: true };
        } else {
            const b = play(r.tiles, r.size, p.moves);
            if (!b) return { error: "Those moves don't add up." };
            if (!isSolved(b)) return { error: "Not solved yet." };
            state.doneAt[seat] = ctx.now() - state.askAt;
            state.moves[seat] = p.moves.length;
            state.home[seat] = r.tiles.length - 1;
        }
        if (allDone(state)) reveal(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const n = state.rounds.length;
        if (state.score.length === 1) {
            const all = state.solved[0] === n;
            const r = ranked(state.score, "high", all ? "All " + n + " solved in " + clock(state.totalMs[0]) + " · " + state.totalMoves[0] + " moves" : state.solved[0] + " of " + n + " solved · " + state.score[0] + " points");
            if (all) Object.assign(r, { score: Math.round(state.totalMs[0] / 100) / 10, low: true, unit: "s" });
            return r;
        }
        return ranked(state.score, "high", "Top score " + Math.max(...state.score) + " · most solved " + Math.max(...state.solved) + " of " + n);
    },
};
