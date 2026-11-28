const { io } = require("socket.io-client");
const URL = "http://localhost:4008/duels";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
const T = { fails: 0 };
const check = (l, ok, x = "") => { console.log((ok ? "PASS " : "FAIL ") + l + (x ? "  " + x : "")); if (!ok) T.fails++; };
const open = async () => { const s = io(URL, { transports: ["websocket"], forceNew: true }); await new Promise((r) => s.on("connect", r)); s.last = null; s.on("room", (v) => (s.last = v.lite && s.last ? { ...s.last, ...v } : v)); return s; };
const until = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await wait(50); } return false; };
async function room(n) {
  const ps = [await open()];
  const c = await call(ps[0], "duel:create", { name: "P0", group: true });
  for (let i = 1; i < n; i++) { const s = await open(); await call(s, "duel:join", { code: c.code, name: "P" + i, group: true }); ps.push(s); }
  const tv = await open(); await call(tv, "duel:tv", { code: c.code });
  await wait(200); return { ps, tv };
}
const mv = (p, d) => call(p, "duel:move", d);
const V = (p) => p.last.match.view;
const TV = (t) => t.last.match.tv;
module.exports = { wait, call, T, check, open, until, room, mv, V, TV };
// 1v1 duel room
async function duel() {
  const a = await open();
  const c = await call(a, "duel:create", { name: "A" });
  const b = await open(); await call(b, "duel:join", { code: c.code, name: "B" });
  await wait(200); return { ps: [a, b] };
}
const CARD = /"([2-9TJQKA][SHDC])"/g;
const cardsIn = (o) => [...JSON.stringify(o).matchAll(CARD)].map((m) => m[1]);
// game seat -> socket
const bySeat = (ps) => { const m = []; ps.forEach((p) => (m[p.last.match.me] = p)); return m; };
module.exports.duel = duel; module.exports.cardsIn = cardsIn; module.exports.bySeat = bySeat;
