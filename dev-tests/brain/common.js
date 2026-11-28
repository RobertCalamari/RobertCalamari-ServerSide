const { io } = require("socket.io-client");
const URL = "http://localhost:" + (process.env.PORT || 4007) + "/duels";
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
// mode: "solo" (group of 1), "duel" (1v1 room), or a group of n
async function setup(mode, game, options) {
  let ps, tv = null;
  if (mode === "duel") {
    const a = await open(); const c = await call(a, "duel:create", { name: "A" });
    const b = await open(); await call(b, "duel:join", { code: c.code, name: "B" });
    ps = [a, b];
  } else ({ ps, tv } = await room(mode === "solo" ? 1 : mode));
  await wait(150);
  ps[0].emit("duel:start", { game, options });
  const ok = await until(() => ps.every((p) => p.last.match && p.last.match.game === game), 5000);
  check(game + " " + mode + ": started", ok);
  return { ps, tv, all: [...ps, ...(tv ? [tv] : [])] };
}
const S = "C:/Users/D/Documents/New folder/RobertCalamari-ServerSide/games/duels/";
module.exports.setup = setup;
module.exports.S = S;
