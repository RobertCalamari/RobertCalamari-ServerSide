// board[r * 7 + c], row 0 at the top
const COLS = 7, ROWS = 6;

function lineAt(b, i) {
    const s = b[i];
    if (s === null) return null;
    const r = Math.floor(i / COLS), c = i % COLS;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const line = [i];
        for (const k of [1, -1]) {
            let rr = r + dr * k, cc = c + dc * k;
            while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr * COLS + cc] === s) {
                line.push(rr * COLS + cc);
                rr += dr * k;
                cc += dc * k;
            }
        }
        if (line.length >= 4) return line.sort((a, z) => a - z);
    }
    return null;
}

module.exports = {
    id: "connect4",
    name: "Connect 4",
    kind: "turn",
    quick: true,
    players: [2, 2],
    init({ rng }) {
        return { board: Array(COLS * ROWS).fill(null), turn: rng() < 0.5 ? 0 : 1, line: null, winner: null, last: null, n: 0, resigned: null };
    },
    view(state, seat) {
        return {
            board: state.board,
            cols: COLS,
            rows: ROWS,
            turn: state.turn,
            myTurn: state.turn === seat && state.winner === null && state.resigned === null,
            line: state.line,
            last: state.last,
        };
    },
    move(state, seat, p) {
        if (state.winner !== null || state.resigned !== null) return { error: "The game is over." };
        if (p && p.resign === true) {
            state.resigned = seat;
            return { ok: true };
        }
        if (state.turn !== seat) return { error: "It's not your turn." };
        const col = Number(p && p.col);
        if (!Number.isInteger(col) || col < 0 || col >= COLS) return { error: "Pick a column." };
        let row = -1;
        for (let r = ROWS - 1; r >= 0; r--) {
            if (state.board[r * COLS + col] === null) {
                row = r;
                break;
            }
        }
        if (row < 0) return { error: "That column is full." };
        const i = row * COLS + col;
        state.board[i] = seat;
        state.n++;
        state.last = { col, row, i, seat, n: state.n };
        const line = lineAt(state.board, i);
        if (line) {
            state.line = line;
            state.winner = seat;
        } else state.turn = 1 - seat;
        return { ok: true };
    },
    result(state) {
        if (state.resigned !== null) return { winner: 1 - state.resigned, text: "Resigned." };
        if (state.winner !== null) return { winner: state.winner, text: "Four in a row!" };
        if (state.board.every((x) => x !== null)) return { winner: null, text: "The board filled up." };
        return null;
    },
};
