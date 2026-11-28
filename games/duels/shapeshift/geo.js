// Tangram geometry shared by Shape Shifter and its tests. Units: the classic square is 4×4.
// A placement is [x, y, r, f]: centroid position, r = 45° steps (0..7), f = 1 to mirror before turning.
const RAW = {
    L: [[0, 0], [4, 0], [2, 2]],
    M: [[0, 0], [2, 0], [0, 2]],
    S: [[0, 0], [2, 0], [1, 1]],
    Q: [[1, 0], [2, 1], [1, 2], [0, 1]],
    P: [[0, 0], [2, 0], [3, 1], [1, 1]],
};
const SET = ["L", "L", "M", "S", "S", "Q", "P"];
const H = Math.SQRT1_2;

const centre = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
const LOCAL = Object.fromEntries(Object.entries(RAW).map(([k, pts]) => {
    const c = centre(pts);
    return [k, pts.map(([x, y]) => [x - c[0], y - c[1]])];
}));

function turn([x, y], r, f) {
    if (f) x = -x;
    const a = (r * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
    return [x * c - y * s, x * s + y * c];
}

const poly = (type, [x, y, r, f]) => LOCAL[type].map((v) => {
    const [a, b] = turn(v, r, f);
    return [x + a, y + b];
});

// design steps: [type, r, f, x0, y0] puts the piece's first corner at (x0, y0)
function fromCorner(type, r, f, x0, y0) {
    const [a, b] = turn(LOCAL[type][0], r, f);
    return [x0 - a, y0 - b, r, f];
}

const area = (pts) => pts.reduce((s, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return s + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;

function inside(pts, x, y) {
    let sign = 0;
    for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
        if (Math.abs(c) < 1e-12) continue;
        if (sign && Math.sign(c) !== sign) return false;
        sign = Math.sign(c);
    }
    return true;
}

const key = ([x, y]) => Math.round(x * 1e4) + "," + Math.round(y * 1e4);
const r4 = (v) => Math.round(v * 1e4) / 1e4;

// outline of pieces that only touch edge to edge: split every edge at other corners on it, drop the shared halves,
// chain what's left into loops and merge straight runs. Gives no hint of where one piece ends and the next begins.
function outline(polys) {
    const ccw = polys.map((p) => (area(p) < 0 ? p.slice().reverse() : p));
    const corners = ccw.flat();
    const edges = [];
    for (const p of ccw) {
        p.forEach((a, i) => {
            const b = p[(i + 1) % p.length];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const cuts = corners.map((c) => {
                const t = ((c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1])) / (len * len);
                const off = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / len;
                return off < 1e-6 && t > 1e-6 && t < 1 - 1e-6 ? t : null;
            }).filter((t) => t !== null).sort((x, y) => x - y);
            let prev = a;
            for (const t of cuts.concat([1])) {
                const pt = t === 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
                if (key(pt) !== key(prev)) edges.push([prev, pt]);
                prev = pt;
            }
        });
    }
    const count = new Map();
    edges.forEach(([a, b]) => count.set(key(a) + ">" + key(b), (count.get(key(a) + ">" + key(b)) || 0) + 1));
    const left = edges.filter(([a, b]) => !count.get(key(b) + ">" + key(a)));
    const from = new Map();
    left.forEach((e) => {
        const k = key(e[0]);
        if (!from.has(k)) from.set(k, []);
        from.get(k).push(e);
    });
    const used = new Set();
    const loops = [];
    for (const e of left) {
        if (used.has(e)) continue;
        const loop = [];
        let cur = e;
        while (cur && !used.has(cur)) {
            used.add(cur);
            loop.push(cur[0]);
            cur = (from.get(key(cur[1])) || []).find((x) => !used.has(x));
        }
        const pts = loop.filter((p, i) => {
            const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
            return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-6;
        });
        if (pts.length >= 3) loops.push(pts.map(([x, y]) => [r4(x), r4(y)]));
    }
    return loops;
}

// how well placed pieces cover a target made of pieces: sample a fine grid around it
function compare(target, pieces, step = 0.1) {
    const xs = target.flat().map((p) => p[0]), ys = target.flat().map((p) => p[1]);
    const x0 = Math.min(...xs) - 0.5, x1 = Math.max(...xs) + 0.5, y0 = Math.min(...ys) - 0.5, y1 = Math.max(...ys) + 0.5;
    let want = 0, got = 0, bad = 0;
    for (let x = x0 + step * 0.43; x < x1; x += step) {
        for (let y = y0 + step * 0.57; y < y1; y += step) {
            const t = target.some((p) => inside(p, x, y));
            const n = pieces.reduce((a, p) => a + (inside(p, x, y) ? 1 : 0), 0);
            if (t) want++;
            if (t && n) got++;
            bad += (t && !n ? 1 : 0) + (!t && n ? 1 : 0) + Math.max(0, n - 1);
        }
    }
    return { cover: want ? got / want : 0, err: bad * step * step };
}

module.exports = { RAW, LOCAL, SET, H, turn, poly, fromCorner, area, inside, outline, compare, centre };
