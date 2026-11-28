// Critter Island: a TV game you mostly watch. Everyone has a little species on one shared island. Critters live on
// their own: they wander, eat berries, breed when they're full, run from hawks, and (with fangs) fight rivals.
// Each season plays out for ~40s, then everyone gets coins to meddle from their phone: drop food, buy a trait
// (speed, toughness, sharper senses, bigger litters, fangs), dig a burrow (safe from storms and hawks) or hide a trap
// for rivals, and bet on who'll be biggest next. Then the room votes on what hits the island next: storm, drought,
// hawks, volcano, plague or a feast. After 6 seasons the biggest population wins. Lose half your critters in a
// season and you drink.
const { ranked, seats } = require("../rank");
const SEASONS = 6;
const SEASON_MS = 40000;
const SHOP_MS = 25000;
const VOTE_MS = 12000;
const TICK = 600;
const W = 30;
const H = 18;
const START = 5;
const MAX_EACH = 36;
const MAX_ALL = 150;
const SPECIES = [
    { icon: "🐰", name: "Bunnies" }, { icon: "🦎", name: "Lizards" }, { icon: "🐸", name: "Frogs" }, { icon: "🦔", name: "Hedgehogs" },
    { icon: "🐿️", name: "Squirrels" }, { icon: "🐭", name: "Mice" }, { icon: "🐢", name: "Turtles" }, { icon: "🦊", name: "Foxes" },
];
const TRAITS = {
    speed: { name: "Quick feet", icon: "💨", max: 3, cost: [3, 5, 7], text: "Moves faster to food and away from danger." },
    tough: { name: "Thick hide", icon: "🛡️", max: 3, cost: [3, 5, 7], text: "Better odds against hawks, storms, plague and fights." },
    sense: { name: "Sharp senses", icon: "👀", max: 3, cost: [2, 4, 6], text: "Spots food and danger from further away." },
    litter: { name: "Big litters", icon: "🍼", max: 2, cost: [5, 8], text: "More babies each time they breed." },
    fangs: { name: "Fangs", icon: "🦷", max: 1, cost: [6], text: "Picks fights with rival critters that come too close." },
};
const COST = { food: 2, burrow: 4, trap: 3 };
const EVENTS = {
    storm: { icon: "⛈️", name: "Storm", text: "Lightning strikes all season. Forests and burrows are safe." },
    drought: { icon: "🏜️", name: "Drought", text: "Hardly any berries grow this season." },
    hawks: { icon: "🦅", name: "Hawks", text: "Hawks hunt anything out in the open." },
    volcano: { icon: "🌋", name: "Volcano", text: "Part of the island turns to lava." },
    plague: { icon: "🦠", name: "Plague", text: "A sickness spreads through crowded critters." },
    feast: { icon: "🍓", name: "Feast", text: "Berries everywhere. Baby boom!" },
};
const r1 = (x) => Math.round(x * 10) / 10;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const onIsland = (x, y) => ((x - W / 2) / (W / 2 - 1)) ** 2 + ((y - H / 2) / (H / 2 - 1)) ** 2 <= 1;
const clampIn = (p) => {
    for (let k = 0; k < 6 && !onIsland(p.x, p.y); k++) {
        p.x += (W / 2 - p.x) * 0.15;
        p.y += (H / 2 - p.y) * 0.15;
    }
    return p;
};
function randomSpot(rng) {
    for (;;) {
        const x = 1 + rng() * (W - 2), y = 1 + rng() * (H - 2);
        if (onIsland(x, y)) return { x, y };
    }
}
const inForest = (state, c) => state.forests.some((f) => dist(f, c) <= f.r);
const sheltered = (state, c) => inForest(state, c) || state.burrows.some((b) => b.s === c.s && dist(b, c) <= 1.3);
const inLava = (state, c) => state.lava.some((l) => dist(l, c) <= l.r);

function addCritter(state, s, x, y) {
    if (state.critters.length >= MAX_ALL || state.critters.filter((c) => c.s === s).length >= MAX_EACH) return null;
    const c = { id: ++state.ids, s, x, y, tx: x, ty: y, hunger: 70, cd: 10, sick: false, age: 0 };
    state.critters.push(c);
    state.born[s]++;
    return c;
}
function kill(state, c, why) {
    const i = state.critters.indexOf(c);
    if (i < 0) return;
    state.critters.splice(i, 1);
    state.deaths.push({ id: c.id, s: c.s, x: r1(c.x), y: r1(c.y), why, n: ++state.seq });
    if (state.deaths.length > 30) state.deaths.shift();
}

// one simulation step for the whole island
function tick(state, ctx) {
    const rng = ctx.rng;
    const ev = state.event;
    state.t++;
    // berries grow back
    const cap = ev === "drought" ? 9 : ev === "feast" ? 40 : 20;
    const grow = ev === "drought" ? 0.6 : ev === "feast" ? 3 : 1.4;
    for (let k = 0; k < Math.floor(grow + rng()) && state.food.length < cap; k++) {
        const p = randomSpot(rng);
        if (!inLava(state, p)) state.food.push({ id: ++state.ids, x: p.x, y: p.y });
    }
    // lightning
    if (ev === "storm" && state.t % 3 === 0) {
        const p = randomSpot(rng);
        state.strikes.push({ x: r1(p.x), y: r1(p.y), n: ++state.seq });
        if (state.strikes.length > 6) state.strikes.shift();
        state.critters.filter((c) => dist(c, p) <= 1.6 && !sheltered(state, c)).forEach((c) => rng() > state.traits[c.s].tough * 0.15 && kill(state, c, "storm"));
    }
    // hawks dive at the nearest critter out in the open
    state.hawks.forEach((h) => {
        const prey = state.critters.filter((c) => !sheltered(state, c)).sort((a, b) => dist(a, h) - dist(b, h))[0];
        if (!prey) return;
        const d = dist(prey, h);
        const step = Math.min(d, 1.5);
        h.x += ((prey.x - h.x) / (d || 1)) * step;
        h.y += ((prey.y - h.y) / (d || 1)) * step;
        if (dist(prey, h) < 0.7) {
            if (rng() < 0.55 - state.traits[prey.s].tough * 0.15) kill(state, prey, "hawk");
            const p = randomSpot(rng);
            h.x = p.x;
            h.y = p.y;
        }
    });
    const list = state.critters.slice();
    list.forEach((c) => {
        if (!state.critters.includes(c)) return;
        const tr = state.traits[c.s];
        c.age++;
        if (c.cd > 0) c.cd--;
        c.hunger -= c.sick ? 2.2 : 1.1;
        if (c.hunger <= 0) return kill(state, c, "hunger");
        if (inLava(state, c)) return kill(state, c, "lava");
        // plague
        if (c.sick) {
            if (rng() < 0.03 + tr.tough * 0.02) c.sick = false;
            else if (rng() < 0.015) return kill(state, c, "plague");
        }
        const sight = 3.5 + tr.sense * 1.5;
        const step = 0.7 + tr.speed * 0.3;
        // danger first: hawks, lava
        const danger = state.hawks.find((h) => dist(h, c) < sight * 0.7) || state.lava.find((l) => dist(l, c) < l.r + 1.2);
        if (danger && !sheltered(state, c)) {
            const forest = state.forests.slice().sort((a, b) => dist(a, c) - dist(b, c))[0];
            const away = forest && dist(forest, c) < sight ? forest : { x: c.x + (c.x - danger.x), y: c.y + (c.y - danger.y) };
            c.tx = away.x;
            c.ty = away.y;
        } else {
            const food = c.hunger < 85 ? state.food.filter((f) => dist(f, c) <= sight).sort((a, b) => dist(a, c) - dist(b, c))[0] : null;
            const mate = c.hunger > 55 && !c.cd ? state.critters.find((o) => o !== c && o.s === c.s && !o.cd && o.hunger > 55 && dist(o, c) < sight) : null;
            if (food && (c.hunger < 60 || !mate)) {
                c.tx = food.x;
                c.ty = food.y;
                if (dist(food, c) < 0.8) {
                    c.hunger = Math.min(100, c.hunger + 45);
                    state.food.splice(state.food.indexOf(food), 1);
                }
            } else if (mate) {
                c.tx = mate.x;
                c.ty = mate.y;
                if (dist(mate, c) < 1) {
                    const kids = 1 + (rng() < 0.5 ? tr.litter : Math.max(0, tr.litter - 1)) + (state.event === "feast" ? 1 : 0);
                    for (let k = 0; k < kids; k++) addCritter(state, c.s, c.x + rng() - 0.5, c.y + rng() - 0.5);
                    c.cd = mate.cd = 14;
                    c.hunger -= 25;
                    mate.hunger -= 25;
                }
            } else if (dist({ x: c.tx, y: c.ty }, c) < 0.5 || rng() < 0.08) {
                const a = rng() * Math.PI * 2;
                c.tx = c.x + Math.cos(a) * 4;
                c.ty = c.y + Math.sin(a) * 4;
            }
        }
        // move
        const d = Math.hypot(c.tx - c.x, c.ty - c.y);
        if (d > 0.05) {
            const m = Math.min(d, step);
            c.x += ((c.tx - c.x) / d) * m;
            c.y += ((c.ty - c.y) / d) * m;
            clampIn(c);
        }
        // traps: rivals that step on one are caught
        const trap = state.traps.find((t) => t.s !== c.s && dist(t, c) < 0.8);
        if (trap) {
            state.traps.splice(state.traps.indexOf(trap), 1);
            return kill(state, c, "trap");
        }
        // fangs: pick a fight with a rival close by
        if (tr.fangs && !c.cd) {
            const foe = state.critters.find((o) => o.s !== c.s && dist(o, c) < 0.9);
            if (foe) {
                const win = 0.55 + (tr.tough - state.traits[foe.s].tough) * 0.12;
                c.cd = 9;
                if (rng() < win) kill(state, foe, "fight");
                else kill(state, c, "fight");
                return;
            }
        }
        // plague spreads through crowds
        if (state.event === "plague" && !c.sick && rng() < 0.12 * state.critters.filter((o) => o.sick && dist(o, c) < 1.2).length) c.sick = true;
    });
}

function count(state, s) {
    return state.critters.filter((c) => c.s === s).length;
}
function startSeason(state, ctx) {
    state.season++;
    state.phase = "season";
    state.event = state.next;
    state.next = null;
    state.lava = [];
    state.hawks = [];
    state.strikes = [];
    if (state.event === "volcano") {
        const p = randomSpot(ctx.rng);
        state.lava.push({ x: p.x, y: p.y, r: 3.5 });
        state.food = state.food.filter((f) => !inLava(state, f));
    }
    if (state.event === "hawks") for (let k = 0; k < 1 + Math.floor(state.critters.length / 30); k++) state.hawks.push(randomSpot(ctx.rng));
    if (state.event === "plague") state.critters.forEach((c) => ctx.rng() < 0.12 && (c.sick = true));
    if (state.event === "feast") for (let k = 0; k < 20; k++) state.food.push({ id: ++state.ids, ...randomSpot(ctx.rng) });
    state.atStart = seats(state.n).map((s) => count(state, s));
    state.deadline = ctx.now() + SEASON_MS;
    const sn = state.season;
    const loop = () => {
        if (state.season !== sn || state.phase !== "season") return;
        tick(state, ctx);
        if (!state.critters.length || ctx.now() >= state.deadline) return endSeason(state, ctx);
        ctx.later(TICK, loop);
    };
    ctx.later(TICK, loop);
}
function endSeason(state, ctx) {
    const pops = seats(state.n).map((s) => count(state, s));
    state.hist.push(pops);
    state.drink = seats(state.n).filter((s) => state.atStart[s] >= 2 && pops[s] <= state.atStart[s] / 2);
    // bets on the biggest species pay out
    const top = Math.max(...pops);
    state.bets.forEach((b, s) => {
        if (b !== null && pops[b] === top && top > 0) {
            state.coins[s] += 4;
            state.betWon[s] = true;
        } else state.betWon[s] = false;
    });
    const alive = pops.filter((p) => p > 0).length;
    if (state.season >= SEASONS || alive <= 1 && state.n > 1) {
        state.phase = "done";
        state.deadline = null;
        return;
    }
    // shop: everyone gets coins, the smallest species get a few more
    const most = Math.max(...pops);
    seats(state.n).forEach((s) => (state.coins[s] += 6 + Math.min(6, Math.floor((most - pops[s]) / 3))));
    state.phase = "shop";
    state.ready = state.ready.map(() => false);
    state.bets = state.bets.map(() => null);
    state.deadline = ctx.now() + SHOP_MS;
    const sn = state.season;
    ctx.later(SHOP_MS, () => state.season === sn && state.phase === "shop" && startVote(state, ctx));
}
function startVote(state, ctx) {
    state.phase = "vote";
    const keys = Object.keys(EVENTS);
    const pool = keys.slice();
    state.offers = [0, 1, 2].map(() => pool.splice(Math.floor(ctx.rng() * pool.length), 1)[0]);
    state.votes = state.votes.map(() => null);
    state.deadline = ctx.now() + VOTE_MS;
    const sn = state.season;
    ctx.later(VOTE_MS, () => state.season === sn && state.phase === "vote" && closeVote(state, ctx));
}
function closeVote(state, ctx) {
    const tally = state.offers.map((e) => state.votes.filter((v) => v === e).length);
    const top = Math.max(...tally);
    const best = state.offers.filter((_, i) => tally[i] === top);
    state.next = best[Math.floor(ctx.rng() * best.length)];
    state.lastVote = { offers: state.offers, tally, picked: state.next };
    startSeason(state, ctx);
}

function pub(state) {
    return {
        phase: state.phase,
        season: state.season,
        seasons: SEASONS,
        deadline: state.deadline,
        w: W,
        h: H,
        species: seats(state.n).map((s) => SPECIES[s % SPECIES.length]),
        forests: state.forests,
        critters: state.critters.map((c) => [c.id, c.s, r1(c.x), r1(c.y), c.sick ? 1 : 0]),
        food: state.food.map((f) => [r1(f.x), r1(f.y)]),
        burrows: state.burrows.map((b) => ({ s: b.s, x: r1(b.x), y: r1(b.y) })),
        hawks: state.hawks.map((h) => [r1(h.x), r1(h.y)]),
        lava: state.lava,
        strikes: state.strikes,
        deaths: state.deaths.slice(-12),
        event: state.event ? { id: state.event, ...EVENTS[state.event] } : null,
        events: EVENTS,
        traits: state.traits,
        traitDefs: TRAITS,
        cost: COST,
        pops: seats(state.n).map((s) => count(state, s)),
        hist: state.hist,
        born: state.born,
        offers: state.phase === "vote" ? state.offers : null,
        votes: state.phase === "vote" ? state.offers.map((e) => state.votes.filter((v) => v === e).length) : null,
        lastVote: state.lastVote,
        drink: state.phase === "shop" || state.phase === "vote" || state.phase === "done" ? state.drink : [],
        ready: state.ready,
    };
}

module.exports = {
    id: "critters",
    name: "Critter Island",
    kind: "sim",
    quick: false,
    players: [2, 8],
    EVENTS,
    TRAITS,
    init({ rng, ctx, players = 2 }) {
        const n = players;
        const forests = [];
        while (forests.length < 4) {
            const p = randomSpot(rng);
            if (forests.every((f) => dist(f, p) > 6)) forests.push({ x: r1(p.x), y: r1(p.y), r: 1.6 + rng() * 0.8 });
        }
        const state = {
            n, forests, critters: [], food: [], burrows: [], traps: [], hawks: [], lava: [], strikes: [], deaths: [],
            ids: 0, seq: 0, t: 0, season: 0, phase: "season", event: null, next: null, deadline: null,
            traits: seats(n).map(() => ({ speed: 0, tough: 0, sense: 0, litter: 0, fangs: 0 })),
            coins: new Array(n).fill(0), bets: new Array(n).fill(null), betWon: new Array(n).fill(false), votes: new Array(n).fill(null),
            ready: new Array(n).fill(false), born: new Array(n).fill(0), hist: [], atStart: [], drink: [], offers: [], lastVote: null,
        };
        // each species starts in its own corner of the island
        seats(n).forEach((s) => {
            const a = (s / n) * Math.PI * 2;
            const cx = W / 2 + Math.cos(a) * (W / 2 - 4), cy = H / 2 + Math.sin(a) * (H / 2 - 3.5);
            for (let k = 0; k < START; k++) {
                const c = addCritter(state, s, cx + rng() * 2 - 1, cy + rng() * 2 - 1);
                if (c) clampIn(c);
            }
        });
        state.born = state.born.map(() => 0);
        for (let k = 0; k < 12; k++) state.food.push({ id: ++state.ids, ...randomSpot(rng) });
        startSeason(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.me = { coins: state.coins[seat], bet: state.bets[seat], betWon: state.betWon[seat], vote: state.votes[seat], traps: state.traps.filter((t) => t.s === seat).map((t) => [r1(t.x), r1(t.y)]) };
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.act === "vote") {
            if (state.phase !== "vote") return { error: "No vote right now." };
            if (!state.offers.includes(p.e)) return { error: "Pick one of the three." };
            state.votes[seat] = p.e;
            if (state.votes.every((v) => v !== null)) closeVote(state, ctx);
            return { ok: true };
        }
        if (state.phase !== "shop") return { error: state.phase === "season" ? "Watch the island! The shop opens after the season." : "Shop's closed." };
        if (p.act === "ready") {
            state.ready[seat] = p.on !== false;
            if (state.ready.every(Boolean)) startVote(state, ctx);
            return { ok: true };
        }
        if (p.act === "bet") {
            if (!Number.isInteger(p.s) || p.s < 0 || p.s >= state.n) return { error: "Pick a species." };
            state.bets[seat] = p.s;
            return { ok: true };
        }
        if (p.act === "trait") {
            const d = TRAITS[p.k];
            if (!d) return { error: "Pick a trait." };
            const lvl = state.traits[seat][p.k];
            if (lvl >= d.max) return { error: "That's maxed out." };
            const cost = d.cost[lvl];
            if (state.coins[seat] < cost) return { error: "You need " + cost + " coins." };
            state.coins[seat] -= cost;
            state.traits[seat][p.k]++;
            return { ok: true };
        }
        if (p.act === "food" || p.act === "burrow" || p.act === "trap") {
            const x = Number(p.x), y = Number(p.y);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !onIsland(x, y)) return { error: "Tap a spot on the island." };
            const cost = COST[p.act];
            if (state.coins[seat] < cost) return { error: "You need " + cost + " coins." };
            state.coins[seat] -= cost;
            if (p.act === "food") for (let k = 0; k < 5; k++) state.food.push(clampIn({ id: ++state.ids, x: x + ctx.rng() * 2 - 1, y: y + ctx.rng() * 2 - 1 }));
            if (p.act === "burrow") state.burrows.push({ s: seat, x, y });
            if (p.act === "trap") state.traps.push({ s: seat, x, y });
            return { ok: true };
        }
        return { error: "Bad move." };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const pops = seats(state.n).map((s) => count(state, s));
        const top = Math.max(...pops);
        const r = ranked(pops.map((p, s) => p * 1000 + state.born[s]), "high", top ? SPECIES[pops.indexOf(top) % SPECIES.length].name + " rule the island with " + top + " critters" : "Nothing survived the island");
        return r;
    },
};
