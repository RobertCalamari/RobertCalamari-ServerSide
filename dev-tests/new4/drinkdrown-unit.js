// Drink or Drown offline: deck checks, then many random games with bots on a fake clock. After every move all 188 cards
// must still be somewhere (deck, discard, hands, scored, the played card, the cup, a challenge pot) and nothing twice.
const path = require("path");
const G = require(path.join(__dirname, "../../games/duels/games/drinkdrown"));
const { CARDS } = require(path.join(__dirname, "../../games/duels/drinkdrown/cards"));
let fails = 0;
const ok = (c, m) => {
    if (!c) {
        fails++;
        console.log("FAIL", m);
    }
};
const by = (t) => CARDS.filter((c) => c.t === t).length;
const TOTAL = 218;
ok(CARDS.length === TOTAL && by("action") === 81 && by("wait") === 46 && by("counter") === 25 && by("challenge") === 24 && by("number") === 42, "deck is " + TOTAL + ": " + ["action", "wait", "counter", "challenge", "number"].map((t) => t + " " + by(t)).join(", "));
ok(CARDS.filter((c) => c.wild).length === 5, "5 wild numbers");

function mulberry(a) {
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function where(st) {
    const ids = [...st.deck, ...st.discard, ...st.hands.flat(), ...st.scored.flat().map((e) => e.id)];
    const p = st.pending;
    if (p) {
        ids.push(p.card.id);
        if (p.along) ids.push(p.along.id);
        if (p.pot) ids.push(...p.pot.map((e) => e.id));
    }
    if (st.cup && st.cup.open) ids.push(st.cup.id);
    (st.queue || []).forEach((q) => ids.push(q.card.id));
    return ids;
}

function game(seed, n) {
    const rng = mulberry(seed);
    let now = 1e12;
    const timers = [];
    const ctx = { rng, now: () => now, later: (ms, fn) => timers.push({ t: now + ms, fn }) };
    const host = { ...ctx, host: true };
    const st = G.init({ rng, ctx, players: n });
    const mv = (s, p, c = ctx) => G.move(st, s, p, c);
    ok(st.hands.every((h) => h.length === 10), "everyone starts with 10");
    ok(!!mv(0, { act: "end" }).error, "nothing before the host picks a length");
    ok(!!mv(1, { act: "begin", goal: 25 }).error || n === 1, "only the host begins");
    mv(0, { act: "begin", goal: 25 }, host);
    const stats = { plays: 0, counters: 0, claims: 0, challenges: 0, turns: 0, errors: 0 };
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const payFor = (s, cost, avoid) => {
        const hand = st.hands[s].filter((id) => !avoid.includes(id)).map((id) => ({ id, c: CARDS[id] })).filter((x) => x.c.t === "number" || st.conv.includes(x.id)).sort((a, b) => b.c.v - a.c.v);
        const ids = [];
        const wild = {};
        let tot = 0;
        for (const x of hand) {
            if (tot >= cost) break;
            ids.push(x.id);
            if (x.c.wild) {
                wild[x.id] = Math.min(6, Math.max(1, cost - tot));
                tot += wild[x.id];
            } else tot += x.c.v;
        }
        return tot >= cost ? { pay: ids, wild } : null;
    };
    for (let step = 0; step < 4000 && st.phase !== "done"; step++) {
        const before = where(st).length;
        let last = "";
        const s = st.turn;
        let r = { ok: true };
        if (rng() < 0.05) {
            const o = Math.floor(rng() * n);
            const w = st.hands[o].find((id) => CARDS[id].t === "wait" && !st.conv.includes(id));
            if (w !== undefined && rng() < 0.5) {
                ok(!!mv(o, { act: "convert", id: w }).error, "can't turn a Wait card into a number before it happens");
                r = mv(o, { act: "convert", id: w, by: Math.floor(rng() * n) });
                ok(!!mv(o, { act: "claim", id: w, by: 0 }).error, "a converted Wait card can't be claimed");
                stats.converts = (stats.converts || 0) + 1;
            } else if (w !== undefined) {
                r = mv(o, { act: "claim", id: w, by: Math.floor(rng() * n) });
                stats.claims++;
            }
        } else if (st.phase === "turn") {
            const playable = st.hands[s].filter((id) => ["action", "challenge"].includes(CARDS[id].t));
            const plain = st.hands[s].filter((x) => CARDS[x].t === "action" && !CARDS[x].fx);
            if (plain.length >= 2 && rng() < 0.25) {
                const two = plain.slice(0, 2);
                const pay = payFor(s, CARDS[two[0]].v + CARDS[two[1]].v, two);
                if (pay) {
                    const targets = {};
                    two.forEach((x) => CARDS[x].who === "anyone" && (targets[x] = (CARDS[x].n || 1) === 1 ? [(s + 1) % n] : [...Array(n).keys()].slice(0, CARDS[x].n)));
                    const rr = mv(s, { act: "play", ids: two, ...pay, targets });
                    if (rr.ok) stats.batches = (stats.batches || 0) + 1;
                }
            }
            const id = rng() < 0.75 && st.phase === "turn" ? pick(playable.filter((x) => st.hands[s].includes(x))) : undefined;
            const c = id !== undefined ? CARDS[id] : null;
            const pay = c ? payFor(s, c.v, [id]) : null;
            if (c && pay) {
                const others = [...Array(n).keys()].filter((x) => x !== s);
                const need = c.n || 1;
                const targets = c.who === "anyone" ? (need === 1 ? [pick(others)] : [...Array(n).keys()].sort(() => rng() - 0.5).slice(0, need)) : [];
                const pk = {};
                if (c.fx === "steal") pk.player = pick(others.filter((o) => st.hands[o].length).concat(others));
                if (c.fx === "swaphands" || c.fx === "draw2give") pk.player = pick(others);
                if (c.fx === "swap3") pk.card = st.hands[s].find((x) => x !== id && !pay.pay.includes(x));
                if (c.fx === "dig") pk.card = st.discard[0];
                r = mv(s, { act: "play", id, ...pay, targets, pick: pk });
                if (r.ok) stats.plays++;
            } else {
                r = mv(s, { act: "end" });
                last = "end";
                stats.turns++;
            }
        } else if (st.phase === "react") {
            const o = pick([...Array(n).keys()].filter((x) => x !== st.pending.by));
            const k = st.hands[o].find((id) => CARDS[id].t === "counter");
            if (k !== undefined && rng() < 0.5) {
                const kc = CARDS[k];
                const along = st.hands[o].find((id) => CARDS[id].t === "action" && !CARDS[id].fx);
                const cost = kc.v + (kc.k === "along" && along !== undefined ? CARDS[along].v : 0);
                const pay = payFor(o, cost, [k, along]);
                const t = st.pending.targets[0];
                const to = kc.k === "adjacent" ? (t + 1) % n : pick([...Array(n).keys()].filter((x) => x !== st.pending.by));
                if (pay) {
                    r = mv(o, { act: "counter", id: k, ...pay, along, to });
                    if (r.ok) stats.counters++;
                }
            } else if (rng() < 0.4) {
                for (let x = 0; x < n; x++) mv(x, { act: "pass" });
            } else {
                now += 9000;
                timers.sort((a, b) => a.t - b.t);
                while (timers.length && timers[0].t <= now) timers.shift().fn(now);
            }
        } else if (st.phase === "resolve") {
            r = mv(st.pending.by, { act: "done", refused: rng() < 0.2 });
        } else if (st.phase === "challenge") {
            const p = st.pending;
            if (p.step === "ante") {
                for (let x = 0; x < n; x++) if (p.everyone || p.card.who === "everyone") mv(x, { act: "join" });
                p.players.forEach((x) => st.scored[x][0] && rng() < 0.5 && mv(x, { act: "ante", id: st.scored[x][0].id }));
                r = mv(p.by, { act: "start" });
                if (r.error) {
                    mv(1 % n === p.by ? (p.by + 1) % n : 1 % n, { act: "join" });
                    r = mv(p.by, { act: "start" });
                }
            } else {
                r = mv(p.by, { act: "win", seat: pick(p.players) });
                stats.challenges++;
            }
        } else if (st.phase === "give") {
            r = mv(st.give.from, { act: "give", id: st.hands[st.give.from][0] });
            stats.gives = (stats.gives || 0) + 1;
        } else if (st.phase === "discard") {
            const over = st.hands[s].length - 10;
            r = mv(s, { act: "discard", ids: st.hands[s].slice(0, over) });
        }
        if (rng() < 0.01 && st.cup && st.cup.open) mv(Math.floor(rng() * n), { act: "cup" });
        if (rng() < 0.04 && st.phase !== "done" && mv(0, { act: "undo" }, host).ok) stats.undos = (stats.undos || 0) + 1;
        if (r && r.error) stats.errors++;
        const ids = where(st);
        if (ids.length !== TOTAL || new Set(ids).size !== TOTAL) {
            ok(false, "seed " + seed + " step " + step + ": " + ids.length + " cards (" + new Set(ids).size + " unique), was " + before + ", phase " + st.phase);
            return stats;
        }
        // a gift or a hand swap can push someone over 10 off-turn; they discard down at the end of their own turn
        const prev = (st.turn - 1 + n) % n;
        if (r && r.ok && last === "end" && st.phase === "turn" && st.hands[prev].length > 10 && st.skip.every((x) => !x)) {
            ok(false, "player ended their turn with more than 10 cards");
            return stats;
        }
        JSON.stringify(G.view(st, 0));
        JSON.stringify(G.tv(st));
    }
    ok(st.phase === "done", "seed " + seed + " game finished (" + st.phase + ")");
    const res = G.result(st);
    ok(res && res.places.length === n, "result has places");
    stats.points = G.view(st, 0).points.join("/");
    return stats;
}

for (let i = 0; i < 40; i++) {
    const n = 2 + (i % 7);
    const st = game(100 + i, n);
    if (i < 6) console.log(n + " players", JSON.stringify(st));
}
console.log(fails ? fails + " FAILED" : "ALL PASS");
process.exit(fails ? 1 : 0);
