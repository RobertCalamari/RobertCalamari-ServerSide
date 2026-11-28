// Town Rivals: everyone builds ONE shared town, but for themselves. Each round a market of tiles is laid out where
// everyone can see it. First everyone drafts in turn (buy one tile, or pass for coins), then everyone places what they
// bought in reverse order, so the last to pick is the first to build. The first picker moves round the table each round. 70 kinds of tile (townrivals/tiles.js), and they react to their neighbours
// whoever owns them: parks lift every home next to them, factories pollute rival homes, shops cash in on nearby
// homes, taverns love rival neighbours, gangs rob them unless the law is close. Your biggest connected district scores
// a bonus. After the last round, most points wins (tiles + district + 1 per 3 coins left).
const { ranked, seats } = require("../rank");
const { TILES } = require("../townrivals/tiles");
const ROUNDS = 9;
const START = 6;
const BASE = 2; // everyone's income each round
const PASS = 2;
const TURN_MS = 40000;
const BAG = Object.entries(TILES).flatMap(([t, d]) => new Array(d.w).fill(t));
const sizeFor = (n) => (n <= 3 ? 7 : n <= 4 ? 8 : 9);

function around(state, i) {
    const r = Math.floor(i / state.size), c = i % state.size;
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && x >= 0 && y < state.size && x < state.size).map(([y, x]) => y * state.size + x);
}
const tileAt = (state, i) => {
    const x = state.cells[i];
    return x && x !== "rock" ? x : null;
};
const has = (x, tag) => !tag || TILES[x.t].tags.includes(tag);
// does tile y count for a rule on tile x?
function counts(rule, x, y) {
    if (!has(y, rule.tag)) return false;
    if (rule.who === "mine") return y.o === x.o;
    if (rule.who === "rival") return y.o !== null && y.o !== undefined && y.o !== x.o;
    return true;
}
const nbOf = (state, i) => around(state, i).map((j) => tileAt(state, j)).filter(Boolean);
function others(state, i) {
    const out = [];
    state.cells.forEach((y, j) => y && y !== "rock" && j !== i && out.push(y));
    return out;
}

// points for one tile where it stands: its own, its neighbour bonuses, town-wide bonuses, and what neighbours give it
function tilePoints(state, i) {
    const x = tileAt(state, i);
    if (!x || x.o === null || x.o === undefined) return 0;
    const d = TILES[x.t];
    const nb = nbOf(state, i);
    let p = d.pts || 0;
    (d.adj || []).forEach((r) => r.pts && nb.forEach((y) => counts(r, x, y) && (p += r.pts)));
    (d.global || []).forEach((r) => r.pts && others(state, i).forEach((y) => counts(r, x, y) && (p += r.pts)));
    nb.forEach((y) => (TILES[y.t].give || []).forEach((g) => has(x, g.tag) && (g.who === "any" || (g.who === "mine" ? x.o === y.o : x.o !== y.o)) && (p += g.pts)));
    return p;
}
// coins one tile makes each round (lotteries count at their average for estimates)
function tileIncome(state, i, rng) {
    const x = tileAt(state, i);
    if (!x || x.o === null || x.o === undefined) return 0;
    const d = TILES[x.t];
    const nb = nbOf(state, i);
    let c = d.income || 0;
    (d.adj || []).forEach((r) => r.coins && nb.forEach((y) => counts(r, x, y) && (c += r.coins)));
    (d.global || []).forEach((r) => r.coins && others(state, i).forEach((y) => counts(r, x, y) && (c += r.coins)));
    if (d.special === "interest") c += Math.floor(state.coins[x.o] / 5);
    else if (Array.isArray(d.special)) c += rng ? d.special[0] + Math.floor(rng() * (d.special[1] - d.special[0] + 1)) : (d.special[0] + d.special[1]) / 2;
    return c;
}
// who a crime tile can rob this round
function victims(state, i) {
    const x = tileAt(state, i);
    const d = x && TILES[x.t];
    if (!d || !d.steal) return [];
    const nb = nbOf(state, i);
    if (nb.some((y) => has(y, "law"))) return [];
    return [...new Set(nb.filter((y) => y.o !== null && y.o !== undefined && y.o !== x.o).map((y) => y.o))];
}
function district(state, s) {
    const seen = new Set();
    let best = 0;
    state.cells.forEach((x, i) => {
        if (!x || x === "rock" || x.o !== s || seen.has(i)) return;
        let size = 0;
        const q = [i];
        seen.add(i);
        while (q.length) {
            const j = q.pop();
            size++;
            around(state, j).forEach((k) => {
                const y = tileAt(state, k);
                if (y && y.o === s && !seen.has(k)) {
                    seen.add(k);
                    q.push(k);
                }
            });
        }
        best = Math.max(best, size);
    });
    return best;
}
function score(state, s) {
    let tiles = 0;
    state.cells.forEach((x, i) => x && x !== "rock" && x.o === s && (tiles += tilePoints(state, i)));
    const dist = district(state, s);
    const coins = Math.floor(state.coins[s] / 3);
    return { tiles, district: dist, coins, total: tiles + dist + coins };
}
// what each player earns at the start of a round, and who gets robbed
function income(state, rng) {
    const n = state.coins.length;
    const rows = seats(n).map(() => ({ base: BASE, tiles: 0, stole: 0, lost: 0 }));
    const earned = state.cells.map((x, i) => (x && x !== "rock" && x.o !== null && x.o !== undefined ? tileIncome(state, i, rng) : 0));
    earned.forEach((c, i) => c && (rows[state.cells[i].o].tiles += c));
    seats(n).forEach((s) => (state.coins[s] += rows[s].base + rows[s].tiles));
    state.cells.forEach((x, i) => {
        if (!x || x === "rock" || !TILES[x.t].steal) return;
        victims(state, i).forEach((v) => {
            const take = Math.min(TILES[x.t].steal, state.coins[v]);
            if (!take) return;
            state.coins[v] -= take;
            state.coins[x.o] += take;
            rows[x.o].stole += take;
            rows[v].lost += take;
        });
    });
    return rows;
}
function draw(state, rng, k) {
    return Array.from({ length: k }, () => ({ id: ++state.ids, t: BAG[Math.floor(rng() * BAG.length)] }));
}
function startRound(state, ctx) {
    state.round++;
    const n = state.coins.length;
    state.income = state.round > 1 ? income(state, ctx.rng) : null;
    state.phase = "draft";
    state.order = seats(n).map((i) => (i + state.round - 1) % n);
    state.pos = 0;
    state.pool = draw(state, ctx.rng, n + 3);
    state.picks = [];
    state.hands = seats(n).map(() => null);
    turn(state, ctx);
}
function turn(state, ctx) {
    state.turn = state.order[state.pos];
    const id = ++state.tick;
    state.deadline = state.timed ? ctx.now() + TURN_MS : null;
    if (state.timed) ctx.later(TURN_MS, () => state.tick === id && !state.over && (state.phase === "draft" ? doPass(state, state.turn, ctx, true) : autoPlace(state, state.turn, ctx)));
}
function advance(state, ctx) {
    state.pos++;
    if (state.phase === "draft" && state.pos >= state.order.length) {
        // everyone who bought a tile places it, last picker first
        state.phase = "place";
        state.order = state.order.slice().reverse().filter((s) => state.hands[s]);
        state.pos = 0;
    }
    if (state.pos < state.order.length) return turn(state, ctx);
    if (state.round >= ROUNDS) {
        state.over = true;
        state.turn = null;
        state.deadline = null;
        state.tick++;
        return;
    }
    startRound(state, ctx);
}
function place(state, s, i) {
    const t = state.hands[s].t;
    state.hands[s] = null;
    state.cells[i] = { t, o: s };
    const pk = state.picks.find((p) => p.s === s);
    if (pk) pk.cell = i;
    state.last = { s, t, cell: i, n: ++state.moves };
}
function autoPlace(state, s, ctx) {
    const g = gains(state, s, [state.hands[s].t])[state.hands[s].t];
    let best = -1;
    g.forEach((v, i) => v && (best < 0 || v[0] + v[1] / 3 > g[best][0] + g[best][1] / 3) && (best = i));
    if (best >= 0) place(state, s, best);
    else state.hands[s] = null;
    advance(state, ctx);
}
function doPass(state, s, ctx, auto) {
    state.coins[s] += PASS;
    state.picks.push({ s, pass: true, auto: !!auto });
    state.last = { s, pass: true, n: ++state.moves };
    advance(state, ctx);
}
// for the player picking: what each market tile would add to their points on every open lot
function gains(state, s, kinds) {
    const before = score(state, s);
    const base = before.tiles + before.district;
    const out = {};
    kinds.forEach((t) => {
        if (out[t]) return;
        out[t] = state.cells.map((x, i) => {
            if (x) return null;
            state.cells[i] = { t, o: s };
            const a = score(state, s);
            const coins = tileIncome(state, i);
            state.cells[i] = null;
            return [a.tiles + a.district - base, Math.round(coins * 10) / 10];
        });
    });
    return out;
}

function pub(state) {
    const n = state.coins.length;
    return {
        size: state.size,
        cells: state.cells,
        defs: TILES,
        round: state.round,
        phase: state.phase,
        hands: state.hands,
        rounds: ROUNDS,
        order: state.order,
        pos: state.pos,
        turn: state.turn,
        deadline: state.deadline,
        pool: state.pool,
        picks: state.picks,
        coins: state.coins,
        scores: seats(n).map((s) => score(state, s)),
        income: state.income,
        last: state.last,
        over: !!state.over,
        pass: PASS,
    };
}

module.exports = {
    id: "townrivals",
    name: "Town Rivals",
    kind: "turn",
    quick: false,
    players: [2, 6],
    options: { timer: [true, false] },
    TILES,
    tilePoints,
    tileIncome,
    victims,
    score,
    init({ rng, ctx, players = 2, options = {} }) {
        const size = sizeFor(players);
        const cells = new Array(size * size).fill(null);
        const mid = Math.floor(size / 2) * size + Math.floor(size / 2);
        cells[mid] = { t: "fountain", o: null };
        // a few rocks so every town looks different
        for (let k = 0; k < Math.floor(size / 2); k++) {
            const i = Math.floor(rng() * cells.length);
            if (!cells[i]) cells[i] = "rock";
        }
        const state = { size, cells, timed: options.timer !== false, round: 0, phase: "draft", hands: [], order: [], pos: 0, turn: null, deadline: null, tick: 0, ids: 0, moves: 0, pool: [], picks: [], coins: new Array(players).fill(START), income: null, last: null, over: false };
        startRound(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.myTurn = !state.over && state.turn === seat;
        v.gains = v.myTurn ? gains(state, seat, state.phase === "place" ? [state.hands[seat].t] : state.pool.map((p) => p.t)) : null;
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (state.over) return { error: "The town is finished." };
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (state.turn !== seat) return { error: "It's not your turn." };
        if (state.phase === "place") {
            if (p.act !== "place") return { error: "Place your tile on an open lot." };
            const i = p.cell;
            if (!Number.isInteger(i) || i < 0 || i >= state.cells.length) return { error: "Pick a lot on the map." };
            if (state.cells[i]) return { error: "That lot is taken." };
            place(state, seat, i);
            advance(state, ctx);
            return { ok: true };
        }
        if (p.act === "pass") {
            doPass(state, seat, ctx, false);
            return { ok: true };
        }
        if (p.act !== "take") return { error: "Bad move." };
        const k = state.pool.findIndex((x) => x.id === p.id);
        if (k < 0) return { error: "That tile's gone." };
        const t = state.pool[k].t;
        const cost = TILES[t].cost;
        if (state.coins[seat] < cost) return { error: "You need " + cost + " coins for that." };
        state.coins[seat] -= cost;
        state.pool.splice(k, 1);
        state.hands[seat] = { id: p.id, t };
        state.picks.push({ s: seat, t });
        state.last = { s: seat, t, n: ++state.moves };
        advance(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (!state.over) return null;
        const totals = seats(state.coins.length).map((s) => score(state, s).total);
        return ranked(totals, "high", "Top builder: " + Math.max(...totals) + " points after " + ROUNDS + " rounds");
    },
};
