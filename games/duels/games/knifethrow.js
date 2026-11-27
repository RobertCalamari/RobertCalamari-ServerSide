// Both players throw at the SAME spinning log from opposite sides: seat 0 from below, seat 1 from above.
// Its angle is a pure function of time, so phones draw the same rotation and the server judges each throw at the moment it lands.
// Knife angles are log-relative (canvas convention, y down): seat 0 lands at PI/2 - rot, seat 1 at -PI/2 - rot.
const LOGS = 5;
const GAP = 0.2; // radians: closer than this to another knife = bounce off
const FLIGHT = 110; // ms from tap to impact
const LATE = 400; // how far back a throwAt may be
const MIN_GAP_MS = 180; // per player between throws
const START_MS = 3500;
const BREAK_MS = 2200;
const LOG_MS = 20000;
const HIT_COST = 2;
const QUOTAS = [10, 12, 14, 14, 16];
const OBSTACLES = [0, 1, 2, 3, 4];
const PATTERNS = ["steady", "wobble", "reverse", "surge"];
const TAU = Math.PI * 2;
const SIDE = [Math.PI / 2, -Math.PI / 2]; // where each seat's knife meets the log

// rotation (radians) t seconds after the log starts; same formula on the client
function angle(log, t) {
    t = Math.max(0, t);
    const s = log.speed * log.dir;
    const w = TAU / log.period;
    if (log.pattern === "wobble") return s * (t + (0.6 * (1 - Math.cos(w * t))) / w);
    if (log.pattern === "reverse") return s * (0.4 * t + (1.4 * Math.sin(w * t)) / w);
    if (log.pattern === "surge") return s * (t - (0.7 * Math.sin(w * t)) / w);
    return s * t;
}

function norm(a) {
    return ((a % TAU) + TAU) % TAU;
}

function gapOf(a, b) {
    const d = norm(a - b);
    return Math.min(d, TAU - d);
}

function makeLogs(rng) {
    const logs = [];
    for (let i = 0; i < LOGS; i++) {
        const obstacles = [];
        let tries = 0;
        while (obstacles.length < OBSTACLES[i] && tries++ < 200) {
            const a = Math.round(rng() * TAU * 1000) / 1000;
            if (!obstacles.some((b) => gapOf(a, b) < 0.7)) obstacles.push(a);
        }
        logs.push({
            pattern: i === 0 ? "steady" : PATTERNS[1 + Math.floor(rng() * 3)],
            speed: Math.round((1.7 + i * 0.35 + rng() * 0.3) * 100) / 100,
            dir: rng() < 0.5 ? 1 : -1,
            period: Math.round((1.8 + rng() * 1.4) * 100) / 100,
            quota: QUOTAS[i],
            obstacles,
        });
    }
    return logs;
}

function startLog(state, ctx, i, startAt) {
    state.logIndex = i;
    state.phase = "play";
    state.logStartAt = startAt;
    state.logEndsAt = startAt + LOG_MS;
    state.nextAt = null;
    state.endReason = null;
    state.out = [false, false];
    state.logScores = [0, 0];
    state.stuck = state.logs[i].obstacles.map((a) => ({ id: state.nextId++, a, owner: null }));
    ctx.later(state.logEndsAt - ctx.now() + 50, () => {
        if (state.logIndex === i && state.phase === "play") endLog(state, ctx, "time");
    });
}

function endLog(state, ctx, reason) {
    state.endReason = reason;
    if (state.logIndex + 1 >= state.logs.length) {
        state.phase = "done";
        return;
    }
    state.phase = "break";
    state.nextAt = ctx.now() + BREAK_MS;
    const next = state.logIndex + 1;
    ctx.later(BREAK_MS, () => {
        if (state.phase === "break" && state.logIndex === next - 1) startLog(state, ctx, next, state.nextAt);
    });
}

module.exports = {
    id: "knifethrow",
    name: "Knife Throw",
    kind: "live",
    quick: true,
    players: [2, 2],
    angle,
    init({ rng, ctx }) {
        const state = {
            logs: makeLogs(rng),
            logIndex: 0,
            phase: "play",
            logStartAt: 0,
            logEndsAt: 0,
            nextAt: null,
            endReason: null,
            stuck: [],
            scores: [0, 0],
            logScores: [0, 0],
            out: [false, false],
            lastThrow: [-1e15, -1e15],
            events: [],
            nextId: 1,
        };
        startLog(state, ctx, 0, ctx.now() + START_MS);
        return state;
    },
    view(state) {
        const log = state.logs[state.logIndex];
        return {
            phase: state.phase,
            logIndex: state.logIndex,
            logCount: state.logs.length,
            log: { pattern: log.pattern, speed: log.speed, dir: log.dir, period: log.period },
            quota: log.quota,
            placed: state.stuck.filter((k) => k.owner !== null).length,
            logStartAt: state.logStartAt,
            logEndsAt: state.logEndsAt,
            nextAt: state.nextAt,
            endReason: state.endReason,
            stuck: state.stuck,
            scores: state.scores,
            logScores: state.logScores,
            out: state.out,
            events: state.events,
            gap: GAP,
            flight: FLIGHT,
            hitCost: HIT_COST,
        };
    },
    tv(state) {
        const log = state.logs[state.logIndex];
        const placed = state.stuck.filter((k) => k.owner !== null).length;
        return {
            headline: "Log " + (state.logIndex + 1) + "/" + state.logs.length + " · " + placed + "/" + log.quota + " knives",
            sub: "One throws from below, one from above",
            endAt: state.phase === "play" ? state.logEndsAt : null,
            scores: state.scores,
            status: [0, 1].map((s) => (state.phase === "play" && state.out[s] ? "OUT" : (s === 0 ? "from below" : "from above"))),
        };
    },
    move(state, seat, p, ctx) {
        if (state.phase !== "play") return { error: "Wait for the next log." };
        if (!p || typeof p !== "object") return { error: "Bad throw." };
        if (Number(p.log) !== state.logIndex) return { error: "That log is gone." };
        if (state.out[seat]) return { error: "You're out for this log." };
        const now = ctx.now();
        let at = Number(p.throwAt);
        if (!Number.isFinite(at)) at = now;
        at = Math.min(now, Math.max(now - LATE, at));
        if (at < state.logStartAt) return { error: "Not started yet." };
        if (at - state.lastThrow[seat] < MIN_GAP_MS) return { error: "Too fast." };
        state.lastThrow[seat] = at;
        const log = state.logs[state.logIndex];
        const rot = angle(log, (at + FLIGHT - state.logStartAt) / 1000);
        const a = Math.round(norm(SIDE[seat] - rot) * 10000) / 10000;
        const hit = state.stuck.some((k) => gapOf(k.a, a) < GAP);
        const id = state.nextId++;
        const n = Number.isInteger(p.n) ? p.n : null;
        if (hit) {
            state.out[seat] = true;
            state.scores[seat] -= HIT_COST;
            state.logScores[seat] -= HIT_COST;
        } else {
            state.stuck.push({ id, a, owner: seat });
            state.scores[seat]++;
            state.logScores[seat]++;
        }
        state.events.push({ id, seat, n, ok: !hit, a, log: state.logIndex });
        if (state.events.length > 10) state.events.shift();
        const placed = state.stuck.filter((k) => k.owner !== null).length;
        if (placed >= log.quota) endLog(state, ctx, "cleared");
        else if (state.out[0] && state.out[1]) endLog(state, ctx, "out");
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const [a, b] = state.scores;
        if (a === b) return { winner: null, text: "Tied at " + a + " knives." };
        return { winner: a > b ? 0 : 1, text: Math.max(a, b) + " to " + Math.min(a, b) + " after " + state.logs.length + " logs" };
    },
};
