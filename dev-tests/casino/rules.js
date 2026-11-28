// Last Call Casino rules: table max, High Roller room, tax collector, payday loan, mirror, resolve done, table repeats, sale price
const path = require("path");
const G = require(path.join(__dirname, "../../games/duels/games/casino"));
let fails = 0;
const ok = (c, m) => {
    if (!c) {
        fails++;
        console.log("FAIL", m);
    }
};
let a = 7;
const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
let now = 1e12;
const timers = [];
const ctx = { rng, now: () => now, later: (ms, fn) => timers.push({ t: now + ms, fn }) };
const host = { ...ctx, host: true };
const st = G.init({ ctx, players: 3 });
const mv = (s, p, c = ctx) => G.move(st, s, p, c);
mv(0, { act: "begin", cfg: { rounds: 6, play: 60, shop: 20, resolve: 20, spin: 20 } }, host);

// table max (50 in round 1) and the High Roller room
const solo = st.open.find((g) => ["dice", "slots", "pack", "cases", "scratch", "plinko", "limbo", "baccarat"].includes(g));
st.open[0] = solo || st.open[0];
const g = st.open[0];
const sel = { dice: { dir: "over", at: 50 }, plinko: "low", limbo: 2, baccarat: "p" }[g] || true;
st.chips[0] = 1000;
mv(0, { act: "sit", g });
ok(!!mv(0, { act: "bet", amount: 60, sel }).error, "over the table max is refused");
ok(mv(0, { act: "bet", amount: 50, sel }).ok, "at the table max is fine");
st.chips[1] = 100;
ok(!!mv(1, { act: "room", room: "high" }).error, "High Roller needs 250 chips");
ok(mv(0, { act: "room", room: "high" }).ok && st.room[0] === "high", "rich player walks into High Roller");
st.chips[0] = 5000;
ok(!!mv(0, { act: "bet", amount: 100, sel }).error, "High Roller minimum is enforced");
ok(mv(0, { act: "bet", amount: 2000, sel }).ok, "High Roller takes a 2000 bet");
st.chips[0] = 600;
mv(0, { act: "bet", amount: 400, sel });
ok(st.chips[0] < 250 ? st.room[0] === "main" : true, "dropping under 250 walks you out");
ok(G.view(st, 0).tableMax === 50, "view shows the table max");

// shop: per-player specials and a sale
G.move(st, 0, { act: "skip" }, host);
ok(st.phase === "shop", "shop open");
ok(st.specials.length === 3 && st.specials.every((x) => x.length === 5), "everyone gets their own 5 specials");
ok(st.sale.every((x) => x.pct >= 10 && x.pct <= 50), "one item on sale, 10-50% off");
const v0 = G.view(st, 0);
ok(v0.shop.specials.join() === st.specials[0].join() && v0.shop.sale.id === st.sale[0].id, "you see your own specials and sale");
st.chips = [1000, 1000, 1000];
const sale = st.sale[2];
const full = G.ITEMS[sale.id].cost;
const before = st.chips[2];
mv(2, { act: "buy", item: sale.id, to: 0 });
ok(before - st.chips[2] === Math.ceil((full * (100 - sale.pct)) / 100), "sale price charged");
// tax collector on seat 1, loan for seat 2, a sip at seat 0 that seat 0 will mirror
st.specials[0] = ["tax", "mirror", "loan", "jinx", "double"];
st.specials[2] = ["loan", "dd", "lucky", "insure", "xray"];
ok(mv(0, { act: "buy", item: "tax", to: 1 }).ok, "buy tax collector");
ok(!!mv(0, { act: "buy", item: "tax", to: 2 }).error, "one tax collector at a time");
ok(mv(0, { act: "buy", item: "mirror" }).ok && st.inv[0].mirror === 1, "buy mirror");
ok(mv(2, { act: "buy", item: "loan" }).ok && st.owed[2] === 160, "loan owes 160");
ok(mv(1, { act: "buy", item: "sip", to: 0 }).ok, "seat 1 sends seat 0 a sip");
[0, 1, 2].forEach((s) => mv(s, { act: "ready" }));
ok(st.phase === "resolve", "everyone done shopping goes to the reveal");
const sip = st.resolved.find((e) => e.item === "sip" && e.by === 1);
ok(mv(0, { act: "block", id: sip.id, mirror: true }).ok && sip.to === 1 && sip.mirrored, "mirror bounces the sip back");
ok(!!mv(0, { act: "block", id: sip.id }).error, "can't block a bounced drink again");
const prevOpen = st.open.slice();
[0, 1, 2].forEach((s) => mv(s, { act: "ready" }));
ok(st.phase === "play", "everyone done in the reveal starts the next round");
ok(st.paused[2] === "shot", "payday loan = a shot");
ok(st.open.filter((x) => prevOpen.includes(x)).length <= 2, "at least half the tables are new");
ok(G.view(st, 1).taxed.some((x) => x.to === 1 && x.by === 0), "taxed player can see it");

// tax: seat 1 loses its next bet -> seat 0 gets the loss
{
    const C = require(path.join(__dirname, "../../games/duels/casino/games"));
    st.open[0] = "dice";
    st.chips[1] = 200;
    st.chips[0] = 100;
    mv(1, { act: "sit", g: "dice" });
    let tries = 0;
    let r;
    do {
        const c1 = st.chips[1];
        const c0 = st.chips[0];
        r = mv(1, { act: "bet", amount: 20, sel: { dir: "over", at: 95 } });
        tries++;
        const lost = c1 - st.chips[1];
        if (lost > 0) ok(st.chips[0] - c0 === lost, "tax collector gets what they lost");
        break;
    } while (tries < 1);
    ok(r.ok, "taxed bet went through");
    ok(st.now.tax.every((x) => x.done), "tax is used up after one bet");
    ok(C.GAMES.pack && C.GAMES.cases && C.GAMES.scratch && !C.GAMES.baccarat.shared, "new games in, baccarat solo");
}
console.log(fails ? fails + " FAILED" : "ALL PASS");
