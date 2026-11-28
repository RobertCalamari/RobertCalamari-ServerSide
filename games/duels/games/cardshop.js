// Totally Real Vending Simulator: everyone runs a trading-card table at a convention for 5 days. Each day is three
// quick beats. Morning: buy a pack or two from today's 3 offers and rip them. Table: put your best cards out and pick
// Cheap / Fair / Premium for each. Rush hour: customers walk up one at a time with an offer; Deal, or Counter once
// (they pay your sticker or walk). Once a day you can snipe a customer from someone else's table. Each day has an
// event (celebrity collector, convention rush, counterfeit scare) and overnight news swings a set's prices.
// Richest (cash + cards and sealed packs at market) wins.
const { ranked, seats } = require("../rank");
const M = require("../cardshop/market");
const { D, CARDS, idxOf, r2, shuffle, openPack, value, initMarket, makeNews, overnight } = M;
const { SETS, TYPES, RARITIES, FOIL } = D;

const CFG = {
    name: "Totally Real Vending Simulator",
    days: 5,
    activeSets: ["ember", "tidebound", "neon", "crystal", "starfall", "vintage"],
    cash: 300,
    packSize: 5,
    packsPerDay: 3,
    offers: 3,
    priceScale: 2.5,
    packEV: 1.1,
    hitSlot: true, // every pack ends on a Rare or better, so every rip has a moment
    hitShare: [0, 0, 72, 21, 6, 1],
    rarShape: [0.07, 0.14, 0.38, 0.75, 2, 5],
    demandTilt: 0.25,
    spots: 3,
    maxSpots: 5,
    spotCost: 30,
    signCost: 45,
    tiers: { cheap: 0.8, fair: 1, premium: 1.3 },
    customers: [5, 9], // per table, day 1 -> last day
    queue: 2,
    ms: { morning: 70000, table: 45000, rush: 50000, night: 14000, offer: 9000 },
};
const EVENTS = [
    { id: "celeb", icon: "🌟", text: "A celebrity collector is touring the floor today. They pay big for shiny cards." },
    { id: "rush", icon: "🏃", text: "Convention rush! The doors open early and the floor is packed." },
    { id: "fake", icon: "🕵️", text: "Counterfeit scare: buyers are nervous about one set today." },
    { id: "kids", icon: "🧒", text: "School field trip! Kids everywhere with pocket money for cheap cards." },
    { id: "quiet", icon: "☕", text: "A calm morning. Fewer shoppers, but they came to spend." },
];
const TYPES_OF = {
    kid: { icon: "🧒", name: "Kid", f: [1.1, 1.6], wants: (r) => r <= 1 },
    fan: { icon: "🙂", name: "Fan", f: [1, 1.35], wants: () => true },
    bargain: { icon: "🧐", name: "Bargain hunter", f: [0.7, 1], wants: () => true },
    collector: { icon: "🎩", name: "Collector", f: [1.05, 1.45], wants: (r) => r >= 2 },
    whale: { icon: "💎", name: "Big spender", f: [1.3, 1.75], wants: (r) => r >= 2 },
    celeb: { icon: "🌟", name: "Celebrity", f: [1.8, 2.4], wants: (r) => r >= 3 },
};

const activeSets = () => CFG.activeSets.map((id) => SETS.findIndex((s) => s.id === id)).filter((i) => i >= 0);
const roll = (rng, a, b) => a + rng() * (b - a);
const pickW = (rng, list) => {
    let x = rng() * list.reduce((t, [, w]) => t + w, 0);
    for (const [v, w] of list) if ((x -= w) < 0) return v;
    return list[0][0];
};
const worth = (state, s) =>
    r2(state.cash[s] + Object.entries(state.own[s]).reduce((t, [k, n]) => t + n * value(state, +k), 0) + state.packs[s].reduce((t, n, p) => t + n * state.pack[p], 0));
const owned = (state, s, k) => state.own[s][k] || 0;
const onTable = (state, s, k) => state.table[s].filter((d) => d && d.k === k).length;
const sticker = (state, s, slot) => {
    const d = state.table[s][slot];
    return d ? r2(value(state, d.k) * CFG.tiers[d.tier]) : 0;
};
function bubble(state, s, text, kind) {
    state.bubbles.push({ id: ++state.eid, s, text, kind, day: state.day });
    if (state.bubbles.length > 30) state.bubbles.shift();
}
function addCard(state, s, k) {
    state.own[s][k] = owned(state, s, k) + 1;
}
function dropCard(state, s, k) {
    if (--state.own[s][k] <= 0) delete state.own[s][k];
    // a table slot can't show more copies than you own
    state.table[s].forEach((d, i) => d && d.k === k && onTable(state, s, k) > owned(state, s, k) && (state.table[s][i] = null));
}

// ---------- the day ----------
function startDay(state, ctx) {
    state.day++;
    state.phase = "morning";
    state.ready = state.ready.map(() => false);
    state.bought = state.bought.map(() => 0);
    state.sniped = state.sniped.map(() => false);
    state.sales = state.cash.map(() => ({ n: 0, cash: 0, best: null }));
    state.offers = shuffle(ctx.rng, state.active).slice(0, CFG.offers);
    state.event = state.events[state.day - 1];
    timer(state, ctx, state.timed ? CFG.ms.morning : null, () => startTable(state, ctx));
}
function startTable(state, ctx) {
    state.phase = "table";
    state.ready = state.ready.map(() => false);
    timer(state, ctx, state.timed ? CFG.ms.table : null, () => startRush(state, ctx));
}
function timer(state, ctx, ms, fn) {
    const tick = ++state.tick;
    state.deadline = ms ? ctx.now() + ms : null;
    if (ms) ctx.later(ms, () => state.tick === tick && fn());
}
function makeCustomer(state, rng, s) {
    const ev = state.event.id;
    const ty = ev === "kids" && rng() < 0.45 ? "kid" : pickW(rng, [["kid", 2], ["fan", 4], ["bargain", 3], ["collector", 2], ["whale", ev === "quiet" ? 2 : 0.8]]);
    return { id: ++state.eid, ty, s };
}
function startRush(state, ctx) {
    state.phase = "rush";
    state.ready = state.ready.map(() => false);
    state.q = state.cash.map(() => []);
    const tick = ++state.tick;
    state.deadline = ctx.now() + CFG.ms.rush;
    const ev = state.event.id;
    const span = CFG.ms.rush - 6000;
    const days = Math.max(1, CFG.days - 1);
    seats(state.cash.length).forEach((s) => {
        let count = Math.round(CFG.customers[0] + ((CFG.customers[1] - CFG.customers[0]) * (state.day - 1)) / days);
        if (state.sign[s]) count = Math.round(count * 1.4);
        if (ev === "rush") count = Math.round(count * 1.5);
        if (ev === "quiet") count = Math.round(count * 0.7);
        const list = Array.from({ length: count }, () => makeCustomer(state, ctx.rng, s));
        if (ev === "celeb") list.splice(Math.floor(ctx.rng() * list.length), 0, { id: ++state.eid, ty: "celeb", s });
        list.forEach((cu, i) => ctx.later(1500 + Math.floor(((i + ctx.rng() * 0.8) / list.length) * span), () => state.tick === tick && arrive(state, ctx, cu)));
    });
    ctx.later(CFG.ms.rush, () => state.tick === tick && endRush(state, ctx));
}
// a customer walks up to table s: picks a card they like, pays the sticker if it's fair to them, else makes an offer
function arrive(state, ctx, cu) {
    const s = cu.s;
    const T = TYPES_OF[cu.ty];
    const slots = state.table[s].map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
    if (!slots.length) return bubble(state, s, T.icon + " A " + T.name.toLowerCase() + " walked past your empty table", "walk");
    // fans and bargain hunters will take anything; kids, collectors and big spenders only want their kind of card
    let likes = slots.filter((i) => T.wants(CARDS[idxOf(state.table[s][i].k)].r));
    if (!likes.length && (cu.ty === "fan" || cu.ty === "bargain")) likes = slots;
    if (!likes.length) return bubble(state, s, T.icon + " " + T.name + " looked, found nothing they liked", "walk");
    if (state.q[s].length >= CFG.queue) return bubble(state, s, T.icon + " A " + T.name.toLowerCase() + " saw the line and left", "walk");
    const slot = likes[Math.floor(ctx.rng() * likes.length)];
    const d = state.table[s][slot];
    const card = CARDS[idxOf(d.k)];
    let f = roll(ctx.rng, T.f[0], T.f[1]);
    if (state.event.id === "fake" && card.s === state.event.set) f *= 0.6;
    const m = value(state, d.k);
    const ask = sticker(state, s, slot);
    const offer = r2(Math.max(0.05, m * f));
    if (offer >= ask) return sell(state, s, slot, ask, cu.ty, true);
    state.q[s].push({ id: cu.id, ty: cu.ty, slot, k: d.k, cash: offer, ask, m, countered: false, until: null });
    if (state.q[s].length === 1) head(state, s, ctx);
}
function head(state, s, ctx) {
    const o = state.q[s][0];
    if (!o) return;
    o.until = ctx.now() + CFG.ms.offer;
    const id = o.id;
    ctx.later(CFG.ms.offer, () => {
        const h = state.q[s][0];
        if (state.phase !== "rush" || !h || h.id !== id) return;
        bubble(state, s, TYPES_OF[h.ty].icon + " Got tired of waiting and walked off", "walk");
        next(state, s, ctx);
    });
}
function next(state, s, ctx) {
    state.q[s].shift();
    // the card may have sold to someone else in the meantime
    while (state.q[s][0] && (!state.table[s][state.q[s][0].slot] || state.table[s][state.q[s][0].slot].k !== state.q[s][0].k)) state.q[s].shift();
    head(state, s, ctx);
}
function sell(state, s, slot, price, ty, full) {
    const d = state.table[s][slot];
    state.cash[s] = r2(state.cash[s] + price);
    const sl = state.sales[s];
    sl.n++;
    sl.cash = r2(sl.cash + price);
    if (!sl.best || price > sl.best.price) sl.best = { k: d.k, price };
    const k = d.k;
    dropCard(state, s, k);
    if (!owned(state, s, k)) state.table[s][slot] = null;
    bubble(state, s, TYPES_OF[ty].icon + (full ? " Paid your full price: " : " Deal! ") + "$" + price.toFixed(2), full ? "full" : "deal");
    state.feed.push({ id: ++state.eid, s, k, price, ty, day: state.day });
    if (state.feed.length > 20) state.feed.shift();
}
function endRush(state, ctx) {
    state.q = state.cash.map(() => []);
    state.phase = "night";
    state.ready = state.ready.map(() => false);
    const news = makeNews(ctx.rng, state.day + 1, state.pool, state.active);
    const before = state.active.map((p) => setLevel(state, p));
    overnight(state, ctx.rng, news, state.ripped);
    state.ripped = SETS.map(() => 0);
    state.night = { news: news.text, moves: state.active.map((p, i) => ({ p, pct: Math.round((setLevel(state, p) / before[i] - 1) * 100) })) };
    state.worthHist.forEach((h, s) => h.push(worth(state, s)));
    timer(state, ctx, CFG.ms.night, () => endNight(state, ctx));
}
function endNight(state, ctx) {
    if (state.day >= CFG.days) {
        state.phase = "done";
        state.deadline = null;
        state.tick++;
        return;
    }
    startDay(state, ctx);
}
const setLevel = (state, p) => state.pool.filter((i) => CARDS[i].s === p).reduce((t, i) => t + state.price[i], 0) || 1;
function allReady(state, ctx) {
    if (!state.ready.every(Boolean)) return;
    if (state.phase === "morning") startTable(state, ctx);
    else if (state.phase === "table") startRush(state, ctx);
    else if (state.phase === "night") endNight(state, ctx);
}

// ---------- what each phone sees ----------
function cardInfo(state, i) {
    const x = CARDS[i];
    const c = x.c;
    return { id: c.id, set: x.s, n: c.name, r: x.r, t: x.t, hp: c.hp, atk: c.atk, def: c.def, spd: c.spd, mv: c.move ? c.move.name : "", pw: c.move ? c.move.power : 0, fl: c.flavor || "", p: state.price[i], h: state.hist[i] };
}
function pub(state, refs) {
    const n = state.cash.length;
    const add = (k) => refs.add(idxOf(k));
    state.table.forEach((t) => t.forEach((d) => d && add(d.k)));
    state.feed.forEach((f) => add(f.k));
    state.sales.forEach((x) => x.best && add(x.best.k));
    return {
        phase: state.phase,
        day: state.day,
        days: CFG.days,
        deadline: state.deadline,
        timed: state.timed,
        ready: state.ready,
        name: CFG.name,
        event: state.event && { ...state.event, setName: state.event.set !== undefined ? SETS[state.event.set].name : null },
        night: state.phase === "night" || state.phase === "done" ? state.night : null,
        sets: SETS.map((s, p) => ({ id: s.id, name: s.name, code: s.code, color: s.color, accent: s.accent, theme: s.theme, on: state.active.includes(p), pack: state.pack[p] })),
        offers: state.offers,
        types: TYPES.map((t) => ({ name: t.name, color: t.color, icon: t.icon })),
        rar: RARITIES.map((r) => r.name),
        foil: [FOIL.mult, FOIL.secretMult || FOIL.mult],
        customers: Object.fromEntries(Object.entries(TYPES_OF).map(([k, t]) => [k, { icon: t.icon, name: t.name }])),
        tables: state.table.map((t, s) => t.map((d, i) => (d ? { k: d.k, tier: d.tier, price: sticker(state, s, i) } : null))),
        spots: state.spots,
        sign: state.sign,
        lines: state.q.map((q) => q.length),
        sales: state.sales,
        bubbles: state.bubbles.filter((b) => b.day === state.day).slice(-12),
        feed: state.feed.filter((f) => f.day === state.day),
        worth: seats(n).map((s) => worth(state, s)),
        worthHist: state.worthHist,
        cfg: { packSize: CFG.packSize, packsPerDay: CFG.packsPerDay, tiers: CFG.tiers, maxSpots: CFG.maxSpots, spotCost: CFG.spotCost, signCost: CFG.signCost, offerMs: CFG.ms.offer },
    };
}
function view(state, seat) {
    const refs = new Set();
    const v = pub(state, refs);
    const own = Object.keys(state.own[seat]).map((k) => [+k, state.own[seat][k]]);
    own.forEach(([k]) => refs.add(idxOf(k)));
    const rip = state.rips[seat];
    if (rip) rip.keys.forEach((k) => refs.add(idxOf(k)));
    const o = state.phase === "rush" && state.q[seat][0];
    if (o) refs.add(idxOf(o.k));
    v.me = {
        cash: state.cash[seat],
        own,
        packs: state.packs[seat],
        bought: state.bought[seat],
        rip,
        offer: o ? { id: o.id, ty: o.ty, k: o.k, cash: o.cash, ask: o.ask, m: o.m, until: o.until, countered: o.countered, waiting: state.q[seat].length - 1 } : null,
        sniped: state.sniped[seat],
    };
    v.cat = {};
    refs.forEach((i) => (v.cat[i] = cardInfo(state, i)));
    return v;
}

// ---------- moves ----------
const okSet = (p) => Number.isInteger(p) && p >= 0 && p < SETS.length;
function move(state, s, p, ctx) {
    if (!p || typeof p !== "object") return { error: "Bad move." };
    const ph = state.phase;
    if (ph === "done") return { error: "The show is over." };
    if (p.act === "ready") {
        if (ph === "rush") return { error: "The doors are open, watch your table!" };
        state.ready[s] = p.on !== false;
        allReady(state, ctx);
        return { ok: true };
    }
    if (p.act === "next") {
        if (!ctx.host) return { error: "Only the host can move everyone on." };
        if (ph === "morning") startTable(state, ctx);
        else if (ph === "table") startRush(state, ctx);
        else if (ph === "rush") endRush(state, ctx);
        else if (ph === "night") endNight(state, ctx);
        return { ok: true };
    }
    if (p.act === "buy") {
        if (ph !== "morning") return { error: "Packs are only sold in the morning." };
        if (!okSet(p.p) || !state.offers.includes(p.p)) return { error: "That pack isn't on offer today." };
        if (state.bought[s] >= CFG.packsPerDay) return { error: "That's " + CFG.packsPerDay + " packs today. Save some for tomorrow!" };
        const price = state.pack[p.p];
        if (price > state.cash[s] + 0.001) return { error: "Not enough cash." };
        state.cash[s] = r2(state.cash[s] - price);
        state.packs[s][p.p]++;
        state.bought[s]++;
        return { ok: true };
    }
    if (p.act === "rip") {
        if (ph !== "morning" && ph !== "table") return { error: "Rip packs before the doors open." };
        if (!okSet(p.p) || state.packs[s][p.p] < 1) return { error: "You don't have that pack." };
        state.packs[s][p.p]--;
        state.ripped[p.p]++;
        const keys = openPack(ctx.rng, p.p, CFG.packSize);
        keys.forEach((k) => addCard(state, s, k));
        state.rips[s] = { no: ++state.eid, p: p.p, keys, vals: keys.map((k) => value(state, k)), cost: state.pack[p.p] };
        const best = Math.max(...state.rips[s].vals);
        if (best >= 40) bubble(state, s, "✨ Pulled a $" + best.toFixed(2) + " card!", "pull");
        return { ok: true };
    }
    if (p.act === "slot") {
        if (ph !== "table" && ph !== "morning") return { error: "Set up your table before the doors open." };
        const i = p.i;
        if (!Number.isInteger(i) || i < 0 || i >= state.spots[s]) return { error: "Pick a spot on your table." };
        if (p.clear) {
            state.table[s][i] = null;
            return { ok: true };
        }
        const tier = CFG.tiers[p.tier] ? p.tier : "fair";
        const cur = state.table[s][i];
        if (p.k === undefined && cur) {
            cur.tier = tier;
            return { ok: true };
        }
        const k = p.k;
        if (!Number.isInteger(k) || owned(state, s, k) - onTable(state, s, k) + (cur && cur.k === k ? 1 : 0) < 1) return { error: "You don't have a spare copy of that card." };
        state.table[s][i] = { k, tier };
        return { ok: true };
    }
    if (p.act === "upgrade") {
        if (ph !== "table" && ph !== "morning") return { error: "Upgrades are bought before the doors open." };
        if (p.what === "spot") {
            if (state.spots[s] >= CFG.maxSpots) return { error: "Your table is as big as it gets." };
            if (state.cash[s] < CFG.spotCost) return { error: "Not enough cash." };
            state.cash[s] = r2(state.cash[s] - CFG.spotCost);
            state.spots[s]++;
            state.table[s].push(null);
            return { ok: true };
        }
        if (p.what === "sign") {
            if (state.sign[s]) return { error: "You already have a shiny sign." };
            if (state.cash[s] < CFG.signCost) return { error: "Not enough cash." };
            state.cash[s] = r2(state.cash[s] - CFG.signCost);
            state.sign[s] = true;
            return { ok: true };
        }
        return { error: "Pick an upgrade." };
    }
    if (ph !== "rush") return { error: "Wait for the doors to open." };
    if (p.act === "snipe") {
        if (state.sniped[s]) return { error: "One snipe a day." };
        if (!state.table[s].some(Boolean)) return { error: "Put something on your table first." };
        const from = seats(state.cash.length).filter((x) => x !== s && state.q[x].length).sort((a, b) => state.q[b].length - state.q[a].length)[0];
        if (from === undefined) return { error: "Nobody has a customer to steal right now." };
        const q = state.q[from];
        const cu = q.length > 1 ? q.pop() : q[0];
        if (cu === q[0]) next(state, from, ctx);
        state.sniped[s] = true;
        bubble(state, from, "🎯 " + "#" + s + "# sniped one of your customers!", "snipe");
        bubble(state, s, "🎯 You sniped a customer from #" + from + "#", "snipe");
        arrive(state, ctx, { id: ++state.eid, ty: cu.ty, s });
        return { ok: true };
    }
    const o = state.q[s][0];
    if (!o || o.id !== p.id) return { error: "That customer is gone." };
    const d = state.table[s][o.slot];
    if (!d || d.k !== o.k) {
        bubble(state, s, TYPES_OF[o.ty].icon + " Oh, that one sold already. Never mind!", "walk");
        next(state, s, ctx);
        return { error: "That card already sold." };
    }
    if (p.act === "deal") {
        sell(state, s, o.slot, o.cash, o.ty, false);
        next(state, s, ctx);
        return { ok: true };
    }
    if (p.act === "no") {
        bubble(state, s, TYPES_OF[o.ty].icon + " Shrugged and walked off", "walk");
        next(state, s, ctx);
        return { ok: true };
    }
    if (p.act === "counter") {
        if (o.countered) return { error: "You already countered." };
        // they pay your sticker, or walk: the further it is from their offer, the less likely
        const chance = Math.max(0.1, Math.min(0.9, 1 - (o.ask / o.cash - 1) * 2));
        o.countered = true;
        if (ctx.rng() < chance) {
            sell(state, s, o.slot, o.ask, o.ty, false);
            bubble(state, s, TYPES_OF[o.ty].icon + " Fine, your price!", "counter");
        } else bubble(state, s, TYPES_OF[o.ty].icon + " Too rich for me. Bye!", "walk");
        next(state, s, ctx);
        return { ok: true };
    }
    return { error: "Bad move." };
}

module.exports = {
    id: "cardshop",
    name: CFG.name,
    kind: "sim",
    quick: false,
    players: [2, 6],
    options: { timer: [false, true] },
    CFG,
    init({ rng, ctx, players = 2, options = {} }) {
        const n = players;
        const state = {
            timed: options.timer === true,
            day: 0,
            phase: "morning",
            deadline: null,
            tick: 0,
            eid: 0,
            ready: new Array(n).fill(false),
            cash: new Array(n).fill(CFG.cash),
            own: seats(n).map(() => ({})),
            packs: seats(n).map(() => SETS.map(() => 0)),
            bought: new Array(n).fill(0),
            rips: new Array(n).fill(null),
            table: seats(n).map(() => new Array(CFG.spots).fill(null)),
            spots: new Array(n).fill(CFG.spots),
            sign: new Array(n).fill(false),
            sniped: new Array(n).fill(false),
            sales: seats(n).map(() => ({ n: 0, cash: 0, best: null })),
            q: seats(n).map(() => []),
            bubbles: [],
            feed: [],
            ripped: SETS.map(() => 0),
            night: null,
            offers: [],
        };
        state.active = activeSets();
        state.pool = CARDS.map((c, i) => i).filter((i) => state.active.includes(CARDS[i].s));
        initMarket(state, rng, CFG, CFG.packSize);
        state.events = Array.from({ length: CFG.days }, (_, d) => {
            const e = { ...EVENTS[d === 0 ? 1 + Math.floor(rng() * 3) : Math.floor(rng() * EVENTS.length)] };
            if (e.id === "fake") e.set = state.active[Math.floor(rng() * state.active.length)];
            return e;
        });
        state.worthHist = seats(n).map(() => [CFG.cash]);
        startDay(state, ctx);
        return state;
    },
    view,
    tv(state) {
        const refs = new Set();
        const v = pub(state, refs);
        v.cat = {};
        refs.forEach((i) => (v.cat[i] = cardInfo(state, i)));
        return v;
    },
    move,
    result(state) {
        if (state.phase !== "done") return null;
        const w = seats(state.cash.length).map((s) => worth(state, s));
        return ranked(w, "high", "Top table closed the show worth $" + Math.max(...w).toFixed(2) + " (everyone started with $" + CFG.cash + ")");
    },
};
