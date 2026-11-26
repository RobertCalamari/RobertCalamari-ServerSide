// Balloon Pump: press your luck. Both pump their own balloon at once and watch the other grow. Every balloon
// has a hidden seeded pop point. Bank to lock your size in; pop and you score 0. Bigger banked balloon takes
// the round; first to 2 rounds (ties replay, 5 rounds max). Unbanked balloons auto-bank when time runs out.
// 3+ players: everyone tied on the biggest banked balloon scores; first to 2 with a clear lead wins.
const { ranked, seats } = require("../rank");
const WIN = 2;
const MAX_ROUNDS = 5;
const COUNT_MS = 2500;
const ROUND_MS = 15000;
const PAUSE_MS = 3200;
const MIN_POP = 6;
const MAX_POP = 40;
const MAX_RATE = 9; // pumps per second
const BURST = 3;

function makePops(rng, n) {
    const rounds = [];
    for (let r = 0; r < MAX_ROUNDS; r++) {
        rounds.push(seats(n).map(() => MIN_POP + Math.floor(((rng() + rng()) / 2) * (MAX_POP - MIN_POP + 1))));
    }
    return rounds;
}

function startRound(state, ctx) {
    const now = ctx.now();
    state.round++;
    state.phase = "count";
    state.startAt = now + COUNT_MS;
    state.endAt = state.startAt + ROUND_MS;
    state.nextAt = null;
    const n = state.score.length;
    state.size = new Array(n).fill(0);
    state.status = new Array(n).fill("pump");
    state.bankedAt = new Array(n).fill(null);
    state.bucket = seats(n).map(() => ({ tokens: BURST, at: state.startAt }));
    state.roundWinner = null;
    state.roundWinners = [];
    const round = state.round;
    ctx.later(COUNT_MS, () => {
        if (state.round === round && state.phase === "count") state.phase = "play";
    });
    ctx.later(COUNT_MS + ROUND_MS, (t) => {
        if (state.round !== round || state.phase !== "play") return;
        for (const s of seats(state.score.length)) {
            if (state.status[s] === "pump") {
                state.status[s] = "bank";
                state.bankedAt[s] = t;
            }
        }
        endRound(state, ctx);
    });
}

function endRound(state, ctx) {
    state.phase = "result";
    const n = state.score.length;
    const got = seats(n).map((s) => (state.status[s] === "bank" ? state.size[s] : 0));
    const top = Math.max(...got);
    let winners = top > 0 ? seats(n).filter((s) => got[s] === top) : [];
    if (n === 2 && winners.length > 1) winners = [];
    const w = winners.length === 1 ? winners[0] : null;
    state.roundWinner = w;
    state.roundWinners = winners;
    winners.forEach((s) => state.score[s]++);
    state.history.push({ winner: w, winners, got, pops: state.pops[state.round - 1].slice() });
    const best = Math.max(...state.score);
    const over = (best >= WIN && state.score.filter((x) => x === best).length === 1) || state.round >= MAX_ROUNDS;
    state.nextAt = over ? null : ctx.now() + PAUSE_MS;
    const round = state.round;
    ctx.later(PAUSE_MS, () => {
        if (state.round !== round || state.phase !== "result") return;
        if (over) state.phase = "done";
        else startRound(state, ctx);
    });
}

function settle(state, ctx) {
    if (!state.status.includes("pump")) endRound(state, ctx);
}

module.exports = {
    id: "balloon",
    name: "Balloon Pump",
    kind: "live",
    quick: true,
    players: [2, 8],
    init({ rng, ctx, players = 2 }) {
        const state = { round: 0, score: new Array(players).fill(0), history: [], pops: makePops(rng, players) };
        startRound(state, ctx);
        return state;
    },
    view(state) {
        const reveal = state.phase === "result" || state.phase === "done";
        return {
            phase: state.phase,
            round: state.round,
            win: WIN,
            maxRounds: MAX_ROUNDS,
            score: state.score,
            history: state.history,
            startAt: state.startAt,
            endAt: state.endAt,
            nextAt: state.nextAt,
            size: state.size,
            status: state.status,
            roundWinner: state.roundWinner,
            roundWinners: state.roundWinners,
            maxPop: MAX_POP,
            pops: reveal ? state.pops[state.round - 1] : null,
        };
    },
    tv(state) {
        const word = { pump: "Pumping", bank: "Banked", pop: "POP!" };
        return { headline: "Round " + state.round + (state.phase === "count" ? " · get ready" : ""), endAt: state.phase === "play" ? state.endAt : null, scores: state.score, status: state.score.map((x, s) => "🎈 " + state.size[s] + " · " + word[state.status[s]]), win: WIN };
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object" || (p.act !== "pump" && p.act !== "bank")) return { error: "Pump or bank." };
        if (p.round !== undefined && p.round !== state.round) return { ok: true };
        const now = ctx.now();
        if (state.phase === "count") return { error: "Not yet!" };
        if (state.phase !== "play" || now >= state.endAt) return { ok: true };
        if (state.status[seat] !== "pump") return { ok: true };
        if (p.act === "bank") {
            if (state.size[seat] < 1) return { error: "Pump it first!" };
            state.status[seat] = "bank";
            state.bankedAt[seat] = now;
            settle(state, ctx);
            return { ok: true };
        }
        const b = state.bucket[seat];
        b.tokens = Math.min(BURST, b.tokens + ((now - b.at) * MAX_RATE) / 1000);
        b.at = now;
        if (b.tokens < 1) return { ok: true };
        b.tokens--;
        state.size[seat]++;
        if (state.size[seat] >= state.pops[state.round - 1][seat]) {
            state.status[seat] = "pop";
            settle(state, ctx);
        }
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        if (state.score.length > 2) {
            const r = ranked(state.score, "high");
            const best = Math.max(0, ...state.history.map((h) => Math.max(...h.got)));
            r.text = state.history.length + " rounds · biggest balloon " + best;
            return r;
        }
        const [a, b] = state.score;
        if (a === b) return { winner: null, text: "Even at " + a + "-" + b + " after " + state.history.length + " rounds" };
        const w = a > b ? 0 : 1;
        const best = Math.max(...state.history.filter((h) => h.winner === w).map((h) => h.got[w]));
        return { winner: w, text: "Won " + state.score[w] + "-" + state.score[1 - w] + " · biggest balloon " + best };
    },
};
