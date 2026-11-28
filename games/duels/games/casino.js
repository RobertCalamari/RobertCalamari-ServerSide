// Last Call Casino: a casino night against the house. Each round a few random tables open on the floor (one is the Hot
// Table, +20% on wins) and everyone walks between them, betting as often as they like. Shared tables (roulette, horses,
// the money wheel, craps, crash) run on a clock: bets open, then one spin/race/roll for everybody, repeat.
// Table maximums grow each round; the High Roller room has a far bigger minimum and maximum.
// The rest are your own game, any time. After the play window comes the shop (drinks for other people, from a couple
// of sips up to a shot, plus sabotage and help), then the resolve step where it all lands: drinks, pauses until
// someone has finished, Designated Drivers blocking. Broke? Take a shot for more chips. Richest at the end wins.
// The host sets the number of rounds and every timer before the night starts.
const { ranked, seats } = require("../rank");
const C = require("../casino/games");
const { GAMES, r2 } = C;
const START = 100;
const MIN = 5;
const REFILL = 80;
const COMPS = 30; // every round after the first, the casino comps everyone a few chips
const TABLES = 5;
const HOT = 0.2;
const FEED = 30;
const SHOW = { roulette: 7000, horses: 9500, wheel: 6500, craps: 7000, crash: 4000 };
const HIGH = { min: 250, max: 10000 };
const LOAN = { chips: 80, owe: 160 };
const SPECIAL_COUNT = 5;
// the main floor's max bet: 50 in round 1, +50 a round, up to 500
const tableMax = (round) => Math.min(500, 50 * (round + 1));
const limits = (state, s) => (state.room[s] === "high" ? HIGH : { min: MIN, max: tableMax(state.round) });
// host settings (seconds) and their limits
const CFG = { rounds: 8, play: 120, shop: 30, resolve: 20, spin: 20 };
const LIMITS = { rounds: [3, 20], play: [30, 600], shop: [10, 180], resolve: [5, 120], spin: [8, 90] };

// the shop. drinks are always on the shelf; 3 specials rotate each time
const ITEMS = {
    sip: { name: "Two Sips", icon: "🍺", cost: 15, to: "one", text: "They drink 2" },
    gulp: { name: "Big Gulp", icon: "🍻", cost: 50, to: "one", text: "They drink 5" },
    table: { name: "Round on Me", icon: "🎉", cost: 80, to: "all", text: "Everyone else drinks 2" },
    finish: { name: "Drown 'Em", icon: "🌊", cost: 200, to: "one", text: "They finish their drink (paused until done)" },
    shot: { name: "Shot Caller", icon: "🥃", cost: 300, to: "one", text: "They take a shot (paused until done)" },
    dd: { name: "Designated Driver", icon: "🛡️", cost: 60, to: "self", text: "Keep it. Block one drink, shot or finish sent at you, any time" },
    lucky: { name: "Lucky Charm", icon: "🍀", cost: 60, to: "self", text: "Your wins pay 20% more next round" },
    insure: { name: "Insurance", icon: "🧯", cost: 50, to: "self", text: "Lose chips next round? Get 30% of it back" },
    xray: { name: "X-Ray Specs", icon: "👀", cost: 50, to: "self", text: "Next round: see the dealer's hidden cards and the next Hi-Lo card" },
    horse: { name: "Rigged Race", icon: "🐎", cost: 40, to: "self", text: "Next round your horse wins pay 50% more" },
    ban: { name: "Bouncer", icon: "🚫", cost: 40, to: "one", text: "They can't sit at the Hot Table next round" },
    bounty: { name: "Bounty", icon: "🎯", cost: 50, to: "one", text: "If they lose chips next round they drink 4 and you get 40" },
    tax: { name: "Tax Collector", icon: "🧾", cost: 60, to: "one", text: "If they lose their next bet next round, you get what they lost. Win it and you get nothing" },
    loan: { name: "Payday Loan", icon: "💸", cost: 0, to: "self", text: "+" + LOAN.chips + " chips now. You take a shot, and owe " + LOAN.owe + " at the end" },
    mirror: { name: "Mirror", icon: "🪞", cost: 80, to: "self", text: "Keep it. Bounce one drink sent at you back to whoever sent it" },
    jinx: { name: "Jinx", icon: "🐈‍⬛", cost: 50, to: "one", text: "Their wins pay 25% less next round" },
    double: { name: "Double Down", icon: "✌️", cost: 70, to: "self", text: "Your first win next round pays double" },
    mystery: { name: "Mystery Box", icon: "🎁", cost: 40, to: "self", text: "Anywhere from 0 to 150 chips. Or a sip" },
    hair: { name: "Hair of the Dog", icon: "🐕", cost: 25, to: "self", text: "You drink 2, the house pays you 50" },
    rule: { name: "Rule Maker", icon: "📜", cost: 100, to: "self", text: "Make a drinking rule that lasts all next round" },
    chug: { name: "Chug Clock", icon: "⏱️", cost: 120, to: "one", text: "They chug for 5 seconds" },
};
const DRINKS = ["sip", "gulp", "table", "finish", "shot"];
const SPECIALS = ["dd", "lucky", "insure", "xray", "horse", "ban", "bounty", "tax", "loan", "mirror", "jinx", "double", "mystery", "hair", "rule", "chug"];
// drinks someone can block (Designated Driver) or bounce back (Mirror)
const STOPPABLE = ["sip", "gulp", "finish", "shot", "bounty", "chug"];
const N = (s) => "#" + s + "#"; // a player, filled in with their name on the phone
const blank = () => ({ lucky: [], insure: [], xray: [], horse: [], ban: [], bounty: [], tax: [], jinx: [], double: [] });
// what the screens need to draw the tables
const META = {
    games: Object.fromEntries(Object.entries(GAMES).map(([id, g]) => [id, { name: g.name, icon: g.icon, blurb: g.blurb, kind: g.kind, shared: !!g.shared }])),
    wheel: C.WHEEL, plinko: C.PLINKO, slots: C.SLOTS, red: C.RED, mines: C.MINES, slot3: C.SLOT_3,
    horses: C.HORSES.map((h, i) => ({ name: h.name, pay: C.HORSE_PAY[i] })),
    pack: C.PACK.map((x) => ({ tier: x.tier, pay: x.pay, odds: x.p })),
    cases: C.CASE.map((x) => ({ tier: x.tier, pay: x.pay, odds: x.p })),
    scratch: C.SCRATCH.map((x, i) => ({ pay: x.pay, odds: x.p, sym: C.SCRATCH_SYMS[i] })),
};

const pickN = (rng, list, k) => {
    const a = list.slice();
    const out = [];
    while (out.length < k && a.length) out.push(a.splice(Math.floor(rng() * a.length), 1)[0]);
    return out;
};

function feed(state, s, text, kind) {
    state.feed.push({ n: ++state.feedNo, s, text, kind });
    if (state.feed.length > FEED) state.feed.shift();
}

const net = (state, s) => state.chips[s] - state.owed[s];

// ---------- rounds ----------
function startRound(state, ctx) {
    state.round++;
    state.phase = "play";
    // a few tables can stay open from last round, but at least half the floor is new
    const prev = state.open || [];
    const keep = pickN(ctx.rng, prev, Math.floor(ctx.rng() * (Math.floor(TABLES / 2) + 1)));
    const open = keep.concat(pickN(ctx.rng, Object.keys(GAMES).filter((g) => !prev.includes(g)), TABLES - keep.length));
    state.open = open;
    state.hot = open[Math.floor(ctx.rng() * open.length)];
    state.at = seats(state.n).map(() => null);
    state.sess = seats(state.n).map(() => null);
    state.now = state.next;
    state.next = blank();
    if (state.round > 0) {
        state.chips = state.chips.map((c) => c + COMPS);
        feed(state, null, "The house comps everyone " + COMPS + " chips", "info");
    }
    state.start = state.chips.slice();
    state.endAt = ctx.now() + state.cfg.play * 1000;
    const rid = ++state.rid;
    state.tables = {};
    open.filter((g) => GAMES[g].shared).forEach((g) => openBets(state, g, ctx, rid));
    feed(state, null, "Round " + (state.round + 1) + ": the floor is open", "info");
    ctx.later(state.cfg.play * 1000, () => state.rid === rid && state.phase === "play" && endPlay(state, ctx));
}

function endPlay(state, ctx) {
    state.rid++;
    seats(state.n).forEach((s) => closeSession(state, s, ctx));
    // shared tables: spin what's been bet, cash crash riders out where the rocket is
    Object.keys(state.tables).forEach((g) => {
        const t = state.tables[g];
        if (g === "crash" && t.phase === "run") crashOver(state, ctx, Math.min(t.point, crashNow(t, ctx)), true);
        else if (t.phase === "bet" && Object.keys(t.bets).length) {
            if (g === "crash") Object.entries(t.bets).forEach(([s, b]) => (state.chips[s] += b.amount));
            else spin(state, g, ctx, null);
        }
        t.phase = "closed";
        t.bets = {};
        t.gen++;
    });
    seats(state.n).forEach((s) => {
        const lost = state.start[s] - state.chips[s];
        if (lost > 0 && state.now.insure.includes(s)) {
            const back = Math.ceil(lost * 0.3);
            state.chips[s] += back;
            feed(state, s, N(s) + "'s insurance paid " + back, "info");
        }
    });
    state.now.bounty.forEach(({ by, to }) => {
        if (state.chips[to] < state.start[to]) {
            state.chips[by] += 40;
            state.pend.push({ id: ++state.pendNo, by, item: "bounty", to, text: "Bounty! drinks 4", sips: 4 });
            feed(state, by, N(by) + " collected a bounty on " + N(to), "bad");
        }
    });
    state.phase = "shop";
    // everyone gets their own specials, and one thing on sale
    state.specials = seats(state.n).map(() => pickN(ctx.rng, SPECIALS, SPECIAL_COUNT));
    state.sale = state.specials.map((mine) => {
        const pool = DRINKS.concat(mine).filter((id) => ITEMS[id].cost > 0);
        return { id: pool[Math.floor(ctx.rng() * pool.length)], pct: 10 * (1 + Math.floor(ctx.rng() * 5)) };
    });
    state.shopDone = seats(state.n).map(() => false);
    state.endAt = ctx.now() + state.cfg.shop * 1000;
    const tick = ++state.tick;
    ctx.later(state.cfg.shop * 1000, () => state.tick === tick && state.phase === "shop" && startResolve(state, ctx));
}

function startResolve(state, ctx) {
    state.phase = "resolve";
    state.endAt = ctx.now() + state.cfg.resolve * 1000;
    state.resolved = state.pend;
    state.pend = [];
    state.resolveDone = seats(state.n).map(() => false);
    const tick = ++state.tick;
    ctx.later(state.cfg.resolve * 1000, () => state.tick === tick && state.phase === "resolve" && endResolve(state, ctx));
}

function endResolve(state, ctx) {
    state.tick++;
    // finishes and shots that weren't blocked: those people are paused until they say they're done
    state.resolved.forEach((e) => {
        if (!e.blocked && (e.item === "finish" || e.item === "shot")) state.paused[e.to] = e.item;
        if (e.item === "loan") state.paused[e.to] = "shot";
    });
    state.resolved = [];
    if (state.round + 1 >= state.cfg.rounds) {
        state.phase = "done";
        state.endAt = null;
        return;
    }
    startRound(state, ctx);
}

// ---------- shared tables ----------
function openBets(state, g, ctx, rid) {
    const t = state.tables[g] || (state.tables[g] = { spins: 0, out: null, results: {} });
    t.phase = "bet";
    t.bets = {};
    t.endAt = ctx.now() + state.cfg.spin * 1000;
    const gen = (t.gen = (t.gen || 0) + 1);
    ctx.later(state.cfg.spin * 1000, () => {
        if (state.rid !== rid || state.phase !== "play" || t.gen !== gen) return;
        if (g === "crash") crashGo(state, ctx, rid);
        else spin(state, g, ctx, rid);
    });
}

function spin(state, g, ctx, rid) {
    const t = state.tables[g];
    const G = GAMES[g];
    t.out = G.roll(ctx.rng);
    t.spins++;
    t.results = {};
    Object.entries(t.bets).forEach(([s, b]) => {
        s = +s;
        const p = G.pay(t.out, b.sel);
        const won = settle(state, s, g, b.amount, b.amount * p.mult, { ...t.out, sel: b.sel, shared: true }, p.text);
        t.results[s] = { won, sel: b.sel, amount: b.amount };
    });
    t.phase = "show";
    t.endAt = ctx.now() + SHOW[g];
    const gen = (t.gen = t.gen + 1);
    if (rid !== null) ctx.later(SHOW[g], () => state.rid === rid && state.phase === "play" && t.gen === gen && openBets(state, g, ctx, rid));
}

const crashNow = (t, ctx) => r2(Math.exp(C.CRASH_K * Math.max(0, ctx.now() - t.startAt)));

function crashGo(state, ctx, rid) {
    const t = state.tables.crash;
    t.phase = "run";
    t.point = GAMES.crash.point(ctx.rng);
    t.startAt = ctx.now() + 1500;
    t.crashAt = t.startAt + Math.log(t.point) / C.CRASH_K;
    t.cashed = {};
    t.endAt = null;
    const gen = (t.gen = t.gen + 1);
    // auto cash-outs on the way up
    const live = () => state.rid === rid && state.tables.crash === t && t.gen === gen && t.phase === "run";
    Object.entries(t.bets).forEach(([s, b]) => {
        if (b.sel && b.sel <= t.point) ctx.later(Math.max(0, t.startAt + Math.log(b.sel) / C.CRASH_K - ctx.now()), () => live() && crashCash(state, +s, b.sel));
    });
    ctx.later(Math.max(0, t.crashAt - ctx.now()), () => {
        if (!live()) return;
        crashOver(state, ctx, t.point, false);
        t.phase = "show";
        t.endAt = ctx.now() + SHOW.crash;
        const gen2 = (t.gen = t.gen + 1);
        ctx.later(SHOW.crash, () => state.rid === rid && state.phase === "play" && t.gen === gen2 && openBets(state, "crash", ctx, rid));
    });
}

function crashCash(state, s, m) {
    const t = state.tables.crash;
    const b = t.bets[s];
    if (!b || t.cashed[s] !== undefined) return false;
    t.cashed[s] = m;
    const won = settle(state, s, "crash", b.amount, b.amount * m, { point: null, cash: m, shared: true }, "Cashed out at " + m + "×");
    t.results[s] = { won, sel: m, amount: b.amount };
    return true;
}

// the rocket is gone (or the round ended: cashOut = everyone still riding takes the current multiplier)
function crashOver(state, ctx, at, cashOut) {
    const t = state.tables.crash;
    t.results = t.results || {};
    Object.entries(t.bets).forEach(([s, b]) => {
        s = +s;
        if (t.cashed[s] !== undefined) return;
        if (cashOut) return crashCash(state, s, at);
        const won = settle(state, s, "crash", b.amount, 0, { point: t.point, cash: null, shared: true }, "Crashed at " + t.point + "×");
        t.results[s] = { won, sel: null, amount: b.amount };
    });
    t.out = { point: t.point };
    t.spins++;
}

// ---------- settling a bet ----------
function settle(state, s, g, stake, ret, out, text) {
    let back = ret;
    let dbl = false;
    if (back > stake) {
        dbl = state.now.double.includes(s);
        const bonus = (state.hot === g ? HOT : 0) + (state.now.lucky.includes(s) ? 0.2 : 0) + (g === "horses" && state.now.horse.includes(s) ? 0.5 : 0) - (state.now.jinx.includes(s) ? 0.25 : 0);
        back = stake + (back - stake) * (1 + bonus) * (dbl ? 2 : 1);
        if (dbl) state.now.double = state.now.double.filter((x) => x !== s);
    }
    back = Math.floor(back);
    state.chips[s] = Math.max(0, state.chips[s] + back);
    const won = back - stake;
    if (dbl) feed(state, s, N(s) + " doubled down ✌️", "good");
    // tax collectors on this player cash in on their next bet, win or lose
    state.now.tax.filter((x) => x.to === s && !x.done).forEach((x) => {
        x.done = true;
        if (won < 0) {
            state.chips[x.by] += -won;
            feed(state, x.by, N(x.by) + " taxed " + N(s) + " for " + -won + " 🧾", "bad");
        } else feed(state, s, N(s) + " dodged " + N(x.by) + "'s tax 🧾", "info");
    });
    const st = state.stats[s];
    st.played++;
    st.wagered += stake;
    if (won > st.best) {
        st.best = won;
        st.bestAt = g;
    }
    state.last[s] = { n: ++state.lastNo, g, stake, back, won, mult: stake ? r2(back / stake) : 0, out, text };
    if (won >= 40 || (stake && back / stake >= 5)) feed(state, s, N(s) + " won " + won + " at " + GAMES[g].name + " (" + r2(back / stake) + "×)", "good");
    else if (won <= -40) feed(state, s, N(s) + " lost " + -won + " at " + GAMES[g].name, "bad");
    if (state.room[s] === "high" && state.chips[s] < HIGH.min) {
        state.room[s] = "main";
        feed(state, s, N(s) + " got walked out of the High Roller room", "bad");
    }
    if (state.chips[s] < MIN && !state.broke[s]) {
        state.broke[s] = true;
        feed(state, s, N(s) + " is broke! Shot time 🥃", "bad");
    }
    return won;
}

// personal hands (mines, hi-lo, blackjack, poker): pay out once done
function finishHand(state, s) {
    const x = state.sess[s];
    if (!x || !x.h.done) return;
    const g = x.g;
    let text = "";
    if (g === "mines") text = x.h.boom !== undefined ? "Hit a mine 💥" : "Cashed out at " + x.h.mult + "×";
    if (g === "hilo") text = x.h.mult ? "Cashed out at " + r2(x.h.mult) + "×" : "Wrong guess";
    if (g === "blackjack") text = "You " + C.bjTotal(x.h.me) + " · dealer " + C.bjTotal(x.h.dealer);
    if (g === "poker") text = x.h.folded ? "Folded" : x.h.mine + " vs " + x.h.theirs + (x.h.qualifies ? "" : " (dealer didn't qualify)");
    const ret = g === "poker" ? x.ante * x.h.mult : x.stake * x.h.mult;
    state.sess[s] = null;
    settle(state, s, g, x.stake, ret, { ...x.h }, text);
}

function closeSession(state, s, ctx) {
    const x = state.sess[s];
    if (!x) return;
    // time's up: cash out (mines, hi-lo), stand (blackjack), fold (poker)
    const m = x.g === "blackjack" ? "stand" : x.g === "poker" ? "fold" : "cash";
    x.h = GAMES[x.g].act(x.h, { m }, ctx.rng) || { ...x.h, done: true };
    finishHand(state, s);
}

function bet(state, s, p, ctx) {
    const g = state.at[s];
    if (!g) return { error: "Sit at a table first." };
    const G = GAMES[g];
    const amount = p.amount;
    const lim = limits(state, s);
    if (!Number.isInteger(amount) || amount < lim.min) return { error: "Bet at least " + lim.min + (state.room[s] === "high" ? " in the High Roller room." : ".") };
    if (amount > lim.max) return { error: "Table max is " + lim.max + (state.room[s] === "high" ? "." : " this round. Bigger bets are in the High Roller room.") };
    const sel = G.sel(p.sel);
    if (sel === null || sel === undefined) return { error: "Pick your bet first." };
    if (G.shared) {
        const t = state.tables[g];
        if (!t || t.phase !== "bet") return { error: g === "crash" ? "Wait for the next rocket." : "Bets are closed. Next one soon." };
        const old = t.bets[s];
        const have = state.chips[s] + (old ? old.amount : 0);
        if (amount > have) return { error: "You only have " + have + "." };
        if (g === "wheel" && have < amount * 2) return { error: "The wheel can take double. Keep " + amount * 2 + " to bet " + amount + "." };
        state.chips[s] = have - amount;
        t.bets[s] = { amount, sel };
        return { ok: true };
    }
    if (state.sess[s]) return { error: "Finish your hand first." };
    if (amount > state.chips[s]) return { error: "You only have " + state.chips[s] + "." };
    if ((g === "blackjack" || g === "poker") && state.chips[s] < amount * 2) return { error: "Keep enough to " + (g === "poker" ? "raise" : "double") + ": you need " + amount * 2 + "." };
    if (g === "slots" && state.chips[s] < amount * 3) return { error: "Skulls can take triple. Keep " + amount * 3 + " to spin." };
    state.chips[s] -= amount;
    if (G.kind === "instant") {
        const r = G.run(ctx.rng, sel);
        settle(state, s, g, amount, amount * r.mult, { ...r.out, sel }, r.text);
        return { ok: true };
    }
    const h = G.start(ctx.rng, sel);
    state.sess[s] = { g, stake: amount, ante: amount, h };
    if (h.done) finishHand(state, s);
    return { ok: true };
}

function unbet(state, s) {
    const g = state.at[s];
    const t = g && state.tables[g];
    if (!t || t.phase !== "bet" || !t.bets[s]) return { error: "No bet to take back." };
    state.chips[s] += t.bets[s].amount;
    delete t.bets[s];
    return { ok: true };
}

function hand(state, s, p, ctx) {
    if (state.at[s] === "crash" || p.m === "cash" && state.tables.crash && state.tables.crash.bets[s] && !state.sess[s]) {
        const t = state.tables.crash;
        if (!t || t.phase !== "run" || !t.bets[s]) return { error: "You're not riding this one." };
        if (ctx.now() < t.startAt) return { error: "It hasn't taken off yet." };
        if (ctx.now() >= t.crashAt) return { error: "Too late, it crashed!" };
        const m = Math.min(t.point, crashNow(t, ctx));
        if (!crashCash(state, s, m)) return { error: "You already cashed out." };
        return { ok: true };
    }
    const x = state.sess[s];
    if (!x) return { error: "No hand going." };
    let extra = 0;
    if (x.g === "blackjack" && p.m === "double") extra = x.stake;
    if (x.g === "poker" && p.m === "play") extra = x.ante;
    if (extra > state.chips[s]) return { error: "Not enough chips for that." };
    const h = GAMES[x.g].act(x.h, p, ctx.rng);
    if (!h) return { error: "You can't do that." };
    state.chips[s] -= extra;
    x.stake += extra;
    x.h = h;
    if (h.done) finishHand(state, s);
    return { ok: true };
}

// what a player may see of their own hand
function ownHand(state, s, xray) {
    const x = state.sess[s];
    if (!x) return null;
    const h = { ...x.h };
    if (x.g === "mines") delete h.mines;
    if (x.g === "hilo") h.peek = xray ? h.next : null;
    delete h.next;
    if (x.g === "blackjack") h.dealer = xray ? h.dealer : [h.dealer[0]];
    if (x.g === "poker") h.dealer = xray ? h.dealer : null;
    return { g: x.g, stake: x.stake, ante: x.ante, h, xray };
}

function tablesView(state) {
    const out = {};
    Object.entries(state.tables || {}).forEach(([g, t]) => {
        out[g] = {
            phase: t.phase, endAt: t.endAt, spins: t.spins, bets: t.bets, results: t.results, out: t.phase === "bet" || t.phase === "show" ? t.out : null,
            ...(g === "crash" ? { startAt: t.startAt, cashed: t.cashed, point: t.phase === "run" ? null : t.point } : null),
        };
    });
    return out;
}

// ---------- shop ----------
const price = (state, s, id) => (state.sale && state.sale[s] && state.sale[s].id === id ? Math.ceil((ITEMS[id].cost * (100 - state.sale[s].pct)) / 100) : ITEMS[id].cost);

function buy(state, s, p, ctx) {
    if (state.phase !== "shop") return { error: "The shop is closed." };
    const id = p.item;
    const it = ITEMS[id];
    if (!it || (!DRINKS.includes(id) && !state.specials[s].includes(id))) return { error: "That's not for sale right now." };
    const cost = price(state, s, id);
    if (state.chips[s] < cost) return { error: "You need " + cost + " chips." };
    if (id === "loan" && state.loans[s] >= 2) return { error: "The bank says no. Two loans is the limit." };
    if (id === "tax" && state.next.tax.some((x) => x.by === s)) return { error: "One tax collector at a time." };
    let to = null;
    if (it.to === "one") {
        to = p.to;
        if (!Number.isInteger(to) || to < 0 || to >= state.n || to === s) return { error: "Pick who it's for." };
    }
    state.chips[s] -= cost;
    state.stats[s].spent += cost;
    state.stats[s].bought++;
    const pend = (e) => state.pend.push({ id: ++state.pendNo, by: s, item: id, to, ...e });
    if (id === "dd") state.inv[s].dd++;
    else if (id === "mirror") state.inv[s].mirror++;
    else if (["lucky", "insure", "xray", "horse", "double"].includes(id)) state.next[id].includes(s) || state.next[id].push(s);
    else if (id === "ban" || id === "jinx") state.next[id].includes(to) || state.next[id].push(to);
    else if (id === "bounty") state.next.bounty.push({ by: s, to });
    else if (id === "tax") {
        state.next.tax.push({ by: s, to });
        pend({ text: "next losing bet goes to the collector" });
    } else if (id === "loan") {
        state.loans[s]++;
        state.chips[s] += LOAN.chips;
        state.owed[s] += LOAN.owe;
        pend({ to: s, text: "took a payday loan: takes a shot" });
    } else if (id === "mystery") {
        const r = Math.floor(ctx.rng() * 6);
        const got = [0, 20, 40, 60, 100, 150][r];
        state.chips[s] += got;
        pend({ to: s, text: got ? "opened a mystery box: +" + got + " chips" : "opened an empty mystery box: drinks 1", sips: got ? 0 : 1 });
    } else if (id === "hair") {
        state.chips[s] += 50;
        pend({ to: s, text: "had some hair of the dog: drinks 2, +50 chips", sips: 2 });
    } else if (id === "rule") pend({ to: s, text: "makes a drinking rule for next round 📜" });
    else if (id === "table") pend({ to: null, text: "bought a round: everyone else drinks 2", sips: 2 });
    else pend({ text: it.text.replace("They ", "") });
    if (["sip", "gulp", "table", "finish", "shot", "bounty", "ban", "tax", "jinx", "chug"].includes(id)) state.stats[s].mean++;
    return { ok: true };
}

function pub(state, seat) {
    return {
        phase: state.phase,
        round: state.round,
        cfg: state.cfg,
        limits: LIMITS,
        endAt: state.endAt,
        open: state.open,
        hot: state.hot,
        tables: tablesView(state),
        chips: state.chips,
        owed: state.owed,
        shots: state.shots,
        at: state.at,
        busy: state.sess.map((x) => (x ? x.g : null)),
        last: state.last,
        paused: state.paused,
        feed: state.feed,
        banned: state.now.ban,
        // who has a tax collector on them right now (still waiting on their next bet), and who's jinxed
        taxed: state.now.tax.filter((x) => !x.done).map((x) => ({ by: x.by, to: x.to })),
        jinxed: state.now.jinx,
        room: state.room,
        tableMax: tableMax(Math.max(0, state.round)),
        high: HIGH,
        resolveDone: state.phase === "resolve" ? state.resolveDone : null,
        shop: state.phase === "shop" ? { drinks: DRINKS, specials: seat >= 0 ? state.specials[seat] : [], sale: seat >= 0 ? state.sale[seat] : null, done: state.shopDone } : null,
        // shop buys stay secret until the resolve step (you see your own)
        resolve: state.phase === "resolve" ? state.resolved : seat >= 0 ? state.pend.filter((e) => e.by === seat) : [],
        stats: state.phase === "done" ? state.stats : null,
        items: ITEMS,
        meta: META,
        min: MIN,
        refill: REFILL,
        crashK: C.CRASH_K,
    };
}

module.exports = {
    id: "casino",
    name: "Last Call Casino",
    kind: "sim",
    quick: false,
    players: [1, 10],
    init({ players = 2 }) {
        const n = players;
        return {
            n, phase: "setup", round: -1, cfg: { ...CFG }, tick: 0, rid: 0, endAt: null, open: null, hot: null, tables: {},
            chips: new Array(n).fill(START), owed: new Array(n).fill(0), shots: new Array(n).fill(0), loans: new Array(n).fill(0), broke: new Array(n).fill(false),
            at: seats(n).map(() => null), sess: seats(n).map(() => null), last: seats(n).map(() => null), paused: seats(n).map(() => null),
            inv: seats(n).map(() => ({ dd: 0, mirror: 0 })), room: seats(n).map(() => "main"), resolveDone: [], stats: seats(n).map(() => ({ played: 0, wagered: 0, best: 0, bestAt: null, spent: 0, bought: 0, mean: 0 })),
            now: blank(), next: blank(), start: new Array(n).fill(START), pend: [], pendNo: 0, resolved: [], specials: [], sale: [], shopDone: [],
            feed: [], feedNo: 0, lastNo: 0,
        };
    },
    view(state, seat) {
        const v = pub(state, seat);
        const xray = state.now.xray.includes(seat);
        v.me = {
            hand: ownHand(state, seat, xray),
            inv: state.inv[seat],
            lucky: state.now.lucky.includes(seat),
            insured: state.now.insure.includes(seat),
            xray,
            horse: state.now.horse.includes(seat),
            double: state.now.double.includes(seat),
            jinxed: state.now.jinx.includes(seat),
            next: Object.keys(state.next).filter((k) => !["bounty", "tax"].includes(k) && state.next[k].includes(seat)),
        };
        return v;
    },
    tv(state) {
        const v = pub(state, -1);
        v.hands = seats(state.n).map((s) => ownHand(state, s, false));
        return v;
    },
    move(state, s, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        const act = p.act;
        if (act === "begin") {
            if (!ctx.host) return { error: "The host sets up the night." };
            if (state.phase !== "setup") return { ok: true, quiet: true };
            const cfg = { ...CFG };
            for (const k in LIMITS) {
                const v = p.cfg && p.cfg[k];
                if (v === undefined) continue;
                if (!Number.isInteger(v) || v < LIMITS[k][0] || v > LIMITS[k][1]) return { error: "Pick a value between " + LIMITS[k][0] + " and " + LIMITS[k][1] + "." };
                cfg[k] = v;
            }
            state.cfg = cfg;
            startRound(state, ctx);
            return { ok: true };
        }
        if (state.phase === "setup") return { error: "Waiting for the host to open the casino." };
        if (state.phase === "done") return { error: "The casino is closed." };
        if (act === "unpause") {
            const who = ctx.host && Number.isInteger(p.who) ? p.who : s;
            if (!state.paused[who]) return { ok: true, quiet: true };
            feed(state, who, N(who) + (state.paused[who] === "shot" ? " took the shot" : " finished their drink") + " 🍻", "info");
            state.paused[who] = null;
            return { ok: true };
        }
        if (act === "skip") {
            if (!ctx.host) return { error: "Only the host can hurry things along." };
            if (state.phase === "play") endPlay(state, ctx);
            else if (state.phase === "shop") startResolve(state, ctx);
            else if (state.phase === "resolve") endResolve(state, ctx);
            return { ok: true };
        }
        if (act === "block") {
            if (state.phase !== "resolve") return { error: "Nothing to block right now." };
            const e = state.resolved.find((x) => x.id === p.id);
            if (!e || e.to !== s || e.blocked || e.mirrored || !STOPPABLE.includes(e.item)) return { error: "You can't block that." };
            if (p.mirror) {
                if (state.inv[s].mirror < 1) return { error: "You need a Mirror." };
                if (e.by === s) return { error: "That one's from you." };
                state.inv[s].mirror--;
                e.mirrored = true;
                e.bouncer = s;
                e.to = e.by;
                feed(state, s, N(s) + " bounced it back to " + N(e.by) + " 🪞", "bad");
                return { ok: true };
            }
            if (state.inv[s].dd < 1) return { error: "You need a Designated Driver." };
            state.inv[s].dd--;
            e.blocked = true;
            feed(state, s, N(s) + " used a Designated Driver 🛡️", "info");
            return { ok: true };
        }
        if (act === "ready" && state.phase === "resolve") {
            state.resolveDone[s] = true;
            if (state.resolveDone.every(Boolean)) endResolve(state, ctx);
            return { ok: true };
        }
        if (act === "room") {
            if (state.phase !== "play") return { error: "Rooms open with the tables." };
            if (state.sess[s]) return { error: "Finish your hand first." };
            const riding = Object.values(state.tables || {}).some((t) => t.bets && t.bets[s]);
            if (riding) return { error: "Wait for your bet to finish." };
            if (p.room === "high") {
                if (state.chips[s] < HIGH.min) return { error: "The High Roller room needs " + HIGH.min + " chips to get in." };
                state.room[s] = "high";
                feed(state, s, N(s) + " walked into the High Roller room 💎", "good");
            } else state.room[s] = "main";
            return { ok: true };
        }
        if (state.paused[s]) return { error: state.paused[s] === "shot" ? "Take your shot first!" : "Finish your drink first!" };
        if (act === "rebuy") {
            const riding = Object.values(state.tables || {}).some((t) => t.bets && t.bets[s]);
            if (state.chips[s] >= MIN || state.sess[s] || riding) return { error: "You're not broke yet." };
            state.chips[s] += REFILL;
            state.shots[s]++;
            state.broke[s] = false;
            feed(state, s, N(s) + " took a broke shot and got " + REFILL + " chips 🥃", "bad");
            return { ok: true };
        }
        if (act === "buy") return buy(state, s, p, ctx);
        if (act === "ready") {
            if (state.phase !== "shop") return { ok: true, quiet: true };
            state.shopDone[s] = true;
            if (state.shopDone.every(Boolean)) startResolve(state, ctx);
            return { ok: true };
        }
        if (state.phase !== "play") return { error: "The tables are closed right now." };
        if (act === "sit") {
            const g = p.g;
            if (!state.open.includes(g)) return { error: "That table isn't open this round." };
            if (state.sess[s]) return { error: "Finish your hand first." };
            if (g === state.hot && state.now.ban.includes(s)) return { error: "The bouncer won't let you near the Hot Table this round." };
            state.at[s] = g;
            return { ok: true };
        }
        if (act === "leave") {
            if (state.sess[s]) return { error: "Finish your hand first." };
            state.at[s] = null;
            return { ok: true };
        }
        if (act === "bet") return bet(state, s, p, ctx);
        if (act === "unbet") return unbet(state, s);
        if (act === "hand") return hand(state, s, p, ctx);
        return { error: "Bad move." };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const worth = seats(state.n).map((s) => net(state, s));
        const best = Math.max(...worth);
        return ranked(worth, "high", "Richest at closing: " + best + " chips (after paying back loans)");
    },
    ITEMS,
};
