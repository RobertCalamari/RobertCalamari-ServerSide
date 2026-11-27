// Hedge Run: race your gardener across a 9x9 lawn while planting hedges to slow the other one down.
// Cells [r, c], row 0 at the top. Seat 0 starts at the bottom and heads for row 0; seat 1 the reverse.
// A hedge sits on a groove crossing {o, r, c} (r, c 0-7): "h" runs between rows r and r+1 over columns c and c+1,
// "v" runs between columns c and c+1 over rows r and r+1.
const N = 9;
const HEDGES = 10;
const TURN_MS = 45000;
const MAX_TURNS = 400;
const START = [[8, 4], [0, 4]];
const GOAL = [0, 8];
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const on = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const has = (walls, o, r, c) => walls.some((w) => w.o === o && w.r === r && w.c === c);

// is the step from (r,c) one square in direction (dr,dc) blocked by a hedge or the edge?
function blocked(walls, r, c, dr, dc) {
    const r2 = r + dr, c2 = c + dc;
    if (!on(r2, c2)) return true;
    if (dr) {
        const gr = Math.min(r, r2);
        return has(walls, "h", gr, c) || has(walls, "h", gr, c - 1);
    }
    const gc = Math.min(c, c2);
    return has(walls, "v", r, gc) || has(walls, "v", r - 1, gc);
}

// steps to the goal row from every cell, ignoring pieces (Infinity = cut off)
function distances(walls, goal) {
    const d = Array.from({ length: N }, () => Array(N).fill(Infinity));
    const q = [];
    for (let c = 0; c < N; c++) {
        d[goal][c] = 0;
        q.push([goal, c]);
    }
    for (let i = 0; i < q.length; i++) {
        const [r, c] = q[i];
        for (const [dr, dc] of DIRS) {
            if (blocked(walls, r, c, dr, dc) || d[r + dr][c + dc] !== Infinity) continue;
            d[r + dr][c + dc] = d[r][c] + 1;
            q.push([r + dr, c + dc]);
        }
    }
    return d;
}

function stepsMoves(walls, pos, seat) {
    const [r, c] = pos[seat];
    const other = pos.filter((p, s) => s !== seat);
    const taken = (rr, cc) => other.some((p) => p[0] === rr && p[1] === cc);
    const out = [];
    for (const [dr, dc] of DIRS) {
        if (blocked(walls, r, c, dr, dc)) continue;
        const nr = r + dr, nc = c + dc;
        if (!taken(nr, nc)) {
            out.push([nr, nc]);
            continue;
        }
        // face to face: hop over, or sideways if a hedge or the edge is behind them
        if (!blocked(walls, nr, nc, dr, dc) && !taken(nr + dr, nc + dc)) {
            out.push([nr + dr, nc + dc]);
            continue;
        }
        for (const [sr, sc] of dr ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) {
            if (!blocked(walls, nr, nc, sr, sc) && !taken(nr + sr, nc + sc)) out.push([nr + sr, nc + sc]);
        }
    }
    return out;
}

// why a hedge can't go there, or null
function wallProblem(state, seat, o, r, c) {
    if (o !== "h" && o !== "v") return "Pick across or down.";
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r > N - 2 || c < 0 || c > N - 2) return "That's off the lawn.";
    if (state.left[seat] <= 0) return "You're out of hedges.";
    const w = state.walls;
    if (has(w, o, r, c)) return "There's already a hedge there.";
    if (o === "h" ? has(w, "h", r, c - 1) || has(w, "h", r, c + 1) : has(w, "v", r - 1, c) || has(w, "v", r + 1, c)) return "That overlaps a hedge.";
    if (has(w, o === "h" ? "v" : "h", r, c)) return "That crosses a hedge.";
    const next = w.concat({ o, r, c });
    for (let s = 0; s < state.pos.length; s++) {
        const [pr, pc] = state.pos[s];
        if (distances(next, GOAL[s])[pr][pc] === Infinity) return "That would hedge someone in.";
    }
    return null;
}

function nextTurn(state, ctx) {
    state.turn = 1 - state.turn;
    state.turns++;
    armTimer(state, ctx);
}

function armTimer(state, ctx) {
    state.turnId++;
    if (!state.timer) return;
    state.turnEndsAt = ctx.now() + TURN_MS;
    const id = state.turnId;
    ctx.later(TURN_MS, () => {
        if (state.turnId !== id || state.winner !== null) return;
        autoStep(state, ctx);
    });
}

function doStep(state, seat, to, auto) {
    const from = state.pos[seat].slice();
    state.pos[seat] = to;
    state.steps[seat]++;
    state.last = { seat, kind: "move", from, to, auto: !!auto, n: state.turns };
    if (to[0] === GOAL[seat]) state.winner = seat;
}

// out of time: one step along the shortest way home
function autoStep(state, ctx) {
    const seat = state.turn;
    const d = distances(state.walls, GOAL[seat]);
    const moves = stepsMoves(state.walls, state.pos, seat);
    if (moves.length) {
        moves.sort((a, b) => d[a[0]][a[1]] - d[b[0]][b[1]]);
        doStep(state, seat, moves[0], true);
    } else state.last = { seat, kind: "pass", auto: true, n: state.turns };
    if (state.winner === null) nextTurn(state, ctx);
}

module.exports = {
    id: "hedgerun",
    name: "Hedge Run",
    kind: "turn",
    quick: false,
    players: [2, 2],
    options: { timer: [true, false] },
    init({ rng, ctx, options }) {
        const state = {
            pos: START.map((p) => p.slice()),
            walls: [],
            left: [HEDGES, HEDGES],
            steps: [0, 0],
            turn: rng() < 0.5 ? 0 : 1,
            turns: 0,
            turnId: 0,
            turnEndsAt: null,
            timer: !options || options.timer !== false,
            last: null,
            winner: null,
            resigned: null,
        };
        armTimer(state, ctx);
        return state;
    },
    view(state, seat) {
        const v = module.exports.tv(state);
        v.myTurn = state.turn === seat && state.winner === null && state.resigned === null;
        v.moves = v.myTurn ? stepsMoves(state.walls, state.pos, seat) : [];
        return v;
    },
    tv(state) {
        return {
            size: N,
            pos: state.pos,
            goal: GOAL,
            walls: state.walls,
            left: state.left,
            turn: state.turn,
            turnEndsAt: state.timer ? state.turnEndsAt : null,
            last: state.last,
            dist: state.pos.map((p, s) => distances(state.walls, GOAL[s])[p[0]][p[1]]),
            winner: state.winner,
        };
    },
    move(state, seat, p, ctx) {
        if (state.winner !== null || state.resigned !== null) return { error: "The game is over." };
        if (p && p.resign === true) {
            state.resigned = seat;
            return { ok: true };
        }
        if (state.turn !== seat) return { error: "It's not your turn." };
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.act === "move") {
            const to = [p.r, p.c];
            if (!stepsMoves(state.walls, state.pos, seat).some((m) => m[0] === to[0] && m[1] === to[1])) return { error: "You can't move there." };
            doStep(state, seat, to);
        } else if (p.act === "wall") {
            const why = wallProblem(state, seat, p.o, p.r, p.c);
            if (why) return { error: why };
            state.walls.push({ o: p.o, r: p.r, c: p.c, seat });
            state.left[seat]--;
            state.last = { seat, kind: "wall", o: p.o, r: p.r, c: p.c, n: state.turns };
        } else return { error: "Bad move." };
        if (state.winner === null) nextTurn(state, ctx);
        return { ok: true };
    },
    result(state) {
        if (state.resigned !== null) return { winner: 1 - state.resigned, text: "Resigned." };
        if (state.winner !== null) {
            const s = state.winner;
            return { winner: s, text: "Made it across in " + state.steps[s] + " steps with " + state.left[s] + " hedge" + (state.left[s] === 1 ? "" : "s") + " to spare." };
        }
        if (state.turns >= MAX_TURNS) return { winner: null, text: "Nobody got through in " + MAX_TURNS + " turns." };
        return null;
    },
    distances,
    stepsMoves,
};
