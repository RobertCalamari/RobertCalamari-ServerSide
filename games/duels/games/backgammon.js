// Backgammon, one game, no doubling cube. board[i] is point i+1 from seat 0's side: > 0 seat 0 checkers, < 0 seat 1.
// Seat 0 moves 24 → 1 and bears off below point 1; seat 1 moves 1 → 24 and bears off above 24. The server rolls.
// You play one checker at a time (undo any time before you end the turn); every move must lead to a full legal turn:
// use both dice if you can (all four on doubles), and if only one can be used, the larger one when possible.
// A win is a gammon if the loser bore nothing off, a backgammon if they also still have a checker on the bar or in the
// winner's home board.
const TURN_MS = 60000;
const AFK_MS = 15000;
const PASS_MS = 1800;
const START = { 23: 2, 12: 5, 7: 3, 5: 5 };

const dir = (s) => (s === 0 ? -1 : 1);
const mine = (b, s, i) => (s === 0 ? b[i] > 0 : b[i] < 0);
const cnt = (b, i) => Math.abs(b[i]);
const home = (s, i) => (s === 0 ? i <= 5 : i >= 18);
const dist = (s, i) => (s === 0 ? i + 1 : 24 - i); // pips to bear off from i
const pips = (st, s) => st.bar[s] * 25 + st.board.reduce((a, n, i) => a + (mine(st.board, s, i) ? cnt(st.board, i) * dist(s, i) : 0), 0);

const copy = (p) => ({ board: p.board.slice(), bar: p.bar.slice(), off: p.off.slice() });

// single moves for seat s with one die from position p
function singles(p, s, die) {
    const out = [];
    const open = (i) => i >= 0 && i < 24 && !(s === 0 ? p.board[i] < -1 : p.board[i] > 1);
    if (p.bar[s]) {
        const to = s === 0 ? 24 - die : die - 1;
        if (open(to)) out.push({ from: "bar", to, die });
        return out;
    }
    let allHome = true;
    for (let i = 0; i < 24; i++) if (mine(p.board, s, i) && !home(s, i)) allHome = false;
    for (let i = 0; i < 24; i++) {
        if (!mine(p.board, s, i)) continue;
        const to = i + dir(s) * die;
        if (to >= 0 && to < 24) {
            if (open(to)) out.push({ from: i, to, die });
            continue;
        }
        if (!allHome) continue;
        if (dist(s, i) === die) out.push({ from: i, to: "off", die });
        else {
            let farther = false;
            for (let j = 0; j < 24; j++) if (mine(p.board, s, j) && dist(s, j) > dist(s, i)) farther = true;
            if (!farther) out.push({ from: i, to: "off", die });
        }
    }
    return out;
}

function apply(p, s, m) {
    const q = copy(p);
    const one = s === 0 ? 1 : -1;
    if (m.from === "bar") q.bar[s]--;
    else q.board[m.from] -= one;
    if (m.to === "off") q.off[s]++;
    else {
        if (q.board[m.to] === -one) {
            q.board[m.to] = 0;
            q.bar[1 - s]++;
            m.hit = true;
        }
        q.board[m.to] += one;
    }
    return q;
}

const key = (p) => p.board.join() + "|" + p.bar.join() + "|" + p.off.join();

// longest playable sequence length from p with dice (array), memoised per position + dice
function longest(p, s, dice, memo = new Map()) {
    if (!dice.length) return 0;
    const k = key(p) + "#" + dice.join();
    if (memo.has(k)) return memo.get(k);
    let best = 0;
    for (const d of [...new Set(dice)]) {
        const rest = dice.slice();
        rest.splice(rest.indexOf(d), 1);
        for (const m of singles(p, s, d)) {
            best = Math.max(best, 1 + longest(apply(p, s, m), s, rest, memo));
            if (best === dice.length) break;
        }
        if (best === dice.length) break;
    }
    memo.set(k, best);
    return best;
}

// the moves you may make next this turn
function legal(st) {
    if (st.phase !== "move") return [];
    const s = st.turn;
    const need = st.need - st.done.length;
    if (need <= 0) return [];
    const memo = new Map();
    const out = [];
    for (const d of [...new Set(st.dice)]) {
        const rest = st.dice.slice();
        rest.splice(rest.indexOf(d), 1);
        for (const m of singles(st, s, d)) if (1 + longest(apply(st, s, m), s, rest, memo) >= need) out.push(m);
    }
    // only one die can be played: it must be the larger when that's possible
    if (st.need === 1 && !st.done.length && st.roll[0] !== st.roll[1]) {
        const big = Math.max(...st.roll);
        if (out.some((m) => m.die === big)) return out.filter((m) => m.die === big);
    }
    return out;
}

function roll(st, ctx) {
    const d = () => 1 + Math.floor(ctx.rng() * 6);
    return [d(), d()];
}

function startTurn(st, s, dice, ctx) {
    st.turn = s;
    st.roll = dice;
    st.dice = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice();
    st.done = [];
    st.start = copy(st);
    st.need = longest(st, s, st.dice);
    st.turnId++;
    st.turns++;
    const id = st.turnId;
    if (!st.need) {
        st.phase = "pass";
        st.deadline = ctx.now() + PASS_MS;
        ctx.later(PASS_MS, () => {
            if (st.turnId === id && st.phase === "pass") next(st, ctx);
        });
        return;
    }
    st.phase = "move";
    st.deadline = null;
    if (!st.timer) return;
    const ms = st.afk[s] >= 2 ? AFK_MS : TURN_MS;
    st.deadline = ctx.now() + ms;
    ctx.later(ms, () => {
        if (st.turnId !== id || st.phase !== "move") return;
        st.afk[s]++;
        let ms2;
        while ((ms2 = legal(st)).length) step(st, ms2[Math.floor(ctx.rng() * ms2.length)]);
        finish(st, ctx, true);
    });
}

function step(st, m) {
    const q = apply(st, st.turn, m);
    st.board = q.board;
    st.bar = q.bar;
    st.off = q.off;
    st.dice.splice(st.dice.indexOf(m.die), 1);
    st.done.push(m);
}

function finish(st, ctx, auto) {
    st.last = { seat: st.turn, roll: st.roll, moves: st.done, auto: !!auto, n: st.turns };
    if (st.off[st.turn] === 15) {
        st.phase = "over";
        st.winner = st.turn;
        st.deadline = null;
        return;
    }
    next(st, ctx);
}

function next(st, ctx) {
    if (st.phase === "pass") st.last = { seat: st.turn, roll: st.roll, moves: [], pass: true, n: st.turns };
    startTurn(st, 1 - st.turn, roll(st, ctx), ctx);
}

function points(st) {
    const l = 1 - st.winner;
    if (st.off[l]) return 1;
    const stuck = st.bar[l] > 0 || st.board.some((n, i) => mine(st.board, l, i) && home(st.winner, i));
    return stuck ? 3 : 2;
}

function pub(st) {
    return {
        board: st.board,
        bar: st.bar,
        off: st.off,
        phase: st.phase,
        turn: st.turn,
        roll: st.roll,
        dice: st.dice,
        done: st.done,
        need: st.need,
        opening: st.turns === 1 ? st.opening : null,
        deadline: st.deadline,
        pips: [pips(st, 0), pips(st, 1)],
        last: st.last,
        winner: st.winner,
    };
}

module.exports = {
    id: "backgammon",
    name: "Backgammon",
    kind: "turn",
    quick: false,
    players: [2, 2],
    options: { timer: [true, false] },
    singles,
    legal,
    longest,
    init({ rng, ctx, options }) {
        const board = new Array(24).fill(0);
        for (const [i, n] of Object.entries(START)) {
            board[i] = n;
            board[23 - i] = -n;
        }
        const st = { board, bar: [0, 0], off: [0, 0], phase: "move", turn: 0, roll: [], dice: [], done: [], need: 0, start: null, turnId: 0, turns: 0, deadline: null, timer: !options || options.timer !== false, afk: [0, 0], last: null, winner: null, resigned: null, opening: null };
        let a, b;
        do {
            a = 1 + Math.floor(rng() * 6);
            b = 1 + Math.floor(rng() * 6);
        } while (a === b);
        st.opening = [a, b];
        startTurn(st, a > b ? 0 : 1, [a, b], ctx);
        return st;
    },
    view(st, seat) {
        const v = pub(st);
        v.myTurn = st.phase === "move" && st.turn === seat && st.resigned === null;
        v.legal = v.myTurn ? legal(st) : [];
        v.canEnd = v.myTurn && st.done.length === st.need;
        return v;
    },
    tv(st) {
        return pub(st);
    },
    move(st, seat, p, ctx) {
        if (st.phase === "over" || st.resigned !== null) return { error: "The game is over." };
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.resign === true) {
            st.resigned = seat;
            return { ok: true };
        }
        if (st.phase !== "move" || st.turn !== seat) return { error: "It's not your turn." };
        st.afk[seat] = 0;
        if (p.act === "move") {
            const m = legal(st).find((x) => x.from === p.from && x.to === p.to && (p.die === undefined || x.die === p.die));
            if (!m) return { error: "You can't move there." };
            step(st, { from: m.from, to: m.to, die: m.die });
            if (st.off[seat] === 15) finish(st, ctx, false);
            return { ok: true };
        }
        if (p.act === "undo") {
            if (!st.done.length) return { ok: true, quiet: true };
            const done = st.done.slice(0, -1);
            const dice = st.roll[0] === st.roll[1] ? [st.roll[0], st.roll[0], st.roll[0], st.roll[0]] : st.roll.slice();
            Object.assign(st, copy(st.start), { dice, done: [] });
            done.forEach((m) => step(st, m));
            return { ok: true };
        }
        if (p.act === "end") {
            if (st.done.length < st.need) return { error: "You still have to play " + (st.need - st.done.length === 1 ? "a die." : "your dice.") };
            finish(st, ctx, false);
            return { ok: true };
        }
        return { error: "Bad move." };
    },
    result(st) {
        if (st.resigned !== null) return { winner: 1 - st.resigned, text: "Resigned." };
        if (st.winner === null) return null;
        const pts = points(st);
        return { winner: st.winner, text: (pts === 3 ? "Backgammon!" : pts === 2 ? "Gammon!" : "Bore off all 15") + " in " + Math.ceil(st.turns / 2) + " rolls." };
    },
};
