// Ripple Market: five made-up companies, 8 rounds of secret trading. Every company is quietly linked to 1-2 others
// (a hidden ripple map per game), so a move in one drags its partners along. Each round: a public headline, a
// trading window (everyone buys/sells at the posted price, may play one action card), then prices move on net
// money in/out, news, cards, the ripples and a little noise. Richest (cash + shares at final prices) wins.
const { ranked, seats } = require("../rank");
const ROUNDS = 8;
const CASH = 1000;
const FIRST_MS = 45000;
const TRADE_MS = 40000;
const REVEAL_MS = 7000;
const HAND = 3;
const BUST = 6;
const CARD = 0.1;

const POOL = [
    ["Glowbean Coffee", "GLOW", "☕"], ["Orbitail Freight", "ORBT", "🚀"], ["Mossy Gardens", "MOSS", "🌿"], ["Pixelpine Games", "PIXL", "🕹️"],
    ["Tidewell Energy", "TIDE", "🌊"], ["Brickhen Builders", "BRIK", "🧱"], ["Honeycomb Health", "HONY", "🍯"], ["Zipwing Couriers", "ZIPW", "📦"],
    ["Fernlight Solar", "FERN", "☀️"], ["Puddle Pets", "PUDL", "🐾"], ["Copperpot Foods", "COPR", "🍲"], ["Nimbus Data", "NIMB", "☁️"],
];
const COLORS = ["#3ec1ff", "#ff6b9a", "#ffd23f", "#57e389", "#c08cff"];
const CARDS = ["hype", "rumor", "tip", "freeze"];
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

function makeLinks(rng) {
    return [0, 1, 2, 3, 4].map((i) => {
        const others = shuffle(rng, [0, 1, 2, 3, 4].filter((j) => j !== i));
        return others.slice(0, rng() < 0.5 ? 1 : 2).map((to) => ({ to, w: (rng() < 0.62 ? 1 : -1) * (3 + Math.floor(rng() * 5)) / 10 }));
    });
}

function makeNews(rng, cos, round) {
    const names = cos.map((c) => c.name);
    const r = rng();
    const [a, b] = shuffle(rng, [0, 1, 2, 3, 4]);
    const v = (lo, hi) => Math.round((lo + rng() * (hi - lo)) * 100) / 100;
    if (round === 1 || r < 0.4) return { text: fill(pickOne(rng, GOOD), names[a]), eff: [{ co: a, v: v(0.1, 0.2) }] };
    if (r < 0.75) return { text: fill(pickOne(rng, BAD), names[a]), eff: [{ co: a, v: -v(0.12, 0.26) }] };
    if (r < 0.85) return { text: fill(pickOne(rng, PAIR), names[a], names[b]), eff: [{ co: a, v: v(0.06, 0.12) }, { co: b, v: v(0.06, 0.12) }] };
    if (r < 0.95) return { text: fill(pickOne(rng, SWING), names[a], names[b]), eff: [{ co: a, v: v(0.08, 0.14) }, { co: b, v: -v(0.1, 0.16) }] };
    return { text: pickOne(rng, CALM), eff: [] };
}

const worth = (state, s) => state.cash[s] + state.hold[s].reduce((t, q, c) => t + q * state.price[c], 0);

function startRound(state, ctx) {
    state.round++;
    state.phase = "trade";
    state.deadline = ctx.now() + (state.round === 1 ? FIRST_MS : TRADE_MS);
    state.ready = state.cash.map(() => false);
    state.net = [0, 0, 0, 0, 0];
    state.played = state.cash.map(() => null);
    const round = state.round;
    ctx.later(state.deadline - ctx.now(), () => {
        if (state.round === round && state.phase === "trade") resolve(state, ctx);
    });
}

function resolve(state, ctx) {
    const n = state.cash.length;
    const base = state.net.map((x) => 0.18 * Math.tanh(x / (n * 150) / 2.5));
    const frozen = [false, false, false, false, false];
    const cards = [];
    state.played.forEach((p) => {
        if (!p) return;
        cards.push({ type: p.type, co: p.type === "tip" ? null : p.co });
        if (p.type === "hype") base[p.co] += CARD;
        if (p.type === "rumor") base[p.co] -= CARD;
        if (p.type === "freeze") frozen[p.co] = true;
    });
    const news = state.news[state.round - 1];
    news.eff.forEach((e) => {
        base[e.co] += e.v;
        state.fair[e.co] = Math.max(10, state.fair[e.co] * (1 + e.v * 0.8));
    });
    const total = base.slice();
    state.links.forEach((ls, i) => ls.forEach((l) => (total[l.to] += l.w * base[i])));
    const from = state.price.slice();
    state.price = state.price.map((p, i) => {
        if (!p || frozen[i]) return p;
        const pull = (0.15 * (state.fair[i] - p)) / p;
        const np = Math.round(p * (1 + clamp(total[i] + pull + (ctx.rng() - 0.5) * 0.05, -0.5, 0.6)));
        return np < BUST ? 0 : np;
    });
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
        links: done ? state.links : null,
        big: done ? bigTrades(state) : null,
    };
}

module.exports = {
    id: "ripple",
    name: "Ripple Market",
    kind: "sim",
    quick: false,
    players: [2, 8],
    init({ rng, ctx, players = 2 }) {
        const cos = shuffle(rng, POOL).slice(0, 5).map(([name, tick, icon], i) => ({ name, tick, icon, color: COLORS[i] }));
        const price = cos.map(() => 40 + Math.floor(rng() * 81));
        const state = {
            cos,
            price,
            fair: price.slice(),
            hist: price.map((p) => [p]),
            links: makeLinks(rng),
            news: Array.from({ length: ROUNDS }, (_, r) => makeNews(rng, cos, r + 1)),
            cash: new Array(players).fill(CASH),
            hold: seats(players).map(() => [0, 0, 0, 0, 0]),
            hands: seats(players).map(() => Array.from({ length: HAND }, () => ({ type: pickOne(rng, CARDS), used: false }))),
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
        v.me = { cash: state.cash[seat], hold: state.hold[seat], hand: state.hands[seat], played: state.played[seat], tips: state.tips[seat] };
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
            state.cash[seat] -= qty * price;
            state.hold[seat][co] += qty;
            state.net[co] += qty * price;
            const t = state.trades.find((x) => x.seat === seat && x.co === co && x.round === state.round);
            if (t) t.qty += qty;
            else state.trades.push({ seat, co, qty, price, round: state.round });
            return { ok: true };
        }
        if (p.act === "card") {
            const card = state.hands[seat][p.i];
            if (!Number.isInteger(p.i) || !card || card.used) return { error: "You don't have that card." };
            if (state.played[seat]) return { error: "One card per round." };
            if (card.type !== "tip" && (!okCo || !state.price[co])) return { error: "Pick a company for that card." };
            card.used = true;
            state.played[seat] = { type: card.type, co: card.type === "tip" ? null : co };
            if (card.type === "tip") {
                const known = state.tips[seat];
                const all = [];
                state.links.forEach((ls, from) => ls.forEach((l) => all.push({ from, to: l.to, w: l.w })));
                const fresh = all.filter((l) => !known.some((k) => k.from === l.from && k.to === l.to));
                if (fresh.length) known.push(fresh[Math.floor(ctx.rng() * fresh.length)]);
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
