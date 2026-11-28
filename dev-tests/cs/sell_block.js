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
    const crowd = Array.from({ length: count }, (_, i) => ({ ...makeCustomer(rng, state.day, news, state.active), at: 800 + Math.floor(((i + rng() * 0.8) / count) * span) }));
    for (let i = 0; i < news.whale; i++) crowd.push({ ty: "whale", budget: 800, mult: 1.5, carry: false, want: news.hot >= 0 ? news.hot : state.active[0], at: 2500 + i * 12000 });
    crowd.sort((a, b) => a.at - b.at);
    state.crowd = { list: crowd, i: 0, start: ctx.now() };
    state.q = state.cash.map(() => []);
    phase(state, ctx, "sell", CFG.ms.sell);
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
        sellTo(state, s, pk.slot, pk.list, null, cu.ty);
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
    const o = { kind: "buy", ty: cu.ty, slot: pk.slot, k: d.k, p: d.p, list: pk.list, m: r2(pk.m), cash, bump };
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
    enqueue(state, s, o, ctx.now());
    bubble(state, s, cu.ty, o.kind === "trade" ? "Trade you?" : "Offered " + money(cash) + "!", "offer");
}

function sellTo(state, s, slot, cash, give, ty) {
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
    feed(state, { kind: give ? "swap" : "sold", seat: s, k: d.k, p: d.p, price: total, cash, give: give ? give.k : undefined, m: r2(it.m), ty });
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
    enqueue(state, to, { kind: "sell", ty: cu.ty, k, m, cash: Math.max(0.05, r2((m * pct) / 100)), bump: null }, ctx.now());
    bubble(state, to, cu.ty, "Wanna buy this?", "offer");
    return to;
}

// answer the offer at the front of your line
function answer(state, s, p, ctx) {
    const now = ctx.now();
    const o = state.q[s][0];
    if (state.phase !== "sell" || !o || o.id !== p.id) return { error: "That customer is gone." };
    if (o.until < now) {
        bubble(state, s, o.ty, "Walked away", "walk");
        nextOffer(state, s, now);
        return { error: "Too slow, they walked off." };
    }
    if (p.yes !== true) {
        if (o.bump !== null && o.bump !== undefined) {
            o.cash = o.bump;
            o.bump = null;
            o.round = 1;
            o.until = now + CFG.ms.offer;
            bubble(state, s, o.ty, o.kind === "trade" ? "Okay, I'll add more cash!" : "Fine… " + money(o.cash) + "?", "counter");
            return { ok: true };
        }
        bubble(state, s, o.ty, "Walked away", "walk");
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
        feed(state, { kind: "bulk", seat: s, q, price: total });
    });
    report(state, ctx);
}

