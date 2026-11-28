const g = require(process.argv[2]);
const d = [3, 4, 5, 0];
const cases = [["d0", "!"], ["d0", "!", "!"], ["d1", "!", "!"], ["(", "d0", "+", "d1", ")", "!"], ["d1", "d2", "!"], ["(", "d0", "/", "d1", ")", "!"], ["d0", "!", "*", "d1", "!"], ["!", "d0"], ["d0", "!!"], ["d3", "!"], ["(", "d3", "-", "d0", ")", "!"]];
for (const t of cases) console.log(t.join(" "), JSON.stringify(g.evaluate(t, d)));
