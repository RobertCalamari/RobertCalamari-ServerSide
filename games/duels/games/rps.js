// Rock Paper Scissors: both pick in secret (10s), reveal together, ties replay. First to 3.
const PICKS = ["rock", "paper", "scissors"];
const BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };
const WIN = 3;
const PICK_MS = 10000;
const REVEAL_MS = 3800;

function startRound(state, ctx, extra) {
    state.roundId++;
    state.phase = "pick";
    state.picks = [null, null];
    state.auto = [false, false];
    state.deadline = ctx.now() + PICK_MS + (extra || 0);
    const id = state.roundId;
    ctx.later(state.deadline - ctx.now(), () => {
        if (state.roundId !== id || state.phase !== "pick") return;
        for (const s of [0, 1]) {
            if (state.picks[s] === null) {
                state.picks[s] = PICKS[Math.floor(ctx.rng() * 3)];
                state.auto[s] = true;
            }
        }
        reveal(state, ctx);
    });
}

function reveal(state, ctx) {
    const [a, b] = state.picks;
    const winner = a === b ? null : BEATS[a] === b ? 0 : 1;
    if (winner !== null) state.score[winner]++;
    state.phase = "reveal";
    state.revealAt = ctx.now();
    state.last = { round: state.roundId, picks: [a, b], auto: state.auto.slice(), winner };
    state.history.push({ picks: [a, b], winner });
    const id = state.roundId;
    ctx.later(REVEAL_MS, () => {
        if (state.roundId !== id) return;
        if (winner !== null && state.score[winner] >= WIN) state.over = true;
        else startRound(state, ctx);
    });
}

module.exports = {
    id: "rps",
    name: "Rock Paper Scissors",
    kind: "sim",
    quick: true,
    init({ ctx }) {
        const state = { score: [0, 0], roundId: 0, phase: "pick", picks: [null, null], auto: [false, false], deadline: 0, revealAt: 0, last: null, history: [], over: false };
        startRound(state, ctx, 1000);
        return state;
    },
    view(state, seat) {
        const picking = state.phase === "pick";
        return {
            round: state.roundId,
            phase: state.phase,
            score: state.score,
            deadline: state.deadline,
            revealAt: state.revealAt,
            myPick: state.picks[seat],
            theyPicked: state.picks[1 - seat] !== null,
            last: picking ? null : state.last,
            history: picking ? state.history : state.history.slice(0, -1),
            over: state.over,
        };
    },
    move(state, seat, p, ctx) {
        if (state.phase !== "pick" || state.over) return { error: "Hold on, revealing." };
        if (!p || !PICKS.includes(p.pick)) return { error: "Pick rock, paper or scissors." };
        if (state.picks[seat] !== null) return { error: "You already picked." };
        state.picks[seat] = p.pick;
        if (state.picks[1 - seat] !== null) reveal(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (!state.over) return null;
        const w = state.score[0] > state.score[1] ? 0 : 1;
        const last = state.last;
        const how = last ? last.picks[w].charAt(0).toUpperCase() + last.picks[w].slice(1) + " beats " + last.picks[1 - w] : "";
        return { winner: w, text: how + " · " + state.score[w] + "-" + state.score[1 - w] };
    },
};
