// Mole Smash: one shared board, moles pop on a seeded schedule that speeds up. First tap to arrive gets
// the mole. Gold = +3, bombs = -2. Tapping an empty hole stuns you briefly. Most points after 30s wins.
const { ranked } = require("../rank");
const COLS = 4;
const ROWS = 3;
const HOLES = COLS * ROWS;
const START_MS = 3000;
const PLAY_MS = 30000;
const GRACE = 150; // a tap may arrive this long after a mole ducks
const STUN_MS = 450;
const MIN_GAP_MS = 60;
const KEEP_MS = 1500; // ended moles stay in the view this long for animations
const POINTS = { mole: 1, gold: 3, bomb: -2 };

const lerp = (a, b, p) => a + (b - a) * p;

function makeSchedule(rng, startAt) {
    const moles = [];
    const freeAt = new Array(HOLES).fill(0);
    let t = 300;
    while (t < PLAY_MS - 700) {
        const p = t / PLAY_MS;
        const count = p > 0.35 && rng() < 0.3 ? 2 : 1;
        for (let c = 0; c < count; c++) {
            const open = [];
            for (let h = 0; h < HOLES; h++) if (freeAt[h] <= t) open.push(h);
            if (!open.length) break;
            const hole = open[Math.floor(rng() * open.length)];
            const r = rng();
            const type = r < 0.08 ? "gold" : r < 0.2 ? "bomb" : "mole";
            let life = lerp(1350, 750, p) * (0.85 + rng() * 0.3);
            if (type === "gold") life *= 0.75;
            if (type === "bomb") life *= 1.3;
            life = Math.round(Math.min(life, PLAY_MS - t));
            const appearAt = startAt + t;
            moles.push({ id: moles.length + 1, hole, type, appearAt, hideAt: appearAt + life, by: null, at: null });
            freeAt[hole] = t + life + 250;
        }
        t += Math.round(lerp(820, 360, p) * (0.75 + rng() * 0.5));
    }
    return moles;
}

module.exports = {
    id: "molesmash",
    name: "Mole Smash",
    kind: "live",
    quick: true,
    players: [2, 8],
    init({ rng, ctx, players = 2 }) {
        const zero = (v) => new Array(players).fill(v);
        const now = ctx.now();
        const startAt = now + START_MS;
        const endAt = startAt + PLAY_MS;
        const state = {
            phase: "play",
            startAt,
            endAt,
            moles: makeSchedule(rng, startAt),
            scores: zero(0),
            hits: zero(0),
            bombs: zero(0),
            stunUntil: zero(0),
            lastTap: zero(-1e15),
            clock: now,
        };
        for (const m of state.moles) {
            ctx.later(m.appearAt - now, (t) => {
                state.clock = t;
            });
        }
        ctx.later(endAt - now + GRACE, (t) => {
            state.clock = t;
            state.phase = "done";
        });
        return state;
    },
    view(state) {
        const c = state.clock;
        return {
            phase: state.phase,
            cols: COLS,
            rows: ROWS,
            startAt: state.startAt,
            endAt: state.endAt,
            moles: state.moles
                .filter((m) => m.appearAt <= c + 20 && Math.max(m.hideAt, m.at || 0) > c - KEEP_MS)
                .map((m) => ({ id: m.id, hole: m.hole, type: m.type, appearAt: m.appearAt, hideAt: m.hideAt, by: m.by, at: m.at })),
            scores: state.scores,
            hits: state.hits,
            bombs: state.bombs,
            stunUntil: state.stunUntil,
            stunMs: STUN_MS,
            points: POINTS,
        };
    },
    tv(state) {
        return { headline: state.phase === "done" ? "Time!" : "Smash the moles!", endAt: state.endAt, scores: state.scores, status: state.scores.map((x, s) => state.hits[s] + " smashed" + (state.bombs[s] ? " · " + state.bombs[s] + " 💣" : "")) };
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad tap." };
        const hole = p.hole;
        if (!Number.isInteger(hole) || hole < 0 || hole >= HOLES) return { error: "Bad tap." };
        if (p.id !== undefined && !Number.isInteger(p.id)) return { error: "Bad tap." };
        const now = ctx.now();
        state.clock = now;
        if (state.phase !== "play" || now >= state.endAt + GRACE) return { ok: true };
        if (now < state.startAt) return { error: "Not yet!" };
        if (now < state.stunUntil[seat]) return { error: "Stunned!" };
        if (now - state.lastTap[seat] < MIN_GAP_MS) return { error: "Too fast." };
        state.lastTap[seat] = now;
        const live = (m) => m.hole === hole && m.appearAt <= now && now < m.hideAt + GRACE;
        const m = state.moles.find((x) => live(x) && x.by === null && (p.id === undefined || x.id === p.id));
        if (m) {
            m.by = seat;
            m.at = now;
            state.scores[seat] += POINTS[m.type];
            if (m.type === "bomb") state.bombs[seat]++;
            else state.hits[seat]++;
            return { ok: true };
        }
        // a mole was just here (taken by them, or ducked): no stun, just too late
        if (state.moles.some((x) => x.hole === hole && x.appearAt <= now && now < Math.max(x.hideAt, x.at || 0) + 500)) return { ok: true };
        state.stunUntil[seat] = now + STUN_MS;
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        if (state.scores.length > 2) {
            const r = ranked(state.scores, "high");
            r.text = "Top score " + Math.max(...state.scores) + " · " + state.hits.reduce((x, y) => x + y, 0) + " moles smashed in all";
            return r;
        }
        const [a, b] = state.scores;
        if (a === b) return { winner: null, text: "Tied at " + a + " points." };
        const w = a > b ? 0 : 1;
        return { winner: w, text: state.scores[w] + " to " + state.scores[1 - w] + " · " + state.hits[w] + " moles smashed" };
    },
};
