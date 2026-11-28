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

const BOTS = {
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
