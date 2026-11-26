// Simon Race: one seeded colour sequence that grows by a step every level. It plays, then both repeat it at
// the same time and watch each other's progress. A wrong tap (or running out of time) knocks you out; outlast
// the other player to win. Both out on the same level: more right taps wins, then whoever got there faster.
// Steps are only sent once they've flashed, so nobody can peek ahead.
const START_LEN = 3;
const MAX_LEVEL = 25;
const COUNT_MS = 2500;
const GAP_MS = 1100;
const BASE_INPUT_MS = 2500;
const PER_STEP_MS = 750;

const stepMs = (level) => Math.max(300, 560 - (level - START_LEN) * 20);
const onMs = (level) => Math.round(stepMs(level) * 0.68);

function startLevel(state, ctx, delay) {
    const now = ctx.now();
    state.level++;
    const len = state.level + START_LEN - 1;
    const step = stepMs(len);
    state.phase = "show";
    state.len = len;
    state.step = step;
    state.on = onMs(len);
    state.showAt = now + delay;
    state.inputAt = state.showAt + (len - 1) * step + state.on + 250;
    state.inputEnd = state.inputAt + BASE_INPUT_MS + len * PER_STEP_MS;
    state.progress = [0, 0];
    state.lastAt = [null, null];
    const level = state.level;
    // new steps go out the moment they flash
    for (let i = state.revealed; i < len; i++) {
        ctx.later(delay + i * step, () => {
            if (state.level === level && state.phase === "show") state.revealed = Math.max(state.revealed, i + 1);
        });
    }
    ctx.later(state.inputAt - now, () => {
        if (state.level !== level || state.phase !== "show") return;
        state.revealed = len;
        state.phase = "input";
    });
    ctx.later(state.inputEnd - now, (t) => {
        if (state.level !== level || state.phase !== "input") return;
        for (const s of [0, 1]) {
            if (state.status[s] === "in") knockOut(state, s, "time", t);
        }
        settle(state, ctx);
    });
}

function knockOut(state, s, why, now) {
    state.status[s] = "out";
    state.why[s] = why;
    state.outLevel[s] = state.level;
    state.outAt[s] = now;
}

function settle(state, ctx) {
    if (state.phase !== "input" || state.status.includes("in")) return;
    const out = state.status.map((x) => x === "out");
    if (!out[0] && !out[1]) {
        state.cleared = [state.level, state.level];
        state.time[0] += state.lastAt[0] - state.inputAt;
        state.time[1] += state.lastAt[1] - state.inputAt;
        if (state.level >= MAX_LEVEL) return end(state, "max");
        state.status = ["in", "in"];
        return startLevel(state, ctx, GAP_MS);
    }
    for (const s of [0, 1]) if (!out[s]) state.cleared[s] = state.level;
    end(state, out[0] && out[1] ? "both" : "one");
}

function end(state, how) {
    state.phase = "done";
    state.how = how;
    state.revealed = state.len;
}

module.exports = {
    id: "simonrace",
    name: "Simon Race",
    kind: "live",
    quick: true,
    init({ rng, ctx }) {
        const seq = [];
        for (let i = 0; i < MAX_LEVEL + START_LEN; i++) seq.push(Math.floor(rng() * 4));
        const state = {
            seq,
            level: 0,
            len: 0,
            revealed: 0,
            phase: "show",
            step: 0,
            on: 0,
            showAt: 0,
            inputAt: 0,
            inputEnd: 0,
            progress: [0, 0],
            lastAt: [null, null],
            status: ["in", "in"],
            why: [null, null],
            outLevel: [null, null],
            outAt: [null, null],
            cleared: [0, 0],
            time: [0, 0],
            how: null,
        };
        startLevel(state, ctx, COUNT_MS);
        return state;
    },
    view(state) {
        return {
            phase: state.phase,
            level: state.level,
            len: state.len,
            startLen: START_LEN,
            seq: state.seq.slice(0, state.revealed),
            step: state.step,
            on: state.on,
            showAt: state.showAt,
            inputAt: state.inputAt,
            inputEnd: state.inputEnd,
            progress: state.progress,
            status: state.status,
            why: state.why,
            outLevel: state.outLevel,
            cleared: state.cleared,
            how: state.how,
        };
    },
    move(state, seat, p, ctx) {
        if (!p || typeof p !== "object" || !Number.isInteger(p.level) || !Number.isInteger(p.i) || ![0, 1, 2, 3].includes(p.color)) return { error: "Bad tap." };
        if (p.level !== state.level || state.phase !== "input" || state.status[seat] !== "in") return { ok: true, quiet: true };
        if (p.i !== state.progress[seat]) return { ok: true, quiet: true };
        const now = ctx.now();
        if (now >= state.inputEnd) {
            knockOut(state, seat, "time", now);
            settle(state, ctx);
            return { ok: true };
        }
        if (state.seq[p.i] !== p.color) {
            knockOut(state, seat, "wrong", now);
            settle(state, ctx);
            return { ok: true };
        }
        state.progress[seat]++;
        state.lastAt[seat] = now;
        if (state.progress[seat] >= state.len) {
            state.status[seat] = "done";
            settle(state, ctx);
        }
        return { ok: true };
    },
    result(state) {
        if (state.phase !== "done") return null;
        if (state.how === "one") {
            const w = state.status[0] === "out" ? 1 : 0;
            return { winner: w, text: "Survived level " + state.level + " (" + state.len + " steps)" };
        }
        if (state.how === "max") {
            const [a, b] = state.time;
            if (a === b) return { winner: null, text: "Both beat all " + MAX_LEVEL + " levels!" };
            const w = a < b ? 0 : 1;
            return { winner: w, text: "Both beat every level · faster by " + (Math.abs(a - b) / 1000).toFixed(1) + "s" };
        }
        const [a, b] = state.progress;
        if (a !== b) {
            const w = a > b ? 0 : 1;
            return { winner: w, text: "Both out on level " + state.level + " · " + state.progress[w] + "/" + state.len + " beats " + state.progress[1 - w] };
        }
        if (a > 0) {
            const t = [0, 1].map((s) => state.lastAt[s] - state.inputAt);
            if (t[0] !== t[1]) {
                const w = t[0] < t[1] ? 0 : 1;
                return { winner: w, text: "Both out on level " + state.level + " at " + a + "/" + state.len + " · quicker fingers" };
            }
        }
        return { winner: null, text: "Both out on level " + state.level };
    },
};
