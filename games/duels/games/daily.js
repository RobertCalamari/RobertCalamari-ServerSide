// Daily Puzzle: one puzzle a day, the same for everyone (the America/New_York date is the seed). The kind rotates:
// Digit Target, Word Ladder, Slide Puzzle, Word Mine (75 s) and a five-pattern Next in Line set, each built with that
// game's own helpers. Everyone plays at their own pace; the score is posted to the day's leaderboard when you finish.
// The leaderboard lives in this server's memory (it resets on a restart and at midnight). "One try a day" is only a flag
// on the phone (the client sends practice: true on repeats): without accounts the server can't really enforce it.
const { ranked, seats } = require("../rank");
const { count, fits, VALID, TOP } = require("../words");
const { pickLadder, badStep } = require("../ladder");
const { scramble, play, isSolved, distance } = require("../slide");
const target = require("./digittarget");
const mine = require("./wordmine");
const nextup = require("./nextup");
const READY_MS = 3000;

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const dateOf = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
const dayNo = (date) => Math.round(Date.UTC(...date.split("-").map((x, i) => Number(x) - (i === 1 ? 1 : 0))) / 864e5);
const left = (ms, limit) => Math.max(0, 1 - ms / limit);

const KINDS = {
    target: {
        label: "Digit Target",
        icon: "🎯",
        limit: 120000,
        rules: "Hit the target with the four digits and + − × ÷ ( ) !, each digit once. Exact = 60 plus up to 40 for speed; within 1 = 40, within 5 = 25, within 10 = 10.",
        make: (rng) => target.makeRound(rng, 3),
        seat: () => ({ best: null, last: null, tries: 0 }),
        pub: (z) => ({ digits: z.digits, target: z.target }),
        after: (z) => ({ how: z.how }),
        mine: (m) => ({ last: m.last, tries: m.tries, exact: !!m.best && m.best.gap === 0, best: m.done && m.best ? { e: m.best.e, v: m.best.v } : null }),
        move(z, m, p) {
            if (p.act === "done") return { finish: true };
            const res = target.evaluate(p.tokens, z.digits);
            if (res.error) return { error: res.error };
            const g = Math.abs(res.v[0] / res.v[1] - z.target);
            const e = p.tokens.map((t) => (t[0] === "d" ? z.digits[Number(t.slice(1))] : { "*": "×", "/": "÷", "-": "−" }[t] || t)).join(" ").replace(/(\d) (?=\d)/g, "$1").replace(/\( /g, "(").replace(/ ([)!])/g, "$1");
            m.last = e;
            m.tries++;
            if (!m.best || g < m.best.gap) m.best = { e, v: res.v, gap: Math.round(g * 1000) / 1000 };
            return { finish: g === 0 };
        },
        score: (z, m, ms, limit) => (!m.best ? 0 : m.best.gap === 0 ? 60 + Math.round(40 * left(ms, limit)) : m.best.gap <= 1 ? 40 : m.best.gap <= 5 ? 25 : m.best.gap <= 10 ? 10 : 0),
    },
    ladder: {
        label: "Word Ladder",
        icon: "🪜",
        limit: 180000,
        rules: "Change one letter at a time to reach the target; every step must be a real word. Getting there = 50, plus up to 25 for the shortest ladder (−5 a step over) and up to 25 for speed.",
        make: (rng, day) => pickLadder(rng, day % 2 ? 5 : 4, 5, 7),
        seat: (z) => ({ chain: [z.start] }),
        pub: (z) => ({ start: z.start, target: z.target, best: z.path.length - 1 }),
        after: (z) => ({ path: z.path }),
        mine: (m) => ({ chain: m.chain }),
        move(z, m, p) {
            if (p.act === "out") return { finish: true };
            if (p.act === "undo") {
                if (m.chain.length > 1) m.chain.pop();
                return {};
            }
            if (typeof p.w !== "string" || p.w.length > 10) return { error: "Bad word." };
            const w = p.w.toLowerCase();
            const why = badStep(m.chain, w);
            if (why) return { error: why };
            if (m.chain.length > 40) return { error: "That ladder's long enough. Undo a few." };
            m.chain.push(w);
            return { finish: w === z.target };
        },
        score: (z, m, ms, limit) => (m.chain[m.chain.length - 1] !== z.target ? 0 : 50 + Math.max(0, 25 - 5 * (m.chain.length - z.path.length)) + Math.round(25 * left(ms, limit))),
    },
    slide: {
        label: "Slide Puzzle",
        icon: "🧩",
        limit: 240000,
        rules: "Slide the tiles back into order, 1 to 15. Solving = 50, plus up to 30 for speed and up to 20 for few moves.",
        make: (rng) => ({ size: 4, tiles: scramble(rng, 4, 50) }),
        seat: () => ({ moves: 0, solved: false }),
        pub: (z) => ({ size: z.size, tiles: z.tiles }),
        after: () => ({}),
        mine: (m) => ({ moves: m.moves, solved: m.solved }),
        move(z, m, p) {
            if (p.act === "out") return { finish: true };
            const b = play(z.tiles, z.size, p.moves);
            if (!b) return { error: "Those moves don't add up." };
            if (!isSolved(b)) return { error: "Not solved yet." };
            m.moves = p.moves.length;
            m.solved = true;
            return { finish: true };
        },
        score: (z, m, ms, limit) => (!m.solved ? 0 : 50 + Math.round(30 * left(ms, limit)) + Math.round(20 * Math.min(1, (1.5 * distance(z.tiles, z.size)) / m.moves))),
    },
    mine: {
        label: "Word Mine",
        icon: "⛏️",
        limit: 75000,
        rules: "Make words of 3+ letters from the long word's letters, each letter as often as it appears. 3 letters = 1 · 4 = 2 · 5 = 3 · 6 = 5 · 7+ = 8 · all of them = +5. 75 seconds.",
        make(rng) {
            const { word, all } = mine.pickWord(rng);
            const letters = word.split("");
            for (let i = letters.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [letters[i], letters[j]] = [letters[j], letters[i]];
            }
            return { word, all, letters };
        },
        seat: () => ({ words: [] }),
        pub: (z) => ({ letters: z.letters.map((c) => c.toUpperCase()), len: z.word.length }),
        after: (z, m) => ({ word: z.word, possible: z.all.length, missed: z.all.filter((w) => !m.words.includes(w)).sort((a, b) => TOP.has(b) - TOP.has(a) || b.length - a.length).slice(0, 12) }),
        mine: (m, z) => ({ words: m.words.slice().reverse(), points: m.words.reduce((t, w) => t + mine.points(w, z.word.length), 0) }),
        move(z, m, p) {
            if (p.act === "stop") return { finish: true };
            if (typeof p.w !== "string" || p.w.length > 20) return { error: "Bad word." };
            const w = p.w.toLowerCase();
            if (!/^[a-z]+$/.test(w)) return { error: "Letters only." };
            if (w.length < 3) return { error: "3 letters or more." };
            if (!fits(w, count(z.word))) return { error: "Not enough letters for that." };
            if (m.words.includes(w)) return { error: "Already got it." };
            if (!VALID.has(w)) return { error: "Not in the dictionary." };
            m.words.push(w);
            return {};
        },
        score: (z, m) => m.words.reduce((t, w) => t + mine.points(w, z.word.length), 0),
    },
    nextup: {
        label: "Next in Line",
        icon: "🔢",
        limit: 90000,
        rules: "Five number patterns, getting trickier. Pick what comes next: one tap, no take-backs. Right = 10 plus up to 10 for speed.",
        make(rng) {
            const used = [];
            return { qs: [1, 3, 5, 7, 9].map((i) => nextup.makeQuestion(rng, i, used)) };
        },
        seat: () => ({ picks: [], pts: [], at: 0 }),
        pub: (z) => ({ total: z.qs.length }),
        after: () => ({}),
        mine: (m, z) => ({
            q: m.picks.length < z.qs.length ? { seq: z.qs[m.picks.length].seq, choices: z.qs[m.picks.length].choices } : null,
            past: m.picks.map((c, i) => ({ seq: z.qs[i].seq, choices: z.qs[i].choices, pick: c, answer: z.qs[i].answer, rule: z.qs[i].rule, got: m.pts[i] })),
        }),
        move(z, m, p, now) {
            const c = p.choice;
            if (p.q !== m.picks.length || !Number.isInteger(c) || c < 0 || c > 3) return { error: "Pick an answer." };
            const right = c === z.qs[m.picks.length].answer;
            m.pts.push(right ? 10 + Math.round(10 * left(now - m.at, 15000)) : 0);
            m.picks.push(c);
            m.at = now;
            return { finish: m.picks.length === z.qs.length };
        },
        score: (z, m) => m.pts.reduce((a, b) => a + b, 0),
    },
};
const ORDER = ["target", "ladder", "slide", "mine", "nextup"];

// today's leaderboard, in memory only
const BOARD = { date: null, rows: [], n: 0 };
function post(date, name, score, ms) {
    if (BOARD.date !== date) {
        if (BOARD.date && date < BOARD.date) return null;
        Object.assign(BOARD, { date, rows: [] });
    }
    const row = { id: ++BOARD.n, name, score, ms };
    BOARD.rows.push(row);
    BOARD.rows.sort((a, b) => b.score - a.score || a.ms - b.ms || a.id - b.id);
    BOARD.rows.length = Math.min(BOARD.rows.length, 1000);
    return row.id;
}
function board(date, id) {
    if (BOARD.date !== date) return { top: [], rank: null, count: 0 };
    const at = BOARD.rows.findIndex((r) => r.id === id);
    return { top: BOARD.rows.slice(0, 10).map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, ms: r.ms, me: r.id === id })), rank: at >= 0 ? at + 1 : null, count: BOARD.rows.length };
}

function puzzleFor(date) {
    const day = dayNo(date);
    const kind = ORDER[((day % ORDER.length) + ORDER.length) % ORDER.length];
    return { kind, puzzle: KINDS[kind].make(mulberry32(hash("daily " + date)), day) };
}

function finish(state, s, now) {
    const m = state.seats[s];
    if (m.done) return;
    const K = KINDS[state.kind];
    m.done = true;
    m.ms = Math.min(K.limit, Math.max(0, now - state.startAt));
    m.score = K.score(state.puzzle, m, m.ms, K.limit);
    if (!m.practice) m.row = post(state.date, m.name, m.score, m.ms);
    if (state.seats.every((x) => x.done)) state.phase = "done";
}

function pub(state) {
    const K = KINDS[state.kind];
    return {
        date: state.date,
        kind: state.kind,
        label: K.label,
        icon: K.icon,
        rules: K.rules,
        phase: state.phase,
        startAt: state.startAt,
        endAt: state.startAt + K.limit,
        limit: K.limit,
        puzzle: state.phase === "ready" ? null : K.pub(state.puzzle),
        done: state.seats.map((m) => m.done),
        scores: state.seats.map((m) => (m.done ? m.score : null)),
        times: state.seats.map((m) => (m.done ? m.ms : null)),
    };
}

module.exports = {
    id: "daily",
    name: "Daily Puzzle",
    kind: "race",
    quick: true,
    players: [1, 10],
    KINDS,
    dateOf,
    puzzleFor,
    init({ ctx, players = 2, date }) {
        const day = date || dateOf(ctx.now());
        const { kind, puzzle } = puzzleFor(day);
        const K = KINDS[kind];
        const startAt = ctx.now() + READY_MS;
        const state = { date: day, kind, puzzle, phase: "ready", startAt, seats: seats(players).map(() => ({ name: "Player", practice: false, done: false, ms: null, score: 0, row: null, ...K.seat(puzzle) })) };
        ctx.later(READY_MS, (now) => {
            state.phase = "play";
            state.seats.forEach((m) => (m.at = now));
        });
        ctx.later(READY_MS + K.limit + 300, (now) => state.seats.forEach((m, s) => finish(state, s, now)));
        return state;
    },
    view(state, seat) {
        const K = KINDS[state.kind];
        const m = state.seats[seat];
        const v = pub(state);
        v.me = { done: m.done, practice: m.practice, score: m.done ? m.score : null, ms: m.ms, ...(state.phase === "ready" ? {} : K.mine(m, state.puzzle)) };
        if (m.done) Object.assign(v.me, K.after(state.puzzle, m), { board: board(state.date, m.row) });
        return v;
    },
    tv(state) {
        const v = pub(state);
        if (state.phase === "done") v.board = board(state.date, null);
        return v;
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        const m = state.seats[seat];
        if (p.act === "hi") {
            if (typeof p.name === "string" && p.name.trim()) m.name = p.name.trim().slice(0, 20);
            if (!m.done && !m.row) m.practice = !!p.practice;
            return { ok: true, quiet: true };
        }
        if (state.phase !== "play") return { error: state.phase === "ready" ? "Not yet!" : "Time's up." };
        if (m.done) return { error: "You've finished today's puzzle." };
        const r = KINDS[state.kind].move(state.puzzle, m, p, ctx.now());
        if (r.error) return { error: r.error };
        if (r.finish) finish(state, seat, ctx.now());
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const K = KINDS[state.kind];
        const sc = state.seats.map((m) => m.score);
        if (sc.length === 1) return { winner: 0, places: [1], text: K.icon + " " + K.label + " · " + sc[0] + " points" };
        return ranked(sc, "high", K.icon + " " + K.label + " · top score " + Math.max(...sc));
    },
};
