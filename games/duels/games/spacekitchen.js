// Space Kitchen: co-op. Orders land on the TV; each phone runs one or more kitchen stations (fridge, pantry, chopping
// board, stove, plating, serving hatch) and food moves between them by passing it to a teammate. Three shifts that get
// busier; the team scores for every order served (faster = bigger tip) and loses a little for every order that walks
// out. Stars at the end of each shift. Stations rotate between shifts; with fewer cooks, each runs more of them.
const { seats } = require("../rank");

const KINDS = {
    noodles: { src: "fridge", chop: false, cook: true },
    star: { src: "fridge", chop: true, cook: false },
    comet: { src: "fridge", chop: true, cook: true },
    cheese: { src: "fridge", chop: true, cook: false },
    rice: { src: "pantry", chop: false, cook: true },
    sauce: { src: "pantry", chop: false, cook: false },
    bun: { src: "pantry", chop: false, cook: false },
};
const RECIPES = [
    ["Moon Melt", ["bun", "cheese"]],
    ["Star Salad", ["star", "cheese"]],
    ["Glow Rice", ["rice", "sauce"]],
    ["Nebula Noodles", ["noodles", "sauce", "star"]],
    ["Comet Burger", ["bun", "comet", "cheese"]],
    ["Orbit Bowl", ["rice", "comet", "sauce"]],
    ["Galaxy Ramen", ["noodles", "comet", "star"]],
    ["Big Bang Platter", ["rice", "noodles", "comet", "cheese"]],
    ["Supernova Stack", ["bun", "comet", "cheese", "sauce"]],
];
const SHIFTS = [
    { ms: 80000, max: 2, pool: [0, 1, 2, 3], patience: 60000, gap: 15000, stars: [40, 90, 140] },
    { ms: 80000, max: 3, pool: [0, 1, 2, 3, 4, 5], patience: 55000, gap: 12000, stars: [50, 110, 170] },
    { ms: 80000, max: 4, pool: [3, 4, 5, 6, 7, 8], patience: 55000, gap: 10000, stars: [60, 130, 200] },
];
const ASSIGN = {
    1: [["fridge", "pantry", "chop", "stove", "plate", "serve"]],
    2: [["fridge", "pantry", "stove"], ["chop", "plate", "serve"]],
    3: [["fridge", "pantry", "serve"], ["chop", "plate"], ["stove"]],
    4: [["fridge", "pantry"], ["chop"], ["stove"], ["plate", "serve"]],
    5: [["fridge", "pantry"], ["chop"], ["stove"], ["plate"], ["serve"]],
    6: [["fridge"], ["pantry"], ["chop"], ["stove"], ["plate"], ["serve"]],
};
const BRIEF_MS = 7000;
const BREAK_MS = 9000;
const COOK_MS = 5000;
const BURN_MS = 9000;
const TAPS = 3;
const BENCH = 5;
const PLATES = 2;
const PARTS = 4;
const BURNERS = 2;
const PART_PTS = 10;
const TIP = 10;
const MISS = 10;

const ready = (it) => it.k !== "plate" && !it.burnt && (!KINDS[it.k].chop || it.chopped) && (!KINDS[it.k].cook || it.cooked);
const owns = (state, seat, st) => state.jobs[seat].includes(st);
const sameParts = (a, b) => a.length === b.length && a.slice().sort().join() === b.slice().sort().join();

function log(state, text, seat, kind) {
    state.events.push({ n: ++state.eventNo, text, seat, kind });
    if (state.events.length > 6) state.events.shift();
}

function startBrief(state, ctx) {
    state.shift++;
    state.phase = "brief";
    const groups = ASSIGN[state.n];
    state.jobs = seats(state.n).map((s) => groups[(s + state.shift) % state.n]);
    state.bench = seats(state.n).map(() => []);
    state.burners = new Array(BURNERS).fill(null);
    state.orders = [];
    state.shiftScore = 0;
    state.nextAt = ctx.now() + BRIEF_MS;
    const sh = state.shift;
    ctx.later(BRIEF_MS, (now) => {
        if (state.shift !== sh || state.phase !== "brief") return;
        state.phase = "cook";
        state.endAt = now + SHIFTS[sh].ms;
        state.nextAt = null;
        spawn(state, ctx);
        ctx.later(SHIFTS[sh].ms, () => {
            if (state.shift === sh && state.phase === "cook") endShift(state, ctx);
        });
    });
}

function spawn(state, ctx) {
    const cfg = SHIFTS[state.shift];
    const sh = state.shift;
    if (state.orders.length < cfg.max && ctx.now() < state.endAt - 8000) {
        const last = state.orders.length ? state.orders[state.orders.length - 1].r : -1;
        let r = cfg.pool[Math.floor(ctx.rng() * cfg.pool.length)];
        if (r === last) r = cfg.pool[(cfg.pool.indexOf(r) + 1) % cfg.pool.length];
        const id = ++state.ids;
        const now = ctx.now();
        state.orders.push({ id, r, at: now, until: now + cfg.patience + RECIPES[r][1].length * 4000 });
        ctx.later(state.orders[state.orders.length - 1].until - now, () => {
            const i = state.orders.findIndex((o) => o.id === id);
            if (i < 0 || state.phase !== "cook" || state.shift !== sh) return;
            state.orders.splice(i, 1);
            state.missed++;
            state.score = Math.max(0, state.score - MISS);
            state.shiftScore = Math.max(0, state.shiftScore - MISS);
            log(state, RECIPES[r][0] + " walked out", null, "miss");
            soon(state, ctx, 2500);
        });
    }
    const t = ++state.spawnTick;
    ctx.later(state.orders.length ? cfg.gap : 1500, () => {
        if (state.spawnTick === t && state.phase === "cook" && state.shift === sh) spawn(state, ctx);
    });
}

function soon(state, ctx, ms) {
    const t = ++state.spawnTick;
    const sh = state.shift;
    ctx.later(ms, () => {
        if (state.spawnTick === t && state.phase === "cook" && state.shift === sh) spawn(state, ctx);
    });
}

function endShift(state, ctx) {
    const cfg = SHIFTS[state.shift];
    state.stars.push(cfg.stars.filter((x) => state.shiftScore >= x).length);
    state.orders = [];
    state.burners = state.burners.map(() => null);
    state.phase = "break";
    state.endAt = null;
    state.nextAt = ctx.now() + BREAK_MS;
    const sh = state.shift;
    ctx.later(BREAK_MS, () => {
        if (state.shift !== sh || state.phase !== "break") return;
        if (state.shift + 1 >= SHIFTS.length) state.phase = "done";
        else startBrief(state, ctx);
    });
}

function find(state, seat, id) {
    return state.bench[seat].findIndex((it) => it.id === id);
}

function pub(state) {
    return {
        phase: state.phase,
        shift: state.shift,
        shifts: SHIFTS.length,
        endAt: state.endAt,
        nextAt: state.nextAt,
        orders: state.orders.map((o) => ({ id: o.id, name: RECIPES[o.r][0], parts: RECIPES[o.r][1], at: o.at, until: o.until })),
        jobs: state.jobs,
        bench: state.bench,
        burners: state.burners.map((b) => b && { item: b.item, at: b.at }),
        cookMs: COOK_MS,
        burnMs: BURN_MS,
        taps: TAPS,
        score: state.score,
        shiftScore: state.shiftScore,
        goals: SHIFTS[Math.max(0, state.shift)].stars,
        stars: state.stars,
        served: state.served,
        missed: state.missed,
        events: state.events,
    };
}

module.exports = {
    id: "spacekitchen",
    name: "Space Kitchen",
    kind: "live",
    quick: false,
    players: [2, 6],
    init({ ctx, players = 2 }) {
        const state = { n: players, shift: -1, phase: "brief", jobs: [], bench: [], burners: [], orders: [], ids: 0, spawnTick: 0, endAt: null, nextAt: null, score: 0, shiftScore: 0, stars: [], served: 0, missed: 0, passes: 0, events: [], eventNo: 0 };
        startBrief(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.me = seat;
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object" || typeof p.act !== "string") return { error: "Bad move." };
        if (state.phase !== "cook") return { error: state.phase === "brief" ? "The shift hasn't started yet." : "The kitchen's closed." };
        const bench = state.bench[seat];
        const full = (b) => b.length >= BENCH;
        const now = ctx.now();
        const item = typeof p.id === "number" ? bench[find(state, seat, p.id)] : null;
        if (p.act === "take") {
            const k = KINDS[p.k] && p.k;
            if (!k) return { error: "No such ingredient." };
            if (!owns(state, seat, KINDS[k].src)) return { error: "That's not your station." };
            if (full(bench)) return { error: "Your counter's full. Pass or bin something." };
            bench.push({ id: ++state.ids, k, chopped: false, cooked: false, burnt: false, taps: 0 });
            return { ok: true };
        }
        if (p.act === "plate") {
            if (!owns(state, seat, "plate")) return { error: "You're not on plating." };
            if (bench.filter((it) => it.k === "plate").length >= PLATES) return { error: "Two plates at a time." };
            if (full(bench)) return { error: "Your counter's full." };
            bench.push({ id: ++state.ids, k: "plate", parts: [] });
            return { ok: true };
        }
        if (p.act === "lift") {
            if (!owns(state, seat, "stove")) return { error: "You're not on the stove." };
            const b = state.burners[p.b];
            if (!Number.isInteger(p.b) || !b) return { error: "That burner's empty." };
            if (full(bench)) return { error: "Your counter's full." };
            const t = now - b.at;
            if (t >= COOK_MS + BURN_MS) b.item.burnt = true;
            else if (t >= COOK_MS) b.item.cooked = true;
            bench.push(b.item);
            state.burners[p.b] = null;
            return { ok: true };
        }
        if (!item) return { error: "That isn't on your counter." };
        const K = KINDS[item.k];
        if (p.act === "bin") {
            bench.splice(bench.indexOf(item), 1);
            return { ok: true };
        }
        if (p.act === "pass") {
            const to = p.to;
            if (!Number.isInteger(to) || to < 0 || to >= state.n) return { error: "Pass to who?" };
            if (to === seat) return { error: "That's you." };
            if (full(state.bench[to])) return { error: "Their counter's full." };
            bench.splice(bench.indexOf(item), 1);
            state.bench[to].push(item);
            state.passes++;
            return { ok: true };
        }
        if (p.act === "chop") {
            if (!owns(state, seat, "chop")) return { error: "You're not on the chopping board." };
            if (!K || !K.chop) return { error: "That doesn't need chopping." };
            if (item.chopped) return { error: "Already chopped." };
            if (item.cooked || item.burnt) return { error: "Too late to chop that." };
            item.taps++;
            if (item.taps >= TAPS) item.chopped = true;
            return { ok: true };
        }
        if (p.act === "cook") {
            if (!owns(state, seat, "stove")) return { error: "You're not on the stove." };
            if (!K || !K.cook) return { error: "That doesn't go on the stove." };
            if (item.cooked || item.burnt) return { error: "Already cooked." };
            if (K.chop && !item.chopped) return { error: "Chop it first." };
            const b = state.burners.findIndex((x) => !x);
            if (b < 0) return { error: "Both burners are busy." };
            bench.splice(bench.indexOf(item), 1);
            state.burners[b] = { item, at: now };
            const id = item.id;
            ctx.later(COOK_MS, () => {
                const x = state.burners[b];
                if (x && x.item.id === id) x.item.cooked = true;
            });
            ctx.later(COOK_MS + BURN_MS, () => {
                const x = state.burners[b];
                if (x && x.item.id === id) {
                    x.item.burnt = true;
                    log(state, "Something's burning!", seat, "burn");
                }
            });
            return { ok: true };
        }
        if (p.act === "add") {
            if (!owns(state, seat, "plate")) return { error: "You're not on plating." };
            if (item.k === "plate") return { error: "Plates don't stack." };
            const plate = bench.find((it) => it.k === "plate" && (p.plate === undefined || it.id === p.plate) && it.parts.length < PARTS);
            if (!plate) return { error: "Get a plate out first." };
            if (!ready(item)) return { error: item.burnt ? "That's burnt. Bin it." : K.chop && !item.chopped ? "Chop it first." : "Cook it first." };
            bench.splice(bench.indexOf(item), 1);
            plate.parts.push(item.k);
            return { ok: true };
        }
        if (p.act === "serve") {
            if (!owns(state, seat, "serve")) return { error: "You're not on the serving hatch." };
            if (item.k !== "plate" || !item.parts.length) return { error: "Serve a plate of food." };
            const o = state.orders.filter((x) => sameParts(RECIPES[x.r][1], item.parts)).sort((a, b) => a.until - b.until)[0];
            if (!o) return { error: "Nobody ordered that. Check the tickets." };
            const pts = item.parts.length * PART_PTS + Math.round((TIP * Math.max(0, o.until - now)) / (o.until - o.at));
            state.orders.splice(state.orders.indexOf(o), 1);
            bench.splice(bench.indexOf(item), 1);
            state.score += pts;
            state.shiftScore += pts;
            state.served++;
            log(state, RECIPES[o.r][0] + " served +" + pts, seat, "served");
            soon(state, ctx, 2000);
            return { ok: true };
        }
        return { error: "Bad move." };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const stars = state.stars.reduce((a, b) => a + b, 0);
        return { winner: null, places: new Array(state.n).fill(1), text: "Team kitchen: " + stars + "/" + SHIFTS.length * 3 + " stars · " + state.score + " points · " + state.served + " served, " + state.missed + " walked out" };
    },
};
