// Price Tag Panic: everyone gets the same shelf and the same budget. Fill your cart to get as close to the budget as you
// can without going over, then lock it in. Every budget can be hit exactly. Five rounds that get harder (more items,
// cents, a sale sticker). Score = how much of the budget you used, +50 for exact, a small bonus for locking in early.
// options.timer = false: no clock, the round ends when everyone has locked in (or the host calls time).
const { ranked, seats } = require("../rank");
const ROUNDS = 5;
const COUNT_MS = 3000;
const REVEAL_MS = 5500;
const HURRY_MS = 8000;
const EXACT = 50;
const EARLY = 20;
const LEVELS = [
    { items: 6, pick: [2, 3], cents: false, ms: 30000, sale: false },
    { items: 8, pick: [3, 4], cents: false, ms: 30000, sale: false },
    { items: 8, pick: [3, 4], cents: true, ms: 35000, sale: false },
    { items: 10, pick: [3, 5], cents: true, ms: 40000, sale: true },
    { items: 12, pick: [4, 5], cents: true, ms: 45000, sale: true },
];
const SHOP = [
    ["🧦", "Glow socks", 4, 12], ["🍞", "Turbo toaster", 18, 45], ["🪴", "Sulky cactus", 6, 20], ["🎧", "Squeaky headphones", 15, 60],
    ["🕯️", "Wet dog candle", 5, 15], ["🧸", "Grumpy bear", 9, 25], ["🥤", "Bottomless cup", 3, 9], ["🪥", "Electric toothbrush", 12, 40],
    ["🛼", "One roller skate", 14, 38], ["🧴", "Mystery lotion", 4, 14], ["📎", "Paperclip chain", 2, 6], ["🧢", "Backwards cap", 8, 22],
    ["🪀", "Yo-yo pro", 5, 16], ["🎲", "Lucky dice", 3, 10], ["🧲", "Fridge magnet set", 4, 12], ["🫖", "Tiny teapot", 10, 30],
    ["🪑", "Wobbly stool", 20, 55], ["🔦", "Spooky torch", 7, 21], ["🎈", "Balloon bundle", 3, 11], ["🧃", "Juice crate", 6, 18],
    ["🧤", "Left glove", 5, 13], ["🪁", "Storm kite", 12, 34], ["📓", "Dramatic diary", 4, 15], ["🧽", "Sponge family", 2, 8],
    ["🍫", "Giant chocolate", 3, 12], ["🕶️", "Night sunglasses", 9, 28], ["🧯", "Small extinguisher", 16, 42], ["🛁", "Rubber duck army", 6, 19],
    ["⏰", "Shouting alarm", 8, 24], ["🎸", "Air guitar case", 11, 33], ["🧩", "999-piece puzzle", 7, 20], ["🪣", "Leaky bucket", 3, 9],
    ["🥾", "Puddle boots", 19, 48], ["🍿", "Popcorn barrel", 5, 14], ["🧁", "Cupcake tower", 8, 26], ["🪞", "Honest mirror", 13, 36],
];

function makeShelf(rng, lv, round) {
    const pool = seats(SHOP.length);
    const shelf = seats(lv.items).map(() => {
        const [icon, name, lo, hi] = SHOP[pool.splice(Math.floor(rng() * pool.length), 1)[0]];
        let price = (lo + Math.floor(rng() * (hi - lo + 1))) * 100;
        if (lv.cents) price += [0, 25, 49, 50, 75, 99][Math.floor(rng() * 6)];
        return { icon, name, price, was: null };
    });
    if (lv.sale) {
        const k = Math.floor(rng() * shelf.length);
        shelf[k].was = shelf[k].price;
        shelf[k].price = Math.round(shelf[k].price / 2);
    }
    const n = lv.pick[0] + Math.floor(rng() * (lv.pick[1] - lv.pick[0] + 1));
    const idx = seats(shelf.length);
    const answer = seats(n).map(() => idx.splice(Math.floor(rng() * idx.length), 1)[0]).sort((a, b) => a - b);
    const budget = answer.reduce((a, i) => a + shelf[i].price, 0);
    return { round, shelf, budget, answer };
}

const total = (state, s) => state.carts[s].reduce((a, i) => a + state.cur.shelf[i].price, 0);

function startRound(state, ctx) {
    state.round++;
    const lv = LEVELS[state.round];
    state.cur = state.rounds[state.round];
    state.phase = "count";
    state.carts = seats(state.n).map(() => []);
    state.lockedAt = seats(state.n).map(() => null);
    state.got = seats(state.n).map(() => 0);
    const now = ctx.now();
    state.startAt = now + COUNT_MS;
    state.deadline = state.timed ? state.startAt + lv.ms : null;
    const run = ++state.run;
    ctx.later(COUNT_MS, () => {
        if (state.run !== run) return;
        state.phase = "shop";
        if (state.timed) arm(state, ctx);
    });
}

function arm(state, ctx) {
    const run = state.run;
    const tick = ++state.tick;
    ctx.later(Math.max(0, state.deadline - ctx.now()), () => state.run === run && state.tick === tick && state.phase === "shop" && endRound(state, ctx));
}

function endRound(state, ctx) {
    const b = state.cur.budget;
    const lv = LEVELS[state.round];
    const order = seats(state.n).filter((s) => state.lockedAt[s] !== null).sort((x, y) => state.lockedAt[x] - state.lockedAt[y]);
    for (const s of seats(state.n)) {
        const t = total(state, s);
        let pts = 0;
        if (t <= b && t > 0) {
            pts = Math.round((100 * t) / b);
            if (t === b) pts += EXACT;
            if (state.lockedAt[s] !== null) pts += state.timed ? Math.round((EARLY * Math.max(0, lv.ms - state.lockedAt[s])) / lv.ms) : Math.max(0, EARLY - order.indexOf(s) * 5);
        }
        state.got[s] = pts;
        state.points[s] += pts;
    }
    state.phase = "reveal";
    state.deadline = null;
    state.revealAt = ctx.now() + REVEAL_MS;
    const run = ++state.run;
    ctx.later(REVEAL_MS, () => {
        if (state.run !== run) return;
        if (state.round + 1 >= ROUNDS) state.phase = "done";
        else startRound(state, ctx);
    });
}

function pub(state) {
    const c = state.cur;
    const shown = state.phase === "reveal" || state.phase === "done";
    return {
        phase: state.phase,
        round: state.round,
        rounds: ROUNDS,
        timed: state.timed,
        startAt: state.startAt,
        deadline: state.deadline,
        budget: c.budget,
        shelf: state.phase === "count" ? null : c.shelf,
        locked: state.lockedAt.map((t) => t !== null),
        points: state.points,
        got: state.got,
        totals: shown ? seats(state.n).map((s) => total(state, s)) : null,
        carts: shown ? state.carts : null,
        answer: shown ? c.answer : null,
    };
}

module.exports = {
    id: "pricetag",
    name: "Price Tag Panic",
    kind: "race",
    quick: true,
    players: [1, 10],
    options: { timer: [true, false] },
    init({ rng, ctx, players = 2, options = {} }) {
        const state = {
            n: players, round: -1, run: 0, tick: 0, phase: "count", timed: options.timer !== false,
            rounds: LEVELS.map((lv, i) => makeShelf(rng, lv, i)), points: new Array(players).fill(0),
        };
        startRound(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.cart = state.carts[seat];
        v.total = total(state, seat);
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.act === "hurry") {
            if (!ctx.host) return { error: "Only the host can call time." };
            if (state.phase !== "shop") return { ok: true, quiet: true };
            if (state.deadline && state.deadline - ctx.now() <= HURRY_MS) return { ok: true, quiet: true };
            state.deadline = ctx.now() + HURRY_MS;
            arm(state, ctx);
            return { ok: true };
        }
        if (state.phase !== "shop") return { error: state.phase === "count" ? "The shop isn't open yet." : "Tills are closed." };
        if (state.lockedAt[seat] !== null) return { error: "Your cart's locked in." };
        const cart = state.carts[seat];
        if (p.act === "toggle") {
            const i = p.i;
            if (!Number.isInteger(i) || i < 0 || i >= state.cur.shelf.length) return { error: "That's not on the shelf." };
            const k = cart.indexOf(i);
            if (k >= 0) cart.splice(k, 1);
            else cart.push(i);
            return { ok: true };
        }
        if (p.act === "clear") {
            state.carts[seat] = [];
            return { ok: true };
        }
        if (p.act === "lock") {
            const t = total(state, seat);
            if (!t) return { error: "Your cart's empty." };
            if (t > state.cur.budget) return { error: "Over budget! Take something out." };
            state.lockedAt[seat] = ctx.now() - state.startAt;
            if (state.lockedAt.every((x) => x !== null)) endRound(state, ctx);
            return { ok: true };
        }
        return { error: "Bad move." };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const best = Math.max(...state.points);
        const r = ranked(state.points, "high", "Best shopper: " + best + " points over " + ROUNDS + " rounds");
        if (state.n === 1) r.score = state.points[0];
        return r;
    },
};
