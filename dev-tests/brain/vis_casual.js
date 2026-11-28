// Visual check of casual (no timer) Digit Target + Word Mine at 375px, a bot and a 720p TV. PORT=4009
const { launch, wait } = require("./cdp9");
const { open, call, mv } = require("./common");
const SV = "?server=http://localhost:4009";
const SITE = "http://localhost:5056";
const issues = [];
const note = (ok, l, x = "") => { console.log((ok ? "ok   " : "BAD  ") + l + (x ? "  " + x : "")); if (!ok) issues.push(l); };
const BV = (s) => s.last && s.last.match && s.last.match.view;

(async () => {
  const b = await launch();
  let kai;
  try {
    const A = await b.page(375, 812);
    await A.go(SITE + "/brain" + SV);
    await A.type("input[autocomplete=nickname]", "Rob");
    await A.click("Make a room");
    await wait(1200);
    const code = await A.ev("document.querySelector('.gn-bar b').textContent");
    kai = await open();
    await call(kai, "duel:join", { code, name: "Kai", group: true });
    const T = await b.page(1280, 720, false);
    await T.go(SITE + "/brain" + SV);
    await T.type("input[aria-label='Room code']", code);
    await T.click("Show on a TV");
    await wait(1000);
    await A.click("Digit Target", ".gg-card");
    await wait(500);
    note(await A.click("Timer on", ".gn-opt"), "timer toggle shown to host");
    await wait(200);
    note((await A.ev("document.querySelector('.gn-opt').textContent")).includes("Timer off"), "toggle flips to off");
    await A.full("lobby-toggle-A");
    note(!(await A.overflowX()), "lobby no sideways scroll");
    await A.click("Start Digit Target");
    await wait(4200);
    for (let k = 0; k < 40; k++) { if (await A.ev("!!document.querySelector('.br-dt-digits')")) break; await wait(150); }
    note(!(await A.ev("!!document.querySelector('.br .br-time')")), "DT phone: no clock");
    note((await A.text()).includes("no timer"), "DT phone: says no timer");
    note(await A.ev("document.querySelectorAll('.br-dt-ops button').length === 7 && [...document.querySelectorAll('.br-dt-ops button')].some(b=>b.textContent==='!')"), "DT: ! button");
    // build d0 ! + d1 and look for any value / distance readout
    await A.tap(".br-dt-digits button", 0); await A.tap(".br-dt-ops button", 6); await A.tap(".br-dt-ops button", 0); await A.tap(".br-dt-digits button", 1);
    await wait(300);
    const sum = await A.ev("document.querySelector('.br-dt-expr .sum').innerText");
    const val = await A.ev("document.querySelector('.br-dt-expr .val').innerText");
    note(/!/.test(sum) && val.trim() === "", "DT: expression only, no live value", JSON.stringify([sum, val]));
    await A.shot("dt-building-A");
    await A.click("Submit");
    await wait(500);
    const txt = await A.text();
    note(/not exact/.test(txt) && !/off by|away|= \d/.test(txt), "DT: after submit only exact/not", txt.match(/Sent.*$/m) && txt.match(/Sent.*$/m)[0]);
    await A.shot("dt-submitted-A");
    note((await T.text()).includes("Casual · no timer") && !(await T.ev("!!document.querySelector('.br-time')")), "DT TV: casual label, no clock");
    note(!(await T.tvScroll()), "DT TV: no scroll");
    await T.shot("dt-tv720");
    note(!(await A.overflowX()), "DT phone no sideways scroll");
    await A.ev("window.confirm=()=>true");
    await A.click("I'm done");
    await wait(400);
    note(BV(A) === undefined || true, "");
    await A.shot("dt-waiting-A");
    await mv(kai, { q: 0, act: "out" });
    await wait(800);
    note(await A.ev("!!document.querySelector('.br-dt-reveal')"), "DT: reveal once everyone's done");
    await A.shot("dt-reveal-A");
    // host skips round 2
    await wait(7500);
    note(await A.click("Skip round"), "DT: host skip button");
    await wait(800);
    note(await A.ev("!!document.querySelector('.br-dt-reveal')"), "DT: skip reveals");
    await A.click("Exit", ".duel-exit");
    await wait(1200);
    await A.click("Choose a different game");
    await wait(300);
    await A.click("Word Mine", ".gg-card");
    await wait(500);
    note(String(await A.ev("document.querySelector('.gn-opt') && document.querySelector('.gn-opt').textContent")).includes("Timer off"), "toggle stays off back in the room");
    await A.shot("wm-pick-A");
    await A.click("Start Word Mine");
    await wait(4200);
    const wt = await A.text();
    note(!(await A.ev("!!document.querySelector('.br .br-time')")) && wt.includes("no timer") && !/to find/.test(wt), "WM phone: no clock, no possible count", wt.split("\n").slice(0, 4).join(" | "));
    await A.key("t"); await A.key("e");
    await A.shot("wm-play-A");
    const tt = await T.text();
    note(tt.includes("Casual · no timer") && !/to find/.test(tt) && !(await T.ev("!!document.querySelector('.br-time')")), "WM TV: casual label, no clock, no count");
    note(!(await T.tvScroll()), "WM TV: no scroll");
    await T.shot("wm-tv720");
    note(!(await A.overflowX()), "WM phone no sideways scroll");
    note((await A.text()).includes("End it for everyone"), "WM: host end button");
    await A.click("I'm done");
    await mv(kai, { act: "stop" });
    await wait(1500);
    await A.shot("wm-done-A");
    note(await A.ev("!!document.querySelector('.br-wm-lists')"), "WM: ends when everyone's done");
    console.log(issues.length ? "ISSUES:\n" + issues.join("\n") : "no issues");
  } catch (e) {
    console.log("ERR", e);
  } finally {
    if (kai) kai.disconnect();
    b.close();
    process.exit(0);
  }
})();
