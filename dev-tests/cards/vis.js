const { launch, wait } = require("./cdp");
const { bots } = require("./bots");
const SV = "?server=http://localhost:4008";
const SITE = "http://localhost:5056";
const GAME = process.argv[2] || "spit";
const R = (c) => "23456789TJQKA".indexOf(c[0]);
(async () => {
  const b = await launch();
  let bb;
  const report = [];
  const scroll = async (tag, ps, tvs) => {
    for (const [i, p] of ps.entries()) report.push(tag + " phone" + i + " overflowX=" + (await p.overflowX()));
    for (const [i, t] of tvs.entries()) report.push(tag + " tv" + i + " scroll=" + (await t.ev("document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1")) + " stageOverflow=" + (await t.ev("(()=>{const s=document.querySelector('.gn-tv-stage');const c=s&&s.firstElementChild;return c? (c.scrollHeight>s.clientHeight+2||c.scrollWidth>s.clientWidth+2):'none'})()")));
  };
  try {
    const nPhones = GAME === "spades" ? 1 : 2;
    const ps = [];
    for (let i = 0; i < nPhones; i++) ps.push(await b.page(375, 812));
    const tv = await b.page(1920, 1080, false), tv2 = await b.page(1280, 720, false);
    const [A, B] = ps;
    await A.go(SITE + "/cards" + SV);
    await A.full("lobby");
    await A.type("input[autocomplete=nickname]", "Rob");
    await A.click("Make a room");
    await wait(1200);
    const code = await A.ev("document.querySelector('.gn-bar b').textContent");
    if (B) { await B.go(SITE + "/cards" + SV); await B.type("input[autocomplete=nickname]", "Samantha"); await B.type("input[aria-label='Room code']", code); await B.click("Join"); await wait(800); }
    const seen = {};
    if (GAME === "spades") {
      bb = await bots(code, 3, (s, v, mv, i) => {
        const me = s.last.match.me;
        if (v.turn !== me) return;
        const k = v.hand + ":" + v.phase + ":" + v.trick.length + ":" + v.tricks.join();
        if (seen[i] === k) return; seen[i] = k;
        setTimeout(() => (v.phase === "bid" ? mv({ act: "bid", n: [0, 3, 4][i] }) : mv({ act: "play", c: v.legal[0] })), 600);
      });
    }
    if (GAME === "rummy") {
      bb = await bots(code, 1, (s, v, mv) => {
        const me = s.last.match.me;
        if (v.turn !== me) return;
        const k = v.hand + ":" + v.phase + ":" + v.myHand.length;
        if (seen.r === k) return; seen.r = k;
        setTimeout(() => (v.phase === "draw" ? mv({ act: "draw" }) : mv({ act: "discard", card: v.myHand.slice().sort((a, b) => R(b) - R(a))[0] })), 700);
      });
    }
    for (const t of [tv, tv2]) { await t.go(SITE + "/cards" + SV); await t.type("input[aria-label='Room code']", code); await t.click("Show on a TV"); await wait(800); }
    await wait(600);
    await A.full("room-" + GAME);
    await tv.shot("tv-room-" + GAME);
    const name = { spit: "Spit", spades: "Spades", rummy: "Rummy 500" }[GAME];
    for (const p of ps) await p.ev("window.addEventListener('error', e => (window.__e = (window.__e || []).concat(String(e.message) + ' ' + (e.error && e.error.stack || '').slice(0, 600))))");
    await A.click(name, "button.duel-game");
    await wait(1200);
    await A.shot(GAME + "-phone-start");
    if (GAME === "spit") {
      await wait(1800);
      await A.shot("spit-phone-flip"); await tv.shot("spit-tv-1080-flip"); await tv2.shot("spit-tv-720-flip");
      await scroll("spit-flip", ps, [tv, tv2]);
      let stuckShot = false, selShot = false;
      for (let k = 0; k < 120; k++) {
        for (const [i, p] of ps.entries()) {
          // tap a pile: the page decides whether it fits
          const n = await p.ev("document.querySelectorAll('.dg-spit-row.me button.pc').length");
          if (!n) continue;
          await p.ev(`(()=>{const bs=[...document.querySelectorAll('.dg-spit-row.me button.pc')];const b=bs[${k} % bs.length];b&&b.click();return true})()`);
          await wait(60);
          if (!selShot && i === 0 && await p.ev("!!document.querySelector('.dg-spit-row.me .pc.sel')")) { await p.shot("spit-phone-selected"); selShot = true; }
          if (await p.ev("!!document.querySelector('.dg-spit-row.me .pc.sel')")) await p.ev("(()=>{const c=document.querySelector('.dg-spit-mid .pc.glow');if(c){c.click()}else{const e=document.querySelector('.dg-spit-row.me .pc-empty.glow');e?e.click():document.querySelector('.dg-spit-row.me .pc.sel').click()}return 1})()");
          if (await p.ev("!!document.querySelector('.dg-spit-btn')")) {
            if (!stuckShot && i === 0) { await p.shot("spit-phone-stuck"); await tv.shot("spit-tv-1080-stuck"); stuckShot = true; }
            await p.click("Spit!");
          }
          if (await p.ev("!!document.querySelector('.dg-spit-mid.slap')")) { await p.shot("spit-phone-slap"); await tv.shot("spit-tv-1080-slap"); await tv2.shot("spit-tv-720-slap"); await p.ev("document.querySelector('.dg-spit-mid button.pc').click()"); await wait(800); await p.shot("spit-phone-claimed"); }
        }
        if (k === 30) { await A.shot("spit-phone-mid"); await B.shot("spit-phone-mid-B"); await tv.shot("spit-tv-1080-mid"); await tv2.shot("spit-tv-720-mid"); await scroll("spit-mid", ps, [tv, tv2]); }
        if (await A.ev("!!document.querySelector('.duel-result')")) break;
      }
      await wait(500);
      await A.shot("spit-phone-end"); await tv.shot("spit-tv-1080-end");
    }
    if (GAME === "spades") {
      for (let k = 0; k < 400; k++) {
        await wait(150);
        const st = await A.ev("(()=>({bid:!!document.querySelector('.dg-sp-bid'),mine:(document.querySelector('.pc-turn.mine b')||{}).textContent==='Your turn · play a card',play:document.querySelectorAll('.pc-hand button.pc:not(.dim)').length,sum:!!document.querySelector('.dg-sp-sum'),res:!!document.querySelector('.duel-result')}))()");
        if (st.res) break;
        if (st.bid) {
          await A.shot("spades-phone-bidding-before"); await tv.shot("spades-tv-1080-bid"); await tv2.shot("spades-tv-720-bid");
          await A.click("4", ".dg-sp-bid .grid button"); await wait(100); await A.shot("spades-phone-bidpick"); await A.click("Bid 4"); continue;
        }
        if (st.mine && st.play) {
          await A.ev("document.querySelector('.pc-hand button.pc:not(.dim)').click()"); await wait(150);
          if (!seen.selShot) { seen.selShot = 1; await A.shot("spades-phone-selected"); await scroll("spades-play", [A], [tv, tv2]); }
          await A.ev("document.querySelector('.pc-hand button.pc.sel').click()"); await wait(300);
          const tn = await A.ev("document.querySelectorAll('.dg-sp-trick .pc').length");
          if (tn >= 2 && !seen.trick) { seen.trick = 1; await A.shot("spades-phone-trick"); await tv.shot("spades-tv-1080-trick"); await tv2.shot("spades-tv-720-trick"); }
        }
        if (st.sum && !seen.sum) { seen.sum = 1; await A.full("spades-phone-score"); await tv.shot("spades-tv-1080-score"); await tv2.shot("spades-tv-720-score"); await scroll("spades-score", [A], [tv, tv2]); break; }
      }
    }
    if (GAME === "rummy") {
      for (let k = 0; k < 300; k++) {
        await wait(200);
        for (const [i, p] of ps.entries()) {
          const st = await p.ev("(()=>({draw:!!document.querySelector('.dg-rm-draw .stock .pc.glow'),meld:!!document.querySelector('.dg-rm-acts'),res:!!document.querySelector('.duel-result'),sum:!!document.querySelector('.dg-rm-sum')}))()");
          if (st.sum && !seen.sum) { seen.sum = 1; await p.full("rummy-phone-score"); await tv.shot("rummy-tv-1080-score"); await tv2.shot("rummy-tv-720-score"); }
          if (st.draw) {
            if (!seen["dig" + i] && await p.ev("document.querySelectorAll('.dg-rm-draw .fan .pc').length") >= 3) {
              seen["dig" + i] = 1; await p.ev("document.querySelectorAll('.dg-rm-draw .fan .pc')[0].click()"); await wait(150); await p.shot("rummy-phone-dig" + i); await p.ev("document.querySelectorAll('.dg-rm-draw .fan .pc')[0].click()");
            }
            await p.ev("document.querySelector('.dg-rm-draw .stock .pc').click()"); await wait(400);
          } else if (st.meld) {
            // select the three highest and try to meld (shows button state), then discard the highest
            await p.ev("(()=>{const b=[...document.querySelectorAll('.pc-hand button.pc')];b.slice(-2).forEach(x=>x.click());return 1})()"); await wait(120);
            if (!seen["sel" + i]) { seen["sel" + i] = 1; await p.full("rummy-phone-select" + i); await tv.shot("rummy-tv-1080-mid"); await tv2.shot("rummy-tv-720-mid"); await scroll("rummy-mid", ps, [tv, tv2]); }
            await p.click("Clear"); await wait(80);
            await p.ev("(()=>{const b=[...document.querySelectorAll('.pc-hand button.pc')];b[b.length-1].click();return 1})()"); await wait(80);
            await p.click("Discard", ".dg-rm-acts button"); await wait(300);
          }
        }
        if (seen.sum || k > 60) break;
      }
      await A.full("rummy-phone-late"); await B.full("rummy-phone-late-B"); await tv.shot("rummy-tv-1080-late"); await tv2.shot("rummy-tv-720-late");
      await scroll("rummy-late", ps, [tv, tv2]);
    }
    console.log(report.join("\n"));
    for (const p of ps) console.log("errors:", JSON.stringify(await p.ev("window.__e || []")).slice(0, 2500));
    const errs = await A.ev("document.body.innerText.slice(0,300)");
    console.log(errs);
  } finally { b.close(); bb && bb.close(); }
})();
