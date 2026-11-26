// board[r * 8 + c], row 0 at the top. Seat 0 starts at the bottom (rows 5-7) and moves up.
const DRAW_PLIES = 80;

function dirs(piece) {
    if (piece.k) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    const dr = piece.s === 0 ? -1 : 1;
    return [[dr, -1], [dr, 1]];
}

function on(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function jumpsFrom(board, i) {
    const p = board[i];
    if (!p) return [];
    const r = Math.floor(i / 8), c = i % 8, out = [];
    for (const [dr, dc] of dirs(p)) {
        const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
        if (!on(tr, tc)) continue;
        const mid = board[mr * 8 + mc];
        if (mid && mid.s !== p.s && !board[tr * 8 + tc]) out.push({ from: i, to: tr * 8 + tc, cap: mr * 8 + mc });
    }
    return out;
}

function stepsFrom(board, i) {
    const p = board[i];
    if (!p) return [];
    const r = Math.floor(i / 8), c = i % 8, out = [];
    for (const [dr, dc] of dirs(p)) {
        const tr = r + dr, tc = c + dc;
        if (on(tr, tc) && !board[tr * 8 + tc]) out.push({ from: i, to: tr * 8 + tc, cap: null });
    }
    return out;
}

function legalMoves(state, seat) {
    if (state.must !== null) return jumpsFrom(state.board, state.must);
    let jumps = [], steps = [];
    state.board.forEach((p, i) => {
        if (!p || p.s !== seat) return;
        jumps = jumps.concat(jumpsFrom(state.board, i));
        if (!jumps.length) steps = steps.concat(stepsFrom(state.board, i));
    });
    return jumps.length ? jumps : steps;
}

function count(board, seat) {
    return board.filter((p) => p && p.s === seat).length;
}

module.exports = {
    id: "checkers",
    name: "Checkers",
    kind: "turn",
    quick: false,
    init({ rng }) {
        const board = Array(64).fill(null);
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if ((r + c) % 2 === 0) continue;
                if (r < 3) board[r * 8 + c] = { s: 1, k: false };
                else if (r > 4) board[r * 8 + c] = { s: 0, k: false };
            }
        }
        return { board, turn: rng() < 0.5 ? 0 : 1, must: null, quiet: 0, ply: 0, last: null, resigned: null };
    },
    view(state, seat) {
        const mine = state.turn === seat && state.resigned === null;
        const moves = mine ? legalMoves(state, seat) : [];
        return {
            board: state.board,
            turn: state.turn,
            myTurn: mine,
            side: seat,
            moves,
            forced: moves.some((m) => m.cap !== null),
            must: state.must,
            last: state.last,
            ply: state.ply,
            quiet: state.quiet,
            drawAt: DRAW_PLIES,
            counts: [count(state.board, 0), count(state.board, 1)],
        };
    },
    move(state, seat, p) {
        if (state.resigned !== null) return { error: "The game is over." };
        if (p && p.resign === true) {
            state.resigned = seat;
            return { ok: true };
        }
        if (state.turn !== seat) return { error: "It's not your turn." };
        const from = Number(p && p.from), to = Number(p && p.to);
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63) return { error: "Pick a square on the board." };
        const piece = state.board[from];
        if (!piece || piece.s !== seat) return { error: "That's not your piece." };
        const moves = legalMoves(state, seat);
        const mv = moves.find((m) => m.from === from && m.to === to);
        if (!mv) {
            if (state.must !== null && from !== state.must) return { error: "Keep jumping with the same piece." };
            if (moves.some((m) => m.cap !== null)) return { error: "You have to take a piece." };
            return { error: "You can't move there." };
        }

        const b = state.board;
        b[to] = piece;
        b[from] = null;
        let captured = null;
        if (mv.cap !== null) {
            captured = { i: mv.cap, s: b[mv.cap].s, k: b[mv.cap].k };
            b[mv.cap] = null;
        }
        const row = Math.floor(to / 8);
        const promoted = !piece.k && ((seat === 0 && row === 0) || (seat === 1 && row === 7));
        if (promoted) piece.k = true;

        const continuing = state.must !== null && state.last && state.last.seat === seat;
        if (continuing) {
            state.last.path.push(to);
            if (captured) state.last.captured.push(captured);
            if (promoted) state.last.crowned = true;
        } else {
            state.last = { seat, path: [from, to], captured: captured ? [captured] : [], crowned: promoted };
        }
        state.ply++;

        if (captured && !promoted && jumpsFrom(b, to).length) {
            state.must = to;
            return { ok: true };
        }
        state.must = null;
        state.quiet = state.last.captured.length || state.last.crowned ? 0 : state.quiet + 1;
        state.turn = 1 - seat;
        return { ok: true };
    },
    result(state) {
        if (state.resigned !== null) return { winner: 1 - state.resigned, text: "Resigned." };
        const t = state.turn;
        if (!count(state.board, t)) return { winner: 1 - t, text: "Every piece taken!" };
        if (!legalMoves(state, t).length) return { winner: 1 - t, text: "No moves left." };
        if (state.quiet >= DRAW_PLIES) return { winner: null, text: "40 moves each without a capture." };
        return null;
    },
};
