// Helper for "race" games: every player gets the same seeded challenge, plays it on their own phone,
// and sends in a score. Higher (or lower) score wins. Also handles a countdown and a time limit.
//   makeRace({ id, name, quick, players, seconds, better: "high"|"low", setup(rng, options) -> puzzle data })
// The client gets { seed, puzzle, startAt, endAt, myScore, theyFinished (everyone else), theirScore (2 players),
// finished: [bool per seat], scores: [per seat, others null until done], done }.
const { ranked, seats } = require("./rank");

module.exports = function makeRace({ id, name, quick = true, players = [2, 10], seconds = 45, better = "high", setup, validate, describe }) {
    const COUNTDOWN = 3500;
    return {
        id,
        name,
        kind: "race",
        quick,
        players,
        init({ seed, rng, options, ctx, players: n = 2 }) {
            const now = ctx.now();
            const state = {
                seed,
                puzzle: setup ? setup(rng, options || {}) : null,
                startAt: now + COUNTDOWN,
                endAt: now + COUNTDOWN + seconds * 1000,
                scores: new Array(n).fill(null),
                timeUp: false,
            };
            ctx.later(COUNTDOWN + seconds * 1000 + 1500, () => {
                state.timeUp = true;
            });
            return state;
        },
        view(state, seat) {
            const done = state.timeUp || state.scores.every((x) => x !== null);
            const n = state.scores.length;
            return {
                seed: state.seed,
                puzzle: state.puzzle,
                startAt: state.startAt,
                endAt: state.endAt,
                myScore: state.scores[seat],
                theyFinished: state.scores.every((x, s) => s === seat || x !== null),
                theirScore: done && n === 2 ? state.scores[1 - seat] : null,
                finished: state.scores.map((x) => x !== null),
                scores: state.scores.map((x, s) => (done || s === seat ? x : null)),
                done,
            };
        },
        tv(state) {
            const fmt = describe || ((x) => String(x));
            const done = state.timeUp || state.scores.every((x) => x !== null);
            return { headline: name, endAt: state.endAt, startAt: state.startAt, status: state.scores.map((x) => (x === null ? "Playing…" : done ? fmt(x) : "Finished")) };
        },
        move(state, seat, payload, ctx) {
            if (state.scores[seat] !== null) return { error: "You already finished." };
            if (ctx.now() < state.startAt - 500) return { error: "Not started yet." };
            const score = Number(payload.score);
            if (!Number.isFinite(score) || score < 0 || score > 1e7) return { error: "Bad score." };
            if (validate && !validate(state.puzzle, score, payload)) return { error: "That score doesn't add up." };
            state.scores[seat] = Math.round(score * 100) / 100;
            return { ok: true };
        },
        result(state) {
            const fmt = describe || ((s) => String(s));
            if (state.scores.length > 2) {
                if (!state.timeUp && state.scores.some((x) => x === null)) return null;
                const got = seats(state.scores.length).filter((s) => state.scores[s] !== null);
                if (!got.length) return { winner: null, places: state.scores.map(() => 1), text: "Nobody finished." };
                const r = ranked(state.scores, better);
                const best = got.map((s) => state.scores[s]).sort((x, y) => (better === "high" ? y - x : x - y))[0];
                r.text = (r.winner === null ? "Tied for first at " : "Winning score: ") + fmt(best);
                return r;
            }
            const [a, b] = state.scores;
            if (!state.timeUp && (a === null || b === null)) return null;
            if (a === null && b === null) return { winner: null, text: "Nobody finished." };
            if (a === null) return { winner: 1, text: "Only one player finished: " + fmt(b) };
            if (b === null) return { winner: 0, text: "Only one player finished: " + fmt(a) };
            if (a === b) return { winner: null, text: "Tied at " + fmt(a) };
            const w = better === "high" ? (a > b ? 0 : 1) : a < b ? 0 : 1;
            return { winner: w, text: fmt(a) + " vs " + fmt(b) };
        },
    };
};
