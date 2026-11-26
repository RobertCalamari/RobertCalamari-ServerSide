// Placement helpers for N-player games.
// places(values, better): 1 = best, ties share a place, null values come last (and tie with each other).
function places(values, better = "high") {
    const real = values.filter((v) => v !== null && v !== undefined);
    return values.map((v) => {
        if (v === null || v === undefined) return real.length + 1;
        return 1 + real.filter((x) => (better === "high" ? x > v : x < v)).length;
    });
}

// the only seat in first place, or null when first is shared
function winnerOf(pl) {
    const first = pl.map((p, s) => (p === 1 ? s : -1)).filter((s) => s >= 0);
    return first.length === 1 ? first[0] : null;
}

// a result from per-seat values: { winner, places, text }
function ranked(values, better, text) {
    const pl = places(values, better);
    return { winner: winnerOf(pl), places: pl, text };
}

const seats = (n) => Array.from({ length: n }, (_, i) => i);

module.exports = { places, winnerOf, ranked, seats };
