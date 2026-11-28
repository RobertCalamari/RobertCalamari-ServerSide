// direct rule checks for Backgammon, Battle Lines, Liar's Dice
const G = "C:/Users/D/Documents/New folder/RobertCalamari-ServerSide/games/duels/games/";
const BG = require(G + "backgammon.js"), BL = require(G + "battlelines.js"), LD = require(G + "liarsdice.js");
let fails = 0;
const check = (l, ok, x = "") => { console.log((ok ? "PASS " : "FAIL ") + l + (x ? "  " + x : "")); if (!ok) fails++; };
const ctx = (seed = 1) => { let t = seed; const r = () => ((t = (t * 16807) % 2147483647) / 2147483647); return { now: () => 0, rng: r, later: () => {} }; };
// a hand-built backgammon position: seat to move, dice
function pos(cfg) {
  const st = BG.init({ rng: ctx().rng, ctx: ctx(), options: { timer: false } });
  st.board = new Array(24).fill(0); st.bar = [0, 0]; st.off = [0, 0];
  for (const [i, n] of cfg.board) st.board[i] = n;
  if (cfg.bar) st.bar = cfg.bar; if (cfg.off) st.off = cfg.off;
  st.turn = cfg.s; st.roll = cfg.dice; st.dice = cfg.dice[0] === cfg.dice[1] ? Array(4).fill(cfg.dice[0]) : cfg.dice.slice(); st.done = []; st.phase = "move";
  st.start = { board: st.board.slice(), bar: st.bar.slice(), off: st.off.slice() };
  st.need = BG.longest(st, cfg.s, st.dice);
  return st;
}
const fmt = (ms) => ms.map((m) => m.from + ">" + m.to + "(" + m.die + ")").sort().join(" ");
// bar entry: seat 0 on bar, dice 6/1; point 18 (idx 18 = 24-6) blocked, idx 23 open -> must enter with 1
let st = pos({ s: 0, dice: [6, 1], board: [[18, -2], [10, 3], [5, 12]], bar: [1, 0] });
check("bar: only legal is enter with 1", fmt(BG.legal(st)) === "bar>23(1)", fmt(BG.legal(st)));
check("bar: other moves blocked while on bar", !BG.legal(st).some((m) => m.from !== "bar"));
// both entry points blocked -> no move
st = pos({ s: 0, dice: [6, 5], board: [[18, -2], [19, -2], [5, 14]], bar: [1, 0] });
check("bar: blocked entry = no moves", st.need === 0 && BG.legal(st).length === 0);
// seat 1 enters at die-1
st = pos({ s: 1, dice: [3, 3], board: [[2, 2], [20, -14]], bar: [0, 1] });
check("bar seat1: point 3 blocked for doubles 3", st.need === 0);
st = pos({ s: 1, dice: [4, 2], board: [[2, 2], [20, -14]], bar: [0, 1] });
check("bar seat1: enters idx 3 or 1", fmt(BG.legal(st)) === "bar>1(2) bar>3(4)", fmt(BG.legal(st)));
// must use both dice: seat 0, checker at 10 and 5; dice 6,4. 10-6=4 open, 10-4=6 blocked? Construct: only order 6 then 4 works
st = pos({ s: 0, dice: [6, 4], board: [[12, 1], [8, -2], [0, -2], [3, 14]] });
// 12-4=8 blocked; 12-6=6 ok then 6-4=2 ok -> need 2. checkers at 3 can't move 6 (not all home) or 4 (-1 off not allowed)
check("both dice: need 2", st.need === 2, "need " + st.need);
check("both dice: only 12>6 first", fmt(BG.legal(st)) === "12>6(6)", fmt(BG.legal(st)));
// larger die rule: only one die usable at a time and not both: seat 0 single checker at 13, others home blocked
st = pos({ s: 0, dice: [5, 3], board: [[13, 1], [5, -2], [7, -2], [2, 14]] });
// 13-5=8 ok then 8-3=5 blocked; 13-3=10 ok then 10-5=5 blocked; home checkers at idx2 can't bear off (not all home). So one die only -> larger (5)
check("larger die: need 1", st.need === 1, "need " + st.need);
check("larger die: must play the 5", fmt(BG.legal(st)) === "13>8(5)", fmt(BG.legal(st)));
// bearing off: all home, seat 0 checkers on idx 3 (4-pt) and 1; die 6 -> bear off from highest (idx 3) only
st = pos({ s: 0, dice: [6, 1], board: [[3, 1], [1, 1], [20, -15]], off: [13, 0] });
const L = BG.legal(st);
check("bear off: 6 takes highest checker", L.some((m) => m.from === 3 && m.to === "off" && m.die === 6) && !L.some((m) => m.from === 1 && m.die === 6), fmt(L));
// can't bear off with a checker outside home
st = pos({ s: 0, dice: [2, 1], board: [[6, 1], [1, 14], [20, -15]] });
check("bear off: blocked while a checker is outside", !BG.legal(st).some((m) => m.to === "off"), fmt(BG.legal(st)));
// higher die only when no checker farther
st = pos({ s: 0, dice: [5, 5], board: [[3, 2], [4, 1], [20, -15]], off: [12, 0] });
check("bear off: 5 exact from idx4; then higher allowed", BG.legal(st).every((m) => m.from === 4) && st.need === 3, fmt(BG.legal(st)) + " need " + st.need);
// hit sends to bar
st = pos({ s: 0, dice: [3, 1], board: [[10, 1], [7, -1], [5, 14], [20, -14]] });
const mctx = ctx();
let r = BG.move(st, 0, { act: "move", from: 10, to: 7 }, mctx);
check("hit: blot goes to bar", r.ok && st.bar[1] === 1 && st.board[7] === 1, JSON.stringify(r));
check("undo restores", BG.move(st, 0, { act: "undo" }, mctx).ok && st.bar[1] === 0 && st.board[7] === -1 && st.board[10] === 1);
check("end before using dice refused", !!BG.move(st, 0, { act: "end" }, mctx).error);
check("illegal refused", !!BG.move(st, 0, { act: "move", from: 10, to: 5 }, mctx).error && !!BG.move(st, 1, { act: "move", from: 20, to: 21 }, mctx).error);
// standard opening counts
st = BG.init({ rng: ctx(7).rng, ctx: ctx(7), options: {} });
check("start: 15 each", st.board.filter((n) => n > 0).reduce((a, b) => a + b, 0) === 15 && -st.board.filter((n) => n < 0).reduce((a, b) => a + b, 0) === 15 && st.roll[0] !== st.roll[1]);

// Battle Lines fights
const f = BL.fight;
check("RPS cycle", f("R", "S") === "win" && f("S", "P") === "win" && f("P", "R") === "win" && f("S", "R") === "lose" && f("R", "R") === "bounce");
check("archer loses melee, king beats archer only", f("R", "A") === "win" && f("K", "A") === "win" && f("K", "R") === "lose" && f("K", "K") === "win" && f("S", "K") === "win");

// Liar's dice raises
const b = (q, f) => ({ q, f });
check("raise rules", LD.beats(3, 4, b(3, 3)) && !LD.beats(3, 2, b(3, 3)) && LD.beats(4, 2, b(3, 3)) && LD.beats(2, 1, b(3, 5)) && !LD.beats(1, 1, b(3, 5)) && LD.beats(5, 3, b(2, 1)) && !LD.beats(4, 3, b(2, 1)) && LD.beats(3, 1, b(2, 1)) && !LD.beats(1, 1, null));
console.log(fails ? fails + " FAILED" : "ALL PASS");
