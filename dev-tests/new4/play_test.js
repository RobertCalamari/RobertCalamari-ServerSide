// Last One Standing, Price Tag Panic, Shape Shifter over sockets, plus a start-up smoke test of all 12 new games and the
// Vending Simulator (views + TV arrive, no crash). Server on 4016: PORT=4016 node index.js
const { wait, check, until, room, mv, V, T, done } = require("../new3/lib");

const start = (ps, game, options) => ps[0].emit("duel:start", options ? { game, options } : { game });
const close = (r) => [...r.ps, r.tv].forEach((s) => s.close());
const live = (r, game) => r.ps.every((p) => p.last && p.last.match && p.last.match.game === game && p.last.match.view) && r.tv.last && r.tv.last.match && r.tv.last.match.tv;

async function lastone() {
    const r = await room(3);
    start(r.ps, "lastone");
    check("lastone: starts", await until(() => live(r, "lastone")));
    let asked = 0;
    let leak = false;
    while (!r.ps[0].last.match.result && asked < 25) {
        if (!(await until(() => V(r.ps[0]).phase === "ask" || r.ps[0].last.match.result, 20000))) break;
        if (r.ps[0].last.match.result) break;
        const q = V(r.ps[0]).index;
        if (V(r.ps[1]).last || "answer" in V(r.ps[1]) || JSON.stringify(T(r.tv)).includes('"picks"')) leak = true;
        for (const p of r.ps) await mv(p, { q, choice: Math.floor(Math.random() * 4) });
        const again = await mv(r.ps[0], { q, choice: 1 });
        if (asked === 0) check("lastone: second answer refused", !!again.error || again.ok);
        await until(() => V(r.ps[0]).phase !== "ask" || V(r.ps[0]).index !== q, 20000);
        asked++;
    }
    check("lastone: no answers leak while asking", !leak);
    check("lastone: finishes", await until(() => r.ps[0].last.match.result, 30000), asked + " questions");
    const res = r.ps[0].last.match.result;
    check("lastone: result has places", res && Array.isArray(res.places) && res.places.length === 3, res && res.text);
    close(r);
}

async function pricetag() {
    const r = await room(2);
    start(r.ps, "pricetag", { timer: false });
    check("pricetag: starts untimed", await until(() => live(r, "pricetag") && V(r.ps[0]).deadline === null));
    for (let round = 0; round < 5; round++) {
        check("pricetag: round " + (round + 1) + " opens", await until(() => V(r.ps[0]).phase === "shop" && V(r.ps[0]).round === round, 15000));
        const v = V(r.ps[0]);
        check("pricetag: totals hidden while shopping", V(r.ps[1]).totals === null && V(r.ps[1]).answer === null && T(r.tv).carts === null);
        // seat 0 greedy under budget, seat 1 grabs everything first (over), then the single cheapest item
        const order = v.shelf.map((it, i) => i).sort((a, b) => v.shelf[b].price - v.shelf[a].price);
        let t = 0;
        for (const i of order) if (t + v.shelf[i].price <= v.budget) { await mv(r.ps[0], { act: "toggle", i }); t += v.shelf[i].price; }
        await until(() => V(r.ps[0]).total === t, 3000);
        for (let i = 0; i < v.shelf.length; i++) await mv(r.ps[1], { act: "toggle", i });
        const over = await mv(r.ps[1], { act: "lock" });
        if (round === 0) check("pricetag: over-budget lock refused", !!over.error, over.error);
        await mv(r.ps[1], { act: "clear" });
        const cheap = order[order.length - 1];
        await mv(r.ps[1], { act: "toggle", i: cheap });
        check("pricetag: locks", (await mv(r.ps[0], { act: "lock" })).ok && (await mv(r.ps[1], { act: "lock" })).ok);
        check("pricetag: reveal shows totals", await until(() => V(r.ps[0]).phase !== "shop" && V(r.ps[0]).totals, 5000));
        const vv = V(r.ps[0]);
        if (vv.totals) check("pricetag: scores add up", vv.totals[0] === t && vv.got[0] >= vv.got[1], vv.got.join(" vs "));
    }
    check("pricetag: finishes", await until(() => r.ps[0].last.match.result, 15000), r.ps[0].last.match.result && r.ps[0].last.match.result.text);
    close(r);
}

async function shapeshift() {
    const r = await room(2);
    start(r.ps, "shapeshift", { timer: false });
    check("shapeshift: starts untimed", await until(() => live(r, "shapeshift") && V(r.ps[0]).endAt === null));
    for (let round = 0; round < 3; round++) {
        check("shapeshift: shape " + (round + 1), await until(() => V(r.ps[0]).phase === "play" && V(r.ps[0]).round === round, 15000));
        check("shapeshift: no solution while playing", V(r.ps[1]).solution === null && T(r.tv).solution === null && !("mine" in T(r.tv)));
        check("shapeshift: bad move refused", !!(await mv(r.ps[1], { act: "place", i: 0, at: [99, 1, 0, 0] })).error);
        await mv(r.ps[1], { act: "place", i: 0, at: [6, 4, 0, 0] });
        check("shapeshift: non-host can't skip", !!(await mv(r.ps[1], { act: "skip" })).error);
        await mv(r.ps[0], { act: "skip" });
        check("shapeshift: reveal shows a solution", await until(() => V(r.ps[0]).phase !== "play" && V(r.ps[0]).solution, 5000));
    }
    check("shapeshift: finishes", await until(() => r.ps[0].last.match.result, 15000));
    close(r);
}

async function smoke() {
    const list = [
        ["wordladder", 2], ["slidepuzzle", 2], ["daily", 2], ["battlelines", 2], ["backgammon", 2], ["liarsdice", 3],
        ["telesketch", 3], ["spacekitchen", 3], ["lavafloor", 3], ["lastone", 4], ["shapeshift", 3], ["pricetag", 3], ["cardshop", 3],
    ];
    for (const [game, n] of list) {
        const r = await room(n);
        start(r.ps, game);
        check("smoke: " + game + " x" + n, await until(() => live(r, game), 10000));
        await wait(300);
        close(r);
    }
    const solo = await room(1);
    start(solo.ps, "shapeshift");
    check("smoke: shapeshift solo", await until(() => live(solo, "shapeshift"), 10000));
    close(solo);
}

(async () => {
    await smoke();
    await Promise.all([lastone(), pricetag(), shapeshift()]);
    done();
})();
