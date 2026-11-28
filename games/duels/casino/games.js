// Last Call Casino: the house games, each played by one person at a time against the house.
// "instant" games settle the moment you bet. The rest open a hand/board that you play out with more moves.
// A result is a return multiplier on the bet: 0 = lost it, 1 = money back, below 0 = you lose extra (wheel, slots).
const r2 = (x) => Math.floor(x * 100) / 100;
const pickW = (rng, weights) => {
    let x = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) < 0) return i;
    return weights.length - 1;
};
const die = (rng) => 1 + Math.floor(rng() * 6);

// ---------- cards: 0..51, rank = c % 13 (0 = 2 ... 12 = A), suit = floor(c / 13) ----------
const rank = (c) => c % 13;
const card = (rng) => Math.floor(rng() * 52);
const bjVal = (c) => (rank(c) === 12 ? 11 : rank(c) >= 8 ? 10 : rank(c) + 2);
function bjTotal(cards) {
    let t = cards.reduce((a, c) => a + bjVal(c), 0);
    let aces = cards.filter((c) => rank(c) === 12).length;
    while (t > 21 && aces-- > 0) t -= 10;
    return t;
}
const bacVal = (c) => (rank(c) >= 8 && rank(c) <= 11 ? 0 : rank(c) === 12 ? 1 : rank(c) + 2);
const bacTotal = (cards) => cards.reduce((a, c) => a + bacVal(c), 0) % 10;
function deal(rng, k) {
    const out = [];
    while (out.length < k) {
        const c = card(rng);
        if (!out.includes(c)) out.push(c);
    }
    return out;
}

// three card poker strength: [class, high cards...]
function poker3(cards) {
    const r = cards.map(rank).sort((a, b) => b - a);
    const flush = cards.every((c) => Math.floor(c / 13) === Math.floor(cards[0] / 13));
    const wheel = r[0] === 12 && r[1] === 1 && r[2] === 0;
    const straight = (r[0] - r[1] === 1 && r[1] - r[2] === 1) || wheel;
    const top = wheel ? 1 : r[0];
    if (straight && flush) return [5, top];
    if (r[0] === r[1] && r[1] === r[2]) return [4, r[0]];
    if (straight) return [3, top];
    if (flush) return [2, ...r];
    if (r[0] === r[1] || r[1] === r[2]) return [1, r[1], r[0] === r[1] ? r[2] : r[0]];
    return [0, ...r];
}
const cmp = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
    return 0;
};
const HAND3 = ["High card", "Pair", "Flush", "Straight", "Three of a kind", "Straight flush"];

// ---------- tables ----------
const RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const PLINKO = {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    med: [25, 8, 3, 1.8, 1.2, 0.7, 0.3, 0.7, 1.2, 1.8, 3, 8, 25],
    high: [140, 25, 7, 2, 0.6, 0.3, 0.2, 0.3, 0.6, 2, 7, 25, 140],
};
// money wheel: 40 slots, some take extra off you (−1× = lose your bet plus the same again)
const WHEEL = [0, 1.5, 0, 2, -1, 0, 0.5, 3, 0, 1.5, 0, 2, 0, -2, 0.5, 1.5, 0, 5, 0, 2, -1, 0, 1.5, 0, 0.5, 3, 0, 2, 0, -1, 0.5, 10, 0, 1.5, 0, 2, -2, 0.5, 3, -1];
// slots: 💀 bites. Three of a kind pays big, any two (not skulls) gives some back
const SLOTS = ["🍒", "🍋", "🔔", "🍀", "💎", "7️⃣", "💀"];
const SLOT_W = [6, 5, 4, 3, 2, 1, 3];
const SLOT_3 = [8, 15, 30, 60, 150, 400, -3];
function slotPay(r) {
    const skulls = r.filter((x) => x === 6).length;
    if (skulls === 3) return SLOT_3[6];
    if (skulls === 2) return -1;
    if (skulls === 1) return 0;
    if (r[0] === r[1] && r[1] === r[2]) return SLOT_3[r[0]];
    if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) return 1;
    return 0;
}
const HORSES = [
    { name: "Thunder Hooves", p: 0.3 }, { name: "Barley Pop", p: 0.23 }, { name: "Last Orders", p: 0.18 },
    { name: "Tipsy Gypsy", p: 0.13 }, { name: "Hangover Express", p: 0.1 }, { name: "Long Shot Larry", p: 0.06 },
];
const HORSE_PAY = HORSES.map((h) => r2(0.94 / h.p));
const MINES = [1, 3, 5, 10];
// Pack Rip: 5 cards a pack from the Barfly set. Each card is worth a share of the pack price; the Golden Last Call is ~1 in 5,000 cards
const PACK = [
    { tier: "Common", p: 0.7068, pay: 0.04, cards: [["Foam Pup", "🐶"], ["Bottle Imp", "👺"], ["Coaster Crab", "🦀"], ["Ice Cube Newt", "🦎"], ["Lime Sprite", "🍋"]] },
    { tier: "Uncommon", p: 0.22, pay: 0.12, cards: [["Hops Hare", "🐇"], ["Shaker Owl", "🦉"], ["Tap Toad", "🐸"]] },
    { tier: "Rare", p: 0.06, pay: 0.6, cards: [["Barrel Bear", "🐻"], ["Whiskey Wyrm", "🐉"]] },
    { tier: "Holo", p: 0.013, pay: 3, cards: [["Neon Phoenix", "🔥"], ["Midnight Kraken", "🐙"]] },
    { tier: "Golden", p: 0.0002, pay: 250, cards: [["Golden Last Call", "👑"]] },
];
// Loot Cases: one item per case. The ★ Golden Keg is 1 in 2,000
const CASE = [
    { tier: "Worn", p: 0.72, pay: 0.2, items: ["Rusty Bottle Opener", "Soggy Coaster", "Bent Straw"] },
    { tier: "Fine", p: 0.2, pay: 0.8, items: ["Foam Finger", "Pub Darts", "Lucky Lighter"] },
    { tier: "Rare", p: 0.055, pay: 3, items: ["Neon Beer Sign", "Brass Tap Handle"] },
    { tier: "Epic", p: 0.02, pay: 8, items: ["Crystal Decanter", "Velvet Jukebox"] },
    { tier: "Legend", p: 0.0045, pay: 25, items: ["Diamond Shaker"] },
    { tier: "Gold", p: 0.0005, pay: 300, items: ["★ Golden Keg"] },
];
// Scratch-offs: match three prizes on a 3x3 ticket. 1,000× is 1 in 10,000
const SCRATCH = [
    { pay: 1, p: 0.14 }, { pay: 2, p: 0.06 }, { pay: 5, p: 0.035 }, { pay: 25, p: 0.008 }, { pay: 100, p: 0.0015 }, { pay: 1000, p: 0.0001 },
];
const SCRATCH_SYMS = ["🍺", "🍷", "🥃", "🍸", "🍾", "💰"];
// Keno: 40 numbers, 10 drawn. KENO[picks][hits] = return. Every pick count returns ~90%; the top prize is capped at 10,000×
const KENO = {"1":{"1":3.6},"2":{"1":0.7,"2":11},"3":{"2":1.9,"3":53},"4":{"2":0.6,"3":7.4,"4":210},"5":{"3":1.5,"4":30,"5":1280},"6":{"3":0.5,"4":6.8,"5":140,"6":7280},"7":{"4":2.4,"5":46,"6":1350,"7":10000},"8":{"4":0.9,"5":12,"6":230,"7":8460,"8":10000},"9":{"5":4.4,"6":88,"7":2430,"8":10000,"9":10000},"10":{"5":2.1,"6":32,"7":630,"8":10000,"9":10000,"10":10000}};
// Video Poker, Jacks or Better (9/6)
const VP = [["Royal flush", 800], ["Straight flush", 50], ["Four of a kind", 25], ["Full house", 9], ["Flush", 6], ["Straight", 4], ["Three of a kind", 3], ["Two pair", 2], ["Jacks or better", 1]];
function vpHand(cards) {
    const r = cards.map(rank).sort((a, b) => a - b);
    const flush = cards.every((c) => Math.floor(c / 13) === Math.floor(cards[0] / 13));
    const uniq = [...new Set(r)];
    const wheel = uniq.length === 5 && r.join() === "0,1,2,3,12";
    const straight = uniq.length === 5 && (r[4] - r[0] === 4 || wheel);
    const counts = Object.values(r.reduce((a, x) => ((a[x] = (a[x] || 0) + 1), a), {})).sort((a, b) => b - a);
    if (straight && flush) return r[0] === 8 ? 0 : 1;
    if (counts[0] === 4) return 2;
    if (counts[0] === 3 && counts[1] === 2) return 3;
    if (flush) return 4;
    if (straight) return 5;
    if (counts[0] === 3) return 6;
    if (counts[0] === 2 && counts[1] === 2) return 7;
    if (counts[0] === 2 && r.some((x, i) => x >= 9 && r.indexOf(x) !== r.lastIndexOf(x))) return 8;
    return -1;
}
const TOWER = { easy: 4, med: 3, hard: 2 }; // doors per floor, one is a trap
const TOWER_FLOORS = 8;
const towerMult = (doors, floors) => (floors ? r2(0.97 * Math.pow(doors / (doors - 1), floors)) : 1);
const ROAD = { easy: 0.08, med: 0.16, hard: 0.3 }; // chance each lane gets you
const ROAD_LANES = 12;
const roadMult = (p, lanes) => (lanes ? r2(0.97 / Math.pow(1 - p, lanes)) : 1);
// Jackpot Slots: 🏆🏆🏆 wins the progressive pot (about 1 in 20,000 spins)
const JP_SYMS = ["🍒", "🔔", "⭐", "💎", "🏆"];
const JP_W = [40, 30, 18, 8.3, 3.7];
const JP_3 = [5, 10, 20, 50, 0];
function jpPay(reels) {
    if (reels[0] === reels[1] && reels[1] === reels[2]) return reels[0] === 4 ? { mult: 0, jackpot: true } : { mult: JP_3[reels[0]] };
    return { mult: reels.filter((x) => x === 0).length === 2 ? 0.5 : 0 };
}
const CRASH_K = 0.00008; // multiplier = e^(k * ms): 2× at ~8.7s, 10× at ~29s

const minesMult = (k, safe) => {
    let m = 0.98;
    for (let j = 0; j < safe; j++) m *= (25 - j) / (25 - k - j);
    return safe ? r2(m) : 1;
};
const hiloP = (r, dir) => (dir === "hi" ? (12 - r + 1) / 13 : (r + 1) / 13);
const hiloMult = (r, dir) => 0.99 / hiloP(r, dir);

// ---------- instant games: sel(raw) -> clean or null; run(rng, sel) -> { out, mult, text } ----------
const GAMES = {
    dice: {
        name: "Dice", icon: "📊", kind: "instant", blurb: "Roll 0–100. Bet over or under a number.",
        sel: (s) => (s && (s.dir === "over" || s.dir === "under") && Number.isInteger(s.at) && s.at >= 5 && s.at <= 95 ? { dir: s.dir, at: s.at } : null),
        pay: (s) => r2(0.98 / ((s.dir === "over" ? 100 - s.at : s.at) / 100)),
        run(rng, s) {
            const roll = Math.floor(rng() * 10001) / 100;
            const win = s.dir === "over" ? roll > s.at : roll < s.at;
            return { out: { roll }, mult: win ? GAMES.dice.pay(s) : 0, text: "Rolled " + roll.toFixed(2) };
        },
    },
    limbo: {
        name: "Limbo", icon: "🚀", kind: "instant", blurb: "Pick a target. If the rocket flies at least that high, you get it.",
        sel: (s) => (typeof s === "number" && s >= 1.1 && s <= 1000 ? r2(s) : null),
        run(rng, s) {
            const res = Math.min(10000, Math.max(1, r2(0.97 / (1 - rng()))));
            return { out: { res }, mult: res >= s ? s : 0, text: "Flew " + res + "×" };
        },
    },
    roulette: {
        name: "Roulette", icon: "🎡", kind: "instant", blurb: "Red/black, odd/even, a dozen, or one number for 36×.",
        sel: (s) => {
            if (!s || typeof s !== "object") return null;
            if (["red", "black", "odd", "even", "low", "high", "d1", "d2", "d3"].includes(s.t)) return { t: s.t };
            if (s.t === "n" && Number.isInteger(s.n) && s.n >= 0 && s.n <= 36) return { t: "n", n: s.n };
            return null;
        },
        shared: true,
        roll(rng) {
            const n = Math.floor(rng() * 37);
            return { n, red: RED.includes(n) };
        },
        pay({ n, red }, b) {
            const mult =
                b.t === "n" ? (b.n === n ? 36 : 0)
                : n === 0 ? 0
                : b.t === "red" ? (red ? 2 : 0) : b.t === "black" ? (!red ? 2 : 0)
                : b.t === "odd" ? (n % 2 ? 2 : 0) : b.t === "even" ? (n % 2 ? 0 : 2)
                : b.t === "low" ? (n <= 18 ? 2 : 0) : b.t === "high" ? (n >= 19 ? 2 : 0)
                : Math.ceil(n / 12) === +b.t[1] ? 3 : 0;
            return { mult, text: n + (n === 0 ? " green" : red ? " red" : " black") };
        },
    },
    baccarat: {
        name: "Baccarat", icon: "🃏", kind: "instant", blurb: "Player, Banker (1.95×) or Tie (9×). Closest to 9 wins.",
        sel: (s) => (["p", "b", "t"].includes(s) ? s : null),
        roll(rng) {
            const cards = deal(rng, 6);
            const p = [cards[0], cards[1]];
            const b = [cards[2], cards[3]];
            if (bacTotal(p) < 8 && bacTotal(b) < 8) {
                let third = null;
                if (bacTotal(p) <= 5) p.push((third = cards[4]));
                const bt = bacTotal(b);
                const tv = third === null ? null : bacVal(third);
                const draw = third === null ? bt <= 5 : bt <= 2 || (bt === 3 && tv !== 8) || (bt === 4 && tv >= 2 && tv <= 7) || (bt === 5 && tv >= 4 && tv <= 7) || (bt === 6 && (tv === 6 || tv === 7));
                if (draw) b.push(cards[5]);
            }
            const pt = bacTotal(p);
            const bt = bacTotal(b);
            return { p, b, pt, bt, win: pt > bt ? "p" : bt > pt ? "b" : "t" };
        },
        pay({ pt, bt, win }, x) {
            const mult = win === "t" ? (x === "t" ? 9 : 1) : x === win ? (x === "b" ? 1.95 : 2) : 0;
            return { mult, text: (win === "p" ? "Player" : win === "b" ? "Banker" : "Tie") + " " + pt + "–" + bt };
        },
    },
    plinko: {
        name: "Plinko", icon: "🔻", kind: "instant", blurb: "Drop a ball through 12 rows. High risk edges pay 140×.",
        sel: (s) => (PLINKO[s] ? s : null),
        run(rng, risk) {
            const path = Array.from({ length: 12 }, () => (rng() < 0.5 ? 0 : 1));
            const bin = path.reduce((a, b) => a + b, 0);
            return { out: { path, bin }, mult: PLINKO[risk][bin], text: PLINKO[risk][bin] + "×" };
        },
    },
    wheel: {
        name: "Money Wheel", icon: "🎯", kind: "instant", blurb: "Spin it. Up to 10×, but the red slots take extra off you.",
        sel: () => true,
        shared: true,
        roll: (rng) => ({ i: Math.floor(rng() * WHEEL.length) }),
        pay: ({ i }) => ({ mult: WHEEL[i], text: "Landed on " + WHEEL[i] + "×" }),
    },
    slots: {
        name: "Slots", icon: "🎰", kind: "instant", blurb: "Three of a kind up to 400×, a pair gets your bet back. Skulls take extra off you.",
        sel: () => true,
        run(rng) {
            const reels = [0, 1, 2].map(() => pickW(rng, SLOT_W));
            const m = slotPay(reels);
            return { out: { reels }, mult: m, text: reels.map((x) => SLOTS[x]).join(" ") };
        },
    },
    pack: {
        name: "Pack Rip", icon: "🎴", kind: "instant", blurb: "Rip a 5-card Barfly pack. Commons are dust; the Golden Last Call pays 250×.",
        sel: () => true,
        run(rng) {
            const cards = Array.from({ length: 5 }, () => {
                const t = pickW(rng, PACK.map((x) => x.p));
                const c = PACK[t].cards[Math.floor(rng() * PACK[t].cards.length)];
                return { t, name: c[0], art: c[1] };
            });
            // the best card goes last, like a real rip
            cards.sort((a, b) => a.t - b.t);
            const mult = r2(cards.reduce((a, c) => a + PACK[c.t].pay, 0));
            const top = cards[4];
            return { out: { cards }, mult, text: "Best pull: " + top.name + " (" + PACK[top.t].tier + ")" };
        },
    },
    cases: {
        name: "Loot Cases", icon: "🧰", kind: "instant", blurb: "Open a case, get one item. Most are junk. The ★ Golden Keg pays 300×.",
        sel: () => true,
        run(rng) {
            const t = pickW(rng, CASE.map((x) => x.p));
            const item = CASE[t].items[Math.floor(rng() * CASE[t].items.length)];
            // the strip it spins through, landing on slot 30
            const strip = Array.from({ length: 36 }, (_, i) => (i === 30 ? t : pickW(rng, CASE.map((x) => x.p))));
            return { out: { t, item, strip }, mult: CASE[t].pay, text: item + " (" + CASE[t].tier + ")" };
        },
    },
    scratch: {
        name: "Scratch-Offs", icon: "🎟️", kind: "instant", blurb: "Match three on the ticket to win that prize. Top prize 1,000×.",
        sel: () => true,
        run(rng) {
            const w = SCRATCH.map((x) => x.p);
            const lose = 1 - w.reduce((a, b) => a + b, 0);
            const k = pickW(rng, w.concat(lose));
            const win = k < SCRATCH.length ? k : null;
            const count = SCRATCH.map(() => 0);
            const grid = [];
            if (win !== null) {
                grid.push(win, win, win);
                count[win] = 3;
            }
            while (grid.length < 9) {
                const x = Math.floor(rng() * SCRATCH.length);
                if (count[x] < 2) {
                    count[x]++;
                    grid.push(x);
                }
            }
            for (let i = grid.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [grid[i], grid[j]] = [grid[j], grid[i]];
            }
            return { out: { grid, win }, mult: win === null ? 0 : SCRATCH[win].pay, text: win === null ? "No match" : "Matched three " + SCRATCH_SYMS[win] + " for " + SCRATCH[win].pay + "×" };
        },
    },
    keno: {
        name: "Keno", icon: "🎱", kind: "instant", blurb: "Pick 1–10 numbers out of 40. Ten get drawn. Hit all 10 for 10,000×.",
        sel: (s) => (Array.isArray(s) && s.length >= 1 && s.length <= 10 && new Set(s).size === s.length && s.every((n) => Number.isInteger(n) && n >= 1 && n <= 40) ? s.slice().sort((a, b) => a - b) : null),
        run(rng, picks) {
            const drawn = [];
            while (drawn.length < 10) {
                const n = 1 + Math.floor(rng() * 40);
                if (!drawn.includes(n)) drawn.push(n);
            }
            const hits = picks.filter((n) => drawn.includes(n)).length;
            const mult = KENO[picks.length][hits] || 0;
            return { out: { drawn, picks, hits }, mult, text: hits + " of " + picks.length + " hit" };
        },
    },
    jackpot: {
        name: "Jackpot Slots", icon: "🏆", kind: "instant", blurb: "Small wins, and 🏆🏆🏆 takes the whole progressive pot. Every losing spin feeds it.",
        sel: () => true,
        run(rng) {
            const reels = [0, 1, 2].map(() => pickW(rng, JP_W));
            const p = jpPay(reels);
            return { out: { reels, jackpot: !!p.jackpot }, mult: p.mult, text: reels.map((x) => JP_SYMS[x]).join(" ") };
        },
    },
    horses: {
        name: "Horse Race", icon: "🏇", kind: "instant", blurb: "Six horses. Back a favourite or a long shot.",
        sel: (s) => (Number.isInteger(s) && s >= 0 && s < HORSES.length ? s : null),
        shared: true,
        roll(rng) {
            const win = pickW(rng, HORSES.map((x) => x.p));
            const rest = HORSES.map((_, i) => i).filter((i) => i !== win);
            const order = [win];
            while (rest.length) order.push(rest.splice(pickW(rng, rest.map((i) => HORSES[i].p)), 1)[0]);
            const track = HORSES.map((_, i) => {
                const end = 1 - order.indexOf(i) * 0.05;
                let x = 0;
                return Array.from({ length: 8 }, (_, j) => (j === 7 ? end : (x = Math.min(end - 0.03, x + (end / 8) * (0.5 + rng())))));
            }).map((t) => t.map(r2));
            return { win, order, track };
        },
        pay: ({ win }, h) => ({ mult: win === h ? HORSE_PAY[h] : 0, text: HORSES[win].name + " won" }),
    },
    craps: {
        name: "Craps", icon: "🎲", kind: "instant", blurb: "Pass: 7 or 11 wins, then hit your point before a 7. Field: one roll.",
        sel: (s) => (["pass", "dont", "field"].includes(s) ? s : null),
        shared: true,
        roll(rng) {
            const roll = () => [die(rng), die(rng)];
            const rolls = [roll()];
            const sum = (r) => r[0] + r[1];
            const first = sum(rolls[0]);
            let point = null;
            let passWins = null;
            if (first === 7 || first === 11) passWins = true;
            else if (first === 2 || first === 3 || first === 12) passWins = false;
            else {
                point = first;
                while (passWins === null && rolls.length < 40) {
                    const r = roll();
                    rolls.push(r);
                    if (sum(r) === point) passWins = true;
                    else if (sum(r) === 7) passWins = false;
                }
            }
            return { rolls, point, first, passWins };
        },
        pay({ rolls, point, first, passWins }, bet) {
            if (bet === "field") return { mult: first === 2 || first === 12 ? 3 : [3, 4, 9, 10, 11].includes(first) ? 2 : 0, text: "First roll " + first };
            const mult = bet === "pass" ? (passWins ? 2 : 0) : first === 12 && rolls.length === 1 ? 1 : passWins ? 0 : 2;
            return { mult, text: point ? "Point " + point + (passWins ? ", hit it" : ", sevened out") : "Rolled " + first };
        },
    },
    // ---------- played out: start(rng, sel) -> session; act(s, m, rng) -> session (sets done + mult) ----------
    crash: {
        name: "Crash", icon: "📈", kind: "live", shared: true, blurb: "Everyone rides the same rocket. Cash out before it crashes.",
        sel: (s) => (!s ? 0 : typeof s === "number" && s >= 1.1 && s <= 100 ? r2(s) : null),
        point: (rng) => (rng() < 0.01 ? 1 : Math.min(200, Math.max(1, r2(0.99 / (1 - rng()))))),
    },
    mines: {
        name: "Mines", icon: "💣", kind: "hand", blurb: "Flip safe tiles to grow your multiplier. Hit a mine and it's gone.",
        sel: (s) => (MINES.includes(s) ? s : null),
        start(rng, k) {
            const mines = [];
            while (mines.length < k) {
                const i = Math.floor(rng() * 25);
                if (!mines.includes(i)) mines.push(i);
            }
            return { k, mines, open: [], mult: 1 };
        },
        act(h, m) {
            if (m.m === "cash") return { ...h, done: true, mult: minesMult(h.k, h.open.length) };
            if (m.m !== "tile" || !Number.isInteger(m.i) || m.i < 0 || m.i > 24 || h.open.includes(m.i)) return null;
            const open = h.open.concat(m.i);
            if (h.mines.includes(m.i)) return { ...h, open, done: true, boom: m.i, mult: 0 };
            const left = 25 - h.k - open.length;
            return { ...h, open, mult: minesMult(h.k, open.length), done: left === 0 };
        },
    },
    hilo: {
        name: "Hi-Lo", icon: "🔼", kind: "hand", blurb: "Higher or lower than the card? Each right guess grows the pot.",
        sel: () => true,
        // the next card is drawn ahead (X-Ray Specs can peek at it)
        start(rng) {
            return { cards: [card(rng)], next: card(rng), mult: 1 };
        },
        act(h, m, rng) {
            if (m.m === "cash") return { ...h, done: true, mult: h.cards.length > 1 ? r2(h.mult) : 1 };
            if (m.m !== "hi" && m.m !== "lo") return null;
            const cur = rank(h.cards[h.cards.length - 1]);
            if ((m.m === "hi" && cur === 12) || (m.m === "lo" && cur === 0)) return null;
            const nr = rank(h.next);
            const ok = m.m === "hi" ? nr >= cur : nr <= cur;
            const cards = h.cards.concat(h.next);
            const next = card(rng);
            if (!ok) return { ...h, cards, next, done: true, mult: 0 };
            return { ...h, cards, next, mult: h.mult * hiloMult(cur, m.m), done: cards.length >= 12 };
        },
    },
    blackjack: {
        name: "Blackjack", icon: "♠️", kind: "hand", blurb: "Beat the dealer without going over 21. Blackjack pays 2.5×.",
        sel: () => true,
        start(rng) {
            const h = { me: [card(rng), card(rng)], dealer: [card(rng), card(rng)], dbl: false, mult: 0 };
            if (bjTotal(h.me) === 21) return GAMES.blackjack.finish(h, rng);
            return h;
        },
        finish(h, rng) {
            const me = bjTotal(h.me);
            const natural = me === 21 && h.me.length === 2;
            const dealer = h.dealer.slice();
            if (me <= 21 && !natural) while (bjTotal(dealer) < 17) dealer.push(card(rng));
            const d = bjTotal(dealer);
            const dNatural = d === 21 && dealer.length === 2;
            let mult = 0;
            if (me > 21) mult = 0;
            else if (natural) mult = dNatural ? 1 : 2.5;
            else if (d > 21 || me > d) mult = 2;
            else if (me === d) mult = 1;
            return { ...h, dealer, done: true, mult };
        },
        act(h, m, rng) {
            if (m.m === "hit") {
                const me = h.me.concat(card(rng));
                const t = bjTotal(me);
                return t >= 21 ? GAMES.blackjack.finish({ ...h, me }, rng) : { ...h, me };
            }
            if (m.m === "stand") return GAMES.blackjack.finish(h, rng);
            if (m.m === "double" && h.me.length === 2) return GAMES.blackjack.finish({ ...h, dbl: true, me: h.me.concat(card(rng)) }, rng);
            return null;
        },
    },
    vpoker: {
        name: "Video Poker", icon: "🎮", kind: "hand", blurb: "Jacks or Better. Hold what you like, draw once. Royal flush pays 800×.",
        sel: () => true,
        // the replacement cards are dealt up front and kept hidden
        start(rng) {
            const c = deal(rng, 10);
            return { me: c.slice(0, 5), spare: c.slice(5), mult: 0 };
        },
        act(h, m) {
            if (m.m !== "draw" || !Array.isArray(m.hold) || !m.hold.every((i) => Number.isInteger(i) && i >= 0 && i < 5)) return null;
            let k = 0;
            const me = h.me.map((c, i) => (m.hold.includes(i) ? c : h.spare[k++]));
            const v = vpHand(me);
            return { ...h, me, held: m.hold, done: true, hand: v >= 0 ? VP[v][0] : "Nothing", mult: v >= 0 ? VP[v][1] : 0 };
        },
    },
    tower: {
        name: "Tower Climb", icon: "🗼", kind: "hand", blurb: "Pick a door on each floor. One is a trap. Climb higher, win more, cash out any time.",
        sel: (s) => (TOWER[s] ? s : null),
        start(rng, d) {
            return { d, doors: TOWER[d], path: [], mult: 1 };
        },
        act(h, m, rng) {
            if (m.m === "cash") return { ...h, done: true, mult: towerMult(h.doors, h.path.length) };
            if (m.m !== "door" || !Number.isInteger(m.i) || m.i < 0 || m.i >= h.doors) return null;
            const trap = Math.floor(rng() * h.doors);
            const path = h.path.concat({ pick: m.i, trap });
            if (m.i === trap) return { ...h, path, done: true, boom: true, mult: 0 };
            const mult = towerMult(h.doors, path.length);
            return { ...h, path, mult, done: path.length >= TOWER_FLOORS };
        },
    },
    road: {
        name: "Road Crossing", icon: "🐔", kind: "hand", blurb: "Step across lane by lane. Each lane is worth more. Get hit and it's gone.",
        sel: (s) => (ROAD[s] ? s : null),
        start(rng, d) {
            return { d, p: ROAD[d], lanes: 0, mult: 1 };
        },
        act(h, m, rng) {
            if (m.m === "cash") return { ...h, done: true, mult: roadMult(h.p, h.lanes) };
            if (m.m !== "step") return null;
            if (rng() < h.p) return { ...h, lanes: h.lanes + 1, done: true, splat: true, mult: 0 };
            const lanes = h.lanes + 1;
            return { ...h, lanes, mult: roadMult(h.p, lanes), done: lanes >= ROAD_LANES };
        },
    },
    poker: {
        name: "Three Card Poker", icon: "♦️", kind: "hand", blurb: "Three cards vs the dealer. Raise to play, or fold. Dealer needs a queen high.",
        sel: () => true,
        start(rng) {
            const c = deal(rng, 6);
            return { me: c.slice(0, 3), dealer: c.slice(3), mult: 0 };
        },
        act(h, m) {
            if (m.m === "fold") return { ...h, done: true, folded: true, mult: 0 };
            if (m.m !== "play") return null;
            const me = poker3(h.me);
            const d = poker3(h.dealer);
            const qualifies = cmp(d, [0, 10, -1, -1]) >= 0;
            const c = cmp(me, d);
            // ante + raise (raise = same as ante): stake is 2× bet. Return as a multiple of the ante.
            // ante bonus on a straight or better, paid whatever the dealer has
            const bonus = me[0] === 5 ? 5 : me[0] === 4 ? 4 : me[0] === 3 ? 1 : 0;
            const mult = (!qualifies ? 3 : c > 0 ? 4 : c === 0 ? 2 : 0) + bonus;
            return { ...h, done: true, played: true, qualifies, mine: HAND3[me[0]], theirs: HAND3[d[0]], bonus, mult };
        },
    },
};

// shared tables can also be played in one go (used by the payout checks)
for (const g of Object.values(GAMES))
    if (g.roll)
        g.run = (rng, sel) => {
            const out = g.roll(rng);
            return { out, ...g.pay(out, sel) };
        };

module.exports = {
    GAMES, r2, rank, bjTotal, bacTotal, poker3, cmp, HAND3, RED, PLINKO, WHEEL, SLOTS, SLOT_W, SLOT_3, slotPay,
    HORSES, HORSE_PAY, MINES, CRASH_K, minesMult, hiloMult, PACK, CASE, SCRATCH, SCRATCH_SYMS,
    KENO, VP, vpHand, TOWER, TOWER_FLOORS, towerMult, ROAD, ROAD_LANES, roadMult, JP_SYMS, JP_W, JP_3, jpPay,
};
