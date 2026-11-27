// Path Recall: a trail lights up across a 5×5 grid, one square at a time. Then it goes dark and you tap it back in order.
// The trail grows by one each round (3 squares up to 12). Get it right for a point per square plus a speed bonus; a
// slip costs one of your 3 lives. Ends when everyone's out of lives or after the 12-square trail.
const { ranked, seats } = require("../rank");
const SIZE = 5;
const LIVES = 3;
const FIRST = 3;
const LAST = 12;
const READY_MS = 3000;
const STEP_MS = 520;
const REVEAL_MS = 2600;

const near = (a, b) => a !== b && Math.abs((a % SIZE) - (b % SIZE)) <= 1 && Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) <= 1;

function makePath(rng, len) {
    for (;;) {
        const path = [Math.floor(rng() * SIZE * SIZE)];
        while (path.length < len) {
            const last = path[path.length - 1];
            const next = seats(SIZE * SIZE).filter((c) => near(c, last) && !path.includes(c));
            if (!next.length) break;
            path.push(next[Math.floor(rng() * next.length)]);
        }
        if (path.length === len) return path;
    }
}

const inputMs = (len) => 5000 + len * 1000;

function show(state, ctx) {
    const len = FIRST + state.round;
    state.phase = "show";
    state.path = makePath(ctx.rng, len);
    state.answers = state.lives.map(() => null);
    state.showAt = ctx.now() + 600;
    state.deadline = state.showAt + len * STEP_MS + 300;
    const r = state.round;
    ctx.later(state.deadline - ctx.now(), () => {
        if (state.round !== r || state.phase !== "show") return;
        state.phase = "input";
        state.inputAt = ctx.now();
        state.deadline = state.inputAt + inputMs(len);
        ctx.later(inputMs(len), () => state.round === r && state.phase === "input" && reveal(state, ctx));
    });
}

function reveal(state, ctx) {
    const len = state.path.length;
    state.phase = "reveal";
    state.got = state.lives.map((l, s) => {
        if (l <= 0) return null;
        const a = state.answers[s];
        const ok = a && a.cells.length === len && a.cells.every((c, i) => c === state.path[i]);
        if (!ok) {
            state.lives[s]--;
            return 0;
        }
        const g = len + Math.max(0, Math.round((3 * (inputMs(len) - a.ms)) / inputMs(len)));
        state.score[s] += g;
        state.cleared[s] = len;
        return g;
    });
    state.deadline = ctx.now() + REVEAL_MS;
    const r = state.round;
    ctx.later(REVEAL_MS, () => {
        if (state.round !== r || state.phase !== "reveal") return;
        if (state.lives.every((l) => l <= 0) || FIRST + r >= LAST) state.phase = "done";
        else {
            state.round++;
            show(state, ctx);
        }
    });
}

function pub(state) {
    const open = state.phase === "show" || state.phase === "reveal";
    return {
        phase: state.phase,
        size: SIZE,
        round: state.round,
        len: FIRST + state.round,
        last: LAST,
        step: STEP_MS,
        showAt: state.showAt,
        deadline: state.deadline,
        path: open ? state.path : null,
        lives: state.lives,
        score: state.score,
        cleared: state.cleared,
        in: state.answers.map(Boolean),
        got: state.phase === "reveal" ? state.got : null,
        tries: state.phase === "reveal" ? state.answers.map((a) => (a ? a.cells : null)) : null,
    };
}

module.exports = {
    id: "pathrecall",
    name: "Path Recall",
    kind: "live",
    quick: true,
    players: [1, 10],
    makePath,
    init({ ctx, players = 2 }) {
        const state = { round: 0, phase: "ready", path: [], answers: new Array(players).fill(null), lives: new Array(players).fill(LIVES), score: new Array(players).fill(0), cleared: new Array(players).fill(0), got: null, showAt: 0, deadline: ctx.now() + READY_MS };
        ctx.later(READY_MS, () => show(state, ctx));
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.mine = state.answers[seat] ? state.answers[seat].cells : null;
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || p.r !== state.round || !Array.isArray(p.cells)) return { error: "Bad move." };
        if (state.phase !== "input") return { error: "Wait for the trail." };
        if (state.lives[seat] <= 0) return { error: "You're out of lives." };
        if (state.answers[seat]) return { error: "Already in." };
        const len = state.path.length;
        if (p.cells.length !== len || !p.cells.every((c) => Number.isInteger(c) && c >= 0 && c < SIZE * SIZE)) return { error: "Tap " + len + " squares." };
        state.answers[seat] = { cells: p.cells.slice(), ms: ctx.now() - state.inputAt };
        if (state.lives.every((l, s) => l <= 0 || state.answers[s])) reveal(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const solo = state.score.length === 1;
        const r = ranked(state.score, "high", solo ? state.score[0] + " points · longest trail " + state.cleared[0] : "Top score " + Math.max(...state.score) + " · longest trail " + Math.max(...state.cleared));
        if (solo) r.score = state.score[0];
        return r;
    },
};
