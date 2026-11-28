const { launch, wait } = require("./cdp");
const SV = "?server=http://localhost:4003";
const SITE = "http://localhost:5056";
(async () => {
  const b = await launch();
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
    for (const t of [tv, tv2]) { await t.go(SITE + "/gamenight" + SV); await t.type("input[aria-label='Room code']", code); await t.click("Show on a TV"); await wait(800); }
    await A.click("Ripple Market");
    await wait(1800);
    await A.shot("rip-phone-start");
    // open a row, max, buy
    const tapRow = (p, k) => p.ev(`document.querySelectorAll('.dg-rip-row')[${k}].click()`);
    for (let r = 1; r <= 8; r++) {
      for (const [i, p] of ps.entries()) {
        await tapRow(p, (i + r) % 5); await wait(150);
        if (r % 2) await p.click("Max"); else await p.click("All");
        await wait(150);
        if (r === 1 && i === 0) await A.shot("rip-phone-trade-open");
        await p.click(r % 2 ? "Buy" : "Sell"); await wait(200);
        if (r === 2 && i === 1) { await p.ev("document.querySelector('.dg-rip-cards button:not(:disabled)') && document.querySelector('.dg-rip-cards button:not(:disabled)').click()"); await wait(200); await p.shot("rip-phone-card-pick"); await tapRow(p, 2); await wait(200); }
      }
      if (r === 2) { await tv.shot("rip-tv-trade-1080"); await tv2.shot("rip-tv-trade-720"); await A.full("rip-phone-full"); console.log("overflowX phone", await A.overflowX(), "tv scroll", await tv.ev("document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1"), await tv2.ev("document.documentElement.scrollHeight > innerHeight + 1")); }
      for (const p of ps) await p.click("done trading");
      await wait(2200);
      if (r === 3) { await tv.shot("rip-tv-reveal-1080"); await A.shot("rip-phone-reveal"); }
      await wait(5500);
    }
    await wait(1500);
    await tv.shot("rip-tv-final-1080"); await tv2.shot("rip-tv-final-720");
    await A.full("rip-phone-final");
    console.log("final tv scroll", await tv.ev("document.documentElement.scrollHeight > innerHeight + 1"), await tv2.ev("document.documentElement.scrollHeight > innerHeight + 1"), "phone x", await A.overflowX());
    console.log((await tv.text()).slice(0, 600));
  } finally { b.close(); }
})();
