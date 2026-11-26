// Quick Draw: wait for DRAW!, first tap wins the round. Tapping early is a false start and loses it.
// The server judges by when each tap arrives. First to 3 rounds.
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
    state.score[winner]++;
    state.history.push({ winner, reason, ms });
    if (state.score[winner] >= WIN) ctx.later(1800, () => { state.over = true; });
    else ctx.later(PAUSE, () => startRound(state, ctx));
}

module.exports = {
    id: "reaction",
    name: "Quick Draw",
    kind: "live",
    quick: true,
    init({ ctx }) {
        const state = { score: [0, 0], roundId: 0, phase: "wait", goAt: 0, roundWinner: null, reason: null, ms: null, history: [], over: false };
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
            over: state.over,
        };
    },
    move(state, seat, p, ctx) {
        if (!p || p.tap !== true) return { error: "Just tap." };
        if (state.over || state.phase === "done") return { ok: true };
        if (p.round !== undefined && p.round !== state.roundId) return { ok: true };
        const now = ctx.now();
        if (now < state.goAt) endRound(state, ctx, 1 - seat, "false", null);
        else endRound(state, ctx, seat, "fast", now - state.goAt);
        return { ok: true };
    },
    result(state) {
        if (!state.over) return null;
        const w = state.score[0] > state.score[1] ? 0 : 1;
        const times = state.history.filter((h) => h.winner === w && h.ms !== null).map((h) => h.ms);
        const best = times.length ? " · best " + Math.min(...times) + " ms" : "";
        return { winner: w, text: "Quickest draw, " + state.score[w] + "-" + state.score[1 - w] + best };
    },
};
