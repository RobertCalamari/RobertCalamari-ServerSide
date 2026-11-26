// Tug of War: both mash. Every tap pulls the rope one notch your way. Drag the marker past your line,
// or be ahead when the 20s whistle blows. Phones send batched tap counts; the server caps the rate.
const START_MS = 3000;
const GAME_MS = 20000;
const TICK_MS = 250;
const LINE = 40;
const MAX_RATE = 15; // taps per second per player
const BURST = 6; // taps a player may bank up (covers batching and network jitter)
const MAX_BATCH = 30;

function refill(state, seat, now) {
    const b = state.bucket[seat];
    b.tokens = Math.min(BURST, b.tokens + ((now - b.at) * MAX_RATE) / 1000);
    b.at = now;
}

function updateRates(state, now) {
    for (const s of [0, 1]) {
        state.recent[s] = state.recent[s].filter((r) => now - r[0] < 1000);
        state.rate[s] = state.recent[s].reduce((a, r) => a + r[1], 0);
    }
}

function finish(state, now, reason) {
    state.phase = "done";
    state.reason = reason;
    state.endedAt = now;
    updateRates(state, now);
}

function tick(state, ctx) {
    ctx.later(TICK_MS, (now) => {
        if (state.phase !== "play") return;
        updateRates(state, now);
        if (now >= state.endAt) finish(state, now, "time");
        else tick(state, ctx);
    });
}

module.exports = {
    id: "tugofwar",
    name: "Tug of War",
    kind: "live",
    quick: true,
    players: [2, 2],
    init({ ctx }) {
        const now = ctx.now();
        const startAt = now + START_MS;
        const state = {
            phase: "play",
            startAt,
            endAt: startAt + GAME_MS,
            pos: 0, // + toward seat 0, - toward seat 1
            pulls: [0, 0],
            rate: [0, 0],
            recent: [[], []],
            bucket: [{ tokens: BURST, at: startAt }, { tokens: BURST, at: startAt }],
            reason: null,
            endedAt: null,
        };
        ctx.later(START_MS, () => tick(state, ctx));
        return state;
    },
    view(state) {
        return {
            phase: state.phase,
            startAt: state.startAt,
            endAt: state.endAt,
            pos: state.pos,
            line: LINE,
            pulls: state.pulls,
            rate: state.rate,
            reason: state.reason,
            maxRate: MAX_RATE,
        };
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object" || !Number.isInteger(p.taps) || p.taps < 1 || p.taps > MAX_BATCH) return { error: "Bad taps." };
        if (state.phase !== "play") return { error: "It's over." };
        const now = ctx.now();
        if (now < state.startAt) return { error: "Not yet!" };
        if (now >= state.endAt) {
            finish(state, now, "time");
            return { ok: true };
        }
        refill(state, seat, now);
        const n = Math.min(p.taps, Math.floor(state.bucket[seat].tokens));
        if (n <= 0) return { ok: true };
        state.bucket[seat].tokens -= n;
        state.pulls[seat] += n;
        state.recent[seat].push([now, n]);
        state.pos = Math.max(-LINE, Math.min(LINE, state.pos + (seat === 0 ? n : -n)));
        updateRates(state, now);
        if (Math.abs(state.pos) >= LINE) finish(state, now, "line");
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        if (state.pos === 0) return { winner: null, text: "Dead even at the whistle" };
        const w = state.pos > 0 ? 0 : 1;
        if (state.reason === "line") return { winner: w, text: "Dragged them over the line" };
        return { winner: w, text: "Ahead by " + Math.abs(state.pos) + " at the whistle" };
    },
};
