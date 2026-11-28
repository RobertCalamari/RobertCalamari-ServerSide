const { launch, wait } = require("./cdp9");
const btns = "JSON.stringify([...document.querySelectorAll('button')].map(b=>b.className+':'+b.textContent.slice(0,30)))";
(async () => { const b = await launch(); try {
  const A = await b.page(375, 812);
  await A.go("http://localhost:5056/brain?server=http://localhost:4009");
  console.log(await A.ev(btns));
  await A.type("input[autocomplete=nickname]", "Rob"); await A.click("Make a room"); await wait(1500);
  console.log("----", (await A.text()).slice(0, 900));
  console.log(await A.ev(btns));
  await A.full("peek-lobby");
} catch (e) { console.log("ERR", e.message); } finally { b.close(); process.exit(0); } })();
