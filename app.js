// Foldr: every tool runs in the browser. Libraries are lazy-loaded from jsDelivr only when a tool needs them.
const $ = (s, r = document) => r.querySelector(s);
const h = (t, a = {}, ...c) => {
  const e = document.createElement(t);
  for (const k in a) { const v = a[k]; if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else e.setAttribute(k, v); }
  e.append(...c.flat().filter(x => x != null && x !== false)); return e;
};
class U extends Error {} // user-facing error

// ---------- settings, theme, sound ----------
let S = { theme: 'system', sfx: false, vol: .3, rm: false };
try { Object.assign(S, JSON.parse(localStorage.getItem('prefs') || '{}')); } catch {}
const save = () => { try { localStorage.setItem('prefs', JSON.stringify(S)); } catch {} document.documentElement.dataset.theme = S.theme; document.documentElement.dataset.rm = S.rm; };
let touched = false, ac;
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => touched = true, { once: true });
const sfx = (f = 600, d = .08) => { // soft, short UI blip; silent until enabled AND the user has interacted
  if (!S.sfx || !touched || S.vol <= 0) return;
  ac ??= new AudioContext(); const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.value = f; g.gain.value = S.vol * .15; g.gain.exponentialRampToValueAtTime(1e-4, ac.currentTime + d);
  o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
};
const toast = m => { const t = h('div', { class: 'toast', role: 'status' }, m); document.body.append(t); setTimeout(() => t.remove(), 2000); };

// ---------- lazy libraries ----------
const CDN = 'https://cdn.jsdelivr.net/npm/';
const lib = {
  pdf: () => import(CDN + 'pdf-lib@1.17.1/+esm'),
  zip: () => import(CDN + 'jszip@3.10.1/+esm').then(m => m.default),
  pdfjs: async () => { const m = await import(CDN + 'pdfjs-dist@4.4.168/build/pdf.min.mjs');
    const w = await fetch(CDN + 'pdfjs-dist@4.4.168/build/pdf.worker.min.mjs').then(r => r.blob());
    m.GlobalWorkerOptions.workerSrc = URL.createObjectURL(w); return m; },
};

// ---------- helpers ----------
const fmt = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.ceil(n / 1e3) + ' KB';
const base = f => f.name.replace(/\.[^.]+$/, '');
const dl = (blob, name) => { const u = URL.createObjectURL(blob); return [u, name]; };
const pages = (s, n) => { if (!s?.trim()) return [...Array(n).keys()]; const o = [];
  for (const p of s.split(',')) { const [a, b = a] = p.trim().split('-').map(Number);
    if (!(a >= 1 && b <= n && a <= b)) throw new U(`"${p.trim()}" is not a valid page range. This PDF has ${n} pages.`);
    for (let i = a; i <= b; i++) o.push(i - 1); } return o; };
const need = (s, what = 'pages') => { if (!s?.trim()) throw new U(`Enter the ${what} to use, for example 1-3,5.`); };
const M = [['l', 'Left %'], ['t', 'Top %'], ['r', 'Right %'], ['b', 'Bottom %']].map(([k, l]) => ({ k, l, t: 'number', v: 0, min: 0, max: 90 }));
const PG = { k: 'p', l: 'Pages (blank = all)', ph: '1-3,5' };

// ---------- image engine (Canvas) ----------
const bmp = async f => { try { return await createImageBitmap(f); } catch { throw new U('This image could not be read. Please try another file.'); } };
const cv = (w, hh) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hh));
  if (c.width * c.height > 2.6e8 || c.width > 32000 || c.height > 32000) throw new U('The result is too large for your browser. Choose a smaller size.'); return c; };
const out = (c, f, suf) => new Promise((res, rej) => { const jpg = f.type === 'image/jpeg';
  c.toBlob(b => b ? res({ name: base(f) + suf + (jpg ? '.jpg' : '.png'), blob: b }) : rej(new U('The result is too large to export.')), jpg ? 'image/jpeg' : 'image/png', .92); });
const img = (id, name, desc, icon, fields, fn) => ({ id, cat: 'image', icon, name, desc, accept: 'image/*', fields,
  run: async (f, v) => { const b = await bmp(f[0]); return [await out(await fn(b, v), f[0], '-' + id)]; } });
const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const m = Math.max(r, g, b), n = Math.min(r, g, b), d = m - n, l = (m + n) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let x = !d ? 0 : m === r ? ((g - b) / d) % 6 : m === g ? (b - r) / d + 2 : (r - g) / d + 4; return `hsl(${Math.round((x * 60 + 360) % 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`; };

// ---------- video engine (MediaRecorder; exports WebM in real time) ----------
async function vid(f, v, c) {
  const el = h('video', { playsinline: '', preload: 'auto' }); el.src = URL.createObjectURL(f);
  await new Promise((ok, no) => { el.onloadedmetadata = ok; el.onerror = () => no(new U('Your browser cannot read this video. Try an MP4 or WebM file.')); });
  const d = el.duration, s = v.s || 0, e = Math.min(v.e || d, d);
  if (!(s < e)) throw new U('The end time must be after the start time.');
  const [L, T, R, B] = [v.l || 0, v.t || 0, v.r || 0, v.b || 0];
  if (L + R > 95 || T + B > 95) throw new U('The crop leaves almost nothing of the video.');
  const W = Math.floor(el.videoWidth * (100 - L - R) / 200) * 2, H = Math.floor(el.videoHeight * (100 - T - B) / 200) * 2;
  const mt = ['video/webm;codecs=vp9,opus', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mt) throw new U('Your browser cannot export video. Try a recent Chrome, Edge or Firefox.');
  const cn = h('canvas', { width: W, height: H }), g = cn.getContext('2d'), st = cn.captureStream(30);
  try { (el.captureStream || el.mozCaptureStream).call(el).getAudioTracks().forEach(t => st.addTrack(t)); } catch {}
  const rec = new MediaRecorder(st, { mimeType: mt }), ch = []; rec.ondataavailable = x => ch.push(x.data);
  const stopped = new Promise(r => rec.onstop = r);
  el.currentTime = s; await new Promise(r => el.onseeked = r); rec.start(500); await el.play();
  await new Promise(res => { const tick = () => { g.drawImage(el, el.videoWidth * L / 100, el.videoHeight * T / 100, W, H, 0, 0, W, H);
    c.progress((el.currentTime - s) / (e - s)); if (el.currentTime >= e || el.ended) { el.pause(); res(); } else requestAnimationFrame(tick); }; tick(); });
  rec.stop(); await stopped; URL.revokeObjectURL(el.src);
  return [{ name: base(f) + '-edited.webm', blob: new Blob(ch, { type: 'video/webm' }) }];
}

// ---------- PDF engine (pdf-lib) ----------
const ld = async (P, f) => { try { return await P.load(await f.arrayBuffer()); }
  catch (e) { throw new U(/encrypt/i.test(e.message) ? 'This PDF is password-protected and cannot be edited here.' : 'This PDF looks invalid or corrupted. Please try another file.'); } };
const sv = async (d, n) => ({ name: n, blob: new Blob([await d.save()], { type: 'application/pdf' }) });
const sub = async (P, f, idx) => { const s = await ld(P, f), d = await P.create(); (await d.copyPages(s, idx)).forEach(p => d.addPage(p)); return d; };
const pdf = (id, name, desc, icon, fields, fn, o = {}) => ({ id, cat: 'pdf', icon, name, desc, accept: 'application/pdf', fields, ...o,
  run: async (fs, v, c) => fn(await lib.pdf(), fs, v, c) });
const inPlace = (fn) => async (L, fs, v) => { const d = await ld(L.PDFDocument, fs[0]); fn(d, pages(v.p, d.getPageCount()), v, L); return [await sv(d, base(fs[0]) + '-edited.pdf')]; };
const SIZES = { a4: [595.28, 841.89], a3: [841.89, 1190.55], letter: [612, 792], legal: [612, 1008] };

// ---------- tool registry ----------
const T = [
  { id: 'crop-video', cat: 'video', icon: '🎬', name: 'Crop Video', desc: 'Cut away the edges of a video.', accept: 'video/*', fields: M, run: (f, v, c) => vid(f[0], v, c) },
  { id: 'trim-video', cat: 'video', icon: '✂️', name: 'Trim Video', desc: 'Keep only the part of a video you need.', accept: 'video/*', kw: 'cut clip',
    fields: [{ k: 's', l: 'Start (seconds)', t: 'number', v: 0, min: 0 }, { k: 'e', l: 'End (seconds, blank = end)', t: 'number', min: 0 }], run: (f, v, c) => vid(f[0], v, c) },
  img('resize-image', 'Resize Image', 'Change the width and height of an image.', '📐', [
    { k: 'pre', l: 'Preset', o: [['', 'Custom'], ['1920x1080', '1920 × 1080'], ['1280x720', '1280 × 720'], ['1080x1080', '1080 × 1080'], ['512x512', '512 × 512']] },
    { k: 'w', l: 'Width (px)', t: 'number', min: 1 }, { k: 'h', l: 'Height (px)', t: 'number', min: 1 }, { k: 'lock', l: 'Lock aspect ratio', t: 'checkbox', v: true }],
    (b, v) => { let w = v.w || b.width, hh = v.h || b.height; if (v.pre) [w, hh] = v.pre.split('x').map(Number);
      else if (v.lock) { if (v.w) hh = b.height * w / b.width; else if (v.h) w = b.width * hh / b.height; }
      const c = cv(w, hh); c.getContext('2d').drawImage(b, 0, 0, c.width, c.height); return c; }),
  img('crop-image', 'Crop Image', 'Trim an image by percentage from each edge.', '🔲', M, (b, v) => {
    const x = b.width * v.l / 100, y = b.height * v.t / 100, w = b.width * (1 - (v.l + v.r) / 100), hh = b.height * (1 - (v.t + v.b) / 100);
    if (w < 1 || hh < 1) throw new U('The crop leaves nothing of the image.'); const c = cv(w, hh); c.getContext('2d').drawImage(b, x, y, w, hh, 0, 0, c.width, c.height); return c; }),
  { id: 'color-picker', cat: 'image', icon: '🎨', name: 'Color Picker', desc: 'Click any pixel to get its HEX, RGB and HSL.', accept: 'image/*', kw: 'eyedropper colour',
    view: async (f, box) => { const b = await bmp(f), c = h('canvas', { width: b.width, height: b.height, class: 'pick' }), g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(b, 0, 0); const sw = h('div', { class: 'sw' }), info = h('div', { role: 'status' }, h('p', {}, 'Click the image to pick a color.'));
      c.onclick = e => { const r = c.getBoundingClientRect(), [R, G, B] = g.getImageData(Math.floor((e.clientX - r.left) * c.width / r.width), Math.floor((e.clientY - r.top) * c.height / r.height), 1, 1).data;
        const hex = '#' + [R, G, B].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase(); sw.style.background = hex; sfx(700);
        info.replaceChildren(...[hex, `rgb(${R}, ${G}, ${B})`, hsl(R, G, B)].map(t => h('div', { class: 'row' }, h('code', {}, t), h('button', { class: 'btn sm', onclick: () => navigator.clipboard.writeText(t).then(() => toast('Copied ' + t)) }, 'Copy')))); };
      box.append(c, sw, info); } },
  img('rotate-image', 'Rotate Image', 'Rotate by 90°, 180° or any angle.', '🔄', [
    { k: 'a', l: 'Rotation', o: [['90', '90° right'], ['-90', '90° left'], ['180', '180°'], ['0', 'Custom only']] }, { k: 'x', l: 'Extra angle (°)', t: 'number', v: 0 }],
    (b, v) => { const a = (+v.a + (v.x || 0)) * Math.PI / 180, s = Math.abs(Math.sin(a)), co = Math.abs(Math.cos(a)), c = cv(b.width * co + b.height * s, b.width * s + b.height * co), g = c.getContext('2d');
      g.translate(c.width / 2, c.height / 2); g.rotate(a); g.drawImage(b, -b.width / 2, -b.height / 2); return c; }),
  img('flip-image', 'Flip Image', 'Mirror an image horizontally or vertically.', '↔️', [{ k: 'd', l: 'Direction', o: [['h', 'Horizontal'], ['v', 'Vertical'], ['b', 'Both']] }],
    (b, v) => { const c = cv(b.width, b.height), g = c.getContext('2d'); g.translate(v.d !== 'v' ? b.width : 0, v.d !== 'h' ? b.height : 0);
      g.scale(v.d !== 'v' ? -1 : 1, v.d !== 'h' ? -1 : 1); g.drawImage(b, 0, 0); return c; }),
  img('image-enlarger', 'Image Enlarger', 'Upscale an image 2×, 4× or 8× with smooth resampling.', '🔍', [{ k: 'x', l: 'Scale', o: [['2', '2×'], ['4', '4×'], ['8', '8×']] }],
    (b, v) => { const c = cv(b.width * v.x, b.height * v.x), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(b, 0, 0, c.width, c.height); return c; }),

  pdf('pdf-merge', 'PDF Merge', 'Combine several PDFs into one.', '🧩', [], async (L, fs) => { const d = await L.PDFDocument.create();
    for (const f of fs) { const s = await ld(L.PDFDocument, f); (await d.copyPages(s, s.getPageIndices())).forEach(p => d.addPage(p)); }
    return [await sv(d, 'merged.pdf')]; }, { multi: true, min: 2, kw: 'combine join' }),
  pdf('pdf-split', 'PDF Split', 'Split a PDF into several files.', '✂️', [{ k: 'r', l: 'Ranges (blank = every page)', ph: '1-3,4,5-8' }], async (L, fs, v) => {
    const n = (await ld(L.PDFDocument, fs[0])).getPageCount(), gs = v.r?.trim() ? v.r.split(',').map(g => pages(g, n)) : [...Array(n).keys()].map(i => [i]);
    return Promise.all(gs.map(async (g, i) => sv(await sub(L.PDFDocument, fs[0], g), `${base(fs[0])}-part${i + 1}.pdf`))); }),
  pdf('pdf-page-remover', 'PDF Page Remover', 'Delete pages from a PDF.', '🗑️', [{ ...PG, l: 'Pages to delete', ph: '2,4-5' }], async (L, fs, v) => {
    need(v.p, 'pages to delete'); const n = (await ld(L.PDFDocument, fs[0])).getPageCount(), del = new Set(pages(v.p, n)), keep = [...Array(n).keys()].filter(i => !del.has(i));
    if (!keep.length) throw new U('You cannot delete every page.'); return [await sv(await sub(L.PDFDocument, fs[0], keep), base(fs[0]) + '-trimmed.pdf')]; }),
  pdf('extract-pages', 'Extract Pages from PDF', 'Pull selected pages into a new PDF.', '📑', [{ ...PG, l: 'Pages to extract', ph: '1-3,7' }], async (L, fs, v) => {
    need(v.p, 'pages to extract'); const n = (await ld(L.PDFDocument, fs[0])).getPageCount(); return [await sv(await sub(L.PDFDocument, fs[0], pages(v.p, n)), base(fs[0]) + '-extract.pdf')]; }),
  pdf('rotate-pdf', 'Rotate PDF', 'Rotate all or some pages of a PDF.', '🔄', [{ k: 'a', l: 'Rotation', o: [['90', '90° right'], ['180', '180°'], ['270', '90° left']] }, PG],
    inPlace((d, sel, v, L) => sel.forEach(i => { const p = d.getPage(i); p.setRotation(L.degrees((p.getRotation().angle + +v.a) % 360)); }))),
  pdf('organize-pdf', 'Organize PDF', 'Reorder, duplicate or drop pages by writing the new order.', '🗂️', [{ k: 'p', l: 'New page order', ph: '3,1,2,2 (omitted pages are removed)' }], async (L, fs, v) => {
    need(v.p, 'new page order'); const n = (await ld(L.PDFDocument, fs[0])).getPageCount(); return [await sv(await sub(L.PDFDocument, fs[0], pages(v.p, n)), base(fs[0]) + '-organized.pdf')]; }),
  pdf('resize-pdf', 'Resize PDF', 'Change the page size, scaling content to fit.', '📏', [
    { k: 'z', l: 'Page size', o: [['a4', 'A4'], ['a3', 'A3'], ['letter', 'Letter'], ['legal', 'Legal'], ['c', 'Custom']] }, { k: 'w', l: 'Custom width (pt)', t: 'number', min: 50 }, { k: 'hh', l: 'Custom height (pt)', t: 'number', min: 50 }, PG],
    inPlace((d, sel, v) => { const [W, H] = v.z === 'c' ? [v.w, v.hh] : SIZES[v.z]; if (!W || !H) throw new U('Enter a custom width and height.');
      sel.forEach(i => { const p = d.getPage(i), { width: ow, height: oh } = p.getSize(), s = Math.min(W / ow, H / oh); p.scaleContent(s, s); p.translateContent((W - ow * s) / 2, (H - oh * s) / 2); p.setSize(W, H); }); })),
  pdf('crop-pdf', 'Crop PDF', 'Trim margins from PDF pages.', '🔲', [...M, PG],
    inPlace((d, sel, v) => sel.forEach(i => { const p = d.getPage(i), { width: w, height: hh } = p.getSize(), x = w * v.l / 100, y = hh * v.b / 100, cw = w * (1 - (v.l + v.r) / 100), ch = hh * (1 - (v.t + v.b) / 100);
      if (cw < 10 || ch < 10) throw new U('The crop leaves nothing of the page.'); p.setCropBox(x, y, cw, ch); p.setMediaBox(x, y, cw, ch); }))),
  pdf('flatten-pdf', 'Flatten PDF', 'Turn form fields into fixed page content.', '🧱', [], async (L, fs) => { const d = await ld(L.PDFDocument, fs[0]); d.getForm().flatten(); return [await sv(d, base(fs[0]) + '-flattened.pdf')]; }),
  { id: 'pdf-reader', cat: 'pdf', icon: '📖', name: 'PDF Reader', desc: 'Read PDFs with zoom, search and fullscreen.', accept: 'application/pdf', kw: 'view open',
    view: async (f, box) => { const j = await lib.pdfjs(); let doc; try { doc = await j.getDocument({ data: await f.arrayBuffer() }).promise; } catch { throw new U('This PDF could not be opened. It may be corrupted or password-protected.'); }
      let n = 1, z = 1.2; const N = doc.numPages, cn = h('canvas'), wrap = h('div', { class: 'scroll' }, cn), res = h('span', { role: 'status' }),
        inp = h('input', { type: 'number', min: 1, max: N, value: 1, 'aria-label': 'Page number' }), q = h('input', { type: 'search', placeholder: 'Search text', 'aria-label': 'Search in PDF' });
      const draw = async () => { const p = await doc.getPage(n), r = devicePixelRatio, vp = p.getViewport({ scale: z * r }); cn.width = vp.width; cn.height = vp.height; cn.style.width = vp.width / r + 'px';
        cn.style.maxWidth = 'none'; await p.render({ canvasContext: cn.getContext('2d'), viewport: vp }).promise; inp.value = n; wrap.scrollTop = 0; };
      const go = i => { n = Math.min(N, Math.max(1, i || 1)); draw(); }, zoom = d => { z = Math.min(4, Math.max(.3, z + d)); draw(); };
      const b = (t, l, fn) => h('button', { class: 'btn sm', 'aria-label': l, onclick: fn }, t);
      inp.onchange = () => go(+inp.value);
      q.onchange = async () => { const k = q.value.toLowerCase(); if (!k) return; for (let i = 0; i < N; i++) { const pg = (n + i) % N + 1, tx = (await (await doc.getPage(pg)).getTextContent()).items.map(x => x.str).join(' ').toLowerCase();
        if (tx.includes(k)) { go(pg); res.textContent = `Found on page ${pg}`; return; } } res.textContent = 'No match found'; };
      const fit = async () => { const p = await doc.getPage(n); z = (wrap.clientWidth - 24) / p.getViewport({ scale: 1 }).width; draw(); };
      const [u] = dl(f); box.append(h('div', { class: 'bar' }, b('‹', 'Previous page', () => go(n - 1)), inp, h('span', {}, '/ ' + N), b('›', 'Next page', () => go(n + 1)), b('−', 'Zoom out', () => zoom(-.2)), b('+', 'Zoom in', () => zoom(.2)),
        b('Fit', 'Fit to width', fit), b('Fullscreen', 'Fullscreen', () => wrap.requestFullscreen?.()), h('a', { class: 'btn sm', href: u, download: f.name }, 'Download'), q, res), wrap); fit(); } },
];

// ---------- UI ----------
const CATS = { video: ['🎬', 'Video Tools'], image: ['🖼️', 'Image Tools'], pdf: ['📄', 'PDF Tools'] };
const app = $('#app'), dlg = $('#dlg');
const recent = () => { try { return JSON.parse(localStorage.getItem('recent') || '[]'); } catch { return []; } };
const card = t => h('a', { class: 'card', href: '#/t/' + t.id }, h('span', { class: 'ic', 'aria-hidden': 'true' }, t.icon), h('b', {}, t.name), h('small', {}, t.desc));
const grid = ts => h('div', { class: 'grid' }, ts.map(card));
const openDlg = (...c) => { dlg.replaceChildren(...c); dlg.showModal(); sfx(520); };
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => sfx(420));

function toolPage(t) {
  let files = [], urls = []; const root = h('section', { class: 'tool' }, h('div', { class: 'th' }, h('h1', {}, t.icon + ' ' + t.name), h('p', {}, t.desc)));
  const body = h('div'), msg = h('div', { class: 'err', role: 'alert', hidden: '' }); root.append(body, msg);
  const err = m => { msg.textContent = m || ''; msg.hidden = !m; if (m) sfx(200, .15); };
  const reset = () => { urls.forEach(URL.revokeObjectURL); urls = []; files = []; err(''); render(); };
  const okType = f => t.accept === 'application/pdf' ? f.type === 'application/pdf' || /\.pdf$/i.test(f.name) : f.type.startsWith(t.accept.slice(0, -1));
  const add = async l => { err(''); const max = t.cat === 'video' ? 5e8 : 1.5e8;
    for (const f of l) { if (!okType(f)) return err(`"${f.name}" is not a supported file. Please choose ${t.accept.split('/')[0] === 'application' ? 'a PDF' : 'an ' + t.accept.split('/')[0]} file.`);
      if (f.size > max) return err(`"${f.name}" is too large (limit ${fmt(max)}).`); if (!f.size) return err(`"${f.name}" is empty.`); }
    files = t.multi ? [...files, ...l] : [l[0]]; sfx(660); render(); };
  const fld = f => h('label', { class: 'fld' }, h('span', {}, f.l), f.o ? h('select', { 'data-k': f.k }, f.o.map(([v, l]) => h('option', { value: v }, l)))
    : h('input', { 'data-k': f.k, type: f.t || 'text', value: f.v, min: f.min, max: f.max, placeholder: f.ph, checked: f.t === 'checkbox' && f.v }));
  const opts = () => { const v = {}; root.querySelectorAll('[data-k]').forEach(i => v[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? (i.value === '' ? undefined : +i.value) : i.value); return v; };

  function drop() {
    const inp = h('input', { type: 'file', accept: t.accept, multiple: t.multi ? '' : null, onchange: () => inp.files.length && add([...inp.files]) });
    const z = h('label', { class: 'drop', tabindex: '0', role: 'button', onkeydown: e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), inp.click()),
      ondragover: e => { e.preventDefault(); if (!z.classList.contains('over')) { z.classList.add('over'); sfx(480, .05); } }, ondragleave: () => z.classList.remove('over'),
      ondrop: e => { e.preventDefault(); z.classList.remove('over'); e.dataTransfer.files.length && add([...e.dataTransfer.files]); } },
      h('b', {}, 'Drag & drop ' + (t.multi ? 'files' : 'a file') + ' here'), h('span', {}, 'or'), h('span', { class: 'btn primary' }, 'Choose ' + (t.multi ? 'files' : 'file')),
      h('small', {}, 'Processed on your device. Nothing is uploaded.'), inp);
    return z;
  }
  function list() {
    const preview = !t.multi && (files[0].type.startsWith('image/') ? h('img', { class: 'prev', alt: 'Preview of ' + files[0].name }) : files[0].type.startsWith('video/') ? h('video', { class: 'prev', controls: '' }) : null);
    if (preview) { const u = URL.createObjectURL(files[0]); urls.push(u); preview.src = u; }
    const mv = (i, d) => { [files[i], files[i + d]] = [files[i + d], files[i]]; render(); };
    return h('div', {}, preview, h('ul', { class: 'files' }, files.map((f, i) => h('li', {}, h('span', { class: 'n' }, f.name), h('small', {}, fmt(f.size)),
      t.multi && h('button', { class: 'btn sm', 'aria-label': 'Move up', disabled: i ? null : '', onclick: () => mv(i, -1) }, '↑'),
      t.multi && h('button', { class: 'btn sm', 'aria-label': 'Move down', disabled: i < files.length - 1 ? null : '', onclick: () => mv(i, 1) }, '↓'),
      h('button', { class: 'btn sm', 'aria-label': 'Remove ' + f.name, onclick: () => { files.splice(i, 1); render(); } }, '✕')))));
  }
  async function go(btn) {
    err(''); const v = opts(), prog = h('progress', { max: 1, 'aria-label': 'Processing progress' }), st = h('p', { role: 'status' }, 'Processing… keep this tab open.');
    btn.disabled = true; btn.after(h('div', { class: 'panel' }, st, prog)); sfx(500);
    try { const o = await t.run(files, v, { progress: p => prog.value = Math.min(1, p) }); sfx(820, .15); done(o); }
    catch (e) { console.error(e); btn.disabled = false; btn.nextSibling?.remove(); err(e instanceof U ? e.message : 'Something went wrong while processing this file. Please try another file.'); }
  }
  async function done(o) {
    urls.forEach(URL.revokeObjectURL); urls = o.map(x => URL.createObjectURL(x.blob));
    const r = recent().filter(x => x !== t.id); try { localStorage.setItem('recent', JSON.stringify([t.id, ...r].slice(0, 6))); } catch {}
    const links = o.map((x, i) => h('a', { class: 'btn primary', href: urls[i], download: x.name, onclick: () => sfx(740) }, 'Download' + (o.length > 1 ? ' ' + x.name : '')));
    if (o.length > 1) links.unshift(h('button', { class: 'btn primary', onclick: async () => { const z = new (await lib.zip())(); o.forEach(x => z.file(x.name, x.blob)); const b = await z.generateAsync({ type: 'blob' });
      const u = URL.createObjectURL(b); urls.push(u); h('a', { href: u, download: 'foldr-files.zip' }).click(); } }, 'Download all (ZIP)'));
    body.replaceChildren(h('div', { class: 'panel ok' }, h('div', { class: 'tick', 'aria-hidden': 'true' }, '✓'), h('h2', {}, 'Done!'), h('p', {}, 'Your file is ready.'),
      h('div', { class: 'acts' }, links), h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: reset }, 'Process another file'))));
  }
  function render() {
    if (!files.length) return body.replaceChildren(drop(), h('p', { style: 'text-align:center;color:var(--mut)' }, 'Supported: ' + ({ 'video/*': 'MP4, MOV, WEBM', 'image/*': 'JPG, PNG, WEBP, GIF', 'application/pdf': 'PDF' })[t.accept]));
    if (t.view) { const box = h('div', { class: 'panel' }); body.replaceChildren(h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: reset }, 'Choose another file')), box);
      t.view(files[0], box).catch(e => { console.error(e); err(e instanceof U ? e.message : 'Something went wrong while opening this file.'); }); return; }
    const btn = h('button', { class: 'btn primary', onclick: () => files.length < (t.min || 1) ? err(`Add at least ${t.min} files.`) : go(btn) }, t.name.replace(/^(\w+) /, '$1 → ').split(' → ')[0] === 'PDF' ? 'Process' : 'Apply');
    body.replaceChildren(h('div', { class: 'panel' }, list(), t.multi && h('div', { class: 'acts' }, h('label', { class: 'btn sm' }, 'Add more', h('input', { type: 'file', hidden: '', multiple: '', accept: t.accept, onchange: e => add([...e.target.files]) }))),
      h('div', { class: 'opts' }, t.fields.map(fld)), h('div', { class: 'acts' }, btn, h('button', { class: 'btn', onclick: reset }, 'Remove files'))));
  }
  render(); return root;
}

function home() {
  const q = h('input', { class: 'bigsearch', type: 'search', placeholder: 'Search tools: merge, rotate, crop…', 'aria-label': 'Search tools', onfocus: e => { e.target.blur(); search(); } });
  const r = recent().map(id => T.find(t => t.id === id)).filter(Boolean);
  return h('div', {}, h('div', { class: 'hero' }, h('h1', {}, 'All your file tools, in one place.'),
    h('p', {}, 'Compress, edit, convert, organize and transform your files directly in your browser. Nothing is uploaded.'), q),
    r.length ? h('div', {}, h('h2', {}, 'Recently used'), grid(r)) : null,
    h('h2', {}, 'Popular tools'), grid(['pdf-merge', 'trim-video', 'resize-image', 'pdf-split', 'color-picker', 'pdf-reader'].map(id => T.find(t => t.id === id))),
    Object.entries(CATS).map(([k, [i, n]]) => h('div', {}, h('h2', {}, i + ' ' + n), grid(T.filter(t => t.cat === k)))));
}

function search() {
  const inp = h('input', { type: 'search', placeholder: 'Search tools…', 'aria-label': 'Search tools' }), list = h('div', { class: 'res' });
  const upd = () => { const q = inp.value.toLowerCase().trim(); const r = T.filter(t => !q || [t.name, t.desc, t.kw, t.cat].join(' ').toLowerCase().includes(q));
    list.replaceChildren(...(r.length ? r.map(card) : [h('p', {}, 'No tools match. Try “merge”, “crop” or “rotate”.')])); };
  inp.oninput = upd; inp.onkeydown = e => e.key === 'Enter' && list.firstElementChild?.click(); upd(); openDlg(inp, list); inp.focus();
}
function settings() {
  const set = (k, v) => { S[k] = v; save(); sfx(600); };
  openDlg(h('h2', {}, 'Settings'),
    h('label', { class: 'fld' }, 'Theme', h('select', { onchange: e => set('theme', e.target.value) }, ['system', 'light', 'dark'].map(v => h('option', { value: v, selected: S.theme === v ? '' : null }, v[0].toUpperCase() + v.slice(1))))),
    h('label', { class: 'row' }, 'Sound effects', h('input', { type: 'checkbox', checked: S.sfx, onchange: e => set('sfx', e.target.checked) })),
    h('label', { class: 'fld' }, 'Volume', h('input', { type: 'range', min: 0, max: 1, step: .05, value: S.vol, onchange: e => set('vol', +e.target.value) })),
    h('label', { class: 'row' }, 'Reduced motion', h('input', { type: 'checkbox', checked: S.rm, onchange: e => set('rm', e.target.checked) })),
    h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Close')));
}

function route() {
  const [, k, id] = location.hash.split('/'); dlg.open && dlg.close(); const t = k === 't' && T.find(x => x.id === id);
  app.replaceChildren(t ? toolPage(t) : CATS[k] ? h('div', {}, h('h1', {}, CATS[k].join(' ')), grid(T.filter(x => x.cat === k))) : home());
  document.title = (t ? t.name + ' — ' : '') + 'Foldr'; scrollTo(0, 0);
  $('#nav').replaceChildren(h('a', { href: '#/', class: !k ? 'on' : '' }, 'Home'), ...Object.entries(CATS).map(([c, [, n]]) => h('a', { href: '#/' + c, class: k === c || t?.cat === c ? 'on' : '' }, n)));
}
addEventListener('hashchange', route);
$('#sbtn').onclick = search; $('#setbtn').onclick = settings;
$('#tbtn').onclick = () => { S.theme = document.documentElement.dataset.theme === 'dark' || (S.theme === 'system' && matchMedia('(prefers-color-scheme:dark)').matches) ? 'light' : 'dark'; save(); sfx(600); };
addEventListener('keydown', e => { const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' || (e.key === '/' && !typing)) { e.preventDefault(); search(); } });
save(); route();
