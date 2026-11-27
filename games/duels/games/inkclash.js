// Ink Clash: colour words painted in the wrong ink. Tap the INK colour, not the word, as many times as you can in
// 40 seconds. Now and then the card says WORD instead: then tap the colour the word spells. Right = +1, wrong = −1 and
// a short freeze. Everyone gets the same cards.
const { ranked } = require("../rank");
const READY_MS = 3000;
const PLAY_MS = 40000;
const FREEZE_MS = 700;
const CARDS = 400;
const COLORS = ["red", "blue", "green", "yellow"];
const AHEAD = 12;

// card = [word, ink, mode] (mode 0 = tap the ink, 1 = tap the word)
function makeCards(rng) {
    const out = [];
    for (let i = 0; i < CARDS; i++) {
        const word = Math.floor(rng() * 4);
        let ink = Math.floor(rng() * 4);
        if (ink === word && rng() < 0.8) ink = (ink + 1 + Math.floor(rng() * 3)) % 4;
        const mode = i >= 8 && rng() < 0.25 ? 1 : 0;
        out.push([word, ink, mode]);
    }
    return out;
}

const answer = (c) => (c[2] ? c[0] : c[1]);

module.exports = {
    id: "inkclash",
    name: "Ink Clash",
    kind: "race",
    quick: true,
    players: [1, 10],
    COLORS,
    init({ rng, ctx, players = 2 }) {
        const now = ctx.now();
        const zero = () => new Array(players).fill(0);
        const state = { cards: makeCards(rng), phase: "ready", startAt: now + READY_MS, endAt: now + READY_MS + PLAY_MS, pos: zero(), right: zero(), wrong: zero(), score: zero(), streak: zero(), best: zero(), freeze: zero() };
        ctx.later(READY_MS, () => (state.phase = "play"));
        ctx.later(READY_MS + PLAY_MS, () => (state.phase = "done"));
        return state;
    },
    view(state, seat) {
        const v = module.exports.tv(state);
        const p = state.pos[seat];
        v.me = { pos: p, cards: state.phase === "ready" ? [] : state.cards.slice(p, p + AHEAD), freeze: state.freeze[seat], streak: state.streak[seat] };
        return v;
    },
    tv(state) {
        return { phase: state.phase, startAt: state.startAt, endAt: state.endAt, score: state.score, right: state.right, wrong: state.wrong, best: state.best, colors: COLORS };
    },
    move(state, seat, p, ctx) {
        if (state.phase !== "play") return { error: state.phase === "ready" ? "Not yet!" : "Time's up." };
        if (!p || !Number.isInteger(p.i) || !Number.isInteger(p.pick) || p.pick < 0 || p.pick > 3) return { error: "Bad move." };
        if (p.i !== state.pos[seat]) return { ok: true, quiet: true };
        const now = ctx.now();
        if (now < state.freeze[seat] - 100) return { ok: true, quiet: true };
        const card = state.cards[state.pos[seat]];
        if (!card) return { ok: true, quiet: true };
        state.pos[seat]++;
        if (p.pick === answer(card)) {
            state.right[seat]++;
            state.score[seat]++;
            state.streak[seat]++;
            state.best[seat] = Math.max(state.best[seat], state.streak[seat]);
        } else {
            state.wrong[seat]++;
            state.score[seat] = Math.max(0, state.score[seat] - 1);
            state.streak[seat] = 0;
            state.freeze[seat] = now + FREEZE_MS;
        }
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const solo = state.score.length === 1;
        const top = Math.max(...state.score);
        const r = ranked(state.score, "high", solo ? state.score[0] + " points · " + state.right[0] + " right, " + state.wrong[0] + " wrong · best streak " + state.best[0] : "Top score " + top + " · longest streak " + Math.max(...state.best));
        if (solo) r.score = state.score[0];
        return r;
    },
};

module.exports.answer = answer;
