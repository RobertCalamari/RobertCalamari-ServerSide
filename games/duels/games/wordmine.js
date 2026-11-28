// Word Mine: one long word's letters, 90 seconds. Everyone digs out as many real words (3+ letters) as they can,
// using each letter only as often as it appears. Longer words score more, using every letter scores big, and in a
// group a word nobody else found is worth +1. Words stay private until the end, and so does how many there are to find.
// options.timer = false (casual): no clock; it ends once everyone says they're done (or the host ends it).
const { ranked, seats } = require("../rank");
const { TOP, VALID, count, fits, inside } = require("../words");
const READY_MS = 3000;
const PLAY_MS = 90000;
const MIN_WORDS = 25;

const MAIN = `pedestrian leadership atmosphere misfortune orchestral resistance importance discretion signature parliament
enthusiasm specialist astronomer president soundtrack apostrophe mainstream orchestra reputation journalist absolutely
department instrument nightmare universal generation television restaurant helicopter friendship enterprise vegetarian
rectangle landscape magnitude nostalgia passenger staircase triangle playground education university wonderful chemistry
cathedral breakfast adventure newspaper paradise postcard festival hospital ingredient gathering overnight stranger
dictionary yesterday machinery broadcast discovery everything warehouse temptation customer sensation fortunate diameter
compliment background revolution gasoline interface astronomy secretary container cartridge potential chocolate champion
dinosaur waterfall sunflower spaceship carpenter detective lemonade marathon tangerine porcupine pineapple trampoline`
    .split(/\s+/);

const points = (w, len) => (w.length >= 7 ? 8 : [0, 0, 0, 1, 2, 3, 5][w.length]) + (w.length === len ? 5 : 0);

function shuffle(rng, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pickWord(rng) {
    const pool = shuffle(rng, MAIN);
    for (const w of pool) {
        const all = inside(w);
        if (all.length >= MIN_WORDS) return { word: w, all };
    }
}

// everyone's words with unique bonuses, once the dig is over
function tally(state) {
    const n = state.found.length;
    const by = {};
    state.found.forEach((list) => list.forEach((w) => (by[w] = (by[w] || 0) + 1)));
    state.lists = state.found.map((list) => list.map((w) => ({ w, p: points(w, state.word.length), solo: n > 1 && by[w] === 1 })));
    state.final = state.lists.map((l) => l.reduce((t, x) => t + x.p + (x.solo ? 1 : 0), 0));
    state.missed = state.all.filter((w) => !by[w]).sort((a, b) => TOP.has(b) - TOP.has(a) || b.length - a.length || (a < b ? -1 : 1)).slice(0, 12);
    state.phase = "done";
}

const score = (state, s) => state.found[s].reduce((t, w) => t + points(w, state.word.length), 0);

module.exports = {
    id: "wordmine",
    name: "Word Mine",
    kind: "race",
    quick: true,
    players: [1, 10],
    points,
    pickWord,
    options: { timer: [true, false] },
    init({ rng, ctx, options = {}, players = 2 }) {
        const { word, all } = pickWord(rng);
        const now = ctx.now();
        let letters = shuffle(rng, word.split(""));
        if (letters.join("") === word) letters = letters.reverse();
        const timed = options.timer !== false;
        const state = { word, all, letters, phase: "ready", timed, startAt: now + READY_MS, endAt: timed ? now + READY_MS + PLAY_MS : null, found: seats(players).map(() => []), quit: new Array(players).fill(false), lists: null, final: null, missed: null };
        ctx.later(READY_MS, () => (state.phase = "play"));
        if (timed) ctx.later(READY_MS + PLAY_MS, () => state.phase === "play" && tally(state));
        return state;
    },
    view(state, seat) {
        const v = module.exports.tv(state);
        v.me = { words: state.found[seat].slice().reverse(), score: score(state, seat), quit: state.quit[seat] };
        return v;
    },
    tv(state) {
        const done = state.phase === "done";
        return {
            phase: state.phase,
            timed: state.timed,
            startAt: state.startAt,
            endAt: state.endAt,
            letters: state.phase === "ready" ? null : state.letters.map((c) => c.toUpperCase()),
            len: state.word.length,
            possible: done ? state.all.length : null,
            counts: state.found.map((l) => l.length),
            scores: done ? state.final : state.found.map((_, s) => score(state, s)),
            quit: state.quit,
            word: done ? state.word : null,
            lists: done ? state.lists : null,
            missed: done ? state.missed : null,
        };
    },
    move(state, seat, p, ctx) {
        if (state.phase !== "play") return { error: state.phase === "ready" ? "Not yet!" : "Time's up." };
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.act === "end") {
            if (state.timed || !ctx.host) return { error: "Only the host can end it." };
            tally(state);
            return { ok: true };
        }
        if (p.act === "stop") {
            state.quit[seat] = true;
            if (state.quit.every(Boolean)) tally(state);
            return { ok: true };
        }
        if (typeof p.w !== "string" || p.w.length > 20) return { error: "Bad word." };
        const w = p.w.toLowerCase();
        if (!/^[a-z]+$/.test(w)) return { error: "Letters only." };
        if (w.length < 3) return { error: "3 letters or more." };
        if (!fits(w, count(state.word))) return { error: "Not enough letters for that." };
        if (state.found[seat].includes(w)) return { error: "Already got it." };
        if (!VALID.has(w)) return { error: "Not in the dictionary." };
        if (state.quit[seat]) return { error: "You stopped digging." };
        state.found[seat].push(w);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const top = Math.max(...state.final);
        const words = state.found.reduce((t, l) => Math.max(t, l.length), 0);
        const r = ranked(state.final, "high", state.found.length === 1 ? state.final[0] + " points · " + words + " words" : "Top score " + top + " · most words " + words);
        if (state.found.length === 1 && state.timed) r.score = state.final[0];
        return r;
    },
};
