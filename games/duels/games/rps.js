// Rock Paper Scissors: both pick in secret (10s), reveal together, ties replay. First to 3.
// 3+ players: if exactly two of the three shapes are thrown, everyone on the winning shape scores a point.
// First to 3 with a clear lead wins.
const { ranked } = require("../rank");
const PICKS = ["rock", "paper", "scissors"];
const BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };
const WIN = 3;
const PICK_MS = 10000;
const REVEAL_MS = 3800;

function startRound(state, ctx, extra) {
    state.roundId++;
    state.phase = "pick";
    state.picks = state.score.map(() => null);
    state.auto = state.score.map(() => false);
    state.deadline = ctx.now() + PICK_MS + (extra || 0);
    const id = state.roundId;
    ctx.later(state.deadline - ctx.now(), () => {
        if (state.roundId !== id || state.phase !== "pick") return;
        for (let s = 0; s < state.picks.length; s++) {
            if (state.picks[s] === null) {
                state.picks[s] = PICKS[Math.floor(ctx.rng() * 3)];
                state.auto[s] = true;
            }
        }
        reveal(state, ctx);
    });
}

function reveal(state, ctx) {
    const picks = state.picks.slice();
    const shapes = [...new Set(picks)];
    const top = shapes.length === 2 ? (BEATS[shapes[0]] === shapes[1] ? shapes[0] : shapes[1]) : null;
    const winners = top ? picks.map((p, s) => (p === top ? s : -1)).filter((s) => s >= 0) : [];
    const winner = winners.length === 1 ? winners[0] : null;
    winners.forEach((s) => state.score[s]++);
    state.phase = "reveal";
    state.revealAt = ctx.now();
    state.last = { round: state.roundId, picks, auto: state.auto.slice(), winner, winners };
    state.history.push({ picks, winner, winners });
    const id = state.roundId;
    const best = Math.max(...state.score);
    const clear = state.score.filter((x) => x === best).length === 1;
    ctx.later(REVEAL_MS, () => {
        if (state.roundId !== id) return;
        if (best >= WIN && clear) state.over = true;
        else startRound(state, ctx);
    });
}

module.exports = {
    id: "rps",
    name: "Rock Paper Scissors",
    kind: "sim",
    quick: true,
    players: [2, 10],
    init({ ctx, players = 2 }) {
        const state = { score: new Array(players).fill(0), roundId: 0, phase: "pick", picks: [], auto: [], deadline: 0, revealAt: 0, last: null, history: [], over: false };
        startRound(state, ctx, 1000);
        return state;
    },
    view(state, seat) {
        const picking = state.phase === "pick";
        return {
            round: state.roundId,
            phase: state.phase,
            score: state.score,
            deadline: state.deadline,
            revealAt: state.revealAt,
            myPick: state.picks[seat],
            theyPicked: state.picks.every((x, s) => s === seat || x !== null),
            picked: state.picks.map((x) => x !== null),
            last: picking ? null : state.last,
            history: picking ? state.history : state.history.slice(0, -1),
            over: state.over,
        };
    },
    tv(state) {
        const pick = state.phase === "pick";
        const icon = { rock: "✊", paper: "✋", scissors: "✌️" };
        return {
            headline: pick ? "Round " + state.roundId + " · pick in secret" : state.last && state.last.winners.length ? "Point" + (state.last.winners.length > 1 ? "s" : "") + " to " + state.last.picks[state.last.winners[0]] : "No points, go again",
            scores: state.score,
            status: state.score.map((x, s) => (pick ? (state.picks[s] !== null ? "Locked in" : "Thinking…") : icon[state.last.picks[s]] + " " + state.last.picks[s])),
            win: WIN,
        };
    },
    move(state, seat, p, ctx) {
        if (state.phase !== "pick" || state.over) return { error: "Hold on, revealing." };
        if (!p || !PICKS.includes(p.pick)) return { error: "Pick rock, paper or scissors." };
        if (state.picks[seat] !== null) return { error: "You already picked." };
        state.picks[seat] = p.pick;
        if (state.picks.every((x) => x !== null)) reveal(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (!state.over) return null;
        if (state.score.length > 2) {
            const r = ranked(state.score, "high");
            r.text = "First to " + WIN + " · " + state.history.length + " rounds";
            return r;
        }
        const w = state.score[0] > state.score[1] ? 0 : 1;
        const last = state.last;
        const how = last ? last.picks[w].charAt(0).toUpperCase() + last.picks[w].slice(1) + " beats " + last.picks[1 - w] : "";
        return { winner: w, text: how + " · " + state.score[w] + "-" + state.score[1 - w] };
    },
};
