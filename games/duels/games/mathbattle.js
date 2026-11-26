const makeRace = require("../race");

// Same 60 problems for both players; most correct in 45 seconds wins.
function problems(rng) {
    const list = [];
    for (let i = 0; i < 60; i++) {
        const level = Math.min(3, Math.floor(i / 12));
        const op = ["+", "-", "×", "÷"][Math.floor(rng() * (level >= 1 ? 4 : 2))];
        const max = [12, 25, 50, 99][level];
        let a = 1 + Math.floor(rng() * max);
        let b = 1 + Math.floor(rng() * max);
        let ans;
        if (op === "+") ans = a + b;
        if (op === "-") {
            if (b > a) [a, b] = [b, a];
            ans = a - b;
        }
        if (op === "×") {
            a = 2 + Math.floor(rng() * (level + 8));
            b = 2 + Math.floor(rng() * (level + 8));
            ans = a * b;
        }
        if (op === "÷") {
            b = 2 + Math.floor(rng() * 10);
            ans = 1 + Math.floor(rng() * 12);
            a = b * ans;
        }
        list.push({ q: a + " " + op + " " + b, a: ans });
    }
    return list;
}

module.exports = makeRace({
    id: "mathbattle",
    name: "Math Battle",
    seconds: 45,
    better: "high",
    setup: (rng) => ({ problems: problems(rng) }),
    // the client sends its answers; the server re-checks them so nobody can fake a score
    validate: (puzzle, score, payload) => {
        const ans = Array.isArray(payload.answers) ? payload.answers.slice(0, 60) : [];
        const right = ans.filter((v, i) => puzzle.problems[i] && Number(v) === puzzle.problems[i].a).length;
        return right === score;
    },
    describe: (s) => s + " correct",
});
