// Last One Standing: everyone answers the same multiple-choice question at once. Wrong or no answer and you're out,
// unless everyone still in gets it wrong (then nobody is). Questions get harder; last one left wins. After 20 questions
// whoever's still in with the most right wins. Knocked-out players keep answering for a ghost score.
const { ranked, seats } = require("../rank");
const BANK = require("../lastone/questions");
const MAX = 20;
const READY_MS = 4000;
const REVEAL_MS = 4500;
const GRACE_MS = 2500;
const CATS = { g: "General knowledge", s: "Science", w: "Geography", p: "Pop culture", f: "Food", o: "Sports", h: "History" };
const tierOf = (i) => (i < 4 ? 0 : i < 9 ? 1 : i < 14 ? 2 : 3);
const askMs = (i) => (tierOf(i) < 2 ? 15000 : 12000);

function pickQuestions(rng) {
    const used = BANK.map(() => new Set());
    const out = [];
    let last = null;
    for (let i = 0; i < MAX; i++) {
        const t = tierOf(i);
        let pool = BANK[t].map((q, k) => k).filter((k) => !used[t].has(k) && BANK[t][k][0] !== last);
        if (!pool.length) pool = BANK[t].map((q, k) => k).filter((k) => !used[t].has(k));
        const k = pool[Math.floor(rng() * pool.length)];
        used[t].add(k);
        const [cat, text, ans, ...wrong] = BANK[t][k];
        const choices = [ans, ...wrong];
        for (let j = 3; j > 0; j--) {
            const r = Math.floor(rng() * (j + 1));
            [choices[j], choices[r]] = [choices[r], choices[j]];
        }
        out.push({ cat, text, choices, answer: choices.indexOf(ans), tier: t });
        last = cat;
    }
    return out;
}

function ask(state, ctx) {
    state.phase = "ask";
    state.picks = state.alive.map(() => null);
    state.last = null;
    state.askAt = ctx.now();
    state.deadline = state.askAt + askMs(state.index);
    arm(state, ctx);
}

// one live timer per question; moving the deadline re-arms it
function arm(state, ctx) {
    const tick = ++state.tick;
    ctx.later(Math.max(0, state.deadline - ctx.now()), () => state.tick === tick && state.phase === "ask" && reveal(state, ctx));
}

function reveal(state, ctx) {
    const q = state.qs[state.index];
    const n = state.alive.length;
    const good = seats(n).map((s) => state.picks[s] === q.answer);
    const live = seats(n).filter((s) => state.alive[s]);
    const saved = live.length > 1 && live.every((s) => !good[s]);
    const out = saved ? [] : live.filter((s) => !good[s]);
    live.forEach((s) => good[s] && state.right[s]++);
    seats(n).forEach((s) => !state.alive[s] && good[s] && state.ghost[s]++);
    out.forEach((s) => {
        state.alive[s] = false;
        state.outAt[s] = state.index;
    });
    state.phase = "reveal";
    state.last = { answer: q.answer, picks: state.picks.slice(), out, saved };
    state.deadline = ctx.now() + REVEAL_MS;
    const i = state.index;
    ctx.later(REVEAL_MS, () => {
        if (state.index !== i || state.phase !== "reveal") return;
        if (state.alive.filter(Boolean).length <= 1 || i + 1 >= MAX) state.phase = "done";
        else {
            state.index++;
            ask(state, ctx);
        }
    });
}

function pub(state) {
    const q = state.qs[state.index];
    const live = state.phase === "ask" || state.phase === "reveal";
    return {
        phase: state.phase,
        index: state.index,
        total: MAX,
        tier: q.tier,
        cat: live ? CATS[q.cat] : null,
        text: live ? q.text : null,
        choices: live ? q.choices : null,
        deadline: state.deadline,
        alive: state.alive,
        outAt: state.outAt,
        right: state.right,
        ghost: state.ghost,
        in: state.phase === "ask" ? state.picks.map((p) => p !== null) : state.alive.map(() => false),
        last: state.phase === "reveal" || state.phase === "done" ? state.last : null,
    };
}

module.exports = {
    id: "lastone",
    name: "Last One Standing",
    kind: "live",
    quick: true,
    players: [2, 16],
    init({ rng, ctx, players = 2 }) {
        const state = {
            qs: pickQuestions(rng), index: 0, phase: "ready", tick: 0, picks: new Array(players).fill(null), last: null,
            alive: new Array(players).fill(true), outAt: new Array(players).fill(null), right: new Array(players).fill(0), ghost: new Array(players).fill(0),
            deadline: ctx.now() + READY_MS,
        };
        ctx.later(READY_MS, () => state.phase === "ready" && ask(state, ctx));
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.mine = state.phase === "ask" || state.phase === "reveal" ? state.picks[seat] : null;
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        const c = p && p.choice;
        if (!p || !Number.isInteger(c) || c < 0 || c > 3) return { error: "Pick an answer." };
        if (state.phase !== "ask" || p.q !== state.index) return { ok: true, quiet: true };
        if (state.picks[seat] !== null) return { error: "Locked in!" };
        state.picks[seat] = c;
        const n = state.alive.length;
        if (seats(n).every((s) => state.picks[s] !== null)) reveal(state, ctx);
        else if (seats(n).every((s) => !state.alive[s] || state.picks[s] !== null) && state.deadline - ctx.now() > GRACE_MS) {
            state.deadline = ctx.now() + GRACE_MS;
            arm(state, ctx);
        }
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const n = state.alive.length;
        const live = seats(n).filter((s) => state.alive[s]);
        const asked = state.index + 1;
        const vals = seats(n).map((s) => (state.alive[s] ? 1e6 + state.right[s] * 1000 : state.outAt[s] * 1000 + state.ghost[s]));
        const text = live.length === 1 ? "Last one standing after " + asked + " questions" : live.length ? live.length + " still standing after " + MAX + " · most right wins" : "Everyone's out";
        return ranked(vals, "high", text);
    },
};
