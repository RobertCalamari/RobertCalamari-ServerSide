// Helper for "race" games: both players get the same seeded challenge, play it on their own phone,
// and send in a score. Higher (or lower) score wins. Also handles a countdown and a time limit.
//   makeRace({ id, name, quick, seconds, better: "high"|"low", setup(rng, options) -> puzzle data })
// The client gets { seed, puzzle, startAt, endAt, myScore, theirScore (only after both finish or time is up), done }.
module.exports = function makeRace({ id, name, quick = true, seconds = 45, better = "high", setup, validate, describe }) {
    const COUNTDOWN = 3500;
    return {
        id,
        name,
        kind: "race",
        quick,
        init({ seed, rng, options, ctx }) {
            const now = ctx.now();
            const state = {
                seed,
                puzzle: setup ? setup(rng, options || {}) : null,
                startAt: now + COUNTDOWN,
                endAt: now + COUNTDOWN + seconds * 1000,
                scores: [null, null],
                timeUp: false,
            };
            ctx.later(COUNTDOWN + seconds * 1000 + 1500, () => {
                state.timeUp = true;
            });
            return state;
        },
        view(state, seat) {
            const done = state.timeUp || (state.scores[0] !== null && state.scores[1] !== null);
            return {
                seed: state.seed,
                puzzle: state.puzzle,
                startAt: state.startAt,
                endAt: state.endAt,
                myScore: state.scores[seat],
                theyFinished: state.scores[1 - seat] !== null,
                theirScore: done ? state.scores[1 - seat] : null,
                done,
            };
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
            const [a, b] = state.scores;
            if (!state.timeUp && (a === null || b === null)) return null;
            const fmt = describe || ((s) => String(s));
            if (a === null && b === null) return { winner: null, text: "Nobody finished." };
            if (a === null) return { winner: 1, text: "Only one player finished: " + fmt(b) };
            if (b === null) return { winner: 0, text: "Only one player finished: " + fmt(a) };
            if (a === b) return { winner: null, text: "Tied at " + fmt(a) };
            const w = better === "high" ? (a > b ? 0 : 1) : a < b ? 0 : 1;
            return { winner: w, text: fmt(a) + " vs " + fmt(b) };
        },
    };
};
