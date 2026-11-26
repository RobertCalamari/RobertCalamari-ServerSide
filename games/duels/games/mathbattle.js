// Math Battle: both players get the same question with 4 choices. First correct tap takes the point;
// a wrong tap locks you out of that question. First to 7 (or most after 20 questions) wins.
const WIN = 7;
const COUNT = 20;
const READY_MS = 2500;
const REVEAL_MS = 1300;
const ASK_MS = 15000;

const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

function makeQuestion(rng, i) {
    const level = Math.min(4, Math.floor(i / 4));
    const ops = [["+"], ["+", "-"], ["+", "-", "×"], ["-", "×", "÷"], ["+", "-", "×", "÷"]][level];
    const op = ops[Math.floor(rng() * ops.length)];
    const max = [12, 30, 60, 99, 150][level];
    let a, b, ans;
    if (op === "+") {
        a = int(rng, 2, max);
        b = int(rng, 2, max);
        ans = a + b;
    } else if (op === "-") {
        a = int(rng, 5, max);
        b = int(rng, 1, a - 1);
        ans = a - b;
    } else if (op === "×") {
        a = int(rng, 2, 6 + level * 2);
        b = int(rng, 3, 9 + level);
        ans = a * b;
    } else {
        b = int(rng, 2, 6 + level * 2);
        ans = int(rng, 2, 8 + level * 2);
        a = b * ans;
    }
    const near = [ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10];
    if (op === "×") near.push(ans + a, ans - a, ans + b, ans - b);
    if (op === "÷") near.push(b, ans * 2, ans + 3);
    if (op === "+" || op === "-") near.push(ans + 9, ans - 9, ans + 11);
    const pool = near.filter((n, k) => n >= 0 && n !== ans && near.indexOf(n) === k);
    const choices = [ans];
    while (choices.length < 4) {
        const n = pool.length ? pool.splice(Math.floor(rng() * pool.length), 1)[0] : ans + choices.length * 3;
        if (!choices.includes(n)) choices.push(n);
    }
    for (let k = 3; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [choices[k], choices[j]] = [choices[j], choices[k]];
    }
    return { q: a + " " + op + " " + b, choices, answer: choices.indexOf(ans) };
}

function ask(state, ctx) {
    state.phase = "ask";
    state.locked = [false, false];
    state.picks = [null, null];
    state.answeredBy = null;
    state.deadline = ctx.now() + ASK_MS;
    const i = state.index;
    ctx.later(ASK_MS, () => {
        if (state.index === i && state.phase === "ask") reveal(state, ctx, null);
    });
}

function reveal(state, ctx, seat) {
    state.phase = "reveal";
    state.answeredBy = seat;
    if (seat !== null) state.score[seat]++;
    state.history.push(seat);
    state.nextAt = ctx.now() + REVEAL_MS;
    const i = state.index;
    ctx.later(REVEAL_MS, () => {
        if (state.index !== i || state.phase !== "reveal") return;
        if (state.score[0] >= WIN || state.score[1] >= WIN || i + 1 >= state.questions.length) {
            state.over = true;
            return;
        }
        state.index++;
        ask(state, ctx);
    });
}

module.exports = {
    id: "mathbattle",
    name: "Math Battle",
    kind: "live",
    quick: true,
    init({ rng, ctx }) {
        const questions = [];
        for (let i = 0; i < COUNT; i++) questions.push(makeQuestion(rng, i));
        const state = { questions, index: 0, phase: "ready", locked: [false, false], picks: [null, null], answeredBy: null, score: [0, 0], history: [], deadline: 0, nextAt: ctx.now() + READY_MS, over: false };
        ctx.later(READY_MS, () => ask(state, ctx));
        return state;
    },
    view(state, seat) {
        const q = state.questions[state.index];
        const shown = state.phase !== "ready";
        const revealed = state.phase === "reveal";
        return {
            index: state.index,
            total: state.questions.length,
            win: WIN,
            phase: state.phase,
            q: shown ? q.q : null,
            choices: shown ? q.choices : null,
            myLock: state.locked[seat],
            theirLock: state.locked[1 - seat],
            myPick: state.picks[seat],
            theirPick: revealed ? state.picks[1 - seat] : null,
            answer: revealed ? q.answer : null,
            answeredBy: revealed ? state.answeredBy : null,
            score: state.score,
            history: state.history,
            deadline: state.deadline,
            nextAt: state.nextAt,
            over: state.over,
        };
    },
    move(state, seat, p, ctx) {
        const qi = Number(p && p.q);
        const c = Number(p && p.choice);
        if (!Number.isInteger(qi) || !Number.isInteger(c) || c < 0 || c > 3) return { error: "Pick an answer." };
        if (state.over || state.phase !== "ask" || qi !== state.index) return { ok: true };
        if (state.locked[seat]) return { error: "You're locked out of this one." };
        state.picks[seat] = c;
        if (c === state.questions[state.index].answer) {
            reveal(state, ctx, seat);
            return { ok: true };
        }
        state.locked[seat] = true;
        if (state.locked[1 - seat]) reveal(state, ctx, null);
        return { ok: true };
    },
    result(state) {
        if (!state.over) return null;
        const [a, b] = state.score;
        if (a === b) return { winner: null, text: "Tied " + a + "-" + b };
        const w = a > b ? 0 : 1;
        return { winner: w, text: (state.score[w] >= WIN ? "First to " + WIN + ", " : "") + state.score[w] + "-" + state.score[1 - w] };
    },
};
