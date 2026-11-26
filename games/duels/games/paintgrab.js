// Paint Grab: one shared grid. Drag to paint tiles your color; you can paint over theirs, but a freshly
// painted tile is locked for a moment. Painting is rate limited. Most tiles after 25s wins.
const COLS = 6;
const ROWS = 8;
const TILES = COLS * ROWS;
const START_MS = 3000;
const PLAY_MS = 25000;
const GRACE = 200; // last batch may arrive a bit after the buzzer
const LOCK_MS = 1500;
const RATE = 12; // tiles per second
const BURST = 8;
const MAX_BATCH = 16;

function refill(state, seat, now) {
    const b = state.bucket[seat];
    b.tokens = Math.min(BURST, b.tokens + ((now - b.at) / 1000) * RATE);
    b.at = now;
}

module.exports = {
    id: "paintgrab",
    name: "Paint Grab",
    kind: "live",
    quick: true,
    init({ ctx }) {
        const now = ctx.now();
        const startAt = now + START_MS;
        const endAt = startAt + PLAY_MS;
        const state = {
            phase: "play",
            startAt,
            endAt,
            owner: new Array(TILES).fill(-1),
            lockUntil: new Array(TILES).fill(0),
            counts: [0, 0],
            painted: [0, 0],
            bucket: [{ tokens: BURST, at: startAt }, { tokens: BURST, at: startAt }],
        };
        ctx.later(endAt - now + GRACE, () => {
            state.phase = "done";
        });
        return state;
    },
    view(state) {
        return {
            phase: state.phase,
            cols: COLS,
            rows: ROWS,
            startAt: state.startAt,
            endAt: state.endAt,
            owner: state.owner,
            lockUntil: state.lockUntil,
            counts: state.counts,
            painted: state.painted,
            lockMs: LOCK_MS,
            rate: RATE,
            burst: BURST,
        };
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object" || !Array.isArray(p.tiles)) return { error: "Bad paint." };
        if (p.tiles.length > MAX_BATCH) return { error: "Too many tiles." };
        if (!p.tiles.every((i) => Number.isInteger(i) && i >= 0 && i < TILES)) return { error: "Bad paint." };
        const now = ctx.now();
        if (state.phase !== "play" || now >= state.endAt + GRACE) return { ok: true };
        if (now < state.startAt) return { error: "Not yet!" };
        refill(state, seat, now);
        const b = state.bucket[seat];
        const seen = new Set();
        for (const i of p.tiles) {
            if (seen.has(i)) continue;
            seen.add(i);
            const o = state.owner[i];
            if (o === seat) continue;
            if (o !== -1 && state.lockUntil[i] > now) continue;
            if (b.tokens < 1) break;
            b.tokens--;
            if (o !== -1) state.counts[o]--;
            state.owner[i] = seat;
            state.lockUntil[i] = now + LOCK_MS;
            state.counts[seat]++;
            state.painted[seat]++;
        }
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const [a, b] = state.counts;
        if (a === b) return { winner: null, text: "Tied at " + a + " tiles." };
        const w = a > b ? 0 : 1;
        return { winner: w, text: state.counts[w] + " tiles to " + state.counts[1 - w] };
    },
};
