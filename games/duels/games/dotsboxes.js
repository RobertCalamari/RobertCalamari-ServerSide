// 6x6 dots, 5x5 boxes. h[r * 5 + c]: line from dot (r,c) to (r,c+1), r 0-5. v[r * 6 + c]: dot (r,c) to (r+1,c), r 0-4.
const N = 5;

function boxDone(state, b) {
    const r = Math.floor(b / N), c = b % N;
    return state.h[r * N + c] !== null && state.h[(r + 1) * N + c] !== null && state.v[r * (N + 1) + c] !== null && state.v[r * (N + 1) + c + 1] !== null;
}

function boxesOf(t, r, c) {
    if (t === "h") return [r > 0 ? (r - 1) * N + c : -1, r < N ? r * N + c : -1].filter((b) => b >= 0);
    return [c > 0 ? r * N + c - 1 : -1, c < N ? r * N + c : -1].filter((b) => b >= 0);
}

function score(state, seat) {
    return state.boxes.filter((x) => x === seat).length;
}

module.exports = {
    id: "dotsboxes",
    name: "Dots and Boxes",
    kind: "turn",
    quick: false,
    init({ rng }) {
        return {
            h: Array((N + 1) * N).fill(null),
            v: Array(N * (N + 1)).fill(null),
            boxes: Array(N * N).fill(null),
            turn: rng() < 0.5 ? 0 : 1,
            last: null,
            n: 0,
            resigned: null,
        };
    },
    view(state, seat) {
        return {
            size: N,
            h: state.h,
            v: state.v,
            boxes: state.boxes,
            turn: state.turn,
            myTurn: state.turn === seat && state.resigned === null && state.boxes.includes(null),
            scores: [score(state, 0), score(state, 1)],
            last: state.last,
            n: state.n,
        };
    },
    move(state, seat, p) {
        if (state.resigned !== null || !state.boxes.includes(null)) return { error: "The game is over." };
        if (p && p.resign === true) {
            state.resigned = seat;
            return { ok: true };
        }
        if (state.turn !== seat) return { error: "It's not your turn." };
        const t = p && p.t, r = Number(p && p.r), c = Number(p && p.c);
        if (t !== "h" && t !== "v") return { error: "Pick a line." };
        if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0) return { error: "Pick a line." };
        if (t === "h" ? r > N || c >= N : r >= N || c > N) return { error: "Pick a line." };
        const arr = t === "h" ? state.h : state.v;
        const idx = t === "h" ? r * N + c : r * (N + 1) + c;
        if (arr[idx] !== null) return { error: "That line is already drawn." };
        arr[idx] = seat;
        const won = boxesOf(t, r, c).filter((b) => state.boxes[b] === null && boxDone(state, b));
        won.forEach((b) => (state.boxes[b] = seat));
        state.n++;
        state.last = { seat, t, r, c, boxes: won, n: state.n };
        if (!won.length) state.turn = 1 - seat;
        return { ok: true };
    },
    result(state) {
        if (state.resigned !== null) return { winner: 1 - state.resigned, text: "Resigned." };
        if (state.boxes.includes(null)) return null;
        const a = score(state, 0), b = score(state, 1);
        return { winner: a > b ? 0 : 1, text: Math.max(a, b) + " boxes to " + Math.min(a, b) + "." };
    },
};
