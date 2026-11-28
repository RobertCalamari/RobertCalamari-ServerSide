// Secret Recipe: the head chef's secret dish is one base, one sauce and one topping, hidden in an envelope. The other
// 12 ingredient cards are dealt out (any left over sit face up on the counter). On your turn, ask about a dish
// ("Is it Taco with Mango Glaze and Sprinkles?"). Going round the table, the first player holding any of those
// ingredients secretly shows you one (they choose which). Everyone sees that a card was shown, not which. Think you
// know it? Solve instead: right wins, wrong and you're out (you still show cards when asked).
const { seats } = require("../rank");
const TURN_MS = 50000;
const SHOW_MS = 25000;
const CARDS = [
    { g: 0, name: "Pancake", icon: "🥞" }, { g: 0, name: "Taco", icon: "🌮" }, { g: 0, name: "Pizza", icon: "🍕" }, { g: 0, name: "Ramen", icon: "🍜" }, { g: 0, name: "Sundae", icon: "🍨" },
    { g: 1, name: "Mango Glaze", icon: "🥭" }, { g: 1, name: "Hot Honey", icon: "🍯" }, { g: 1, name: "Garlic Butter", icon: "🧄" }, { g: 1, name: "Chili Crunch", icon: "🌶️" }, { g: 1, name: "Maple Syrup", icon: "🍁" },
    { g: 2, name: "Sprinkles", icon: "🎉" }, { g: 2, name: "Pickles", icon: "🥒" }, { g: 2, name: "Fried Egg", icon: "🍳" }, { g: 2, name: "Gummy Bears", icon: "🧸" }, { g: 2, name: "Bacon Bits", icon: "🥓" },
];
const GROUPS = ["Base", "Sauce", "Topping"];

function nextTurn(state, ctx, from) {
    const n = state.hands.length;
    for (let k = 1; k <= n; k++) {
        const s = (from + k) % n;
        if (!state.out[s]) return startTurn(state, ctx, s);
    }
    end(state, null);
}
function startTurn(state, ctx, s) {
    state.phase = "ask";
    state.turn = s;
    state.ask = null;
    arm(state, ctx, TURN_MS, () => {
        state.log.push({ s, kind: "skip" });
        nextTurn(state, ctx, s);
    });
}
function arm(state, ctx, ms, fn) {
    const id = ++state.tick;
    state.deadline = state.timed ? ctx.now() + ms : null;
    if (state.timed) ctx.later(ms, () => state.tick === id && state.phase !== "done" && fn());
}
function end(state, winner) {
    state.phase = "done";
    state.winner = winner;
    state.deadline = null;
    state.tick++;
}
// who has to show: the first player after the asker holding any of the three
function holder(state, asker, dish) {
    const n = state.hands.length;
    for (let k = 1; k < n; k++) {
        const s = (asker + k) % n;
        if (state.hands[s].some((c) => dish.includes(c))) return s;
    }
    return null;
}
function shown(state, ctx, s, card) {
    const a = state.ask;
    state.seen[a.by].push(card);
    state.log.push({ s: a.by, kind: "ask", dish: a.dish, by: s, n: ++state.n });
    state.private[a.by] = { from: s, card, n: state.n };
    nextTurn(state, ctx, a.by);
}

function pub(state) {
    return {
        phase: state.phase,
        turn: state.turn,
        deadline: state.deadline,
        cards: CARDS,
        groups: GROUPS,
        counter: state.counter,
        counts: state.hands.map((h) => h.length),
        out: state.out,
        ask: state.ask ? { by: state.ask.by, dish: state.ask.dish, from: state.ask.from } : null,
        log: state.log.slice(-8),
        winner: state.winner,
        secret: state.phase === "done" ? state.secret : null,
    };
}

module.exports = {
    id: "recipe",
    name: "Secret Recipe",
    kind: "turn",
    quick: false,
    players: [2, 6],
    options: { timer: [true, false] },
    CARDS,
    init({ rng, ctx, players = 3, options = {} }) {
        const pickG = (g) => {
            const ids = CARDS.map((c, i) => (c.g === g ? i : -1)).filter((i) => i >= 0);
            return ids[Math.floor(rng() * ids.length)];
        };
        const secret = [pickG(0), pickG(1), pickG(2)];
        const rest = CARDS.map((_, i) => i).filter((i) => !secret.includes(i));
        for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        const per = Math.floor(rest.length / players);
        const hands = seats(players).map((s) => rest.slice(s * per, s * per + per).sort((a, b) => a - b));
        const counter = rest.slice(per * players).sort((a, b) => a - b);
        const state = { secret, hands, counter, seen: seats(players).map(() => []), private: seats(players).map(() => null), out: new Array(players).fill(false), timed: options.timer !== false, phase: "ask", turn: 0, ask: null, log: [], winner: null, deadline: null, tick: 0, n: 0 };
        startTurn(state, ctx, Math.floor(rng() * players));
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.me = { hand: state.hands[seat], seen: state.seen[seat], last: state.private[seat] };
        v.myTurn = state.phase === "ask" && state.turn === seat;
        v.mustShow = state.phase === "show" && state.ask.from === seat ? state.hands[seat].filter((c) => state.ask.dish.includes(c)) : null;
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (state.phase === "done") return { error: "The recipe is out!" };
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.act === "show") {
            if (state.phase !== "show" || state.ask.from !== seat) return { error: "Nobody's waiting on you." };
            if (!state.ask.dish.includes(p.card) || !state.hands[seat].includes(p.card)) return { error: "Show one of the asked cards you hold." };
            shown(state, ctx, seat, p.card);
            return { ok: true };
        }
        if (state.phase !== "ask" || state.turn !== seat) return { error: "It's not your turn." };
        const dish = p.dish;
        if (!Array.isArray(dish) || dish.length !== 3 || !dish.every((c, g) => Number.isInteger(c) && CARDS[c] && CARDS[c].g === g)) return { error: "Pick a base, a sauce and a topping." };
        if (p.act === "solve") {
            const right = dish.every((c, g) => c === state.secret[g]);
            state.log.push({ s: seat, kind: "solve", dish, right, n: ++state.n });
            if (right) end(state, seat);
            else {
                state.out[seat] = true;
                if (state.out.every(Boolean)) end(state, null);
                else nextTurn(state, ctx, seat);
            }
            return { ok: true };
        }
        if (p.act !== "ask") return { error: "Bad move." };
        const from = holder(state, seat, dish);
        state.ask = { by: seat, dish, from };
        if (from === null) {
            state.log.push({ s: seat, kind: "ask", dish, by: null, n: ++state.n });
            state.private[seat] = { from: null, n: state.n };
            nextTurn(state, ctx, seat);
            return { ok: true };
        }
        state.phase = "show";
        arm(state, ctx, SHOW_MS, () => {
            const can = state.hands[from].filter((c) => dish.includes(c));
            shown(state, ctx, from, can[Math.floor(ctx.rng() * can.length)]);
        });
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        const dish = state.secret.map((c) => CARDS[c].name).join(" + ");
        if (state.winner === null) return { winner: null, places: state.hands.map(() => 1), text: "Nobody cracked it: " + dish };
        return { winner: state.winner, places: state.hands.map((_, s) => (s === state.winner ? 1 : 2)), text: "Cracked the recipe: " + dish };
    },
};
