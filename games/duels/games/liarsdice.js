// Liar's Dice: everyone shakes five hidden dice. In turn, raise the bid on how many of one face are on the whole table
// (ones are wild), or call "Liar!" on the last bid, or "Spot on!" if you think it's exact. Reveal: a wrong Liar call
// costs the caller a die, a right one costs the bidder. Spot on wins a die back (up to five) if exact, else costs one.
// Raises: more dice of any face, or the same number of a higher face. Switching to ones needs at least half the count
// (rounded up); switching off ones needs double plus one. You can't open on ones. Whoever lost a die starts the next
// round. Last one with dice wins.
const { ranked } = require("../rank");
const DICE = 5;
const TURN_MS = 30000;
const AFK_MS = 10000;
const REVEAL_MS = 7000;
const MAX_ROUNDS = 120;

const alive = (st) => st.count.map((n, s) => (n > 0 ? s : -1)).filter((s) => s >= 0);
const total = (st) => st.count.reduce((a, b) => a + b, 0);
const nextAlive = (st, s) => {
    for (let k = 1; k <= st.n; k++) if (st.count[(s + k) % st.n] > 0) return (s + k) % st.n;
    return s;
};
const matches = (d, f) => d === f || (f !== 1 && d === 1);

// is q × f a legal raise over bid b (null = opening)?
function beats(q, f, b) {
    if (!b) return f !== 1;
    if (b.f === 1) return f === 1 ? q > b.q : q >= b.q * 2 + 1;
    if (f === 1) return q >= Math.ceil(b.q / 2);
    return q > b.q || (q === b.q && f > b.f);
}

// the smallest legal bid on each face (or null)
function minBids(st) {
    const out = {};
    for (let f = 1; f <= 6; f++) {
        let q = 1;
        while (q <= total(st) && !beats(q, f, st.bid)) q++;
        out[f] = q <= total(st) && beats(q, f, st.bid) ? q : null;
    }
    return out;
}

function newRound(st, starter, ctx) {
    st.round++;
    st.dice = st.count.map((n) => Array.from({ length: n }, () => 1 + Math.floor(ctx.rng() * 6)).sort((a, b) => a - b));
    st.bid = null;
    st.bids = [];
    st.phase = "bid";
    startTurn(st, starter, ctx);
}

function startTurn(st, s, ctx) {
    st.turn = s;
    st.tick++;
    st.deadline = null;
    if (!st.timer) return;
    const ms = st.afk[s] >= 2 ? AFK_MS : TURN_MS;
    st.deadline = ctx.now() + ms;
    const key = st.tick;
    ctx.later(ms, () => {
        if (st.tick === key && st.phase === "bid" && st.turn === s) {
            st.afk[s]++;
            auto(st, s, ctx);
        }
    });
}

// out of time: call it if the bid looks too high, else the cheapest raise that suits your dice
function auto(st, s, ctx) {
    const mineOf = (f) => st.dice[s].filter((d) => matches(d, f)).length;
    const others = total(st) - st.count[s];
    const guess = (f) => mineOf(f) + others * (f === 1 ? 1 / 6 : 1 / 3);
    if (st.bid && st.bid.q > guess(st.bid.f) + 0.5) return challenge(st, s, "liar", ctx, true);
    const mins = minBids(st);
    let best = null;
    for (let f = 1; f <= 6; f++) {
        if (mins[f] === null) continue;
        const v = guess(f) - mins[f];
        if (!best || v > best.v) best = { f, q: mins[f], v };
    }
    if (!best) return challenge(st, s, "liar", ctx, true);
    bid(st, s, best.q, best.f, ctx, true);
}

function bid(st, s, q, f, ctx, auto) {
    st.bid = { q, f, seat: s };
    st.bids.push({ q, f, seat: s, auto: !!auto });
    startTurn(st, nextAlive(st, s), ctx);
}

function challenge(st, s, kind, ctx, auto) {
    const b = st.bid;
    const actual = st.dice.reduce((a, ds) => a + ds.filter((d) => matches(d, b.f)).length, 0);
    let loser = null, gainer = null;
    if (kind === "liar") loser = actual >= b.q ? s : b.seat;
    else if (actual === b.q) gainer = s;
    else loser = s;
    if (loser !== null) st.count[loser]--;
    if (gainer !== null && st.count[gainer] < DICE) st.count[gainer]++;
    if (loser !== null && !st.count[loser]) st.outAt[loser] = st.out++;
    st.last = { round: st.round, kind, caller: s, bid: b, actual, loser, gainer, dice: st.dice, auto: !!auto };
    st.phase = "reveal";
    st.tick++;
    const left = alive(st);
    if (left.length < 2 || st.round >= MAX_ROUNDS) {
        st.phase = "over";
        st.deadline = null;
        return;
    }
    st.deadline = ctx.now() + REVEAL_MS;
    const r = st.round;
    const starter = gainer !== null ? gainer : st.count[loser] ? loser : nextAlive(st, loser);
    ctx.later(REVEAL_MS, () => {
        if (st.round === r && st.phase === "reveal") newRound(st, starter, ctx);
    });
}

function pub(st) {
    return {
        n: st.n,
        phase: st.phase,
        round: st.round,
        turn: st.phase === "bid" ? st.turn : null,
        count: st.count,
        total: total(st),
        bid: st.bid,
        bids: st.bids,
        deadline: st.deadline,
        last: st.last,
        spot: st.spot,
    };
}

module.exports = {
    id: "liarsdice",
    name: "Liar's Dice",
    kind: "turn",
    quick: false,
    players: [2, 8],
    options: { timer: [true, false], spot: [true, false] },
    beats,
    init({ rng, ctx, options, players = 2 }) {
        const st = { n: players, count: new Array(players).fill(DICE), dice: [], round: 0, phase: "bid", turn: 0, tick: 0, bid: null, bids: [], deadline: null, last: null, out: 0, outAt: new Array(players).fill(null), afk: new Array(players).fill(0), timer: !options || options.timer !== false, spot: !options || options.spot !== false };
        newRound(st, Math.floor(rng() * players), ctx);
        return st;
    },
    view(st, seat) {
        const v = pub(st);
        v.myDice = st.phase === "bid" ? st.dice[seat] || [] : [];
        v.myTurn = st.phase === "bid" && st.turn === seat;
        v.min = v.myTurn ? minBids(st) : null;
        return v;
    },
    tv(st) {
        return pub(st);
    },
    move(st, seat, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (st.phase !== "bid" || st.turn !== seat) return { error: "It's not your turn." };
        st.afk[seat] = 0;
        if (p.act === "bid") {
            const { q, f } = p;
            if (!Number.isInteger(f) || f < 1 || f > 6) return { error: "Pick a face from 1 to 6." };
            if (!Number.isInteger(q) || q < 1 || q > total(st)) return { error: "There are only " + total(st) + " dice on the table." };
            if (!st.bid && f === 1) return { error: "You can't open on ones." };
            if (!beats(q, f, st.bid)) return { error: "That doesn't beat " + st.bid.q + " × " + st.bid.f + "." };
            bid(st, seat, q, f, ctx);
            return { ok: true };
        }
        if (p.act === "liar" || p.act === "spot") {
            if (!st.bid) return { error: "Nobody has bid yet." };
            if (p.act === "spot" && !st.spot) return { error: "Spot on is off this game." };
            challenge(st, seat, p.act, ctx);
            return { ok: true };
        }
        return { error: "Bad move." };
    },
    result(st) {
        if (st.phase !== "over") return null;
        const vals = st.count.map((n, s) => (n > 0 ? 1000 + n : st.outAt[s]));
        const left = alive(st);
        return ranked(vals, "high", left.length === 1 ? "Last one shaking, with " + st.count[left[0]] + " di" + (st.count[left[0]] === 1 ? "e" : "ce") + " left after " + st.round + " rounds." : "Out of time after " + st.round + " rounds.");
    },
};
