// Rummy with melds on the table: one browser phone + 3 melding bots + two TVs
const { launch, wait } = require("./cdp");
const { bots } = require("./bots");
const RM = require("../../games/duels/games/rummy500.js");
const SV = "?server=http://localhost:4008", SITE = "http://localhost:5056";
const rank = (c) => "23456789TJQKA".indexOf(c[0]) + 2;
function meldsIn(hand) {
  const out = [], by = {};
  hand.forEach((c) => (by[c[0]] = (by[c[0]] || []).concat(c)));
  Object.values(by).forEach((l) => l.length >= 3 && out.push(l.slice(0, 4)));
  const used = new Set(out.flat());
  for (const s of "SHDC") {
    const cs = hand.filter((c) => c[1] === s && !used.has(c)).sort((a, b) => rank(a) - rank(b));
    let run = [];
    for (const c of cs) { if (run.length && rank(c) === rank(run[run.length - 1]) + 1) run.push(c); else { if (run.length >= 3) out.push(run); run = [c]; } }
    if (run.length >= 3) out.push(run);
  }
  return out;
}
(async () => {
  const b = await launch();
  let bb;
  try {
    const A = await b.page(375, 812), tv = await b.page(1920, 1080, false), tv2 = await b.page(1280, 720, false);
    await A.go(SITE + "/cards" + SV);
    await A.type("input[autocomplete=nickname]", "Rob");
    await A.click("Make a room"); await wait(1200);
    const code = await A.ev("document.querySelector('.gn-bar b').textContent");
    const busy = {};
    bb = await bots(code, 3, (s, v, mv, i) => {
      const me = s.last.match.me;
      if (v.turn !== me || busy[i]) return;
      busy[i] = 1;
      setTimeout(async () => {
        const v = s.last.match.view; busy[i] = 0;
        if (v.turn !== me) return;
        if (v.phase === "draw") {
          const gi = v.discard.findIndex((c, k) => k < v.discard.length - 1 && RM.findMeld(c, v.myHand.concat(v.discard.slice(k)), v.melds));
          return gi >= 0 ? mv({ act: "take", index: gi }) : mv({ act: "draw" });
        }
        if (v.must) { const f = RM.findMeld(v.must, v.myHand, v.melds); return f.layoff !== undefined ? mv({ act: "layoff", meld: f.layoff, cards: [v.must] }) : mv({ act: "meld", cards: f.cards }); }
        const ms = meldsIn(v.myHand);
        if (ms.length) return mv({ act: "meld", cards: ms[0] });
        for (const c of v.myHand) { const m = v.melds.find((m) => RM.typeOf(m.cards.map((x) => x.c).concat(c)) === m.type); if (m) return mv({ act: "layoff", meld: m.id, cards: [c] }); }
        mv({ act: "discard", card: v.myHand.slice().sort((a, b) => RM.value(b) - RM.value(a))[0] });
      }, 250);
    });
    for (const t of [tv, tv2]) { await t.go(SITE + "/cards" + SV); await t.type("input[aria-label='Room code']", code); await t.click("Show on a TV"); await wait(800); }
    await A.click("Rummy 500", "button.duel-game"); await wait(1000);
    let shots = 0;
    for (let k = 0; k < 400 && shots < 2; k++) {
      await wait(200);
      const st = await A.ev("(()=>({draw:!!document.querySelector('.dg-rm-draw .stock .pc.glow'),meld:!!document.querySelector('.dg-rm-acts'),n:document.querySelectorAll('.dg-rm-meld').length,sum:!!document.querySelector('.dg-rm-sum')}))()");
      if (st.sum) { await A.full("melds-phone-score"); await tv.shot("melds-tv-1080-score"); await tv2.shot("melds-tv-720-score"); break; }
      if (st.draw) { await A.ev("document.querySelector('.dg-rm-draw .stock .pc').click()"); await wait(300); continue; }
      if (st.meld) {
        if ((st.n >= 3 && shots === 0) || (st.n >= 6 && shots === 1)) {
          // select a card that fits a meld, if any, to show the glow
          await A.ev("(()=>{for(const b of document.querySelectorAll('.pc-hand button.pc')){b.click();if(document.querySelector('.dg-rm-meld.ok'))return 1;b.click()}return 0})()");
          await wait(150);
          await A.full("melds-phone-" + shots); await tv.shot("melds-tv-1080-" + shots); await tv2.shot("melds-tv-720-" + shots);
          console.log("tv scroll", await tv.ev("(()=>{const s=document.querySelector('.gn-tv-stage');const c=s.firstElementChild;return c.scrollHeight>s.clientHeight+2})()"), await tv2.ev("(()=>{const s=document.querySelector('.gn-tv-stage');const c=s.firstElementChild;return c.scrollHeight>s.clientHeight+2})()"), "phone x", await A.overflowX());
          shots++;
          const ok = await A.ev("(()=>{const m=document.querySelector('.dg-rm-meld.ok');if(m){m.click();return 1}return 0})()");
          await wait(300);
          if (ok) continue;
          await A.click("Clear");
        }
        await A.ev("(()=>{const b=[...document.querySelectorAll('.pc-hand button.pc')];b[b.length-1].click();return 1})()"); await wait(80);
        await A.click("Discard", ".dg-rm-acts button"); await wait(300);
      }
    }
  } finally { b.close(); bb && bb.close(); }
})();
