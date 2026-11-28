// Bots for Game Night. A bot sits in a seat like a person and plays from what its seat can see (view), plus a
// little help from the real state where a person would "just know" (a quiz answer some of the time, a board it
// can read). bot(view, k) -> null | { move, wait } | { moves: [payloads, tried in order], wait }
// k = { game, state, seat, n, rng, now, level: "easy" | "hard", mem (this bot's notebook for the match) }
const r = (k, a, b) => a + k.rng() * (b - a);
const pick = (k, list) => list[Math.floor(k.rng() * list.length)];
const think = (k, easy, hard) => (k.level === "hard" ? r(k, hard[0], hard[1]) : r(k, easy[0], easy[1]));
const clone = (x) => JSON.parse(JSON.stringify(x));
const quiet = { rng: Math.random, now: () => Date.now(), later: () => { }, host: false };

// ---------- open-board turn games: try every move with the game's own rules, then play it out ----------
function tryMove(g, st, seat, p) {
    const s = clone(st);
    let res;
    try {
        res = g.move(s, seat, p, quiet);
    } catch (e) {
        return null;
    }
    return res && !res.error ? s : null;
}
const turnOf = (st) => (typeof st.turn === "number" ? st.turn : null);
function legal(g, st, seat, cands) {
    const out = [];
    for (const p of cands(st, seat)) {
        const s = tryMove(g, st, seat, p);
        if (s) out.push({ p, s });
    }
    return out;
}
const outcome = (g, st, seat) => {
    const res = g.result(st);
    if (!res) return null;
    return res.winner === seat ? 1 : res.winner === null ? 0.5 : 0;
};
function playout(g, st, seat, cands, turn, cap) {
    let s = st;
    for (let d = 0; d < cap; d++) {
        const o = outcome(g, s, seat);
        if (o !== null) return o;
        const who = turn(s);
        if (who === null) return 0.5;
        const ms = cands(s, who).sort(() => Math.random() - 0.5);
        let next = null;
        for (const p of ms) {
            next = tryMove(g, s, who, p);
            if (next) break;
        }
        if (!next) return 0.5;
        s = next;
    }
    return 0.5;
}
// easy: take a win if it sees one, otherwise anything. hard: random playouts per move inside a time budget
function search(g, k, cands, opt = {}) {
    const turn = opt.turn || turnOf;
    if (turn(k.state) !== k.seat) return null;
    const moves = legal(g, k.state, k.seat, cands);
    if (!moves.length) return null;
    const win = moves.find((m) => outcome(g, m.s, k.seat) === 1);
    if (win && (k.level === "hard" || k.rng() < 0.7)) return { move: win.p, wait: think(k, [700, 1600], [500, 1100]) };
    if (k.level !== "hard" || moves.length === 1) return { move: pick(k, moves).p, wait: think(k, [700, 1800], [500, 1000]) };
    const score = moves.map(() => 0);
    const runs = moves.map(() => 0);
    const until = Date.now() + (opt.budget || 220);
    for (let i = 0; Date.now() < until; i = (i + 1) % moves.length) {
        score[i] += playout(g, moves[i].s, k.seat, cands, turn, opt.cap || 80);
        runs[i]++;
    }
    let best = 0;
    moves.forEach((_, i) => runs[i] && score[i] / runs[i] > score[best] / (runs[best] || 1) && (best = i));
    return { move: moves[best].p, wait: r(k, 500, 1000) };
}
const range = (n) => Array.from({ length: n }, (_, i) => i);
const G = (id) => require("./games/" + id);

// ---------- chess: minimax on material, 2 plies on hard ----------
const VAL = { P: 1, N: 3, B: 3.2, R: 5, Q: 9, K: 0 };
function chessEval(b, c) {
    let v = 0;
    b.forEach((x, i) => {
        if (!x) return;
        const centre = 3.5 - Math.max(Math.abs((i & 7) - 3.5), Math.abs((i >> 3) - 3.5));
        const w = VAL[x[1]] + (x[1] === "N" || x[1] === "P" ? centre * 0.05 : 0);
        v += x[0] === c ? w : -w;
    });
    return v;
}
function chessBot(view, k) {
    const g = G("chess");
    const { legal: lg, sqName, colorOf } = g._ai;
    const s = k.state;
    const c = colorOf(s, k.seat);
    if (s.over || s.turn !== c) return null;
    const ms = lg(s, c);
    if (!ms.length) return null;
    const toP = (m) => ({ from: sqName(m.from), to: sqName(m.to), promo: m.promo || undefined });
    const after = (st, m, who) => tryMove(g, st, who, toP(m));
    if (k.level !== "hard") {
        const caps = ms.filter((m) => s.board[m.to]);
        const m = caps.length && k.rng() < 0.6 ? pick(k, caps) : pick(k, ms);
        return { move: toP(m), wait: r(k, 900, 2200) };
    }
    const them = 1 - k.seat;
    let best = null;
    let bestV = -Infinity;
    const until = Date.now() + 700;
    for (const m of ms.sort(() => k.rng() - 0.5)) {
        const s1 = after(s, m, k.seat);
        if (!s1) continue;
        const o = outcome(g, s1, k.seat);
        let v;
        if (o !== null) v = o === 1 ? 1000 : o === 0.5 ? 0 : -1000;
        else {
            // their best reply
            const replies = lg(s1, s1.turn);
            v = Infinity;
            for (const m2 of replies) {
                const s2 = after(s1, m2, them);
                if (!s2) continue;
                const o2 = outcome(g, s2, k.seat);
                const v2 = o2 !== null ? (o2 === 1 ? 1000 : o2 === 0.5 ? 0 : -1000) : chessEval(s2.board, c);
                if (v2 < v) v = v2;
                if (v <= bestV) break;
            }
            if (v === Infinity) v = chessEval(s1.board, c);
        }
        if (v > bestV + 1e-9 || (Math.abs(v - bestV) < 1e-9 && k.rng() < 0.3)) {
            bestV = v;
            best = m;
        }
        if (Date.now() > until) break;
    }
    return { move: toP(best || pick(k, ms)), wait: r(k, 600, 1200) };
}

// ---------- quiz-style: answer right some of the time ----------
function quiz(view, k, q, phaseKey = "phase") {
    if (view[phaseKey] !== "ask" || view.mine !== null && view.mine !== undefined || k.mem.done === view.index) return null;
    if (!q) return null;
    k.mem.done = view.index;
    const good = k.rng() < (k.level === "hard" ? 0.85 : 0.55);
    const wrong = [0, 1, 2, 3].filter((c) => c !== q.answer);
    return { move: { q: view.index, choice: good ? q.answer : pick(k, wrong) }, wait: think(k, [2500, 6000], [1200, 3500]) };
}

// ---------- cards ----------
const { rank, suit } = require("./deck");
const low = (cards) => cards.slice().sort((a, b) => rank(a) + (suit(a) === "S" ? 20 : 0) - rank(b) - (suit(b) === "S" ? 20 : 0));
function spadesBot(v, k) {
    if (v.turn !== k.seat) return null;
    const g = G("spades");
    if (v.phase === "bid") {
        const n = g.autoBid(v.myHand) + (k.level === "hard" ? 0 : Math.round(r(k, -1.4, 1.4)));
        return { move: { act: "bid", n: Math.max(1, Math.min(13, n)) }, wait: r(k, 1500, 3500) };
    }
    if (v.phase !== "play" || !v.legal.length) return null;
    const L = low(v.legal);
    const wait = think(k, [900, 2200], [700, 1500]);
    if (k.level !== "hard" && k.rng() < 0.3) return { move: { act: "play", c: pick(k, L) }, wait };
    if (!v.trick.length) {
        const ace = L.find((c) => rank(c) === 14 && suit(c) !== "S");
        return { move: { act: "play", c: ace || L[0] }, wait };
    }
    const mate = (k.seat + 2) % 4;
    const leader = g.winnerOf(v.trick);
    const wins = L.filter((c) => g.winnerOf([...v.trick, { seat: k.seat, c }]) === k.seat);
    // partner has it (and nobody after me can easily beat it): stay low
    if (leader === mate && (v.trick.length === 3 || rank(v.trick.find((t) => t.seat === mate).c) >= 13)) return { move: { act: "play", c: L[0] }, wait };
    if (wins.length) return { move: { act: "play", c: v.trick.length === 3 ? wins[0] : wins[wins.length - 1] }, wait };
    return { move: { act: "play", c: L[0] }, wait };
}

const GUESS = {
    fruit: ["apple", "banana", "orange"], color: ["blue", "red"], "pizza topping": ["pepperoni"], "breakfast food": ["pancakes", "eggs", "bacon"],
    "farm animal": ["cow", "pig"], sport: ["soccer", "basketball", "football"], superhero: ["batman", "superman", "spiderman"], vegetable: ["carrot", "broccoli"],
    "ice cream flavor": ["vanilla", "chocolate"], "fast food chain": ["mcdonalds"], planet: ["mars", "earth"], "candy bar": ["snickers"], holiday: ["christmas"],
    "sea creature": ["shark", "octopus"], cocktail: ["margarita", "mojito"], "type of cheese": ["cheddar"], "musical instrument": ["guitar", "piano"],
    "kitchen appliance": ["microwave", "toaster"], "type of shoe": ["sneakers"], "social media app": ["instagram", "tiktok"], "famous wizard": ["gandalf", "harry potter"],
    "body part": ["arm", "hand"], bird: ["eagle", "pigeon"], "pasta shape": ["spaghetti", "penne"], soda: ["coke", "pepsi"], "us state": ["california", "texas"],
    "country in europe": ["france", "germany", "italy"], "car brand": ["toyota", "ford"], "phone brand": ["apple", "samsung"], dinosaur: ["t rex"],
    "day of the week": ["friday", "monday"], month: ["december", "july"], "number between 1 and 10": ["7"], "type of liquor": ["vodka", "tequila"],
    "type of dog": ["golden retriever", "labrador"], dessert: ["cake", "ice cream"], flower: ["rose"], bug: ["ant", "spider"], reptile: ["snake", "lizard"],
    gemstone: ["diamond", "ruby"], metal: ["gold", "iron"], pokemon: ["pikachu"], "mario character": ["luigi", "mario"], "star wars character": ["darth vader", "yoda"],
    "harry potter character": ["harry", "hermione"], "marvel hero": ["iron man", "spiderman"], "disney movie": ["frozen", "the lion king"], "pixar movie": ["toy story"],
    "type of tree": ["oak", "pine"], nut: ["peanut", "almond"], sauce: ["ketchup"], spice: ["pepper", "cinnamon"], cereal: ["cheerios", "frosted flakes"],
    "type of bread": ["sourdough", "white"], sandwich: ["blt", "grilled cheese"], language: ["spanish", "english"], "zodiac sign": ["leo", "scorpio"], "greek god": ["zeus"],
    "board game": ["monopoly", "chess"], "card game": ["poker", "uno"], "drinking game": ["beer pong"], "beer brand": ["bud light", "coors"], wine: ["merlot", "pinot noir"],
    "something green": ["grass"], "something red": ["apple", "fire truck"], "something blue": ["sky", "ocean"], "something cold": ["ice"], "something round": ["ball"],
    "something that's yellow": ["banana", "sun"], "something in a fridge": ["milk"], "something at the beach": ["sand"], "something with wheels": ["car"],
};
const guessFor = (prompt) => {
    const t = (prompt || "").toLowerCase().replace(/^name (a |an |)/, "");
    return GUESS[t] || GUESS[t.replace(/^type of /, "")] || null;
};
function groupmindBot(v, k) {
    if (v.phase !== "ask" || v.mine !== null || k.mem.round === v.round) return null;
    // wait a bit, then go with the crowd (hard follows the crowd more), a common answer, or a wild guess
    if (k.mem.wait !== v.round) {
        k.mem.wait = v.round;
        k.mem.at = k.now() + think(k, [5000, 14000], [3500, 9000]);
    }
    if (k.now() < k.mem.at && !v.in.every((x, s) => x || s === k.seat)) return null;
    k.mem.round = v.round;
    const mod = G("groupmind");
    const have = k.state.answers.filter(Boolean);
    const groups = {};
    have.forEach((a) => (groups[mod.key(a)] = (groups[mod.key(a)] || []).concat(a)));
    const crowd = Object.values(groups).sort((a, b) => b.length - a.length);
    const known = guessFor(v.prompt);
    let text;
    if (crowd.length && k.rng() < (k.level === "hard" ? 0.6 : 0.3)) text = (k.level === "hard" ? crowd[0] : pick(k, crowd))[0];
    else if (known) text = k.level === "hard" ? known[0] : pick(k, known);
    else text = crowd.length ? pick(k, crowd)[0] : pick(k, ["pizza", "dog", "blue", "beer", "taco"]);
    return { move: { act: "answer", text }, wait: r(k, 200, 600) };
}

function pricetagBot(v, k) {
    if (v.phase !== "shop" || v.locked[k.seat] || !v.shelf) return null;
    if (k.mem.round !== v.round) {
        k.mem.round = v.round;
        const items = v.shelf.map((x) => x.price);
        let best = [];
        let bestT = 0;
        const tries = k.level === "hard" ? 1 << items.length : 40;
        for (let t = 0; t < tries; t++) {
            const m = k.level === "hard" ? t : Math.floor(k.rng() * (1 << items.length));
            let sum = 0;
            const set = [];
            items.forEach((p, i) => m & (1 << i) && (sum += p) && set.push(i));
            if (sum <= v.budget && sum > bestT) {
                bestT = sum;
                best = set;
            }
        }
        k.mem.plan = best;
    }
    const cart = v.cart;
    const off = cart.find((i) => !k.mem.plan.includes(i));
    if (off !== undefined) return { move: { act: "toggle", i: off }, wait: r(k, 400, 900) };
    const on = k.mem.plan.find((i) => !cart.includes(i));
    if (on !== undefined) return { move: { act: "toggle", i: on }, wait: think(k, [1800, 4200], [900, 2200]) };
    return { move: { act: "lock" }, wait: r(k, 600, 1500) };
}

function pokerpickBot(v, k) {
    if (v.phase !== "pick" || v.myPick || v.over) return null;
    const g = G("pokerpick");
    const grid = k.state.grid;
    const pairs = [];
    for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) pairs.push([a, b]);
    // easy only remembers a handful of the cards
    const pool = k.level === "hard" ? pairs : pairs.sort(() => k.rng() - 0.5).slice(0, 8);
    let best = pool[0];
    let bestS = null;
    for (const p of pool) {
        const s = g.evaluate([grid[p[0]], grid[p[1]], ...k.state.community]).score;
        if (!bestS || g.compare(s, bestS) > 0) {
            best = p;
            bestS = s;
        }
    }
    return { move: { pick: best }, wait: think(k, [4000, 12000], [2500, 7000]) };
}

// every sum of up to 4 tiles: tiles grouped into numbers, then any bracketing of + − × ÷ between them
function digitSums(n) {
    const out = [];
    const perms = (left, cur) => {
        if (cur.length) out.push(cur);
        left.forEach((x) => perms(left.filter((y) => y !== x), cur.concat(x)));
    };
    perms(range(n), []);
    const OPS = ["+", "-", "*", "/"];
    const trees = (units) => {
        if (units.length === 1) return [units[0].map((i) => "d" + i)];
        const res = [];
        for (let s = 1; s < units.length; s++) {
            for (const L of trees(units.slice(0, s))) for (const R of trees(units.slice(s))) for (const op of OPS) res.push(["(", ...L, op, ...R, ")"]);
        }
        return res;
    };
    const sums = [];
    for (const p of out) {
        // split p into consecutive groups
        for (let cut = 0; cut < 1 << (p.length - 1); cut++) {
            const units = [[p[0]]];
            for (let i = 1; i < p.length; i++) cut & (1 << (i - 1)) ? units.push([p[i]]) : units[units.length - 1].push(p[i]);
            if (units.length > 4) continue;
            trees(units).forEach((t) => sums.push(t));
        }
    }
    return sums;
}
let SUMS = null;
function digittargetBot(v, k) {
    if (v.phase !== "ask" || !v.digits || v.mine.exact || v.mine.out) return null;
    const g = G("digittarget");
    if (k.mem.q !== v.index) {
        k.mem.q = v.index;
        SUMS = SUMS || digitSums(4);
        const pool = k.level === "hard" ? SUMS : SUMS.filter(() => k.rng() < 0.08);
        const found = [];
        for (const t of pool) {
            const res = g.evaluate(t, v.digits);
            if (res.error) continue;
            const gap = Math.abs(res.v[0] / res.v[1] - v.target);
            found.push({ t, gap, len: t.length });
        }
        found.sort((a, b) => a.gap - b.gap || a.len - b.len);
        // a first rough try, then the best it finds
        const rough = found.find((f) => f.gap > 0 && f.gap <= 15) || found[Math.min(found.length - 1, 20)];
        k.mem.plan = [rough, found[0]].filter(Boolean);
        k.mem.at = k.now() + think(k, [12000, 30000], [6000, 18000]);
    }
    if (!k.mem.plan.length || k.now() < k.mem.at) return null;
    const f = k.mem.plan.shift();
    k.mem.at = k.now() + think(k, [8000, 18000], [4000, 10000]);
    return { move: { q: v.index, tokens: f.t }, wait: r(k, 300, 800) };
}

// backgammon: hard tries every way to play the roll and keeps the position it likes best
function bgScore(st, s) {
    const me = s === 0 ? 1 : -1;
    const dist = (who, i) => (who === 0 ? i + 1 : 24 - i);
    let v = 0;
    let mine = 0;
    let theirs = 0;
    st.board.forEach((n, i) => {
        if (n * me > 0) mine += Math.abs(n) * dist(s, i);
        if (n * me < 0) theirs += Math.abs(n) * dist(1 - s, i);
        if (n === me) {
            // a lone checker an enemy could land on
            const danger = st.board.some((m, j) => m * me < 0 && (s === 0 ? j > i : j < i) && Math.abs(j - i) <= 12);
            v -= danger ? 4 + (s === 0 ? 24 - i : i) / 8 : 1;
        }
        if (n * me >= 2) v += (s === 0 ? i <= 6 : i >= 17) ? 3 : 1.5;
    });
    mine += st.bar[s] * 25;
    theirs += st.bar[1 - s] * 25;
    return v + (theirs - mine) * 0.6 + st.bar[1 - s] * 6 + st.off[s] * 4;
}
function backgammonBot(v, k) {
    if (!v.myTurn) return null;
    const g = G("backgammon");
    const wait = think(k, [900, 1800], [600, 1200]);
    if (v.canEnd) return { move: { act: "end" }, wait };
    if (k.level !== "hard") {
        const m = pick(k, v.legal);
        return m ? { move: { act: "move", from: m.from, to: m.to, die: m.die }, wait } : null;
    }
    const id = k.state.turnId + ":" + k.state.done.length;
    if (k.mem.id !== id || !k.mem.plan || !k.mem.plan.length) {
        let layer = [{ st: k.state, seq: [] }];
        let done = [];
        const until = Date.now() + 500;
        while (layer.length && Date.now() < until) {
            const nextLayer = [];
            const seen = new Set();
            for (const x of layer) {
                const ms = g.legal(x.st);
                if (!ms.length) {
                    done.push(x);
                    continue;
                }
                for (const m of ms) {
                    const s2 = tryMove(g, x.st, k.seat, { act: "move", from: m.from, to: m.to, die: m.die });
                    if (!s2) continue;
                    const key = s2.board.join() + s2.bar.join() + s2.off.join();
                    if (seen.has(key)) continue;
                    seen.add(key);
                    nextLayer.push({ st: s2, seq: x.seq.concat(m) });
                }
            }
            layer = nextLayer;
        }
        done = done.concat(layer).filter((x) => x.seq.length);
        if (!done.length) return null;
        done.forEach((x) => (x.v = bgScore(x.st, k.seat)));
        done.sort((a, b) => b.v - a.v);
        k.mem.plan = done[0].seq.slice();
    }
    k.mem.id = k.state.turnId + ":" + (k.state.done.length + 1);
    const m = k.mem.plan.shift();
    return { move: { act: "move", from: m.from, to: m.to, die: m.die }, wait };
}

// rummy: dig for cards it can meld, meld everything it can, throw away the loneliest high card
function rummyBot(v, k) {
    if (v.turn !== k.seat) return null;
    const g = G("rummy500");
    const hand = v.myHand;
    const wait = think(k, [1000, 2200], [700, 1500]);
    if (v.phase === "draw") {
        const d = v.discard;
        const depth = k.level === "hard" ? Math.min(d.length, 4) : 1;
        for (let back = 1; back <= depth; back++) {
            const i = d.length - back;
            const cards = d.slice(i);
            if (g.findMeld(cards[0], hand.concat(cards), v.melds) && (k.level === "hard" || k.rng() < 0.5)) return { move: { act: "take", index: i }, wait };
        }
        return { move: { act: "draw" }, wait };
    }
    if (v.phase !== "meld") return null;
    const playOf = (c) => {
        const f = g.findMeld(c, hand, v.melds);
        if (!f) return null;
        return f.layoff !== undefined ? { act: "layoff", meld: f.layoff, cards: [c] } : { act: "meld", cards: f.cards };
    };
    if (v.must) {
        const p = playOf(v.must);
        return p ? { move: p, wait } : { move: { act: "undo" }, wait };
    }
    // keep one card back to discard; easy sometimes sits on melds
    if (hand.length > 1 && (k.level === "hard" || k.rng() < 0.7)) {
        for (const c of hand) {
            const p = playOf(c);
            if (p && p.cards.length < hand.length) return { move: p, wait: r(k, 700, 1300) };
        }
    }
    const near = (c) => hand.filter((x) => x !== c && (x[0] === c[0] || (suit(x) === suit(c) && Math.abs(rank(x) - rank(c)) <= 2))).length;
    const feeds = (c) => v.melds.some((m) => g.typeOf(m.cards.map((x) => x.c).concat(c)) === m.type);
    const order = hand.slice().sort((a, b) => near(a) - near(b) || (k.level === "hard" ? feeds(a) - feeds(b) : 0) || g.value(b) - g.value(a));
    return { move: { act: "discard", card: k.level === "hard" ? order[0] : pick(k, order.slice(0, 3)) }, wait };
}

// battle lines: only sees what a player sees, guesses hidden enemies from what's left of their army
function battlelinesBot(v, k) {
    if (v.winner !== null && v.winner !== undefined) return null;
    if (v.phase === "setup") {
        if (v.ready[k.seat]) return null;
        const king = v.units.find((u) => u.t === "K");
        if (k.level === "hard" && king && king.c !== 0 && king.c !== 5 && !k.mem.swapped) {
            k.mem.swapped = true;
            return { move: { act: "swap", a: king.c, b: k.rng() < 0.5 ? 0 : 5 }, wait: r(k, 1200, 2500) };
        }
        return { move: { act: "ready" }, wait: r(k, 1500, 4000) };
    }
    if (!v.myTurn || !v.moves.length) return null;
    const g = G("battlelines");
    const unit = (p) => v.units.find((u) => u.r === p[0] && u.c === p[1]);
    const enemy = v.units.filter((u) => u.seat !== k.seat);
    const left = ["R", "P", "S", "A", "K"].filter((t) => !v.lost.some((x) => x.seat !== k.seat && x.t === t) && !enemy.some((u) => u.t === t));
    const hidden = enemy.filter((u) => !u.t).length || 1;
    const fwd = k.seat === 0 ? -1 : 1;
    const odds = (a, d) => {
        const types = d.t ? [d.t] : left.length ? left : ["R", "P", "S"];
        let s = 0;
        types.forEach((t) => {
            const o = g.fight(a, t);
            s += (o === "win" ? (t === "K" ? 400 : 60) : o === "lose" ? (a === "K" ? -400 : -55) : -3) * (d.t ? 1 : 1 / types.length);
        });
        return s;
    };
    const threatened = (u, r0, c0) => enemy.some((e) => Math.abs(e.r - r0) + Math.abs(e.c - c0) === 1 && (!e.t || g.fight(e.t, u.t) === "win") && !(e.r === r0 && e.c === c0));
    const score = (m) => {
        const u = unit(m.from);
        const d = unit(m.to);
        if (m.k === "shoot") return d.t === "K" ? 1000 : 120;
        if (m.k === "attack") return odds(u.t, d) + (hidden < 3 ? 5 : 0);
        let s = (m.to[0] - m.from[0]) * fwd * (u.t === "K" ? -6 : 5);
        if (k.level === "hard" && threatened(u, m.to[0], m.to[1])) s -= u.t === "K" ? 300 : 25;
        if (k.level === "hard" && u.t === "A") s -= 4;
        return s + k.rng() * 3;
    };
    let ms = v.moves.slice();
    if (k.level !== "hard" && k.rng() < 0.35) ms = [pick(k, ms)];
    ms.sort((a, b) => score(b) - score(a));
    const m = ms[0];
    return { move: { act: m.k === "shoot" ? "shoot" : "move", from: m.from, to: m.to }, wait: think(k, [1000, 2400], [800, 1600]) };
}

function spitBot(v, k) {
    const s = k.seat;
    if (v.phase === "slap") {
        if (k.mem.slap === v.round) return null;
        k.mem.slap = v.round;
        const [a, b] = v.centre.map((c) => c.n);
        return { move: { act: "slap", pile: a <= b ? 0 : 1 }, wait: think(k, [900, 2200], [380, 800]) };
    }
    if (v.phase !== "play") return null;
    if (v.stuck) return v.votes[s] ? null : { move: { act: "spit" }, wait: r(k, 500, 1400) };
    const fits = G("spit").fits;
    const mine = v.layout[s];
    const moves = [];
    mine.forEach((p, from) => p.n && v.centre.forEach((c, to) => c.n && fits(p.top, c.top) && moves.push({ act: "play", from, to, card: p.top, saw: c.top })));
    const speed = think(k, [1100, 2000], [550, 950]);
    if (moves.length) return { moves, wait: speed };
    const empty = mine.findIndex((p) => !p.n);
    const deep = mine.findIndex((p) => p.n > 1);
    if (empty >= 0 && deep >= 0) return { move: { act: "move", from: deep, to: empty, card: mine[deep].top }, wait: speed };
    return null;
}

// ---------- word games ----------
function wordladderBot(v, k) {
    if (v.phase !== "ask" || v.mine.done || v.mine.out) return null;
    const path = k.state.rounds[k.state.index].path;
    const chain = v.mine.chain;
    if (k.mem.q !== v.index) {
        k.mem.q = v.index;
        k.mem.at = k.now() + think(k, [8000, 16000], [4000, 9000]);
    }
    if (k.now() < k.mem.at) return null;
    k.mem.at = k.now() + think(k, [7000, 15000], [3500, 8000]);
    // off the shortest path (it shouldn't be): back up
    const i = path.indexOf(chain[chain.length - 1]);
    if (i < 0 || chain.length - 1 !== i) return { move: { q: v.index, act: "undo" }, wait: 300 };
    return { move: { q: v.index, w: path[i + 1] }, wait: r(k, 200, 600) };
}
function wordmineBot(v, k) {
    if (v.phase !== "play" || v.me.quit) return null;
    const all = k.state.all;
    if (!k.mem.list) {
        const sorted = all.slice().sort((a, b) => (k.level === "hard" ? b.length - a.length : a.length - b.length) || k.rng() - 0.5);
        k.mem.list = sorted.slice(0, Math.ceil(sorted.length * (k.level === "hard" ? 0.6 : 0.3)));
        k.mem.at = k.now() + r(k, 3000, 6000);
    }
    if (k.now() < k.mem.at) return null;
    const w = k.mem.list.shift();
    if (!w) return v.timed ? null : { move: { act: "stop" }, wait: 800 };
    k.mem.at = k.now() + think(k, [5000, 9500], [2500, 5500]);
    return { move: { w }, wait: r(k, 200, 700) };
}
function scrambleBot(v, k) {
    if (v.phase !== "ask" || v.over || k.now() < v.lockUntil) return null;
    if (k.mem.q !== v.index) {
        k.mem.q = v.index;
        // the hint (first letter) makes it quicker
        k.mem.solveAt = k.now() + think(k, [11000, 30000], [5000, 15000]);
        k.mem.placed = 0;
    }
    const word = k.state.words[k.state.index].word;
    const hintAt = v.deadline - 16000;
    const at = v.hint ? Math.min(k.mem.solveAt, Math.max(hintAt, k.now()) + think(k, [3000, 8000], [1500, 4000])) : k.mem.solveAt;
    if (k.now() >= at) return { move: { q: v.index, guess: word }, wait: r(k, 200, 500) };
    // show tiles going down while it thinks
    const want = Math.min(word.length - 1, Math.floor(((k.now() - (at - 8000)) / 8000) * word.length));
    if (want > k.mem.placed) {
        k.mem.placed = want;
        return { move: { q: v.index, placed: want }, wait: r(k, 100, 300) };
    }
    return null;
}
function typingBot(v, k) {
    if (v.phase !== "play" || v.doneAt[k.seat] !== null) return null;
    if (k.mem.round !== v.round) {
        k.mem.round = v.round;
        k.mem.cps = ((k.level === "hard" ? r(k, 62, 82) : r(k, 32, 50)) * 5) / 60;
    }
    const n = Math.max(0, Math.min(v.len, Math.floor(((k.now() - v.startAt) / 1000) * k.mem.cps)));
    if (n === v.progress[k.seat] && n < v.len) return null;
    return { move: { round: v.round, text: v.sentence.slice(0, n) }, wait: r(k, 350, 550) };
}

// ---------- arcade ----------
function moleBot(v, k) {
    if (v.phase !== "play") return null;
    const t = k.now();
    const tried = (k.mem.tried = k.mem.tried || {});
    const live = v.moles.filter((m) => m.by === null && !tried[m.id] && m.appearAt <= t && m.hideAt > t + 150 && (m.type !== "bomb" || (k.level !== "hard" && k.rng() < 0.12)));
    if (!live.length || t < v.stunUntil[k.seat]) return null;
    const m = live.sort((a, b) => (b.type === "gold") - (a.type === "gold") || a.hideAt - b.hideAt)[0];
    tried[m.id] = true;
    const react = think(k, [420, 700], [260, 420]);
    const at = Math.max(t + 120, m.appearAt + react);
    if (at > m.hideAt) return null;
    return { move: { hole: m.hole, id: m.id }, at };
}
// race games: play it "in its head" and send the score when a person would finish
function aimBot(v, k) {
    if (v.myScore !== null || k.mem.sent) return null;
    k.mem.sent = true;
    const time = Math.round(think(k, [21, 32], [13, 19]) * 100) / 100;
    const misses = Math.floor(think(k, [1, 6], [0, 3]));
    if (time > 40) return { move: { score: 999 - 15, hits: 15 }, at: v.endAt };
    return { move: { score: Math.round((time + misses * 0.5) * 100) / 100, time, misses }, at: v.startAt + time * 1000 };
}
function stackBot(v, k) {
    if (v.myScore !== null || k.mem.sent || !v.puzzle) return null;
    k.mem.sent = true;
    const slice = G("stack").slice;
    let top = v.puzzle.base;
    const drops = [];
    let ms = 0;
    for (let i = 0; i < v.puzzle.speeds.length; i++) {
        // aim gets shakier as the blocks speed up
        const sd = (k.level === "hard" ? 0.012 : 0.028) * (0.6 + v.puzzle.speeds[i]);
        const x = top.x + (k.rng() + k.rng() + k.rng() - 1.5) * sd * 1.4;
        ms += 1000 / Math.max(0.6, v.puzzle.speeds[i]) * 0.7 + 250;
        if (ms > 58000) break;
        drops.push(Math.round(x * 10000) / 10000);
        const next = slice(top, x, top.w);
        if (!next) break;
        top = next;
    }
    let n = 0;
    top = v.puzzle.base;
    for (const d of drops) {
        const next = slice(top, d, top.w);
        if (!next) break;
        top = next;
        n++;
    }
    return { move: { score: n, drops }, at: v.startAt + Math.min(ms, 59000) };
}
function simonBot(v, k) {
    if (v.phase !== "input" || v.status[k.seat] !== "in") return null;
    const i = v.progress[k.seat];
    const key = v.level + ":" + i;
    if (k.mem.key === key) return null;
    k.mem.key = key;
    if (k.mem.level !== v.level) {
        k.mem.level = v.level;
        // where its memory slips this level (if it does)
        const slip = k.level === "hard" ? (v.len - 10) * 0.05 : (v.len - 5) * 0.07;
        k.mem.slip = k.rng() < slip ? Math.floor(k.rng() * v.len) : -1;
    }
    const right = v.seq[i];
    const color = i === k.mem.slip ? (right + 1 + Math.floor(k.rng() * 3)) % 4 : right;
    return { move: { level: v.level, i, color }, wait: i === 0 ? r(k, 500, 900) : think(k, [380, 620], [250, 400]) };
}
function pathBot(v, k) {
    if (v.phase !== "input" || k.mem.r === k.state.round) return null;
    if (k.state.answers[k.seat]) return null;
    k.mem.r = k.state.round;
    const path = k.state.path.slice();
    const slip = k.level === "hard" ? (path.length - 7) * 0.08 : (path.length - 4) * 0.1;
    if (k.rng() < slip) {
        const i = 1 + Math.floor(k.rng() * (path.length - 1));
        const wrong = range(25).filter((c) => !path.includes(c));
        path[i] = pick(k, wrong);
    }
    return { move: { r: k.state.round, cells: path }, wait: path.length * think(k, [650, 900], [380, 550]) + 600 };
}
// slide puzzle: weighted A* (fast, not always shortest, like a person)
function slideSolve(tiles, size, budget) {
    const S = require("./slide");
    const key = (b) => b.join(",");
    const open = [{ b: tiles, g: 0, f: S.distance(tiles, size) * 2, path: [] }];
    const seen = new Set([key(tiles)]);
    const until = Date.now() + budget;
    while (open.length && Date.now() < until) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
        const cur = open.splice(bi, 1)[0];
        if (S.isSolved(cur.b)) return cur.path;
        const gap = cur.b.indexOf(0);
        for (const c of [gap - 1, gap + 1, gap - size, gap + size]) {
            if (c < 0 || c >= cur.b.length || !S.adjacent(c, gap, size)) continue;
            const b = cur.b.slice();
            b[gap] = b[c];
            b[c] = 0;
            const kk = key(b);
            if (seen.has(kk)) continue;
            seen.add(kk);
            open.push({ b, g: cur.g + 1, f: cur.g + 1 + S.distance(b, size) * 2.2, path: cur.path.concat(cur.b[c]) });
        }
        if (open.length > 60000) open.splice(0, open.length - 30000);
    }
    return null;
}
function slideBot(v, k) {
    if (v.phase !== "ask" || !v.tiles || k.mem.q === v.index) return null;
    const mine = k.state.doneAt[k.seat] !== null || k.state.out[k.seat];
    if (mine) return null;
    k.mem.q = v.index;
    const round = k.state.rounds[k.state.index];
    const size = round.size;
    const moves = slideSolve(v.tiles, size, 200);
    if (!moves) return { move: { q: v.index, act: "out" }, wait: r(k, 30000, 50000) };
    const per = think(k, [900, 1500], [450, 800]);
    return { move: { q: v.index, moves }, wait: Math.min(moves.length * per + 1500, k.state.timed ? round.limit - 2500 : 1e9) };
}

function hedgeBot(v, k) {
    if (!v.myTurn) return null;
    const g = G("hedgerun");
    const me = k.seat;
    const them = 1 - me;
    const wait = think(k, [1200, 2600], [900, 1800]);
    const d = g.distances(v.walls, v.goal[me]);
    const step = v.moves.slice().sort((a, b) => d[a[0]][a[1]] - d[b[0]][b[1]])[0];
    const stepMove = step ? { act: "move", r: step[0], c: step[1] } : null;
    const [mine, theirs] = [v.dist[me], v.dist[them]];
    // behind (they move after me, so a tie is behind too): look for the hedge that hurts them most
    const wantWall = v.left[me] > 0 && theirs <= mine && (k.level === "hard" || k.rng() < 0.35);
    if (wantWall) {
        let best = null;
        for (const o of ["h", "v"]) for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 8; cc++) {
            const s = tryMove(g, k.state, me, { act: "wall", o, r: rr, c: cc });
            if (!s) continue;
            const gain = g.distances(s.walls, v.goal[them])[s.pos[them][0]][s.pos[them][1]] - theirs - (g.distances(s.walls, v.goal[me])[s.pos[me][0]][s.pos[me][1]] - mine);
            if (!best || gain > best.gain) best = { gain, p: { act: "wall", o, r: rr, c: cc } };
        }
        if (best && best.gain >= (theirs <= 2 ? 1 : 2)) return { move: best.p, wait };
    }
    return stepMove ? { move: stepMove, wait } : null;
}

function cycleBot(v, k) {
    if (v.phase !== "play" && v.phase !== "count") return null;
    if (k.mem.tick === v.tick && k.mem.round === v.round) return null;
    k.mem.tick = v.tick;
    k.mem.round = v.round;
    const W = v.w, H = v.h;
    const grid = k.state.grid;
    const head = v.trails[k.seat][v.trails[k.seat].length - 1];
    const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const OPP = { up: "down", down: "up", left: "right", right: "left" };
    const cur = (k.state.queue[k.seat] || []).slice(-1)[0] || v.dirs[k.seat];
    const nextOf = (i, dir) => {
        const x = (i % W) + D[dir][0], y = Math.floor(i / W) + D[dir][1];
        return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
    };
    const free = (i) => i >= 0 && grid[i] === -1;
    // room left if it goes this way (flood fill, capped)
    const room = (start) => {
        const seen = new Set([start]);
        const q = [start];
        for (let j = 0; j < q.length && seen.size < 400; j++) {
            for (const dir of ["up", "down", "left", "right"]) {
                const n = nextOf(q[j], dir);
                if (free(n) && !seen.has(n)) {
                    seen.add(n);
                    q.push(n);
                }
            }
        }
        return seen.size;
    };
    const runOf = (dir) => {
        let i = head, n = 0;
        while (n < 6 && free((i = nextOf(i, dir)))) n++;
        return n;
    };
    const opts = ["up", "down", "left", "right"].filter((d) => d !== OPP[cur]).map((dir) => {
        const n = nextOf(head, dir);
        if (!free(n)) return { dir, s: -1e9 };
        const s = (k.level === "hard" ? room(n) : 0) + runOf(dir) * 3 + (dir === cur ? 2 : 0) + k.rng();
        return { dir, s };
    });
    opts.sort((a, b) => b.s - a.s);
    const best = opts[0];
    // easy looks only a step ahead and sometimes too late
    if (k.level !== "hard" && runOf(cur) > 1 && k.rng() < 0.93) return null;
    if (best.dir === cur || best.s < -1e8) return null;
    return { move: { dir: best.dir, round: v.round }, wait: 1 };
}

function lavaBot(v, k) {
    if (v.phase !== "play" || !v.alive[k.seat]) return null;
    const [C, R] = v.dims;
    const t = v.tiles;
    const [x, y] = v.dots[k.seat];
    const at = (c, r) => (c < 0 || r < 0 || c >= C || r >= R ? "3" : t[r * C + c]);
    const ok = (c, r) => at(c, r) === "0" || (k.level !== "hard" && at(c, r) === "1" && k.rng() < 0.5);
    let best = null;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        if (!ok(c, r)) continue;
        let around = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) around += at(c + dc, r + dr) === "0" ? 1 : 0;
        const others = v.dots.filter((d, s) => s !== k.seat && v.alive[s] && Math.hypot(d[0] - c - 0.5, d[1] - r - 0.5) < 1.2).length;
        const s = around * (k.level === "hard" ? 1.2 : 0.6) - Math.hypot(c + 0.5 - x, r + 0.5 - y) * 0.9 - others * 2;
        if (!best || s > best.s) best = { s, c, r };
    }
    if (!best) return null;
    const dx = best.c + 0.5 - x, dy = best.r + 0.5 - y;
    const m = Math.hypot(dx, dy);
    const move = m < 0.12 ? { x: 0, y: 0 } : { x: dx / Math.max(m, 0.5), y: dy / Math.max(m, 0.5) };
    return { move, wait: think(k, [260, 420], [110, 180]) };
}

function paintBot(v, k) {
    if (v.phase !== "play" || k.now() < v.startAt) return null;
    const t = k.now();
    const C = v.cols;
    const last = k.mem.last !== undefined ? k.mem.last : Math.floor(k.rng() * v.owner.length);
    const near = (i) => Math.abs((i % C) - (last % C)) + Math.abs(Math.floor(i / C) - Math.floor(last / C));
    const want = v.owner.map((o, i) => i).filter((i) => v.owner[i] !== k.seat && (v.owner[i] === -1 || v.lockUntil[i] <= t));
    want.sort((a, b) => (v.owner[a] === -1 ? 0 : k.level === "hard" ? -0.5 : 1) - (v.owner[b] === -1 ? 0 : k.level === "hard" ? -0.5 : 1) + (near(a) - near(b)) * 0.6);
    const n = k.level === "hard" ? 7 : 4;
    const tiles = want.slice(0, n);
    if (!tiles.length) return null;
    k.mem.last = tiles[tiles.length - 1];
    return { move: { tiles }, wait: think(k, [700, 1000], [560, 700]) };
}

function hockeyBot(v, k) {
    if (v.phase !== "play") return null;
    const [W, H, , MR, PR] = v.dims;
    const [px, py, vx, vy] = v.puck;
    const s = k.seat;
    const homeY = s === 0 ? H - 44 : 44;
    const mineHalf = s === 0 ? py > H / 2 - PR : py < H / 2 + PR;
    const toward = s === 0 ? vy > 30 : vy < -30;
    const goalY = s === 0 ? 0 : H;
    const noise = k.level === "hard" ? 4 : 14;
    let tx, ty;
    if (mineHalf && Math.hypot(vx, vy) < (k.level === "hard" ? 520 : 300)) {
        // get behind the puck, then drive it at their goal
        const ax = W / 2 - px + (k.rng() - 0.5) * 50, ay = goalY - py;
        const m = Math.hypot(ax, ay) || 1;
        const behind = { x: px - (ax / m) * (MR + PR + 4), y: py - (ay / m) * (MR + PR + 4) };
        const [mx, my] = v.mallets[s];
        const lined = Math.hypot(mx - behind.x, my - behind.y) < 10;
        tx = lined ? px + (ax / m) * 40 : behind.x;
        ty = lined ? py + (ay / m) * 40 : behind.y;
    } else {
        // guard: slide across to where the puck will cross the home line
        let gx = px;
        if (toward && vy) {
            gx = px + (vx * (homeY - py)) / vy;
            while (gx < 0 || gx > W) gx = gx < 0 ? -gx : 2 * W - gx;
        }
        tx = W / 2 + (gx - W / 2) * 0.6;
        ty = homeY;
    }
    return { move: { x: tx + (k.rng() - 0.5) * noise, y: ty + (k.rng() - 0.5) * noise }, wait: think(k, [140, 220], [70, 110]) };
}

function penguinBot(v, k) {
    if (v.over || v.meLocked || k.mem.round === v.round) return null;
    k.mem.round = v.round;
    const g = G("penguinpush");
    const mine = v.penguins.filter((p) => p.owner === k.seat && !p.out);
    const theirs = v.penguins.filter((p) => p.owner !== k.seat && !p.out);
    const plan = () =>
        mine.map((p) => {
            const roll = k.rng();
            if (roll < 0.12) return null;
            if (roll < 0.25) return { id: p.id, a: Math.atan2(-p.y, -p.x) + r(k, -0.3, 0.3), p: r(k, 0.2, 0.5) };
            const t = pick(k, theirs);
            return { id: p.id, a: Math.atan2(t.y - p.y, t.x - p.x) + r(k, -0.15, 0.15), p: r(k, 0.55, 1) };
        });
    const guess = () => {
        const a = { [k.seat]: {}, [1 - k.seat]: {} };
        theirs.forEach((p) => {
            if (k.rng() < 0.3) return;
            const t = pick(k, mine);
            a[1 - k.seat][p.id] = { a: Math.atan2(t.y - p.y, t.x - p.x) + r(k, -0.3, 0.3), p: r(k, 0.4, 1) };
        });
        return a;
    };
    let best = plan();
    if (k.level === "hard" && theirs.length) {
        let bestV = -Infinity;
        const futures = range(6).map(guess);
        const until = Date.now() + 120;
        while (Date.now() < until) {
            const p = plan();
            let val = 0;
            for (const f of futures) {
                const aims = { 0: {}, 1: {} };
                Object.assign(aims[1 - k.seat], f[1 - k.seat]);
                p.forEach((x) => x && (aims[k.seat][x.id] = { a: x.a, p: x.p }));
                const { bodies } = g.simulate(v.penguins, aims, v.radius);
                bodies.forEach((b, i) => !b.out || v.penguins[i].out || (val += v.penguins[i].owner === k.seat ? -1.2 : 1));
            }
            if (val > bestV) {
                bestV = val;
                best = p;
            }
        }
    }
    return { move: { aims: best.filter(Boolean), lock: true }, wait: think(k, [4000, 10000], [3000, 7000]) };
}

function knifeBot(v, k) {
    if (v.phase !== "play" || v.out[k.seat] || k.now() < v.logStartAt) return null;
    if (k.now() < (k.mem.next || 0)) return null;
    const g = G("knifethrow");
    const TAU = Math.PI * 2;
    const side = k.seat === 0 ? Math.PI / 2 : -Math.PI / 2;
    const jitter = k.level === "hard" ? 15 : 45;
    const at = k.now() - r(k, 0, jitter);
    const rot = g.angle(v.log, (at + v.flight - v.logStartAt) / 1000);
    const a = (((side - rot) % TAU) + TAU) % TAU;
    const clear = Math.min(...v.stuck.map((s) => {
        const d = (((s.a - a) % TAU) + TAU) % TAU;
        return Math.min(d, TAU - d);
    }), 9);
    const margin = k.level === "hard" ? 0.1 : 0.04;
    if (clear < v.gap + margin) return null;
    k.mem.next = k.now() + think(k, [800, 1400], [300, 520]);
    return { move: { log: v.logIndex, throwAt: Math.round(at) }, wait: 1 };
}

// ripple: reads the headline (hard also knows its tips), sells what looks bad, buys what looks good, plays a card
function rippleBot(v, k) {
    if (v.phase !== "trade" || v.ready[k.seat]) return null;
    const st = k.state;
    if (k.mem.round !== v.round) {
        k.mem.round = v.round;
        const exp = [0, 0, 0, 0, 0];
        st.news[v.round - 1].eff.forEach((e) => (exp[e.co] += k.level === "hard" ? e.v : e.v * r(k, 0.2, 1.5)));
        // hard has been reading the charts: it mostly knows each pattern. Easy just rides the last move
        const P = G("ripple").PATTERNS;
        st.moves.forEach((m, i) => {
            const pat = m.follow === undefined ? P[m.p][1][(m.at + v.round - 1) % P[m.p][1].length] : [1, 1.5, 0.5, -1][m.f] * (st.lastMove[m.follow] || 0);
            exp[i] += k.level === "hard" ? (k.rng() < 0.75 ? pat : 0) : 0.5 * (st.lastMove[i] || 0);
        });
        v.price.forEach((p, i) => {
            if (!p) exp[i] = -9;
            else exp[i] += r(k, -0.03, 0.03);
        });
        k.mem.exp = exp;
        k.mem.steps = ["sell", "card", "buy", "ready"];
        k.mem.at = k.now() + think(k, [4000, 12000], [2500, 7000]);
    }
    if (k.now() < k.mem.at) return null;
    const exp = k.mem.exp;
    const step = k.mem.steps.shift();
    const wait = r(k, 300, 800);
    k.mem.at = k.now() + think(k, [2000, 5000], [1200, 3000]);
    if (step === "sell") {
        const bad = v.me.hold.map((q, i) => (q > 0 && exp[i] < -0.02 ? i : -1)).filter((i) => i >= 0);
        if (bad.length) {
            k.mem.steps.unshift("sell");
            return { move: { act: "trade", co: bad[0], qty: -v.me.hold[bad[0]] }, wait };
        }
        k.mem.at = k.now();
        return null;
    }
    if (step === "card") {
        const i = v.me.hand.findIndex((c) => !c.used);
        if (i >= 0 && !v.me.played && k.rng() < 0.6) {
            const type = v.me.hand[i].type;
            const live = range(5).filter((c) => v.price[c]);
            const best = live.sort((a, b) => exp[b] - exp[a]);
            const co = type === "hype" ? best[0] : type === "rumor" ? best[best.length - 1] : type === "freeze" ? (best.find((c) => v.me.hold[c] > 0 && exp[c] < 0) ?? best[best.length - 1]) : best[0];
            return { move: { act: "card", i, co }, wait };
        }
        // no cards: sometimes buy one for next round
        if (i < 0 && v.me.cash > 500 && k.rng() < (k.level === "hard" ? 0.4 : 0.2)) return { move: { act: "buycard", type: k.level === "hard" ? "hype" : pick(k, ["hype", "rumor", "freeze", "tip"]) }, wait };
        return null;
    }
    if (step === "buy") {
        const co = range(5).filter((c) => v.price[c]).sort((a, b) => exp[b] - exp[a])[0];
        if (co !== undefined && exp[co] > 0.02) {
            const spend = v.me.cash * (k.level === "hard" ? 0.8 : r(k, 0.2, 0.6));
            const qty = Math.floor(spend / v.price[co]);
            if (qty > 0) return { move: { act: "trade", co, qty }, wait };
        }
        return null;
    }
    if (step === "ready") return { move: { act: "ready" }, wait };
    return null;
}

// casino: a gambler with a bankroll plan. Hard bets small and smart, easy chases
const bj = (cards) => {
    let t = 0;
    let aces = 0;
    cards.forEach((c) => {
        const r0 = c % 13;
        if (r0 === 12) aces++;
        t += r0 === 12 ? 11 : r0 >= 8 ? 10 : r0 + 2;
    });
    while (t > 21 && aces--) t -= 10;
    return t;
};
function casinoHand(x, k) {
    const h = x.h;
    const m = (o) => ({ act: "hand", ...o });
    const stop = k.mem.stop || (k.mem.stop = Math.floor(think(k, [3, 6], [2, 4])));
    if (x.g === "blackjack") {
        const t = bj(h.me);
        const up = h.dealer && h.dealer.length ? bj([h.dealer[0]]) : 10;
        if (k.level === "hard" && h.me.length === 2 && (t === 10 || t === 11) && up < 10) return m({ m: "double" });
        const hit = k.level === "hard" ? t < 12 || (t < 17 && up >= 7) : t < 15;
        return m({ m: hit ? "hit" : "stand" });
    }
    if (x.g === "poker") {
        const ranks = h.me.map((c) => c % 13);
        const good = new Set(ranks).size < 3 || Math.max(...ranks) >= 10;
        return m({ m: k.level !== "hard" || good ? "play" : "fold" });
    }
    if (x.g === "vpoker") {
        const ranks = h.me.map((c) => c % 13);
        const pairs = range(5).filter((i) => ranks.filter((r0) => r0 === ranks[i]).length > 1);
        return m({ m: "draw", hold: pairs.length ? pairs : range(5).filter((i) => ranks[i] >= 9) });
    }
    const steps = (h.open || h.path || h.cards || []).length || h.lanes || 0;
    if (x.g === "hilo") {
        if (steps > stop) return m({ m: "cash" });
        const cur = h.cards[h.cards.length - 1] % 13;
        return m({ m: cur <= 5 ? "hi" : cur >= 7 ? "lo" : pick(k, ["hi", "lo"]) });
    }
    if (steps >= stop) return m({ m: "cash" });
    if (x.g === "mines") return m({ m: "tile", i: pick(k, range(25).filter((i) => !h.open.includes(i))) });
    if (x.g === "tower") return m({ m: "door", i: Math.floor(k.rng() * h.doors) });
    if (x.g === "road") return m({ m: "step" });
    return m({ m: "cash" });
}
function casinoBot(v, k) {
    const st = k.state;
    const s = k.seat;
    const wait = think(k, [1800, 4000], [1200, 2600]);
    if (st.phase === "setup") return s === 0 ? { move: { act: "begin", cfg: { play: 60, rounds: 4 } }, wait: 3000 } : null;
    if (st.paused && st.paused[s]) return { move: { act: "unpause" }, wait: r(k, 3000, 6000) };
    if (st.phase === "shop") return st.shopDone[s] ? null : { move: { act: "ready" }, wait: r(k, 4000, 9000) };
    if (st.phase === "resolve") return st.resolveDone[s] ? null : { move: { act: "ready" }, wait: r(k, 5000, 9000) };
    if (st.phase !== "play") return null;
    const chips = st.chips[s];
    const riding = Object.values(st.tables || {}).some((t) => t.bets && t.bets[s]);
    const x = st.sess[s];
    if (x) return { move: casinoHand(x, k), wait: r(k, 900, 1800) };
    delete k.mem.stop;
    if (chips < 5 && !riding) return { move: { act: "rebuy" }, wait };
    if (riding) return null;
    const C = require("./casino/games").GAMES;
    const at = st.at[s];
    // new table now and then (or when this one closed)
    if (!at || !st.open.includes(at) || k.rng() < 0.18) {
        const opts = st.open.filter((g) => C[g] && g !== at && !(g === st.hot && st.now && st.now.ban && st.now.ban.includes(s)));
        if (!opts.length) return null;
        return { move: { act: "sit", g: pick(k, opts) }, wait };
    }
    const g = C[at];
    if (g.shared) {
        const t = st.tables[at];
        if (!t || t.phase !== "bet") return null;
    }
    const sel = {
        dice: { dir: pick(k, ["over", "under"]), at: 50 },
        limbo: k.level === "hard" ? 2 : pick(k, [2, 3, 5, 10]),
        roulette: k.level === "hard" ? { t: pick(k, ["red", "black", "odd", "even"]) } : k.rng() < 0.3 ? { t: "n", n: Math.floor(k.rng() * 37) } : { t: pick(k, ["red", "black", "d1", "d2", "d3"]) },
        baccarat: k.level === "hard" ? "b" : pick(k, ["p", "b", "t"]),
        plinko: k.level === "hard" ? "low" : pick(k, ["low", "med", "high"]),
        keno: range(40).sort(() => k.rng() - 0.5).slice(0, k.level === "hard" ? 4 : 6).map((n) => n + 1),
        horses: Math.floor(k.rng() * 6),
        craps: k.level === "hard" ? "pass" : pick(k, ["pass", "dont", "field"]),
        crash: k.level === "hard" ? 1.6 : pick(k, [1.5, 2, 3, 5]),
        mines: k.level === "hard" ? 1 : pick(k, [3, 5]),
        tower: k.level === "hard" ? "easy" : pick(k, ["easy", "med", "hard"]),
        road: k.level === "hard" ? "easy" : pick(k, ["easy", "med"]),
    }[at];
    // hard bets ~5% of the stack, easy 10-30% (and keeps enough for doubles)
    const room = st.room[s] === "high";
    const max = v.max || 50;
    const min = room ? 250 : 5;
    const frac = k.level === "hard" ? r(k, 0.04, 0.07) : r(k, 0.1, 0.3);
    const keep = ["blackjack", "poker", "wheel"].includes(at) ? 2 : at === "slots" ? 3 : 1;
    const amount = Math.max(min, Math.min(max, Math.floor((chips * frac) / 1), Math.floor(chips / keep)));
    if (amount > chips || amount * keep > chips) return null;
    return { move: { act: "bet", amount, sel: sel === undefined ? true : sel }, wait };
}

// drink or drown: plays what it can pay for (hard: the biggest, aimed at the leader), does its tasks, passes on counters
function drinkBot(v, k) {
    const s = k.seat;
    const pend = v.pending;
    if (v.phase === "setup") return s === 0 ? { move: { act: "begin", goal: 25 }, wait: 3000 } : null;
    if (v.phase === "react" && pend && pend.by !== s && v.passed && !v.passed[s]) return { move: { act: "pass" }, wait: r(k, 1200, 3000) };
    if (v.phase === "resolve" && pend && pend.by === s) return { move: { act: "done" }, wait: r(k, 3000, 6000) };
    if (v.phase === "challenge" && pend) {
        const all = pend.everyone || (pend.card && pend.card.who === "everyone");
        if (pend.by !== s) return all && pend.step === "ante" && !pend.players.includes(s) && k.mem.joined !== pend.card.id && (k.mem.joined = pend.card.id) !== undefined ? { move: { act: "join" }, wait: r(k, 1500, 4000) } : null;
        if (pend.step === "ante") return pend.players.length >= 2 ? { move: { act: "start" }, wait: r(k, 2500, 5000) } : null;
        // the challenge happens for real at the table; the bot calls a fair coin
        return { move: { act: "win", seat: pick(k, pend.players) }, wait: r(k, 6000, 12000) };
    }
    if (v.turn !== s) return null;
    if (v.phase === "discard") {
        const over = v.hand.length - 10;
        const order = v.hand.slice().sort((a, b) => (a.t === "number" ? 1 : 0) - (b.t === "number" ? 1 : 0) || a.v - b.v);
        return { move: { act: "discard", ids: order.slice(0, over).map((c) => c.id) }, wait: r(k, 1500, 3000) };
    }
    if (v.phase !== "turn") return null;
    const pay = v.hand.filter((c) => c.t === "number" && !c.wild);
    const budget = pay.reduce((a, c) => a + c.v, 0);
    const playable = v.hand.filter((c) => (c.t === "action" || c.t === "challenge") && !c.fx && c.v <= budget && (c.who !== "anyone" || (c.n || 1) < v.hand.length));
    if (!playable.length || (k.level !== "hard" && k.rng() < 0.15)) return { move: { act: "end" }, wait: r(k, 2000, 4000) };
    const c = k.level === "hard" ? playable.sort((a, b) => b.v - a.v)[0] : pick(k, playable);
    // pay with the fewest cards
    const ids = [];
    let tot = 0;
    for (const y of pay.slice().sort((a, b) => b.v - a.v)) {
        if (tot >= c.v) break;
        ids.push(y.id);
        tot += y.v;
    }
    if (tot < c.v) return { move: { act: "end" }, wait: 1500 };
    const others = range(k.n).filter((x) => x !== s);
    const pts = v.points || [];
    const lead = others.slice().sort((a, b) => (pts[b] || 0) - (pts[a] || 0));
    const targets = c.who === "anyone" ? (k.level === "hard" ? lead : others.sort(() => k.rng() - 0.5)).slice(0, c.n || 1) : [];
    return { moves: [{ act: "play", id: c.id, pay: ids, targets }, { act: "end" }], wait: r(k, 2500, 5000) };
}

// telephone sketch: writes its idea, doodles (badly, on purpose), guesses from what the drawing was meant to be
const DOODLES = [
    // smiley, sun, house, stick figure
    () => [ring(200, 150, 80), ring(170, 125, 8), ring(230, 125, 8), arc(200, 160, 45, 0.2, 2.9)],
    () => [ring(200, 150, 50), ...range(8).map((i) => line(200 + Math.cos(i * 0.785) * 65, 150 + Math.sin(i * 0.785) * 65, 200 + Math.cos(i * 0.785) * 100, 150 + Math.sin(i * 0.785) * 100))],
    () => [poly([[120, 260], [120, 150], [280, 150], [280, 260], [120, 260]]), poly([[110, 155], [200, 70], [290, 155]]), poly([[185, 260], [185, 205], [215, 205], [215, 260]])],
    () => [ring(200, 70, 25), line(200, 95, 200, 190), line(200, 120, 150, 160), line(200, 120, 250, 160), line(200, 190, 160, 260), line(200, 190, 240, 260)],
];
function ring(x, y, rad) {
    return arc(x, y, rad, 0, Math.PI * 2);
}
function arc(x, y, rad, a, b) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
        const t = a + ((b - a) * i) / 24;
        pts.push([x + Math.cos(t) * rad, y + Math.sin(t) * rad]);
    }
    return pts;
}
function line(x1, y1, x2, y2) {
    return [[x1, y1], [(x1 + x2) / 2, (y1 + y2) / 2], [x2, y2]];
}
function poly(list) {
    return list;
}
function sketchBot(v, k) {
    const st = k.state;
    if (v.phase === "show" && v.show) {
        const key = v.show.chain + ":" + v.show.at;
        if (k.mem.heart === key) return null;
        k.mem.heart = key;
        if (v.show.at < 0 || k.rng() > 0.35) return null;
        const e = st.chains[v.show.chain][v.show.at];
        return e && e.by !== k.seat && !e.hearts.includes(k.seat) ? { move: { act: "heart", chain: v.show.chain, step: v.show.at }, wait: r(k, 800, 2500) } : null;
    }
    if (!v.me || v.me.done) return null;
    const c = st.chains.findIndex((ch) => ch[st.step] && ch[st.step].by === k.seat);
    const chain = c >= 0 ? st.chains[c] : null;
    if (v.me.task === "write") return { move: { act: "text", text: v.me.idea || "a dancing potato" }, wait: r(k, 4000, 9000) };
    if (v.me.task === "guess") {
        const src = chain && st.step >= 2 ? chain[st.step - 2].text || "" : "";
        let words = src.split(" ").filter(Boolean);
        if (!words.length) words = ["a", "mystery", "blob"];
        if (k.level !== "hard" || k.rng() < 0.4) {
            const i = Math.floor(k.rng() * words.length);
            words[i] = pick(k, ["potato", "wizard", "noodle", "dragon", "toaster", "ghost", "llama", "pickle"]);
        }
        return { move: { act: "text", text: words.join(" ").slice(0, 60) }, wait: think(k, [6000, 14000], [4000, 9000]) };
    }
    if (v.me.task === "draw") {
        if (k.mem.drawStep !== st.step) {
            k.mem.drawStep = st.step;
            const wob = k.level === "hard" ? 2 : 7;
            k.mem.strokes = pick(k, DOODLES)().map((pts) => pts.flatMap(([x, y]) => [Math.round(Math.max(0, Math.min(400, x + r(k, -wob, wob)))), Math.round(Math.max(0, Math.min(300, y + r(k, -wob, wob))))]));
            k.mem.ink = Math.floor(k.rng() * 4);
        }
        const pts = k.mem.strokes.shift();
        if (!pts) return { move: { act: "done" }, wait: r(k, 1500, 3000) };
        return { move: { act: "stroke", c: k.mem.ink, s: 1, pts }, wait: r(k, 700, 1600) };
    }
    return null;
}

// shape shifter: works toward the real answer one piece at a time; easy gets stuck on the last couple some rounds
function shapeBot(v, k) {
    const st = k.state;
    if (v.phase !== "play" || st.solvedAt[k.seat] !== null) return null;
    if (k.mem.round !== st.round) {
        k.mem.round = st.round;
        const used = new Set();
        k.mem.plan = st.target.solution.map((s) => {
            const i = st.boards[k.seat].findIndex((p, j) => p.t === s.t && !used.has(j));
            used.add(i);
            return { i, at: s.at };
        });
        k.mem.plan.sort(() => k.rng() - 0.5);
        if (k.level !== "hard" && k.rng() < 0.4) k.mem.plan = k.mem.plan.slice(0, 5);
        k.mem.at = k.now() + think(k, [8000, 15000], [5000, 9000]);
    }
    if (k.now() < k.mem.at || !k.mem.plan.length) return null;
    k.mem.at = k.now() + think(k, [9000, 20000], [5000, 11000]);
    const p = k.mem.plan.shift();
    return { move: { act: "place", i: p.i, at: p.at }, wait: r(k, 200, 600) };
}

// space kitchen (co-op): works its own stations, fetches what the tickets still need, passes food down the line
const KITCHEN = {
    noodles: { src: "fridge", chop: false, cook: true }, star: { src: "fridge", chop: true, cook: false }, comet: { src: "fridge", chop: true, cook: true },
    cheese: { src: "fridge", chop: true, cook: false }, rice: { src: "pantry", chop: false, cook: true }, sauce: { src: "pantry", chop: false, cook: false }, bun: { src: "pantry", chop: false, cook: false },
};
const RECIPE_PARTS = [["bun", "cheese"], ["star", "cheese"], ["rice", "sauce"], ["noodles", "sauce", "star"], ["bun", "comet", "cheese"], ["rice", "comet", "sauce"], ["noodles", "comet", "star"], ["rice", "noodles", "comet", "cheese"], ["bun", "comet", "cheese", "sauce"]];
function kitchenBot(v, k) {
    const st = k.state;
    if (st.phase !== "cook") return null;
    const s = k.seat;
    const mine = st.jobs[s];
    const has = (x) => mine.includes(x);
    const who = (x) => st.jobs.findIndex((j) => j.includes(x));
    const bench = st.bench[s];
    const wait = think(k, [900, 1500], [450, 750]);
    const go = (p) => ({ move: p, wait });
    const count = (list) => list.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
    const fits = (parts) => st.orders.some((o) => {
        const need = count(RECIPE_PARTS[o.r]);
        const got = count(parts);
        return Object.keys(got).every((x) => got[x] <= (need[x] || 0));
    });
    const exact = (parts) => st.orders.some((o) => RECIPE_PARTS[o.r].slice().sort().join() === parts.slice().sort().join());
    // the stove: lift anything done before it burns
    if (has("stove")) {
        const b = st.burners.findIndex((x) => x && k.now() - x.at >= 5000);
        if (b >= 0 && bench.length < 5) return go({ act: "lift", b });
    }
    const pass = (it, job) => {
        const to = who(job);
        return to >= 0 && st.bench[to].length < 5 ? go({ act: "pass", id: it.id, to }) : null;
    };
    for (const it of bench) {
        let m = null;
        if (it.k === "plate") {
            if (it.parts.length && exact(it.parts)) m = has("serve") ? go({ act: "serve", id: it.id }) : pass(it, "serve");
            else if (it.parts.length && !fits(it.parts) && k.level === "hard") m = go({ act: "bin", id: it.id });
            if (m) return m;
            continue;
        }
        const K = KITCHEN[it.k];
        if (it.burnt) return go({ act: "bin", id: it.id });
        if (K.chop && !it.chopped && !it.cooked) {
            if ((m = has("chop") ? go({ act: "chop", id: it.id }) : pass(it, "chop"))) return m;
            continue;
        }
        if (K.cook && !it.cooked) {
            if ((m = has("stove") ? (st.burners.some((x) => !x) ? go({ act: "cook", id: it.id }) : null) : pass(it, "stove"))) return m;
            continue;
        }
        if (!has("plate")) {
            if ((m = pass(it, "plate"))) return m;
            continue;
        }
        const plate = bench.find((p) => p.k === "plate" && p.parts.length < 4 && fits(p.parts.concat(it.k)));
        if (plate) return go({ act: "add", id: it.id, plate: plate.id });
        if (bench.filter((p) => p.k === "plate").length < 2 && bench.length < 5) return go({ act: "plate" });
    }
    // fetch what the tickets still need and nobody has yet
    const want = count(st.orders.flatMap((o) => RECIPE_PARTS[o.r]));
    const have = count([
        ...st.bench.flatMap((b) => b.flatMap((it) => (it.k === "plate" ? it.parts : it.burnt ? [] : [it.k]))),
        ...st.burners.filter(Boolean).map((x) => x.item.k),
    ]);
    const fetch = Object.keys(want).filter((x) => want[x] > (have[x] || 0) && has(KITCHEN[x].src));
    if (fetch.length && bench.length < 4) return go({ act: "take", k: k.level === "hard" ? fetch[0] : pick(k, fetch) });
    return null;
}

// card shop: buys a pack or two, rips most, puts its best spares on the table, haggles by market value
function shopBot(v, k) {
    const st = k.state;
    const s = k.seat;
    const M = require("./cardshop/market");
    const val = (key) => M.value(st, +key);
    const wait = think(k, [1800, 3500], [1000, 2000]);
    const hard = k.level === "hard";
    if (st.phase === "done") return null;
    if (st.phase === "rush") {
        const o = st.q[s][0];
        if (o && k.mem.offer !== o.id) {
            k.mem.offer = o.id;
            const ratio = o.cash / o.m;
            const act = hard ? (ratio >= 1.05 ? "deal" : o.ask / o.cash <= 1.3 ? "counter" : ratio >= 0.9 ? "deal" : "no") : pick(k, ["deal", "deal", "counter", "no"]);
            return { move: { act, id: o.id }, wait: r(k, 1200, 3500) };
        }
        if (!st.sniped[s] && k.mem.snipeDay !== st.day && st.q.some((q, x) => x !== s && q.length > 1) && k.rng() < (hard ? 0.05 : 0.02)) {
            k.mem.snipeDay = st.day;
            return { move: { act: "snipe" }, wait: r(k, 300, 900) };
        }
        return null;
    }
    if (st.ready[s]) return null;
    if (st.phase === "morning") {
        const sealed = st.packs[s].findIndex((n) => n > 0);
        if (sealed >= 0) return { move: { act: "rip", p: sealed }, wait: r(k, 1500, 3000) };
        const offers = st.offers.slice().sort((a, b) => st.pack[a] - st.pack[b]);
        const p = hard ? offers.slice().reverse().find((x) => st.cash[s] > st.pack[x] * 1.5) ?? offers[0] : pick(k, offers);
        const keep = hard ? 1.5 : 1.2;
        if (st.bought[s] < 3 && st.cash[s] > st.pack[p] * keep) return { move: { act: "buy", p }, wait };
        return { move: { act: "ready" }, wait };
    }
    if (st.phase === "table") {
        if (hard && st.day === 1 && st.spots[s] < 4 && st.cash[s] > 120) return { move: { act: "upgrade", what: "spot" }, wait };
        if (hard && st.day === 2 && !st.sign[s] && st.cash[s] > 150) return { move: { act: "upgrade", what: "sign" }, wait };
        const row = st.table[s];
        const empty = row.findIndex((x) => !x);
        if (empty >= 0) {
            const shown = (key) => row.filter((d) => d && d.k === +key).length;
            const spare = Object.keys(st.own[s]).filter((key) => st.own[s][key] - shown(key) > 0).sort((a, b) => val(b) - val(a));
            if (spare.length) {
                const key = +spare[0];
                const rare = M.CARDS[M.idxOf(key)].r >= 3;
                return { move: { act: "slot", i: empty, k: key, tier: hard ? (rare ? "premium" : "fair") : pick(k, ["cheap", "fair", "premium"]) }, wait: r(k, 900, 1800) };
            }
        }
        return { move: { act: "ready" }, wait };
    }
    return { move: { act: "ready" }, wait: r(k, 5000, 9000) };
}

// town rivals: tries every market tile on every open lot and keeps the best trade-off of points, income and hurting rivals
function townBot(v, k) {
    if (!v.myTurn) return null;
    const g = G("townrivals");
    const st = k.state;
    const s = k.seat;
    const left = v.rounds - v.round;
    const n = st.coins.length;
    const before = range(n).map((x) => g.score(st, x).total);
    const nb = (i) => [i - st.size, i + st.size, i % st.size ? i - 1 : -1, i % st.size < st.size - 1 ? i + 1 : -1].filter((j) => j >= 0 && j < st.cells.length);
    const opts = [];
    const lots = st.cells.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
    const placing = v.phase === "place";
    for (const p of placing ? [v.hands[s]] : v.pool) {
        const d = v.defs[p.t];
        if (!placing && d.cost > st.coins[s]) continue;
        for (const i of lots) {
            st.cells[i] = { t: p.t, o: s };
            const after = range(n).map((x) => g.score(st, x).total);
            // coins it will make before the game ends (3 coins = 1 point), robbing included
            const coins = (g.tileIncome(st, i) + g.victims(st, i).length * (d.steal || 0)) * left;
            st.cells[i] = null;
            const mine = after[s] - before[s];
            const theirs = range(n).filter((x) => x !== s).reduce((t, x) => t + after[x] - before[x], 0);
            // a home next to open lots has room to grow
            const room = d.tags.includes("home") ? nb(i).filter((j) => !st.cells[j]).length * 0.15 : 0;
            const val = mine - theirs * (k.level === "hard" ? 0.6 : 0.2) + (coins - (placing ? 0 : d.cost)) / 3 + room;
            opts.push({ p, i, val });
        }
    }
    const wait = think(k, [1500, 3500], [1000, 2200]);
    if (!opts.length) return { move: { act: "pass" }, wait };
    opts.sort((a, b) => b.val - a.val);
    if (placing) return { move: { act: "place", cell: (k.level === "hard" ? opts[0] : opts[Math.floor(k.rng() * Math.min(3, opts.length))]).i }, wait };
    const passVal = (v.pass + (left ? 0 : 0)) / 3;
    const pickOpt = k.level === "hard" ? opts[0] : opts[Math.floor(k.rng() * Math.min(6, opts.length))];
    if (pickOpt.val < passVal) return { move: { act: "pass" }, wait };
    return { move: { act: "take", id: pickOpt.p.id }, wait };
}

// never have I bet: answers honestly-ish, bets on what a room usually says (hard counts itself in properly)
function neverBot(v, k) {
    if (v.phase !== "ask" || (v.me.bet !== null && v.me.yes !== null) || k.mem.round === v.round) return null;
    k.mem.round = v.round;
    const yes = k.rng() < 0.5;
    const others = v.n - 1;
    const guess = k.level === "hard" ? (yes ? 1 : 0) + Math.round(others * r(k, 0.35, 0.55)) : Math.floor(k.rng() * (v.n + 1));
    return { move: { round: v.round, yes, bet: Math.max(0, Math.min(v.n, guess)) }, wait: think(k, [5000, 14000], [3000, 9000]) };
}

// secret recipe: crosses off every card it has seen, asks about what's still unknown, solves once it's sure
function recipeBot(v, k) {
    const hard = k.level === "hard";
    if (v.mustShow) {
        const c = v.mustShow;
        // hard re-shows a card the asker may already know about; easy shows any
        return { move: { act: "show", card: pick(k, c) }, wait: r(k, 1200, 3000) };
    }
    if (!v.myTurn) return null;
    const known = new Set([...v.me.hand, ...v.me.seen, ...v.counter]);
    const unknown = [0, 1, 2].map((g) => v.cards.map((c, i) => (c.g === g && !known.has(i) ? i : -1)).filter((i) => i >= 0));
    const wait = think(k, [2500, 5000], [1500, 3500]);
    const sure = unknown.every((u) => u.length === 1);
    const brave = !hard && unknown.every((u) => u.length <= 2) && k.rng() < 0.3;
    if (sure || brave) return { move: { act: "solve", dish: unknown.map((u) => pick(k, u)) }, wait };
    // ask about unknowns; where a group is solved, use a card from my own hand so only the others can be shown
    const mine = (g) => v.me.hand.find((c) => v.cards[c].g === g);
    const dish = unknown.map((u, g) => (u.length === 1 && hard && mine(g) !== undefined ? mine(g) : pick(k, u.length ? u : [mine(g) ?? g * 5])));
    return { move: { act: "ask", dish }, wait };
}

// critter island: spends coins on traits and food near its own critters, bets on the leader, votes to hurt whoever's ahead
function critterBot(v, k) {
    const s = k.seat;
    const hard = k.level === "hard";
    const wait = think(k, [1500, 4000], [900, 2500]);
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    if (v.phase === "pick") {
        if (v.turn !== s) return null;
        const pref = ["bunny", "turtle", "squirrel", "raccoon", "fox", "mouse", "beaver", "skunk", "hedgehog", "frog", "lizard"].filter((x) => !v.picks.includes(x));
        return { move: { act: "pick", k: hard ? pref[0] : pick(k, pref) }, wait };
    }
    if (v.phase === "home") {
        if (v.turn !== s) return null;
        for (let i = 0; i < 300; i++) {
            const p = { x: 3 + k.rng() * (v.w - 6), y: 2.5 + k.rng() * (v.h - 5) };
            const e = ((p.x - v.w / 2) / (v.w / 2 - 1)) ** 2 + ((p.y - v.h / 2) / (v.h / 2 - 1)) ** 2;
            if (e < 0.65 && v.homes.every((h) => !h || d(h, p) >= 5) && v.scenery.every((x) => d(x, p) > (x.k === "pond" ? 2.6 : 1.6)) && v.dens.every((x) => d(x, p) > 3.2) && v.bushes.every((x) => d(x, p) > 1.2)) return { move: { act: "home", x: p.x, y: p.y }, wait };
        }
        return null;
    }
    if (v.out[s] !== null || v.ready[s]) return null;
    if (v.phase === "night") return { move: { act: "ready" }, wait: r(k, 3000, 6000) };
    if (v.phase !== "build") return null;
    const g = G("critters");
    const home = v.homes[s];
    const coins = v.coins[s];
    const stash = v.stash[s];
    const pop = v.pops[s];
    if (k.mem.day !== v.day) {
        k.mem.day = v.day;
        k.mem.buys = 0;
    }
    // somewhere free within a ring around a point
    const near = (c, lo, hi, kind) => {
        for (let i = 0; i < 60; i++) {
            const an = k.rng() * Math.PI * 2;
            const rr = lo + k.rng() * (hi - lo);
            const p = { x: Math.floor(c.x + Math.cos(an) * rr) + 0.5, y: Math.floor(c.y + Math.sin(an) * rr) + 0.5 };
            if (!g.canPlace(k.state, p, kind, s)) return p;
        }
        return null;
    };
    const want = [];
    if (!v.fire[s] && pop >= 4 && stash >= pop + 4) want.push(["fire"]);
    if (pop >= 3) want.push(["seed", near(home, 2.8, hard ? 5 : 8, "seed")]);
    if (hard && !v.owned[s].includes("store") && v.night && v.night[s].robbed >= 2) want.push(["store"]);
    const rival = v.homes.map((h, x) => x).filter((x) => x !== s && v.out[x] === null)[0];
    want.push(pick(k, [
        ["scarecrow", near(home, 2.8, 4, "scarecrow")],
        ["spikes", near(home, 2.8, 5, "spikes")],
        ["tower", near(home, 2.8, 4, "tower")],
        ["herb", near(home, 2.8, 5, "herb")],
        ["winterberry", near(home, 2.8, 6, "winterberry")],
        ["nest"],
        ["thorn", near(home, 3, 7, "thorn")],
        ["hive", near(home, 3, 6, "hive")],
        rival !== undefined ? ["snare", near(v.homes[rival], 2.7, 4, "snare")] : ["wall", near(home, 3, 5, "wall")],
        ["wall", near(home, 3, 5, "wall")],
    ]));
    if (hard && coins >= 6 && k.rng() < 0.3) want.push(["tree", near(home, 3, 6, "tree")]);
    if (k.mem.buys < (hard ? 4 : 3))
        for (const [key, at] of want) {
            const it = v.shop[key];
            if (!it || !v.offers.includes(key) || coins < it.coins || stash - (it.food || 0) < pop / 2 || (it.place && !at)) continue;
            if (it.once && v.owned[s].includes(key)) continue;
            k.mem.buys++;
            const move = { act: "buy", k: key };
            if (at) Object.assign(move, { x: at.x, y: at.y });
            return { move, wait };
        }
    return { move: { act: "ready" }, wait };
}

const BOTS = {
    critters: critterBot,
    recipe: recipeBot,
    neverbet: neverBot,
    townrivals: townBot,
    cardshop: shopBot,
    spacekitchen: kitchenBot,
    shapeshift: shapeBot,
    telesketch: sketchBot,
    drinkdrown: drinkBot,
    casino: casinoBot,
    penguinpush: penguinBot,
    knifethrow: knifeBot,
    ripple: rippleBot,
    hedgerun: hedgeBot,
    lightcycles: cycleBot,
    lavafloor: lavaBot,
    paintgrab: paintBot,
    airhockey: hockeyBot,
    molesmash: moleBot,
    aimrush: aimBot,
    stack: stackBot,
    simonrace: simonBot,
    pathrecall: pathBot,
    slidepuzzle: slideBot,
    wordladder: wordladderBot,
    wordmine: wordmineBot,
    scramble: scrambleBot,
    typingrace: typingBot,
    spit: spitBot,
    battlelines: battlelinesBot,
    backgammon: backgammonBot,
    rummy500: rummyBot,
    spades: spadesBot,
    groupmind: groupmindBot,
    pricetag: pricetagBot,
    pokerpick: pokerpickBot,
    digittarget: digittargetBot,
    tictactoe: (v, k) => search(G("tictactoe"), k, (st) => range(9).filter((i) => st.board[i] === null).map((cell) => ({ cell }))),
    connect4: (v, k) => search(G("connect4"), k, () => range(7).map((col) => ({ col })), { budget: 300 }),
    reversi: (v, k) => search(G("reversi"), k, (st) => range(64).filter((i) => st.board[i] === null).map((i) => ({ i })), { budget: 300, cap: 70 }),
    dotsboxes: (v, k) => search(G("dotsboxes"), k, (st) => [
        ...st.h.map((x, i) => (x === null ? { t: "h", r: Math.floor(i / 5), c: i % 5 } : null)),
        ...st.v.map((x, i) => (x === null ? { t: "v", r: Math.floor(i / 6), c: i % 6 } : null)),
    ].filter(Boolean), { budget: 260, cap: 70 }),
    mancala: (v, k) => search(G("mancala"), k, () => range(6).map((pit) => ({ pit }))),
    ultimatettt: (v, k) => search(G("ultimatettt"), k, (st) => {
        const out = [];
        for (let b = 0; b < 9; b++) for (let c = 0; c < 9; c++) if (st.board[b * 9 + c] === null && st.small[b] === null) out.push({ b, c });
        return out;
    }, { budget: 300 }),
    checkers: (v, k) => search(G("checkers"), k, (st, s) => G("checkers")._ai.legalMoves(st, s).map((m) => ({ from: m.from, to: m.to })), { budget: 300, cap: 120 }),
    chess: chessBot,

    rps(v, k) {
        if (v.phase !== "pick" || v.myPick || v.over) return null;
        return { move: { pick: pick(k, ["rock", "paper", "scissors"]) }, wait: r(k, 900, 3500) };
    },
    reaction(v, k) {
        const s = k.state;
        if (s.over || s.phase === "done" || s.out[k.seat] || !s.goAt || k.mem.round === s.roundId) return null;
        k.mem.round = s.roundId;
        // a person's reaction time (and the odd jump start on easy)
        const rt = k.level === "hard" ? r(k, 210, 330) : r(k, 300, 520);
        const early = k.level !== "hard" && k.rng() < 0.08;
        return { move: { tap: true }, at: early ? s.goAt - r(k, 200, 600) : s.goAt + rt };
    },
    mathbattle(v, k) {
        const s = k.state;
        if (v.phase !== "ask" || v.myLock || v.myPick !== null || k.mem.done === v.index) return null;
        k.mem.done = v.index;
        const q = s.questions[s.index];
        const good = k.rng() < (k.level === "hard" ? 0.9 : 0.6);
        return { move: { q: v.index, choice: good ? q.answer : pick(k, [0, 1, 2, 3].filter((c) => c !== q.answer)) }, wait: think(k, [2200, 5000], [1000, 2600]) };
    },
    lastone: (v, k) => quiz(v, k, k.state.qs && k.state.qs[k.state.index]),
    nextup: (v, k) => quiz(v, k, k.state.questions && k.state.questions[k.state.index]),
    balloon(v, k) {
        if (v.phase !== "play" || v.status[k.seat] !== "pump") return null;
        if (!k.mem.goal || k.mem.round !== v.round) {
            k.mem.round = v.round;
            k.mem.goal = v.maxPop * (k.level === "hard" ? r(k, 0.5, 0.68) : r(k, 0.3, 0.75));
        }
        if (v.size[k.seat] >= k.mem.goal) return { move: { act: "bank", round: v.round }, wait: r(k, 150, 500) };
        return { move: { act: "pump", round: v.round }, wait: r(k, 140, 320) };
    },
    tugofwar(v, k) {
        if (v.phase !== "play" || k.now() < v.startAt) return null;
        return { move: { taps: k.level === "hard" ? 4 : 3 }, wait: r(k, 280, 360) };
    },
    inkclash(v, k) {
        if (v.phase !== "play" || !v.me.cards.length) return null;
        const card = v.me.cards[0];
        const right = card[2] === 1 ? card[0] : card[1];
        const good = k.rng() < (k.level === "hard" ? 0.95 : 0.82);
        return { move: { i: v.me.pos, pick: good ? right : pick(k, [0, 1, 2, 3].filter((c) => c !== right)) }, wait: think(k, [800, 1300], [480, 760]) };
    },
    hushbid(v, k) {
        if (v.phase !== "bid" || v.me.bid !== null || k.mem.lot === v.lot) return null;
        k.mem.lot = v.lot;
        const lot = v.lots[v.lot];
        const left = v.lots.length - v.lot;
        const worth = lot.mystery ? 6 : lot.value;
        const share = v.purse / Math.max(1, left);
        const amt = Math.max(0, Math.min(v.purse, Math.round(share * (worth / 6) * (k.level === "hard" ? r(k, 0.8, 1.25) : r(k, 0.4, 1.6)))));
        return { move: { act: "bid", amt }, wait: r(k, 1500, 5000) };
    },
    liarsdice(v, k) {
        if (v.phase !== "bid" || !v.myTurn) return null;
        const total = v.total;
        const others = total - v.myDice.length;
        const mine = (f) => v.myDice.filter((d) => d === f || (f !== 1 && d === 1)).length;
        const expect = (f) => mine(f) + others * (f === 1 ? 1 / 6 : 1 / 3);
        const b = v.bid;
        const wait = r(k, 1400, 3500);
        if (b && b.q > expect(b.f) + (k.level === "hard" ? 0.6 : 1.4)) return { move: { act: "liar" }, wait };
        // raise: the face I hold most of
        const faces = [2, 3, 4, 5, 6].sort((x, y) => mine(y) - mine(x));
        const tries = [];
        for (const f of faces) {
            const q0 = b ? (f > b.f && b.f !== 1 ? b.q : b.q + 1) : Math.max(1, Math.round(expect(f) * 0.7));
            for (let q = q0; q <= q0 + 2; q++) tries.push({ act: "bid", q, f });
        }
        if (b) tries.push({ act: "liar" });
        return { moves: tries, wait };
    },
    memory(v, k) {
        const s = k.state;
        if (s.turn !== k.seat || s.waiting) return null;
        const cards = s.decks[s.deck];
        // remember cards seen face up (easy forgets half of them)
        const seen = (k.mem.seen = k.mem.seen || {});
        v.cards.forEach((c, i) => {
            if (c.face !== null && c.owner === null && seen[i] === undefined && (k.level === "hard" || k.rng() < 0.5)) seen[i] = cards[i].pair;
        });
        const open = v.cards.map((c, i) => (c.owner === null && !c.up ? i : -1)).filter((i) => i >= 0);
        const up = v.cards.map((c, i) => (c.owner === null && c.up ? i : -1)).filter((i) => i >= 0);
        Object.keys(seen).forEach((i) => v.cards[i].owner !== null && delete seen[i]);
        let choice;
        if (up.length === 1) {
            const want = cards[up[0]].pair;
            const known = open.find((i) => seen[i] === want && i !== up[0]);
            choice = known !== undefined ? known : pick(k, open.filter((i) => seen[i] === undefined).concat(open).slice(0, Math.max(1, open.length)));
        } else {
            const pairs = {};
            let found;
            open.forEach((i) => {
                if (seen[i] === undefined) return;
                if (pairs[seen[i]] !== undefined) found = pairs[seen[i]];
                else pairs[seen[i]] = i;
            });
            const fresh = open.filter((i) => seen[i] === undefined);
            choice = found !== undefined ? found : pick(k, fresh.length ? fresh : open);
        }
        if (choice === undefined) return null;
        return { move: { card: choice }, wait: r(k, 700, 1400) };
    },
    battleship(v, k) {
        if (v.over) return null;
        if (v.phase === "setup") {
            if (v.ready[k.seat]) return null;
            return { move: { fleet: v.fleet.map((s) => ({ i: s.i, v: s.v })) }, wait: r(k, 1500, 4000) };
        }
        if (!v.myTurn) return null;
        const shots = v.myShots;
        const N = 10;
        const free = range(100).filter((i) => shots[i] === null);
        const near = (i) => [i - N, i + N, i % N ? i - 1 : -1, i % N < N - 1 ? i + 1 : -1].filter((j) => j >= 0 && j < 100 && shots[j] === null);
        // hunt around hits; on hard, follow a line of hits and use a checkerboard search
        let targets = [];
        if (k.level === "hard" || k.rng() < 0.6) shots.forEach((x, i) => x === "h" && near(i).forEach((j) => targets.push(j)));
        if (k.level === "hard") {
            const line = targets.filter((j) => shots.some((x, i) => x === "h" && (shots[2 * i - j] === "h")));
            if (line.length) targets = line;
        }
        const parity = free.filter((i) => (Math.floor(i / N) + (i % N)) % 2 === 0);
        const pool = targets.length ? targets : k.level === "hard" && parity.length ? parity : free;
        return { move: { i: pick(k, pool) }, wait: r(k, 900, 2000) };
    },
};

module.exports = { BOTS, search, clone, quiet };
