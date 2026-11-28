// Critter Island: a survival sim for the TV. Everyone picks a species and drops a home on one shared island. The
// critters have minds of their own: by day they wander completely at random, bump into bushes and carry a berry home,
// stumble over coins, wander into rival camps and pinch from their stash, and walk into predators let loose from the
// dens. You never steer them. You only change the world: each morning you spend coins (and berries) on bushes,
// walls, gates, snares, hives, tunnels, fires and more. At night everyone walks home, eats, and maybe breeds: the more
// berries in the stash (and a fire going), the better the odds. Weather changes daily and disasters strike at random.
// Lose every critter and you're out. After 12 days the biggest colony wins, unless one outlasts the rest first.
const { seats } = require("../rank");
const DAYS = 12;
const PICK_MS = 60000; // every timer is a backstop: each step moves on as soon as everyone is ready
const HOME_MS = 60000;
const BUILD_MS = 180000;
const NIGHT_MS = 60000;
const TICK = 500;
const DAY_TICKS = 80;
const DUSK_TICKS = 12;
const W = 30;
const H = 18;
const START = 8;
const CAP = 40;
const HOME_R = 1.6;
const SAFE = 6; // ticks a critter can't be hurt after a hit (3 seconds)

const SPECIES = {
    bunny: { icon: "🐰", name: "Bunnies", perk: "Breed easily (odds start at 40 instead of 60)" },
    turtle: { icon: "🐢", name: "Turtles", perk: "3 hit points instead of 2" },
    squirrel: { icon: "🐿️", name: "Squirrels", perk: "Carry 2 berries at once" },
    mouse: { icon: "🐭", name: "Mice", perk: "Eat half as much" },
    hedgehog: { icon: "🦔", name: "Hedgehogs", perk: "Thorns don't hurt them; predators that bite them often die" },
    fox: { icon: "🦊", name: "Foxes", perk: "Half the time a predator that touches them dies instead" },
    lizard: { icon: "🦎", name: "Lizards", perk: "Heatwaves and wildfire can't touch them" },
    frog: { icon: "🐸", name: "Frogs", perk: "Swim through ponds and floods; floods leave their stash alone" },
};
// place is the kind of spot it needs: "spot" anywhere sensible, "wall" a grid square, "two" two spots, none = at home
const SHOP = {
    seed: { icon: "🌱", name: "Berry bush", coins: 3, place: "spot", text: "Plant a bush. It fruits after 2 days (6 berries) and regrows every night. Anyone's critters can pick it." },
    thorn: { icon: "🌵", name: "Thorn bush", coins: 2, place: "spot", text: "Fruits after 1 day and regrows fast, but every berry picked costs that critter 1 hit point. Yours too." },
    tree: { icon: "🍎", name: "Fruit tree", coins: 6, place: "spot", text: "Takes 4 days to grow, then drops 3 berries on the ground around it every night." },
    wall: { icon: "🧱", name: "Wall", coins: 1, place: "wall", text: "One block. Critters and predators bump into it. Line them up to fence things in or out." },
    gate: { icon: "🚪", name: "Gate", coins: 3, place: "wall", text: "A wall block that only your own critters can walk through." },
    scarecrow: { icon: "🎃", name: "Scarecrow", coins: 3, place: "spot", text: "Predators that wander near it turn round and go the other way." },
    hive: { icon: "🐝", name: "Beehive", coins: 4, place: "spot", text: "A critter that bumps it grabs honey (3 berries) but may get stung for 1 hit point." },
    herb: { icon: "🌿", name: "Healing herb", coins: 3, place: "spot", text: "A hurt critter that bumps it heals 1 hit point. Regrows 2 days after it's used." },
    tunnel: { icon: "🕳️", name: "Tunnel", coins: 5, place: "two", text: "Two linked holes (tap twice). A critter that walks into one pops out of the other." },
    snare: { icon: "🪤", name: "Hidden snare", coins: 2, food: 1, place: "spot", text: "Only you can see it. Whoever walks in is stuck: a teammate bumping into them sets them free, otherwise they starve the next night. Catches predators too." },
    fire: { icon: "🔥", name: "Campfire", coins: 3, food: 2, text: "Lit at your home for 2 nights. Makes babies much more likely." },
    store: { icon: "🏚️", name: "Storehouse", coins: 6, once: true, text: "Rival critters that wander into your camp can't pinch berries any more." },
};
const WEATHER = {
    sunny: { icon: "☀️", name: "Sunny", text: "A normal day." },
    rain: { icon: "🌧️", name: "Rain", text: "Everyone moves a bit slower. Bushes regrow double tonight." },
    wind: { icon: "🌬️", name: "Windy", text: "Critters and predators get blown one way across the island." },
    heat: { icon: "🥵", name: "Heatwave", text: "Bushes don't regrow tonight. Lizards don't care." },
    cold: { icon: "🥶", name: "Cold snap", text: "Everyone eats double tonight." },
    rainbow: { icon: "🌈", name: "Rainbow", text: "Extra coins and gems lie around the island." },
};
const DISASTERS = {
    lightning: { icon: "⛈️", name: "Lightning", text: "Strikes all day. Anyone close takes a hit." },
    wildfire: { icon: "🔥", name: "Wildfire", text: "Part of the island burns: bushes, walls and anything standing in it." },
    flood: { icon: "🌊", name: "Flood", text: "The shore is underwater all day. Homes near the shore lose half their berries." },
    quake: { icon: "🫨", name: "Earthquake", text: "Knocks down half the walls and gates and shuffles the rocks." },
    locusts: { icon: "🦗", name: "Locusts", text: "Every bush is stripped down to 1 berry." },
    sickness: { icon: "🤒", name: "Sickness", text: "Some critters on every team lose a hit point." },
    migration: { icon: "🐺", name: "Migration", text: "A new predator den moves in." },
};
const DENS = {
    wolf: { icon: "🐺", den: "🕳️", name: "Wolf den", pace: [0.25, 0.5] },
    bear: { icon: "🐻", den: "🪨", name: "Bear cave", pace: [0.15, 0.35] },
    snake: { icon: "🐍", den: "🕳️", name: "Snake pit", pace: [0.2, 0.4] },
    boar: { icon: "🐗", den: "🌿", name: "Boar thicket", pace: [0.3, 0.55] },
};
const SCENERY = { rock: "🪨", tree: "🌳", pine: "🌲", pond: "💧" };

const r1 = (x) => Math.round(x * 10) / 10;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ellipse = (x, y) => ((x - W / 2) / (W / 2 - 1)) ** 2 + ((y - H / 2) / (H / 2 - 1)) ** 2;
const onIsland = (p) => ellipse(p.x, p.y) <= 0.96;
const between = (rng, [a, b]) => a + rng() * (b - a);
function spot(rng, ok = () => true) {
    for (let k = 0; k < 500; k++) {
        const p = { x: 1.5 + rng() * (W - 3), y: 1.5 + rng() * (H - 3) };
        if (onIsland(p) && ok(p)) return { x: r1(p.x), y: r1(p.y) };
    }
    return null;
}
const alive = (state) => seats(state.n).filter((s) => state.out[s] === null);
const mine = (state, s) => state.critters.filter((c) => c.s === s);
const perk = (state, s, k) => state.picks[s] === k;
const homeOf = (state, p) => state.homes.findIndex((h) => h && dist(h, p) <= HOME_R);
const carryCap = (state, s) => (perk(state, s, "squirrel") ? 2 : 1);
const maxHp = (state, s) => (perk(state, s, "turtle") ? 3 : 2);
function log(state, s, text, kind) {
    state.log.push({ n: ++state.seq, s, text, kind, day: state.day });
    if (state.log.length > 40) state.log.shift();
}
function poof(state, p, why) {
    state.poofs.push({ x: r1(p.x), y: r1(p.y), why, n: ++state.seq });
    if (state.poofs.length > 24) state.poofs.shift();
}
function addCritter(state, s, rng, young) {
    if (mine(state, s).length >= CAP) return;
    const h = state.homes[s];
    const a = rng() * Math.PI * 2;
    const rr = rng() * HOME_R * 0.6;
    const hp = maxHp(state, s);
    state.critters.push({ id: ++state.ids, s, x: h.x + Math.cos(a) * rr, y: h.y + Math.sin(a) * rr, hp, max: hp, carry: 0, safe: 0, calm: 0, young: !!young, snared: null, dir: a, steps: 0, rest: 0, pace: 0.3, cool: 0 });
}
function kill(state, c, why) {
    const i = state.critters.indexOf(c);
    if (i < 0) return;
    state.critters.splice(i, 1);
    const nt = state.night[c.s];
    nt.lost[why] = (nt.lost[why] || 0) + 1;
    poof(state, c, why);
}
// one hit point off, then a few seconds where nothing can hurt it again
function hurt(state, c, why) {
    if (c.safe > state.t || !state.critters.includes(c)) return;
    c.hp--;
    c.calm = 0;
    c.safe = state.t + SAFE;
    if (c.hp <= 0) kill(state, c, why);
    else poof(state, c, "hit");
}

// ---------- what's in the way ----------
function blocked(state, p, who) {
    if (!onIsland(p)) return true;
    const frog = who && who.s !== undefined && perk(state, who.s, "frog");
    if (state.disaster === "flood" && state.phase === "day" && ellipse(p.x, p.y) > 0.72 && !frog) return true;
    for (const d of state.scenery) {
        if (d.k === "pond" ? dist(d, p) < 1.2 && !frog : dist(d, p) < 0.55) return true;
    }
    for (const it of state.items) {
        if (it.k === "wall" && Math.abs(it.x - p.x) < 0.55 && Math.abs(it.y - p.y) < 0.55) return true;
        if (it.k === "gate" && Math.abs(it.x - p.x) < 0.55 && Math.abs(it.y - p.y) < 0.55 && !(who && who.s === it.s)) return true;
    }
    if (who && who.kind) {
        // predators keep out of homes and away from scarecrows
        if (state.homes.some((h) => h && dist(h, p) < HOME_R)) return true;
        if (state.items.some((it) => it.k === "scarecrow" && dist(it, p) < 1.3)) return true;
    }
    return false;
}
// wander: pick a random way, walk it at a random pace for a random time, stop for a random time, repeat
function wander(state, a, rng, pace) {
    if (a.rest > 0) return a.rest--;
    if (a.steps <= 0) {
        a.dir = rng() * Math.PI * 2;
        a.steps = 2 + Math.floor(rng() * 9);
        a.pace = between(rng, pace);
        a.restNext = Math.floor(rng() * 6);
    }
    const sp = a.pace * (state.weather === "rain" ? 0.7 : 1);
    const p = { x: a.x + Math.cos(a.dir) * sp, y: a.y + Math.sin(a.dir) * sp };
    if (state.weather === "wind") {
        p.x += state.wind.x * 0.15;
        p.y += state.wind.y * 0.15;
    }
    if (blocked(state, p, a)) {
        a.steps = 0;
        a.rest = 1;
        return;
    }
    a.x = p.x;
    a.y = p.y;
    if (--a.steps <= 0) a.rest = a.restNext;
}

// ---------- setup ----------
function pickTurn(state, ctx) {
    state.phase = "pick";
    const s = state.pickOrder[state.pickPos];
    state.turn = s;
    const id = ++state.tick;
    state.deadline = ctx.now() + PICK_MS;
    ctx.later(PICK_MS, () => {
        if (state.tick !== id || state.phase !== "pick") return;
        const left = Object.keys(SPECIES).filter((k) => !state.picks.includes(k));
        choose(state, ctx, s, left[Math.floor(ctx.rng() * left.length)]);
    });
}
function choose(state, ctx, s, k) {
    state.picks[s] = k;
    state.pickPos++;
    if (state.pickPos < state.n) return pickTurn(state, ctx);
    // whoever picked last places their home first
    state.homeOrder = state.pickOrder.slice().reverse();
    state.homePos = 0;
    homeTurn(state, ctx);
}
const homeOk = (state, p, s) => ellipse(p.x, p.y) < 0.62 && state.homes.every((h, i) => !h || i === s || dist(h, p) >= 6) && !state.scenery.some((d) => dist(d, p) < (d.k === "pond" ? 3 : 2));
function homeTurn(state, ctx) {
    state.phase = "home";
    const s = state.homeOrder[state.homePos];
    state.turn = s;
    const id = ++state.tick;
    state.deadline = ctx.now() + HOME_MS;
    ctx.later(HOME_MS, () => {
        if (state.tick !== id || state.phase !== "home") return;
        const p = spot(ctx.rng, (q) => homeOk(state, q, s)) || spot(ctx.rng, (q) => ellipse(q.x, q.y) < 0.62);
        placeHome(state, ctx, s, p);
    });
}
function placeHome(state, ctx, s, p) {
    state.homes[s] = { x: r1(p.x), y: r1(p.y) };
    state.homePos++;
    if (state.homePos < state.n) return homeTurn(state, ctx);
    startGame(state, ctx);
}
function addDen(state, rng) {
    const kinds = Object.keys(DENS);
    const p = spot(rng, (q) => ellipse(q.x, q.y) < 0.8 && state.homes.every((h) => !h || dist(h, q) > 6) && state.dens.every((d) => dist(d, q) > 5) && !blocked(state, q));
    if (p) state.dens.push({ id: ++state.ids, kind: kinds[Math.floor(rng() * kinds.length)], x: p.x, y: p.y, lvl: 1 });
}
function addBush(state, p, k, ready, food) {
    state.bushes.push({ id: ++state.ids, x: r1(p.x), y: r1(p.y), thorn: k === "thorn", tree: k === "tree", ready, food, max: k === "tree" ? 0 : 8 });
}
function startGame(state, ctx) {
    const rng = ctx.rng;
    seats(state.n).forEach((s) => {
        for (let k = 0; k < START; k++) addCritter(state, s, rng);
        const p = spot(rng, (q) => dist(q, state.homes[s]) > 2.5 && dist(q, state.homes[s]) < 4 && !blocked(state, q));
        if (p) addBush(state, p, "seed", 0, 6);
    });
    for (let k = 0; k < 4 + state.n * 2; k++) {
        const p = spot(rng, (q) => state.homes.every((h) => dist(h, q) > 3) && !blocked(state, q) && state.bushes.every((b) => dist(b, q) > 2));
        if (p) addBush(state, p, "seed", 0, 6);
    }
    for (let k = 0; k < Math.max(2, Math.ceil(state.n / 2) + 1); k++) addDen(state, rng);
    startBuild(state, ctx);
}

// ---------- morning: everyone spends ----------
function startBuild(state, ctx) {
    state.day++;
    state.phase = "build";
    state.turn = null;
    state.ready = state.ready.map((_, s) => state.out[s] !== null);
    const id = ++state.tick;
    state.deadline = ctx.now() + BUILD_MS;
    ctx.later(BUILD_MS, () => state.tick === id && state.phase === "build" && startDay(state, ctx));
}
function placeOk(state, p, k, s) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !onIsland(p) || ellipse(p.x, p.y) > 0.9) return "Pick a spot on the island.";
    if (blocked(state, p)) return "Something's already there.";
    if (state.homes.some((h) => h && dist(h, p) < HOME_R + 1)) return "Too close to a home.";
    if (state.dens.some((d) => dist(d, p) < 1.5)) return "Too close to a predator den.";
    if (state.bushes.some((b) => dist(b, p) < 1)) return "Too close to a bush.";
    const solid = k === "wall" || k === "gate";
    // walls can line up next to each other, but nothing gets jammed against anything else
    if (state.items.some((it) => !(solid && (it.k === "wall" || it.k === "gate")) && dist(it, p) < (solid ? 1.2 : 1) && !(it.k === "snare" && it.s !== s))) return "Too close to something else.";
    if (solid && state.bushes.some((b) => dist(b, p) < 1.5)) return "Walls can't box in a bush.";
    return null;
}
function buy(state, s, p) {
    const it = SHOP[p.k];
    if (!it) return { error: "Pick something from the shop." };
    if (state.coins[s] < it.coins) return { error: "You need " + it.coins + " coins." };
    if (it.food && state.stash[s] < it.food) return { error: "You need " + it.food + " berries too." };
    if (it.once && state.owned[s].includes(p.k)) return { error: "You already have one." };
    let at = it.place ? { x: Number(p.x), y: Number(p.y) } : null;
    if (it.place === "wall") at = { x: Math.floor(at.x) + 0.5, y: Math.floor(at.y) + 0.5 };
    if (at) {
        const why = placeOk(state, at, p.k, s);
        if (why) return { error: why };
    }
    let at2 = null;
    if (it.place === "two") {
        at2 = { x: Number(p.x2), y: Number(p.y2) };
        const why = placeOk(state, at2, p.k, s);
        if (why) return { error: "Second hole: " + why.toLowerCase() };
        if (dist(at, at2) < 3) return { error: "Put the two holes further apart." };
    }
    state.coins[s] -= it.coins;
    if (it.food) state.stash[s] -= it.food;
    if (p.k === "seed" || p.k === "thorn" || p.k === "tree") addBush(state, at, p.k, state.day + (p.k === "seed" ? 2 : p.k === "thorn" ? 1 : 4), 0);
    else if (p.k === "fire") state.fire[s] = 2;
    else if (p.k === "store") state.owned[s].push("store");
    else state.items.push({ id: ++state.ids, k: p.k, s, x: r1(at.x), y: r1(at.y), x2: at2 ? r1(at2.x) : undefined, y2: at2 ? r1(at2.y) : undefined, ready: 0 });
    return { ok: true };
}

// ---------- the day ----------
function startDay(state, ctx) {
    const rng = ctx.rng;
    state.phase = "day";
    state.t = 0;
    state.night = seats(state.n).map(() => blankNight());
    state.strikes = [];
    state.blaze = null;
    state.trader = null;
    state.preds = [];
    state.critters.forEach((c) => {
        c.steps = 0;
        c.rest = Math.floor(rng() * 4);
    });
    const dis = state.disaster;
    if (dis === "wildfire") {
        const p = spot(rng, (q) => state.homes.every((h) => dist(h, q) > 5));
        if (p) {
            state.blaze = { x: p.x, y: p.y, r: 3.5 };
            const inside = (o) => dist(o, state.blaze) <= state.blaze.r;
            state.bushes = state.bushes.filter((b) => !inside(b));
            state.items = state.items.filter((it) => !inside(it));
            state.scenery = state.scenery.filter((d) => !(d.k === "tree" || d.k === "pine") || !inside(d));
        }
    }
    if (dis === "flood")
        alive(state).forEach((s) => {
            if (ellipse(state.homes[s].x, state.homes[s].y) > 0.3 && !perk(state, s, "frog") && state.stash[s]) {
                state.stash[s] = Math.floor(state.stash[s] / 2);
                log(state, s, "🌊 The flood washed away half of #" + s + "#'s berries", "bad");
            }
        });
    if (dis === "quake") {
        state.items = state.items.filter((it) => !(it.k === "wall" || it.k === "gate") || rng() < 0.5);
        state.scenery.forEach((d) => {
            if (d.k !== "rock") return;
            const p = spot(rng, (q) => state.homes.every((h) => dist(h, q) > 3) && state.dens.every((x) => dist(x, q) > 1.5));
            if (p) Object.assign(d, p);
        });
    }
    if (dis === "locusts") state.bushes.forEach((b) => (b.food = Math.min(b.food, 1)));
    if (dis === "sickness") state.critters.slice().forEach((c) => rng() < (perk(state, c.s, "turtle") ? 0.2 : 0.3) && hurt(state, c, "sickness"));
    if (dis === "migration") addDen(state, rng);
    // predators come out of every den, more as the dens grow
    state.dens.forEach((d) => {
        for (let k = 0; k < d.lvl; k++) state.preds.push({ id: ++state.ids, kind: d.kind, x: d.x + rng() - 0.5, y: d.y + rng() - 0.5, home: d.id, steps: 0, rest: k * 2, dir: 0, pace: 0.3 });
    });
    // things to stumble over
    const loot = 3 + state.n + (state.weather === "rainbow" ? 6 : 0);
    for (let k = 0; k < loot; k++) {
        const p = spot(rng, (q) => !blocked(state, q) && state.homes.every((h) => dist(h, q) > HOME_R + 0.5));
        if (p) state.pickups.push({ id: ++state.ids, k: rng() < (state.weather === "rainbow" ? 0.25 : 0.1) ? "gem" : "coin", x: p.x, y: p.y });
    }
    if (rng() < 0.3) {
        const p = spot(rng, (q) => !blocked(state, q));
        if (p) {
            state.trader = { x: p.x, y: p.y, steps: 0, rest: 0, dir: 0, pace: 0.2 };
            log(state, null, "🛒 A trader is wandering the island today: 1 coin a berry", "info");
        }
    }
    const day = state.day;
    state.deadline = ctx.now() + DAY_TICKS * TICK;
    const loop = () => {
        if (state.day !== day || state.phase !== "day") return;
        tick(state, ctx);
        if (state.t >= DAY_TICKS) return startNight(state, ctx);
        ctx.later(TICK, loop);
    };
    ctx.later(TICK, loop);
}
const blankNight = () => ({ stored: 0, stole: 0, robbed: 0, coins: 0, ate: 0, born: 0, lost: {}, odds: 0 });
function tick(state, ctx) {
    const rng = ctx.rng;
    state.t++;
    const dusk = state.t > DAY_TICKS - DUSK_TICKS;
    if (state.disaster === "lightning" && state.t % 4 === 0 && !dusk) {
        const p = spot(rng);
        state.strikes.push({ x: p.x, y: p.y, n: ++state.seq });
        if (state.strikes.length > 6) state.strikes.shift();
        state.critters.slice().forEach((c) => dist(c, p) <= 1.5 && hurt(state, c, "storm"));
    }
    // predators wander at random too; at dusk they slink back to their dens
    state.preds.slice().forEach((b) => {
        const den = state.dens.find((d) => d.id === b.home);
        if (dusk) {
            if (!den || dist(b, den) < 0.6) return state.preds.splice(state.preds.indexOf(b), 1);
            const d = dist(b, den);
            b.x += ((den.x - b.x) / d) * Math.min(d, 0.6);
            b.y += ((den.y - b.y) / d) * Math.min(d, 0.6);
            return;
        }
        wander(state, b, rng, DENS[b.kind].pace);
        const sn = state.items.find((it) => it.k === "snare" && dist(it, b) < 0.6);
        if (sn) {
            state.items.splice(state.items.indexOf(sn), 1);
            state.preds.splice(state.preds.indexOf(b), 1);
            poof(state, b, "snare");
            return log(state, sn.s, "🪤 #" + sn.s + "#'s snare caught a " + DENS[b.kind].icon, "good");
        }
        if (state.blaze && dist(b, state.blaze) <= state.blaze.r && rng() < 0.2) return state.preds.splice(state.preds.indexOf(b), 1);
        const c = state.critters.find((x) => dist(x, b) < 0.7 && x.safe <= state.t && homeOf(state, x) !== x.s);
        if (!c) return;
        if (perk(state, c.s, "fox") && rng() < 0.5) {
            state.preds.splice(state.preds.indexOf(b), 1);
            poof(state, b, "beast");
            return log(state, c.s, "🦊 One of #" + c.s + "#'s foxes saw off a " + DENS[b.kind].icon, "good");
        }
        hurt(state, c, "beast");
        if (perk(state, c.s, "hedgehog") && rng() < 0.5) {
            state.preds.splice(state.preds.indexOf(b), 1);
            poof(state, b, "beast");
        }
    });
    if (state.trader) wander(state, state.trader, rng, [0.1, 0.3]);
    state.critters.slice().forEach((c) => {
        if (!state.critters.includes(c) || c.snared !== null) return;
        const home = state.homes[c.s];
        if (dusk) {
            // everyone heads straight home for the night
            const d = dist(c, home);
            if (d > 0.4) {
                c.x += ((home.x - c.x) / d) * Math.min(d, 0.9);
                c.y += ((home.y - c.y) / d) * Math.min(d, 0.9);
            }
        } else wander(state, c, rng, [0.15, 0.45]);
        touch(state, c, rng);
    });
    // a teammate bumping into a snared critter sets it free
    state.critters.forEach((c) => {
        if (c.snared === null) return;
        const pal = state.critters.find((o) => o !== c && o.s === c.s && o.snared === null && dist(o, c) < 0.8);
        if (pal) {
            c.snared = null;
            log(state, c.s, "🐾 #" + c.s + "# freed a critter from a snare", "good");
        }
    });
}
// everything a critter can bump into
function touch(state, c, rng) {
    const s = c.s;
    const nt = state.night[s];
    const cap = carryCap(state, s);
    if (state.blaze && dist(c, state.blaze) <= state.blaze.r && !perk(state, s, "lizard")) return hurt(state, c, "fire");
    const sn = state.items.find((it) => it.k === "snare" && dist(it, c) < 0.5);
    if (sn) {
        state.items.splice(state.items.indexOf(sn), 1);
        c.snared = state.day;
        poof(state, c, "snare");
        return log(state, sn.s, "🪤 #" + sn.s + "#'s snare caught " + (sn.s === s ? "one of their own!" : "one of #" + s + "#'s critters"), sn.s === s ? "bad" : "good");
    }
    const at = homeOf(state, c);
    if (at === s && c.carry) {
        state.stash[s] += c.carry;
        nt.stored += c.carry;
        c.carry = 0;
    } else if (at >= 0 && at !== s && !c.young && c.carry < cap && state.stash[at] > 0 && !state.owned[at].includes("store") && c.cool <= state.t) {
        state.stash[at]--;
        state.night[at].robbed++;
        nt.stole++;
        c.carry++;
        c.cool = state.t + 6;
    }
    if (!c.young && c.carry < cap) {
        const b = state.bushes.find((x) => x.ready <= state.day && x.food > 0 && dist(x, c) < 0.85);
        if (b && c.cool <= state.t) {
            b.food--;
            c.carry++;
            c.cool = state.t + 2;
            if (b.thorn && !perk(state, s, "hedgehog")) hurt(state, c, "thorn");
        }
    }
    const q = state.pickups.find((x) => dist(x, c) < 0.6 && (x.k !== "berry" || (!c.young && c.carry < cap)));
    if (q) {
        state.pickups.splice(state.pickups.indexOf(q), 1);
        if (q.k === "berry") c.carry++;
        else {
            const v = q.k === "gem" ? 5 : 1;
            state.coins[s] += v;
            nt.coins += v;
            if (q.k === "gem") log(state, s, "💎 #" + s + "# found a gem! +5 coins", "good");
        }
    }
    if (!state.critters.includes(c)) return;
    for (const it of state.items) {
        if (it.k === "hive" && dist(it, c) < 0.7 && c.cool <= state.t && !c.young) {
            c.carry += 3;
            c.cool = state.t + 10;
            if (rng() < 0.3) hurt(state, c, "sting");
            break;
        }
        if (it.k === "herb" && it.ready <= state.day && c.hp < c.max && dist(it, c) < 0.7) {
            c.hp++;
            it.ready = state.day + 2;
            poof(state, c, "heal");
            break;
        }
        if (it.k === "tunnel" && c.cool <= state.t) {
            const a = dist(it, c) < 0.5;
            const b = dist({ x: it.x2, y: it.y2 }, c) < 0.5;
            if (a || b) {
                c.x = a ? it.x2 : it.x;
                c.y = a ? it.y2 : it.y;
                c.cool = state.t + 8;
                c.steps = 0;
                break;
            }
        }
    }
    const tr = state.trader;
    if (tr && c.carry && dist(tr, c) < 0.8) {
        state.coins[s] += c.carry;
        nt.coins += c.carry;
        c.carry = 0;
    }
}
function startNight(state, ctx) {
    const rng = ctx.rng;
    state.phase = "night";
    state.preds = [];
    state.trader = null;
    state.strikes = [];
    // whoever didn't make it home walks the rest of the way; the snared stay put
    state.critters.forEach((c) => {
        if (c.snared !== null) return;
        const h = state.homes[c.s];
        const a = rng() * Math.PI * 2;
        c.x = h.x + Math.cos(a) * rng() * HOME_R * 0.6;
        c.y = h.y + Math.sin(a) * rng() * HOME_R * 0.6;
        if (c.carry) {
            state.stash[c.s] += c.carry;
            state.night[c.s].stored += c.carry;
            c.carry = 0;
        }
    });
    state.critters.slice().forEach((c) => c.snared !== null && c.snared < state.day && kill(state, c, "snare"));
    alive(state).forEach((s) => {
        const nt = state.night[s];
        // supper: half a berry each (mice less, cold snaps double); short on food and the ones who go without take 1 damage
        const pop = mine(state, s).filter((c) => c.snared === null).length;
        const need = Math.ceil(pop * (perk(state, s, "mouse") ? 0.35 : 0.5) * (state.weather === "cold" ? 2 : 1));
        const ate = Math.min(need, state.stash[s]);
        state.stash[s] -= ate;
        nt.ate = ate;
        const each = need / Math.max(1, pop);
        if (ate < need)
            mine(state, s).filter((c) => c.snared === null).sort(() => rng() - 0.5).slice(0, Math.ceil((need - ate) / each)).forEach((c) => {
                c.hp--;
                c.calm = 0;
                if (c.hp <= 0) kill(state, c, "hunger");
                else nt.hungry = (nt.hungry || 0) + 1;
            });
        // babies: every pair rolls 1-100 and has to beat the odds; berries in the stash and a fire lower them. A baby costs 1 berry
        const now = mine(state, s);
        const odds = Math.max(5, (perk(state, s, "bunny") ? 40 : 60) - state.stash[s] - (state.fire[s] > 0 ? 20 : 0));
        nt.odds = odds;
        let born = 0;
        for (let k = 0; k < Math.floor(now.length / 2); k++) if (Math.floor(rng() * 100) + 1 > odds) born++;
        born = Math.min(born, CAP - now.length, state.stash[s]);
        state.stash[s] -= born;
        now.forEach((c) => (c.young = false));
        for (let k = 0; k < born; k++) addCritter(state, s, rng, true);
        nt.born = born;
        if (state.fire[s] > 0) state.fire[s]--;
        // two calm nights in a row and they're back to full health
        mine(state, s).forEach((c) => {
            if (c.young) return;
            c.calm++;
            if (c.calm >= 2) c.hp = c.max;
        });
    });
    alive(state).forEach((s) => {
        if (!mine(state, s).length) {
            state.out[s] = state.day;
            log(state, s, "💀 #" + s + "#'s " + SPECIES[state.picks[s]].name.toLowerCase() + " are gone", "bad");
        }
    });
    // the island regrows; fruit trees drop berries; dens grow every 3 days
    const grow = state.weather === "heat" ? 0 : state.weather === "rain" ? 2 : 1;
    state.bushes.forEach((b) => {
        if (b.tree) {
            if (b.ready <= state.day + 1)
                for (let k = 0; k < 3; k++) {
                    const p = { x: b.x + rng() * 3 - 1.5, y: b.y + rng() * 3 - 1.5 };
                    if (!blocked(state, p)) state.pickups.push({ id: ++state.ids, k: "berry", x: r1(p.x), y: r1(p.y) });
                }
            return;
        }
        if (b.ready === state.day + 1) b.food = 6;
        else if (b.ready <= state.day) b.food = Math.min(b.max, b.food + (b.thorn ? 3 : 2) * grow);
    });
    state.pickups = state.pickups.filter((q) => q.k === "berry").slice(-30).concat(state.pickups.filter((q) => q.k !== "berry").slice(-12));
    if (state.day % 3 === 0) state.dens.forEach((d) => d.lvl++);
    // tomorrow's weather, and maybe a disaster (never two days running)
    const ws = ["sunny", "sunny", "rain", "wind", "heat", "cold", "rainbow"];
    state.weather = ws[Math.floor(rng() * ws.length)];
    const ds = Object.keys(DISASTERS);
    state.disaster = !state.disaster && rng() < 0.35 ? ds[Math.floor(rng() * ds.length)] : null;
    if (state.disaster === "wildfire" && state.weather === "rain") state.weather = "sunny";
    const a = rng() * Math.PI * 2;
    state.wind = { x: r1(Math.cos(a)), y: r1(Math.sin(a)) };
    state.hist.push(seats(state.n).map((s) => mine(state, s).length));
    state.ready = state.ready.map((_, s) => state.out[s] !== null);
    state.deadline = ctx.now() + NIGHT_MS;
    const id = ++state.tick;
    ctx.later(NIGHT_MS, () => state.tick === id && state.phase === "night" && afterNight(state, ctx));
}
function afterNight(state, ctx) {
    state.tick++;
    if ((state.n > 1 && alive(state).length <= 1) || !alive(state).length || state.day >= DAYS) return end(state);
    startBuild(state, ctx);
}
function end(state) {
    state.phase = "done";
    state.deadline = null;
    state.tick++;
}

function pub(state) {
    const n = state.n;
    return {
        phase: state.phase,
        day: state.day,
        days: DAYS,
        t: state.t,
        dayTicks: DAY_TICKS,
        deadline: state.deadline,
        w: W,
        h: H,
        turn: state.turn,
        picks: state.picks,
        speciesDefs: SPECIES,
        shop: SHOP,
        weatherDefs: WEATHER,
        disasterDefs: DISASTERS,
        denDefs: DENS,
        sceneryDefs: SCENERY,
        homes: state.homes,
        homeR: HOME_R,
        critters: state.critters.map((c) => [c.id, c.s, r1(c.x), r1(c.y), c.hp, c.max, c.carry, (c.snared !== null ? 1 : 0) | (c.safe > state.t ? 2 : 0) | (c.young ? 4 : 0)]),
        preds: state.preds.map((b) => [b.id, b.kind, r1(b.x), r1(b.y)]),
        dens: state.dens,
        bushes: state.bushes.map((b) => ({ id: b.id, x: b.x, y: b.y, food: b.food, thorn: b.thorn, tree: b.tree, grow: Math.max(0, b.ready - state.day) })),
        scenery: state.scenery,
        items: state.items.filter((it) => it.k !== "snare").map((it) => ({ id: it.id, k: it.k, s: it.s, x: it.x, y: it.y, x2: it.x2, y2: it.y2, off: it.k === "herb" && it.ready > state.day })),
        pickups: state.pickups.map((q) => [q.id, q.k, q.x, q.y]),
        trader: state.trader && { x: r1(state.trader.x), y: r1(state.trader.y) },
        blaze: state.blaze,
        flood: state.phase === "day" && state.disaster === "flood",
        strikes: state.strikes,
        poofs: state.poofs.slice(-14),
        weather: state.weather,
        disaster: state.disaster,
        wind: state.wind,
        fire: state.fire,
        owned: state.owned,
        pops: seats(n).map((s) => mine(state, s).length),
        stash: state.stash,
        coins: state.coins,
        out: state.out,
        night: state.phase === "night" || state.phase === "done" || (state.phase === "build" && state.day > 1) ? state.night : null,
        hist: state.hist,
        log: state.log.filter((l) => l.day >= state.day - 1).slice(-10),
        ready: state.ready,
    };
}
const rankValue = (state) => seats(state.n).map((s) => (state.out[s] === null ? 1000 : state.out[s] * 10) * 100000 + mine(state, s).length * 1000 + Math.min(999, state.stash[s]));

module.exports = {
    id: "critters",
    name: "Critter Island",
    kind: "sim",
    quick: false,
    players: [1, 8],
    SPECIES,
    SHOP,
    canPlace: placeOk,
    init({ rng, ctx, players = 2 }) {
        const n = players;
        const start = Math.floor(rng() * n);
        const arr = (v) => new Array(n).fill(v);
        const a = rng() * Math.PI * 2;
        const state = {
            n, ids: 0, seq: 0, t: 0, day: 0, phase: "pick", turn: null, deadline: null, tick: 0,
            pickOrder: seats(n).map((i) => (i + start) % n), pickPos: 0, homeOrder: [], homePos: 0, picks: arr(null), homes: arr(null),
            critters: [], preds: [], dens: [], bushes: [], scenery: [], items: [], pickups: [], strikes: [], poofs: [], log: [],
            blaze: null, trader: null, weather: "sunny", disaster: null, wind: { x: r1(Math.cos(a)), y: r1(Math.sin(a)) },
            stash: arr(10), coins: arr(8), fire: arr(0), owned: seats(n).map(() => []),
            out: arr(null), ready: arr(false), night: seats(n).map(() => blankNight()), hist: [],
        };
        // a little scenery that only gets in the way
        const add = (k, count, gap) => {
            for (let i = 0; i < count; i++) {
                const p = spot(rng, (q) => ellipse(q.x, q.y) < (k === "pond" ? 0.55 : 0.85) && state.scenery.every((d) => dist(d, q) > (d.k === "pond" || k === "pond" ? 3 : gap)));
                if (p) state.scenery.push({ id: ++state.ids, k, x: p.x, y: p.y });
            }
        };
        add("pond", 1, 3);
        add("rock", 3, 3);
        add("tree", 3, 3);
        add("pine", 2, 3);
        pickTurn(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.items = v.items.concat(state.items.filter((it) => it.k === "snare" && it.s === seat).map((it) => ({ id: it.id, k: it.k, s: it.s, x: it.x, y: it.y })));
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.act === "pick") {
            if (state.phase !== "pick" || state.turn !== seat) return { error: "Wait for your turn to pick." };
            if (!SPECIES[p.k] || state.picks.includes(p.k)) return { error: "Pick a species nobody has." };
            choose(state, ctx, seat, p.k);
            return { ok: true };
        }
        if (p.act === "home") {
            if (state.phase !== "home" || state.turn !== seat) return { error: "Wait for your turn to place your home." };
            const q = { x: Number(p.x), y: Number(p.y) };
            if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return { error: "Tap the island." };
            if (ellipse(q.x, q.y) >= 0.62) return { error: "Too close to the water. Tap further in." };
            if (!homeOk(state, q, seat)) return { error: "Too close to another home or something in the way." };
            placeHome(state, ctx, seat, q);
            return { ok: true };
        }
        if (state.out[seat] !== null) return { error: "Your critters are gone. Watch the rest play out!" };
        if (p.act === "buy") {
            if (state.phase !== "build") return { error: "The shop's open in the morning." };
            return buy(state, seat, p);
        }
        if (p.act === "ready") {
            if (!["build", "night"].includes(state.phase)) return { error: "Nothing to finish." };
            state.ready[seat] = p.on !== false;
            if (state.ready.every(Boolean)) {
                if (state.phase === "build") startDay(state, ctx);
                else afterNight(state, ctx);
            }
            return { ok: true };
        }
        return { error: "Bad move." };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const v = rankValue(state);
        const order = seats(state.n).slice().sort((a, b) => v[b] - v[a]);
        const places = seats(state.n).map((s) => 1 + order.findIndex((x) => v[x] === v[s]));
        const w = order[0];
        const winner = places.filter((p) => p === 1).length === 1 ? w : null;
        const sp = SPECIES[state.picks[w]];
        const left = alive(state).length;
        const text = !left ? "The island won. Nobody survived." : left === 1 && state.n > 1 ? sp.icon + " The " + sp.name.toLowerCase() + " outlasted everyone (day " + state.day + ")" : sp.icon + " The " + sp.name.toLowerCase() + " came out biggest after " + state.day + " days, with " + mine(state, w).length;
        return { winner, places, text };
    },
};
