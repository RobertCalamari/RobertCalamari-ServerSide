// Shape Shifter silhouettes, each made from the full set. Most reuse the "five small pieces" triangle (legs 4, right
// angle at `corner`, legs along u and v) plus the two large triangles placed by their corners.
const { poly, turn, LOCAL } = require("./geo");

// the five small pieces inside a legs-4 right triangle, right angle at the origin, legs along +u and +v
const FIVE = [
    ["M", [[0, 0], [2, 0], [0, 2]]],
    ["S", [[0, 4], [0, 2], [1, 3]]],
    ["Q", [[2, 2], [1, 3], [0, 2], [1, 1]]],
    ["S", [[2, 2], [1, 1], [3, 1]]],
    ["P", [[4, 0], [3, 1], [1, 1], [2, 0]]],
];

const five = ([cx, cy], [ux, uy], [vx, vy]) => FIVE.map(([t, pts]) => [t, pts.map(([u, v]) => [cx + u * ux + v * vx, cy + u * uy + v * vy])]);

const RAW = [
    ["Square", [["L", [[0, 0], [4, 0], [2, 2]]], ["L", [[0, 0], [2, 2], [0, 4]]], ...five([4, 4], [-1, 0], [0, -1])]],
    ["Mountain", [["L", [[4, 0], [4, 4], [6, 2]]], ["L", [[4, 4], [8, 4], [6, 2]]], ...five([4, 4], [-1, 0], [0, -1])]],
    ["Ramp", [["L", [[4, 0], [8, 0], [6, 2]]], ["L", [[4, 0], [4, 4], [6, 2]]], ...five([4, 4], [-1, 0], [0, -1])]],
    ["Sailboat", [["L", [[0, 4], [4, 4], [2, 6]]], ["L", [[2, 6], [4, 4], [6, 6]]], ...five([0, 4], [1, 0], [0, -1])]],
    ["Lightning", [["L", [[0, 0], [4, 0], [2, 2]]], ["L", [[2, 2], [4, 4], [6, 2]]], ...five([0, 4], [1, 0], [0, -1])]],
    ["Flag", [["L", [[0, 0], [4, 0], [2, 2]]], ["L", [[4, 0], [6, 2], [2, 2]]], ...five([2, 2], [1, 0], [0, 1])]],
    ["Fish", [["L", [[0, 2], [4, 2], [2, 0]]], ["L", [[0, 2], [4, 2], [2, 4]]], ...five([6, 4], [-1, 0], [0, -1])]],
];

const same = (a, b) => a.length === b.length && a.every((p) => b.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6));

// find the placement [x, y, r, f] that turns a piece of `type` into exactly these corners
function fit(type, pts) {
    const c = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    for (let f = 0; f < 2; f++) {
        for (let r = 0; r < 8; r++) {
            const pl = [c[0], c[1], r, f];
            if (same(poly(type, pl), pts)) return pl;
        }
    }
    throw new Error("Shape Shifter: a " + type + " doesn't fit " + JSON.stringify(pts));
}

const DESIGNS = RAW.map(([name, parts]) => ({ name, parts: parts.map(([t, pts]) => ({ t, at: fit(t, pts), pts })) }));

module.exports = { DESIGNS, fit, turn, LOCAL };
