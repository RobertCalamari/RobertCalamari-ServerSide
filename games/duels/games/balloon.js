// Balloon Pump: press your luck. Both pump their own balloon at once and watch the other grow. Every balloon
// has a hidden seeded pop point. Bank to lock your size in; pop and you score 0. Bigger banked balloon takes
// the round; first to 2 rounds (ties replay, 5 rounds max). Unbanked balloons auto-bank when time runs out.
const WIN = 2;
const MAX_ROUNDS = 5;
const COUNT_MS = 2500;
const ROUND_MS = 15000;
const PAUSE_MS = 3200;
const MIN_POP = 6;
const MAX_POP = 40;
const MAX_RATE = 9; // pumps per second
const BURST = 3;

function makePops(rng) {
    const rounds = [];
    for (let r = 0; r < MAX_ROUNDS; r++) {
        rounds.push([0, 1].map(() => MIN_POP + Math.floor(((rng() + rng()) / 2) * (MAX_POP - MIN_POP + 1))));
    }
    return rounds;
}

function startRound(state, ctx) {
    const now = ctx.now();
    state.round++;
    state.phase = "count";
    state.startAt = now + COUNT_MS;
    state.endAt = state.startAt + ROUND_MS;
    state.nextAt = null;
    state.size = [0, 0];
    state.status = ["pump", "pump"];
    state.bankedAt = [null, null];
    state.bucket = [{ tokens: BURST, at: state.startAt }, { tokens: BURST, at: state.startAt }];
    state.roundWinner = null;
    const round = state.round;
    ctx.later(COUNT_MS, () => {
        if (state.round === round && state.phase === "count") state.phase = "play";
    });
    ctx.later(COUNT_MS + ROUND_MS, (t) => {
        if (state.round !== round || state.phase !== "play") return;
        for (const s of [0, 1]) {
            if (state.status[s] === "pump") {
                state.status[s] = "bank";
                state.bankedAt[s] = t;
            }
        }
        endRound(state, ctx);
    });
}

function endRound(state, ctx) {
    state.phase = "result";
    const got = [0, 1].map((s) => (state.status[s] === "bank" ? state.size[s] : 0));
    const w = got[0] === got[1] ? null : got[0] > got[1] ? 0 : 1;
    state.roundWinner = w;
    if (w !== null) state.score[w]++;
    state.history.push({ winner: w, got, pops: state.pops[state.round - 1].slice() });
    const over = state.score[0] >= WIN || state.score[1] >= WIN || state.round >= MAX_ROUNDS;
    state.nextAt = over ? null : ctx.now() + PAUSE_MS;
    const round = state.round;
    ctx.later(PAUSE_MS, () => {
        if (state.round !== round || state.phase !== "result") return;
        if (over) state.phase = "done";
        else startRound(state, ctx);
    });
}

function settle(state, ctx) {
    if (state.status[0] !== "pump" && state.status[1] !== "pump") endRound(state, ctx);
}

module.exports = {
    id: "balloon",
    name: "Balloon Pump",
    kind: "live",
    quick: true,
    init({ rng, ctx }) {
        const state = { round: 0, score: [0, 0], history: [], pops: makePops(rng) };
        startRound(state, ctx);
        return state;
    },
    view(state) {
        const reveal = state.phase === "result" || state.phase === "done";
        return {
            phase: state.phase,
            round: state.round,
            win: WIN,
            maxRounds: MAX_ROUNDS,
            score: state.score,
            history: state.history,
            startAt: state.startAt,
            endAt: state.endAt,
            nextAt: state.nextAt,
            size: state.size,
            status: state.status,
            roundWinner: state.roundWinner,
            maxPop: MAX_POP,
            pops: reveal ? state.pops[state.round - 1] : null,
        };
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object" || (p.act !== "pump" && p.act !== "bank")) return { error: "Pump or bank." };
        if (p.round !== undefined && p.round !== state.round) return { ok: true };
        const now = ctx.now();
        if (state.phase === "count") return { error: "Not yet!" };
        if (state.phase !== "play" || now >= state.endAt) return { ok: true };
        if (state.status[seat] !== "pump") return { ok: true };
        if (p.act === "bank") {
            if (state.size[seat] < 1) return { error: "Pump it first!" };
            state.status[seat] = "bank";
            state.bankedAt[seat] = now;
            settle(state, ctx);
            return { ok: true };
        }
        const b = state.bucket[seat];
        b.tokens = Math.min(BURST, b.tokens + ((now - b.at) * MAX_RATE) / 1000);
        b.at = now;
        if (b.tokens < 1) return { ok: true };
        b.tokens--;
        state.size[seat]++;
        if (state.size[seat] >= state.pops[state.round - 1][seat]) {
            state.status[seat] = "pop";
            settle(state, ctx);
        }
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const [a, b] = state.score;
        if (a === b) return { winner: null, text: "Even at " + a + "-" + b + " after " + state.history.length + " rounds" };
        const w = a > b ? 0 : 1;
        const best = Math.max(...state.history.filter((h) => h.winner === w).map((h) => h.got[w]));
        return { winner: w, text: "Won " + state.score[w] + "-" + state.score[1 - w] + " · biggest balloon " + best };
    },
};
