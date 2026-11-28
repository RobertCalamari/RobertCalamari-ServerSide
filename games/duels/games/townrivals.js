// Town Rivals: everyone builds ONE shared town, but for themselves. Each round a market of tiles is laid out where
// everyone can see it, and players draft in snake order (the last to pick goes first next round): buy a tile and place
// it on any open lot, or pass for coins. Tiles react to their neighbours, whoever owns them: parks lift every house
// next to them, factories pollute other people's houses, shops cash in on nearby houses, taverns love rival
// neighbours, thief dens rob them (unless the police are close). Your biggest connected district scores a bonus.
// After the last round, most points wins (tiles + district + 1 per 3 coins left).
const { ranked, seats } = require("../rank");
const ROUNDS = 9;
const START = 6;
const BASE = 2; // everyone's income each round
const PASS = 2;
const TURN_MS = 40000;
const DEFS = {
    house: { icon: "🏠", name: "House", cost: 2, w: 5, text: "1 point, +1 for each park next to it. −1 for each rival factory next to it." },
    park: { icon: "🌳", name: "Park", cost: 2, w: 3, text: "Every house next to it scores +1, even your rivals'." },
    farm: { icon: "🌾", name: "Farm", cost: 3, w: 3, text: "+2 coins every round." },
    factory: { icon: "🏭", name: "Factory", cost: 4, w: 2, text: "+3 coins every round. Rival houses next to it lose 1 point." },
    shop: { icon: "🏪", name: "Shop", cost: 3, w: 3, text: "+1 coin every round for each house next to it (anyone's)." },
    tavern: { icon: "🍺", name: "Tavern", cost: 3, w: 2, text: "+1 point for each rival tile next to it." },
    thief: { icon: "🦹", name: "Thief Den", cost: 3, w: 2, text: "Every round, steals 1 coin from each rival with a tile next to it. Stopped by police next to it." },
    police: { icon: "🚓", name: "Police", cost: 2, w: 2, text: "1 point. Thief dens next to it can't steal." },
    monument: { icon: "🏛️", name: "Monument", cost: 7, w: 1, text: "5 points, +1 if a park is next to it." },
    road: { icon: "🛣️", name: "Road", cost: 1, w: 3, text: "Links your tiles. Your biggest connected district scores +1 per tile." },
};
const BAG = Object.entries(DEFS).flatMap(([t, d]) => new Array(d.w).fill(t));
const sizeFor = (n) => (n <= 3 ? 7 : n <= 4 ? 8 : 9);

const at = (state, r, c) => (r < 0 || c < 0 || r >= state.size || c >= state.size ? undefined : state.cells[r * state.size + c]);
function around(state, i) {
    const r = Math.floor(i / state.size), c = i % state.size;
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && x >= 0 && y < state.size && x < state.size).map(([y, x]) => y * state.size + x);
}
const tileAt = (state, i) => {
    const x = state.cells[i];
    return x && x !== "rock" ? x : null;
};
const isPark = (x) => x && (x.t === "park" || x.t === "fountain");

// points for one tile where it stands
function tilePoints(state, i) {
    const x = tileAt(state, i);
    if (!x || x.o === null || x.o === undefined) return 0;
    const nb = around(state, i).map((j) => tileAt(state, j)).filter(Boolean);
    if (x.t === "house") return 1 + nb.filter(isPark).length - nb.filter((y) => y.t === "factory" && y.o !== x.o).length;
    if (x.t === "tavern") return nb.filter((y) => y.o !== null && y.o !== undefined && y.o !== x.o).length;
    if (x.t === "police") return 1;
    if (x.t === "monument") return 5 + (nb.some(isPark) ? 1 : 0);
    return 0;
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
function income(state) {
    const n = state.coins.length;
    const rows = seats(n).map(() => ({ base: BASE, farm: 0, factory: 0, shop: 0, stole: 0, lost: 0 }));
    state.cells.forEach((x, i) => {
        if (!x || x === "rock" || x.o === null || x.o === undefined) return;
        const nb = around(state, i).map((j) => tileAt(state, j)).filter(Boolean);
        if (x.t === "farm") rows[x.o].farm += 2;
        if (x.t === "factory") rows[x.o].factory += 3;
        if (x.t === "shop") rows[x.o].shop += nb.filter((y) => y.t === "house").length;
    });
    seats(n).forEach((s) => (state.coins[s] += rows[s].base + rows[s].farm + rows[s].factory + rows[s].shop));
    // thieves, after income so there's something to take
    state.cells.forEach((x, i) => {
        if (!x || x === "rock" || x.t !== "thief") return;
        const nb = around(state, i).map((j) => tileAt(state, j)).filter(Boolean);
        if (nb.some((y) => y.t === "police")) return;
        const victims = [...new Set(nb.filter((y) => y.o !== null && y.o !== undefined && y.o !== x.o).map((y) => y.o))];
        victims.forEach((v) => {
            if (state.coins[v] < 1) return;
            state.coins[v]--;
            state.coins[x.o]++;
            rows[x.o].stole++;
            rows[v].lost++;
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
    state.income = state.round > 1 ? income(state) : null;
    // snake: whoever picked last goes first next round
    const base = seats(n).map((i) => (i + state.round - 1) % n);
    state.order = state.round % 2 ? base : base.slice().reverse();
    if (state.round > 1 && state.order[0] === state.lastPicker) state.order.push(state.order.shift());
    state.pos = 0;
    state.pool = draw(state, ctx.rng, n + 2);
    state.picks = [];
    turn(state, ctx);
}
function turn(state, ctx) {
    state.turn = state.order[state.pos];
    const id = ++state.tick;
    state.deadline = state.timed ? ctx.now() + TURN_MS : null;
    if (state.timed) ctx.later(TURN_MS, () => state.tick === id && !state.over && doPass(state, state.turn, ctx, true));
}
function advance(state, ctx) {
    state.lastPicker = state.turn;
    state.pos++;
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
function doPass(state, s, ctx, auto) {
    state.coins[s] += PASS;
    state.picks.push({ s, pass: true, auto: !!auto });
    state.last = { s, pass: true, n: ++state.moves };
    advance(state, ctx);
}

function pub(state) {
    const n = state.coins.length;
    return {
        size: state.size,
        cells: state.cells,
        defs: DEFS,
        round: state.round,
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
    DEFS,
    tilePoints,
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
        const state = { size, cells, timed: options.timer !== false, round: 0, order: [], pos: 0, turn: null, deadline: null, tick: 0, ids: 0, moves: 0, pool: [], picks: [], coins: new Array(players).fill(START), income: null, last: null, lastPicker: null, over: false };
        startRound(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.myTurn = !state.over && state.turn === seat;
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (state.over) return { error: "The town is finished." };
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (state.turn !== seat) return { error: "It's not your turn." };
        if (p.act === "pass") {
            doPass(state, seat, ctx, false);
            return { ok: true };
        }
        if (p.act !== "take") return { error: "Bad move." };
        const k = state.pool.findIndex((x) => x.id === p.id);
        if (k < 0) return { error: "That tile's gone." };
        const t = state.pool[k].t;
        const cost = DEFS[t].cost;
        if (state.coins[seat] < cost) return { error: "You need " + cost + " coins for that." };
        const i = p.cell;
        if (!Number.isInteger(i) || i < 0 || i >= state.cells.length) return { error: "Pick a lot on the map." };
        if (state.cells[i]) return { error: "That lot is taken." };
        state.coins[seat] -= cost;
        state.pool.splice(k, 1);
        state.cells[i] = { t, o: seat };
        state.picks.push({ s: seat, t, cell: i });
        state.last = { s: seat, t, cell: i, n: ++state.moves };
        advance(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (!state.over) return null;
        const totals = seats(state.coins.length).map((s) => score(state, s).total);
        return ranked(totals, "high", "Top builder: " + Math.max(...totals) + " points after " + ROUNDS + " rounds");
    },
};
