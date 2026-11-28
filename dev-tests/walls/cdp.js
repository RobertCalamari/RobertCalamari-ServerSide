// Tiny headless Chrome driver over CDP (Node's built-in WebSocket). Each page gets its own browser context (own localStorage).
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const PORT = 9391;
const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const dir = path.join(__dirname, "chrome-prof-walls");
  const proc = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + dir, "--no-first-run", "--hide-scrollbars", "--mute-audio", "about:blank"], { stdio: "ignore" });
  let info;
  for (let i = 0; i < 50; i++) {
    try { info = await (await fetch("http://127.0.0.1:" + PORT + "/json/version")).json(); break; } catch (e) { await wait(200); }
  }
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  async function page(w, h, mobile = true) {
    const { browserContextId } = await send("Target.createBrowserContext");
    const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s("Page.enable");
    await s("Runtime.enable");
    await s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    if (mobile) await s("Emulation.setTouchEmulationEnabled", { enabled: false });
    const p = {
      async go(url) { await s("Page.navigate", { url }); await wait(2500); },
      async ev(expr) { const r = await s("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; },
      // set an input's value the React way
      async type(sel, text) {
        return p.ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
      },
      // click the first button/element whose text contains `text`
      async click(text, sel = "button") {
        const ok = await p.ev(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!el)return false;el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));el.click();return true})()`);
        if (!ok) console.log("  (no element with text " + text + ")");
        return ok;
      },
      async shot(name) {
        const { data } = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(data, "base64"));
      },
      async full(name) {
        const m = await s("Page.getLayoutMetrics");
        const hh = Math.ceil(m.cssContentSize.height);
        const { data } = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.min(hh, 4000), scale: 1 } });
        fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(data, "base64"));
      },
      overflowX() { return p.ev("document.documentElement.scrollWidth > window.innerWidth + 1"); },
      text() { return p.ev("document.body.innerText"); },
    };
    return p;
  }
  return { page, close: () => { try { proc.kill(); } catch (e) { } } };
}
module.exports = { launch, wait };
