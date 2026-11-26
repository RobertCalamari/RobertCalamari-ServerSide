// 10x10 grids, cell = r * 10 + c. shots[s] = where seat s has fired on the other seat's grid.
const N = 10;
const FLEET = [
    { name: "Carrier", len: 5 },
    { name: "Battleship", len: 4 },
    { name: "Cruiser", len: 3 },
    { name: "Submarine", len: 3 },
    { name: "Destroyer", len: 2 },
];

function cellsOf(i, v, len) {
    const r = Math.floor(i / N), c = i % N;
    if (v ? r + len > N : c + len > N) return null;
    const out = [];
    for (let k = 0; k < len; k++) out.push(v ? i + k * N : i + k);
    return out;
}

function buildFleet(list) {
    if (!Array.isArray(list) || list.length !== FLEET.length) return null;
    const used = new Set(), ships = [];
    for (let k = 0; k < FLEET.length; k++) {
        const s = list[k];
        if (!s || typeof s !== "object") return null;
        const i = Number(s.i), v = s.v;
        if (!Number.isInteger(i) || i < 0 || i >= N * N || typeof v !== "boolean") return null;
        const cells = cellsOf(i, v, FLEET[k].len);
        if (!cells || cells.some((x) => used.has(x))) return null;
        cells.forEach((x) => used.add(x));
        ships.push({ name: FLEET[k].name, len: FLEET[k].len, i, v, cells });
    }
    return ships;
}

function randomFleet(rng) {
    for (;;) {
        const list = [], used = new Set();
        let ok = true;
        for (const f of FLEET) {
            let placed = false;
            for (let tries = 0; tries < 200 && !placed; tries++) {
                const v = rng() < 0.5, i = Math.floor(rng() * N * N);
                const cells = cellsOf(i, v, f.len);
                if (!cells || cells.some((x) => used.has(x))) continue;
                cells.forEach((x) => used.add(x));
                list.push({ i, v });
                placed = true;
            }
            if (!placed) ok = false;
        }
        if (ok) return buildFleet(list);
    }
}

function sunk(state, owner, k) {
    const shots = state.shots[1 - owner];
    return state.fleets[owner][k].cells.every((x) => shots[x] === "h");
}

function allSunk(state, owner) {
    return state.fleets[owner].every((s, k) => sunk(state, owner, k));
}

function pub(ship) {
    return { name: ship.name, len: ship.len, i: ship.i, v: ship.v, cells: ship.cells };
}

module.exports = {
    id: "battleship",
    name: "Battleship",
    kind: "turn",
    quick: false,
    players: [2, 2],
    init({ rng }) {
        return {
            phase: "setup",
            fleets: [randomFleet(rng), randomFleet(rng)],
            ready: [false, false],
            shots: [Array(N * N).fill(null), Array(N * N).fill(null)],
            turn: rng() < 0.5 ? 0 : 1,
            last: null,
            n: 0,
            winner: null,
            resigned: null,
        };
    },
    view(state, seat) {
        const them = 1 - seat;
        const over = state.winner !== null || state.resigned !== null;
        const theirs = state.fleets[them].map((s, k) => {
            const down = sunk(state, them, k);
            return down || over ? { ...pub(s), sunk: down } : { name: s.name, len: s.len, sunk: false };
        });
        return {
            size: N,
            phase: state.phase,
            ready: state.ready,
            turn: state.turn,
            myTurn: state.phase === "play" && state.turn === seat && !over,
            fleet: state.fleets[seat].map((s, k) => ({ ...pub(s), sunk: sunk(state, seat, k) })),
            theirFleet: theirs,
            myShots: state.shots[seat],
            theirShots: state.shots[them],
            last: state.last,
            n: state.n,
            over,
        };
    },
    move(state, seat, p) {
        if (state.winner !== null || state.resigned !== null) return { error: "The game is over." };
        if (p && p.resign === true) {
            state.resigned = seat;
            return { ok: true };
        }
        if (state.phase === "setup") {
            if (state.ready[seat]) return { error: "Your fleet is locked in." };
            const ships = buildFleet(p && p.fleet);
            if (!ships) return { error: "Ships can't overlap or hang off the board." };
            state.fleets[seat] = ships;
            state.ready[seat] = true;
            if (state.ready[0] && state.ready[1]) state.phase = "play";
            return { ok: true };
        }
        if (state.turn !== seat) return { error: "It's not your turn." };
        const i = Number(p && p.i);
        if (!Number.isInteger(i) || i < 0 || i >= N * N) return { error: "Pick a square." };
        const shots = state.shots[seat];
        if (shots[i] !== null) return { error: "You already fired there." };
        const them = 1 - seat;
        const k = state.fleets[them].findIndex((s) => s.cells.includes(i));
        shots[i] = k >= 0 ? "h" : "m";
        state.n++;
        const down = k >= 0 && sunk(state, them, k);
        state.last = { seat, i, hit: k >= 0, sunk: down ? state.fleets[them][k].name : null, n: state.n };
        if (down && allSunk(state, them)) state.winner = seat;
        else state.turn = them;
        return { ok: true };
    },
    result(state) {
        if (state.resigned !== null) return { winner: 1 - state.resigned, text: "Resigned." };
        if (state.winner !== null) {
            const left = state.fleets[state.winner].filter((s, k) => !sunk(state, state.winner, k)).length;
            return { winner: state.winner, text: "Fleet sunk! " + left + " ship" + (left === 1 ? "" : "s") + " left afloat." };
        }
        return null;
    },
};
