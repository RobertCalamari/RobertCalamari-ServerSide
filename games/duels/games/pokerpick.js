const SUITS = ["S", "H", "D", "C"];
const MEMORIZE_MS = 10000;
const PICK_MS = 30000;
const REVEAL_MS = 6000;
const FINAL_MS = 4000;
const MAX_ROUNDS = 9;
const NAMES = { 2: "2s", 3: "3s", 4: "4s", 5: "5s", 6: "6s", 7: "7s", 8: "8s", 9: "9s", 10: "10s", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces" };
const HIGH = { 11: "Jack", 12: "Queen", 13: "King", 14: "Ace" };
const one = (r) => HIGH[r] || String(r);

// 5 cards {r: 2..14, s} -> { score: [category, ...tiebreakers], name }
function evaluate(cards) {
    const counts = {};
    cards.forEach((c) => (counts[c.r] = (counts[c.r] || 0) + 1));
    const groups = Object.keys(counts)
        .map((r) => [counts[r], Number(r)])
        .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const ranks = groups.map((g) => g[1]);
    const flush = cards.every((c) => c.s === cards[0].s);
    let straight = 0;
    if (groups.length === 5) {
        if (ranks[0] - ranks[4] === 4) straight = ranks[0];
        else if (ranks[0] === 14 && ranks[1] === 5) straight = 5;
    }
    if (straight && flush) return { score: [8, straight], name: straight === 14 ? "Royal Flush" : "Straight Flush" };
    if (groups[0][0] === 4) return { score: [7, ...ranks], name: "Four " + NAMES[ranks[0]] };
    if (groups[0][0] === 3 && groups[1][0] === 2) return { score: [6, ...ranks], name: "Full House, " + NAMES[ranks[0]] + " over " + NAMES[ranks[1]] };
    if (flush) return { score: [5, ...ranks], name: one(ranks[0]) + "-high Flush" };
    if (straight) return { score: [4, straight], name: one(straight) + "-high Straight" };
    if (groups[0][0] === 3) return { score: [3, ...ranks], name: "Three " + NAMES[ranks[0]] };
    if (groups[0][0] === 2 && groups[1][0] === 2) return { score: [2, ...ranks], name: "Two Pair, " + NAMES[ranks[0]] + " & " + NAMES[ranks[1]] };
    if (groups[0][0] === 2) return { score: [1, ...ranks], name: "Pair of " + NAMES[ranks[0]] };
    return { score: [0, ...ranks], name: one(ranks[0]) + " High" };
}

function compare(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] || 0) - (b[i] || 0);
        if (d) return d > 0 ? 1 : -1;
    }
    return 0;
}

function deal(state, rng, ctx) {
    const deck = [];
    SUITS.forEach((s) => {
        for (let r = 2; r <= 14; r++) deck.push({ r, s });
    });
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    state.round++;
    state.phase = "memorize";
    state.grid = deck.slice(0, 12);
    state.community = deck.slice(12, 15);
    state.picks = [null, null];
    state.memorizeUntil = ctx.now() + MEMORIZE_MS;
    state.deadline = state.memorizeUntil + PICK_MS;
    const round = state.round;
    ctx.later(MEMORIZE_MS, () => {
        if (state.round === round && state.phase === "memorize") state.phase = "pick";
    });
    ctx.later(MEMORIZE_MS + PICK_MS + 300, () => {
        if (state.round !== round || state.phase !== "pick") return;
        resolve(state, rng, ctx, true);
    });
}

function resolve(state, rng, ctx, timeout) {
    const auto = [false, false];
    for (let seat = 0; seat < 2; seat++) {
        if (state.picks[seat]) continue;
        const a = Math.floor(rng() * 12);
        let b = Math.floor(rng() * 11);
        if (b >= a) b++;
        state.picks[seat] = [a, b];
        auto[seat] = true;
    }
    const hands = state.picks.map((p) => evaluate([state.grid[p[0]], state.grid[p[1]], ...state.community]));
    const c = compare(hands[0].score, hands[1].score);
    const winner = c === 0 ? null : c > 0 ? 0 : 1;
    if (winner !== null) state.wins[winner]++;
    state.phase = "reveal";
    state.reveal = {
        round: state.round,
        grid: state.grid,
        community: state.community,
        picks: state.picks,
        hands: hands.map((h) => ({ name: h.name, rank: h.score[0] })),
        winner,
        auto,
        timeout: !!timeout,
    };
    const decided = state.wins[0] >= 2 || state.wins[1] >= 2 || state.round >= MAX_ROUNDS;
    if (decided) {
        ctx.later(FINAL_MS, () => {
            state.over = true;
        });
    } else {
        const round = state.round;
        state.nextAt = ctx.now() + REVEAL_MS;
        ctx.later(REVEAL_MS, () => {
            if (state.round === round && state.phase === "reveal") deal(state, rng, ctx);
        });
    }
}

module.exports = {
    id: "pokerpick",
    name: "Poker Pick",
    kind: "sim",
    quick: true,
    evaluate,
    compare,
    init({ rng, ctx }) {
        const state = { round: 0, wins: [0, 0], phase: "pick", grid: [], community: [], picks: [null, null], memorizeUntil: 0, deadline: 0, reveal: null, nextAt: null, over: false };
        deal(state, rng, ctx);
        return state;
    },
    view(state, seat) {
        return {
            round: state.round,
            phase: state.phase,
            grid: state.phase === "pick" ? state.grid.map(() => null) : state.grid,
            community: state.community,
            memorizeUntil: state.memorizeUntil,
            myPick: state.picks[seat],
            theyLocked: !!state.picks[1 - seat],
            wins: state.wins,
            deadline: state.deadline,
            nextAt: state.nextAt,
            reveal: state.reveal,
            over: state.over,
        };
    },
    move(state, seat, p, ctx) {
        if (state.phase === "memorize") return { error: "Memorize first! Picking opens when the cards flip." };
        if (state.phase !== "pick") return { error: "Wait for the next deal." };
        if (state.picks[seat]) return { error: "You already locked in." };
        const pick = Array.isArray(p.pick) ? p.pick.map(Number) : [];
        if (pick.length !== 2 || pick[0] === pick[1] || !pick.every((i) => Number.isInteger(i) && i >= 0 && i < 12)) return { error: "Pick exactly 2 cards." };
        state.picks[seat] = pick;
        if (state.picks[0] && state.picks[1]) resolve(state, ctx.rng, ctx, false);
        return { ok: true };
    },
    result(state) {
        if (!state.over) return null;
        const [a, b] = state.wins;
        if (a === b) return { winner: null, text: "Even at " + a + "-" + b + "." };
        const w = a > b ? 0 : 1;
        const h = state.reveal && state.reveal.winner === w ? state.reveal.hands[w].name : null;
        return { winner: w, text: (h ? h + " takes it, " : "") + Math.max(a, b) + "-" + Math.min(a, b) + "." };
    },
};
