// board[r * 8 + c], row 0 at the top
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function flipsFor(board, i, seat) {
    if (board[i] !== null) return [];
    const r = Math.floor(i / 8), c = i % 8, out = [];
    for (const [dr, dc] of DIRS) {
        const line = [];
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === 1 - seat) {
            line.push(rr * 8 + cc);
            rr += dr;
            cc += dc;
        }
        if (line.length && rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === seat) out.push(...line);
    }
    return out;
}

function legal(board, seat) {
    const out = [];
    for (let i = 0; i < 64; i++) if (flipsFor(board, i, seat).length) out.push(i);
    return out;
}

function count(board, seat) {
    return board.filter((x) => x === seat).length;
}

module.exports = {
    id: "reversi",
    name: "Reversi",
    kind: "turn",
    quick: false,
    init({ rng }) {
        const first = rng() < 0.5 ? 0 : 1;
        const board = Array(64).fill(null);
        board[27] = 1 - first;
        board[36] = 1 - first;
        board[28] = first;
        board[35] = first;
        return { board, turn: first, first, last: null, n: 0, over: false, resigned: null };
    },
    view(state, seat) {
        const mine = state.turn === seat && !state.over && state.resigned === null;
        return {
            board: state.board,
            turn: state.turn,
            first: state.first,
            myTurn: mine,
            moves: mine ? legal(state.board, seat) : [],
            counts: [count(state.board, 0), count(state.board, 1)],
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
        const i = Number(p && p.i);
        if (!Number.isInteger(i) || i < 0 || i > 63) return { error: "Pick a square on the board." };
        if (state.board[i] !== null) return { error: "That square is taken." };
        const flips = flipsFor(state.board, i, seat);
        if (!flips.length) return { error: "That move doesn't flip anything." };
        state.board[i] = seat;
        flips.forEach((f) => (state.board[f] = seat));
        state.n++;
        state.last = { seat, i, flips, n: state.n, passed: null };
        if (legal(state.board, 1 - seat).length) state.turn = 1 - seat;
        else if (legal(state.board, seat).length) state.last.passed = 1 - seat;
        else state.over = true;
        return { ok: true };
    },
    result(state) {
        if (state.resigned !== null) return { winner: 1 - state.resigned, text: "Resigned." };
        if (!state.over) return null;
        const a = count(state.board, 0), b = count(state.board, 1);
        if (a === b) return { winner: null, text: a + " to " + b + ". Dead even." };
        return { winner: a > b ? 0 : 1, text: Math.max(a, b) + " to " + Math.min(a, b) + "." };
    },
};
