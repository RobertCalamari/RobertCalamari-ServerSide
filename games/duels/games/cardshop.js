// Totally Real Vending Simulator: everyone runs a trading-card booth at a convention for a few days. Morning: buy
// sealed packs from the distributor (limited stock), singles from the case, or cards other players listed; rip packs
// open. Setup: pick what goes on your table and at what price, buy upgrades. Selling: a simulated crowd of collectors,
// kids, bargain hunters, flippers and big spenders walks the floor; some pay the sticker, most haggle (accept/decline on
// your phone, maybe a card trade). Prices drift every night (set trends, news, what got sold or ripped).
// Highest net worth (cash + cards and sealed packs at market) wins.
const { ranked, seats } = require("../rank");
const M = require("../cardshop/market");
const { KINDS, makeCustomer, visit, itemOf, ask } = require("../cardshop/crowd");
const X = require("../cardshop/extras");
const { D, CARDS, idxOf, isFoil, r2, shuffle, openPack, value, initMarket, makeNews, forecast, overnight } = M;
const { SETS, TYPES, RARITIES, FOIL } = D;

// every tunable number lives here
const CFG = {
    name: "Totally Real Vending Simulator",
    days: 8,
    activeSets: ["ember", "tidebound", "neon", "crystal", "starfall", "vintage"], // set ids from cardshop/sets.js; null = all 10
    cash: 300,
    packSize: 5,
    slots: 5,
    maxSlots: 10,
    slotCost: [50, 90, 140, 200, 270],
    stockPerPlayer: 3, // packs per player per set per day
    setsPerDay: [5, 6], // the distributor carries a rotating selection
    customers: [8, 25], // day 1 -> last day, for 3 players (scaled by table size)
    pcts: [80, 100, 120, 150],
    priceScale: 2.5, // multiplies every set's pack price (and so card values and customer budgets)
    packEV: 0.95, // a pack's expected card value / its price at the open
    hitSlot: true, // the last card of every pack is Rare or better
    hitShare: [0, 0, 72, 21, 6, 1], // odds for that card by rarity (C, U, R, Holo, Ultra, Secret)
    rarShape: [0.07, 0.14, 0.38, 0.75, 2, 5], // card value by rarity, relative (null = sets.js values)
    demandTilt: 0.25,
    scarcity: 0.025, // sealed price bump per night when the distributor sold out of a set
    scarcityCap: 1.2,
    singlesMarkup: 1.1,
    maxListings: 6,
    ms: { buy: 60000, buy1: 80000, setup: 45000, setup1: 60000, sell: 45000, lastIn: 9000, report: 12000, offer: 8000, counter: 4000, tick: 1000 },
    counters: 2, // haggle rounds you get per customer
    queue: 3, // customers waiting at one booth before others give up
    actions: { base: 2, max: 5, carry: 1, packs: 3 }, // actions per day; unused carry over (up to carry); one action buys up to `packs` packs
    fish: { ms: 15000, minMs: 3000, pack: 70, boot: 22, golden: 8, bootCash: 5 }, // broke? go fishing once a day: catch odds
    challenge: { prize: 20, sales: 25 }, // daily challenge prize; the "sell $X" target is sales x priceScale
    vip: { at: 4000, mult: 2, min: 12, max: 60, cardP: 0.5 }, // the VIP arrives 4s into Doors open; bounty = mult x cheapest qualifying market, between min and max (x priceScale)
    streak: { cash: 0.8, maxAppeal: 3, actionAt: 3 }, // per deal at full sticker: bonus = cash x priceScale x (streak-1)
    up: {
        lights: { name: "String lights", icon: "💡", cost: 40, appeal: 1, tip: "+1 appeal" },
        banner: { name: "Booth banner", icon: "🚩", cost: 70, appeal: 2, tip: "+2 appeal" },
        mat: { name: "Playmat", icon: "🟩", cost: 60, appeal: 1, tip: "+1 appeal, fans pay a bit more" },
        case: { name: "Glass case", icon: "🔒", cost: 120, appeal: 2, tip: "+2 appeal, collectors and big spenders pay up to 10% more" },
        plush: { name: "Mascot plushie", icon: "🧸", cost: 150, appeal: 3, tip: "+3 appeal, kids flock to it" },
        lic: { name: "Buy-in license", icon: "🤝", cost: [100, 150], pct: [70, 60], tip: "Customers offer you their cards at 70% of market (60% upgraded)" },
        gun: { name: "Price gun", icon: "🔫", cost: 50, tip: "Scan one set: see where its prices go tonight" },
        bulk: { name: "Bulk bin", icon: "🗑️", cost: 30, tip: "Commons and uncommons you aren't showing sell for 50% each day" },
        helper: { name: "Hire a helper", icon: "🧑‍🔧", cost: [80, 160], tip: "+1 action every day" },
    },
    bulkPct: 50,
    bigPull: 40, // public announcement threshold ($)
};
const DECOR = ["lights", "banner", "mat", "case", "plush"];

function activeSets() {
    const on = (CFG.activeSets || SETS.map((s) => s.id)).map((id) => SETS.findIndex((s) => s.id === id)).filter((i) => i >= 0);
    if (on.length >= 2) return on;
    // unknown ids: take six spread across the pack-price range
    const by = seats(SETS.length).sort((a, b) => SETS[a].packPrice - SETS[b].packPrice);
    return [...new Set([0, 1, 2, 3, 4, 5].map((j) => by[Math.round((j * (by.length - 1)) / 5)]))];
}

const decor = (state, s) => DECOR.reduce((t, k) => t + (state.up[s][k] ? CFG.up[k].appeal : 0), 0);
const appeal = (state, s) => decor(state, s) + X.streakAppeal(state, s, CFG);
const shown = (state, s, f) => state.disp[s].filter((d) => d && f(d)).length;
const shownKey = (state, s, k) => shown(state, s, (d) => d.k === k);
const shownPack = (state, s, p) => shown(state, s, (d) => d.p === p);
const spareKey = (state, s, k) => (state.own[s][k] || 0) - shownKey(state, s, k);
const sparePack = (state, s, p) => state.packs[s][p] - shownPack(state, s, p);
const pay = (state, s, x) => (state.cash[s] = r2(state.cash[s] - x));

function addCard(state, s, k, cost) {
    const own = state.own[s];
    const b = state.basis[s];
    const have = own[k] || 0;
    b[k] = r2(((b[k] || 0) * have + cost) / (have + 1));
    own[k] = have + 1;
}

function dropCard(state, s, k) {
    if (--state.own[s][k] <= 0) {
        delete state.own[s][k];
        delete state.basis[s][k];
    }
}

function worth(state, s) {
    let w = state.cash[s];
    for (const k in state.own[s]) w += state.own[s][k] * value(state, +k);
    state.listings.forEach((l) => l.seat === s && (w += value(state, l.k)));
    state.packs[s].forEach((q, p) => (w += q * state.pack[p]));
    return r2(w);
}

function feed(state, e) {
    state.feed.push({ id: ++state.eid, at: Date.now(), day: state.day, ...e });
    if (state.feed.length > 40) state.feed.shift();
}

function phase(state, ctx, name, ms) {
    state.phase = name;
    state.deadline = ctx.now() + ms;
    state.ready = state.cash.map(() => false);
    const tag = state.day + name;
    state.tag = tag;
    const next = { buy: startSetup, setup: startSell, sell: endSell, report: startDay }[name];
    ctx.later(ms, () => state.tag === tag && next(state, ctx));
}

function startDay(state, ctx) {
    if (state.day >= CFG.days) {
        state.phase = "done";
        state.deadline = null;
        return;
    }
    state.day++;
    const n = state.cash.length;
    const news = state.news[state.day];
    const rng = ctx.rng;
    const k = CFG.setsPerDay[0] + Math.floor(rng() * (CFG.setsPerDay[1] - CFG.setsPerDay[0] + 1));
    let offer = shuffle(rng, state.active).slice(0, k);
    if (news.reprint >= 0 && !offer.includes(news.reprint)) offer[0] = news.reprint;
    if (news.hot >= 0 && !offer.includes(news.hot) && rng() < 0.5) offer[1] = news.hot;
    offer = offer.sort((a, b) => SETS[a].packPrice - SETS[b].packPrice);
    state.stock = offer.map((p) => {
        const q = Math.max(2, Math.round(CFG.stockPerPlayer * n * (SETS[p].packPrice >= 30 ? 0.5 : 1) * (news.reprint === p ? 2 : 1)));
        return { p, q, of: q };
    });
    // the singles case: a handful of good cards, one copy each
    state.singles = shuffle(rng, state.pool.filter((i) => CARDS[i].r >= 2))
        .slice(0, 4 + n)
        .map((i) => {
            const key = i * 2 + (rng() < 0.12 ? 1 : 0);
            return { k: key, price: r2(value(state, key) * CFG.singlesMarkup), sold: -1 };
        })
        .sort((a, b) => a.price - b.price);
    state.today = state.cash.map(() => ({ rev: 0, sold: 0, spent: 0, best: null, buyins: 0, bulk: 0, streakCash: 0 }));
    X.newDay(state, rng, CFG);
    state.ripped = SETS.map(() => 0);
    state.q = state.cash.map(() => []);
    state.walkers = [];
    state.sold = [];
    state.bubbles = [];
    phase(state, ctx, "buy", state.day === 1 ? CFG.ms.buy1 : CFG.ms.buy);
}

function startSetup(state, ctx) {
    phase(state, ctx, "setup", state.day === 1 ? CFG.ms.setup1 : CFG.ms.setup);
}

function startSell(state, ctx) {
    const n = state.cash.length;
    const news = state.news[state.day];
    const rng = ctx.rng;
    // drop anything on display that is no longer owned
    state.disp.forEach((row, s) => {
        row.forEach((d, i) => {
            if (!d) return;
            const ok = d.p !== undefined ? state.packs[s][d.p] >= shownPack(state, s, d.p) : (state.own[s][d.k] || 0) >= shownKey(state, s, d.k);
            if (!ok) row[i] = null;
        });
    });
    const t = (state.day - 1) / Math.max(1, CFG.days - 1);
    const avgAppeal = seats(n).reduce((x, s) => x + appeal(state, s), 0) / n;
    const count = Math.max(3, Math.round((CFG.customers[0] + (CFG.customers[1] - CFG.customers[0]) * t) * (0.5 + n / 6) * news.traffic * (1 + 0.04 * avgAppeal)));
    const span = CFG.ms.sell - CFG.ms.lastIn;
    const crowd = Array.from({ length: count }, (_, i) => ({ ...makeCustomer(rng, state.day, news, state.active, CFG.priceScale), at: 800 + Math.floor(((i + rng() * 0.8) / count) * span) }));
    for (let i = 0; i < news.whale; i++) crowd.push({ ty: "whale", budget: 800 * CFG.priceScale, mult: 1.5, carry: false, want: news.hot >= 0 ? news.hot : state.active[0], at: 2500 + i * 12000 });
    crowd.sort((a, b) => a.at - b.at);
    state.crowd = { list: crowd, i: 0, start: ctx.now() };
    state.q = state.cash.map(() => []);
    phase(state, ctx, "sell", CFG.ms.sell);
    ctx.later(CFG.vip.at, () => X.vipVisit(state, ctx, sellTo, bubble, feed));
    const tick = () => {
        if (state.phase !== "sell") return;
        serveDue(state, ctx);
        ctx.later(CFG.ms.tick, tick);
    };
    ctx.later(300, tick);
}

function bubble(state, s, ty, text, mood) {
    state.bubbles.push({ id: ++state.eid, at: Date.now(), seat: s, ty, text, mood });
    if (state.bubbles.length > 30) state.bubbles.shift();
}

const money = (x) => "$" + (x >= 100 ? Math.round(x) : x.toFixed(2));

function enqueue(state, s, o, now) {
    o.id = ++state.eid;
    o.until = state.q[s].length ? null : now + CFG.ms.offer;
    state.q[s].push(o);
}

function nextOffer(state, s, now) {
    state.q[s].shift();
    if (state.q[s][0]) state.q[s][0].until = now + CFG.ms.offer;
}

function serveDue(state, ctx) {
    const cr = state.crowd;
    const now = ctx.now();
    const news = state.news[state.day];
    state.q.forEach((q, s) => {
        if (q[0] && q[0].until < now) {
            bubble(state, s, q[0].ty, "Walked away", "walk");
            if (q[0].kind !== "sell") X.onWalk(state, s);
            nextOffer(state, s, now);
        }
    });
    while (cr.i < cr.list.length && cr.list[cr.i].at <= now - cr.start) {
        const cu = cr.list[cr.i++];
        const busy = (s, slot) => state.q[s].some((o) => o.slot === slot);
        const { path, pick } = visit(state, cu, ctx.rng, news, (s) => appeal(state, s), busy);
        let seat = -1;
        if (pick) {
            seat = pick.seat;
            haggle(state, cu, pick, ctx);
        }
        let to = -1;
        if (cu.carry) to = offerFrom(state, cu, path, ctx);
        state.walkers.push({ id: ++state.eid, ty: cu.ty, at: now, path, seat: seat >= 0 ? seat : to });
        if (state.walkers.length > 40) state.walkers.shift();
    }
}

function haggle(state, cu, pk, ctx) {
    const rng = ctx.rng;
    const K = KINDS[cu.ty];
    const s = pk.seat;
    const d = state.disp[s][pk.slot];
    if (pk.list <= pk.w && pk.list <= cu.budget && rng() < K.payP) {
        sellTo(state, s, pk.slot, pk.list, null, cu.ty, { how: "paid" });
        bubble(state, s, cu.ty, "Paid " + money(pk.list) + "!", "deal");
        return;
    }
    if (state.q[s].length >= CFG.queue) {
        bubble(state, s, cu.ty, "Line's too long…", "walk");
        return;
    }
    const cash = r2(Math.min(pk.w, pk.list * K.open, cu.budget));
    let bump = r2(Math.min(pk.w, pk.list * K.bump, cu.budget));
    if (!(rng() < K.bumpP) || bump <= cash + 0.04) bump = null;
    const o = { kind: "buy", ty: cu.ty, slot: pk.slot, k: d.k, p: d.p, list: pk.list, m: r2(pk.m), cash, bump, w: r2(Math.min(pk.w, cu.budget)), giveV: 0, rounds: 0 };
    if (rng() < K.tradeP && cash >= 3) {
        for (let tries = 0; tries < 14; tries++) {
            const i = M.pick(rng, state.pool);
            const k = i * 2 + (rng() < FOIL.chance ? 1 : 0);
            const v = value(state, k);
            if (v >= cash * 0.25 && v <= cash * 0.8) {
                o.kind = "trade";
                o.give = k;
                o.giveV = v;
                o.cash = r2(cash - v);
                if (o.bump !== null) o.bump = r2(bump - v);
                break;
            }
        }
    }
    o.log = [{ who: "them", amt: r2(o.cash + o.giveV) }];
    o.opts = counters(o);
    enqueue(state, s, o, ctx.now());
    bubble(state, s, cu.ty, o.kind === "trade" ? "Trade you?" : "Offered " + money(cash) + "!", "offer");
}

function sellTo(state, s, slot, cash, give, ty, deal) {
    const d = state.disp[s][slot];
    const it = itemOf(state, d);
    const total = r2(cash + (give ? give.v : 0));
    let flip = 0;
    if (d.p !== undefined) {
        flip = total - (state.packBasis[s][d.p] || state.pack[d.p]);
        state.packs[s][d.p]--;
        if (!state.packs[s][d.p]) delete state.packBasis[s][d.p];
    } else {
        flip = total - (state.basis[s][d.k] || 0);
        dropCard(state, s, d.k);
        state.flow[idxOf(d.k)] += 0.03;
    }
    if (give) addCard(state, s, give.k, give.v);
    state.disp[s][slot] = null;
    state.cash[s] = r2(state.cash[s] + cash);
    const td = state.today[s];
    td.rev = r2(td.rev + total);
    td.sold++;
    if (!td.best || total > td.best.price) td.best = { k: d.k, p: d.p, price: total };
    const st = state.stats[s];
    st.rev = r2(st.rev + total);
    st.served++;
    if (!st.flip || flip > st.flip.profit) st.flip = { k: d.k, p: d.p, profit: r2(flip), price: total };
    state.sold.push({ seat: s, slot, day: state.day });
    feed(state, { kind: give ? "swap" : "sold", seat: s, k: d.k, p: d.p, price: total, paid: cash, give: give ? give.k : undefined, m: r2(it.m), ty });
    const list = ask(it.m, d.pct);
    const bonus = X.onDeal(state, s, { r: d.k !== undefined ? CARDS[idxOf(d.k)].r : -1, full: total >= list - 0.01, how: "accept", ty, trade: !!give, ...deal }, CFG, feed);
    if (bonus) bubble(state, s, ty, "🔥×" + state.streak[s] + " +" + money(bonus), "streak");
}

function offerFrom(state, cu, path, ctx) {
    const lic = seats(state.cash.length).filter((s) => state.up[s].lic && state.q[s].length < CFG.queue);
    if (!lic.length) return -1;
    const near = lic.filter((s) => path.includes(s));
    const to = M.pick(ctx.rng, near.length ? near : lic);
    const rr = ctx.rng();
    const want = rr < 0.12 ? 1 : rr < 0.62 ? 2 : rr < 0.9 ? 3 : rr < 0.99 ? 4 : 5;
    const list = state.pool.filter((j) => CARDS[j].r === Math.min(want, M.TOP));
    const i = M.pick(ctx.rng, list.length ? list : state.pool);
    const k = i * 2 + (ctx.rng() < FOIL.chance ? 1 : 0);
    const pct = CFG.up.lic.pct[state.up[to].lic - 1];
    const m = value(state, k);
    enqueue(state, to, { kind: "sell", ty: cu.ty, k, m, cash: Math.max(0.05, r2((m * pct) / 100)), bump: null, giveV: 0, rounds: 0, log: [], opts: [] }, ctx.now());
    bubble(state, to, cu.ty, "Wanna buy this?", "offer");
    return to;
}

// one-tap counter offers (totals, cash + their card): meet halfway, 95% of the sticker, full sticker
function counters(o) {
    const t = r2(o.cash + (o.giveV || 0));
    if (o.kind === "sell" || o.rounds >= CFG.counters || t >= o.list - 0.01) return [];
    const out = [{ id: "half", amt: r2((t + o.list) / 2) }, { id: "95", amt: r2(o.list * 0.95) }, { id: "full", amt: o.list }];
    return out.filter((x, i) => x.amt > t + 0.01 && !out.slice(i + 1).some((y) => Math.abs(y.amt - x.amt) < 0.02));
}

// you counter: the customer's personality (and a coin flip) decides: take it, come back with their own number, or walk
function counter(state, s, o, i, ctx) {
    const now = ctx.now();
    const c = Number.isInteger(i) ? o.opts[i] : null;
    if (!c) return { error: o.rounds >= CFG.counters ? "They won't haggle any more." : "Pick a counter offer." };
    const K = KINDS[o.ty];
    const t = r2(o.cash + o.giveV);
    const push = Math.min(1, (c.amt - t) / Math.max(0.01, o.list - t));
    o.rounds++;
    o.log.push({ who: "you", amt: c.amt });
    o.until = Math.max(o.until, now) + CFG.ms.counter;
    bubble(state, s, o.ty, "Haggling!", "counter");
    const rng = ctx.rng;
    const fits = c.amt <= o.w + 0.001;
    const yes = fits && rng() < K.yes * (1 - push * K.push) + (c.id === "half" ? K.half : 0);
    if (yes) {
        o.cash = r2(c.amt - o.giveV);
        sellTo(state, s, o.slot, o.cash, o.kind === "trade" ? { k: o.give, v: o.giveV } : null, o.ty, { how: "counter" });
        bubble(state, s, o.ty, "Deal at " + money(c.amt) + "!", "deal");
        nextOffer(state, s, now);
        return { ok: true };
    }
    const back = r2(Math.min(o.w, t + (c.amt - t) * K.meet * (0.7 + rng() * 0.6)));
    if (rng() < K.walk + push * 0.35 || back <= t + 0.01 || o.rounds > CFG.counters) {
        bubble(state, s, o.ty, "Walked away", "walk");
        X.onWalk(state, s);
        nextOffer(state, s, now);
        return { ok: true };
    }
    o.cash = r2(back - o.giveV);
    o.bump = null;
    o.log.push({ who: "them", amt: back });
    o.opts = counters(o);
    bubble(state, s, o.ty, "How about " + money(back) + "?", "counter");
    return { ok: true };
}

// answer the offer at the front of your line
function answer(state, s, p, ctx) {
    const now = ctx.now();
    const o = state.q[s][0];
    if (state.phase !== "sell" || !o || o.id !== p.id) return { error: "That customer is gone." };
    if (o.until < now) {
        bubble(state, s, o.ty, "Walked away", "walk");
        if (o.kind !== "sell") X.onWalk(state, s);
        nextOffer(state, s, now);
        return { error: "Too slow, they walked off." };
    }
    if (p.counter !== undefined) return o.kind === "sell" ? { error: "No haggling on that one, take it or leave it." } : counter(state, s, o, p.counter, ctx);
    if (p.yes !== true) {
        if (o.bump !== null && o.bump !== undefined && !o.rounds) {
            o.cash = o.bump;
            o.bump = null;
            o.until = now + CFG.ms.offer;
            o.log.push({ who: "you", amt: null }, { who: "them", amt: r2(o.cash + o.giveV) });
            o.opts = counters(o);
            bubble(state, s, o.ty, o.kind === "trade" ? "Okay, I'll add more cash!" : "Fine… " + money(o.cash) + "?", "counter");
            return { ok: true };
        }
        bubble(state, s, o.ty, "Walked away", "walk");
        if (o.kind !== "sell") X.onWalk(state, s);
        nextOffer(state, s, now);
        return { ok: true };
    }
    if (o.kind === "sell") {
        if (o.cash > state.cash[s]) return { error: "Not enough cash." };
        pay(state, s, o.cash);
        addCard(state, s, o.k, o.cash);
        state.today[s].spent = r2(state.today[s].spent + o.cash);
        state.today[s].buyins++;
        state.flow[idxOf(o.k)] -= 0.025;
        feed(state, { kind: "buyin", seat: s, k: o.k, price: o.cash, m: o.m, ty: o.ty });
    } else {
        sellTo(state, s, o.slot, o.cash, o.kind === "trade" ? { k: o.give, v: o.giveV } : null, o.ty);
    }
    bubble(state, s, o.ty, "Deal!", "deal");
    nextOffer(state, s, now);
    return { ok: true };
}

function endSell(state, ctx) {
    serveDue(state, ctx);
    state.q.forEach((q, s) => q.length && bubble(state, s, q[0].ty, "Show's closing, bye!", "walk"));
    state.q = state.cash.map(() => []);
    // bulk bins
    state.cash.forEach((_, s) => {
        if (!state.up[s].bulk) return;
        let q = 0;
        let total = 0;
        for (const key in state.own[s]) {
            const k = +key;
            if (isFoil(k) || CARDS[idxOf(k)].r > 1) continue;
            const spare = spareKey(state, s, k);
            for (let j = 0; j < spare; j++) {
                total += (value(state, k) * CFG.bulkPct) / 100;
                q++;
                dropCard(state, s, k);
            }
        }
        if (!q) return;
        total = r2(total);
        state.cash[s] = r2(state.cash[s] + total);
        state.today[s].bulk = total;
        state.today[s].rev = r2(state.today[s].rev + total);
        feed(state, { kind: "bulk", seat: s, n: q, price: total });
    });
    state.highlights = X.closeDay(state, feed, (s) => appeal(state, s));
    report(state, ctx);
}

function report(state, ctx) {
    const last = state.day >= CFG.days;
    const before = state.price.slice();
    const pb = state.pack.slice();
    if (!last) {
        const n = state.news[state.day + 1];
        overnight(state, ctx.rng, n, state.ripped);
        // sealed packs track what's inside (pack EV), times a scarcity premium from how fast the distributor sold out
        state.pack = state.pack.map((x, s) => {
            if (!state.active.includes(s)) return x;
            const st = state.stock.find((y) => y.p === s);
            const sold = st ? 1 - st.q / st.of : -1;
            const d = st ? (sold >= 0.8 ? 1 + CFG.scarcity : sold < 0.3 ? 0.97 : 1.0) : 1 + CFG.scarcity / 2;
            state.scar[s] = Math.max(0.8, Math.min(CFG.scarcityCap, state.scar[s] * d * (n.reprint === s ? 0.88 : 1)));
            return r2(Math.max(0.5, (M.packEV(state, s, CFG.packSize) / (CFG.packEV * Math.pow(SETS[s].demand, CFG.demandTilt))) * state.scar[s]));
        });
        state.pack.forEach((p, s) => state.packHist[s].push(p));
    }
    const movers = state.pool.map((i) => ({ i, a: before[i], b: state.price[i] }))
        .filter((x) => x.b >= 2 || x.a >= 2)
        .sort((x, y) => Math.abs(y.b / y.a - 1) - Math.abs(x.b / x.a - 1))
        .slice(0, 6)
        .map((x) => ({ k: x.i * 2, a: x.a, b: x.b }));
    const packs = SETS.map((s, p) => ({ p, a: pb[p], b: state.pack[p] })).filter((x) => x.a !== x.b);
    state.cash.forEach((_, s) => state.worthHist[s].push(worth(state, s)));
    state.report = { day: state.day, movers, packMoves: packs, today: state.today.map((t) => ({ rev: t.rev, sold: t.sold, best: t.best })), last, highlights: state.highlights || [] };
    phase(state, ctx, "report", CFG.ms.report);
}

function awards(state) {
    const n = state.cash.length;
    const out = [];
    const best = (f) => seats(n).reduce((b, s) => (f(s) > f(b) ? s : b), 0);
    const bp = state.pulls.reduce((b, p) => (!b || p.v > b.v ? p : b), null);
    if (bp) out.push({ id: "pull", icon: "🎰", name: "Biggest pull", seat: bp.seat, k: bp.k, text: "$" + bp.v.toFixed(2) });
    const fl = best((s) => (state.stats[s].flip ? state.stats[s].flip.profit : -1e9));
    const f = state.stats[fl].flip;
    if (f && f.profit > 0) out.push({ id: "flip", icon: "🔁", name: "Best flip", seat: fl, k: f.k, p: f.p, text: "+$" + f.profit.toFixed(2) + " profit" });
    const ts = best((s) => state.stats[s].rev);
    if (state.stats[ts].rev > 0) out.push({ id: "seller", icon: "🏆", name: "Top seller", seat: ts, text: "$" + state.stats[ts].rev.toFixed(2) + " in sales" });
    const fb = best((s) => decor(state, s) * 1000 + state.stats[s].decor);
    if (decor(state, fb) > 0) out.push({ id: "booth", icon: "✨", name: "Fanciest booth", seat: fb, text: decor(state, fb) + " appeal" });
    const mm = best((s) => state.stats[s].mm);
    if (state.stats[mm].mm > 0) out.push({ id: "maker", icon: "🤝", name: "Market maker", seat: mm, text: state.stats[mm].mm + " player trades" });
    return out;
}

// ---- views ----
function cardInfo(state, i) {
    const x = CARDS[i];
    const c = x.c;
    return { id: c.id, set: x.s, n: c.name, r: x.r, t: x.t, hp: c.hp, atk: c.atk, def: c.def, spd: c.spd, mv: c.move ? c.move.name : "", pw: c.move ? c.move.power : 0, fl: c.flavor || "", p: state.price[i], h: state.hist[i] };
}

function pub(state, refs) {
    const n = state.cash.length;
    const add = (k) => k !== undefined && k !== null && refs.add(idxOf(k));
    const setup = state.phase === "setup";
    const booths = seats(n).map((s) => ({
        appeal: appeal(state, s),
        decor: DECOR.filter((k) => state.up[s][k]),
        helper: state.up[s].helper,
        slots: state.slots[s],
        lic: state.up[s].lic,
        items: setup ? null : state.disp[s].map((d) => {
            if (!d) return null;
            add(d.k);
            const it = itemOf(state, d);
            return { k: d.k, p: d.p, pct: d.pct, price: ask(it.m, d.pct), m: r2(it.m) };
        }),
    }));
    state.listings.forEach((l) => add(l.k));
    state.singles.forEach((x) => add(x.k));
    const pulls = state.pulls.slice(-8);
    pulls.forEach((p) => add(p.k));
    const fd = state.feed.slice(-24);
    fd.forEach((e) => add(e.k));
    const rep = state.report;
    if (rep) rep.movers.forEach((m) => add(m.k));
    const done = state.phase === "done";
    const aw = done ? awards(state) : null;
    if (aw) aw.forEach((a) => add(a.k));
    const news = state.news[state.day];
    const w = state.wanted;
    if (w.kind === "card") refs.add(w.i);
    if (w.k !== undefined) add(w.k);
    (state.highlights || []).forEach((h) => add(h.k));
    return {
        phase: state.phase,
        day: state.day,
        days: CFG.days,
        deadline: state.deadline,
        ready: state.ready,
        news: news.text,
        tomorrow: state.phase === "report" && !rep.last ? state.news[state.day + 1].text : null,
        name: CFG.name,
        sets: SETS.map((s, p) => ({ id: s.id, name: s.name, code: s.code, color: s.color, accent: s.accent, theme: s.theme, on: state.active.includes(p), pack: state.pack[p], h: state.packHist[p] })),
        bubbles: state.phase === "sell" ? state.bubbles.slice(-16) : [],
        types: TYPES.map((t) => ({ name: t.name, color: t.color, icon: t.icon })),
        rar: RARITIES.map((r) => r.name),
        foil: [FOIL.mult, FOIL.secretMult || FOIL.mult],
        stock: state.stock.map((x) => ({ p: x.p, q: x.q, of: x.of, price: state.pack[x.p] })),
        singles: state.singles,
        listings: state.listings.map((l) => ({ id: l.id, seat: l.seat, k: l.k, price: l.price, m: value(state, l.k) })),
        worth: seats(n).map((s) => worth(state, s)),
        booths,
        pulls,
        feed: fd,
        sold: state.sold.filter((x) => x.day === state.day),
        report: rep,
        worthHist: state.worthHist,
        awards: aw,
        challenge: { id: state.chal.id, text: state.chal.text, prize: state.chal.prize, need: state.chal.need, done: state.chal.done },
        wanted: { kind: w.kind, k: w.kind === "card" ? w.i * 2 : undefined, s: w.s, t: w.t, text: w.text, bounty: w.bounty, claimed: w.claimed, got: w.k },
        streak: state.streak,
        acts: state.actsUsed,
        cfg: { pcts: CFG.pcts, maxSlots: CFG.maxSlots, packSize: CFG.packSize, bulkPct: CFG.bulkPct, markup: CFG.singlesMarkup, offerMs: CFG.ms.offer, fish: CFG.fish, packsPerAction: CFG.actions.packs, vipAt: CFG.vip.at },
    };
}

function catOf(state, refs) {
    const cat = {};
    refs.forEach((i) => (cat[i] = cardInfo(state, i)));
    return cat;
}

function ownList(state, s) {
    return Object.keys(state.own[s]).map((k) => [+k, state.own[s][k], state.basis[s][k] || 0]);
}

// ---- moves ----
const okSet = (p) => Number.isInteger(p) && p >= 0 && p < SETS.length;
const okKey = (k) => Number.isInteger(k) && k >= 0 && k < CARDS.length * 2;

function upCost(state, s, key) {
    const u = state.up[s];
    if (key === "slot") return state.slots[s] >= CFG.maxSlots ? null : CFG.slotCost[state.slots[s] - CFG.slots];
    if (key === "lic") return u.lic >= CFG.up.lic.cost.length ? null : CFG.up.lic.cost[u.lic];
    if (key === "helper") return u.helper >= CFG.up.helper.cost.length ? null : CFG.up.helper.cost[u.helper];
    if (key === "gun") return CFG.up.gun.cost;
    if (!CFG.up[key]) return null;
    return u[key] ? null : CFG.up[key].cost;
}

function rip(state, s, p, ctx) {
    if (!okSet(p)) return { error: "Pick a pack." };
    if (sparePack(state, s, p) < 1) return { error: "You don't have a sealed " + SETS[p].name + " pack to open." };
    state.packs[s][p]--;
    const cost = state.packBasis[s][p] || state.pack[p];
    if (!state.packs[s][p]) delete state.packBasis[s][p];
    const keys = openPack(ctx.rng, p, CFG.packSize);
    const vals = keys.map((k) => value(state, k));
    keys.forEach((k) => addCard(state, s, k, r2(cost / keys.length)));
    state.ripped[p]++;
    state.stats[s].ripped++;
    X.onRip(state, s, p, feed);
    const no = ++state.ripNo;
    state.rips[s].push({ no, p, keys, vals, cost });
    if (state.rips[s].length > 4) state.rips[s].shift();
    keys.forEach((k, j) => {
        const r = CARDS[idxOf(k)].r;
        if (vals[j] >= CFG.bigPull || r >= 4) {
            state.pulls.push({ id: ++state.eid, at: ctx.now(), seat: s, k, v: vals[j], day: state.day });
            if (state.pulls.length > 30) state.pulls.shift();
        }
    });
    return { ok: true };
}

const cheapest = (state) => Math.min(...state.stock.map((x) => state.pack[x.p]));

function move(state, s, p, ctx) {
    if (!p || typeof p !== "object") return { error: "Bad move." };
    const ph = state.phase;
    const shop = ph === "buy" || ph === "setup";
    if (ph === "done") return { error: "The show is over." };
    if (p.act === "ready") {
        if (!["buy", "setup", "report"].includes(ph)) return { error: "Nothing to finish right now." };
        state.ready[s] = p.on !== false;
        if (state.ready.every(Boolean)) ({ buy: startSetup, setup: startSell, report: startDay })[ph](state, ctx);
        return { ok: true };
    }
    if (p.act === "rip") return rip(state, s, p.p, ctx);
    if (p.act === "offer") return answer(state, s, p, ctx);
    if (p.act === "fish") return X.fish(state, s, p, ctx, CFG, cheapest(state), feed);
    if (!shop) return { error: ph === "sell" ? "The doors are open, watch your booth!" : "The shop is closed right now." };
    const spend = (x) => {
        pay(state, s, x);
        state.today[s].spent = r2(state.today[s].spent + x);
    };
    const out = state.acts[s] < 1 ? { error: "Out of actions. Tomorrow you get " + X.tomorrow(state, s, CFG) + "." } : null;
    if (p.act === "pack") {
        if (ph !== "buy") return { error: "The distributor only sells in the morning." };
        const st = state.stock.find((x) => x.p === p.p);
        if (!okSet(p.p) || !st) return { error: "The distributor doesn't carry that today." };
        const qty = p.n === undefined ? 1 : p.n;
        if (!Number.isInteger(qty) || qty < 1 || qty > CFG.actions.packs) return { error: "One action buys 1 to " + CFG.actions.packs + " packs." };
        if (st.q < 1) return { error: "Sold out!" };
        if (st.q < qty) return { error: "Only " + st.q + " left." };
        const price = state.pack[p.p];
        if (price * qty > state.cash[s] + 0.001) return { error: "Not enough cash." };
        if (out) return out;
        X.useAction(state, s, CFG);
        spend(r2(price * qty));
        st.q -= qty;
        const have = state.packs[s][p.p];
        state.packBasis[s][p.p] = r2(((state.packBasis[s][p.p] || 0) * have + price * qty) / (have + qty));
        state.packs[s][p.p] += qty;
        state.stats[s].packs += qty;
        return { ok: true };
    }
    if (p.act === "single") {
        if (ph !== "buy") return { error: "The singles case only opens in the morning." };
        const x = state.singles[p.i];
        if (!Number.isInteger(p.i) || !x) return { error: "Pick a card." };
        if (x.sold >= 0) return { error: "Someone already bought that one." };
        if (x.price > state.cash[s]) return { error: "Not enough cash." };
        if (out) return out;
        X.useAction(state, s, CFG);
        spend(x.price);
        x.sold = s;
        addCard(state, s, x.k, x.price);
        return { ok: true };
    }
    if (p.act === "list") {
        const price = Number(p.price);
        if (!okKey(p.k) || !(price >= 0.05 && price <= 100000)) return { error: "Pick a card and a price." };
        if (spareKey(state, s, p.k) < 1) return { error: "You don't have a spare copy of that card." };
        if (state.listings.filter((l) => l.seat === s).length >= CFG.maxListings) return { error: "You can list " + CFG.maxListings + " cards at a time." };
        if (out) return out;
        X.useAction(state, s, CFG);
        const b = state.basis[s][p.k] || 0;
        dropCard(state, s, p.k);
        state.listings.push({ id: ++state.eid, seat: s, k: p.k, price: r2(price), basis: b });
        return { ok: true };
    }
    if (p.act === "unlist") {
        const l = state.listings.find((x) => x.id === p.id && x.seat === s);
        if (!l) return { error: "That listing is gone." };
        state.listings = state.listings.filter((x) => x !== l);
        addCard(state, s, l.k, l.basis);
        return { ok: true };
    }
    if (p.act === "take") {
        const l = state.listings.find((x) => x.id === p.id);
        if (!l) return { error: "Someone beat you to it." };
        if (l.seat === s) return { error: "That's your own listing." };
        if (l.price > state.cash[s]) return { error: "Not enough cash." };
        if (out) return out;
        X.useAction(state, s, CFG);
        state.listings = state.listings.filter((x) => x !== l);
        spend(l.price);
        addCard(state, s, l.k, l.price);
        state.cash[l.seat] = r2(state.cash[l.seat] + l.price);
        const st = state.stats[l.seat];
        st.rev = r2(st.rev + l.price);
        const profit = r2(l.price - l.basis);
        if (!st.flip || profit > st.flip.profit) st.flip = { k: l.k, profit, price: l.price };
        st.mm++;
        state.stats[s].mm++;
        feed(state, { kind: "trade", seat: l.seat, to: s, k: l.k, price: l.price });
        return { ok: true };
    }
    if (p.act === "slot") {
        const i = p.i;
        if (!Number.isInteger(i) || i < 0 || i >= state.slots[s]) return { error: "Pick a slot." };
        const row = state.disp[s];
        if (p.clear) {
            row[i] = null;
            return { ok: true };
        }
        const pct = CFG.pcts.includes(p.pct) ? p.pct : 100;
        const old = row[i];
        row[i] = null;
        let d;
        if (p.k !== undefined) {
            if (!okKey(p.k) || spareKey(state, s, p.k) < 1) return (row[i] = old), { error: "You don't have a spare copy of that card." };
            d = { k: p.k, pct, at: ctx.now() };
        } else if (p.p !== undefined) {
            if (!okSet(p.p) || sparePack(state, s, p.p) < 1) return (row[i] = old), { error: "You don't have a spare sealed pack of that set." };
            d = { p: p.p, pct, at: ctx.now() };
        } else if (old) d = { ...old, pct };
        else return { error: "Pick something to show." };
        row[i] = d;
        return { ok: true };
    }
    if (p.act === "up") {
        const key = p.key;
        const cost = typeof key === "string" ? upCost(state, s, key) : null;
        if (cost === null || cost === undefined) return { error: "You can't buy that." };
        if (key === "gun" && !okSet(p.p)) return { error: "Pick a set to scan." };
        if (cost > state.cash[s]) return { error: "Not enough cash." };
        if (out) return out;
        X.useAction(state, s, CFG);
        spend(cost);
        const u = state.up[s];
        if (key === "slot") {
            state.slots[s]++;
            state.disp[s].push(null);
        } else if (key === "lic") u.lic++;
        else if (key === "helper") {
            u.helper++;
            state.acts[s] = Math.min(CFG.actions.max, state.acts[s] + 1);
        }
        else if (key === "gun") {
            const n = state.day < CFG.days ? state.news[state.day + 1] : null;
            state.hints[s] = state.hints[s].filter((h) => h.day === state.day && h.p !== p.p);
            state.hints[s].push({ day: state.day, p: p.p, pct: state.day < CFG.days ? forecast(state, n, p.p) : 0, news: !!(n && n.set[p.p]), last: state.day >= CFG.days });
        } else {
            u[key] = true;
            state.stats[s].decor += cost;
        }
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
    CFG,
    init({ rng, ctx, players = 2 }) {
        const n = players;
        const state = {
            day: 0,
            phase: "buy",
            deadline: null,
            ready: new Array(n).fill(false),
            cash: new Array(n).fill(CFG.cash),
            own: seats(n).map(() => ({})),
            basis: seats(n).map(() => ({})),
            packs: seats(n).map(() => SETS.map(() => 0)),
            packBasis: seats(n).map(() => ({})),
            slots: new Array(n).fill(CFG.slots),
            disp: seats(n).map(() => new Array(CFG.slots).fill(null)),
            up: seats(n).map(() => ({ lights: false, banner: false, mat: false, case: false, plush: false, lic: 0, bulk: false, helper: 0 })),
            hints: seats(n).map(() => []),
            rips: seats(n).map(() => []),
            stats: seats(n).map(() => ({ rev: 0, served: 0, flip: null, mm: 0, decor: 0, ripped: 0, packs: 0 })),
            listings: [],
            pulls: [],
            feed: [],
            sold: [],
            walkers: [],
            q: seats(n).map(() => []),
            acts: new Array(n).fill(0),
            actsUsed: new Array(n).fill(0),
            bonusAct: new Array(n).fill(0),
            fished: new Array(n).fill(null),
            streak: new Array(n).fill(0),
            bestStreak: new Array(n).fill(0),
            bubbles: [],
            stock: [],
            singles: [],
            ripped: SETS.map(() => 0),
            report: null,
            eid: 0,
            ripNo: 0,
            tag: "",
        };
        state.active = activeSets();
        state.scar = SETS.map(() => 1);
        state.pool = CARDS.map((c, i) => i).filter((i) => state.active.includes(CARDS[i].s));
        initMarket(state, rng, CFG, CFG.packSize);
        const hits = state.pool.filter((i) => CARDS[i].r >= 2 && CARDS[i].r <= 4);
        state.news = [null].concat(Array.from({ length: CFG.days }, (_, d) => makeNews(rng, d + 1, hits, state.active)));
        // day 1's news is already priced in at the open
        const n1 = state.news[1];
        state.price = state.price.map((x, i) => r2(Math.max(0.05, x * Math.exp(M.newsFor(n1, i)))));
        SETS.forEach((s, p) => (state.lvl[p] *= Math.exp(n1.set[p] || 0)));
        state.hist = state.price.map((x) => [x]);
        state.worthHist = seats(n).map(() => [CFG.cash]);
        startDay(state, ctx);
        return state;
    },
    view(state, seat) {
        const refs = new Set();
        const v = pub(state, refs);
        const own = ownList(state, seat);
        own.forEach(([k]) => refs.add(idxOf(k)));
        state.rips[seat].forEach((r) => r.keys.forEach((k) => refs.add(idxOf(k))));
        const q = state.q[seat].slice(0, 2).map(({ w, bump, ...o }) => o);
        q.forEach((o) => [o.k, o.give].forEach((k) => k !== undefined && refs.add(idxOf(k))));
        state.disp[seat].forEach((d) => d && d.k !== undefined && refs.add(idxOf(d.k)));
        const t = state.today[seat];
        v.me = {
            cash: state.cash[seat],
            own,
            packs: state.packs[seat],
            slots: state.slots[seat],
            disp: state.disp[seat],
            up: state.up[seat],
            appeal: appeal(state, seat),
            hints: state.hints[seat].filter((h) => h.day === state.day),
            rips: state.rips[seat],
            q,
            waiting: state.q[seat].length,
            fish: state.fished[seat] && state.fished[seat].day === state.day ? state.fished[seat] : null,
            canFish: state.phase === "buy" && !(state.fished[seat] && state.fished[seat].day === state.day) && state.cash[seat] < cheapest(state),
            acts: state.acts[seat],
            actsTomorrow: X.tomorrow(state, seat, CFG),
            chalProg: state.chal.prog[seat],
            hasWanted: Object.keys(state.own[seat]).some((k) => X.wants(state.wanted, +k)),
            today: t,
            costs: Object.fromEntries(["slot", "lic", "gun", "helper", ...DECOR, "bulk"].map((k) => [k, upCost(state, seat, k)])),
            licPct: state.up[seat].lic ? CFG.up.lic.pct[state.up[seat].lic - 1] : null,
        };
        v.shop = CFG.up;
        v.cat = catOf(state, refs);
        return v;
    },
    tv(state) {
        const refs = new Set();
        const v = pub(state, refs);
        v.walkers = state.phase === "sell" ? state.walkers : [];
        v.kinds = Object.keys(KINDS);
        v.lines = state.q.map((q) => q.length);
        const label = { buy: "Morning shopping", setup: "Setting up tables", sell: "Doors open", report: "Closing time", done: "Show's over" }[state.phase];
        v.headline = state.phase === "done" ? label : "Day " + state.day + " · " + label;
        v.sub = state.news[state.day].text;
        v.endAt = state.deadline;
        v.scores = v.worth.map((w) => "$" + Math.round(w));
        v.status = state.cash.map((_, s) => (state.phase === "sell" ? state.today[s].sold + " sold" : state.ready[s] ? "ready" : ""));
        v.cat = catOf(state, refs);
        return v;
    },
    move,
    result(state) {
        if (state.phase !== "done") return null;
        const w = seats(state.cash.length).map((s) => worth(state, s));
        const best = Math.max(...w);
        return ranked(w, "high", "Top booth closed the show worth $" + best.toFixed(2) + " (everyone started with $" + CFG.cash + ")");
    },
};
