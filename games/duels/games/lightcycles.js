// Light Cycles: Tron on a 32x40 grid. The server ticks both bikes forward; hit a wall or any trail and you crash.
// Both crash on the same tick = nobody gets the round. First to 2 rounds.
const W = 32;
const H = 40;
const TICK_MS = 110;
const COUNT_MS = 3000;
const PAUSE_MS = 2200;
const WIN = 2;
const MAX_ROUNDS = 5;
const MAX_TICKS = 900;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: "down", down: "up", left: "right", right: "left" };
const STARTS = [
    { x: 11, y: H - 7, dir: "up" },
    { x: W - 12, y: 6, dir: "down" },
];

function startRound(state, ctx) {
    const now = ctx.now();
    state.round++;
    state.phase = "count";
    state.startAt = now + COUNT_MS;
    state.nextAt = null;
    state.tick = 0;
    state.tickAt = state.startAt;
    state.grid = new Array(W * H).fill(-1);
    state.trails = [[], []];
    state.dirs = [STARTS[0].dir, STARTS[1].dir];
    state.queue = [[], []];
    state.crashed = [false, false];
    state.roundWinner = null;
    STARTS.forEach((s, seat) => {
        const i = s.y * W + s.x;
        state.grid[i] = seat;
        state.trails[seat].push(i);
    });
    const round = state.round;
    ctx.later(COUNT_MS, (t) => {
        if (state.round !== round || state.phase !== "count") return;
        state.phase = "play";
        loop(state, ctx, round, t);
    });
}

function loop(state, ctx, round, at) {
    const next = at + TICK_MS;
    ctx.later(Math.max(0, next - ctx.now()), () => {
        if (state.round !== round || state.phase !== "play") return;
        step(state, ctx, next);
        if (state.phase === "play") loop(state, ctx, round, next);
    });
}

function step(state, ctx, at) {
    state.tick++;
    state.tickAt = at;
    const heads = [0, 1].map((seat) => {
        if (state.queue[seat].length) state.dirs[seat] = state.queue[seat].shift();
        const t = state.trails[seat];
        const cur = t[t.length - 1];
        const [dx, dy] = DIRS[state.dirs[seat]];
        const x = (cur % W) + dx;
        const y = Math.floor(cur / W) + dy;
        return x < 0 || y < 0 || x >= W || y >= H ? null : y * W + x;
    });
    const crash = heads.map((h) => h === null || state.grid[h] !== -1);
    if (heads[0] !== null && heads[0] === heads[1]) crash[0] = crash[1] = true;
    heads.forEach((h, seat) => {
        if (crash[seat] || h === null) return;
        state.grid[h] = seat;
        state.trails[seat].push(h);
    });
    state.crashed = crash;
    if (crash[0] || crash[1]) endRound(state, ctx, crash[0] && crash[1] ? null : crash[0] ? 1 : 0, "crash");
    else if (state.tick >= MAX_TICKS) endRound(state, ctx, null, "time");
}

function endRound(state, ctx, winner, reason) {
    state.phase = "crash";
    state.roundWinner = winner;
    state.reason = reason;
    if (winner !== null) state.score[winner]++;
    state.history.push(winner);
    if (state.score[0] >= WIN || state.score[1] >= WIN || state.history.length >= MAX_ROUNDS) {
        state.nextAt = null;
        ctx.later(PAUSE_MS, () => { state.phase = "done"; });
        return;
    }
    state.nextAt = ctx.now() + PAUSE_MS;
    const round = state.round;
    ctx.later(PAUSE_MS, () => {
        if (state.round === round && state.phase === "crash") startRound(state, ctx);
    });
}

module.exports = {
    id: "lightcycles",
    name: "Light Cycles",
    kind: "live",
    quick: true,
    players: [2, 2],
    init({ ctx }) {
        const state = { round: 0, score: [0, 0], history: [], reason: null };
        startRound(state, ctx);
        return state;
    },
    view(state) {
        return {
            w: W,
            h: H,
            phase: state.phase,
            round: state.round,
            score: state.score,
            win: WIN,
            history: state.history,
            startAt: state.startAt,
            nextAt: state.nextAt,
            tick: state.tick,
            tickMs: TICK_MS,
            trails: state.trails,
            dirs: state.dirs,
            crashed: state.crashed,
            roundWinner: state.roundWinner,
            reason: state.reason,
        };
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object" || typeof p.dir !== "string" || !Object.prototype.hasOwnProperty.call(DIRS, p.dir)) return { error: "Bad turn." };
        if (p.round !== undefined && p.round !== state.round) return { ok: true };
        if (state.phase !== "count" && state.phase !== "play") return { ok: true };
        const q = state.queue[seat];
        const last = q.length ? q[q.length - 1] : state.dirs[seat];
        if (q.length >= 2 || p.dir === last || p.dir === OPP[last]) return { ok: true };
        q.push(p.dir);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const [a, b] = state.score;
        if (a === b) return { winner: null, text: "Even at " + a + "-" + b + " after " + state.history.length + " rounds" };
        const w = a > b ? 0 : 1;
        return { winner: w, text: "Last bike riding, " + Math.max(a, b) + "-" + Math.min(a, b) };
    },
};
