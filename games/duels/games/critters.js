// Critter Island: a survival game for the TV. Everyone picks a species (each has a perk) and drops their home on one
// shared island. Then it's days and nights: each day you plan 3 actions on your phone (forage a berry bush, raid a
// wild animal hut, hunt beasts, fish, guard or fortify home, plant a bush, nest, explore), then watch your critters
// carry them out while the rest potter around home. At night every critter eats from your stash: short on food and
// some starve, plenty and babies are born. Wild huts (wolves, bears, snakes, hornets) send beasts out by day and raid
// homes at night, and they keep getting stronger. Between days: a shop, then everyone votes on what the island throws
// at tomorrow. Players never attack each other. Last species standing wins (after 12 days, the biggest).
const { seats } = require("../rank");
const DAYS = 12;
const PICK_MS = 60000; // every timer is a backstop: each step moves on as soon as everyone is ready
const HOME_MS = 90000;
const PLAN_MS = 180000;
const DAY_MS = 22000;
const NIGHT_MS = 60000;
const SHOP_MS = 120000;
const VOTE_MS = 60000;
const TICK = 600;
const W = 30;
const H = 18;
const START = 7;
const CAP = 40;
const HOME_R = 1.8;

const SPECIES = {
    bunny: { icon: "🐰", name: "Bunnies", perk: "Breed fast: 50% more babies" },
    turtle: { icon: "🐢", name: "Turtles", perk: "Shells: disasters and night raids hurt less" },
    fox: { icon: "🦊", name: "Foxes", perk: "Hunters: double raid damage, often win fights with beasts" },
    squirrel: { icon: "🐿️", name: "Squirrels", perk: "Hoarders: carry 1 more berry each from a bush" },
    mouse: { icon: "🐭", name: "Mice", perk: "Tiny: eat half as much" },
    hedgehog: { icon: "🦔", name: "Hedgehogs", perk: "Spikes: beasts that attack often die, night raids hurt less" },
    lizard: { icon: "🦎", name: "Lizards", perk: "Heat-proof: shrug off drought and wildfire" },
    frog: { icon: "🐸", name: "Frogs", perk: "Waterproof: shrug off storms and floods, great at fishing" },
};
const ACTIONS = {
    forage: { icon: "🍓", name: "Forage", workers: 3, target: "bush", text: "3 critters gather from a berry bush you pick (2 berries each)." },
    fish: { icon: "🎣", name: "Fish", workers: 2, text: "2 critters fish at the nearest shore: +4 berries' worth of food." },
    raid: { icon: "⚔️", name: "Raid a hut", workers: 4, target: "hut", text: "4 critters attack a wild hut. Destroy it for coins and food. Some may not come back." },
    hunt: { icon: "🏹", name: "Hunt beasts", workers: 2, text: "2 critters chase today's roaming beasts: +2 coins a kill." },
    guard: { icon: "🛡️", name: "Guard home", workers: 3, text: "3 critters stay home: each stops 1 loss in tonight's raid." },
    fortify: { icon: "🔨", name: "Fortify", workers: 2, food: 3, text: "Costs 3 berries. Build a wall: home stops 1 more raid loss, for good." },
    plant: { icon: "🌱", name: "Plant a bush", workers: 2, target: "spot", food: 2, text: "Costs 2 berries (seeds). Plant a new bush where you tap (anyone can forage it)." },
    nest: { icon: "🍼", name: "Nest", workers: 0, text: "Up to 2 extra babies tonight if there's food." },
    explore: { icon: "🔭", name: "Explore", workers: 2, text: "2 critters roam and bring back 3 berries, maybe coins." },
};
const ITEMS = {
    crate: { icon: "📦", name: "Food crate", cost: 3, text: "+6 berries in your stash." },
    honey: { icon: "🍯", name: "Honey pot", cost: 6, text: "+10 berries in your stash." },
    wall: { icon: "🧱", name: "Wall", cost: 4, text: "Home stops 1 more raid loss, for good." },
    dog: { icon: "🐕", name: "Guard dog", cost: 5, once: true, text: "+1 guard every night, for good." },
    trap: { icon: "🪤", name: "Beast trap", cost: 3, once: true, text: "The next beast that comes near your home is caught." },
    lantern: { icon: "🔦", name: "Lantern", cost: 5, once: true, text: "Beasts that wander near your home often run off, for good." },
    decoy: { icon: "🦴", name: "Decoy", cost: 4, once: true, text: "Tonight's hut raid goes after someone else's home." },
    medicine: { icon: "💊", name: "Medicine", cost: 3, once: true, text: "Cures sick critters and keeps them healthy tomorrow." },
    shelter: { icon: "⛺", name: "Storm shelter", cost: 5, once: true, text: "Critters at home are safe from storms and blizzards, for good." },
    raft: { icon: "🛶", name: "Raft", cost: 3, once: true, text: "Floods can't touch your stash, for good." },
    nursery: { icon: "🪺", name: "Nursery", cost: 7, once: true, text: "+1 baby every night (with food), for good." },
    fertilizer: { icon: "🌾", name: "Fertilizer", cost: 4, once: true, text: "Bushes near your home regrow twice as fast, for good." },
    action: { icon: "➕", name: "Extra hands", cost: 5, once: true, text: "A 4th action tomorrow." },
    sticks: { icon: "🗡️", name: "Sharp sticks", cost: 6, once: true, text: "Raiders and hunters deal +1 damage, for good." },
    baskets: { icon: "🧺", name: "Big baskets", cost: 5, once: true, text: "Foragers carry +1 berry each, for good." },
};
const EVENTS = {
    calm: { icon: "☀️", name: "Calm day", text: "Nothing happens. Enjoy it." },
    harvest: { icon: "🍇", name: "Bumper harvest", text: "Every bush is full and a new one grows near each home." },
    storm: { icon: "⛈️", name: "Storm", text: "Lightning strikes critters away from home. Frogs and shelters are safe." },
    drought: { icon: "🏜️", name: "Drought", text: "Bushes give half and don't regrow tonight. Lizards don't mind." },
    wildfire: { icon: "🔥", name: "Wildfire", text: "A fire burns part of the island: bushes, huts and anyone caught in it." },
    flood: { icon: "🌊", name: "Flood", text: "Homes near the shore lose half their food. Frogs and rafts are fine." },
    plague: { icon: "🦠", name: "Plague", text: "Some critters fall sick: they can't work and may die tonight without medicine." },
    blizzard: { icon: "❄️", name: "Blizzard", text: "Everyone eats double tonight and nobody breeds." },
    migration: { icon: "🐾", name: "Migration", text: "Two new wild huts move onto the island." },
};
const HUTS = {
    wolf: { icon: "🐺", name: "Wolf Den", hp: 6, power: 1 },
    bear: { icon: "🐻", name: "Bear Cave", hp: 10, power: 2 },
    snake: { icon: "🐍", name: "Snake Pit", hp: 4, power: 1, bites: true },
    hornet: { icon: "🐝", name: "Hornet Nest", hp: 3, power: 1, sting: true },
};

const r1 = (x) => Math.round(x * 10) / 10;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ellipse = (x, y) => ((x - W / 2) / (W / 2 - 1)) ** 2 + ((y - H / 2) / (H / 2 - 1)) ** 2;
const onIsland = (x, y) => ellipse(x, y) <= 1;
function clampIn(p) {
    for (let k = 0; k < 8 && !onIsland(p.x, p.y); k++) {
        p.x += (W / 2 - p.x) * 0.15;
        p.y += (H / 2 - p.y) * 0.15;
    }
    return p;
}
function spot(rng, ok = () => true) {
    for (let k = 0; k < 400; k++) {
        const p = { x: 1.5 + rng() * (W - 3), y: 1.5 + rng() * (H - 3) };
        if (onIsland(p.x, p.y) && ok(p)) return p;
    }
    return { x: W / 2, y: H / 2 };
}
// the shore point straight out from a home
function shoreOf(h) {
    const dx = h.x - W / 2, dy = h.y - H / 2;
    const d = Math.hypot(dx, dy) || 1;
    const p = { x: h.x, y: h.y };
    for (let k = 0; k < 40 && ellipse(p.x, p.y) < 0.9; k++) {
        p.x += (dx / d) * 0.4;
        p.y += (dy / d) * 0.4;
    }
    return clampIn(p);
}
const alive = (state) => seats(state.n).filter((s) => state.out[s] === null);
const mine = (state, s) => state.critters.filter((c) => c.s === s);
const perk = (state, s, k) => state.picks[s] === k;
const atHome = (state, c) => state.homes[c.s] && dist(state.homes[c.s], c) <= HOME_R;
const has = (state, s, k) => state.owned[s].includes(k);
function log(state, s, text, kind) {
    state.log.push({ n: ++state.seq, s, text, kind, day: state.day });
    if (state.log.length > 40) state.log.shift();
}
function addCritter(state, s, near, rng) {
    if (mine(state, s).length >= CAP) return null;
    const c = clampIn({ id: ++state.ids, s, x: near.x + rng() * 1.6 - 0.8, y: near.y + rng() * 1.6 - 0.8, job: null, sick: false });
    c.tx = c.x;
    c.ty = c.y;
    state.critters.push(c);
    return c;
}
function kill(state, c, why) {
    const i = state.critters.indexOf(c);
    if (i < 0) return;
    state.critters.splice(i, 1);
    const nt = state.night[c.s];
    if (nt) nt.lost[why] = (nt.lost[why] || 0) + 1;
    state.poofs.push({ x: r1(c.x), y: r1(c.y), why, n: ++state.seq });
    if (state.poofs.length > 20) state.poofs.shift();
}
function addHut(state, rng) {
    const kinds = Object.keys(HUTS);
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const p = spot(rng, (q) => state.homes.every((h) => !h || dist(h, q) > 6) && state.huts.every((h) => dist(h, q) > 4));
    const lvl = 1 + Math.floor(state.day / 4);
    const d = HUTS[kind];
    state.huts.push({ id: ++state.ids, kind, x: r1(p.x), y: r1(p.y), lvl, hp: d.hp + (lvl - 1) * 3, max: d.hp + (lvl - 1) * 3 });
}
function addBush(state, p, food = 6) {
    state.bushes.push({ id: ++state.ids, x: r1(p.x), y: r1(p.y), food, max: 10 });
}
const blankNight = () => ({ food: 0, ate: 0, born: 0, lost: {}, loot: 0, raidLost: 0, starved: 0 });

// ---------- setup: pick species in turn, then everyone places a home ----------
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
    state.phase = "home";
    state.turn = null;
    const id = ++state.tick;
    state.deadline = ctx.now() + HOME_MS;
    ctx.later(HOME_MS, () => {
        if (state.tick !== id || state.phase !== "home") return;
        seats(state.n).forEach((x) => {
            if (state.homes[x]) return;
            const p = spot(ctx.rng, (q) => homeOk(state, q, x));
            state.homes[x] = { x: r1(p.x), y: r1(p.y) };
        });
        startGame(state, ctx);
    });
}
const homeOk = (state, p, s) => onIsland(p.x, p.y) && ellipse(p.x, p.y) < 0.85 && state.homes.every((h, i) => !h || i === s || dist(h, p) >= 5);
function startGame(state, ctx) {
    seats(state.n).forEach((s) => {
        for (let k = 0; k < START; k++) addCritter(state, s, state.homes[s], ctx.rng);
        addBush(state, clampIn({ x: state.homes[s].x + (ctx.rng() < 0.5 ? 3 : -3), y: state.homes[s].y + ctx.rng() * 2 - 1 }));
    });
    for (let k = 0; k < 4 + state.n; k++) addBush(state, spot(ctx.rng, (q) => state.homes.every((h) => dist(h, q) > 2.5)));
    for (let k = 0; k < Math.max(2, Math.ceil(state.n / 2)); k++) addHut(state, ctx.rng);
    state.event = "calm";
    startPlan(state, ctx);
}

// ---------- the day ----------
const slots = (state, s) => 3 + (state.extra[s] ? 1 : 0);
function startPlan(state, ctx) {
    state.day++;
    state.phase = "plan";
    state.ready = state.ready.map((_, s) => state.out[s] !== null);
    state.plans = state.plans.map(() => []);
    const id = ++state.tick;
    state.deadline = ctx.now() + PLAN_MS;
    ctx.later(PLAN_MS, () => state.tick === id && state.phase === "plan" && startDay(state, ctx));
}
function startDay(state, ctx) {
    const rng = ctx.rng;
    state.phase = "day";
    state.night = seats(state.n).map(() => blankNight());
    state.strikes = [];
    state.fire = null;
    state.beasts = [];
    state.critters.forEach((c) => (c.job = null));
    const ev = state.event;
    if (ev === "harvest") {
        state.bushes.forEach((b) => (b.food = b.max));
        alive(state).forEach((s) => addBush(state, clampIn({ x: state.homes[s].x + rng() * 4 - 2, y: state.homes[s].y + rng() * 4 - 2 }), 8));
    }
    if (ev === "wildfire") {
        const p = spot(rng);
        state.fire = { x: r1(p.x), y: r1(p.y), r: 4 };
        state.bushes = state.bushes.filter((b) => dist(b, state.fire) > state.fire.r);
        state.huts.forEach((h) => dist(h, state.fire) <= state.fire.r && (h.hp = Math.max(1, h.hp - 4)));
        state.critters.slice().forEach((c) => dist(c, state.fire) <= state.fire.r && !perk(state, c.s, "lizard") && kill(state, c, "fire"));
    }
    if (ev === "flood")
        alive(state).forEach((s) => {
            if (ellipse(state.homes[s].x, state.homes[s].y) > 0.45 && !perk(state, s, "frog") && !has(state, s, "raft")) {
                state.stash[s] = Math.floor(state.stash[s] / 2);
                log(state, s, "🌊 The flood washed away half of #" + s + "#'s food", "bad");
            }
        });
    if (ev === "plague") state.critters.forEach((c) => !state.med[c.s] && rng() < (perk(state, c.s, "turtle") ? 0.15 : 0.3) && (c.sick = true));
    if (ev === "migration") {
        addHut(state, rng);
        addHut(state, rng);
    }
    state.huts.forEach((h) => {
        if (state.day > 1) for (let k = 0; k < h.lvl; k++) state.beasts.push({ id: ++state.ids, kind: h.kind, x: h.x, y: h.y });
    });
    // hand out the jobs
    alive(state).forEach((s) => {
        const free = mine(state, s).filter((c) => !c.sick);
        state.plans[s].forEach((p) => {
            const a = ACTIONS[p.a];
            if (a.food && state.stash[s] < a.food) return log(state, s, a.icon + " #" + s + "# couldn't " + a.name.toLowerCase() + ": not enough berries", "bad");
            if (a.food) state.stash[s] -= a.food;
            const crew = free.splice(0, a.workers);
            let target = state.homes[s];
            if (a.target === "bush") target = state.bushes.find((b) => b.id === p.t) || target;
            if (a.target === "hut") target = state.huts.find((h) => h.id === p.t) || target;
            if (a.target === "spot") target = p.t || target;
            if (p.a === "explore") target = spot(rng);
            if (p.a === "fish") target = shoreOf(state.homes[s]);
            const job = { a: p.a, t: p.t, x: target.x, y: target.y, crew: crew.map((c) => c.id), done: false, s };
            crew.forEach((c) => (c.job = job));
            if (p.a === "nest") state.nest[s] += 2;
            if (p.a === "guard") state.guards[s] += crew.length;
            if (p.a === "fortify" && crew.length) {
                state.walls[s]++;
                log(state, s, "🔨 #" + s + "# built a wall", "good");
            }
        });
    });
    state.deadline = ctx.now() + DAY_MS;
    const day = state.day;
    const loop = () => {
        if (state.day !== day || state.phase !== "day") return;
        tick(state, ctx);
        if (ctx.now() >= state.deadline) return startNight(state, ctx);
        ctx.later(TICK, loop);
    };
    ctx.later(TICK, loop);
}
function arrive(state, ctx, job, crew) {
    if (job.done) return;
    job.done = true;
    const s = job.s;
    const nt = state.night[s];
    if (!crew.length) return;
    if (job.a === "forage") {
        const b = state.bushes.find((x) => x.id === job.t);
        if (!b) return;
        const each = 2 + (perk(state, s, "squirrel") ? 1 : 0) + (has(state, s, "baskets") ? 1 : 0);
        let got = Math.min(b.food, crew.length * each);
        if (state.event === "drought" && !perk(state, s, "lizard")) got = Math.ceil(got / 2);
        b.food -= got;
        state.stash[s] += got;
        nt.food += got;
    }
    if (job.a === "fish") {
        const got = Math.round((perk(state, s, "frog") ? 7 : 4) * (crew.length / 2));
        state.stash[s] += got;
        nt.food += got;
    }
    if (job.a === "explore") {
        state.stash[s] += 3;
        nt.food += 3;
        if (ctx.rng() < 0.4) {
            state.coins[s] += 2;
            log(state, s, "🔭 #" + s + "#'s explorers found 2 coins", "good");
        }
    }
    if (job.a === "plant") addBush(state, job, 4);
    if (job.a === "raid") {
        const h = state.huts.find((x) => x.id === job.t);
        if (!h) return;
        const d = HUTS[h.kind];
        h.hp -= crew.length * ((perk(state, s, "fox") ? 2 : 1) + (has(state, s, "sticks") ? 1 : 0));
        let losses = Math.round((d.power + h.lvl - 1) * (0.5 + ctx.rng()) + (d.sting ? 1 : 0));
        if (perk(state, s, "turtle") || perk(state, s, "hedgehog")) losses = Math.max(0, losses - 1);
        crew.slice(0, Math.min(losses, crew.length)).forEach((c) => kill(state, c, "raid"));
        if (h.hp <= 0) {
            state.huts.splice(state.huts.indexOf(h), 1);
            const loot = 4 + h.lvl * 3;
            state.coins[s] += loot;
            state.stash[s] += 3 + h.lvl * 2;
            nt.food += 3 + h.lvl * 2;
            nt.loot += loot;
            log(state, s, "⚔️ #" + s + "# destroyed a " + d.name + "! +" + loot + " coins", "good");
        } else log(state, s, "⚔️ #" + s + "# hit the " + d.name + " (" + h.hp + "/" + h.max + " left)", "info");
    }
}
function tick(state, ctx) {
    const rng = ctx.rng;
    if (state.event === "storm" && state.t++ % 3 === 0) {
        const p = spot(rng);
        state.strikes.push({ x: r1(p.x), y: r1(p.y), n: ++state.seq });
        if (state.strikes.length > 6) state.strikes.shift();
        state.critters.slice().forEach((c) => dist(c, p) <= 1.8 && !perk(state, c.s, "frog") && !(atHome(state, c) && has(state, c.s, "shelter")) && rng() > (perk(state, c.s, "turtle") ? 0.5 : 0) && kill(state, c, "storm"));
    }
    // beasts hunt critters away from home
    state.beasts.slice().forEach((b) => {
        if (!state.beasts.includes(b)) return;
        const near = alive(state).find((s) => dist(state.homes[s], b) < 3);
        if (near !== undefined && state.trapAt[near]) {
            state.trapAt[near] = false;
            state.beasts.splice(state.beasts.indexOf(b), 1);
            log(state, near, "🪤 #" + near + "#'s trap caught a " + HUTS[b.kind].icon, "good");
            return;
        }
        if (near !== undefined && has(state, near, "lantern") && rng() < 0.15) {
            state.beasts.splice(state.beasts.indexOf(b), 1);
            return;
        }
        const prey = state.critters.filter((c) => !atHome(state, c)).sort((a, c) => dist(a, b) - dist(c, b))[0];
        const tgt = prey && dist(prey, b) < 7 ? prey : { x: b.x + rng() * 4 - 2, y: b.y + rng() * 4 - 2 };
        const d = dist(tgt, b);
        const m = Math.min(d, 0.85);
        if (d > 0.01) {
            b.x += ((tgt.x - b.x) / d) * m;
            b.y += ((tgt.y - b.y) / d) * m;
            clampIn(b);
        }
        if (prey && dist(prey, b) < 0.8 && !(prey.job && prey.job.a === "hunt")) {
            const fightBack = perk(state, prey.s, "fox") ? 0.55 : perk(state, prey.s, "hedgehog") ? 0.5 : 0.25;
            if (rng() < fightBack) {
                state.beasts.splice(state.beasts.indexOf(b), 1);
                log(state, prey.s, SPECIES[state.picks[prey.s]].icon + " #" + prey.s + "# fought off a " + HUTS[b.kind].icon, "good");
            } else {
                kill(state, prey, "beast");
                if (!HUTS[b.kind].bites || rng() < 0.5) {
                    b.x += rng() * 6 - 3;
                    b.y += rng() * 6 - 3;
                    clampIn(b);
                }
            }
        }
    });
    // critters: workers go to their job (hunters chase beasts), then home; everyone else potters around home
    state.critters.slice().forEach((c) => {
        if (!state.critters.includes(c)) return;
        const home = state.homes[c.s];
        const speed = c.sick ? 0.5 : 1;
        if (c.job && c.job.a === "hunt") {
            const prey = state.beasts.slice().sort((a, b) => dist(a, c) - dist(b, c))[0];
            if (prey) {
                c.tx = prey.x;
                c.ty = prey.y;
                if (dist(prey, c) < 0.9) {
                    const win = (perk(state, c.s, "fox") ? 0.85 : 0.65) + (has(state, c.s, "sticks") ? 0.1 : 0);
                    if (rng() < win) {
                        state.beasts.splice(state.beasts.indexOf(prey), 1);
                        state.coins[c.s] += 2;
                        state.night[c.s].loot += 2;
                        log(state, c.s, "🏹 #" + c.s + "# hunted down a " + HUTS[prey.kind].icon + " (+2)", "good");
                    } else return kill(state, c, "beast");
                }
            } else {
                c.tx = home.x;
                c.ty = home.y;
            }
        } else if (c.job && !c.job.done && c.job.a !== "guard" && c.job.a !== "fortify" && c.job.a !== "nest") {
            c.tx = c.job.x;
            c.ty = c.job.y;
            if (dist(c, c.job) < 0.9) arrive(state, ctx, c.job, state.critters.filter((o) => c.job.crew.includes(o.id)));
        } else if (c.job && c.job.done && !atHome(state, c)) {
            c.tx = home.x;
            c.ty = home.y;
        } else if (dist({ x: c.tx, y: c.ty }, c) < 0.4 || rng() < 0.1) {
            const a = rng() * Math.PI * 2;
            const rr = rng() * (c.job ? 1.2 : HOME_R * 0.9);
            c.tx = home.x + Math.cos(a) * rr;
            c.ty = home.y + Math.sin(a) * rr;
        }
        const d = Math.hypot(c.tx - c.x, c.ty - c.y);
        if (d > 0.05) {
            const m = Math.min(d, speed);
            c.x += ((c.tx - c.x) / d) * m;
            c.y += ((c.ty - c.y) / d) * m;
            clampIn(c);
        }
    });
}
function startNight(state, ctx) {
    const rng = ctx.rng;
    // trips still on the way when the sun sets get finished anyway
    const jobs = new Set(state.critters.filter((c) => c.job && !c.job.done && c.job.crew.length && !["guard", "fortify", "nest", "hunt"].includes(c.job.a)).map((c) => c.job));
    jobs.forEach((job) => arrive(state, ctx, job, state.critters.filter((o) => job.crew.includes(o.id))));
    state.phase = "night";
    state.beasts = [];
    // wild huts raid the nearest home (a decoy sends them to the next one)
    state.huts.forEach((h) => {
        const order = alive(state).sort((a, b) => dist(state.homes[a], h) - dist(state.homes[b], h));
        const s = order.find((x) => !state.decoy[x]);
        if (s === undefined) return;
        const d = HUTS[h.kind];
        const guards = state.guards[s] + (has(state, s, "dog") ? 1 : 0);
        let loss = d.power + h.lvl - 1 + (rng() < 0.5 ? 1 : 0) - guards - state.walls[s] - (perk(state, s, "turtle") || perk(state, s, "hedgehog") ? 1 : 0);
        loss = Math.max(0, loss);
        const list = mine(state, s).sort(() => rng() - 0.5).slice(0, loss);
        list.forEach((c) => kill(state, c, "raid"));
        state.night[s].raidLost += list.length;
        if (list.length) log(state, s, d.icon + " The " + d.name + " raided #" + s + "#'s home: lost " + list.length, "bad");
        else log(state, s, "🛡️ #" + s + "# held off the " + d.name, "good");
    });
    alive(state).forEach((s) => {
        const nt = state.night[s];
        mine(state, s).filter((c) => c.sick).forEach((c) => {
            if (state.med[s]) c.sick = false;
            else if (rng() < 0.35) kill(state, c, "plague");
            else if (rng() < 0.5) c.sick = false;
        });
        // supper
        const pop = mine(state, s).length;
        const cold = state.event === "blizzard" && !has(state, s, "shelter");
        const need = Math.ceil(pop * (perk(state, s, "mouse") ? 0.5 : 1) * (cold ? 2 : 1));
        const ate = Math.min(need, state.stash[s]);
        state.stash[s] -= ate;
        nt.ate = ate;
        if (ate < need) {
            const starve = Math.ceil((need - ate) / (perk(state, s, "mouse") ? 1 : 2));
            mine(state, s).sort(() => rng() - 0.5).slice(0, starve).forEach((c) => kill(state, c, "hunger"));
            nt.starved = Math.min(starve, pop);
        }
        // babies: 1 per 3 critters (plus nests and nursery) if there's food to spare, 2 berries a baby
        const now = mine(state, s).length;
        if (state.event !== "blizzard" && now >= 2) {
            let births = Math.min(Math.floor(now / 3) + state.nest[s] + (has(state, s, "nursery") ? 1 : 0), Math.floor(state.stash[s] / 2));
            if (perk(state, s, "bunny")) births = Math.ceil(births * 1.5);
            births = Math.max(0, Math.min(births, CAP - now));
            for (let k = 0; k < births; k++) addCritter(state, s, state.homes[s], rng);
            state.stash[s] -= births * 2;
            nt.born = births;
        }
        state.coins[s] += 3;
    });
    alive(state).forEach((s) => {
        if (!mine(state, s).length) {
            state.out[s] = state.day;
            log(state, s, "💀 #" + s + "#'s " + SPECIES[state.picks[s]].name.toLowerCase() + " are gone", "bad");
        }
    });
    // the island regrows, and gets wilder every 3 days
    if (state.event !== "drought")
        state.bushes.forEach((b) => {
            const fert = alive(state).some((s) => has(state, s, "fertilizer") && dist(state.homes[s], b) < 5);
            b.food = Math.min(b.max, b.food + (fert ? 4 : 2));
        });
    if (state.day % 3 === 0) {
        state.huts.forEach((h) => {
            h.lvl++;
            h.max += 3;
            h.hp += 3;
        });
        addHut(state, rng);
    }
    state.guards = state.guards.map(() => 0);
    state.nest = state.nest.map(() => 0);
    state.med = state.med.map(() => false);
    state.extra = state.extra.map(() => false);
    state.decoy = state.decoy.map(() => false);
    state.hist.push(seats(state.n).map((s) => mine(state, s).length));
    // everyone still playing reads the night report, then taps Continue
    state.ready = state.ready.map((_, s) => state.out[s] !== null);
    state.deadline = ctx.now() + NIGHT_MS;
    const id = ++state.tick;
    ctx.later(NIGHT_MS, () => state.tick === id && state.phase === "night" && afterNight(state, ctx));
}
function afterNight(state, ctx) {
    state.tick++;
    if ((state.n > 1 && alive(state).length <= 1) || !alive(state).length || state.day >= DAYS) return end(state);
    startShop(state, ctx);
}
function startShop(state, ctx) {
    state.phase = "shop";
    state.ready = state.ready.map((_, s) => state.out[s] !== null);
    const id = ++state.tick;
    state.deadline = ctx.now() + SHOP_MS;
    ctx.later(SHOP_MS, () => state.tick === id && state.phase === "shop" && startVote(state, ctx));
}
function startVote(state, ctx) {
    state.phase = "vote";
    const pool = Object.keys(EVENTS);
    state.offers = [0, 1, 2].map(() => pool.splice(Math.floor(ctx.rng() * pool.length), 1)[0]);
    state.votes = state.votes.map(() => null);
    const id = ++state.tick;
    state.deadline = ctx.now() + VOTE_MS;
    ctx.later(VOTE_MS, () => state.tick === id && state.phase === "vote" && closeVote(state, ctx));
}
function closeVote(state, ctx) {
    const tally = state.offers.map((e) => state.votes.filter((v) => v === e).length);
    const top = Math.max(...tally);
    const best = state.offers.filter((_, i) => tally[i] === top);
    state.event = best[Math.floor(ctx.rng() * best.length)];
    state.lastVote = { offers: state.offers, tally, picked: state.event };
    startPlan(state, ctx);
}
function end(state) {
    state.phase = "done";
    state.deadline = null;
    state.tick++;
}

function pub(state) {
    const n = state.n;
    const showNight = ["night", "shop", "vote", "done"].includes(state.phase);
    return {
        phase: state.phase,
        day: state.day,
        days: DAYS,
        deadline: state.deadline,
        w: W,
        h: H,
        turn: state.turn,
        picks: state.picks,
        speciesDefs: SPECIES,
        actions: ACTIONS,
        items: ITEMS,
        events: EVENTS,
        hutDefs: HUTS,
        homes: state.homes,
        homeR: HOME_R,
        critters: state.critters.map((c) => [c.id, c.s, r1(c.x), r1(c.y), c.sick ? 1 : 0, c.job ? 1 : 0]),
        bushes: state.bushes,
        huts: state.huts,
        beasts: state.beasts.map((b) => [b.id, b.kind, r1(b.x), r1(b.y)]),
        fire: state.fire,
        strikes: state.strikes,
        poofs: state.poofs.slice(-12),
        event: state.event ? { id: state.event, ...EVENTS[state.event] } : null,
        pops: seats(n).map((s) => mine(state, s).length),
        stash: state.stash,
        walls: state.walls,
        owned: state.owned,
        out: state.out,
        night: showNight ? state.night : null,
        hist: state.hist,
        log: state.log.filter((l) => l.day >= state.day - 1).slice(-10),
        offers: state.phase === "vote" ? state.offers : null,
        votes: state.phase === "vote" ? state.offers.map((e) => state.votes.filter((v) => v === e).length) : null,
        lastVote: state.lastVote,
        ready: state.ready,
    };
}
// later out is better; still alive beats everyone, then by population
const rankValue = (state) => seats(state.n).map((s) => (state.out[s] === null ? 1000 : state.out[s] * 10) * 100 + mine(state, s).length);

module.exports = {
    id: "critters",
    name: "Critter Island",
    kind: "sim",
    quick: false,
    players: [1, 8],
    SPECIES,
    ACTIONS,
    ITEMS,
    EVENTS,
    HUTS,
    init({ rng, ctx, players = 2 }) {
        const n = players;
        const start = Math.floor(rng() * n);
        const arr = (v) => new Array(n).fill(v);
        const state = {
            n, ids: 0, seq: 0, t: 0, day: 0, phase: "pick", turn: null, deadline: null, tick: 0,
            pickOrder: seats(n).map((i) => (i + start) % n), pickPos: 0, picks: arr(null), homes: arr(null),
            critters: [], bushes: [], huts: [], beasts: [], strikes: [], poofs: [], fire: null, log: [],
            stash: arr(8), coins: arr(4), walls: arr(0), owned: seats(n).map(() => []),
            guards: arr(0), nest: arr(0), med: arr(false), extra: arr(false), decoy: arr(false), trapAt: arr(false),
            out: arr(null), plans: seats(n).map(() => []), ready: arr(false), votes: arr(null),
            night: seats(n).map(() => blankNight()), hist: [], event: null, offers: [], lastVote: null,
        };
        pickTurn(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.me = { coins: state.coins[seat], plan: state.plans[seat], slots: slots(state, seat), vote: state.votes[seat], trap: state.trapAt[seat], med: state.med[seat], extra: state.extra[seat], decoy: state.decoy[seat] };
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
            if (state.phase !== "home") return { error: "Not now." };
            const q = { x: Number(p.x), y: Number(p.y) };
            if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return { error: "Tap the island." };
            if (!onIsland(q.x, q.y) || ellipse(q.x, q.y) >= 0.85) return { error: "Too close to the water. Tap further in." };
            if (!homeOk(state, q, seat)) return { error: "Too close to another home." };
            state.homes[seat] = { x: r1(q.x), y: r1(q.y) };
            if (state.homes.every(Boolean)) startGame(state, ctx);
            return { ok: true };
        }
        if (p.act === "vote") {
            if (state.phase !== "vote") return { error: "No vote right now." };
            if (!state.offers.includes(p.e)) return { error: "Pick one of the three." };
            state.votes[seat] = p.e;
            if (state.votes.every((v) => v !== null)) closeVote(state, ctx);
            return { ok: true };
        }
        if (state.out[seat] !== null) return { error: "Your species is gone. You can still vote!" };
        if (p.act === "plan") {
            if (state.phase !== "plan") return { error: "Plan during the morning." };
            const list = Array.isArray(p.list) ? p.list.slice(0, slots(state, seat)) : [];
            const clean = [];
            for (const x of list) {
                const a = x && ACTIONS[x.a];
                if (!a) return { error: "Unknown action." };
                if (a.target === "bush" && !state.bushes.some((b) => b.id === x.t)) return { error: "Pick a berry bush for that." };
                if (a.target === "hut" && !state.huts.some((h) => h.id === x.t)) return { error: "Pick a hut to raid." };
                if (a.target === "spot") {
                    if (!x.t || !onIsland(Number(x.t.x), Number(x.t.y))) return { error: "Tap a spot on the island to plant." };
                    clean.push({ a: x.a, t: { x: r1(Number(x.t.x)), y: r1(Number(x.t.y)) } });
                } else clean.push({ a: x.a, t: a.target ? x.t : null });
            }
            state.plans[seat] = clean;
            return { ok: true };
        }
        if (p.act === "ready") {
            if (!["plan", "shop", "night"].includes(state.phase)) return { error: "Nothing to finish." };
            state.ready[seat] = p.on !== false;
            if (state.ready.every(Boolean)) {
                if (state.phase === "plan") startDay(state, ctx);
                else if (state.phase === "shop") startVote(state, ctx);
                else afterNight(state, ctx);
            }
            return { ok: true };
        }
        if (p.act === "buy") {
            if (state.phase !== "shop") return { error: "The shop opens after the night." };
            const it = ITEMS[p.k];
            if (!it) return { error: "Pick an item." };
            if (state.coins[seat] < it.cost) return { error: "You need " + it.cost + " coins." };
            const held = { trap: state.trapAt[seat], medicine: state.med[seat], action: state.extra[seat], decoy: state.decoy[seat] };
            if (it.once && (held[p.k] || has(state, seat, p.k))) return { error: "You already have that." };
            state.coins[seat] -= it.cost;
            if (p.k === "crate") state.stash[seat] += 6;
            else if (p.k === "honey") state.stash[seat] += 10;
            else if (p.k === "wall") state.walls[seat]++;
            else if (p.k === "trap") state.trapAt[seat] = true;
            else if (p.k === "medicine") {
                state.med[seat] = true;
                mine(state, seat).forEach((c) => (c.sick = false));
            } else if (p.k === "action") state.extra[seat] = true;
            else if (p.k === "decoy") state.decoy[seat] = true;
            else state.owned[seat].push(p.k);
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
