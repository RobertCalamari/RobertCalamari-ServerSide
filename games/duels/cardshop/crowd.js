// Totally Real Vending Simulator: the convention crowd. Each customer has a personality, a budget and a price sense,
// wanders past some booths (appeal and a full table pull them in), picks the item they like best and then either pays
// the sticker price or haggles: an opening offer, maybe one bump if you say no, sometimes a card trade.
const { CARDS, idxOf, isFoil, value, pick } = require("./market");

// open: opening offer as a share of the sticker; bump: where they go if you decline (with chance bumpP);
// floor: the lowest share of the sticker they'd still bother offering; payP: chance they just pay the sticker.
// When you counter: yes = chance they take a fair counter, push = how much a pushy counter (close to the sticker)
// cuts that, walk = chance they leave instead of coming back with their own number, meet = how far their own number
// moves toward yours, half = bonus for meeting halfway
const KINDS = {
    fan: { w: 30, budget: [10, 60], mult: [0.95, 1.25], payP: 0.45, open: 0.85, bump: 0.95, bumpP: 0.5, floor: 0.7, tradeP: 0.15, yes: 0.6, push: 0.6, walk: 0.2, meet: 0.5, half: 0.1 },
    kid: { w: 16, budget: [3, 25], payP: 1, open: 1, bump: 1, bumpP: 0, floor: 1, tradeP: 0, yes: 0.3, push: 0.9, walk: 0.6, meet: 0.3, half: 0 },
    bargain: { w: 16, budget: [10, 150], mult: [0.75, 0.92], payP: 0.05, open: 0.7, bump: 0.8, bumpP: 0.6, floor: 0.55, tradeP: 0.05, yes: 0.35, push: 0.8, walk: 0.3, meet: 0.35, half: 0.05 },
    collector: { w: 16, budget: [30, 300], mult: [1.15, 1.6], payP: 0.3, open: 0.9, bump: 1.05, bumpP: 0.7, floor: 0.75, tradeP: 0.3, yes: 0.75, push: 0.5, walk: 0.1, meet: 0.6, half: 0.25 },
    flipper: { w: 12, budget: [20, 200], mult: [0.8, 0.9], payP: 0, open: 0.6, bump: 0.7, bumpP: 0.4, floor: 0.45, tradeP: 0.25, yes: 0.3, push: 0.9, walk: 0.35, meet: 0.3, half: 0.05 },
    whale: { w: 3, budget: [150, 1500], mult: [1.2, 1.8], payP: 0.7, open: 0.9, bump: 1, bumpP: 0.9, floor: 0.8, tradeP: 0, yes: 0.9, push: 0.2, walk: 0.05, meet: 0.7, half: 0.05 },
};
const between = (rng, [a, b]) => a + rng() * (b - a);

function makeCustomer(rng, day, news, sets, scale = 1) {
    const w = Object.entries(KINDS).map(([k, x]) => [k, x.w + (k === "whale" ? day * 0.6 : 0) + (k === "kid" && news.kid >= 0 ? 12 : 0)]);
    let x = rng() * w.reduce((t, e) => t + e[1], 0);
    let ty = w[0][0];
    for (const [k, v] of w) {
        x -= v;
        if (x < 0) {
            ty = k;
            break;
        }
    }
    const K = KINDS[ty];
    const want = news.hot >= 0 && rng() < 0.4 ? news.hot : pick(rng, sets);
    return { ty, budget: Math.round(between(rng, K.budget) * scale), mult: K.mult ? between(rng, K.mult) : 1, want, carry: rng() < (ty === "flipper" ? 0.75 : 0.12) };
}

// what one shown item is worth to this customer (0 = not interested)
function wtp(cu, it, up, news) {
    const { m, r, s, foil, pack } = it;
    const shiny = r >= 3 || foil;
    let w = 0;
    if (cu.ty === "fan") w = m * cu.mult * (!pack && r <= 0 ? 0.6 : 1) * (s === news.hot ? 1.1 : 1) * (up.mat ? 1.05 : 1);
    else if (cu.ty === "kid") w = m * (pack ? 1.05 : shiny ? 1.4 : r <= 1 ? 1.6 : 1.1) * (up.plush ? 1.15 : 1) * (s === news.kid ? 1.2 : 1);
    else if (cu.ty === "bargain" || cu.ty === "flipper") w = m * cu.mult;
    else if (cu.ty === "collector") w = m * (s === cu.want ? (pack ? 1.1 : r >= 2 ? cu.mult : 1) : 0.85) * (foil ? 1.1 : 1) * (up.case ? 1.1 : 1);
    else if (cu.ty === "whale") w = pack ? m * 1.1 : shiny ? m * cu.mult * (up.case ? 1.1 : 1) : 0;
    return w;
}

function itemOf(state, d) {
    if (!d) return null;
    if (d.p !== undefined) return { m: state.pack[d.p], r: -1, s: d.p, foil: false, pack: true };
    const c = CARDS[idxOf(d.k)];
    return { m: value(state, d.k), r: c.r, s: c.s, foil: isFoil(d.k), pack: false };
}

const ask = (m, pct) => Math.max(0.05, Math.round(m * pct) / 100);

// one customer walks the floor and picks the item they like best (skipping ones someone is already haggling over).
// Returns { path: [seats], pick: { seat, slot, list, w, m } | null }
function visit(state, cu, rng, news, appealOf, busy) {
    const n = state.cash.length;
    const K = KINDS[cu.ty];
    const open = [];
    for (let s = 0; s < n; s++) if (state.disp[s].some(Boolean)) open.push(s);
    const path = open.filter((s) => {
        const up = state.up[s];
        const a = 1 + 0.22 * appealOf(s) + 0.06 * state.disp[s].filter(Boolean).length + (cu.ty === "kid" && up.plush ? 0.5 : 0) + (cu.ty === "fan" && up.mat ? 0.3 : 0);
        return rng() < a / (a + 0.8);
    });
    if (!path.length && open.length) path.push(pick(rng, open));
    let best = null;
    path.forEach((s) =>
        state.disp[s].forEach((d, slot) => {
            if (!d || busy(s, slot)) return;
            const it = itemOf(state, d);
            const list = ask(it.m, d.pct);
            const w = wtp(cu, it, state.up[s], news);
            const low = Math.min(w, list * K.open);
            if (low > cu.budget || w < list * K.floor) return;
            const score = (w - list) / Math.max(it.m, 0.5) + rng() * 0.08 + appealOf(s) * 0.015;
            if (!best || score > best.score) best = { seat: s, slot, list, w, m: it.m, score };
        })
    );
    return { path, pick: best };
}

module.exports = { KINDS, makeCustomer, visit, itemOf, ask, wtp };
