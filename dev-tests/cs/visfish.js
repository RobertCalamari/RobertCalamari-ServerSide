// 3 broke phones + TVs: actions bar, today box (challenge + wanted), fishing game + catch, selling with streaks, report highlights.
const { launch, wait } = require("./cdp");
const SV = "?server=http://localhost:4006";
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
    for (const [p, nm] of [[B, "Samantha"], [C, "Kai"]]) { await p.go(SITE + "/gamenight" + SV); await p.type("input[autocomplete=nickname]", nm); await p.type("input[aria-label='Room code']", code); await p.click("Join"); await wait(700); }
    for (const t of [tv, tv2]) { await t.go(SITE + "/gamenight" + SV); await t.type("input[aria-label='Room code']", code); await t.click("Show on a TV"); await wait(800); }
    await A.click("Totally Real Vending Simulator");
    await wait(2000);
    await A.shot("g-phone-buy-top");
    await A.full("g-phone-buy-full");
    await tv.shot("g-tv-buy-1080"); await tv2.shot("g-tv-buy-720");
    // fishing on all phones: hold/release rhythm to chase the fish
    for (const [i, p] of ps.entries()) {
      await p.click("Go fishing", ".cs-fishbtn");
      await wait(600);
      if (i === 0) await p.shot("g-fish-0-start");
      const t0 = Date.now();
      let shot = false;
      while (Date.now() - t0 < 16500) {
        const st = await p.ev(`(()=>{const f=document.querySelector('.cs-fish-fish'),n=document.querySelector('.cs-fish-net');if(!f||!n)return null;const h=parseFloat(n.style.height);return {f:parseFloat(f.dataset.y)*100,n:parseFloat(n.style.bottom)+h/2}})()`);
        if (!st) break;
        const want = st.f > st.n;
        await p.ev(`document.querySelector('.cs-fish').dispatchEvent(new PointerEvent('${want ? "pointerdown" : "pointerup"}',{bubbles:true}))`);
        if (i === 0 && !shot && Date.now() - t0 > 5000) { shot = true; await p.shot("g-fish-1-play"); }
        await wait(90);
      }
      await wait(1200);
      if (i === 0) await p.shot("g-fish-2-catch");
      if (await p.ev("!!document.querySelector('.cs-fish.done')")) { if (!(await p.click("Rip it now"))) await p.click("Back to the shop"); }
      await wait(900);
      if (await p.ev("!!document.querySelector('.cs-rip')")) { await p.click("Tear it open"); await wait(900); await p.click("Flip all"); await wait(500); await p.click("Done", ".cs-rip-sum button"); await wait(300); }
    }
    await tv.shot("g-tv-buy-after-fish-1080");
    for (const p of ps) await p.click("Done shopping"); await wait(1500);
    for (const p of ps) { await p.click("Auto-fill"); await wait(500); await p.ev("[...document.querySelectorAll('.cs-slot .cs-chips button')].forEach(b=>b.textContent==='100%'&&b.click())"); await wait(300); }
    await A.full("g-phone-setup");
    for (const p of ps) await p.click("Open the doors"); await wait(1500);
    const t1 = Date.now(); let tvs = 0;
    while (Date.now() - t1 < 46000) {
      for (const p of ps) if (await p.ev("!!document.querySelector('.cs-offer:not(.idle)')")) await p.click("Accept");
      if (Date.now() - t1 > 5000 + tvs * 12000 && tvs < 3) { await tv.shot("g-tv-sell-1080-" + tvs); await A.shot("g-phone-sell-" + tvs); tvs++; }
      await wait(500);
      if (await A.ev("!document.querySelector('.cs-offer')")) break;
    }
    await wait(1500);
    await A.full("g-phone-report"); await tv.shot("g-tv-report-1080"); await tv2.shot("g-tv-report-720");
    console.log("phone x", await A.overflowX(), await B.overflowX(), "tv scroll", await tv.ev("document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1"), await tv2.ev("document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1"));
    console.log((await A.text()).slice(0, 400));
  } finally { b.close(); }
})();
