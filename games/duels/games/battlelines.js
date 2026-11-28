// Battle Lines: a 6x6 skirmish where you can't see what you're fighting. Each side has a Rock, Paper, Scissors, an Archer
// and a King, arranged in secret on its back row. Step one square orthogonally, or step into an enemy to attack:
// Rock beats Scissors beats Paper beats Rock, equal types bounce off, anything beats an Archer up close, and a King only
// beats Archers and Kings. Archers don't melee; instead of moving they shoot a unit exactly two squares away in a straight
// line over an empty square. Enemy types stay hidden until they fight or shoot. Take their King to win.
// Cells [r, c], row 0 at the top. Seat 0's back row is 5, seat 1's is 0.
const N = 6;
const TYPES = ["R", "P", "S", "A", "K"];
const BEATS = { R: "S", S: "P", P: "R" };
const HOME = [5, 0];
const SETUP_MS = 40000;
const TURN_MS = 40000;
const QUIET = 60;
const MAX_TURNS = 300;
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const NAMES = { R: "Rock", P: "Paper", S: "Scissors", A: "Archer", K: "King" };

const on = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const at = (state, r, c) => state.units.find((u) => u.alive && u.r === r && u.c === c);
const same = (a, b) => Array.isArray(b) && a[0] === b[0] && a[1] === b[1];

function shuffle(rng, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// attacker's fate: "win" | "lose" | "bounce"
function fight(a, d) {
    if (d === "K" || d === "A") return "win";
    if (a === "K") return "lose";
    if (a === d) return "bounce";
    return BEATS[a] === d ? "win" : "lose";
}

function movesOf(state, seat) {
    const out = [];
    for (const u of state.units) {
        if (!u.alive || u.seat !== seat) continue;
        for (const [dr, dc] of DIRS) {
            const r = u.r + dr, c = u.c + dc;
            if (!on(r, c)) continue;
            const o = at(state, r, c);
            if (!o) out.push({ from: [u.r, u.c], to: [r, c], k: "move" });
            else if (o.seat !== seat && u.t !== "A") out.push({ from: [u.r, u.c], to: [r, c], k: "attack" });
            if (u.t === "A" && on(u.r + 2 * dr, u.c + 2 * dc) && !o) {
                const t = at(state, u.r + 2 * dr, u.c + 2 * dc);
                if (t && t.seat !== seat) out.push({ from: [u.r, u.c], to: [t.r, t.c], k: "shoot" });
            }
        }
    }
    return out;
}

function armTimer(state, ctx, ms) {
    state.turnId++;
    state.turnEndsAt = null;
    if (!state.timer) return;
    state.turnEndsAt = ctx.now() + ms;
    const id = state.turnId;
    ctx.later(ms, () => {
        if (state.turnId !== id || over(state)) return;
        if (state.phase === "setup") begin(state, ctx);
        else autoMove(state, ctx);
    });
}

const over = (state) => state.winner !== null || state.resigned !== null || state.draw;

function begin(state, ctx) {
    state.phase = "play";
    state.units.sort((a, b) => a.seat - b.seat || a.r - b.r || a.c - b.c).forEach((u, i) => (u.id = i));
    armTimer(state, ctx, TURN_MS);
}

function kill(state, u) {
    u.alive = false;
    state.lost.push({ seat: u.seat, t: u.t });
    if (u.t === "K") state.winner = 1 - u.seat;
}

function play(state, seat, m, ctx, auto) {
    const u = at(state, m.from[0], m.from[1]);
    const d = at(state, m.to[0], m.to[1]);
    const last = { seat, kind: m.k, from: m.from, to: m.to, auto: !!auto, n: state.turns };
    state.quiet++;
    if (m.k === "move") {
        u.r = m.to[0];
        u.c = m.to[1];
    } else if (m.k === "shoot") {
        u.known = true;
        Object.assign(last, { a: "A", d: d.t, out: "win" });
        kill(state, d);
        state.quiet = 0;
    } else {
        const out = fight(u.t, d.t);
        Object.assign(last, { a: u.t, d: d.t, out });
        if (out === "win") {
            kill(state, d);
            u.r = m.to[0];
            u.c = m.to[1];
            u.known = true;
            state.quiet = 0;
        } else if (out === "lose") {
            kill(state, u);
            d.known = true;
            state.quiet = 0;
        } else u.known = d.known = true;
    }
    state.last = last;
    state.turns++;
    if (over(state)) return;
    if (state.quiet >= QUIET || state.turns >= MAX_TURNS) {
        state.draw = true;
        return;
    }
    state.turn = 1 - state.turn;
    if (!movesOf(state, state.turn).length) {
        if (!movesOf(state, 1 - state.turn).length) {
            state.draw = true;
            return;
        }
        state.last = { seat: state.turn, kind: "pass", auto: true, n: state.turns };
        state.turn = 1 - state.turn;
    }
    armTimer(state, ctx, TURN_MS);
}

// out of time: a shot, a sure win, else a step forward with anything but the King
function autoMove(state, ctx) {
    const seat = state.turn;
    const ms = movesOf(state, seat);
    if (!ms.length) return;
    const unit = (p) => at(state, p[0], p[1]);
    const fwd = seat === 0 ? -1 : 1;
    const score = (m) => {
        const u = unit(m.from), d = unit(m.to);
        if (m.k === "shoot") return 100;
        if (m.k === "attack") return d.known && fight(u.t, d.t) === "win" ? 90 : -50;
        return (u.t === "K" ? -20 : 0) + (m.to[0] - m.from[0]) * fwd * 5 + ctx.rng() * 4;
    };
    ms.sort((a, b) => score(b) - score(a));
    play(state, seat, ms[0], ctx, true);
}

function pub(state, seat) {
    const setup = state.phase === "setup";
    return {
        size: N,
        phase: state.phase,
        units: state.units
            .filter((u) => u.alive && (!setup || u.seat === seat))
            .map((u) => ({ id: setup ? u.t : u.id, seat: u.seat, r: u.r, c: u.c, t: u.seat === seat || u.known ? u.t : null, known: !!u.known })),
        lost: state.lost,
        ready: state.ready,
        turn: state.turn,
        turns: state.turns,
        quiet: state.quiet,
        turnEndsAt: state.turnEndsAt,
        last: state.last,
        winner: state.winner,
    };
}

module.exports = {
    id: "battlelines",
    name: "Battle Lines",
    kind: "turn",
    quick: false,
    players: [2, 2],
    options: { timer: [true, false] },
    NAMES,
    fight,
    movesOf,
    init({ rng, ctx, options }) {
        const units = [];
        for (const seat of [0, 1]) {
            shuffle(rng, TYPES.concat(null)).forEach((t, c) => {
                if (t) units.push({ id: 0, seat, t, r: HOME[seat], c, alive: true, known: false });
            });
        }
        const state = {
            phase: "setup",
            units,
            lost: [],
            ready: [false, false],
            turn: rng() < 0.5 ? 0 : 1,
            turns: 0,
            quiet: 0,
            turnId: 0,
            turnEndsAt: null,
            timer: !options || options.timer !== false,
            last: null,
            winner: null,
            resigned: null,
            draw: false,
        };
        armTimer(state, ctx, SETUP_MS);
        return state;
    },
    view(state, seat) {
        const v = pub(state, seat);
        v.myTurn = state.phase === "play" && state.turn === seat && !over(state);
        v.moves = v.myTurn ? movesOf(state, seat) : [];
        return v;
    },
    tv(state) {
        return pub(state, -1);
    },
    move(state, seat, p, ctx) {
        if (over(state)) return { error: "The game is over." };
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.resign === true) {
            state.resigned = seat;
            return { ok: true };
        }
        if (state.phase === "setup") {
            if (p.act === "swap") {
                if (state.ready[seat]) return { error: "You're already ready." };
                const a = p.a, b = p.b;
                if (![a, b].every((x) => Number.isInteger(x) && x >= 0 && x < N) || a === b) return { error: "Pick two squares on your back row." };
                const ua = at(state, HOME[seat], a), ub = at(state, HOME[seat], b);
                if (!ua && !ub) return { ok: true, quiet: true };
                if (ua) ua.c = b;
                if (ub) ub.c = a;
                return { ok: true };
            }
            if (p.act === "ready") {
                state.ready[seat] = p.ready !== false;
                if (state.ready.every(Boolean)) begin(state, ctx);
                return { ok: true };
            }
            return { error: "Set up your back row first." };
        }
        if (state.turn !== seat) return { error: "It's not your turn." };
        if (p.act !== "move" && p.act !== "shoot") return { error: "Bad move." };
        const m = movesOf(state, seat).find((x) => same(x.from, p.from) && same(x.to, p.to) && (p.act === "shoot") === (x.k === "shoot"));
        if (!m) return { error: p.act === "shoot" ? "You can't shoot that." : "You can't move there." };
        play(state, seat, m, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.resigned !== null) return { winner: 1 - state.resigned, text: "Resigned." };
        if (state.winner !== null) {
            const l = state.last;
            const how = l && l.kind === "shoot" ? "An Archer shot the King" : l && l.a === "K" && l.out === "lose" ? "The King charged and fell" : "The King was taken";
            return { winner: state.winner, text: how + " after " + state.turns + " moves." };
        }
        if (state.draw) return { winner: null, text: state.turns >= MAX_TURNS ? "Out of moves: " + MAX_TURNS + " turns." : "Stalemate: " + QUIET + " moves without a capture." };
        return null;
    },
};
