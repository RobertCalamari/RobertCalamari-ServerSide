// Hush Auction: six lots, everyone bids in secret at the same time from one purse of 100 coins. Top bid wins the lot
// and pays; a tie at the top means nobody gets it and nobody pays. Some lots are mystery crates whose worth only shows
// once the hammer falls. Most points wins, leftover coins break ties.
const { ranked, seats } = require("../rank");
const LOTS = 6;
const COINS = 100;
const FIRST_MS = 25000;
const BID_MS = 20000;
const REVEAL_MS = 6500;

const POOL = [
    ["Clockwork Owl", "🦉"], ["Comet Shard", "☄️"], ["Jade Teapot", "🫖"], ["Pirate Compass", "🧭"], ["Golden Kazoo", "🎺"],
    ["Tiny Rocket", "🚀"], ["Moon Pebble", "🌑"], ["Royal Yo-yo", "🪀"], ["Dragon Egg", "🥚"], ["Velvet Map", "🗺️"],
    ["Magic Lamp", "🪔"], ["Lucky Clover", "🍀"], ["Crystal Ball", "🔮"], ["Ancient Coin", "🪙"], ["Painted Vase", "🏺"],
    ["Robot Butler", "🤖"], ["Fossil Fern", "🌿"], ["Glass Slipper", "👠"],
];
const MYSTERY = [0, 1, 2, 3, 11, 13, 15];

function shuffle(rng, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function makeLots(rng) {
    const box = shuffle(rng, [0, 1, 2, 3, 4, 5]).slice(0, 2);
    return shuffle(rng, POOL).slice(0, LOTS).map(([name, icon], i) => {
        const mystery = box.includes(i);
        return { name: mystery ? "Mystery crate" : name, icon: mystery ? "📦" : icon, value: mystery ? MYSTERY[Math.floor(rng() * MYSTERY.length)] : 2 + Math.floor(rng() * 8), mystery };
    });
}

function startLot(state, ctx) {
    state.lot++;
    state.phase = "bid";
    state.bids = state.coins.map(() => null);
    state.deadline = ctx.now() + (state.lot === 0 ? FIRST_MS : BID_MS);
    const lot = state.lot;
    ctx.later(state.deadline - ctx.now(), () => {
        if (state.lot === lot && state.phase === "bid") resolve(state, ctx);
    });
}

function resolve(state, ctx) {
    const bids = state.bids.map((b) => b || 0);
    const top = Math.max(...bids);
    const at = seats(bids.length).filter((s) => bids[s] === top);
    const lot = state.lots[state.lot];
    const winner = top > 0 && at.length === 1 ? at[0] : null;
    if (winner !== null) {
        state.coins[winner] -= top;
        state.points[winner] += lot.value;
    }
    lot.winner = winner;
    lot.paid = winner === null ? 0 : top;
    lot.open = true;
    state.last = { lot: state.lot, bids, winner, top, tie: top > 0 && at.length > 1, value: lot.value };
    state.phase = "reveal";
    state.deadline = ctx.now() + REVEAL_MS;
    const n = state.lot;
    ctx.later(REVEAL_MS, () => {
        if (state.lot !== n || state.phase !== "reveal") return;
        if (state.lot >= LOTS - 1) state.phase = "done";
        else startLot(state, ctx);
    });
}

function pub(state) {
    return {
        phase: state.phase,
        lot: state.lot,
        lots: state.lots.map((l) => ({ name: l.name, icon: l.icon, mystery: l.mystery, value: l.mystery && !l.open ? null : l.value, winner: l.open ? l.winner : null, paid: l.open ? l.paid : null, open: !!l.open })),
        deadline: state.deadline,
        coins: state.coins,
        points: state.points,
        in: state.phase === "bid" ? state.bids.map((b) => b !== null) : state.coins.map(() => false),
        last: state.last,
        purse: COINS,
    };
}

module.exports = {
    id: "hushbid",
    name: "Hush Auction",
    kind: "sim",
    quick: true,
    players: [3, 12],
    init({ rng, ctx, players = 3 }) {
        const state = { lots: makeLots(rng), coins: new Array(players).fill(COINS), points: new Array(players).fill(0), lot: -1, last: null };
        startLot(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.me = { bid: state.phase === "bid" ? state.bids[seat] : null };
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (state.phase !== "bid") return { error: "Bidding is closed." };
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.act === "unbid") {
            if (state.bids[seat] === null) return { ok: true, quiet: true };
            state.bids[seat] = null;
            return { ok: true };
        }
        if (p.act !== "bid") return { error: "Bad move." };
        const a = p.amt;
        if (!Number.isInteger(a) || a < 0) return { error: "Bid a whole number of coins." };
        if (a > state.coins[seat]) return { error: "You only have " + state.coins[seat] + " coins." };
        state.bids[seat] = a;
        if (state.bids.every((b) => b !== null)) resolve(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const best = Math.max(...state.points);
        const sold = state.lots.filter((l) => l.winner !== null).length;
        return ranked(seats(state.points.length).map((s) => state.points[s] * 1000 + state.coins[s]), "high", "Top haul " + best + " points · " + sold + " of " + LOTS + " lots sold");
    },
};
