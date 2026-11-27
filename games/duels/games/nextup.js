// Next in Line: a number pattern, four choices for what comes next. Ten patterns that get trickier. Everyone answers at
// once (one tap, no changing it); a right answer scores 5 plus up to 5 for speed. The rule is shown after each one.
const { ranked, seats } = require("../rank");
const COUNT = 10;
const READY_MS = 3000;
const ASK_MS = 15000;
const REVEAL_MS = 3500;

const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const sign = (k) => (k < 0 ? "−" + -k : "+" + k);

// each maker returns { seq: [5 shown + answer], rule, near: [tempting wrong answers] }
const MAKERS = [
    // level 0
    [
        (rng) => {
            const a = int(rng, 1, 20), k = int(rng, 2, 9);
            const s = seats(6).map((i) => a + k * i);
            return { seq: s, rule: "Add " + k + " each time", near: [s[5] + 1, s[5] - 1, s[5] + k] };
        },
        (rng) => {
            const k = int(rng, 2, 8), a = int(rng, 5 * k + 5, 5 * k + 40);
            const s = seats(6).map((i) => a - k * i);
            return { seq: s, rule: "Take away " + k + " each time", near: [s[5] - 1, s[5] + 1, s[5] - k] };
        },
        (rng) => {
            const a = int(rng, 1, 5);
            const s = seats(6).map((i) => a * 2 ** i);
            return { seq: s, rule: "Double it each time", near: [s[5] - a, s[4] + s[3], s[5] + 2] };
        },
    ],
    // level 1
    [
        (rng) => {
            const a = int(rng, 1, 10), d = int(rng, 1, 3);
            const s = [a];
            for (let i = 1; i < 6; i++) s.push(s[i - 1] + d * i);
            return { seq: s, rule: "Add " + d + ", then " + 2 * d + ", then " + 3 * d + "…", near: [s[5] + d, s[5] - d, s[4] + d * 4] };
        },
        (rng) => {
            const o = int(rng, 0, 4);
            const s = seats(6).map((i) => (i + 1 + o) ** 2);
            return { seq: s, rule: "Square numbers: " + (1 + o) + "×" + (1 + o) + ", " + (2 + o) + "×" + (2 + o) + "…", near: [s[5] + 1, s[5] - 2, s[4] * 2] };
        },
        (rng) => {
            const a = int(rng, 1, 4), b = int(rng, 2, 6);
            const s = [a, b];
            for (let i = 2; i < 6; i++) s.push(s[i - 1] + s[i - 2]);
            return { seq: s, rule: "Add the last two together", near: [s[5] + 1, s[4] * 2, s[5] - s[2]] };
        },
        (rng) => {
            const a = int(rng, 1, 3), k = 3;
            const s = seats(6).map((i) => a * k ** i);
            return { seq: s, rule: "Times 3 each time", near: [s[4] * 2, s[5] + 3, s[5] - a] };
        },
    ],
    // level 2
    [
        (rng) => {
            const a = int(rng, 1, 6), b = int(rng, 20, 40), p = int(rng, 2, 5), q = int(rng, 1, 4);
            const s = [a, b, a + p, b - q, a + 2 * p, b - 2 * q];
            return { seq: s, rule: "Two patterns taking turns: " + sign(p) + " and " + sign(-q), near: [s[4] + p, s[4] - q, s[5] - q] };
        },
        (rng) => {
            const a = int(rng, 1, 5), m = int(rng, 2, 3), k = int(rng, 1, 3);
            const s = [a];
            for (let i = 1; i < 6; i++) s.push(s[i - 1] * m + k);
            return { seq: s, rule: "Times " + m + ", then add " + k, near: [s[4] * m, s[4] * m + k + 1, s[4] * m - k] };
        },
        (rng) => {
            const o = int(rng, 0, 3);
            const s = seats(6).map((i) => ((i + 1 + o) * (i + 2 + o)) / 2);
            return { seq: s, rule: "Add 1 more each time (triangle numbers)", near: [s[5] + 1, s[5] - 1, s[4] + 5 + o] };
        },
        (rng) => {
            const P = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41];
            const o = int(rng, 0, 4);
            const s = P.slice(o, o + 6);
            return { seq: s, rule: "Prime numbers", near: [s[5] + 2, s[5] - 1, s[4] + 2] };
        },
    ],
    // level 3
    [
        (rng) => {
            const a = int(rng, 2, 9), m = int(rng, 2, 3), k = int(rng, 1, 5);
            const s = [a];
            for (let i = 1; i < 6; i++) s.push(i % 2 ? s[i - 1] * m : s[i - 1] - k);
            return { seq: s, rule: "Times " + m + ", then " + sign(-k) + ", over and over", near: [s[4] * m, s[5] + k, s[4] - k] };
        },
        (rng) => {
            const o = int(rng, 1, 3);
            const s = seats(6).map((i) => (i + o) ** 3);
            return { seq: s, rule: "Cube numbers: n×n×n", near: [s[5] + 1, (5 + o) ** 2, s[4] * 2] };
        },
        (rng) => {
            const a = int(rng, 1, 5);
            const s = [a, a + 1];
            for (let i = 2; i < 6; i++) s.push(s[i - 1] + s[i - 2] * 2);
            return { seq: s, rule: "Add the last one plus double the one before", near: [s[4] + s[3], s[5] + 1, s[4] * 2] };
        },
        (rng) => {
            const n = int(rng, 1, 3), c = int(rng, 1, 5);
            const s = seats(6).map((i) => (i + n) ** 2 + c);
            return { seq: s, rule: "Square numbers " + sign(c), near: [(5 + n) ** 2, s[5] + 2, s[4] + 9] };
        },
    ],
];

function makeQuestion(rng, i, used = []) {
    const level = Math.min(3, Math.floor(i / 2.5));
    const list = MAKERS[level].filter((f) => !used.includes(f));
    const make = list[Math.floor(rng() * list.length)];
    const { seq, rule, near } = make(rng);
    if (seq.some((x) => x < 0)) return makeQuestion(rng, i, used);
    used.push(make);
    const ans = seq[5];
    const pool = near.concat([ans + 2, ans - 2, ans + 10, ans + 3]).filter((x, k, a) => Number.isInteger(x) && x >= 0 && x !== ans && a.indexOf(x) === k);
    const choices = [ans];
    while (choices.length < 4) {
        const x = pool.length ? pool.shift() : ans + choices.length * 4;
        if (!choices.includes(x)) choices.push(x);
    }
    for (let k = 3; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [choices[k], choices[j]] = [choices[j], choices[k]];
    }
    return { seq: seq.slice(0, 5), choices, answer: choices.indexOf(ans), rule };
}

function ask(state, ctx) {
    state.phase = "ask";
    state.picks = state.score.map(() => null);
    state.got = null;
    state.askAt = ctx.now();
    state.deadline = state.askAt + ASK_MS;
    const i = state.index;
    ctx.later(ASK_MS, () => state.index === i && state.phase === "ask" && reveal(state, ctx));
}

function reveal(state, ctx) {
    const q = state.questions[state.index];
    state.phase = "reveal";
    state.got = state.picks.map((p) => (p && p.c === q.answer ? 5 + Math.max(0, Math.round((5 * (ASK_MS - p.ms)) / ASK_MS)) : 0));
    state.got.forEach((g, s) => {
        state.score[s] += g;
        if (g) state.right[s]++;
    });
    state.deadline = ctx.now() + REVEAL_MS;
    const i = state.index;
    ctx.later(REVEAL_MS, () => {
        if (state.index !== i || state.phase !== "reveal") return;
        if (i + 1 >= COUNT) state.phase = "done";
        else {
            state.index++;
            ask(state, ctx);
        }
    });
}

function pub(state) {
    const q = state.questions[state.index];
    const shown = state.phase === "reveal";
    return {
        phase: state.phase,
        index: state.index,
        total: COUNT,
        deadline: state.deadline,
        seq: state.phase === "ready" ? null : q.seq,
        choices: state.phase === "ready" ? null : q.choices,
        answer: shown ? q.answer : null,
        rule: shown ? q.rule : null,
        picks: shown ? state.picks.map((p) => (p ? p.c : null)) : null,
        got: shown ? state.got : null,
        in: state.picks.map(Boolean),
        score: state.score,
        right: state.right,
    };
}

module.exports = {
    id: "nextup",
    name: "Next in Line",
    kind: "live",
    quick: true,
    players: [1, 10],
    makeQuestion,
    init({ rng, ctx, players = 2 }) {
        const used = [];
        const questions = seats(COUNT).map((i) => makeQuestion(rng, i, used));
        const state = { questions, index: 0, phase: "ready", picks: new Array(players).fill(null), got: null, score: new Array(players).fill(0), right: new Array(players).fill(0), deadline: ctx.now() + READY_MS };
        ctx.later(READY_MS, () => ask(state, ctx));
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.mine = state.picks[seat] ? state.picks[seat].c : null;
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        const c = p && p.choice;
        if (!p || p.q !== state.index || !Number.isInteger(c) || c < 0 || c > 3) return { error: "Pick an answer." };
        if (state.phase !== "ask") return { ok: true, quiet: true };
        if (state.picks[seat]) return { error: "Locked in!" };
        state.picks[seat] = { c, ms: ctx.now() - state.askAt };
        if (state.picks.every(Boolean)) reveal(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const solo = state.score.length === 1;
        const top = Math.max(...state.score);
        const r = ranked(state.score, "high", solo ? state.right[0] + " of " + COUNT + " right · " + state.score[0] + " points" : "Top score " + top + " · " + Math.max(...state.right) + " of " + COUNT + " right");
        if (solo) r.score = state.score[0];
        return r;
    },
};
