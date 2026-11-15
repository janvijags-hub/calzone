// Calzone: look at a plate, see calories, vitamins and minerals.
// The camera picture goes to calzone.py on this computer. MedGemma names the foods and guesses grams;
// the person checks them; every number comes from the USDA table. Nothing is uploaded.
import { listCameras } from './sources.js';

const $ = (id) => document.getElementById(id);
const video = $('czVideo');
const still = $('czGlasses');
const state = { items: [], plate: null, stream: null, glasses: null, busy: false, timer: null };
const sex = () => $('czSex').value;
const view = () => $('czCompare').value;

// ---------- camera ----------
async function fillCameras() {
  const cams = await listCameras();
  $('czSource').innerHTML = '<option value="glasses">Meta glasses (phone relay)</option>'
    + cams.map((c, i) => `<option value="${c.deviceId}">${c.label || `Camera ${i + 1}`}</option>`).join('')
    + '<option value="off">Camera off</option>';
  $('czSource').value = 'off';
}

function stopCamera() {
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = null; video.srcObject = null;
  if (state.glasses) state.glasses.abort();
  state.glasses = null;
  video.hidden = true; still.hidden = true;
}

async function startCamera(source) {
  stopCamera();
  if (source === 'off') return say('Camera off. Pick a camera to start.');
  if (source === 'glasses') return startGlasses();
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { deviceId: { exact: source }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    video.srcObject = state.stream; video.hidden = false;
    await video.play();
    say('Point the camera at the plate, then press Scan plate.');
  } catch (e) {
    say(`Camera not available (${e.message}).`);
  }
}

function startGlasses() {
  const ctl = state.glasses = new AbortController();
  still.hidden = false;
  say('Waiting for the glasses… (HelloVitals → Glasses tab → Start)');
  (async () => {
    let id = 0, url = null;
    while (!ctl.signal.aborted) {
      try {
        const r = await fetch(`/glasses/frame?after=${id}`, { signal: ctl.signal });
        if (r.status === 200) {
          id = Number(r.headers.get('X-Frame-Id'));
          const next = URL.createObjectURL(await r.blob());
          still.src = next;
          if (url) URL.revokeObjectURL(url);
          url = next;
          if ($('czStatus').textContent.startsWith('Waiting')) say('Look at the plate, then press Scan plate.');
        } else if (r.status !== 204) await new Promise((ok) => setTimeout(ok, 1000));
      } catch {
        if (!ctl.signal.aborted) await new Promise((ok) => setTimeout(ok, 1000));
      }
    }
  })();
}

function snapshot() {
  const src = !video.hidden ? video : still;
  const w = src.videoWidth || src.naturalWidth, h = src.videoHeight || src.naturalHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, 1024 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

// ---------- scan ----------
async function scan() {
  if (state.busy) return;
  const image = snapshot();
  if (!image) return say('No picture yet. Start a camera or upload a photo.');
  await scanImage(image, false);
}

// Upload: one or more plate pictures from this Mac. With several, all their foods go on one list (one meal).
async function uploadFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, 5);
  if (!list.length) return;
  stopCamera(); $('czSource').value = 'off';
  for (let i = 0; i < list.length; i++) {
    const image = await fileToJpeg(list[i]);
    if (!image) { say(`Could not open ${list[i].name}.`); continue; }
    still.src = image; still.hidden = false;   // show the uploaded plate in the big preview
    if (list.length > 1) say(`Photo ${i + 1} of ${list.length}…`);
    await scanImage(image, i > 0);
  }
  if (list.length > 1) say(`Found ${state.items.length} foods in ${list.length} photos. Check the names and grams.`);
}

async function fileToJpeg(file) {
  try {
    const pic = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(pic.width, pic.height));
    const c = document.createElement('canvas');
    c.width = Math.round(pic.width * scale); c.height = Math.round(pic.height * scale);
    c.getContext('2d').drawImage(pic, 0, 0, c.width, c.height);
    pic.close();
    return c.toDataURL('image/jpeg', 0.85);
  } catch { return null; }
}

async function scanImage(image, append) {
  if (state.busy) return;
  state.busy = true; $('czScan').disabled = true;
  $('czShot').src = image; $('czShot').hidden = false;
  say('Looking at the plate… (the AI on this Mac takes about 5–15 seconds)');
  try {
    const r = await fetch('/calzone/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.status);
    const found = data.items.map((it) => ({ ...it, grams: it.grams || 100 }));
    state.items = append ? state.items.concat(found) : found;
    say(state.items.length
      ? `Found ${state.items.length} food${state.items.length > 1 ? 's' : ''} in ${data.seconds} s. Check the names and grams, then see the numbers below.`
      : 'No food found. Try again closer, with good light.');
    renderItems(); await update();
  } catch (e) {
    say(`Scan failed: ${e.message}`);
  } finally {
    state.busy = false; $('czScan').disabled = false;
  }
}

// ---------- the food list (check and fix) ----------
function renderItems() {
  const box = $('czItems');
  if (!state.items.length) { box.innerHTML = '<p class="note">No foods yet. Scan a plate, or add a food by name.</p>'; return; }
  box.innerHTML = state.items.map((it, i) => `
    <div class="czItem">
      <div class="czSaw">AI saw: <b>${esc(it.label)}</b></div>
      <select data-i="${i}" class="czPick">${(it.matches || []).map((m) =>
        `<option value="${m.id}" ${m.id === it.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')
        || '<option value="">No USDA match: search below</option>'}</select>
      <label class="czGrams"><input type="number" min="1" max="2000" step="5" value="${Math.round(it.grams)}" data-i="${i}"> g</label>
      <button class="link czRemove" data-i="${i}" title="Remove">✕</button>
    </div>`).join('');
  box.querySelectorAll('.czPick').forEach((s) => s.onchange = () => { state.items[s.dataset.i].id = Number(s.value); update(); });
  box.querySelectorAll('.czGrams input').forEach((n) => n.onchange = () => { state.items[n.dataset.i].grams = Number(n.value) || 0; update(); });
  box.querySelectorAll('.czRemove').forEach((b) => b.onclick = () => { state.items.splice(b.dataset.i, 1); renderItems(); update(); });
}

let searchTimer = null;
function searchFoods() {
  clearTimeout(searchTimer);
  const q = $('czAdd').value.trim();
  if (q.length < 2) { $('czAddList').innerHTML = ''; return; }
  searchTimer = setTimeout(async () => {
    const { matches } = await (await fetch(`/calzone/search?q=${encodeURIComponent(q)}`)).json();
    $('czAddList').innerHTML = matches.map((m) =>
      `<button class="czHit" data-id="${m.id}">${esc(m.name)} <small>${Math.round(m.kcal100 ?? 0)} kcal / 100 g</small></button>`).join('')
      || '<p class="note">No USDA food with that name. Try a simpler word.</p>';
    $('czAddList').querySelectorAll('.czHit').forEach((b) => b.onclick = () => {
      const m = matches.find((x) => x.id === Number(b.dataset.id));
      state.items.push({ label: q, grams: 100, id: m.id, matches: [m, ...matches.filter((x) => x.id !== m.id)] });
      $('czAdd').value = ''; $('czAddList').innerHTML = '';
      renderItems(); update();
    });
  }, 250);
}

// ---------- numbers ----------
async function update() {
  const items = state.items.filter((it) => it.id && it.grams > 0).map((it) => ({ id: it.id, grams: it.grams }));
  if (!items.length) { $('czTotals').innerHTML = ''; $('czLog').disabled = true; return; }
  const r = await fetch('/calzone/plate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, sex: sex() }) });
  state.plate = await r.json();
  $('czLog').disabled = false;
  $('czTotals').innerHTML = renderNutrients(state.plate, 'This plate');
  wireEvidence($('czTotals'));
}

function bar(t, label) {
  if (!t || t.pct === undefined) return '<td class="czNa">—</td>';
  const over = t.kind === 'max' && t.pct > 100, low = t.kind === 'goal' && t.pct < 10;
  const cls = t.kind === 'max' ? (over ? 'over' : t.pct > 40 ? 'warn' : 'ok') : (t.pct >= 100 ? 'met' : 'goal');
  return `<td><div class="czBar ${cls}" title="${label}: ${t.kind === 'max' ? 'limit' : 'daily need'} ${fmt(t.target)}">
    <span style="width:${Math.min(100, t.pct)}%"></span><em>${t.pct}%${t.kind === 'max' ? ' of limit' : ''}${low ? '' : ''}</em></div></td>`;
}

function renderNutrients(p, title) {
  const both = view() === 'both', earth = view() !== 'nasa', space = view() !== 'fda';
  const kcal = p.nutrients[0];
  let html = `<div class="czHead"><div class="czKcal"><b>${Math.round(kcal.amount)}</b> kcal<small>${title}</small></div>
    <div class="czFoods">${p.foods.map((f) => `<a href="${f.usda}" target="_blank" rel="noopener">${esc(f.name)}</a>
      <span>${Math.round(f.grams)} g · ${f.kcal} kcal</span>`).join('<br>')}</div></div>`;
  let group = '';
  html += `<table class="czTable"><thead><tr><th>Nutrient</th><th>Amount</th>${earth ? '<th>Earth daily need (FDA)</th>' : ''}${space ? `<th>Space need (NASA, ${sex() === 'female' ? 'woman' : 'man'})</th>` : ''}<th></th></tr></thead><tbody>`;
  for (const n of p.nutrients) {
    if (n.group !== group) { group = n.group; html += `<tr class="czGroup"><td colspan="5">${groupName(group)}</td></tr>`; }
    const note = n.nasa?.note ? `<div class="czNote">${esc(n.nasa.note)}</div>` : '';
    html += `<tr><td>${n.label}${note}</td><td class="czAmt">${fmt(n.amount)} ${n.unit}</td>
      ${earth ? bar(n.fda, 'FDA') : ''}${space ? bar(n.nasa, 'NASA') : ''}
      <td><button class="link czEv" data-k="${n.key}" title="Research papers">papers</button></td></tr>
      <tr class="czEvRow" id="ev-${n.key}" hidden><td colspan="5"></td></tr>`;
  }
  html += '</tbody></table>';
  html += `<p class="note">${tips(p).map(esc).join(' ')}</p>`;
  html += `<p class="note">Numbers: ${esc(p.usda)} Some foods have no value for a nutrient; those count as 0.
    Targets: <a href="${p.sources[0].url}" target="_blank" rel="noopener">${esc(p.sources[0].name)}</a> ·
    <a href="${p.sources[1].url}" target="_blank" rel="noopener">${esc(p.sources[1].name)}</a>.</p>`;
  void both;
  return html;
}

function groupName(g) {
  return { Energy: 'Energy and building blocks', Limit: 'Keep these low', Vitamins: 'Vitamins', Minerals: 'Minerals' }[g] || g;
}

// Short, plain notes from the numbers (no AI here).
function tips(p) {
  const by = Object.fromEntries(p.nutrients.map((n) => [n.key, n]));
  const out = [];
  const high = p.nutrients.filter((n) => n.fda?.kind === 'max' && n.fda.pct >= 40).map((n) => n.label.toLowerCase());
  if (high.length) out.push(`High for one plate: ${high.join(', ')} (40% or more of a whole day's limit).`);
  const good = p.nutrients.filter((n) => n.fda?.kind === 'goal' && n.fda.pct >= 30 && n.key !== 'kcal').map((n) => n.label);
  if (good.length) out.push(`Good source of: ${good.join(', ')}.`);
  if (by.vit_d_ug && (by.vit_d_ug.nasa?.pct ?? 0) < 10) out.push('Little vitamin D. In space there is no sunlight, so crews take it as a supplement.');
  if (by.iron_mg?.nasa?.pct > 100) out.push('Over NASA\'s iron limit for space, where iron builds up in the body.');
  return out;
}

function wireEvidence(root) {
  root.querySelectorAll('.czEv').forEach((b) => b.onclick = async () => {
    const row = $(`ev-${b.dataset.k}`);
    row.hidden = !row.hidden;
    if (row.hidden || row.dataset.done) return;
    row.firstElementChild.textContent = 'Searching Google Scholar…';
    try {
      const d = await (await fetch(`/calzone/evidence?nutrient=${b.dataset.k}`)).json();
      row.firstElementChild.innerHTML = d.papers?.length
        ? d.papers.map((x) => `<div class="czPaper"><a href="${x.link}" target="_blank" rel="noopener">${esc(x.title)}</a>
            <small>${esc(x.info)}</small><div>“${esc(x.snippet)}”</div></div>`).join('') + `<small>${esc(d.source || '')}: “${esc(d.query || '')}”</small>`
        : esc(d.note || d.error || 'No papers found.');
      row.dataset.done = '1';
    } catch (e) { row.firstElementChild.textContent = `Search failed: ${e.message}`; }
  });
}

// ---------- today's log ----------
async function logPlate() {
  const items = state.items.filter((it) => it.id && it.grams > 0).map((it) => ({ id: it.id, grams: it.grams }));
  await fetch('/calzone/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, label: $('czMeal').value }) });
  say('Added to today.');
  showToday();
}

async function showToday() {
  const d = await (await fetch(`/calzone/today?sex=${sex()}`)).json();
  if (!d.plates?.length) { $('czToday').innerHTML = '<p class="note">Nothing logged today yet.</p>'; return; }
  $('czToday').innerHTML = `<p class="note">${d.plates.map((p) => `${esc(p.label)} ${p.at}: ${Math.round(p.kcal)} kcal`).join(' · ')}</p>`
    + renderNutrients(d, `Today (${d.date})`);
  wireEvidence($('czToday'));
}

// ---------- helpers ----------
function say(text) { $('czStatus').textContent = text; }
function fmt(x) { return x >= 100 ? Math.round(x).toLocaleString() : x >= 10 ? x.toFixed(1).replace(/\.0$/, '') : String(+x.toFixed(2)); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- start ----------
$('czSource').onchange = () => startCamera($('czSource').value);
$('czScan').onclick = scan;
$('czFile').onchange = async () => { await uploadFiles($('czFile').files); $('czFile').value = ''; };
// Drop pictures anywhere on the Calzone section.
$('calzone').addEventListener('dragover', (e) => e.preventDefault());
$('calzone').addEventListener('drop', (e) => { e.preventDefault(); uploadFiles(e.dataTransfer.files); });
$('czAuto').onchange = () => {
  clearInterval(state.timer);
  if ($('czAuto').checked) state.timer = setInterval(scan, 20000);
};
$('czAdd').oninput = searchFoods;
$('czSex').onchange = () => { update(); showToday(); };
$('czCompare').onchange = () => { update(); showToday(); };
$('czLog').onclick = logPlate;
$('czClear').onclick = async () => { await fetch('/calzone/clear', { method: 'POST' }); showToday(); };
fillCameras();
renderItems();
showToday();
