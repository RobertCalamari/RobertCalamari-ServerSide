// Group Mind: everyone gets the same prompt ("Name a fruit") and secretly types one answer. Answers are matched
// (case, spacing, plurals and "the" don't matter). You score a point for everyone who matched you. Anyone whose answer
// matched nobody drinks; if the whole room matched, everyone gives out a sip. Eight prompts; most points wins.
// options.timer = false (casual): no clock, the round ends when everyone is in or the host calls time.
const { ranked, seats } = require("../rank");
const ROUNDS = 8;
const COUNT_MS = 3000;
const ASK_MS = 30000;
const HURRY_MS = 8000;
const REVEAL_MS = 9000;
const MAX = 30;

const PROMPTS = [
    "Name a fruit", "Name a pizza topping", "Name a color", "Name a breakfast food", "Name a farm animal", "Name a sport",
    "Name a superhero", "Name a Disney movie", "Name a type of dog", "Name a vegetable", "Name an ice cream flavor",
    "Name a fast food chain", "Name a planet", "Name a board game", "Name a candy bar", "Name a holiday",
    "Name something in a fridge", "Name something at the beach", "Name a sea creature", "Name a cocktail",
    "Name a beer brand", "Name a type of cheese", "Name something you take camping", "Name a musical instrument",
    "Name a kitchen appliance", "Name a type of shoe", "Name a social media app", "Name a famous wizard",
    "Name a cartoon character", "Name a dance move", "Name a body part", "Name a type of tree", "Name a bird",
    "Name a pasta shape", "Name a soda", "Name a US state", "Name a country in Europe", "Name a city with a beach",
    "Name a reason to be late", "Name something with wheels", "Name something that's yellow", "Name something round",
    "Name something cold", "Name something that's sticky", "Name something you find in a purse", "Name a bad smell",
    "Name a scary animal", "Name a type of weather", "Name something at a wedding", "Name something at a birthday party",
    "Name a school subject", "Name a job that pays well", "Name a job nobody wants", "Name a Halloween costume",
    "Name a Christmas song", "Name a car brand", "Name a phone brand", "Name a video game", "Name a TV sitcom",
    "Name a horror movie villain", "Name a famous pirate", "Name a fairy tale", "Name something a dog chews",
    "Name a sandwich", "Name a hangover cure", "Name a romantic movie", "Name something in a bathroom",
    "Name something you plug in", "Name a gym exercise", "Name a famous painter", "Name a magic trick",
    "Name something that flies", "Name a type of hat", "Name a thing you lose a lot", "Name a type of bread",
    "Name a cereal", "Name a chip flavor", "Name a sauce", "Name a spice", "Name a nut", "Name a dessert",
    "Name something you do on vacation", "Name something on a cruise ship", "Name a thing in a hospital",
    "Name a type of boat", "Name a card game", "Name a famous band", "Name something in a toolbox",
    "Name a word that rhymes with cat", "Name a word that rhymes with fun", "Name a three letter word",
    "Name a number between 1 and 10", "Name a day of the week", "Name a month", "Name a zodiac sign",
    "Name a Greek god", "Name a dinosaur", "Name something green", "Name something red", "Name something blue",
    "Name something you drink hot", "Name a thing at a bar", "Name a drinking game", "Name a type of liquor",
    "Name a wine", "Name something that's fast", "Name something that's slow", "Name something heavy",
    "Name something soft", "Name something sharp", "Name something loud", "Name a smell you love",
    "Name a thing you say when you're drunk", "Name an excuse to leave a party", "Name a first date spot",
    "Name a celebrity couple", "Name a famous Taylor", "Name a famous Chris", "Name a famous Michael",
    "Name a Pixar movie", "Name a Marvel hero", "Name a Star Wars character", "Name a Harry Potter character",
    "Name a Pokemon", "Name a Mario character", "Name an animal with stripes", "Name an animal with a long neck",
    "Name a bug", "Name a reptile", "Name a flower", "Name a gemstone", "Name a metal", "Name a fabric",
    "Name something you find in a desk", "Name something at the airport", "Name a store at the mall",
    "Name something you'd see at a zoo", "Name something at a carnival", "Name a ride at a theme park",
    "Name a breakfast drink", "Name a midnight snack", "Name a pet name for a partner", "Name a reason to cry",
    "Name something you'd never share", "Name a thing that's always late", "Name a famous ship", "Name a sea",
    "Name a mountain", "Name a river", "Name a language", "Name a currency",
];

// matching key: lower case, letters and digits only, no leading "the/a/an", simple plurals folded, no spaces
function key(raw) {
    let s = String(raw).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    s = s.replace(/^(the|a|an) /, "");
    s = s
        .split(" ")
        .map((w) => (w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 4 && /(ches|shes|xes|sses)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
        .join("");
    return s;
}

function startRound(state, ctx) {
    state.round++;
    state.phase = "count";
    state.answers = seats(state.n).map(() => null);
    state.last = null;
    const run = ++state.run;
    const now = ctx.now();
    state.deadline = now + COUNT_MS;
    ctx.later(COUNT_MS, () => {
        if (state.run !== run) return;
        state.phase = "ask";
        state.deadline = state.timed ? ctx.now() + ASK_MS : null;
        if (state.timed) arm(state, ctx);
    });
}

function arm(state, ctx) {
    const run = state.run;
    const tick = ++state.tick;
    ctx.later(Math.max(0, state.deadline - ctx.now()), () => state.run === run && state.tick === tick && state.phase === "ask" && reveal(state, ctx));
}

function reveal(state, ctx) {
    const groups = new Map();
    seats(state.n).forEach((s) => {
        const a = state.answers[s];
        if (!a) return;
        const k = key(a) || a.toLowerCase();
        if (!groups.has(k)) groups.set(k, { label: a, seats: [] });
        groups.get(k).seats.push(s);
    });
    const list = [...groups.values()].sort((a, b) => b.seats.length - a.seats.length);
    const got = seats(state.n).map(() => 0);
    list.forEach((g) => g.seats.forEach((s) => (got[s] = g.seats.length - 1)));
    got.forEach((g, s) => (state.score[s] += g));
    const alone = seats(state.n).filter((s) => state.n > 1 && got[s] === 0);
    const all = state.n > 1 && list.length === 1 && list[0].seats.length === state.n;
    state.last = { groups: list, got, alone, all };
    state.phase = "reveal";
    state.deadline = ctx.now() + REVEAL_MS;
    const run = ++state.run;
    ctx.later(REVEAL_MS, () => state.run === run && next(state, ctx));
}

function next(state, ctx) {
    if (state.round + 1 >= ROUNDS) {
        state.phase = "done";
        state.deadline = null;
        state.run++;
    } else startRound(state, ctx);
}

function pub(state) {
    return {
        phase: state.phase,
        round: state.round,
        rounds: ROUNDS,
        prompt: state.phase === "count" ? null : state.prompts[state.round],
        deadline: state.deadline,
        timed: state.timed,
        in: state.answers.map((a) => a !== null),
        score: state.score,
        last: state.phase === "reveal" || state.phase === "done" ? state.last : null,
    };
}

module.exports = {
    id: "groupmind",
    name: "Group Mind",
    kind: "sim",
    quick: true,
    players: [2, 12],
    options: { timer: [true, false] },
    init({ rng, ctx, players = 3, options = {} }) {
        const pool = PROMPTS.slice();
        const prompts = seats(ROUNDS).map(() => pool.splice(Math.floor(rng() * pool.length), 1)[0]);
        const state = { n: players, prompts, round: -1, run: 0, tick: 0, phase: "count", timed: options.timer !== false, answers: [], score: new Array(players).fill(0), last: null, deadline: null };
        startRound(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.mine = state.answers[seat];
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.act === "next") {
            if (!ctx.host) return { error: "Only the host can move on." };
            if (state.phase !== "reveal") return { ok: true, quiet: true };
            next(state, ctx);
            return { ok: true };
        }
        if (p.act === "hurry") {
            if (!ctx.host) return { error: "Only the host can call time." };
            if (state.phase !== "ask") return { ok: true, quiet: true };
            if (state.deadline && state.deadline - ctx.now() <= HURRY_MS) return { ok: true, quiet: true };
            state.deadline = ctx.now() + HURRY_MS;
            arm(state, ctx);
            return { ok: true };
        }
        if (p.act !== "answer") return { error: "Bad move." };
        if (state.phase !== "ask") return { error: state.phase === "count" ? "Not yet!" : "Answers are locked." };
        if (typeof p.text !== "string") return { error: "Type an answer." };
        const t = p.text.replace(/\s+/g, " ").trim();
        if (!t) return { error: "Type an answer." };
        if (t.length > MAX) return { error: "Keep it under " + MAX + " characters." };
        state.answers[seat] = t;
        if (state.answers.every((a) => a !== null)) reveal(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const best = Math.max(...state.score);
        const r = ranked(state.score, "high", best ? "Most in sync: " + best + " match" + (best === 1 ? "" : "es") + " over " + ROUNDS + " prompts" : "Nobody matched anyone. Impressive.");
        if (state.n === 1) r.score = state.score[0];
        return r;
    },
    key,
};
