// Visual run: node vis.js <game> <mode: group|solo|duel>
const { launch, wait } = require("./cdp");
const { open, call, mv } = require("./common");
const S = "../../games/duels/";
const W = require(S + "words.js");
const DT = require(S + "games/digittarget.js");
const SV = "?server=http://localhost:4007";
const SITE = "http://localhost:5056";
const [GAME, MODE = "group"] = process.argv.slice(2);
const NAMES = { wordmine: "Word Mine", digittarget: "Digit Target", nextup: "Next in Line", inkclash: "Ink Clash", pathrecall: "Path Recall" };
const TAG = GAME + "-" + MODE;
const issues = [];

async function bot(code, name, group = true) {
  const s = await open();
  await call(s, "duel:join", { code, name, group });
  return s;
}
const BV = (s) => s.last && s.last.match && s.last.match.view;

async function check(pages, tvs, label) {
  for (const [i, p] of pages.entries()) if (await p.overflowX()) issues.push(label + ": phone " + i + " sideways scroll");
  for (const [i, t] of tvs.entries()) if (await t.tvScroll()) issues.push(label + ": tv " + i + " scrolls");
}

async function shotAll(pages, tvs, name) {
  await pages[0].shot(TAG + "-" + name + "-A");
  if (pages[1]) await pages[1].shot(TAG + "-" + name + "-B");
  if (tvs[0]) await tvs[0].shot(TAG + "-" + name + "-tv1080");
  if (tvs[1]) await tvs[1].shot(TAG + "-" + name + "-tv720");
  await check(pages, tvs, name);
}

const tokensOf = (e) => e.match(/\d|[×÷−+()]/g).map((m) => ({ "×": "x", "÷": "/", "−": "-" }[m] || m));

// ---- per game drivers: (ctx) => plays and shoots
const drive = {
  async wordmine({ pages, tvs, bots }) {
    const [A, B] = pages;
    await wait(1200);
    await shotAll(pages, tvs, "ready");
    await wait(2600);
    const letters = (await A.ev("[...document.querySelectorAll('.br-wm-tiles button')].map(b=>b.textContent).join('')")).toLowerCase();
    const subs = W.inside(letters).filter((w) => w.length < letters.length);
    const typeWord = async (p, w) => { for (const ch of w) await p.key(ch); await p.key("Enter"); await wait(250); };
    for (const w of subs.slice(0, 7)) await typeWord(A, w);
    await typeWord(A, "zzz"[0] + letters.slice(0, 2));
    if (B) for (const w of subs.slice(3, 9)) await typeWord(B, w);
    for (const [i, b] of bots.entries()) for (const w of subs.slice(5 + i * 4, 12 + i * 4)) await mv(b, { w });
    await A.key(letters[0]); await A.key(letters[1]);
    await wait(300);
    await shotAll(pages, tvs, "play");
    for (const p of pages) { await p.ev("window.confirm=()=>true"); await p.click("I'm done"); }
    for (const b of bots) await mv(b, { act: "stop" });
    await wait(2500);
    await A.ev("document.querySelector('.duel-result') && (document.querySelector('.duel-result').style.display='none')");
    await A.full(TAG + "-done-A-full");
    await A.ev("document.querySelector('.duel-result') && (document.querySelector('.duel-result').style.display='')");
    await shotAll(pages, tvs, "done");
  },
  async digittarget({ pages, tvs, bots }) {
    const [A, B] = pages;
    await wait(1000);
    await shotAll(pages, tvs, "ready");
    for (let r = 0; r < 5; r++) {
      await wait(r === 0 ? 2600 : 0);
      for (let k = 0; k < 100; k++) { if (await A.ev("!!document.querySelector('.br-dt-digits')")) break; await wait(150); }
      const digits = (await A.ev("[...document.querySelectorAll('.br-dt-digits button')].map(b=>b.textContent)")).map(Number);
      const target = Number(await A.ev("document.querySelector('.br-dt-target b').textContent"));
      const best = DT.solve(digits);
      const toks = tokensOf(best[target].e);
      if (r === 0) {
        // build a wrong one first to show the live value, then clear
        await A.tap(".br-dt-digits button", 0); await A.tap(".br-dt-ops button", 2); await A.tap(".br-dt-digits button", 1); await A.tap(".br-dt-ops button", 0);
        await wait(300);
        await shotAll(pages, tvs, "building");
        await A.click("Clear");
        await A.tap(".br-dt-digits button", 0); await A.tap(".br-dt-ops button", 0); await A.tap(".br-dt-digits button", 0);
        await wait(200);
        await A.shot(TAG + "-r0-reused-A");
        await A.click("Clear");
      }
      for (const t of toks) await A.key(t);
      await wait(200);
      if (r === 0) await A.shot(TAG + "-r0-exact-built-A");
      await A.key("Enter");
      if (B) { for (const t of r === 0 ? [String(digits[0])] : toks) await B.key(t); await B.key("Enter"); }
      for (const [i, b] of bots.entries()) {
        const tk = toks.map((t) => t);
        const used = new Set();
        const tokens = tk.map((t) => { if (/\d/.test(t)) { const j = digits.findIndex((d, k) => String(d) === t && !used.has(k)); used.add(j); return "d" + j; } return { x: "*" }[t] || t; });
        await mv(b, { q: r, tokens: i === 0 || r > 0 ? tokens : ["d0"] });
      }
      await wait(600);
      if (r === 0) await shotAll(pages, tvs, "submitted");
      if (r === 0 && B) await A.ev("1");
      // round 0 has a near miss so waits for the clock
      for (let k = 0; k < 500; k++) { if (await A.ev("!!document.querySelector('.br-dt-reveal')")) break; await wait(150); }
      await wait(600);
      if (r === 0 || r === 4) await shotAll(pages, tvs, "reveal" + r);
      for (let k = 0; k < 100; k++) { if (!(await A.ev("!!document.querySelector('.br-dt-reveal')"))) break; await wait(150); }
    }
    await wait(1200);
    await shotAll(pages, tvs, "final");
  },
  async nextup({ pages, tvs, bots }) {
    await wait(1000);
    await shotAll(pages, tvs, "ready");
    await wait(2500);
    for (let q = 0; q < 10; q++) {
      for (let k = 0; k < 100; k++) { if (await pages[0].ev("!!document.querySelector('.br-nu-choices button:not(:disabled)')")) break; await wait(150); }
      if (q === 0 || q === 8) await shotAll(pages, tvs, "ask" + q);
      for (const [i, p] of pages.entries()) await p.tap(".br-nu-choices button", (q + i) % 4);
      for (const [i, b] of bots.entries()) await mv(b, { q, choice: (q * 3 + i) % 4 });
      await wait(700);
      if (q === 0 || q === 8) await shotAll(pages, tvs, "reveal" + q);
      for (let k = 0; k < 60; k++) { if (!(await pages[0].ev("!!document.querySelector('.br-nu-rule')"))) break; await wait(150); }
    }
    await wait(1500);
    await shotAll(pages, tvs, "final");
  },
  async inkclash({ pages, tvs, bots }) {
    await wait(1000);
    await shotAll(pages, tvs, "ready");
    await wait(2600);
    const INK = { "rgb(255, 77, 77)": 0, "rgb(61, 139, 255)": 1, "rgb(61, 220, 106)": 2, "rgb(255, 210, 63)": 3 };
    const WORDS = ["RED", "BLUE", "GREEN", "YELLOW"];
    const t0 = Date.now();
    let n = 0;
    const botLoop = Promise.all(bots.map(async (b, i) => {
      while (Date.now() - t0 < 36000) {
        const v = BV(b); const c = v && v.me.cards[0];
        if (v && v.phase === "play" && c) { const a = c[2] ? c[0] : c[1]; await mv(b, { i: v.me.pos, pick: Math.random() < 0.15 ? (a + 1) % 4 : a }); }
        await wait(500 + i * 200);
      }
    }));
    while (Date.now() - t0 < 12000) {
      for (const [i, p] of pages.entries()) {
        const c = await p.ev("(()=>{const b=document.querySelector('.br-ink-card b');const s=document.querySelector('.br-ink-card small');return b&&s?[b.textContent,getComputedStyle(b).color,s.textContent]:null})()");
        if (!c || !(c[1] in INK)) continue;
        const a = c[2] === "WORD" ? WORDS.indexOf(c[0]) : INK[c[1]];
        await p.tap(".br-ink-pads button", (n + i) % 7 === 6 ? (a + 1) % 4 : a);
      }
      n++;
      if (n === 12) await shotAll(pages, tvs, "play");
      if (n === 13) await pages[0].shot(TAG + "-play2-A");
      await wait(250);
    }
    for (let k = 0; k < 40; k++) { const w = await pages[0].ev("(()=>{const s=document.querySelector('.br-ink-card small');return s&&s.textContent})()"); if (w === "WORD") break; await wait(100); }
    await pages[0].shot(TAG + "-wordcard-A");
    await botLoop;
    for (let k = 0; k < 300; k++) { if (await pages[0].ev("!!document.querySelector('.duel-result')")) break; await wait(200); }
    await wait(800);
    await shotAll(pages, tvs, "final");
  },
  async pathrecall({ pages, tvs, bots }) {
    await wait(1000);
    await shotAll(pages, tvs, "ready");
    for (let r = 0; r < 6; r++) {
      const seen = [];
      let shot = false;
      for (let k = 0; k < 400; k++) {
        const lit = await pages[0].ev("(()=>{const b=[...document.querySelectorAll('.br-pr-grid button')];const i=b.findIndex(x=>x.classList.contains('lit'));const g=document.querySelector('.br-pr-grid');const ph=g?g.className:'';return [i,ph]})()");
        if (lit[0] >= 0 && seen[seen.length - 1] !== lit[0]) seen.push(lit[0]);
        if (!shot && r === 2 && seen.length === 3) { await shotAll(pages, tvs, "show"); shot = true; }
        if (lit[1].includes("input")) break;
        await wait(40);
      }
      const alive = r < 4;
      if (alive) {
        for (const [i, p] of pages.entries()) {
          const cells = i === 1 && r === 1 ? seen.slice().reverse() : seen;
          for (const [j, c] of cells.entries()) { await p.tap(".br-pr-grid button", c); if (r === 2 && i === 0 && j === 2) { await wait(150); await shotAll(pages, tvs, "input"); } }
        }
        for (const [i, b] of bots.entries()) { const v = BV(b); if (v.path === null && v.lives[v.lives.length - bots.length + i] > 0) await mv(b, { r, cells: i === 0 ? seen : seen.slice().reverse() }); }
      }
      for (let k = 0; k < 300; k++) { if (await pages[0].ev("(()=>{const g=document.querySelector('.br-pr-grid');return !!g&&g.className.includes('reveal')})()")) break; await wait(100); }
      await wait(400);
      if (r === 1 || r === 4) await shotAll(pages, tvs, "reveal" + r);
    }
    for (let k = 0; k < 600; k++) { if (await pages[0].ev("!!document.querySelector('.duel-result')")) break; await wait(200); }
    await wait(800);
    await shotAll(pages, tvs, "final");
  },
};

(async () => {
  const b = await launch();
  const bots = [];
  try {
    let pages = [], tvs = [];
    if (MODE === "duel") {
      const A = await b.page(375, 812), B = await b.page(375, 812);
      await A.go(SITE + "/duels" + SV);
      await A.type("input[autocomplete=nickname]", "Rob");
      await A.click("Make a room");
      await wait(1200);
      const code = await A.ev("document.querySelector('.duel-code').textContent");
      await B.go(SITE + "/duels" + SV);
      await B.type("input[autocomplete=nickname]", "Samantha");
      await B.type("input[aria-label='Room code']", code);
      await B.click("Join");
      await wait(1200);
      await A.full(TAG + "-lobby-A");
      if (!(await A.click(NAMES[GAME], ".duel-game"))) issues.push("game card missing in duels");
      pages = [A, B];
    } else {
      const A = await b.page(375, 812);
      await A.go(SITE + "/brain" + SV);
      await A.shot(TAG + "-landing");
      await A.type("input[autocomplete=nickname]", "Rob");
      await A.click("Make a room");
      await wait(1200);
      const code = await A.ev("document.querySelector('.gn-bar b').textContent");
      pages = [A];
      if (MODE === "group") {
        const B = await b.page(375, 812);
        await B.go(SITE + "/brain" + SV);
        await B.type("input[autocomplete=nickname]", "Samantha");
        await B.type("input[aria-label='Room code']", code);
        await B.click("Join");
        pages.push(B);
        bots.push(await bot(code, "Kai"), await bot(code, "Alexandra"));
        for (const [w, h] of [[1920, 1080], [1280, 720]]) {
          const t = await b.page(w, h, false);
          await t.go(SITE + "/brain" + SV);
          await t.type("input[aria-label='Room code']", code);
          await t.click("Show on a TV");
          tvs.push(t);
        }
      }
      await wait(1200);
      await A.full(TAG + "-lobby-A");
      await check(pages, [], "lobby");
      if (!(await A.click(NAMES[GAME], ".duel-game"))) issues.push("game card missing");
    }
    await drive[GAME]({ pages, tvs, bots });
    await wait(500);
    const res = await pages[0].ev("(()=>{const r=document.querySelector('.duel-result-card');return r?r.innerText:null})()");
    console.log("result card:", JSON.stringify(res));
    if (MODE === "solo") {
      await pages[0].shot(TAG + "-result-A");
      if (!(await pages[0].click("Play again"))) issues.push("no Play again button");
      await wait(1500);
      await pages[0].shot(TAG + "-again-A");
      const again = await pages[0].ev("!!document.querySelector('.br')");
      if (!again) issues.push("play again didn't start a game");
    }
    console.log(issues.length ? "ISSUES:\n" + issues.join("\n") : "no layout issues");
  } catch (e) {
    console.log("ERR", e);
  } finally {
    bots.forEach((s) => s.disconnect());
    b.close();
    process.exit(0);
  }
})();
