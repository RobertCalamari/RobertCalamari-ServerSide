const { launch, wait } = require("./cdp");
const SV = "?server=http://localhost:4013";
const SITE = "http://localhost:5056";
async function setup(b, game, tvs) {
  const A = await b.page(375, 812), B = await b.page(375, 812);
  await A.go(SITE + "/play/" + game + SV);
  await A.type("input[autocomplete=nickname]", "Rob");
  await A.click("Make a room"); await wait(1200);
  const code = await A.ev("document.querySelector('.gn-bar b').textContent");
  await B.go(SITE + "/play/" + game + SV);
  await B.type("input[autocomplete=nickname]", "Samantha");
  await B.type("input[aria-label='Room code']", code);
  await B.click("Join"); await wait(900);
  const T = [];
  for (const [w, h] of tvs) { const t = await b.page(w, h, false); await t.go(SITE + "/gamenight" + SV); await t.type("input[aria-label='Room code']", code); await t.click("Show on a TV"); await wait(800); T.push(t); }
  return { A, B, T };
}
const lawnTap = (p, u, v) => p.ev(`(()=>{const l=document.querySelector('.dg-hedge-lawn');const r=l.getBoundingClientRect();l.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+r.width*${u}/9,clientY:r.top+r.height*${v}/9}));return true})()`);
const mine = async (A, B) => ((await A.ev("!!document.querySelector('.dg-hedge-tools')")) ? [A, B] : [B, A]);
const stepFwd = (p) => p.ev(`(()=>{const c=[...document.querySelectorAll('.dg-hedge-cell.target')];c.sort((a,b)=>parseFloat(a.style.top)-parseFloat(b.style.top));c[0].click();return c.length})()`);
(async () => {
  const b = await launch();
  try {
    // Hedge Run
    let { A, B, T } = await setup(b, "hedgerun", [[1920, 1080], [1280, 720]]);
    await A.click("Start Hedge Run"); await wait(1800);
    await A.shot("hedge-A-start"); await B.shot("hedge-B-start");
    let [M, O] = await mine(A, B);
    await M.shot("hedge-myturn-targets");
    console.log("targets", await stepFwd(M)); await wait(700);
    [M, O] = await mine(A, B);
    await M.click("Plant a hedge"); await wait(300);
    await lawnTap(M, 4, 2); await wait(300);
    await M.shot("hedge-ghost-ok");
    await M.click("Plant"); await wait(700);
    [M, O] = await mine(A, B);
    await stepFwd(M); await wait(700);
    [M, O] = await mine(A, B);
    await M.click("Plant a hedge"); await wait(300);
    // crossing a fresh hedge: find the wall the other planted and tap there with the other orientation
    await lawnTap(M, 4, 2); await wait(200); await lawnTap(M, 5, 2); await wait(200);
    await M.shot("hedge-ghost-a"); 
    console.log("msg", await M.ev("document.querySelector('.dg-hedge-msg').textContent"));
    await M.click("Cancel"); await wait(200);
    await M.click("Plant a hedge"); await wait(200);
    await lawnTap(M, 6, 6); await wait(200); await lawnTap(M, 6, 6); await wait(200);
    await M.shot("hedge-ghost-vertical");
    await M.click("Plant"); await wait(700);
    for (let i = 0; i < 4; i++) { [M, O] = await mine(A, B); await stepFwd(M); await wait(600); }
    await A.shot("hedge-A-mid"); await B.shot("hedge-B-mid");
    await T[0].shot("hedge-tv-1080"); await T[1].shot("hedge-tv-720");
    console.log("phone overflowX", await A.overflowX(), await B.overflowX(), "tv scroll", await T[0].ev("document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1"), await T[1].ev("document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1"));
    await A.full("hedge-A-full");
    for (let i = 0; i < 30; i++) { [M, O] = await mine(A, B); if (!(await M.ev("!!document.querySelector('.dg-hedge-cell.target')"))) break; await stepFwd(M); await wait(500); }
    await wait(1500);
    await A.shot("hedge-A-end"); await T[0].shot("hedge-tv-end");
    // Knife Throw
    ({ A, B, T } = await setup(b, "knifethrow", []));
    await A.click("Start Knife Throw"); await wait(4200);
    const tap = (p) => p.ev("document.querySelector('.dg-knife-canvas').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})), true");
    await tap(A); await wait(500); await tap(B); await wait(150); await A.shot("knife-A-incoming");
    for (let i = 0; i < 3; i++) { await tap(A); await wait(320); await tap(B); await wait(420); }
    await A.shot("knife-A"); await B.shot("knife-B");
    await wait(700); await A.shot("knife-A2"); await B.shot("knife-B2");
    console.log("knife overflow", await A.overflowX());
  } finally { b.close(); }
})();
