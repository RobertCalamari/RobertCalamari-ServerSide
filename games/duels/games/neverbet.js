// Never Have I Bet: a confession pops up ("I've sent a text to the wrong person"). Everyone secretly taps Yes or No,
// then bets how many people in the room said Yes. Only the count is revealed, never who. Spot on = 3 points and you
// hand out 3 sips; closest = 2 points and 2 sips; furthest off drinks 2. Eight confessions, most points wins.
const { ranked, seats } = require("../rank");
const ROUNDS = 8;
const ASK_MS = 30000;
const REVEAL_MS = 8000;
const LINES = [
    "I've sent a text to the wrong person", "I've fallen asleep in a movie theater", "I've lied about my age",
    "I've eaten food that fell on the floor", "I've pretended to be on the phone to avoid someone", "I've cried at a commercial",
    "I've stalked an ex online", "I've laughed so hard I snorted", "I've forgotten someone's name mid-conversation",
    "I've re-gifted a present", "I've walked into a glass door", "I've sung in the shower this week",
    "I've cheated at a board game", "I've ghosted someone", "I've talked my way out of a ticket",
    "I've worn the same outfit two days in a row", "I've waved back at someone who wasn't waving at me", "I've lost my phone while holding it",
    "I've skipped a shower to sleep in", "I've binge-watched a whole season in a day", "I've tripped in public and played it cool",
    "I've ordered food to avoid cooking twice in one day", "I've read someone else's texts over their shoulder", "I've been kicked out of somewhere",
    "I've faked being sick to skip something", "I've stayed up all night playing a game", "I've had a crush on a friend's sibling",
    "I've snooped in someone's bathroom cabinet", "I've said 'you too' when a waiter said 'enjoy your meal'", "I've dyed my hair a wild color",
    "I've eaten a whole pizza by myself", "I've locked myself out of my house", "I've texted while driving",
    "I've laughed at a funeral", "I've broken something and blamed someone else", "I've slid into someone's DMs",
    "I've gone a whole day in pajamas", "I've sleepwalked", "I've gotten a tattoo I regret",
    "I've been on a blind date", "I've accidentally liked an old photo while scrolling", "I've cut my own hair",
    "I've pretended to know a song", "I've snuck into a second movie", "I've won money gambling",
    "I've been on TV", "I've thrown up from drinking", "I've kissed someone in this room",
];

function startRound(state, ctx) {
    state.round++;
    state.phase = "ask";
    state.yes = state.score.map(() => null);
    state.bet = state.score.map(() => null);
    state.last = null;
    state.deadline = ctx.now() + ASK_MS;
    const r = state.round;
    ctx.later(ASK_MS, () => state.round === r && state.phase === "ask" && reveal(state, ctx));
}
function reveal(state, ctx) {
    const n = state.score.length;
    const count = state.yes.filter(Boolean).length;
    const off = state.bet.map((b) => (b === null ? null : Math.abs(b - count)));
    const valid = off.filter((x) => x !== null);
    const best = valid.length ? Math.min(...valid) : null;
    const worst = valid.length ? Math.max(...valid) : null;
    const got = seats(n).map((s) => (off[s] === null ? 0 : off[s] === 0 ? 3 : off[s] === best ? 2 : 0));
    got.forEach((g, s) => (state.score[s] += g));
    const give = seats(n).filter((s) => off[s] !== null && off[s] === best);
    const drink = seats(n).filter((s) => off[s] === null || (worst !== best && off[s] === worst));
    state.last = { count, bets: state.bet.slice(), got, give, drink, exact: best === 0 };
    state.phase = "reveal";
    state.deadline = ctx.now() + REVEAL_MS;
    const r = state.round;
    ctx.later(REVEAL_MS, () => {
        if (state.round !== r || state.phase !== "reveal") return;
        if (state.round >= ROUNDS) state.phase = "done";
        else startRound(state, ctx);
    });
}
function pub(state) {
    return {
        phase: state.phase,
        round: state.round,
        rounds: ROUNDS,
        line: state.lines[state.round - 1],
        deadline: state.deadline,
        n: state.score.length,
        in: state.bet.map((b, s) => b !== null && state.yes[s] !== null),
        score: state.score,
        last: state.last,
    };
}

module.exports = {
    id: "neverbet",
    name: "Never Have I Bet",
    kind: "sim",
    quick: true,
    players: [3, 12],
    LINES,
    init({ rng, ctx, players = 3 }) {
        const pool = LINES.slice();
        const lines = seats(ROUNDS).map(() => pool.splice(Math.floor(rng() * pool.length), 1)[0]);
        const state = { lines, round: 0, phase: "ask", score: new Array(players).fill(0), yes: [], bet: [], last: null, deadline: null };
        startRound(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = pub(state);
        v.me = { yes: state.yes[seat], bet: state.bet[seat] };
        return v;
    },
    tv(state) {
        return pub(state);
    },
    move(state, seat, p, ctx) {
        if (state.phase !== "ask") return { error: "Wait for the next one." };
        if (!p || typeof p !== "object" || p.round !== state.round) return { error: "Bad move." };
        if (typeof p.yes !== "boolean") return { error: "Tap Yes or No." };
        const n = state.score.length;
        if (!Number.isInteger(p.bet) || p.bet < 0 || p.bet > n) return { error: "Bet 0 to " + n + "." };
        state.yes[seat] = p.yes;
        state.bet[seat] = p.bet;
        if (state.bet.every((b, s) => b !== null && state.yes[s] !== null)) reveal(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        return ranked(state.score, "high", "Best read on the room: " + Math.max(...state.score) + " points");
    },
};
