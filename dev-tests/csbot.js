const io = require("socket.io-client");
const [code, name] = process.argv.slice(2);
const s = io("http://localhost:4012/duels", { transports: ["websocket"] });
const mv = (p) => new Promise((r) => s.emit("duel:move", p, r));
const done = {};
let busy = false;
s.on("connect", () => s.emit("duel:join", { code, name, group: true }, (r) => console.log("join", r && r.ok)));
s.on("room", async (r) => {
    const m = r.match;
    if (!m || m.game !== "cardshop" || !m.view || m.result || busy) return;
    const v = m.view, me = v.me;
    if (!me) return;
    const key = v.day + ":" + v.phase;
    busy = true;
    try {
        if (v.phase === "buy" && !done[key]) {
            done[key] = 1;
            const cheap = v.stock.filter((x) => x.q > 0).sort((a, b) => a.price - b.price);
            let cash = me.cash;
            for (const st of cheap.slice(0, 2)) if (st.price <= cash * 0.5) { const res = await mv({ act: "pack", p: st.p }); if (res.ok) { cash -= st.price; await mv({ act: "rip", p: st.p }); } }
            setTimeout(() => mv({ act: "ready" }), 3000);
        } else if (v.phase === "setup" && !done[key]) {
            done[key] = 1;
            const own = (me.own || []).slice().sort((a, b) => b[1] - a[1]);
            for (let i = 0; i < me.slots && i < own.length; i++) if (!me.disp[i]) await mv({ act: "slot", i, k: own[i][0], pct: [100, 120][Math.random() * 2 | 0] });
            setTimeout(() => mv({ act: "ready" }), 2000);
        } else if (v.phase === "sell" && me.q && me.q.length) {
            const o = me.q[0];
            if (!done["o" + o.id + ":" + o.round]) { done["o" + o.id + ":" + o.round] = 1; setTimeout(() => mv({ act: "offer", id: o.id, yes: Math.random() < 0.7 }), 1500); }
        } else if (v.phase === "report" && !done[key]) {
            done[key] = 1;
            setTimeout(() => mv({ act: "ready" }), 2000);
        }
    } catch (e) { console.log("err", e.message); }
    busy = false;
});
setTimeout(() => process.exit(0), 3600000);
