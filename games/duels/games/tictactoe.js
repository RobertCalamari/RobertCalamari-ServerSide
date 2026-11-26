const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function winnerOf(b) {
    for (const [a, c, d] of LINES) if (b[a] !== null && b[a] === b[c] && b[a] === b[d]) return { seat: b[a], line: [a, c, d] };
    return null;
}

module.exports = {
    id: "tictactoe",
    name: "Tic-Tac-Toe",
    kind: "turn",
    quick: true,
    init({ rng }) {
        return { board: Array(9).fill(null), turn: rng() < 0.5 ? 0 : 1, line: null };
    },
    view(state, seat) {
        return { board: state.board, turn: state.turn, line: state.line, myTurn: state.turn === seat };
    },
    move(state, seat, p) {
        if (state.turn !== seat) return { error: "It's not your turn." };
        const i = Number(p.cell);
        if (!Number.isInteger(i) || i < 0 || i > 8 || state.board[i] !== null) return { error: "Pick an empty square." };
        state.board[i] = seat;
        const w = winnerOf(state.board);
        if (w) state.line = w.line;
        else state.turn = 1 - seat;
        return { ok: true };
    },
    result(state) {
        const w = winnerOf(state.board);
        if (w) return { winner: w.seat, text: "Three in a row!" };
        if (state.board.every((x) => x !== null)) return { winner: null, text: "Cat's game." };
        return null;
    },
};
