const EMOJI = [
    "🐶", "🐱", "🦊", "🐼", "🐸", "🐵", "🦁", "🐯", "🐷", "🐙", "🦄", "🐝", "🦋", "🐢", "🦖", "🐳", "🦀", "🦉", "🐧", "🦩",
    "🍕", "🍔", "🌮", "🍩", "🍉", "🍓", "🍒", "🥑", "🌶️", "🧁", "🍿", "🚀", "🎸", "🎲", "⚽", "🏀", "🎈", "🌈", "⭐", "🔥",
    "👻", "👽", "🤖", "💎", "🎩",
];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const PAIRS = 18;
const FLIP_BACK = 1200;

function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function layout(faces, rng) {
    const cards = [];
    faces.forEach(([a, b], pair) => {
        cards.push({ pair, face: a });
        cards.push({ pair, face: b });
    });
    return shuffle(cards, rng);
}

function pictures(rng) {
    return layout(shuffle(EMOJI.slice(), rng).slice(0, PAIRS).map((e) => [e, e]), rng);
}

function playingCards(rng) {
    const all = [];
    RANKS.forEach((r) => {
        all.push([{ r, s: "♥" }, { r, s: "♦" }]);
        all.push([{ r, s: "♠" }, { r, s: "♣" }]);
    });
    return layout(shuffle(all, rng).slice(0, PAIRS).map((p) => (rng() < 0.5 ? p : [p[1], p[0]])), rng);
}

module.exports = {
    id: "memory",
    name: "Memory Match",
    kind: "turn",
    quick: false,
    players: [2, 2],
    init({ rng, options }) {
        const deck = options && options.deck === "cards" ? "cards" : "pictures";
        const decks = { pictures: pictures(rng), cards: playingCards(rng) };
        return {
            deck,
            decks,
            matched: Array(PAIRS * 2).fill(null),
            up: [],
            turn: rng() < 0.5 ? 0 : 1,
            scores: [0, 0],
            started: false,
            waiting: false,
            flips: 0,
            last: null,
        };
    },
    view(state, seat) {
        const cards = state.decks[state.deck].map((c, i) => {
            const shown = state.matched[i] !== null || state.up.includes(i);
            return { face: shown ? c.face : null, owner: state.matched[i], up: state.up.includes(i) };
        });
        return {
            deck: state.deck,
            locked: state.started,
            cards,
            turn: state.turn,
            myTurn: state.turn === seat && !state.waiting,
            waiting: state.waiting,
            scores: state.scores,
            last: state.last,
            flips: state.flips,
        };
    },
    move(state, seat, p, ctx) {
        if (p.deck !== undefined) {
            if (state.started) return { error: "The deck is locked once someone flips a card." };
            if (p.deck !== "pictures" && p.deck !== "cards") return { error: "Unknown deck." };
            state.deck = p.deck;
            return { ok: true };
        }
        if (state.turn !== seat) return { error: "It's not your turn." };
        if (state.waiting) return { error: "Hang on…" };
        const i = Number(p.card);
        if (!Number.isInteger(i) || i < 0 || i >= PAIRS * 2) return { error: "Pick a card." };
        if (state.matched[i] !== null || state.up.includes(i)) return { error: "That card is already up." };
        state.started = true;
        state.flips++;
        state.up.push(i);
        if (state.up.length < 2) return { ok: true };
        const cards = state.decks[state.deck];
        const [a, b] = state.up;
        if (cards[a].pair === cards[b].pair) {
            state.matched[a] = seat;
            state.matched[b] = seat;
            state.scores[seat]++;
            state.up = [];
            state.last = { cards: [a, b], match: true, seat };
            return { ok: true };
        }
        state.waiting = true;
        state.last = { cards: [a, b], match: false, seat };
        const flips = state.flips;
        ctx.later(FLIP_BACK, () => {
            if (state.flips !== flips || !state.waiting) return;
            state.up = [];
            state.waiting = false;
            state.turn = 1 - seat;
        });
        return { ok: true };
    },
    result(state) {
        if (state.matched.some((m) => m === null)) return null;
        const [a, b] = state.scores;
        if (a === b) return { winner: null, text: "Tied at " + a + " pairs each." };
        return { winner: a > b ? 0 : 1, text: Math.max(a, b) + " pairs to " + Math.min(a, b) + "." };
    },
};
