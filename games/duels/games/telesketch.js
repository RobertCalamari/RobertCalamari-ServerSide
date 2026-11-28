// Telephone Sketch: everyone writes a short phrase, then the chains pass around the table. The next player draws it,
// the next describes that drawing, the next draws the description, and so on (one chain per player, up to 6 steps;
// with 3 players each chain goes round the table twice).
// Nobody sees a chain until the end, when the TV plays every chain back step by step. Tap ❤️ on your favourite steps
// (not your own); most hearts wins. options.timer = false (casual): no clock, the host can call time.
const { ranked, seats } = require("../rank");
const MAX_STEPS = 6;
const MS = { write: 45000, draw: 60000, guess: 35000 };
const HURRY_MS = 10000;
const SHOW = { intro: 2800, text: 4500, draw: 6500, end: 3500 };
const W = 400;
const H = 300;
const MAX_TEXT = 60;
const MAX_STROKE = 300; // points per stroke
const MAX_POINTS = 3000; // points per drawing
const MAX_STROKES = 150;
const INKS = 4;
const SIZES = 3;

const IDEAS = [
    "A cat running a bakery", "Grandma on a skateboard", "A snowman at the beach", "Robot learning to dance",
    "A dragon afraid of mice", "Pizza delivery by rocket", "A very tired octopus", "The moon eating spaghetti",
    "A haunted vending machine", "Penguin on vacation", "A giraffe in a tiny car", "Sandcastle with a moat monster",
    "A wizard stuck in traffic", "Volcano making popcorn", "A shark at the dentist", "Ghost doing laundry",
    "Banana wearing sunglasses", "A cowboy riding a snail", "Cactus giving hugs", "A knight fighting a toaster",
    "Owl reading the news", "Alien at a car wash", "A cloud that rains soup", "Dog playing the drums",
    "Pirate afraid of water", "A frog king on a lily pad", "Breakfast on a roller coaster", "A bear juggling fish",
    "Mermaid in a bathtub", "A lighthouse at a disco", "Unicorn stuck in a tree", "Teapot having a bad day",
];

const kindAt = (k) => (k === 0 ? "write" : k % 2 ? "draw" : "guess");
const chainOf = (state, seat, k) => (seat - k + state.n * 2) % state.n;
const byOf = (state, c, k) => (c + k) % state.n;

function blankEntry(kind) {
    return kind === "draw" ? { strokes: [], points: 0, done: false } : { text: "", done: false };
}

function startStep(state, ctx) {
    state.step++;
    const kind = kindAt(state.step);
    state.phase = kind;
    for (let c = 0; c < state.n; c++) state.chains[c].push({ by: byOf(state, c, state.step), kind: kind === "draw" ? "draw" : "text", ...blankEntry(kind), hearts: [] });
    state.deadline = state.timed ? ctx.now() + MS[kind] : null;
    if (state.timed) timeOut(state, ctx);
}

function timeOut(state, ctx) {
    const step = state.step;
    const at = state.deadline;
    ctx.later(Math.max(0, at - ctx.now()), () => {
        if (state.step === step && state.deadline === at && ["write", "draw", "guess"].includes(state.phase)) endStep(state, ctx);
    });
}

function entryFor(state, seat) {
    return state.chains[chainOf(state, seat, state.step)][state.step];
}

function endStep(state, ctx) {
    for (let c = 0; c < state.n; c++) {
        const e = state.chains[c][state.step];
        e.done = true;
        if (e.kind === "text") {
            e.text = e.text.trim();
            if (!e.text) e.text = state.step === 0 ? state.ideas[e.by] : "(no guess)";
        }
    }
    if (state.step + 1 >= state.steps) return startShow(state, ctx);
    startStep(state, ctx);
}

function startShow(state, ctx) {
    state.phase = "show";
    state.deadline = null;
    state.show = { chain: 0, at: -1 };
    nextShow(state, ctx, SHOW.intro);
}

// one reveal: at = -1 intro card, 0..steps-1 steps, steps = chain wrap-up
function nextShow(state, ctx, ms) {
    const tick = ++state.showTick;
    state.showAt = ctx.now() + ms;
    ctx.later(ms, () => {
        if (state.showTick !== tick || state.phase !== "show") return;
        advance(state, ctx);
    });
}

function advance(state, ctx) {
    const s = state.show;
    if (s.at < state.steps) {
        s.at++;
        if (s.at === state.steps) return nextShow(state, ctx, SHOW.end);
        return nextShow(state, ctx, state.chains[s.chain][s.at].kind === "draw" ? SHOW.draw : SHOW.text);
    }
    if (s.chain + 1 >= state.n) {
        state.phase = "done";
        return;
    }
    state.show = { chain: s.chain + 1, at: -1 };
    nextShow(state, ctx, SHOW.intro);
}

function score(state) {
    const h = new Array(state.n).fill(0);
    state.chains.forEach((ch) => ch.forEach((e) => (h[e.by] += e.hearts.length)));
    return h;
}

const pubEntry = (e) => (e.kind === "draw" ? { by: e.by, kind: e.kind, strokes: e.strokes, hearts: e.hearts } : { by: e.by, kind: e.kind, text: e.text, hearts: e.hearts });

function pub(state) {
    const v = {
        phase: state.phase,
        step: state.step,
        steps: state.steps,
        kind: kindAt(Math.max(0, state.step)),
        timed: state.timed,
        deadline: state.deadline,
        done: state.phase === "show" || state.phase === "done" ? null : state.chains.map((_, s) => entryFor(state, s).done),
        hearts: score(state),
        dims: [W, H],
    };
    if (state.phase === "show") {
        const { chain, at } = state.show;
        v.show = { chain, at, owner: chain, showAt: state.showAt, entries: state.chains[chain].slice(0, Math.max(0, Math.min(at + 1, state.steps))).map(pubEntry) };
    }
    if (state.phase === "done") v.chains = state.chains.map((ch) => ch.map(pubEntry));
    return v;
}

function cleanStroke(p) {
    if (!p || typeof p !== "object") return null;
    const { c, s, pts } = p;
    if (!Number.isInteger(c) || c < 0 || c >= INKS || !Number.isInteger(s) || s < 0 || s >= SIZES) return null;
    if (!Array.isArray(pts) || pts.length < 2 || pts.length % 2 || pts.length > MAX_STROKE * 2) return null;
    for (let i = 0; i < pts.length; i++) {
        const v = pts[i];
        if (!Number.isInteger(v) || v < 0 || v > (i % 2 ? H : W)) return null;
    }
    return { c, s, p: pts };
}

module.exports = {
    id: "telesketch",
    name: "Telephone Sketch",
    kind: "sim",
    quick: false,
    players: [3, 12],
    options: { timer: [true, false] },
    init({ rng, ctx, players = 3, options = {} }) {
        const pool = IDEAS.slice();
        const ideas = seats(players).map(() => pool.splice(Math.floor(rng() * pool.length), 1)[0]);
        const state = { n: players, steps: players === 3 ? 6 : Math.min(players, MAX_STEPS), step: -1, phase: "write", timed: options.timer !== false, deadline: null, chains: seats(players).map(() => []), ideas, show: null, showAt: null, showTick: 0 };
        startStep(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        if (state.phase === "write" || state.phase === "draw" || state.phase === "guess") {
            const c = chainOf(state, seat, state.step);
            const e = state.chains[c][state.step];
            const prev = state.step > 0 ? state.chains[c][state.step - 1] : null;
            v.me = {
                task: state.phase,
                done: e.done,
                text: e.kind === "text" ? e.text : null,
                strokes: e.kind === "draw" ? e.strokes : null,
                points: e.kind === "draw" ? e.points : null,
                prompt: prev ? (prev.kind === "draw" ? { strokes: prev.strokes } : { text: prev.text }) : null,
                idea: state.step === 0 ? state.ideas[seat] : null,
            };
        }
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.act === "heart") {
            if (state.phase !== "show") return { error: "Hearts open when the chains are shown." };
            const { chain, step } = p;
            if (!Number.isInteger(chain) || !Number.isInteger(step) || chain !== state.show.chain || step < 0 || step > state.show.at || step >= state.steps) return { error: "You can only heart what's been shown." };
            const e = state.chains[chain][step];
            if (e.by === seat) return { error: "No hearting your own work." };
            const i = e.hearts.indexOf(seat);
            if (i >= 0) e.hearts.splice(i, 1);
            else e.hearts.push(seat);
            return { ok: true };
        }
        if (p.act === "next") {
            if (state.phase !== "show") return { error: "Nothing to skip." };
            if (!ctx.host) return { error: "Only the host can skip ahead." };
            advance(state, ctx);
            return { ok: true };
        }
        if (p.act === "hurry") {
            if (!["write", "draw", "guess"].includes(state.phase)) return { error: "Nothing to hurry." };
            if (!ctx.host) return { error: "Only the host can call time." };
            if (state.timed && state.deadline - ctx.now() <= HURRY_MS) return { ok: true, quiet: true };
            state.deadline = ctx.now() + HURRY_MS;
            timeOut(state, ctx);
            return { ok: true };
        }
        if (!["write", "draw", "guess"].includes(state.phase)) return { error: "That step is over." };
        const e = entryFor(state, seat);
        if (p.act === "edit") {
            if (!e.done) return { ok: true, quiet: true };
            e.done = false;
            return { ok: true };
        }
        if (e.done) return { error: "You're done for this round. Tap edit to change it." };
        if (e.kind === "text") {
            if (p.act !== "text") return { error: "Type your answer." };
            if (typeof p.text !== "string") return { error: "Write something." };
            const t = p.text.replace(/\s+/g, " ").trim();
            if (!t) return { error: "Write something first." };
            if (t.length > MAX_TEXT) return { error: "Keep it under " + MAX_TEXT + " characters." };
            e.text = t;
            e.done = true;
        } else if (p.act === "stroke") {
            const st = cleanStroke(p);
            if (!st) return { error: "That stroke didn't fit." };
            if (e.strokes.length >= MAX_STROKES || e.points + st.p.length / 2 > MAX_POINTS) return { error: "That's a lot of ink. Undo some or tap done." };
            e.strokes.push(st);
            e.points += st.p.length / 2;
            return { ok: true, quiet: true };
        } else if (p.act === "undo") {
            const st = e.strokes.pop();
            if (st) e.points -= st.p.length / 2;
            return { ok: true, quiet: true };
        } else if (p.act === "clear") {
            e.strokes = [];
            e.points = 0;
            return { ok: true, quiet: true };
        } else if (p.act === "done") {
            if (!e.strokes.length) return { error: "Draw something first." };
            e.done = true;
        } else return { error: "Draw it on the canvas." };
        if (state.chains.every((ch) => ch[state.step].done)) endStep(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const h = score(state);
        const best = Math.max(...h);
        const total = h.reduce((a, b) => a + b, 0);
        return ranked(h, "high", best ? "Most loved: " + best + " heart" + (best === 1 ? "" : "s") + " · " + total + " given across " + state.n + " chains" : "No hearts given · everyone's a winner (or nobody)");
    },
};
