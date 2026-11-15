// Takes sharp screenshots of the Calzone section of the Mac page (http://localhost:8140/#calzone)
// with headless Chrome. It uploads one plate photo through the page's own Upload photos button,
// waits for the scan, then saves PNGs. Run: node tools/capture_mac.mjs <plate.jpg> <out-folder>
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [plate, outDir] = process.argv.slice(2);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const profile = mkdtempSync(path.join(tmpdir(), 'cz-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, nextId = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((ok, fail) => pending.set(id, { ok, fail }));
}
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function shot(name, clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true });
  writeFileSync(path.join(outDir, name), Buffer.from(r.data, 'base64'));
  console.log('saved', name);
}

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await wait(200); }
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.fail(m.error) : p.ok(m.result); }
  });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:8140/#calzone' });
  await wait(4000);
  const b64 = readFileSync(plate).toString('base64');
  const status = await js(`(async () => {
    for (const id of ['stage','info','panels','vitals','devices','lab']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    document.querySelector('h1').style.display = 'none';
    const bin = Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bin], 'plate.jpg', { type: 'image/jpeg' }));
    const inp = document.getElementById('czFile'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
    for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 500));
      if (/^Found/.test(document.getElementById('czStatus').textContent) && document.querySelector('#czTotals .czKcal')) break; }
    await new Promise((r) => setTimeout(r, 1500));
    return document.getElementById('czStatus').textContent;
  })()`);
  console.log(status);
  const box = await js(`(() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height }; };
    return { top: r('.czTop'), totals: r('#czTotals'), table: r('#czTotals .czTable'), section: r('#calzone') }; })()`);
  const pad = 20;
  await shot('mac_calzone_top.png', { x: box.section.x - pad, y: box.section.y - pad, width: box.section.width + 2 * pad, height: box.top.y + box.top.height - box.section.y + 140 });
  await shot('mac_calzone_table.png', { x: box.table.x - pad, y: box.totals.y - pad, width: box.table.width + 2 * pad, height: Math.min(1400, box.table.y + box.table.height - box.totals.y) + 2 * pad });
} finally {
  ws?.close();
  chrome.kill();
}
