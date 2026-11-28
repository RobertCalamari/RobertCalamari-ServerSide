// Word Ladder: turn the start word into the target one letter at a time, every step a real word. Three ladders (4, 4,
// then 5 letters), 90 seconds each. Reaching the target = 10, plus up to 5 for matching the shortest ladder (−1 per
// extra step), up to 5 for speed, and +2 for getting there first in a group. The shortest ladder is only shown after
// the round. options.timer = false (casual): no clock or speed points; a round ends once everyone is done or gives up.
const { ranked, seats } = require("../rank");
const { pickLadder, badStep } = require("../ladder");
const ROUNDS = [[4, 4, 5], [4, 5, 6], [5, 4, 6]];
const READY_MS = 3000;
const ASK_MS = 90000;
const REVEAL_MS = 8000;

function ask(state, ctx) {
    const r = state.rounds[state.index];
    state.phase = "ask";
    state.chains = state.score.map(() => [r.start]);
    state.doneAt = state.score.map(() => null);
    state.out = state.score.map(() => false);
    state.first = null;
    state.got = null;
    state.askAt = ctx.now();
    if (!state.timed) return (state.deadline = null);
    state.deadline = state.askAt + ASK_MS;
    const i = state.index;
    ctx.later(ASK_MS, () => state.index === i && state.phase === "ask" && reveal(state, ctx));
}

const allDone = (state) => state.doneAt.every((d, s) => d !== null || state.out[s]);
const steps = (state, s) => state.chains[s].length - 1;

function reveal(state, ctx) {
    const best = state.rounds[state.index].path.length - 1;
    state.phase = "reveal";
    state.got = state.doneAt.map((d, s) => {
        if (d === null) return 0;
        const speed = state.timed ? Math.round(5 * Math.max(0, 1 - d / ASK_MS)) : 0;
        return 10 + Math.max(0, 5 - (steps(state, s) - best)) + speed + (state.first === s && state.score.length > 1 ? 2 : 0);
    });
    state.got.forEach((g, s) => {
        state.score[s] += g;
        if (state.doneAt[s] !== null) state.solved[s]++;
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
    const shown = state.phase === "reveal" || state.phase === "done";
    const live = state.phase !== "ready";
    return {
        phase: state.phase,
        index: state.index,
        total: state.rounds.length,
        timed: state.timed,
        deadline: state.deadline,
        len: r.start.length,
        start: live ? r.start : null,
        target: live ? r.target : null,
        best: live ? r.path.length - 1 : null,
        score: state.score,
        steps: state.chains.map((c) => c.length - 1),
        done: state.doneAt.map((d) => d !== null),
        out: state.out,
        first: state.first,
        path: shown ? r.path : null,
        chains: shown ? state.chains : null,
        got: shown ? state.got : null,
    };
}

module.exports = {
    id: "wordladder",
    name: "Word Ladder",
    kind: "live",
    quick: true,
    players: [1, 10],
    options: { timer: [true, false] },
    init({ rng, ctx, options = {}, players = 2 }) {
        const avoid = [];
        const rounds = ROUNDS.map(([len, lo, hi]) => {
            const l = pickLadder(rng, len, lo, hi, avoid);
            avoid.push(...l.path);
            return l;
        });
        const state = { rounds, index: 0, phase: "ready", timed: options.timer !== false, chains: seats(players).map(() => [rounds[0].start]), doneAt: new Array(players).fill(null), out: new Array(players).fill(false), first: null, got: null, score: new Array(players).fill(0), solved: new Array(players).fill(0), askAt: 0, deadline: ctx.now() + READY_MS };
        ctx.later(READY_MS, () => ask(state, ctx));
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.mine = { chain: state.chains[seat], done: state.doneAt[seat] !== null, out: state.out[seat] };
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
        if (state.doneAt[seat] !== null) return { error: "You already made it!" };
        if (state.out[seat]) return { error: "You gave this one up." };
        const chain = state.chains[seat];
        if (p.act === "out") {
            state.out[seat] = true;
        } else if (p.act === "undo") {
            if (chain.length < 2) return { ok: true, quiet: true };
            chain.pop();
        } else {
            if (typeof p.w !== "string" || p.w.length > 10) return { error: "Bad word." };
            const w = p.w.toLowerCase();
            const why = badStep(chain, w);
            if (why) return { error: why };
            if (chain.length > 40) return { error: "That ladder's long enough. Undo a few." };
            chain.push(w);
            if (w === state.rounds[state.index].target) {
                state.doneAt[seat] = ctx.now() - state.askAt;
                if (state.first === null) state.first = seat;
            }
        }
        if (allDone(state)) reveal(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const solo = state.score.length === 1;
        const n = state.rounds.length;
        const r = ranked(state.score, "high", solo ? state.score[0] + " points · " + state.solved[0] + " of " + n + " ladders" : "Top score " + Math.max(...state.score) + " · most ladders " + Math.max(...state.solved) + " of " + n);
        if (solo && state.timed) r.score = state.score[0];
        return r;
    },
};
