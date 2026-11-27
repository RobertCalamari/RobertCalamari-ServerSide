// Digit Target: four digits and a target number. Build a sum that hits it with + − × ÷ and brackets, using each digit
// at most once; digits next to each other join up (4 then 5 = 45). Five rounds of 60 seconds. Exact = 10 (first exact
// +2), within 1 = 7, within 5 = 5, within 10 = 2. Your closest try counts. One way to hit it is shown after each round.
const { ranked, seats } = require("../rank");
const ROUNDS = 5;
const READY_MS = 3000;
const ASK_MS = 60000;
const REVEAL_MS = 7000;
const RANGES = [[10, 99], [20, 150], [50, 300], [100, 600], [100, 999]];
const OPS = ["+", "-", "*", "/"];
const SHOW = { "*": "×", "/": "÷", "-": "−", "+": "+" };

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a) || 1);
function frac(n, d) {
    if (d < 0) [n, d] = [-n, -d];
    const g = gcd(n, d);
    return [n / g, d / g];
}
function calc(a, op, b) {
    if (op === "+") return frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
    if (op === "-") return frac(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
    if (op === "*") return frac(a[0] * b[0], a[1] * b[1]);
    if (b[0] === 0) return null;
    return frac(a[0] * b[1], a[1] * b[0]);
}

// every value reachable from the digits in each subset (bitmask) → { key: { v: [n, d], e: text, p: precedence } }
function solve(digits) {
    const memo = {};
    const add = (out, v, e, p) => {
        if (!v || Math.abs(v[0]) > 1e6 || v[1] > 1e4) return;
        const k = v[0] + "/" + v[1];
        if (!out[k] || out[k].e.length > e.length) out[k] = { v, e, p };
    };
    function perms(idx) {
        if (idx.length <= 1) return [idx];
        return idx.flatMap((x, i) => perms(idx.filter((_, j) => j !== i)).map((r) => [x, ...r]));
    }
    function R(mask) {
        if (memo[mask]) return memo[mask];
        const out = {};
        const idx = seats(digits.length).filter((i) => mask & (1 << i));
        for (const p of perms(idx)) {
            if (p.length > 1 && digits[p[0]] === 0) continue;
            const s = p.map((i) => digits[i]).join("");
            add(out, [Number(s), 1], s, 3);
        }
        for (let s = (mask - 1) & mask; s > 0; s = (s - 1) & mask) {
            const t = mask ^ s;
            const A = Object.values(R(s));
            const B = Object.values(R(t));
            for (const a of A) for (const b of B) for (const op of OPS) {
                const v = calc(a.v, op, b.v);
                const l = (op === "*" || op === "/") && a.p === 1 ? "(" + a.e + ")" : a.e;
                const r = (op === "-" && b.p === 1) || (op === "*" && b.p === 1) || (op === "/" && b.p <= 2) ? "(" + b.e + ")" : b.e;
                add(out, v, l + " " + SHOW[op] + " " + r, op === "+" || op === "-" ? 1 : 2);
            }
        }
        return (memo[mask] = out);
    }
    const best = {};
    for (let m = 1; m < 1 << digits.length; m++) {
        for (const x of Object.values(R(m))) {
            if (x.v[1] !== 1) continue;
            const k = x.v[0];
            if (!best[k] || best[k].e.length > x.e.length) best[k] = x;
        }
    }
    return best;
}

function makeRound(rng, i) {
    const [lo, hi] = RANGES[i];
    for (;;) {
        const digits = [];
        while (digits.length < 4) {
            const d = Math.floor(rng() * 10);
            if (d === 0 && digits.includes(0)) continue;
            digits.push(d);
        }
        const best = solve(digits);
        // skip targets you can just read off the tiles
        const plain = new Set();
        for (const a of digits) {
            plain.add(a);
            for (const b of digits) plain.add(a * 10 + b);
        }
        const ok = Object.keys(best).map(Number).filter((t) => t >= lo && t <= hi && !plain.has(t));
        if (ok.length < 3) continue;
        const target = ok[Math.floor(rng() * ok.length)];
        return { digits, target, how: best[target].e };
    }
}

// parse the tokens a player sent: d0..d3 (tile index), + - * / ( ). Never eval.
function evaluate(tokens, digits) {
    if (!Array.isArray(tokens) || !tokens.length || tokens.length > 40) return { error: "Build a sum first." };
    const used = new Set();
    for (const t of tokens) {
        if (typeof t !== "string") return { error: "Bad sum." };
        const m = /^d([0-9])$/.exec(t);
        if (m) {
            const i = Number(m[1]);
            if (i >= digits.length) return { error: "Bad sum." };
            if (used.has(i)) return { error: "Each digit once." };
            used.add(i);
        } else if (!["+", "-", "*", "/", "(", ")"].includes(t)) return { error: "Bad sum." };
    }
    let at = 0;
    const peek = () => tokens[at];
    const fail = (msg) => {
        throw new Error(msg);
    };
    function atom() {
        const t = peek();
        if (t === "(") {
            at++;
            const v = expr();
            if (peek() !== ")") fail("Close your bracket.");
            at++;
            return v;
        }
        if (t && t[0] === "d") {
            let s = "";
            while (peek() && peek()[0] === "d") s += digits[Number(tokens[at++].slice(1))];
            if (s.length > 1 && s[0] === "0") fail("No leading zeros.");
            return [Number(s), 1];
        }
        fail(t === undefined ? "Unfinished sum." : "Something's out of place.");
    }
    function term() {
        let v = atom();
        while (peek() === "*" || peek() === "/") {
            const op = tokens[at++];
            const b = atom();
            v = calc(v, op, b);
            if (!v) fail("Can't divide by zero.");
        }
        return v;
    }
    function expr() {
        let v = term();
        while (peek() === "+" || peek() === "-") {
            const op = tokens[at++];
            v = calc(v, op, term());
        }
        return v;
    }
    try {
        const v = expr();
        if (at !== tokens.length) fail("Something's out of place.");
        return { v, used: used.size };
    } catch (e) {
        return { error: e.message };
    }
}

const gap = (v, target) => Math.abs(v[0] / v[1] - target);
const worth = (d) => (d === 0 ? 10 : d <= 1 ? 7 : d <= 5 ? 5 : d <= 10 ? 2 : 0);

function ask(state, ctx) {
    state.phase = "ask";
    state.best = state.score.map(() => null);
    state.first = null;
    state.deadline = ctx.now() + ASK_MS;
    const i = state.index;
    ctx.later(ASK_MS, () => state.index === i && state.phase === "ask" && reveal(state, ctx));
}

function reveal(state, ctx) {
    state.phase = "reveal";
    state.got = state.best.map((b, s) => (b ? worth(b.gap) + (state.first === s ? 2 : 0) : 0));
    state.got.forEach((g, s) => (state.score[s] += g));
    state.deadline = ctx.now() + REVEAL_MS;
    const i = state.index;
    ctx.later(REVEAL_MS, () => {
        if (state.index !== i || state.phase !== "reveal") return;
        if (i + 1 >= ROUNDS) state.phase = "done";
        else {
            state.index++;
            ask(state, ctx);
        }
    });
}

function pub(state) {
    const r = state.rounds[state.index];
    const shown = state.phase === "reveal" || state.phase === "done";
    return {
        phase: state.phase,
        index: state.index,
        total: ROUNDS,
        deadline: state.deadline,
        digits: state.phase === "ready" ? null : r.digits,
        target: state.phase === "ready" ? null : r.target,
        score: state.score,
        in: state.best.map((b) => !!b),
        exact: state.best.map((b) => !!b && b.gap === 0),
        first: state.first,
        how: shown ? r.how : null,
        tries: shown ? state.best.map((b) => b && { e: b.e, v: b.v }) : null,
        got: shown ? state.got : null,
    };
}

module.exports = {
    id: "digittarget",
    name: "Digit Target",
    kind: "live",
    quick: true,
    players: [1, 10],
    solve,
    evaluate,
    init({ rng, ctx, players = 2 }) {
        const rounds = seats(ROUNDS).map((i) => makeRound(rng, i));
        const state = { rounds, index: 0, phase: "ready", best: new Array(players).fill(null), first: null, got: null, score: new Array(players).fill(0), deadline: ctx.now() + READY_MS };
        ctx.later(READY_MS, () => ask(state, ctx));
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.mine = state.best[seat];
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object" || p.q !== state.index) return { error: "Bad move." };
        if (state.phase !== "ask") return { error: "Round's over." };
        const r = state.rounds[state.index];
        const res = evaluate(p.tokens, r.digits);
        if (res.error) return { error: res.error };
        const g = gap(res.v, r.target);
        const prev = state.best[seat];
        if (prev && prev.gap === 0) return { error: "You already hit it!" };
        const e = p.tokens.map((t) => (t[0] === "d" ? r.digits[Number(t.slice(1))] : SHOW[t] || t)).join(" ").replace(/(\d) (?=\d)/g, "$1").replace(/\( /g, "(").replace(/ \)/g, ")");
        if (!prev || g < prev.gap) state.best[seat] = { e, v: res.v, gap: Math.round(g * 1000) / 1000 };
        if (g === 0 && state.first === null) state.first = seat;
        if (state.best.every((b) => b && b.gap === 0)) reveal(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const top = Math.max(...state.score);
        const solo = state.score.length === 1;
        const r = ranked(state.score, "high", solo ? state.score[0] + " points from " + ROUNDS + " targets" : "Top score " + top + " from " + ROUNDS + " targets");
        if (solo) r.score = state.score[0];
        return r;
    },
};
