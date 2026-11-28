// Spades: four players, partners sit across (seats 0 & 2 vs 1 & 3). Everyone bids how many tricks they'll take
// (0 = nil), spades are trumps and can't be led until one has been played (unless you hold nothing else), follow suit if
// you can. Team makes its bid: 10 per trick bid + 1 per overtrick (bag); miss it: -10 per trick bid. Nil: +/-100 and
// the nil player's tricks only count as bags. Every 10 bags costs 100. First team to TARGET wins (or a team at -200 loses).
const { rank, suit, isCard, deck, sortHand, pause } = require("../deck");
const TARGET = 250;
const SHORT = 150;
const FLOOR = -200;
const BID_MS = 30000;
const PLAY_MS = 20000;
const AFK_MS = 6000;
const TRICK_MS = 1800;
const SCORE_MS = 8000;

const team = (s) => s % 2;
const ORDER = "SHCD";

function legal(state, s) {
    const hand = state.hands[s];
    if (!state.trick.length) {
        const off = hand.filter((c) => suit(c) !== "S");
        return state.broken || !off.length ? hand.slice() : off;
    }
    const led = suit(state.trick[0].c);
    const follow = hand.filter((c) => suit(c) === led);
    return follow.length ? follow : hand.slice();
}

// lowest legal card, keeping spades if possible
function autoCard(state, s) {
    const l = legal(state, s);
    const off = l.filter((c) => suit(c) !== "S");
    return (off.length ? off : l).slice().sort((a, b) => rank(a) - rank(b) || ORDER.indexOf(suit(a)) - ORDER.indexOf(suit(b)))[0];
}

function autoBid(hand) {
    const sp = hand.filter((c) => suit(c) === "S");
    let n = hand.filter((c) => rank(c) === 14).length + hand.filter((c) => rank(c) === 13 && hand.filter((x) => suit(x) === suit(c)).length > 1).length;
    n += sp.filter((c) => rank(c) >= 11 && rank(c) < 13).length + Math.max(0, sp.length - 3);
    return Math.max(1, Math.min(13, n));
}

function winnerOf(trick) {
    let best = trick[0];
    for (const t of trick.slice(1)) {
        const tb = suit(best.c), tt = suit(t.c);
        if ((tt === tb && rank(t.c) > rank(best.c)) || (tt === "S" && tb !== "S")) best = t;
    }
    return best.seat;
}

function deal(state, ctx) {
    const d = deck(ctx.rng);
    state.hand++;
    state.dealer = (state.dealer + 1) % 4;
    state.hands = [0, 1, 2, 3].map((i) => sortHand(d.slice(i * 13, i * 13 + 13), ORDER));
    state.bids = [null, null, null, null];
    state.tricks = [0, 0, 0, 0];
    state.trick = [];
    state.last = null;
    state.broken = false;
    state.summary = null;
    state.phase = "bid";
    setTurn(state, (state.dealer + 1) % 4, ctx);
}

function setTurn(state, s, ctx) {
    state.turn = s;
    const ms = state.afk[s] >= 2 ? AFK_MS : state.phase === "bid" ? BID_MS : PLAY_MS;
    state.deadline = ctx.now() + ms;
    const key = ++state.tick;
    ctx.later(ms, () => {
        if (state.tick !== key || state.turn !== s) return;
        state.afk[s]++;
        if (state.phase === "bid") bid(state, s, autoBid(state.hands[s]), ctx, true);
        else if (state.phase === "play") play(state, s, autoCard(state, s), ctx, true);
    });
}

function bid(state, s, n, ctx, auto) {
    state.bids[s] = n;
    state.auto = auto ? { seat: s, at: ctx.now() } : state.auto;
    if (state.bids.every((b) => b !== null)) {
        state.phase = "play";
        setTurn(state, (state.dealer + 1) % 4, ctx);
    } else setTurn(state, (s + 1) % 4, ctx);
}

function play(state, s, c, ctx, auto) {
    const hand = state.hands[s];
    hand.splice(hand.indexOf(c), 1);
    state.trick.push({ seat: s, c });
    if (suit(c) === "S") state.broken = true;
    state.auto = auto ? { seat: s, at: ctx.now(), c } : state.auto;
    if (state.trick.length < 4) return setTurn(state, (s + 1) % 4, ctx);
    const w = winnerOf(state.trick);
    state.phase = "trick";
    state.turn = null;
    state.tick++;
    state.trickWinner = w;
    ctx.later(pause(TRICK_MS), () => {
        if (state.phase !== "trick") return;
        state.tricks[w]++;
        state.last = { cards: state.trick, winner: w };
        state.trick = [];
        state.trickWinner = null;
        if (state.hands.every((h) => !h.length)) return score(state, ctx);
        state.phase = "play";
        setTurn(state, w, ctx);
    });
}

// one team's hand: { bid, took, nil: [{seat, made}], pts, bags }
function scoreTeam(bids, tricks, t) {
    const seats = [t, t + 2];
    const contract = seats.filter((s) => bids[s] > 0).reduce((a, s) => a + bids[s], 0);
    const took = seats.filter((s) => bids[s] > 0).reduce((a, s) => a + tricks[s], 0);
    const nilTricks = seats.filter((s) => bids[s] === 0).reduce((a, s) => a + tricks[s], 0);
    let pts = 0, bags = nilTricks;
    if (contract > 0) {
        if (took >= contract) {
            pts += contract * 10 + (took - contract);
            bags += took - contract;
        } else pts -= contract * 10;
    } else bags += took;
    const nil = seats.filter((s) => bids[s] === 0).map((s) => ({ seat: s, made: tricks[s] === 0 }));
    nil.forEach((x) => (pts += x.made ? 100 : -100));
    return { bid: contract, took: took + nilTricks, nil, pts, bags };
}

function applyScore(scores, bagsTotal, bids, tricks) {
    return [0, 1].map((t) => {
        const r = scoreTeam(bids, tricks, t);
        let bags = bagsTotal[t] + r.bags;
        let penalty = 0;
        while (bags >= 10) {
            bags -= 10;
            penalty -= 100;
        }
        r.penalty = penalty;
        r.pts += penalty;
        r.total = scores[t] + r.pts;
        r.bagsTotal = bags;
        return r;
    });
}

function score(state, ctx) {
    const rows = applyScore(state.scores, state.bags, state.bids, state.tricks);
    state.scores = rows.map((r) => r.total);
    state.bags = rows.map((r) => r.bagsTotal);
    state.history.push(state.scores.slice());
    state.summary = { rows, bids: state.bids.slice(), tricks: state.tricks.slice() };
    state.phase = "score";
    state.turn = null;
    state.tick++;
    const [a, b] = state.scores;
    const done = (a >= state.target || b >= state.target || a <= FLOOR || b <= FLOOR) && a !== b;
    if (done) {
        state.over = true;
        state.phase = "over";
        return;
    }
    state.deadline = ctx.now() + pause(SCORE_MS);
    const h = state.hand;
    ctx.later(pause(SCORE_MS), () => {
        if (state.hand === h && state.phase === "score") deal(state, ctx);
    });
}

function pub(state) {
    return {
        phase: state.phase,
        hand: state.hand,
        dealer: state.dealer,
        turn: state.turn,
        deadline: state.deadline,
        counts: state.hands.map((h) => h.length),
        bids: state.bids,
        tricks: state.tricks,
        trick: state.trick,
        trickWinner: state.trickWinner,
        last: state.last,
        broken: state.broken,
        scores: state.scores,
        bags: state.bags,
        summary: state.summary,
        target: state.target,
        auto: state.auto,
    };
}

module.exports = {
    id: "spades",
    name: "Spades",
    kind: "turn",
    quick: false,
    players: [4, 4],
    TARGET,
    scoreTeam,
    applyScore,
    winnerOf,
    autoBid,
    options: { length: ["full", "short"] },
    init({ rng, ctx, options = {} }) {
        const state = { phase: "bid", hand: 0, dealer: Math.floor(rng() * 4), turn: 0, deadline: 0, tick: 0, hands: [], bids: [], tricks: [], trick: [], trickWinner: null, last: null, broken: false, scores: [0, 0], bags: [0, 0], history: [], summary: null, target: options.length === "short" ? SHORT : TARGET, afk: [0, 0, 0, 0], auto: null, over: false };
        deal(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.myHand = state.hands[seat];
        v.legal = state.phase === "play" && state.turn === seat ? legal(state, seat) : [];
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (state.turn !== seat || (state.phase !== "bid" && state.phase !== "play")) return { error: "It's not your turn." };
        if (p.act === "bid") {
            if (state.phase !== "bid") return { error: "Bidding is over." };
            if (!Number.isInteger(p.n) || p.n < 0 || p.n > 13) return { error: "Bid 0 (nil) to 13." };
            state.afk[seat] = 0;
            bid(state, seat, p.n, ctx, false);
            return { ok: true };
        }
        if (p.act !== "play") return { error: "Bad move." };
        if (state.phase !== "play") return { error: "Bid first." };
        if (!isCard(p.c) || !state.hands[seat].includes(p.c)) return { error: "That's not in your hand." };
        if (!legal(state, seat).includes(p.c)) {
            if (state.trick.length) return { error: "Follow suit: play a " + { S: "spade", H: "heart", D: "diamond", C: "club" }[suit(state.trick[0].c)] + "." };
            return { error: "Spades aren't broken yet." };
        }
        state.afk[seat] = 0;
        play(state, seat, p.c, ctx, false);
        return { ok: true };
    },
    result(state) {
        if (!state.over) return null;
        const [a, b] = state.scores;
        const w = a > b ? 0 : 1;
        const hands = " after " + state.hand + " hand" + (state.hand > 1 ? "s" : "") + ".";
        const text = Math.min(a, b) <= FLOOR && Math.max(a, b) < state.target ? "The other team sank to " + Math.min(a, b) + hands : "Partners win " + Math.max(a, b) + " to " + Math.min(a, b) + hands;
        return { winner: null, places: [0, 1, 2, 3].map((s) => (team(s) === w ? 1 : 2)), text };
    },
};
