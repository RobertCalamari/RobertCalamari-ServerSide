// Spit: both players at once. Each has five layout piles (1-5 cards, top face up) and a spit pile. Play a layout top on
// either centre pile if it's one rank up or down (suits don't matter, A wraps K). When nobody can play, both spit a new
// card. Empty your layout and slap the smaller centre pile; the other player gets the bigger one. Out of cards wins,
// otherwise fewest cards after 3 rounds.
const { rank, shuffle, deck, pause } = require("../deck");
const MAX_ROUNDS = 3;
const READY_MS = 2500;
const AUTO_SPIT_MS = 4000;
const SLAP_MS = 4000;
const BETWEEN_MS = 2500;
const GAME_MS = 5 * 60000;

const fits = (a, b) => {
    const d = Math.abs(rank(a) - rank(b));
    return d === 1 || d === 12;
};
const top = (p) => (p.length ? p[p.length - 1] : null);
const total = (state, s) => state.layout[s].reduce((n, p) => n + p.length, 0) + state.spit[s].length;
const canPlay = (state, s) => state.layout[s].some((p) => p.length && state.centre.some((c) => c.length && fits(top(p), top(c))));

function deal(state, s, cards) {
    const a = cards.slice();
    state.layout[s] = [0, 1, 2, 3, 4].map((i) => a.splice(0, i + 1));
    state.spit[s] = a;
}

function startRound(state, ctx) {
    state.round++;
    state.phase = "ready";
    state.stuck = false;
    state.votes = [false, false];
    state.slap = null;
    state.goAt = ctx.now() + pause(READY_MS);
    const r = state.round;
    ctx.later(pause(READY_MS), () => {
        if (state.round !== r || state.phase !== "ready") return;
        state.phase = "play";
        spit(state, ctx);
    });
}

function spit(state, ctx) {
    if (!state.spit[0].length && !state.spit[1].length) {
        const all = shuffle(ctx.rng, state.centre[0].concat(state.centre[1]));
        state.centre = [[], []];
        all.forEach((c, i) => state.spit[i % 2].push(c));
        state.recycled++;
    }
    for (const s of [0, 1]) {
        if (!state.spit[s].length) continue;
        state.centre[s].push(state.spit[s].pop());
        state.by[s] = null;
    }
    state.spits++;
    state.stuck = false;
    state.votes = [false, false];
    check(state, ctx);
}

// is anyone able to play? if not, start the spit vote (and spit anyway after a few seconds)
function check(state, ctx) {
    if (state.phase !== "play") return;
    const stuck = !canPlay(state, 0) && !canPlay(state, 1);
    if (stuck && !state.stuck) {
        state.stuck = true;
        state.votes = [false, false];
        const no = ++state.stuckNo;
        state.autoAt = ctx.now() + AUTO_SPIT_MS;
        ctx.later(AUTO_SPIT_MS, () => {
            if (state.phase === "play" && state.stuck && state.stuckNo === no) spit(state, ctx);
        });
    } else if (!stuck) state.stuck = false;
}

function endRound(state, s, ctx) {
    if (!state.spit[s].length) {
        state.phase = "over";
        state.winner = s;
        state.endText = "Out of cards in round " + state.round + ".";
        return;
    }
    state.phase = "slap";
    state.slap = { emptied: s, claim: null, by: null, deadline: ctx.now() + SLAP_MS };
    const r = state.round;
    ctx.later(SLAP_MS, () => {
        if (state.round !== r || state.phase !== "slap") return;
        const [a, b] = state.centre.map((c) => c.length);
        resolveSlap(state, a < b ? 0 : b < a ? 1 : s, s, ctx, true);
    });
}

function resolveSlap(state, pile, s, ctx, auto) {
    const claim = [null, null];
    claim[pile] = s;
    claim[1 - pile] = 1 - s;
    state.slap.claim = claim;
    state.slap.by = auto ? null : s;
    state.phase = "between";
    state.nextAt = ctx.now() + pause(BETWEEN_MS);
    const r = state.round;
    ctx.later(pause(BETWEEN_MS), () => {
        if (state.round !== r || state.phase !== "between") return;
        const hands = [0, 1].map((p) => shuffle(ctx.rng, state.layout[p].flat().concat(state.spit[p], state.centre[claim.indexOf(p)])));
        state.centre = [[], []];
        state.by = [null, null];
        if (state.round >= MAX_ROUNDS) {
            hands.forEach((h, p) => deal(state, p, h));
            return finishByCount(state, "after " + MAX_ROUNDS + " rounds");
        }
        hands.forEach((h, p) => deal(state, p, h));
        startRound(state, ctx);
    });
}

function finishByCount(state, why) {
    const [a, b] = [0, 1].map((s) => total(state, s));
    state.phase = "over";
    state.winner = a === b ? null : a < b ? 0 : 1;
    state.endText = a === b ? "Level on " + a + " cards " + why + "." : "Fewest cards " + why + ": " + Math.min(a, b) + " to " + Math.max(a, b) + ".";
}

function pub(state) {
    return {
        phase: state.phase,
        round: state.round,
        rounds: MAX_ROUNDS,
        layout: state.layout.map((ps) => ps.map((p) => ({ n: p.length, top: top(p) }))),
        spit: state.spit.map((p) => p.length),
        centre: state.centre.map((c, i) => ({ n: c.length, top: top(c), by: state.by[i] })),
        totals: [0, 1].map((s) => total(state, s)),
        stuck: state.stuck,
        votes: state.votes,
        autoAt: state.stuck ? state.autoAt : null,
        goAt: state.phase === "ready" ? state.goAt : null,
        slap: state.slap,
        nextAt: state.phase === "between" ? state.nextAt : null,
        spits: state.spits,
        recycled: state.recycled,
        last: state.last,
        endAt: state.endAt,
    };
}

module.exports = {
    id: "spit",
    name: "Spit",
    kind: "live",
    quick: true,
    players: [2, 2],
    fits,
    init({ rng, ctx }) {
        const d = deck(rng);
        const state = { phase: "ready", round: 0, layout: [[], []], spit: [[], []], centre: [[], []], by: [null, null], stuck: false, votes: [false, false], stuckNo: 0, autoAt: 0, goAt: 0, slap: null, nextAt: 0, spits: 0, recycled: 0, seq: 0, last: null, winner: null, endText: "", endAt: ctx.now() + GAME_MS };
        deal(state, 0, d.slice(0, 26));
        deal(state, 1, d.slice(26));
        startRound(state, ctx);
        ctx.later(GAME_MS, () => {
            if (state.phase !== "over") finishByCount(state, "at the buzzer");
        });
        return state;
    },
    view(state, seat) {
        return { ...pub(state), me: seat };
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.act === "slap") {
            if (state.phase !== "slap") return { ok: true, quiet: true };
            if (p.pile !== 0 && p.pile !== 1) return { error: "Slap a centre pile." };
            resolveSlap(state, p.pile, seat, ctx, false);
            return { ok: true };
        }
        if (state.phase !== "play") return { error: state.phase === "ready" ? "Wait for the flip!" : "Hold on." };
        const mine = state.layout[seat];
        if (p.act === "spit") {
            if (!state.stuck) return { error: "Someone can still play." };
            if (state.votes[seat]) return { ok: true, quiet: true };
            state.votes[seat] = true;
            if (state.votes[0] && state.votes[1]) spit(state, ctx);
            return { ok: true };
        }
        const from = p.from;
        if (!Number.isInteger(from) || from < 0 || from > 4 || !mine[from].length) return { error: "Pick one of your cards." };
        const c = top(mine[from]);
        if (p.card !== undefined && p.card !== c) return { error: "Too slow!" };
        if (p.act === "move") {
            const to = p.to;
            if (!Number.isInteger(to) || to < 0 || to > 4 || mine[to].length) return { error: "Move cards to an empty space." };
            if (mine[from].length < 2) return { ok: true, quiet: true };
            mine[to].push(mine[from].pop());
            check(state, ctx);
            return { ok: true };
        }
        if (p.act !== "play") return { error: "Bad move." };
        const to = p.to;
        if (to !== 0 && to !== 1) return { error: "Pick a centre pile." };
        const pile = state.centre[to];
        if (!pile.length) return { error: "That pile is empty." };
        if (!fits(c, top(pile))) return { error: p.saw && p.saw !== top(pile) ? "Too slow!" : "One up or one down only." };
        pile.push(mine[from].pop());
        state.by[to] = seat;
        state.last = { seat, to, card: c, seq: ++state.seq };
        if (mine.every((x) => !x.length)) endRound(state, seat, ctx);
        else check(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "over") return null;
        return { winner: state.winner, text: state.endText };
    },
};
