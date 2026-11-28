const { launch, wait } = require("./cdp");
const SV = "?server=http://localhost:4008", SITE = "http://localhost:5056";
(async () => {
  const b = await launch();
  try {
    const A = await b.page(375, 812), B = await b.page(375, 812);
    await A.go(SITE + "/duels" + SV);
    await A.type("input[autocomplete=nickname]", "Rob");
    await A.click("Make a room"); await wait(1200);
    const code = await A.ev("(document.querySelector('.duel-code')||{}).textContent");
    await B.go(SITE + "/duels" + SV); await B.type("input[autocomplete=nickname]", "Sam"); await B.type("input[aria-label='Room code']", code); await B.click("Join"); await wait(1000);
    const names = await A.ev("[...document.querySelectorAll('.duel-game b')].map(b=>b.textContent).join(', ')");
    console.log("has Spit", names.includes("Spit"), "has Rummy", names.includes("Rummy 500"), "has Spades", names.includes("Spades"), "has Hush", names.includes("Hush"));
    await A.click("Spit", "button.duel-game"); await wait(4000);
    await A.shot("duels-spit-phone"); console.log("x", await A.overflowX());
    await A.ev("[...document.querySelectorAll('.dg-spit-row.me button.pc')].forEach(b=>b.click())"); await wait(500);
    await B.shot("duels-spit-phone-B");
  } finally { b.close(); }
})();
