// Ripple Market: five made-up companies, 8 rounds of secret trading. Every company quietly runs its own movement
// pattern, picked from a big list (up, up, crash; a slow climb with a dip...), starting at a random point in it, and a
// couple of them just copy another company's last move (or do the opposite). Read the charts and spot the pattern.
// Each round: a public headline, a trading window (buy/sell at the posted price, play one action card), then prices
// move on the pattern, the news, net money in/out, cards and a little noise. Cards aren't free: buy them, or earn one
// by selling at a good profit. Richest (cash + shares at final prices) wins.
const { ranked, seats } = require("../rank");
const ROUNDS = 8;
const CASH = 1000;
const FIRST_MS = 45000;
const TRADE_MS = 40000;
const REVEAL_MS = 7000;
const HAND = 3;
const BUST = 6;
const CARD = 0.1;
const EARN = 0.3; // sell at 30%+ over what you paid and you earn a card
const COST = { hype: 70, rumor: 70, freeze: 90, tip: 110 };
const POOL = [
    ["Glowbean Coffee", "GLOW", "☕"], ["Orbitail Freight", "ORBT", "🚀"], ["Mossy Gardens", "MOSS", "🌿"], ["Pixelpine Games", "PIXL", "🕹️"],
    ["Tidewell Energy", "TIDE", "🌊"], ["Brickhen Builders", "BRIK", "🧱"], ["Honeycomb Health", "HONY", "🍯"], ["Zipwing Couriers", "ZIPW", "📦"],
    ["Fernlight Solar", "FERN", "☀️"], ["Puddle Pets", "PUDL", "🐾"], ["Copperpot Foods", "COPR", "🍲"], ["Nimbus Data", "NIMB", "☁️"],
];
const COLORS = ["#3ec1ff", "#ff6b9a", "#ffd23f", "#57e389", "#c08cff"];
const CARDS = ["hype", "rumor", "tip", "freeze"];
// moves per round (fractions), repeated
const PATTERNS = [
    ["Steady climber", [0.06]],
    ["Slow fader", [-0.05]],
    ["Two up, one down", [0.08, 0.08, -0.13]],
    ["Up one, down three", [0.14, -0.05, -0.05, -0.05]],
    ["Seesaw", [0.12, -0.1]],
    ["Big zigzag", [0.2, -0.16]],
    ["Slow climb, then a crash", [0.07, 0.07, 0.07, -0.22]],
    ["Dip, dip, rocket", [-0.06, -0.06, 0.2]],
    ["Asleep, then a jump", [0, 0, 0.24]],
    ["Wave", [0.04, 0.08, 0.04, -0.04, -0.08, -0.04]],
    ["Stairs", [0.1, 0, 0.1, 0, -0.15]],
    ["Heartbeat", [0, 0.15, -0.1, 0]],
    ["Spike and slide", [0.22, -0.08, -0.06, -0.04]],
    ["Sinker with a bounce", [-0.08, -0.08, 0.13]],
    ["Drifter", [0.03, 0.03, -0.02]],
    ["Double or nothing", [0.15, 0.15, -0.25]],
];
const FOLLOW = [
    [1, "copies"],
    [1.5, "copies, bigger"],
    [0.5, "copies, smaller"],
    [-1, "does the opposite of"],
];
const GOOD = ["{a} lands a giant new contract", "{a} unveils a surprise hit product", "{a} smashes its sales forecast", "A celebrity can't stop raving about {a}", "{a} opens fifty new locations", "{a} wins product of the year"];
const BAD = ["Fire shuts a {a} factory", "{a}'s CEO quits without warning", "{a} recalls its best seller", "Regulators open a probe into {a}", "Hackers leak {a}'s secret plans", "{a} misses its numbers badly"];
const PAIR = ["{a} and {b} announce a joint venture", "{a} and {b} sign a huge supply deal"];
const SWING = ["{a} poaches {b}'s top engineers", "{a} wins the contract {b} wanted"];
const CALM = ["A quiet day on the trading floor", "Markets hold their breath for tomorrow"];
const pickOne = (rng, list) => list[Math.floor(rng() * list.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fill = (t, a, b) => t.replace("{a}", a).replace("{b}", b);
function shuffle(rng, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
// 3-4 companies run a pattern; the rest follow one of those
function makeMoves(rng) {
    const pats = shuffle(rng, PATTERNS.map((_, i) => i));
    const order = shuffle(rng, [0, 1, 2, 3, 4]);
    const followers = rng() < 0.5 ? 1 : 2;
    const moves = [];
    order.forEach((co, k) => {
        if (k < 5 - followers) moves[co] = { p: pats[k], at: Math.floor(rng() * PATTERNS[pats[k]][1].length) };
    });
    const leaders = order.slice(0, 5 - followers);
    order.slice(5 - followers).forEach((co) => (moves[co] = { follow: pickOne(rng, leaders), f: Math.floor(rng() * FOLLOW.length) }));
    return moves;
}
// this round's built-in move for a pattern company
const step = (m, round) => {
    const seq = PATTERNS[m.p][1];
    return seq[(m.at + round - 1) % seq.length];
};
const arrow = (x) => (x >= 0.15 ? "⏫" : x > 0.015 ? "🔼" : x <= -0.15 ? "⏬" : x < -0.015 ? "🔽" : "➖");
function describe(state, co) {
    const m = state.moves[co];
    if (m.follow !== undefined) return state.cos[co].tick + " " + FOLLOW[m.f][1] + " " + state.cos[m.follow].tick + "'s last move";
    return PATTERNS[m.p][0];
}
function makeNews(rng, cos, round) {
    const names = cos.map((c) => c.name);
    const r = rng();
    const [a, b] = shuffle(rng, [0, 1, 2, 3, 4]);
    const v = (lo, hi) => Math.round((lo + rng() * (hi - lo)) * 100) / 100;
    if (round === 1 || r < 0.4) return { text: fill(pickOne(rng, GOOD), names[a]), eff: [{ co: a, v: v(0.08, 0.16) }] };
    if (r < 0.75) return { text: fill(pickOne(rng, BAD), names[a]), eff: [{ co: a, v: -v(0.1, 0.2) }] };
    if (r < 0.85) return { text: fill(pickOne(rng, PAIR), names[a], names[b]), eff: [{ co: a, v: v(0.05, 0.1) }, { co: b, v: v(0.05, 0.1) }] };
    if (r < 0.95) return { text: fill(pickOne(rng, SWING), names[a], names[b]), eff: [{ co: a, v: v(0.06, 0.12) }, { co: b, v: -v(0.08, 0.14) }] };
    return { text: pickOne(rng, CALM), eff: [] };
}
const worth = (state, s) => state.cash[s] + state.hold[s].reduce((t, q, c) => t + q * state.price[c], 0);
function giveCard(state, s, rng, why) {
    if (state.hands[s].length >= HAND) return null;
    const type = pickOne(rng, CARDS);
    state.hands[s].push({ type, used: false, why });
    return type;
}
function startRound(state, ctx) {
    state.round++;
    state.phase = "trade";
    state.deadline = ctx.now() + (state.round === 1 ? FIRST_MS : TRADE_MS);
    state.ready = state.cash.map(() => false);
    state.net = [0, 0, 0, 0, 0];
    state.played = state.cash.map(() => null);
    // used cards leave your hand at the start of the next round
    state.hands = state.hands.map((h) => h.filter((c) => !c.used));
    const round = state.round;
    ctx.later(state.deadline - ctx.now(), () => {
        if (state.round === round && state.phase === "trade") resolve(state, ctx);
    });
}
function resolve(state, ctx) {
    const n = state.cash.length;
    const total = state.net.map((x) => 0.12 * Math.tanh(x / (n * 150) / 2.5));
    const frozen = [false, false, false, false, false];
    const cards = [];
    state.played.forEach((p) => {
        if (!p) return;
        cards.push({ type: p.type, co: p.type === "tip" ? null : p.co });
        if (p.type === "hype") total[p.co] += CARD;
        if (p.type === "rumor") total[p.co] -= CARD;
        if (p.type === "freeze") frozen[p.co] = true;
    });
    const news = state.news[state.round - 1];
    news.eff.forEach((e) => (total[e.co] += e.v));
    // patterns first, then the followers copy their leader's last move
    const built = state.moves.map((m) => (m.follow === undefined ? step(m, state.round) : 0));
    state.moves.forEach((m, i) => {
        if (m.follow !== undefined) built[i] = FOLLOW[m.f][0] * (state.lastMove[m.follow] || 0);
    });
    const from = state.price.slice();
    state.price = state.price.map((p, i) => {
        if (!p || frozen[i]) return p;
        const np = Math.round(p * (1 + clamp(built[i] + total[i] + (ctx.rng() - 0.5) * 0.03, -0.5, 0.6)));
        return np < BUST ? 0 : np;
    });
    state.lastMove = state.price.map((p, i) => (from[i] ? p / from[i] - 1 : 0));
    state.price.forEach((p, i) => state.hist[i].push(p));
    state.last = { round: state.round, from, to: state.price.slice(), frozen, cards: shuffle(ctx.rng, cards), news: news.text };
    state.phase = "reveal";
    state.deadline = ctx.now() + REVEAL_MS;
    const round = state.round;
    ctx.later(REVEAL_MS, () => {
        if (state.round !== round || state.phase !== "reveal") return;
        if (state.round >= ROUNDS) state.phase = "done";
        else startRound(state, ctx);
    });
}
function bigTrades(state) {
    return state.trades
        .filter((t) => t.qty)
        .sort((a, b) => Math.abs(b.qty * b.price) - Math.abs(a.qty * a.price))
        .slice(0, 5);
}
function pub(state) {
    const done = state.phase === "done";
    return {
        phase: state.phase,
        round: state.round,
        rounds: ROUNDS,
        deadline: state.deadline,
        companies: state.cos,
        price: state.price,
        hist: state.hist,
        news: state.news[state.round - 1].text,
        newsLog: state.news.slice(0, state.round).map((x) => x.text),
        worth: seats(state.cash.length).map((s) => worth(state, s)),
        ready: state.ready,
        last: state.last,
        cash0: CASH,
        costs: COST,
        patterns: done ? state.cos.map((c, i) => ({ co: i, text: describe(state, i), seq: state.moves[i].follow === undefined ? PATTERNS[state.moves[i].p][1].map(arrow).join(" ") : null })) : null,
        big: done ? bigTrades(state) : null,
    };
}
module.exports = {
    id: "ripple",
    name: "Ripple Market",
    kind: "sim",
    quick: false,
    players: [2, 8],
    PATTERNS,
    init({ rng, ctx, players = 2 }) {
        const cos = shuffle(rng, POOL).slice(0, 5).map(([name, tick, icon], i) => ({ name, tick, icon, color: COLORS[i] }));
        const price = cos.map(() => 40 + Math.floor(rng() * 81));
        const state = {
            cos,
            price,
            hist: price.map((p) => [p]),
            moves: makeMoves(rng),
            lastMove: [0, 0, 0, 0, 0],
            news: Array.from({ length: ROUNDS }, (_, r) => makeNews(rng, cos, r + 1)),
            cash: new Array(players).fill(CASH),
            hold: seats(players).map(() => [0, 0, 0, 0, 0]),
            paid: seats(players).map(() => [0, 0, 0, 0, 0]),
            hands: seats(players).map(() => []),
            tips: seats(players).map(() => []),
            trades: [],
            round: 0,
            last: null,
        };
        startRound(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.me = { cash: state.cash[seat], hold: state.hold[seat], paid: state.paid[seat], hand: state.hands[seat], played: state.played[seat], tips: state.tips[seat], earned: state.earned && state.earned[seat] };
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (state.phase !== "trade") return { error: "Trading is closed." };
        if (!p || typeof p !== "object") return { error: "Bad move." };
        const co = p.co;
        const okCo = Number.isInteger(co) && co >= 0 && co < 5;
        if (p.act === "ready") {
            state.ready[seat] = p.on !== false;
            if (state.ready.every(Boolean)) resolve(state, ctx);
            return { ok: true };
        }
        if (state.ready[seat]) return { error: "You're marked ready. Undo it to trade." };
        if (p.act === "trade") {
            const qty = p.qty;
            if (!okCo || !Number.isInteger(qty) || qty === 0 || Math.abs(qty) > 100000) return { error: "Pick a company and an amount." };
            const price = state.price[co];
            if (!price) return { error: state.cos[co].name + " went bust." };
            if (qty > 0 && qty * price > state.cash[seat]) return { error: "Not enough cash." };
            if (qty < 0 && -qty > state.hold[seat][co]) return { error: "You don't have that many shares." };
            const have = state.hold[seat][co];
            const avg = have ? state.paid[seat][co] / have : 0;
            state.cash[seat] -= qty * price;
            state.hold[seat][co] += qty;
            if (qty > 0) state.paid[seat][co] += qty * price;
            else state.paid[seat][co] = avg * state.hold[seat][co];
            state.net[co] += qty * price;
            const t = state.trades.find((x) => x.seat === seat && x.co === co && x.round === state.round);
            if (t) t.qty += qty;
            else state.trades.push({ seat, co, qty, price, round: state.round });
            // a good sale earns a card
            if (qty < 0 && avg && price >= avg * (1 + EARN) && -qty * (price - avg) >= 50) {
                const got = giveCard(state, seat, ctx.rng, "earned");
                if (got) {
                    state.earned = state.earned || state.cash.map(() => null);
                    state.earned[seat] = { type: got, round: state.round, co };
                }
            }
            return { ok: true };
        }
        if (p.act === "buycard") {
            const type = p.type;
            if (!COST[type]) return { error: "Pick a card to buy." };
            if (state.hands[seat].length >= HAND) return { error: "Your hand is full (" + HAND + " cards)." };
            if (state.cash[seat] < COST[type]) return { error: "Not enough cash." };
            state.cash[seat] -= COST[type];
            state.hands[seat].push({ type, used: false, why: "bought" });
            return { ok: true };
        }
        if (p.act === "card") {
            const card = state.hands[seat][p.i];
            if (!Number.isInteger(p.i) || !card || card.used) return { error: "You don't have that card." };
            if (state.played[seat]) return { error: "One card per round." };
            if (!okCo || !state.price[co]) return { error: "Pick a company for that card." };
            card.used = true;
            state.played[seat] = { type: card.type, co };
            if (card.type === "tip") {
                const m = state.moves[co];
                let text;
                if (m.follow !== undefined) text = describe(state, co);
                else {
                    const next = [0, 1, 2].map((k) => step(m, state.round + k));
                    text = "Its next 3 moves without news: " + next.map(arrow).join(" ");
                }
                state.tips[seat] = state.tips[seat].filter((t) => t.co !== co).concat({ co, text, round: state.round });
            }
            return { ok: true };
        }
        return { error: "Bad move." };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const w = seats(state.cash.length).map((s) => worth(state, s));
        const best = Math.max(...w);
        const bust = state.cos.filter((c, i) => !state.price[i]).map((c) => c.tick);
        const text = "Richest ended on " + best.toLocaleString("en-US") + " from " + CASH.toLocaleString("en-US") + (bust.length ? " · " + bust.join(", ") + " went bust" : "");
        return ranked(w, "high", text);
    },
};
