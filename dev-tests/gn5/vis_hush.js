const { launch, wait } = require("./cdp");
const { bots } = require("./bots");
const SV = "?server=http://localhost:4005";
const SITE = "http://localhost:5056";
const NB = +(process.env.BOTS || 0), TAG = "hb" + (3 + NB);
(async () => {
  const b = await launch();
  let bb;
  try {
    const ps = [await b.page(375, 812), await b.page(375, 812), await b.page(375, 812)];
    const tv = await b.page(1920, 1080, false);
    const tv2 = await b.page(1280, 720, false);
    const [A, B, C] = ps;
    await A.go(SITE + "/gamenight" + SV);
    await A.type("input[autocomplete=nickname]", "Rob");
    await A.click("Make a room");
    await wait(1200);
    const code = await A.ev("document.querySelector('.gn-bar b').textContent");
    for (const [p, n] of [[B, "Samantha"], [C, "Kai"]]) {
      await p.go(SITE + "/gamenight" + SV);
      await p.type("input[autocomplete=nickname]", n);
      await p.type("input[aria-label='Room code']", code);
      await p.click("Join"); await wait(800);
    }
    const seen = {};
    bb = await bots(code, NB, (s, v, mv, i) => { const k = i + ":" + v.lot; if (v.phase === "bid" && v.me.bid === null && !seen[k]) { seen[k] = 1; setTimeout(() => mv({ act: "bid", amt: Math.floor(Math.random() * Math.min(30, v.coins[v.coins.length - NB + i] + 1)) }), 1500 + i * 300); } });
    for (const t of [tv, tv2]) { await t.go(SITE + "/gamenight" + SV); await t.type("input[aria-label='Room code']", code); await t.click("Show on a TV"); await wait(800); }
    await wait(500);
    await A.click("Hush Auction");
    await wait(1500);
    await A.shot(TAG + "-phone-start");
    for (let L = 0; L < 6; L++) {
      for (const [i, p] of ps.entries()) {
        for (let k = 0; k <= i + L % 2; k++) await p.click("+10");
        if (L === 1 && i === 0) await p.click("All");
        if (i === 0) await A.shot(TAG + "-phone-bidding-" + L);
        if (L === 2 && i === 2) { await wait(1200); await tv.shot(TAG + "-tv-bid-1080"); await tv2.shot(TAG + "-tv-bid-720"); await B.shot(TAG + "-phone-locked"); console.log("overflowX", await A.overflowX(), await B.overflowX(), "tv scroll", await tv.ev("document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1"), await tv2.ev("document.documentElement.scrollHeight > innerHeight + 1")); }
        await p.click("Lock in") || await p.click("Pass");
        await wait(150);
      }
      await wait(NB ? 1500 + NB * 300 : 300);
      await wait(1800);
      if (L === 2 || L === 1) { await tv.shot(TAG + "-tv-reveal-1080-" + L); await tv2.shot(TAG + "-tv-reveal-720-" + L); await A.full(TAG + "-phone-reveal-" + L); }
      await wait(5000);
    }
    await wait(1500);
    await tv.shot(TAG + "-tv-final-1080"); await tv2.shot(TAG + "-tv-final-720");
    await A.full(TAG + "-phone-final");
    console.log("final tv scroll", await tv.ev("document.documentElement.scrollHeight > innerHeight + 1"), await tv2.ev("document.documentElement.scrollHeight > innerHeight + 1"), "phone x", await A.overflowX());
    console.log((await tv.text()).slice(0, 400));
  } finally { b.close(); bb && bb.close(); }
})();
