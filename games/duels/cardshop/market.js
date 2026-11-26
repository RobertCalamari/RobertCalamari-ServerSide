// Totally Real Vending Simulator: card catalog, pack opening, prices, news and the overnight market move.
const D = require("./sets");
const { TYPES, RARITIES, FOIL, SETS } = D;

// flat catalog: card index -> { s: set index, r: rarity index, t: type index, c: card }
const CARDS = [];
const BY = SETS.map(() => RARITIES.map(() => []));
SETS.forEach((set, s) =>
    set.cards.forEach((c) => {
        const r = Math.max(0, RARITIES.findIndex((x) => x.id === c.rarity));
        const t = Math.max(0, TYPES.findIndex((x) => x.id === c.type));
        BY[s][r].push(CARDS.length);
        CARDS.push({ s, r, t, c });
    })
);
const TOP = RARITIES.length - 1;

// a held card is a key: card index * 2 + foil
const idxOf = (k) => k >> 1;
const isFoil = (k) => (k & 1) === 1;
const foilMult = (r) => (r === TOP ? FOIL.secretMult || FOIL.mult : FOIL.mult);
const r2 = (x) => Math.round(x * 100) / 100;
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const gauss = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

function shuffle(rng, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// pack recipe, set by the game's config: priceScale, packSize, hitSlot (last card is Rare or better), hitShare, rarShape
let C = { priceScale: 1, packSize: 5, hitSlot: false, hitShare: null, rarShape: null };
const configure = (cfg) => (C = cfg);
const rarVal = (r) => (C.rarShape ? C.rarShape[r] : RARITIES[r].value);
const basePack = (s) => SETS[s].packPrice * (C.priceScale || 1);
const ALL = RARITIES.map((r) => r.share);
const FILL = RARITIES.map((r, i) => (i <= 1 ? r.share : 0));
const slotShares = (j) => (C.hitSlot ? (j === C.packSize - 1 ? C.hitShare : FILL) : ALL);

function roll(rng, shares) {
    let x = rng() * shares.reduce((t, v) => t + v, 0);
    for (let r = 0; r < shares.length; r++) {
        x -= shares[r];
        if (x < 0) return r;
    }
    return 0;
}

function cardOf(rng, s, r) {
    for (let k = r; k >= 0; k--) if (BY[s][k].length) return pick(rng, BY[s][k]);
    for (let k = r + 1; k <= TOP; k++) if (BY[s][k].length) return pick(rng, BY[s][k]);
    return 0;
}

function openPack(rng, s, size) {
    return Array.from({ length: size }, (_, j) => cardOf(rng, s, roll(rng, slotShares(j))) * 2 + (rng() < FOIL.chance ? 1 : 0)).sort((a, b) => CARDS[idxOf(a)].r - CARDS[idxOf(b)].r);
}

const value = (state, k) => r2(state.price[idxOf(k)] * (isFoil(k) ? foilMult(CARDS[idxOf(k)].r) : 1));

// expected value of a pack of set s; card value per rarity from val(r) (avg price of that rarity in the set)
function packValue(s, size, val) {
    let ev = 0;
    for (let j = 0; j < size; j++) {
        const sh = slotShares(j);
        const tot = sh.reduce((t, v, r) => t + (BY[s][r].length ? v : 0), 0);
        sh.forEach((v, r) => BY[s][r].length && (ev += (v / tot) * val(r) * (1 + FOIL.chance * (foilMult(r) - 1))));
    }
    return ev;
}

// value = pack price x rarity value x set demand x popularity, scaled per set so a pack's expected value is
// cfg.packEV x its price (x demand^cfg.demandTilt, so hyped sets rip a little better)
function initMarket(state, rng, cfg, size) {
    configure(cfg);
    const raw = (s) => packValue(s, size, (r) => basePack(s) * rarVal(r) * SETS[s].demand);
    const scale = SETS.map((set, s) => (cfg.packEV * basePack(s) * Math.pow(set.demand, cfg.demandTilt)) / raw(s));
    state.pop = CARDS.map((c) => r2(Math.exp(gauss(rng) * (c.r >= 3 ? 0.3 : 0.2) - (c.r >= 3 ? 0.045 : 0.02))));
    state.base = CARDS.map((c, i) => Math.max(0.05, r2(basePack(c.s) * rarVal(c.r) * SETS[c.s].demand * state.pop[i] * scale[c.s])));
    state.price = state.base.slice();
    state.lvl = SETS.map(() => 1);
    state.trend = SETS.map(() => 0);
    state.next = SETS.map(() => gauss(rng) * 0.04);
    state.flow = CARDS.map(() => 0);
    state.pack = SETS.map((s, p) => r2(basePack(p)));
    state.packHist = SETS.map((s, p) => [r2(basePack(p))]);
    state.hist = state.price.map((p) => [p]);
}

// pack expected value at current prices
function packEV(state, s, size) {
    return packValue(s, size, (r) => BY[s][r].reduce((t, i) => t + state.price[i], 0) / BY[s][r].length);
}

// news: text plus price effects (applied in the overnight move before that day) and floor effects (that day)
function makeNews(rng, day, cardPool, active) {
    const s = pick(rng, active);
    const set = SETS[s].name;
    const v = (lo, hi) => r2(lo + rng() * (hi - lo));
    const n = { text: "", set: {}, type: {}, card: {}, rarMin: 99, rarV: 0, kid: -1, traffic: 1, whale: 0, hot: -1, reprint: -1 };
    const roll = day === 1 ? rng() * 0.45 : rng();
    if (roll < 0.17) {
        n.text = "A huge streamer is ripping " + set + " live tonight. Demand is up!";
        n.set[s] = v(0.15, 0.3);
        n.hot = s;
    } else if (roll < 0.3) {
        const t = Math.floor(rng() * TYPES.length);
        n.text = "Tournament meta: " + TYPES[t].name + " decks are everywhere. " + TYPES[t].icon + " cards spike!";
        n.type[t] = v(0.2, 0.4);
    } else if (roll < 0.4) {
        n.text = "A new cartoon has kids hooked on " + set + ". Bring the cheap stuff!";
        n.set[s] = v(0.05, 0.12);
        n.kid = s;
        n.hot = s;
    } else if (roll < 0.48) {
        n.text = "Big convention weekend. The floor is packed!";
        n.traffic = 1.35;
    } else if (roll < 0.56) {
        n.text = "A famous collector is in town with deep pockets.";
        n.whale = 2;
    } else if (roll < 0.66) {
        const i = pick(rng, cardPool);
        n.text = CARDS[i].c.name + " (" + SETS[CARDS[i].s].name + ") went viral overnight!";
        n.card[i] = v(0.6, 1.1);
    } else if (roll < 0.74) {
        n.text = "Grading craze: everyone wants shiny cards. Holo and up rise.";
        n.rarMin = 3;
        n.rarV = v(0.12, 0.2);
    } else if (roll < 0.84) {
        n.text = "Reprint announced for " + set + ". Prices dip, extra boxes arrive.";
        n.set[s] = -v(0.12, 0.22);
        n.reprint = s;
    } else if (roll < 0.91) {
        n.text = "Counterfeit scare hits " + set + ". Buyers get nervous.";
        n.set[s] = -v(0.15, 0.25);
    } else if (roll < 0.96) {
        n.text = "Rainy day. Fewer shoppers out, but they came to spend.";
        n.traffic = 0.75;
    } else {
        n.text = "A quiet morning at the card show.";
    }
    return n;
}

const newsFor = (n, i) => {
    const c = CARDS[i];
    return (n.set[c.s] || 0) + (n.type[c.t] || 0) + (n.card[i] || 0) + (c.r >= n.rarMin ? n.rarV : 0) + (n.kid === c.s && c.r <= 1 ? 0.3 : 0);
};

// tonight's move for one set, as the price gun sees it
const forecast = (state, n, s) => Math.round((Math.exp(state.next[s] + (n ? n.set[s] || 0 : 0)) - 1) * 100);

function overnight(state, rng, n, ripped) {
    state.trend = state.next.slice();
    SETS.forEach((set, s) => {
        state.lvl[s] *= Math.exp(state.trend[s] + (n.set[s] || 0));
        state.next[s] = state.trend[s] * 0.45 + gauss(rng) * 0.045 + (set.packPrice >= 30 ? 0.006 : 0.002);
    });
    state.price = state.price.map((p, i) => {
        const c = CARDS[i];
        const supply = -Math.min(0.08, (ripped[c.s] || 0) * 0.004);
        let x = p * Math.exp(state.trend[c.s] + newsFor(n, i) + gauss(rng) * 0.05 + state.flow[i] + supply);
        x += 0.1 * (state.base[i] * state.lvl[c.s] - x);
        return Math.max(0.05, r2(x));
    });
    state.flow = state.flow.map((f) => f * 0.3);
    state.hist.forEach((h, i) => h.push(state.price[i]));
}

module.exports = { configure, basePack, D, CARDS, BY, TOP, idxOf, isFoil, foilMult, r2, pick, gauss, shuffle, openPack, value, initMarket, packEV, makeNews, newsFor, forecast, overnight };
