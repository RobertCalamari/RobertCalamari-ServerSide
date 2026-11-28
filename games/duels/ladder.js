// Word ladders: change one letter at a time, every step a real word. Pairs are picked so the shortest ladder over
// everyday words (COMMON) is just as short as over every word we accept (VALID): nobody can beat the shown path.
const { TOP, COMMON, VALID } = require("./words");
const ABC = "abcdefghijklmnopqrstuvwxyz";

const LISTS = {};
function list(len) {
    if (!LISTS[len]) LISTS[len] = { common: new Set(COMMON.filter((w) => w.length === len && /^[a-z]+$/.test(w))), top: [...TOP].filter((w) => w.length === len && /^[a-z]+$/.test(w) && !w.endsWith("s")).sort() };
    return LISTS[len];
}

function next(w, has) {
    const out = [];
    for (let i = 0; i < w.length; i++) {
        for (const c of ABC) {
            if (c === w[i]) continue;
            const x = w.slice(0, i) + c + w.slice(i + 1);
            if (has(x)) out.push(x);
        }
    }
    return out;
}

// distance from `from` to every word it can reach (and a parent to walk back along)
function bfs(from, has, cap = 9) {
    const dist = { [from]: 0 };
    const prev = {};
    let wave = [from];
    for (let d = 1; d <= cap && wave.length; d++) {
        const nw = [];
        for (const w of wave) {
            for (const x of next(w, has)) {
                if (dist[x] !== undefined) continue;
                dist[x] = d;
                prev[x] = w;
                nw.push(x);
            }
        }
        wave = nw;
    }
    return { dist, prev };
}

const oneOff = (a, b) => a.length === b.length && [...a].filter((c, i) => c !== b[i]).length === 1;

// { start, target, path } with a shortest path of lo..hi steps
function pickLadder(rng, len, lo = 4, hi = 7, avoid = []) {
    const { common, top } = list(len);
    const isCommon = (x) => common.has(x);
    const isValid = (x) => x.length === len && VALID.has(x);
    for (let tries = 0; tries < 400; tries++) {
        const start = top[Math.floor(rng() * top.length)];
        if (avoid.includes(start)) continue;
        const c = bfs(start, isCommon, hi);
        const far = top.filter((w) => c.dist[w] >= lo && c.dist[w] <= hi && !avoid.includes(w));
        if (!far.length) continue;
        const v = bfs(start, isValid, hi);
        const ok = far.filter((w) => v.dist[w] === c.dist[w]);
        if (!ok.length) continue;
        const target = ok[Math.floor(rng() * ok.length)];
        const path = [target];
        while (path[0] !== start) path.unshift(c.prev[path[0]]);
        return { start, target, path };
    }
    throw new Error("no ladder");
}

// why `w` can't follow `chain` (or null if it can)
function badStep(chain, w) {
    const last = chain[chain.length - 1];
    if (typeof w !== "string" || w.length !== last.length) return "Keep it " + last.length + " letters.";
    if (!/^[a-z]+$/.test(w)) return "Letters only.";
    if (!oneOff(last, w)) return "Change exactly one letter.";
    if (chain.includes(w)) return "Already in your ladder.";
    if (!VALID.has(w)) return "Not a word we know.";
    return null;
}

module.exports = { pickLadder, badStep, oneOff, bfs, next };
