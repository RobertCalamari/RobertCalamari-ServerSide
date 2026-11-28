// Visual pass: 3 phones (375x812) + TVs (1920x1080, 1280x720) through a full game, screenshots of every phase.
const { launch, wait } = require("./cdp");
const SV = "?server=http://localhost:4006";
const SITE = "http://localhost:5056";
const FULL = process.env.FULL === "1";
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
    await A.click("Totally Real Vending Simulator");
    await wait(2000);
    const ok = await A.ev("!!document.querySelector('.cs')");
    console.log("phone mounted", ok, "tv mounted", await tv.ev("!!document.querySelector('.cst')"));
    if (!ok) { await A.shot("cs-error"); console.log((await A.text()).slice(0, 800)); return; }
    await A.shot("cs-phone-buy");
    await tv.shot("cs-tv-buy-1080"); await tv2.shot("cs-tv-buy-720");
    // buy 3 packs each, rip on phone A with screenshots
    for (const p of ps) for (let i = 0; i < 3; i++) { await p.ev("[...document.querySelectorAll('.cs-stock button.duel-btn')].find(b=>!b.disabled)?.click()"); await wait(250); }
    await wait(400);
    await A.full("cs-phone-buy-packs");
    await A.click("Rip"); await wait(700);
    await A.shot("cs-rip-1-pack");
    await A.click("Tear it open"); await wait(250);
    await A.shot("cs-rip-2-tear");
    await wait(700);
    await A.shot("cs-rip-3-fan");
    for (let i = 0; i < 5; i++) { await A.ev(`document.querySelectorAll('.cs-rip-slot')[${i}].click()`); await wait(i === 4 ? 1100 : 500); if (i === 0 || i === 4) await A.shot("cs-rip-4-flip" + i); }
    await A.shot("cs-rip-5-sum");
    await A.click("Done", ".cs-rip-sum button"); await wait(300);
    for (const p of [B, C]) { await p.click("Rip"); await wait(800); await p.click("Tear it open"); await wait(900); await p.click("Flip all"); await wait(600); await p.click("Done", ".cs-rip-sum button"); await wait(300); }
    await A.click("Singles"); await wait(300); await A.full("cs-phone-singles");
    await A.click("Binder"); await wait(300); await A.full("cs-phone-binder");
    await A.ev("document.querySelector('.cs-binder .cs-card.tap')?.click()"); await wait(500); await A.shot("cs-phone-detail");
    await A.ev("[...document.querySelectorAll('.cs-list button.duel-btn')].find(b=>b.textContent.includes('List'))?.click()"); await wait(500);
    await B.click("Players"); await wait(300); await B.shot("cs-phone-players");
    await tv.shot("cs-tv-buy2-1080");
    console.log("phone x-overflow (buy)", await A.overflowX(), await B.overflowX());
    for (const p of ps) await p.click("Done shopping"); await wait(1500);
    await A.shot("cs-phone-setup");
    for (const p of ps) { await p.click("Auto-fill"); await wait(600); }
    await A.full("cs-phone-setup-filled");
    await A.ev("[...document.querySelectorAll('.cs-slot .cs-chips button')][3]?.click()"); await wait(300);
    await A.ev("document.querySelector('.cs-slot.empty, .cs-slot-item')?.click()"); await wait(500); await A.shot("cs-phone-picker");
    await A.ev("document.querySelector('.cs-sheet-x')?.click()"); await wait(300);
    await A.click("Upgrades"); await wait(300); await A.full("cs-phone-shop");
    await A.ev("[...document.querySelectorAll('.cs-up')].find(r=>r.textContent.includes('Buy-in'))?.querySelector('button')?.click()"); await wait(300);
    await tv.shot("cs-tv-setup-1080");
    console.log("phone x-overflow (setup)", await A.overflowX());
    for (const p of ps) await p.click("Open the doors"); await wait(1500);
    let shotOffer = false, shotTv = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 47000) {
      for (const [i, p] of ps.entries()) {
        const has = await p.ev("!!document.querySelector('.cs-offer:not(.idle)')");
        if (has && !shotOffer) { shotOffer = true; await p.shot("cs-phone-offer"); }
        if (has) { await p.click(i === 1 ? "Decline" : "Accept"); await p.click("Pass"); }
      }
      if (Date.now() - t0 > 6000 + shotTv * 9000 && shotTv < 3) { await tv.shot("cs-tv-sell-1080-" + shotTv); if (shotTv === 1) { await tv2.shot("cs-tv-sell-720"); await A.full("cs-phone-sell"); } shotTv++; }
      await wait(700);
      if (await A.ev("!document.querySelector('.cs-offer')")) break;
    }
    await wait(1500);
    await A.full("cs-phone-report"); await tv.shot("cs-tv-report-1080"); await tv2.shot("cs-tv-report-720");
    console.log("tv scroll", await tv.ev("document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1"), await tv2.ev("document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1"));
    if (!FULL) return;
    for (let d = 2; d <= 8; d++) {
      for (const p of ps) await p.click("Next day"); await wait(1500);
      for (const p of ps) {
        for (let j = 0; j < 2; j++) { await p.ev("[...document.querySelectorAll('.cs-stock button.duel-btn')].reverse().find(b=>!b.disabled)?.click()"); await wait(300); }
        await p.ev("document.querySelector('.cs-packcell button:not(:disabled)')?.click()"); await wait(900);
        if (await p.ev("!!document.querySelector('.cs-rip')")) { await p.click("Tear it open"); await wait(900); await p.click("Flip all"); await wait(500); await p.click("Done", ".cs-rip-sum button"); await wait(300); }
      }
      if (d === 2) { await A.click("odd job"); await wait(300); }
      for (const p of ps) await p.click("Done shopping"); await wait(1200);
      for (const p of ps) { await p.click("Auto-fill"); await wait(400); }
      for (const p of ps) await p.click("Open the doors"); await wait(1000);
      const t1 = Date.now();
      while (Date.now() - t1 < 48000) {
        for (const p of ps) { if (await p.ev("!!document.querySelector('.cs-offer:not(.idle)')")) { await p.click("Accept"); await p.click("Pass"); } }
        await wait(800);
        if (await A.ev("!document.querySelector('.cs-offer')")) break;
      }
      await wait(1200);
    }
    await wait(13000);
    await A.full("cs-phone-final"); await tv.shot("cs-tv-final-1080"); await tv2.shot("cs-tv-final-720");
    console.log("final tv scroll", await tv.ev("document.documentElement.scrollHeight > innerHeight + 1"), "phone x", await A.overflowX());
  } finally { b.close(); }
})();
