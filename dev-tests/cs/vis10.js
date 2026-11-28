// 6 phones + 2 TVs, 10-slot tables: phone haggling UI and TV floor.
const { launch, wait } = require("./cdp");
const SV = "?server=http://localhost:4006";
const SITE = "http://localhost:5056";
(async () => {
  const b = await launch();
  try {
    const ps = [];
    for (let i = 0; i < 6; i++) ps.push(await b.page(375, 812));
    const tv = await b.page(1920, 1080, false);
    const tv2 = await b.page(1280, 720, false);
    const A = ps[0];
    await A.go(SITE + "/gamenight" + SV);
    await A.type("input[autocomplete=nickname]", "Rob");
    await A.click("Make a room");
    await wait(1200);
    const code = await A.ev("document.querySelector('.gn-bar b').textContent");
    const N = ["Samantha", "Kai", "Priya", "Lou", "Marisol"];
    for (let i = 1; i < 6; i++) { const p = ps[i]; await p.go(SITE + "/gamenight" + SV); await p.type("input[autocomplete=nickname]", N[i - 1]); await p.type("input[aria-label='Room code']", code); await p.click("Join"); await wait(600); }
    for (const t of [tv, tv2]) { await t.go(SITE + "/gamenight" + SV); await t.type("input[aria-label='Room code']", code); await t.click("Show on a TV"); await wait(800); }
    await A.click("Totally Real Vending Simulator");
    await wait(2000);
    for (const p of ps) {
      for (let j = 0; j < 3; j++) { await p.ev("[...document.querySelectorAll('.cs-stock button.duel-btn')].find(b=>!b.disabled)?.click()"); await wait(200); }
      for (let j = 0; j < 3; j++) {
        await p.ev("document.querySelector('.cs-packcell button.duel-btn:not(:disabled)')?.click()"); await wait(700);
        if (await p.ev("!!document.querySelector('.cs-rip')")) { await p.click("Tear it open"); await wait(800); await p.click("Flip all"); await wait(400); await p.click("Done", ".cs-rip-sum button"); await wait(250); }
      }
    }
    for (const p of ps) await p.click("Done shopping"); await wait(1500);
    for (const p of ps) { await p.click("Auto-fill"); await wait(900); }
    await A.full("h-phone-setup-10");
    await tv.shot("h-tv-setup-1080");
    for (const p of ps) await p.click("Open the doors"); await wait(2500);
    let shots = 0, tvs = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 46000) {
      for (const [i, p] of ps.entries()) {
        const has = await p.ev("!!document.querySelector('.cs-offer:not(.idle)')");
        if (!has) continue;
        const ctr = await p.ev("!!document.querySelector('.cs-counter button')");
        if (ctr && shots < 3) {
          await p.shot("h-phone-offer-" + shots++);
          await p.ev("document.querySelector('.cs-counter button').click()"); await wait(500);
          await p.shot("h-phone-offer-" + shots++);
        } else if (ctr && i % 2) await p.ev("document.querySelector('.cs-counter button').click()");
        else await p.click(i % 3 ? "Accept" : "Decline");
      }
      if (Date.now() - t0 > 5000 + tvs * 12000 && tvs < 3) { await tv.shot("h-tv-sell-1080-" + tvs); await tv2.shot("h-tv-sell-720-" + tvs); tvs++; }
      await wait(400);
    }
    await A.full("h-phone-sell-grid");
    console.log("phone x", await A.overflowX(), "tv scroll", await tv.ev("document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1"), await tv2.ev("document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1"), "shots", shots);
  } finally { b.close(); }
})();
