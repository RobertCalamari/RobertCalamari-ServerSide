const makeRace = require("../race");

// 20 targets in the same spots for both players. Tap them all as fast as you can; misses add 0.5s.
// Finishing all 20 scores your time; running out scores 999 minus targets hit.
const COUNT = 20;
const SECONDS = 40;

function targets(rng) {
    const list = [];
    for (let i = 0; i < COUNT; i++) {
        const r = 0.075 + rng() * 0.055 - i * 0.0015;
        list.push({
            x: Math.round((0.12 + rng() * 0.76) * 1000) / 1000,
            y: Math.round((0.1 + rng() * 0.8) * 1000) / 1000,
            r: Math.round(r * 1000) / 1000,
        });
    }
    return list;
}

const close = (a, b) => Math.abs(a - b) < 0.011;

module.exports = makeRace({
    id: "aimrush",
    name: "Aim Rush",
    seconds: SECONDS,
    better: "low",
    setup: (rng) => ({ targets: targets(rng), penalty: 0.5 }),
    validate: (puzzle, score, p) => {
        if (score > 999 - COUNT) {
            const hits = Number(p.hits);
            return Number.isInteger(hits) && hits >= 0 && hits < COUNT && score === 999 - hits;
        }
        const time = Number(p.time);
        const misses = Number(p.misses);
        if (!Number.isFinite(time) || time < 2 || time > SECONDS + 2) return false;
        if (!Number.isInteger(misses) || misses < 0 || misses > 300) return false;
        return close(score, time + misses * 0.5);
    },
    describe: (s) => (s > 999 - COUNT ? 999 - s + "/" + COUNT + " targets" : s.toFixed(2) + "s"),
});
