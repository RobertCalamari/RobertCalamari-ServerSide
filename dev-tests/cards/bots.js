// socket bots that join a Game Night room and act via a callback on each update
const { io } = require("socket.io-client");
const call = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
async function bots(code, n, act) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const s = io("http://localhost:4008/duels", { transports: ["websocket"], forceNew: true });
    await new Promise((r) => s.on("connect", r));
    s.last = null;
    s.on("room", (v) => { s.last = v.lite && s.last ? { ...s.last, ...v } : v; const m = s.last.match; if (m && m.view) act(s, m.view, (d) => call(s, "duel:move", d), i); });
    await call(s, "duel:join", { code, name: ["Ana", "Benji", "Chloé", "Dmitri", "Esperanza", "Fitz", "Gus", "Hiroshi", "Isabella", "Jo", "Kwame", "Lu", "Maximilian"][i], group: true });
    list.push(s);
  }
  return { close: () => list.forEach((s) => s.disconnect()) };
}
module.exports = { bots };
