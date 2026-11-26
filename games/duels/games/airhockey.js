// Air Hockey: the server runs the puck at ~30 ticks/s; each player drags a mallet around their own half.
// Seat 0 defends the bottom goal, seat 1 the top (their client flips the table). First to 5, or most at 90s;
// tied at the buzzer = next goal wins (up to 30s more).
const W = 200;
const H = 320;
const GOAL = 66; // goal mouth width
const MR = 17; // mallet radius
const PR = 11; // puck radius
const TICK_MS = 33;
const SUBSTEPS = 4;
const COUNT_MS = 3000;
const GOAL_PAUSE_MS = 1600;
const PLAY_MS = 90000;
const OT_MS = 30000;
const WIN = 5;
const MAX_PUCK = 720; // units per second
const MAX_MALLET = 1600; // how fast a mallet may travel (units per second)
const MALLET_HIT_V = 950; // mallet speed counted in a hit
const FRICTION = 0.996; // per tick
const WALL_E = 0.9;
const HIT_E = 0.85;
const HOME = [
    { x: W / 2, y: H - 44 },
    { x: W / 2, y: 44 },
];

const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inMouth = (x) => Math.abs(x - W / 2) < GOAL / 2 - PR * 0.3;

function clampMallet(seat, x, y) {
    return {
        x: clamp(x, MR, W - MR),
        y: seat === 0 ? clamp(y, H / 2 + MR, H - MR) : clamp(y, MR, H / 2 - MR),
    };
}

function placePuck(state, towardSeat) {
    // the player who conceded gets the puck, sitting still on their side
    state.puck = { x: W / 2, y: towardSeat === 0 ? H * 0.72 : towardSeat === 1 ? H * 0.28 : H / 2, vx: 0, vy: 0 };
}

function loop(state, ctx, at) {
    const next = at + TICK_MS;
    const run = state.run;
    ctx.later(Math.max(0, next - ctx.now()), (now) => {
        if (state.run !== run || state.phase !== "play") return;
        step(state, ctx, Math.min(80, now - state.tickAt) / 1000, now);
        if (state.phase === "play") loop(state, ctx, next);
    });
}

function begin(state, ctx, now) {
    state.phase = "play";
    state.run++;
    state.tickAt = now;
    state.prev = state.mallets.map((m) => ({ ...m }));
    loop(state, ctx, now);
}

function step(state, ctx, dt, now) {
    state.tickAt = now;
    const p = state.puck;
    const from = state.prev;
    const to = state.mallets.map((m) => ({ ...m }));
    const mv = to.map((m, s) => {
        let vx = dt > 0 ? (m.x - from[s].x) / dt : 0;
        let vy = dt > 0 ? (m.y - from[s].y) / dt : 0;
        const sp = Math.hypot(vx, vy);
        if (sp > MALLET_HIT_V) {
            vx *= MALLET_HIT_V / sp;
            vy *= MALLET_HIT_V / sp;
        }
        return { vx, vy };
    });
    const h = dt / SUBSTEPS;
    let scorer = null;
    for (let k = 1; k <= SUBSTEPS && scorer === null; k++) {
        p.x += p.vx * h;
        p.y += p.vy * h;
        for (const s of [0, 1]) {
            const mx = from[s].x + (to[s].x - from[s].x) * (k / SUBSTEPS);
            const my = from[s].y + (to[s].y - from[s].y) * (k / SUBSTEPS);
            let dx = p.x - mx;
            let dy = p.y - my;
            let d = Math.hypot(dx, dy);
            if (d >= MR + PR) continue;
            if (d < 0.001) {
                dx = 0;
                dy = s === 0 ? -1 : 1;
                d = 1;
            }
            const nx = dx / d;
            const ny = dy / d;
            p.x = mx + nx * (MR + PR);
            p.y = my + ny * (MR + PR);
            const vn = (p.vx - mv[s].vx) * nx + (p.vy - mv[s].vy) * ny;
            if (vn < 0) {
                p.vx -= (1 + HIT_E) * vn * nx;
                p.vy -= (1 + HIT_E) * vn * ny;
                if (-vn > 60) {
                    state.hits++;
                    state.lastHit = s;
                }
            }
        }
        if (p.x < PR) {
            p.x = PR;
            p.vx = Math.abs(p.vx) * WALL_E;
        } else if (p.x > W - PR) {
            p.x = W - PR;
            p.vx = -Math.abs(p.vx) * WALL_E;
        }
        if (p.y > H - PR || p.y < PR) {
            const bottom = p.y > H / 2;
            if (inMouth(p.x) || (bottom ? p.y > H : p.y < 0)) {
                p.x = clamp(p.x, W / 2 - GOAL / 2 + PR, W / 2 + GOAL / 2 - PR);
                if (p.y > H + PR) scorer = 1;
                else if (p.y < -PR) scorer = 0;
            } else if (bottom) {
                p.y = H - PR;
                p.vy = -Math.abs(p.vy) * WALL_E;
            } else {
                p.y = PR;
                p.vy = Math.abs(p.vy) * WALL_E;
            }
        }
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > MAX_PUCK) {
            p.vx *= MAX_PUCK / sp;
            p.vy *= MAX_PUCK / sp;
        }
    }
    p.vx *= FRICTION;
    p.vy *= FRICTION;
    if (Math.hypot(p.vx, p.vy) < 2) p.vx = p.vy = 0;
    state.prev = to;
    if (scorer !== null) return goal(state, ctx, scorer, now);
    if (now >= state.endAt) overTime(state, now);
}

function overTime(state, now) {
    const [a, b] = state.score;
    if (a !== b || state.ot) {
        state.phase = "done";
        return;
    }
    state.ot = true;
    state.endAt = now + OT_MS;
}

function goal(state, ctx, scorer, now) {
    state.score[scorer]++;
    state.lastGoal = { by: scorer, at: now };
    state.phase = "goal";
    state.run++;
    if (state.score[scorer] >= WIN || state.ot) {
        state.phase = "done";
        return;
    }
    state.nextAt = now + GOAL_PAUSE_MS;
    const run = state.run;
    ctx.later(GOAL_PAUSE_MS, (t) => {
        if (state.run !== run || state.phase !== "goal") return;
        placePuck(state, 1 - scorer);
        if (t >= state.endAt) overTime(state, t);
        if (state.phase === "goal") begin(state, ctx, t);
    });
}

module.exports = {
    id: "airhockey",
    name: "Air Hockey",
    kind: "live",
    quick: true,
    players: [2, 2],
    init({ ctx }) {
        const now = ctx.now();
        const state = {
            phase: "count",
            run: 0,
            startAt: now + COUNT_MS,
            endAt: now + COUNT_MS + PLAY_MS,
            nextAt: null,
            ot: false,
            score: [0, 0],
            mallets: HOME.map((m) => ({ ...m })),
            prev: HOME.map((m) => ({ ...m })),
            lastMove: [now, now],
            puck: null,
            tickAt: now,
            hits: 0,
            lastHit: null,
            lastGoal: null,
        };
        placePuck(state, null);
        ctx.later(COUNT_MS, (t) => {
            if (state.phase === "count") begin(state, ctx, t);
        });
        return state;
    },
    view(state) {
        const p = state.puck;
        return {
            phase: state.phase,
            dims: [W, H, GOAL, MR, PR],
            win: WIN,
            startAt: state.startAt,
            endAt: state.endAt,
            nextAt: state.nextAt,
            ot: state.ot,
            score: state.score,
            puck: [r1(p.x), r1(p.y), Math.round(p.vx), Math.round(p.vy)],
            mallets: state.mallets.map((m) => [r1(m.x), r1(m.y)]),
            tickAt: state.tickAt,
            hits: state.hits,
            lastHit: state.lastHit,
            lastGoal: state.lastGoal,
        };
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object" || typeof p.x !== "number" || typeof p.y !== "number" || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return { error: "Bad position." };
        if (state.phase === "done") return { ok: true };
        const now = ctx.now();
        const want = clampMallet(seat, p.x, p.y);
        const m = state.mallets[seat];
        const reach = (MAX_MALLET * Math.min(250, Math.max(0, now - state.lastMove[seat]))) / 1000 + 20;
        const dx = want.x - m.x;
        const dy = want.y - m.y;
        const d = Math.hypot(dx, dy);
        const k = d > reach ? reach / d : 1;
        state.mallets[seat] = clampMallet(seat, m.x + dx * k, m.y + dy * k);
        state.lastMove[seat] = now;
        return { ok: true, quiet: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const [a, b] = state.score;
        if (a === b) return { winner: null, text: "Tied " + a + "-" + b + " after overtime" };
        const w = a > b ? 0 : 1;
        const s = state.score[w] + "-" + state.score[1 - w];
        if (state.ot) return { winner: w, text: "Golden goal in overtime, " + s };
        if (state.score[w] >= WIN) return { winner: w, text: "First to " + WIN + ", " + s };
        return { winner: w, text: "Ahead " + s + " at the buzzer" };
    },
};
