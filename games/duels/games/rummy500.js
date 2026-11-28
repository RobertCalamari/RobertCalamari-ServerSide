// Rummy 500: draw from the stock, or take any card from the discard pile along with every card above it (the card you
// dug for must be melded that turn). Meld sets (3-4 of a rank) and runs (3+ in a suit, ace low or high, no wrapping),
// lay off on anyone's melds, then discard. A hand ends when someone has no cards left or the stock runs out: you score
// the cards you melded minus the cards still in your hand. First to TARGET wins.
const { rank, suit, label, isCard, deck, take, pause } = require("../deck");
const { ranked } = require("../rank");
const TARGET = 300;
const SHORT = 200;
const TURN_MS = 60000;
const AFK_MS = 10000;
const SCORE_MS = 9000;

const value = (c) => (rank(c) === 14 ? 15 : rank(c) >= 10 ? 10 : rank(c));
const vals = (c) => (rank(c) === 14 ? [1, 14] : [rank(c)]);

// run order for a list of cards (same suit, consecutive, ace low or high) or null
function runOf(cards) {
    if (cards.length < 3 || !cards.every((c) => suit(c) === suit(cards[0]))) return null;
    for (const low of [true, false]) {
        const v = cards.map((c) => (rank(c) === 14 && low ? 1 : rank(c)));
        const sorted = v.slice().sort((a, b) => a - b);
        if (sorted.every((x, i) => !i || x === sorted[i - 1] + 1)) {
            return { low: low && cards.some((c) => rank(c) === 14), order: cards.slice().sort((a, b) => v[cards.indexOf(a)] - v[cards.indexOf(b)]) };
        }
    }
    return null;
}

function typeOf(cards) {
    if (cards.length < 3 || new Set(cards).size !== cards.length) return null;
    if (cards.length <= 4 && cards.every((c) => c[0] === cards[0][0])) return "set";
    return runOf(cards) ? "run" : null;
}

// a way to meld `card` right now: { layoff: id } or { cards: [...] } (cards from hand plus `card`), or null
function findMeld(card, hand, melds) {
    for (const m of melds) if (typeOf(m.cards.map((x) => x.c).concat(card)) === m.type) return { layoff: m.id };
    const others = hand.filter((c) => c !== card);
    const same = others.filter((c) => c[0] === card[0]);
    if (same.length >= 2) return { cards: [card, same[0], same[1]] };
    const at = (v) => others.find((c) => suit(c) === suit(card) && vals(c).includes(v));
    for (const v of vals(card)) {
        for (const w of [[v - 2, v - 1], [v - 1, v + 1], [v + 1, v + 2]]) {
            const got = w.map(at);
            if (got.every(Boolean)) return { cards: [card, ...got] };
        }
    }
    return null;
}

function meldPoints(m) {
    const low = m.type === "run" && runOf(m.cards.map((x) => x.c)).low;
    return (seat) => m.cards.filter((x) => x.by === seat).reduce((a, x) => a + (low && rank(x.c) === 14 ? 1 : value(x.c)), 0);
}
const melded = (state, s) => state.melds.reduce((a, m) => a + meldPoints(m)(s), 0);
const handPoints = (hand) => hand.reduce((a, c) => a + value(c), 0);

function tidy(m) {
    const cs = m.cards.map((x) => x.c);
    const order = m.type === "run" ? runOf(cs).order : cs.slice().sort((a, b) => "SHCD".indexOf(suit(a)) - "SHCD".indexOf(suit(b)));
    m.cards = order.map((c) => m.cards.find((x) => x.c === c));
}

function deal(state, ctx) {
    const d = deck(ctx.rng);
    const size = state.n === 2 ? 13 : 7;
    state.hand++;
    state.dealer = (state.dealer + 1) % state.n;
    state.hands = Array.from({ length: state.n }, (_, i) => d.slice(i * size, i * size + size));
    state.discard = [d[state.n * size]];
    state.stock = d.slice(state.n * size + 1);
    state.melds = [];
    state.summary = null;
    state.log = null;
    startTurn(state, (state.dealer + 1) % state.n, ctx);
}

function startTurn(state, s, ctx) {
    state.turn = s;
    state.phase = "draw";
    state.must = null;
    state.took = null;
    state.didMeld = false;
    const ms = state.afk[s] >= 2 ? AFK_MS : TURN_MS;
    state.deadline = ctx.now() + ms;
    const key = ++state.tick;
    ctx.later(ms, () => {
        if (state.tick === key && state.turn === s) timeout(state, s, ctx);
    });
}

function timeout(state, s, ctx) {
    state.afk[s]++;
    const hand = state.hands[s];
    if (state.phase === "meld" && state.must && !state.didMeld) undo(state, s);
    if (state.phase === "draw") draw(state, s);
    if (state.must) {
        const f = findMeld(state.must, hand, state.melds);
        if (f && f.layoff !== undefined) layoff(state, s, f.layoff, [state.must], ctx);
        else if (f) meld(state, s, f.cards, ctx);
        state.must = null;
        if (state.phase !== "meld") return;
    }
    const c = hand.slice().sort((a, b) => value(b) - value(a) || rank(b) - rank(a))[0];
    discard(state, s, c, ctx, true);
}

function draw(state, s) {
    state.hands[s].push(state.stock.pop());
    state.phase = "meld";
    state.log = { seat: s, act: "draw" };
}

function undo(state, s) {
    take(state.hands[s], state.took.cards);
    state.discard = state.discard.concat(state.took.cards);
    state.took = null;
    state.must = null;
    state.phase = "draw";
    state.log = { seat: s, act: "undo" };
}

function meld(state, s, cards, ctx) {
    take(state.hands[s], cards);
    const m = { id: ++state.nextId, type: typeOf(cards), cards: cards.map((c) => ({ c, by: s })) };
    tidy(m);
    state.melds.push(m);
    after(state, s, cards, ctx, { seat: s, act: "meld", cards });
}

function layoff(state, s, id, cards, ctx) {
    const m = state.melds.find((x) => x.id === id);
    take(state.hands[s], cards);
    m.cards = m.cards.concat(cards.map((c) => ({ c, by: s })));
    tidy(m);
    after(state, s, cards, ctx, { seat: s, act: "layoff", cards });
}

function after(state, s, cards, ctx, log) {
    state.didMeld = true;
    state.log = log;
    if (state.must && cards.includes(state.must)) state.must = null;
    if (!state.hands[s].length) score(state, s, ctx);
}

function discard(state, s, c, ctx, auto) {
    take(state.hands[s], [c]);
    state.discard.push(c);
    state.log = { seat: s, act: "discard", cards: [c], auto: !!auto };
    if (!state.hands[s].length) return score(state, s, ctx);
    if (!state.stock.length) return score(state, null, ctx);
    startTurn(state, (s + 1) % state.n, ctx);
}

function score(state, out, ctx) {
    const rows = state.hands.map((h, s) => {
        const m = melded(state, s), left = handPoints(h);
        return { melded: m, left, pts: m - left, total: state.scores[s] + m - left };
    });
    state.scores = rows.map((r) => r.total);
    state.summary = { rows, out };
    state.turn = null;
    state.tick++;
    const top = Math.max(...state.scores);
    if (top >= state.target && state.scores.filter((x) => x === top).length === 1) {
        state.phase = "over";
        return;
    }
    state.phase = "score";
    state.deadline = ctx.now() + pause(SCORE_MS);
    const h = state.hand;
    ctx.later(pause(SCORE_MS), () => {
        if (state.hand === h && state.phase === "score") deal(state, ctx);
    });
}

function cardList(hand, list) {
    return Array.isArray(list) && list.length >= 1 && list.length <= 13 && list.every((c) => isCard(c) && hand.includes(c)) && new Set(list).size === list.length;
}

function pub(state) {
    return {
        phase: state.phase,
        hand: state.hand,
        n: state.n,
        dealer: state.dealer,
        turn: state.turn,
        deadline: state.deadline,
        counts: state.hands.map((h) => h.length),
        stock: state.stock.length,
        discard: state.discard,
        melds: state.melds,
        must: state.must,
        took: state.took ? state.took.cards.length : 0,
        melded: state.hands.map((_, s) => melded(state, s)),
        scores: state.scores,
        target: state.target,
        summary: state.summary,
        log: state.log,
    };
}

module.exports = {
    id: "rummy500",
    name: "Rummy 500",
    kind: "turn",
    quick: false,
    players: [2, 4],
    TARGET,
    typeOf,
    findMeld,
    value,
    meldPoints,
    options: { length: ["full", "short"] },
    init({ rng, ctx, players = 2, options = {} }) {
        const state = { n: players, phase: "draw", hand: 0, dealer: Math.floor(rng() * players), turn: 0, deadline: 0, tick: 0, hands: [], stock: [], discard: [], melds: [], nextId: 0, must: null, took: null, didMeld: false, scores: new Array(players).fill(0), target: options.length === "short" ? SHORT : TARGET, summary: null, log: null, afk: new Array(players).fill(0) };
        deal(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.myHand = state.hands[seat];
        v.canUndo = state.turn === seat && !!state.took && !state.didMeld;
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (state.turn !== seat || (state.phase !== "draw" && state.phase !== "meld")) return { error: "It's not your turn." };
        const hand = state.hands[seat];
        state.afk[seat] = 0;
        if (p.act === "draw") {
            if (state.phase !== "draw") return { error: "You already drew." };
            draw(state, seat);
            return { ok: true };
        }
        if (p.act === "take") {
            if (state.phase !== "draw") return { error: "You already drew." };
            const i = p.index;
            if (!Number.isInteger(i) || i < 0 || i >= state.discard.length) return { error: "Pick a card in the discard pile." };
            const cards = state.discard.slice(i);
            if (!findMeld(cards[0], hand.concat(cards), state.melds)) return { error: "You'd have to meld that card this turn, and you can't." };
            state.discard = state.discard.slice(0, i);
            cards.forEach((c) => hand.push(c));
            state.took = { cards };
            state.must = cards[0];
            state.phase = "meld";
            state.log = { seat, act: "take", cards };
            return { ok: true };
        }
        if (state.phase !== "meld") return { error: "Draw first: tap the stock or the discard pile." };
        if (p.act === "undo") {
            if (!state.took || state.didMeld) return { error: "You can't undo that now." };
            undo(state, seat);
            return { ok: true };
        }
        if (p.act === "meld") {
            if (!cardList(hand, p.cards)) return { error: "Pick cards from your hand." };
            if (!typeOf(p.cards)) return { error: "That's not a meld: 3 or 4 of a kind, or 3+ in a row of one suit." };
            meld(state, seat, p.cards, ctx);
            return { ok: true };
        }
        if (p.act === "layoff") {
            const m = state.melds.find((x) => x.id === p.meld);
            if (!m) return { error: "Pick a meld on the table." };
            if (!cardList(hand, p.cards)) return { error: "Pick cards from your hand." };
            if (typeOf(m.cards.map((x) => x.c).concat(p.cards)) !== m.type) return { error: "Those don't fit on that meld." };
            layoff(state, seat, m.id, p.cards, ctx);
            return { ok: true };
        }
        if (p.act === "discard") {
            if (!isCard(p.card) || !hand.includes(p.card)) return { error: "Pick a card to discard." };
            if (state.must) return { error: "Meld the " + label(state.must) + " you took first." };
            discard(state, seat, p.card, ctx, false);
            return { ok: true };
        }
        return { error: "Bad move." };
    },
    result(state) {
        if (state.phase !== "over") return null;
        const top = Math.max(...state.scores);
        return ranked(state.scores, "high", "First past " + state.target + " with " + top + " after " + state.hand + " hand" + (state.hand > 1 ? "s" : "") + ".");
    },
};
