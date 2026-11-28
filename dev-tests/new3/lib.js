const { io } = require("socket.io-client");
const URL = "http://localhost:4016/duels";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
let fails = 0;
const check = (l, ok, x = "") => { console.log((ok ? "PASS " : "FAIL ") + l + (x ? "  " + x : "")); if (!ok) fails++; };
const open = async () => { const s = io(URL, { transports: ["websocket"], forceNew: true }); await new Promise((r) => s.on("connect", r)); s.last = null; s.on("room", (v) => (s.last = v.lite && s.last ? { ...s.last, ...v } : v)); return s; };
const until = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await wait(40); } return false; };
async function room(n) {
  const ps = [await open()];
  const c = await call(ps[0], "duel:create", { name: "P0", group: true });
  for (let i = 1; i < n; i++) { const s = await open(); await call(s, "duel:join", { code: c.code, name: "P" + i, group: true }); ps.push(s); }
  const tv = await open(); await call(tv, "duel:tv", { code: c.code });
  await wait(200); return { ps, tv, code: c.code };
}
const mv = (p, d) => call(p, "duel:move", d);
const V = (p) => p.last.match.view;
const T = (tv) => tv.last.match.tv;
const done = () => { console.log(fails ? fails + " FAILED" : "ALL PASS"); process.exit(fails ? 1 : 0); };
module.exports = { wait, call, check, open, until, room, mv, V, T, done, fails: () => fails };
