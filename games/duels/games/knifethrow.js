const makeRace = require("../race");

// Same logs for both players: tap to throw, don't hit a knife that's already stuck.
const LEVELS = 20;
const GAP = 0.22; // radians: closer than this to another knife = bounce off
const PATTERNS = ["steady", "wobble", "flip", "surge"];

function levels(rng) {
    const list = [];
    for (let i = 0; i < LEVELS; i++) {
        const obstacles = Math.min(6, Math.floor(i / 2) + (i > 0 ? 1 : 0));
        const stuck = [];
        let tries = 0;
        while (stuck.length < obstacles && tries++ < 200) {
            const a = Math.round(rng() * Math.PI * 2 * 1000) / 1000;
            const near = stuck.some((b) => {
                const d = Math.abs(a - b) % (Math.PI * 2);
                return Math.min(d, Math.PI * 2 - d) < 0.6;
            });
            if (!near) stuck.push(a);
        }
        list.push({
            stuck,
            knives: Math.min(12, 5 + Math.floor(i / 2) + Math.floor(rng() * 2)),
            speed: Math.round(Math.min(4.6, 1.6 + i * 0.16 + rng() * 0.4) * 100) / 100,
            dir: rng() < 0.5 ? 1 : -1,
            pattern: i === 0 ? "steady" : PATTERNS[Math.floor(rng() * (i < 3 ? 2 : 4))],
            period: Math.round((1.6 + rng() * 1.6) * 100) / 100,
        });
    }
    return { levels: list, gap: GAP };
}

module.exports = makeRace({
    id: "knifethrow",
    name: "Knife Throw",
    seconds: 40,
    better: "high",
    setup: (rng) => levels(rng),
    validate: (puzzle, score) => {
        const max = puzzle.levels.reduce((s, l) => s + l.knives, 0);
        return Number.isInteger(score) && score >= 0 && score <= max;
    },
    describe: (s) => s + " knives",
});
