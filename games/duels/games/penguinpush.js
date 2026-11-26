// Both players secretly aim their penguins, then the server slides everyone at once.
const AIM_MS = 15000;
const MAX_ROUNDS = 8;
const PR = 8; // penguin radius
const DT = 1 / 60;
const MAX_STEPS = 480;
const EVERY = 2; // keep every 2nd step as a frame
const MAX_SPEED = 210;

const r1 = (v) => Math.round(v * 10) / 10;

function radiusFor(round) {
    return Math.max(70, 100 - (round - 1) * 5);
}

function alive(state, seat) {
    return state.penguins.filter((p) => p.owner === seat && !p.out).length;
}

function simulate(penguins, aims, radius) {
    const bodies = penguins.map((p) => {
        const aim = !p.out && aims[p.owner][p.id];
        const v = aim ? aim.p * MAX_SPEED : 0;
        return { x: p.x, y: p.y, vx: aim ? Math.cos(aim.a) * v : 0, vy: aim ? Math.sin(aim.a) * v : 0, out: p.out };
    });
    const frames = [];
    const falls = [];
    const snap = () => {
        const f = [];
        for (const b of bodies) f.push(r1(b.x), r1(b.y));
        frames.push(f);
    };
    snap();
    for (let step = 1; step <= MAX_STEPS; step++) {
        let moving = false;
        for (const b of bodies) {
            if (b.out) continue;
            b.x += b.vx * DT;
            b.y += b.vy * DT;
        }
        for (let i = 0; i < bodies.length; i++) {
            const a = bodies[i];
            if (a.out) continue;
            for (let j = i + 1; j < bodies.length; j++) {
                const b = bodies[j];
                if (b.out) continue;
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let d = Math.sqrt(dx * dx + dy * dy);
                if (d >= PR * 2) continue;
                if (d < 1e-6) {
                    dx = 1;
                    dy = 0;
                    d = 1e-6;
                }
                const nx = dx / d;
                const ny = dy / d;
                const push = (PR * 2 - d) / 2;
                a.x -= nx * push;
                a.y -= ny * push;
                b.x += nx * push;
                b.y += ny * push;
                const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
                if (rel > 0) {
                    a.vx -= rel * nx;
                    a.vy -= rel * ny;
                    b.vx += rel * nx;
                    b.vy += rel * ny;
                }
            }
        }
        bodies.forEach((b, i) => {
            if (b.out) return;
            const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            const next = Math.max(0, sp * 0.985 - 25 * DT);
            if (next < 2) {
                b.vx = 0;
                b.vy = 0;
            } else {
                b.vx *= next / sp;
                b.vy *= next / sp;
                moving = true;
            }
            if (b.x * b.x + b.y * b.y > radius * radius) {
                b.out = true;
                b.vx = 0;
                b.vy = 0;
                falls.push([penguins[i].id, Math.ceil(step / EVERY)]);
            }
        });
        if (step % EVERY === 0 || !moving) snap();
        if (!moving) break;
    }
    return { bodies, frames, falls };
}

function resolve(state, ctx) {
    if (state.over) return;
    const radius = state.radius;
    const startOut = state.penguins.filter((p) => p.out).map((p) => p.id);
    const { bodies, frames, falls } = simulate(state.penguins, state.aims, radius);
    state.penguins.forEach((p, i) => {
        p.x = r1(bodies[i].x);
        p.y = r1(bodies[i].y);
        p.out = bodies[i].out;
    });
    const nextRadius = radiusFor(state.round + 1);
    const shrinkFalls = [];
    for (const p of state.penguins) {
        if (!p.out && p.x * p.x + p.y * p.y > nextRadius * nextRadius) {
            p.out = true;
            shrinkFalls.push(p.id);
        }
    }
    state.replayId++;
    const stepMs = Math.round(DT * EVERY * 1000);
    state.replay = { id: state.replayId, round: state.round, radius, startOut, radiusAfter: nextRadius, frames, falls, shrinkFalls, stepMs };
    const a = alive(state, 0);
    const b = alive(state, 1);
    if (a === 0 && b === 0) state.over = { winner: null, text: "Everyone fell in! Draw." };
    else if (a === 0) state.over = { winner: 1, text: "Pushed every penguin off!" };
    else if (b === 0) state.over = { winner: 0, text: "Pushed every penguin off!" };
    else if (state.round >= MAX_ROUNDS) {
        if (a === b) state.over = { winner: null, text: "Out of rounds, " + a + " each. Draw." };
        else state.over = { winner: a > b ? 0 : 1, text: "Out of rounds: " + Math.max(a, b) + " penguins vs " + Math.min(a, b) };
    }
    if (state.over) return;
    state.round++;
    state.radius = nextRadius;
    state.aims = [{}, {}];
    state.locked = [false, false];
    startRound(state, ctx, frames.length * stepMs + 900);
}

function startRound(state, ctx, extra) {
    const round = state.round;
    state.deadline = ctx.now() + extra + AIM_MS;
    ctx.later(extra + AIM_MS + 400, () => {
        if (state.round === round && !state.over) resolve(state, ctx);
    });
}

module.exports = {
    id: "penguinpush",
    name: "Penguin Push",
    kind: "sim",
    quick: true,
    players: [2, 2],
    init({ ctx }) {
        const spots = [[-42, 52], [0, 64], [42, 52]];
        const penguins = [];
        for (const seat of [0, 1]) {
            spots.forEach(([x, y], i) => {
                const s = seat === 0 ? 1 : -1;
                penguins.push({ id: seat * 3 + i, owner: seat, x: x * s, y: y * s, out: false });
            });
        }
        const state = {
            penguins,
            round: 1,
            radius: radiusFor(1),
            aims: [{}, {}],
            locked: [false, false],
            deadline: 0,
            replay: null,
            replayId: 0,
            over: null,
        };
        startRound(state, ctx, 1500);
        return state;
    },
    view(state, seat) {
        const mine = {};
        for (const id of Object.keys(state.aims[seat])) mine[id] = state.aims[seat][id];
        return {
            penguins: state.penguins.map((p) => ({ id: p.id, owner: p.owner, x: p.x, y: p.y, out: p.out })),
            myAims: mine,
            meLocked: state.locked[seat],
            theyLocked: state.locked[1 - seat],
            round: state.round,
            maxRounds: MAX_ROUNDS,
            deadline: state.deadline,
            radius: state.radius,
            penguinRadius: PR,
            left: [alive(state, 0), alive(state, 1)],
            replay: state.replay,
            replayId: state.replayId,
            over: !!state.over,
        };
    },
    move(state, seat, p, ctx) {
        if (state.over) return { error: "The game is over." };
        if (state.locked[seat]) return { error: "You already locked in." };
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.aims !== undefined) {
            if (!Array.isArray(p.aims) || p.aims.length > 3) return { error: "Bad aims." };
            const next = {};
            for (const a of p.aims) {
                const id = Number(a && a.id);
                const pen = state.penguins.find((x) => x.id === id);
                if (!pen || pen.owner !== seat || pen.out) return { error: "That's not your penguin." };
                const ang = Number(a.a);
                const pow = Number(a.p);
                if (!Number.isFinite(ang) || !Number.isFinite(pow)) return { error: "Bad aim." };
                const power = Math.min(1, Math.max(0, pow));
                if (power > 0) next[id] = { a: Math.round(ang * 1000) / 1000, p: Math.round(power * 1000) / 1000 };
            }
            state.aims[seat] = next;
        }
        if (p.lock) {
            state.locked[seat] = true;
            if (state.locked[0] && state.locked[1]) resolve(state, ctx);
        }
        return { ok: true };
    },
    result(state) {
        return state.over || null;
    },
};
