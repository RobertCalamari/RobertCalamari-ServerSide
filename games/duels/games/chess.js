const FILES = "abcdefgh";
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const KG = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISH = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const BACK = ["R", "N", "B", "Q", "K", "B", "N", "R"];

const sqName = (i) => FILES[i & 7] + ((i >> 3) + 1);
const other = (c) => (c === "w" ? "b" : "w");
const at = (f, r) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 8 + f : -1);

function parseSq(s) {
    if (typeof s !== "string" || !/^[a-h][1-8]$/.test(s)) return -1;
    return (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
}

function attacked(b, sq, by) {
    const f = sq & 7, r = sq >> 3;
    const pr = by === "w" ? r - 1 : r + 1;
    for (const df of [-1, 1]) {
        const i = at(f + df, pr);
        if (i >= 0 && b[i] === by + "P") return true;
    }
    for (const [df, dr] of KN) {
        const i = at(f + df, r + dr);
        if (i >= 0 && b[i] === by + "N") return true;
    }
    for (const [df, dr] of KG) {
        const i = at(f + df, r + dr);
        if (i >= 0 && b[i] === by + "K") return true;
    }
    for (const [dirs, kinds] of [[ROOK, "RQ"], [BISH, "BQ"]]) {
        for (const [df, dr] of dirs) {
            let x = f + df, y = r + dr;
            while (x >= 0 && x < 8 && y >= 0 && y < 8) {
                const p = b[y * 8 + x];
                if (p) {
                    if (p[0] === by && kinds.includes(p[1])) return true;
                    break;
                }
                x += df;
                y += dr;
            }
        }
    }
    return false;
}

const kingSq = (b, c) => b.indexOf(c + "K");
const inCheck = (b, c) => attacked(b, kingSq(b, c), other(c));

function pseudo(s, c) {
    const b = s.board, out = [], opp = other(c);
    for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (!p || p[0] !== c) continue;
        const f = i & 7, r = i >> 3, t = p[1];
        if (t === "P") {
            const d = c === "w" ? 1 : -1, last = c === "w" ? 7 : 0;
            const add = (to, ep) => {
                if (to >> 3 === last) for (const q of "qrbn") out.push({ from: i, to, promo: q });
                else out.push(ep ? { from: i, to, ep: true } : { from: i, to });
            };
            const one = at(f, r + d);
            if (one >= 0 && !b[one]) {
                add(one);
                const two = at(f, r + 2 * d);
                if (r === (c === "w" ? 1 : 6) && !b[two]) out.push({ from: i, to: two, double: true });
            }
            for (const df of [-1, 1]) {
                const to = at(f + df, r + d);
                if (to < 0) continue;
                if (b[to] && b[to][0] === opp) add(to);
                else if (to === s.ep && !b[to]) add(to, true);
            }
        } else if (t === "N" || t === "K") {
            for (const [df, dr] of t === "N" ? KN : KG) {
                const to = at(f + df, r + dr);
                if (to >= 0 && (!b[to] || b[to][0] === opp)) out.push({ from: i, to });
            }
            const home = c === "w" ? 4 : 60;
            if (t === "K" && i === home && !attacked(b, i, opp)) {
                const K = c === "w" ? "K" : "k", Q = c === "w" ? "Q" : "q";
                if (s.castle.includes(K) && !b[home + 1] && !b[home + 2] && b[home + 3] === c + "R" && !attacked(b, home + 1, opp) && !attacked(b, home + 2, opp))
                    out.push({ from: i, to: home + 2, castle: "K" });
                if (s.castle.includes(Q) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === c + "R" && !attacked(b, home - 1, opp) && !attacked(b, home - 2, opp))
                    out.push({ from: i, to: home - 2, castle: "Q" });
            }
        } else {
            for (const [df, dr] of t === "R" ? ROOK : t === "B" ? BISH : KG) {
                let x = f + df, y = r + dr;
                while (x >= 0 && x < 8 && y >= 0 && y < 8) {
                    const to = y * 8 + x;
                    if (b[to]) {
                        if (b[to][0] === opp) out.push({ from: i, to });
                        break;
                    }
                    out.push({ from: i, to });
                    x += df;
                    y += dr;
                }
            }
        }
    }
    return out;
}

function applyBoard(b, m) {
    const nb = b.slice();
    const piece = nb[m.from];
    nb[m.to] = m.promo ? piece[0] + m.promo.toUpperCase() : piece;
    nb[m.from] = null;
    if (m.ep) nb[(m.from >> 3) * 8 + (m.to & 7)] = null;
    if (m.castle === "K") {
        nb[m.from + 1] = nb[m.from + 3];
        nb[m.from + 3] = null;
    } else if (m.castle === "Q") {
        nb[m.from - 1] = nb[m.from - 4];
        nb[m.from - 4] = null;
    }
    return nb;
}

function legal(s, c) {
    return pseudo(s, c).filter((m) => !inCheck(applyBoard(s.board, m), c));
}

function posKey(s) {
    const moves = legal(s, s.turn);
    const ep = moves.some((m) => m.ep) ? sqName(s.ep) : "-";
    return s.board.map((p) => p || "..").join("") + s.turn + (s.castle || "-") + ep;
}

function insufficient(b) {
    const minors = [];
    for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (!p || p[1] === "K") continue;
        if (p[1] !== "B" && p[1] !== "N") return false;
        minors.push({ p, i });
    }
    if (minors.length <= 1) return true;
    if (minors.every((m) => m.p[1] === "B")) {
        const shade = (i) => ((i >> 3) + (i & 7)) % 2;
        return minors.every((m) => shade(m.i) === shade(minors[0].i));
    }
    return false;
}

function strip(castle, sq) {
    const map = { 0: "Q", 7: "K", 56: "q", 63: "k", 4: "KQ", 60: "kq" };
    if (!map[sq]) return castle;
    return castle.split("").filter((ch) => !map[sq].includes(ch)).join("");
}

const colorOf = (s, seat) => (seat === s.white ? "w" : "b");
const seatOf = (s, c) => (c === "w" ? s.white : 1 - s.white);

module.exports = {
    id: "chess",
    name: "Chess",
    kind: "turn",
    quick: false,
    players: [2, 2],
    init({ rng }) {
        const board = Array(64).fill(null);
        for (let f = 0; f < 8; f++) {
            board[f] = "w" + BACK[f];
            board[8 + f] = "wP";
            board[48 + f] = "bP";
            board[56 + f] = "b" + BACK[f];
        }
        const s = {
            board,
            white: rng() < 0.5 ? 0 : 1,
            turn: "w",
            castle: "KQkq",
            ep: -1,
            half: 0,
            moveNo: 1,
            last: null,
            captured: { w: [], b: [] },
            reps: {},
            over: null,
        };
        s.reps[posKey(s)] = 1;
        return s;
    },
    view(s, seat) {
        const me = colorOf(s, seat);
        const myTurn = !s.over && s.turn === me;
        const board = [];
        for (let r = 7; r >= 0; r--) board.push(s.board.slice(r * 8, r * 8 + 8));
        const moves = [];
        if (myTurn) {
            const seen = {};
            for (const m of legal(s, me)) {
                const k = m.from + "-" + m.to;
                if (seen[k]) continue;
                seen[k] = true;
                moves.push({ from: sqName(m.from), to: sqName(m.to), promo: !!m.promo });
            }
        }
        const checked = inCheck(s.board, s.turn);
        return {
            board,
            turn: seatOf(s, s.turn),
            turnColor: s.turn,
            myTurn,
            color: me,
            white: s.white,
            last: s.last,
            check: checked && s.turn === me,
            checkSq: checked ? sqName(kingSq(s.board, s.turn)) : null,
            captured: s.captured,
            moves,
            moveNo: s.moveNo,
            half: s.half,
        };
    },
    move(s, seat, p) {
        if (s.over) return { error: "The game is over." };
        if (!p || typeof p !== "object") return { error: "Bad move." };
        if (p.resign === true) {
            s.over = { winner: 1 - seat, text: (colorOf(s, seat) === "w" ? "White" : "Black") + " resigned." };
            return { ok: true };
        }
        const c = colorOf(s, seat);
        if (s.turn !== c) return { error: "It's not your turn." };
        const from = parseSq(p.from), to = parseSq(p.to);
        if (from < 0 || to < 0) return { error: "Pick a square." };
        const promo = p.promo === undefined || p.promo === null ? "q" : p.promo;
        if (typeof promo !== "string" || !"qrbn".includes(promo) || promo.length !== 1) return { error: "Bad promotion piece." };
        const m = legal(s, c).find((x) => x.from === from && x.to === to && (!x.promo || x.promo === promo));
        if (!m) return { error: "That move isn't legal." };

        const took = m.ep ? s.board[(from >> 3) * 8 + (to & 7)] : s.board[to];
        if (took) s.captured[c].push(took);
        const pawn = s.board[from][1] === "P";
        s.board = applyBoard(s.board, m);
        s.castle = strip(strip(s.castle, from), to);
        s.ep = m.double ? (from + to) / 2 : -1;
        s.half = pawn || took ? 0 : s.half + 1;
        if (c === "b") s.moveNo++;
        s.turn = other(c);
        s.last = { from: sqName(from), to: sqName(to) };
        if (pawn || took) s.reps = {};
        const key = posKey(s);
        s.reps[key] = (s.reps[key] || 0) + 1;

        if (!legal(s, s.turn).length) {
            if (inCheck(s.board, s.turn)) s.over = { winner: seat, text: "Checkmate!" };
            else s.over = { winner: null, text: "Stalemate." };
        } else if (insufficient(s.board)) s.over = { winner: null, text: "Draw: not enough pieces to mate." };
        else if (s.reps[key] >= 3) s.over = { winner: null, text: "Draw by threefold repetition." };
        else if (s.half >= 100) s.over = { winner: null, text: "Draw by the 50-move rule." };
        return { ok: true };
    },
    result(s) {
        return s.over;
    },
};
