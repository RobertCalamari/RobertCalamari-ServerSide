// pits[0-5] seat 0, pits[6] seat 0 store, pits[7-12] seat 1, pits[13] seat 1 store. Sowing runs up the indexes.
const store = (seat) => seat * 7 + 6;
const side = (pits, seat) => pits.slice(seat * 7, seat * 7 + 6);
const sum = (a) => a.reduce((x, y) => x + y, 0);

module.exports = {
    id: "mancala",
    name: "Mancala",
    kind: "turn",
    quick: false,
    init({ rng }) {
        const pits = Array(14).fill(4);
        pits[6] = 0;
        pits[13] = 0;
        return { pits, turn: rng() < 0.5 ? 0 : 1, last: null, n: 0, over: false, resigned: null };
    },
    view(state, seat) {
        const mine = state.turn === seat && !state.over && state.resigned === null;
        return {
            pits: state.pits,
            turn: state.turn,
            myTurn: mine,
            moves: mine ? side(state.pits, seat).map((v, i) => (v ? i : -1)).filter((i) => i >= 0) : [],
            scores: [state.pits[6], state.pits[13]],
            last: state.last,
            n: state.n,
        };
    },
    move(state, seat, p) {
        if (state.over || state.resigned !== null) return { error: "The game is over." };
        if (p && p.resign === true) {
            state.resigned = seat;
            return { ok: true };
        }
        if (state.turn !== seat) return { error: "It's not your turn." };
        const pit = p && p.pit;
        if (!Number.isInteger(pit) || pit < 0 || pit > 5) return { error: "Pick one of your pits." };
        const pits = state.pits;
        const from = seat * 7 + pit;
        let seeds = pits[from];
        if (!seeds) return { error: "That pit is empty." };
        const before = pits.slice();
        pits[from] = 0;
        const path = [];
        let at = from;
        while (seeds > 0) {
            at = (at + 1) % 14;
            if (at === store(1 - seat)) continue;
            pits[at]++;
            path.push(at);
            seeds--;
        }
        let capture = null;
        const ownPit = at >= seat * 7 && at < seat * 7 + 6;
        if (ownPit && pits[at] === 1 && pits[12 - at] > 0) {
            const n = pits[12 - at] + 1;
            capture = { at, opp: 12 - at, n };
            pits[store(seat)] += n;
            pits[at] = 0;
            pits[12 - at] = 0;
        }
        const again = at === store(seat);
        state.n++;
        state.last = { seat, from, path, before, capture, again: false, sweep: null, n: state.n };
        if (!sum(side(pits, 0)) || !sum(side(pits, 1))) {
            const sweep = [0, 0];
            for (const s of [0, 1]) {
                for (let i = s * 7; i < s * 7 + 6; i++) {
                    sweep[s] += pits[i];
                    pits[i] = 0;
                }
                pits[store(s)] += sweep[s];
            }
            state.last.sweep = sweep;
            state.over = true;
        } else if (again) state.last.again = true;
        else state.turn = 1 - seat;
        return { ok: true };
    },
    result(state) {
        if (state.resigned !== null) return { winner: 1 - state.resigned, text: "Resigned." };
        if (!state.over) return null;
        const a = state.pits[6], b = state.pits[13];
        if (a === b) return { winner: null, text: a + " to " + b + ". Dead even." };
        return { winner: a > b ? 0 : 1, text: Math.max(a, b) + " seeds to " + Math.min(a, b) + "." };
    },
};
