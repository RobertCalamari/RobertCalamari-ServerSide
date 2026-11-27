// Totally Real Vending Simulator: the game-y layer on top of the shop. Daily challenge, the VIP's WANTED poster,
// hot streaks, fishing (when you're broke), actions per day and the end-of-day highlights. Numbers live in the game's CFG.
const M = require("./market");
const { CARDS, idxOf, r2, value, pick, shuffle } = M;
const { SETS, TYPES, RARITIES } = M.D;

const CHALLENGES = ["holo", "full3", "rip", "appeal", "collector", "trade", "sales", "streak"];

// ---- actions ----
function actionsFor(state, s, cfg) {
    const a = cfg.actions;
    return Math.min(a.max, a.base + (state.up[s].helper || 0) + state.bonusAct[s] + Math.min(a.carry, state.acts[s] || 0));
}

function useAction(state, s, cfg) {
    if (state.acts[s] < 1) return "Out of actions. Tomorrow you get " + tomorrow(state, s, cfg) + ".";
    state.acts[s]--;
    state.actsUsed[s]++;
    return null;
}

const tomorrow = (state, s, cfg) => Math.min(cfg.actions.max, cfg.actions.base + (state.up[s].helper || 0) + state.bonusAct[s] + Math.min(cfg.actions.carry, state.acts[s]));

// ---- new day: challenge, wanted poster, streaks, actions ----
function newDay(state, rng, cfg) {
    const n = state.cash.length;
    state.cash.forEach((_, s) => {
        state.acts[s] = state.day === 1 ? cfg.actions.base + (state.up[s].helper || 0) : actionsFor(state, s, cfg);
        state.actsUsed[s] = 0;
        state.bonusAct[s] = 0;
    });
    state.streak = new Array(n).fill(0);
    state.bestStreak = new Array(n).fill(0);
    state.fished = state.fished || new Array(n).fill(null);
    // the challenge (never the same one twice in a row)
    const prev = state.chal ? state.chal.id : null;
    const id = pick(rng, CHALLENGES.filter((c) => c !== prev && !(c === "rip" && !state.stock.length)));
    const ch = { id, prize: cfg.challenge.prize, done: [], prog: new Array(n).fill(0), need: 1 };
    if (id === "holo") ch.text = "Sell a Holo or better";
    if (id === "full3") (ch.text = "Close 3 deals at your full sticker price"), (ch.need = 3);
    if (id === "rip") {
        ch.set = pick(rng, state.stock).p;
        ch.text = "Rip a " + SETS[ch.set].name + " pack";
    }
    if (id === "appeal") ch.text = "Have the highest appeal at closing";
    if (id === "collector") ch.text = "Win a haggle with a Collector (they take your counter)";
    if (id === "trade") ch.text = "Accept a card trade from a customer";
    if (id === "sales") (ch.amt = Math.round(cfg.challenge.sales * cfg.priceScale)), (ch.text = "Sell $" + ch.amt + " worth today");
    if (id === "streak") ch.text = "Hit a 🔥×3 hot streak";
    state.chal = ch;
    // the VIP's wanted poster
    const roll = rng();
    const w = { claimed: -1, day: state.day };
    let list;
    if (roll < cfg.vip.cardP) {
        const rr = rng();
        const r = rr < 0.45 ? 2 : rr < 0.85 ? 3 : 4;
        const i = pick(rng, state.pool.filter((j) => CARDS[j].r === r));
        Object.assign(w, { kind: "card", i, text: CARDS[i].c.name });
        list = [i];
    } else if (roll < cfg.vip.cardP + 0.3) {
        const s = pick(rng, state.active);
        Object.assign(w, { kind: "set", s, rmin: 3, text: "any Holo or better from " + SETS[s].name });
        list = state.pool.filter((j) => CARDS[j].s === s && CARDS[j].r >= 3);
    } else {
        const types = [...new Set(state.pool.filter((j) => CARDS[j].r >= 3).map((j) => CARDS[j].t))];
        const t = pick(rng, types);
        Object.assign(w, { kind: "type", t, rmin: 3, text: "any Holo or better " + TYPES[t].name + " card" });
        list = state.pool.filter((j) => CARDS[j].t === t && CARDS[j].r >= 3);
    }
    // priced off the cheapest card that qualifies, so "any Holo" never pays like an Ultra
    const low = Math.min(...list.map((j) => state.price[j]));
    w.bounty = Math.round(Math.min(cfg.vip.max * cfg.priceScale, Math.max(cfg.vip.min * cfg.priceScale, low * cfg.vip.mult)));
    state.wanted = w;
}

const wants = (w, k) => {
    if (!w || k === undefined || k === null) return false;
    const c = CARDS[idxOf(k)];
    if (w.kind === "card") return idxOf(k) === w.i;
    if (w.kind === "set") return c.s === w.s && c.r >= w.rmin;
    return c.t === w.t && c.r >= w.rmin;
};

function complete(state, s, feed) {
    const ch = state.chal;
    if (ch.done.includes(s)) return;
    ch.done.push(s);
    state.cash[s] = r2(state.cash[s] + ch.prize);
    state.stats[s].chal = r2((state.stats[s].chal || 0) + ch.prize);
    state.bonusAct[s] = 1;
    feed(state, { kind: "challenge", seat: s, price: ch.prize });
}

const bump = (state, s, n, feed) => {
    const ch = state.chal;
    ch.prog[s] += n;
    if (ch.prog[s] >= ch.need) complete(state, s, feed);
};

// a deal closed at booth s: { r (rarity or -1), full, how: paid|accept|counter, ty, trade, total }
function onDeal(state, s, d, cfg, feed) {
    const ch = state.chal;
    if (ch.id === "holo" && d.r >= 3) bump(state, s, 1, feed);
    if (ch.id === "full3" && d.full) bump(state, s, 1, feed);
    if (ch.id === "collector" && d.ty === "collector" && d.how === "counter") bump(state, s, 1, feed);
    if (ch.id === "trade" && d.trade) bump(state, s, 1, feed);
    if (ch.id === "sales" && state.today[s].rev >= ch.amt) bump(state, s, 1, feed);
    if (!d.full) return 0;
    const k = ++state.streak[s];
    state.bestStreak[s] = Math.max(state.bestStreak[s], k);
    if (ch.id === "streak" && k >= 3) bump(state, s, 1, feed);
    if (k >= cfg.streak.actionAt) state.bonusAct[s] = 1;
    if (k < 2) return 0;
    const bonus = r2(cfg.streak.cash * cfg.priceScale * (k - 1));
    state.cash[s] = r2(state.cash[s] + bonus);
    state.today[s].streakCash = r2((state.today[s].streakCash || 0) + bonus);
    state.stats[s].streak = r2((state.stats[s].streak || 0) + bonus);
    return bonus;
}

const onWalk = (state, s) => (state.streak[s] = 0);
const onRip = (state, s, p, feed) => state.chal.id === "rip" && state.chal.set === p && bump(state, s, 1, feed);
const streakAppeal = (state, s, cfg) => Math.min(state.streak ? state.streak[s] : 0, cfg.streak.maxAppeal);

// the VIP walks in: the first booth to have put a wanted card on its table gets the bounty
function vipVisit(state, ctx, sellTo, bubble, feed) {
    const w = state.wanted;
    if (!w || w.claimed !== -1 || state.phase !== "sell") return;
    let best = null;
    state.disp.forEach((row, s) =>
        row.forEach((d, slot) => {
            if (!d || !wants(w, d.k)) return;
            if (!best || (d.at || 0) < best.at || ((d.at || 0) === best.at && s < best.s)) best = { s, slot, at: d.at || 0 };
        })
    );
    if (!best) {
        w.claimed = -2;
        feed(state, { kind: "vipgone" });
        return;
    }
    const q = state.q[best.s];
    const front = q[0];
    state.q[best.s] = q.filter((o) => o.slot !== best.slot);
    if (front && state.q[best.s][0] !== front && state.q[best.s][0]) state.q[best.s][0].until = ctx.now() + 8000;
    const k = state.disp[best.s][best.slot].k;
    w.claimed = best.s;
    w.k = k;
    state.stats[best.s].vip = r2((state.stats[best.s].vip || 0) + w.bounty);
    sellTo(state, best.s, best.slot, w.bounty, null, "vip", { full: true, how: "vip" });
    bubble(state, best.s, "vip", "WANTED! Bounty paid!", "deal");
    feed(state, { kind: "bounty", seat: best.s, k, price: w.bounty });
}

// ---- fishing ----
function fish(state, s, p, ctx, cfg, cheapest, feed) {
    const f = state.fished[s];
    const F = cfg.fish;
    if (p.start) {
        if (state.phase !== "buy") return { error: "The fishing hole is only open in the morning." };
        if (f && f.day === state.day) return { error: "One fishing trip a day." };
        if (state.cash[s] >= cheapest) return { error: "You can still afford a pack." };
        const err = useAction(state, s, cfg);
        if (err) return { error: err };
        state.fished[s] = { day: state.day, start: ctx.now(), done: false, caught: null };
        return { ok: true };
    }
    if (!f || f.day !== state.day || f.done) return { error: "You're not fishing right now." };
    const prog = Number(p.progress);
    if (!(prog >= 0 && prog <= 1)) return { error: "Bad catch." };
    const t = ctx.now() - f.start;
    if (t < F.minMs) return { error: "Keep reeling!" };
    f.done = true;
    const landed = prog >= 1 && t <= F.ms + 6000;
    const rng = ctx.rng;
    let kind = "boot";
    if (landed) {
        const tot = F.pack + F.boot + F.golden;
        const x = rng() * tot;
        kind = x < F.golden ? "golden" : x < F.golden + F.pack ? "pack" : "boot";
    }
    f.caught = { kind, landed };
    if (kind === "boot") {
        f.caught.cash = F.bootCash;
        state.cash[s] = r2(state.cash[s] + F.bootCash);
        return { ok: true };
    }
    let pk;
    if (kind === "golden") pk = state.active.reduce((b, x) => (state.pack[x] > state.pack[b] ? x : b), state.active[0]);
    else {
        const w = state.active.map((x) => 1 / state.pack[x]);
        let y = rng() * w.reduce((a, b) => a + b, 0);
        pk = state.active.find((x, i) => (y -= w[i]) < 0);
        if (pk === undefined) pk = state.active[0];
    }
    const have = state.packs[s][pk];
    state.packBasis[s][pk] = r2(((state.packBasis[s][pk] || 0) * have + state.pack[pk]) / (have + 1));
    state.packs[s][pk]++;
    f.caught.p = pk;
    if (kind === "golden") feed(state, { kind: "golden", seat: s, p: pk });
    return { ok: true };
}

// ---- end of day ----
function closeDay(state, feed, appealOf) {
    const ch = state.chal;
    if (ch.id === "appeal") {
        const ap = state.cash.map((_, s) => appealOf(s));
        const top = Math.max(...ap);
        if (top > 0) ap.forEach((a, s) => a === top && complete(state, s, feed));
    }
    const hl = [];
    const w = state.wanted;
    if (w.claimed >= 0) hl.push({ kind: "bounty", seat: w.claimed, price: w.bounty });
    if (ch.done.length) hl.push({ kind: "challenge", seats: ch.done.slice(), price: ch.prize });
    const bs = Math.max(...state.bestStreak);
    if (bs >= 3) hl.push({ kind: "streak", seat: state.bestStreak.indexOf(bs), n: bs });
    const g = state.feed.find((e) => e.kind === "golden" && e.day === state.day);
    if (g) hl.push({ kind: "golden", seat: g.seat, p: g.p });
    const pull = state.pulls.filter((p) => p.day === state.day).sort((a, b) => b.v - a.v)[0];
    if (pull) hl.push({ kind: "pull", seat: pull.seat, k: pull.k, price: pull.v });
    const rev = state.today.map((t) => t.rev);
    const top = Math.max(...rev);
    if (top > 0 && hl.length < 4) hl.push({ kind: "top", seat: rev.indexOf(top), price: top });
    return hl.slice(0, 5);
}

module.exports = { newDay, useAction, tomorrow, onDeal, onWalk, onRip, streakAppeal, vipVisit, wants, fish, closeDay, complete };
