// Sliding tile puzzles: tiles 1..n²-1 and a gap (0), solved = 1,2,3,…,0. Shuffles are random walks of the gap from the
// solved board, so every board can be solved. A move names the tile that slides into the gap.
const solvedBoard = (size) => Array.from({ length: size * size }, (_, i) => (i + 1) % (size * size));

const adjacent = (a, b, size) => (Math.abs(a - b) === 1 && Math.floor(a / size) === Math.floor(b / size)) || Math.abs(a - b) === size;

// tiles out of place, summed by how far they are from home (a lower bound on moves)
function distance(tiles, size) {
    let d = 0;
    tiles.forEach((t, i) => {
        if (!t) return;
        const h = t - 1;
        d += Math.abs((h % size) - (i % size)) + Math.abs(Math.floor(h / size) - Math.floor(i / size));
    });
    return d;
}

function scramble(rng, size, steps) {
    for (;;) {
        const tiles = solvedBoard(size);
        let gap = tiles.length - 1;
        let back = -1;
        for (let k = 0; k < steps; k++) {
            const opts = [gap - 1, gap + 1, gap - size, gap + size].filter((c) => c >= 0 && c < tiles.length && c !== back && adjacent(c, gap, size));
            const c = opts[Math.floor(rng() * opts.length)];
            tiles[gap] = tiles[c];
            tiles[c] = 0;
            back = gap;
            gap = c;
        }
        const d = distance(tiles, size);
        if (d >= steps * 0.45 || d >= size * size * 1.6) return tiles;
    }
}

// play a list of moves; returns the board, or null if a move wasn't legal
function play(tiles, size, moves) {
    if (!Array.isArray(moves) || moves.length > 5000) return null;
    const b = tiles.slice();
    let gap = b.indexOf(0);
    for (const t of moves) {
        if (!Number.isInteger(t) || t < 1 || t >= b.length) return null;
        const i = b.indexOf(t);
        if (!adjacent(i, gap, size)) return null;
        b[gap] = t;
        b[i] = 0;
        gap = i;
    }
    return b;
}

const isSolved = (tiles) => tiles.every((t, i) => t === (i + 1) % tiles.length);

module.exports = { scramble, play, isSolved, distance, adjacent, solvedBoard };
