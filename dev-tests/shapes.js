// checks every Shape Shifter design: right pieces, no overlaps, one outline
const path = require("path");
const geo = require(path.join(__dirname, "../games/duels/shapeshift/geo"));
const { DESIGNS } = require(path.join(__dirname, "../games/duels/shapeshift/designs"));

let bad = 0;
for (const d of DESIGNS) {
    const types = d.parts.map((p) => p.t).sort().join("");
    const polys = d.parts.map((p) => geo.poly(p.t, p.at));
    const self = geo.compare(polys, polys, 0.0517);
    const loops = geo.outline(polys);
    const area = polys.reduce((a, p) => a + Math.abs(geo.area(p)), 0);
    const ok = types === geo.SET.slice().sort().join("") && self.err < 0.02 && loops.length === 1 && Math.abs(area - 16) < 1e-6;
    if (!ok) bad++;
    console.log((ok ? "ok  " : "BAD ") + d.name.padEnd(10), "loops", loops.length, "corners", loops[0] && loops[0].length, "overlap", self.err.toFixed(3), "area", area);
}
process.exit(bad ? 1 : 0);
