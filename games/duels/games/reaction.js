// Quick Draw: wait for DRAW!, first tap wins the round. Tapping early is a false start and loses it.
// The server judges by when each tap arrives. First to 3 rounds. With 3+ players a false start just knocks
// you out of that round (everyone jumping ends it with no point).
const { ranked } = require("../rank");
const WIN = 3;
const PAUSE = 2600;
const TOO_SLOW = 6000;

function startRound(state, ctx, extra) {
    const now = ctx.now();
    state.roundId++;
    state.phase = "wait";
    state.goAt = now + (extra || 0) + 1500 + Math.floor(ctx.rng() * 3500);
    state.roundWinner = null;
    state.reason = null;
    state.ms = null;
    state.out = state.score.map(() => false);
    const id = state.roundId;
    ctx.later(state.goAt - now, () => {
        if (state.roundId !== id || state.phase !== "wait") return;
        state.phase = "draw";
        ctx.later(TOO_SLOW, () => {
            if (state.roundId !== id || state.phase !== "draw") return;
            state.phase = "done";
            state.reason = "slow";
            ctx.later(PAUSE, () => startRound(state, ctx));
        });
    });
}

function endRound(state, ctx, winner, reason, ms) {
    state.phase = "done";
    state.roundWinner = winner;
    state.reason = reason;
    state.ms = ms;
    if (winner !== null) state.score[winner]++;
    state.history.push({ winner, reason, ms });
    if (winner !== null && state.score[winner] >= WIN) ctx.later(1800, () => { state.over = true; });
    else ctx.later(PAUSE, () => startRound(state, ctx));
}

module.exports = {
    id: "reaction",
    name: "Quick Draw",
    kind: "live",
    quick: true,
    players: [2, 10],
    init({ ctx, players = 2 }) {
        const state = { score: new Array(players).fill(0), out: [], roundId: 0, phase: "wait", goAt: 0, roundWinner: null, reason: null, ms: null, history: [], over: false };
        startRound(state, ctx, 1500);
        return state;
    },
    view(state) {
        return {
            round: state.roundId,
            phase: state.phase,
            score: state.score,
            goAt: state.phase === "wait" ? null : state.goAt,
            roundWinner: state.roundWinner,
            reason: state.reason,
            ms: state.ms,
            history: state.history,
            out: state.out,
            over: state.over,
        };
    },
    tv(state) {
        const head = { wait: "Wait for it…", draw: "DRAW!", done: state.roundWinner === null ? (state.reason === "slow" ? "Too slow!" : "Everyone jumped!") : "Got it" + (state.ms !== null ? " in " + state.ms + " ms" : "") };
        return { headline: head[state.phase], scores: state.score, status: state.score.map((x, s) => (state.out[s] ? "False start" : state.phase === "done" && state.roundWinner === s ? "Round!" : null)), win: WIN };
    },
    move(state, seat, p, ctx) {
        if (!p || p.tap !== true) return { error: "Just tap." };
        if (state.over || state.phase === "done") return { ok: true };
        if (p.round !== undefined && p.round !== state.roundId) return { ok: true };
        if (state.out[seat]) return { ok: true };
        const now = ctx.now();
        const n = state.score.length;
        if (now >= state.goAt) endRound(state, ctx, seat, "fast", now - state.goAt);
        else if (n === 2) endRound(state, ctx, 1 - seat, "false", null);
        else {
            state.out[seat] = true;
            if (state.out.every(Boolean)) endRound(state, ctx, null, "false", null);
        }
        return { ok: true };
    },
    result(state) {
        if (!state.over) return null;
        if (state.score.length > 2) {
            const r = ranked(state.score, "high");
            const times = state.history.filter((h) => h.winner === r.winner && h.ms !== null).map((h) => h.ms);
            r.text = "First to " + WIN + (times.length ? " · best " + Math.min(...times) + " ms" : "");
            return r;
        }
        const w = state.score[0] > state.score[1] ? 0 : 1;
        const times = state.history.filter((h) => h.winner === w && h.ms !== null).map((h) => h.ms);
        const best = times.length ? " · best " + Math.min(...times) + " ms" : "";
        return { winner: w, text: "Quickest draw, " + state.score[w] + "-" + state.score[1 - w] + best };
    },
};
