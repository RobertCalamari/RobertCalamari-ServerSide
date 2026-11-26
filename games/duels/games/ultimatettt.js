// board[b * 9 + c]: small board b (0-8, row by row), cell c (0-8). small[b]: null, 0, 1 or "draw".
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function lineOf(cells, seat) {
    return LINES.find((l) => l.every((i) => cells[i] === seat)) || null;
}

function allowed(state) {
    if (state.next !== null && state.small[state.next] === null) return [state.next];
    return state.small.map((s, b) => (s === null ? b : -1)).filter((b) => b >= 0);
}

const count = (state, seat) => state.small.filter((s) => s === seat).length;

module.exports = {
    id: "ultimatettt",
    name: "Ultimate Tic-Tac-Toe",
    kind: "turn",
    quick: false,
    init({ rng }) {
        const first = rng() < 0.5 ? 0 : 1;
        return { board: Array(81).fill(null), small: Array(9).fill(null), next: null, turn: first, first, last: null, n: 0, line: null, over: false, resigned: null };
    },
    view(state, seat) {
        const mine = state.turn === seat && !state.over && state.resigned === null;
        return {
            board: state.board,
            small: state.small,
            turn: state.turn,
            first: state.first,
            myTurn: mine,
            allowed: state.over || state.resigned !== null ? [] : allowed(state),
            counts: [count(state, 0), count(state, 1)],
            line: state.line,
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
        const b = p && p.b, c = p && p.c;
        if (!Number.isInteger(b) || !Number.isInteger(c) || b < 0 || b > 8 || c < 0 || c > 8) return { error: "Pick a square." };
        if (!allowed(state).includes(b)) return { error: state.small[b] !== null ? "That board is finished." : "You have to play in the highlighted board." };
        if (state.board[b * 9 + c] !== null) return { error: "That square is taken." };
        state.board[b * 9 + c] = seat;
        const cells = state.board.slice(b * 9, b * 9 + 9);
        const won = lineOf(cells, seat);
        if (won) state.small[b] = seat;
        else if (!cells.includes(null)) state.small[b] = "draw";
        state.n++;
        state.last = { seat, b, c, won, closed: state.small[b] !== null, n: state.n };
        state.next = c;
        const big = lineOf(state.small, seat);
        if (big) {
            state.line = big;
            state.over = true;
        } else if (!state.small.includes(null)) state.over = true;
        else state.turn = 1 - seat;
        return { ok: true };
    },
    result(state) {
        if (state.resigned !== null) return { winner: 1 - state.resigned, text: "Resigned." };
        if (!state.over) return null;
        if (state.line) return { winner: state.board[state.last.b * 9 + state.last.c], text: "Three boards in a row." };
        const a = count(state, 0), b = count(state, 1);
        if (a === b) return { winner: null, text: "No line. " + a + " boards each." };
        return { winner: a > b ? 0 : 1, text: "No line. " + Math.max(a, b) + " boards to " + Math.min(a, b) + "." };
    },
};
