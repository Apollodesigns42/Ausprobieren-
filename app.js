(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const KEY = 'apollo-werkbank-v1';
  const TABS = ['farben', 'verlauf', 'schrift', 'generator', 'prompt', 'sammlung'];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

  /* ───────── Farbrechnung (OKLCH ↔ sRGB) ───────── */
  const gam = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  function oklchToLin(L, C, h) {
    const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  }
  const rgbHex = (rgb) => '#' + rgb.map((v) => Math.round(clamp(gam(clamp(v))) * 255).toString(16).padStart(2, '0')).join('');
  function toHex(L, C, h) {
    let c = C;
    for (let i = 0; i < 40; i++) {
      const rgb = oklchToLin(L, c, h);
      if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) return rgbHex(rgb);
      c *= 0.93;
    }
    return rgbHex(oklchToLin(L, 0, h));
  }
  const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  function hexToOklch(hex) {
    const [r, g, b] = hexRgb(hex).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return { L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
  }
  function lum(hex) {
    const [r, g, b] = hexRgb(hex).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  const inkOn = (hex) => (contrast(hex, '#0E1626') >= contrast(hex, '#FFFFFF') ? '#0E1626' : '#FFFFFF');

  const HUES = [
    [20, 'Pink', 'pink'], [48, 'Rot', 'red'], [75, 'Orange', 'orange'], [108, 'Gelb', 'yellow'],
    [135, 'Limette', 'lime'], [165, 'Grün', 'green'], [205, 'Türkis', 'teal'], [250, 'Blau', 'blue'],
    [285, 'Kobalt', 'cobalt blue'], [320, 'Violett', 'violet'], [350, 'Magenta', 'magenta'], [361, 'Pink', 'pink'],
  ];
  function colorName(hex) {
    const { L, C, h } = hexToOklch(hex);
    if (C < 0.025 || (L < 0.3 && C < 0.05)) {
      if (L > 0.92) return ['Weiß', 'off-white'];
      if (L > 0.65) return ['Hellgrau', 'light grey'];
      if (L > 0.35) return ['Grau', 'grey'];
      return ['Anthrazit', 'charcoal'];
    }
    const [, de, en] = HUES.find(([lim]) => h < lim);
    if (L > 0.84) return ['Zartes ' + de, 'pale ' + en];
    if (L < 0.42) return ['Tiefes ' + de, 'deep ' + en];
    if (C < 0.07) return ['Gedecktes ' + de, 'muted ' + en];
    return [de, en];
  }

  /* ───────── Zufall mit Startwert ───────── */
  function hash(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = hash(String(seed));
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ───────── Zustand ───────── */
  const PAIRS = [
    { d: 'Bricolage Grotesque', dw: '700', b: 'Instrument Sans', fb: 'sans-serif', fd: 'sans-serif' },
    { d: 'Fraunces', dw: '600', b: 'Inter', fb: 'sans-serif', fd: 'serif' },
    { d: 'Space Grotesk', dw: '700', b: 'IBM Plex Sans', fb: 'sans-serif', fd: 'sans-serif' },
    { d: 'Playfair Display', dw: '700', b: 'Source Sans 3', fb: 'sans-serif', fd: 'serif' },
    { d: 'Syne', dw: '700', b: 'DM Sans', fb: 'sans-serif', fd: 'sans-serif' },
    { d: 'DM Serif Display', dw: '', b: 'DM Sans', fb: 'sans-serif', fd: 'serif' },
    { d: 'Unbounded', dw: '600', b: 'Manrope', fb: 'sans-serif', fd: 'sans-serif' },
    { d: 'Archivo Black', dw: '', b: 'Archivo', fb: 'sans-serif', fd: 'sans-serif' },
  ];
  const CHIPS = [
    ['Stil', [
      ['Editorial-Foto', 'editorial photography'], ['3D-Rendering', 'polished 3D render'], ['Flache Illustration', 'flat vector illustration'],
      ['Analogfilm', '35mm film photo with subtle grain'], ['Collage', 'mixed-media paper collage'], ['Bauhaus', 'Bauhaus graphic design'],
      ['Risografie', 'risograph print texture'], ['Filmstill', 'cinematic film still'],
    ]],
    ['Licht', [
      ['Goldene Stunde', 'golden hour light'], ['Weiches Studio', 'soft studio lighting'], ['Harter Blitz', 'hard direct flash'],
      ['Neon', 'neon glow'], ['Gegenlicht', 'backlit with rim light'], ['Bewölkt', 'overcast diffuse light'],
    ]],
    ['Kamera', [
      ['Weitwinkel', 'wide-angle 24mm'], ['Porträt 85 mm', '85mm lens, shallow depth of field'], ['Makro', 'macro close-up'],
      ['Von oben', 'top-down view'], ['Von unten', 'low angle'], ['Isometrisch', 'isometric view'],
    ]],
    ['Stimmung', [
      ['Ruhig', 'calm and minimal'], ['Verspielt', 'playful'], ['Dramatisch', 'dramatic'],
      ['Futuristisch', 'futuristic'], ['Nostalgisch', 'nostalgic'], ['Surreal', 'surreal and dreamlike'],
    ]],
  ];
  const IDEAS = [
    'a ceramic espresso cup on a raw concrete ledge', 'an astronaut helmet filled with wildflowers',
    'a tiny lighthouse inside a glass bottle', 'stacked paper shapes forming a mountain range',
    'a vintage desk lamp glowing in an empty studio', 'a sneaker floating above a tiled swimming pool',
    'a brutalist house on a cliff above the sea', 'a houseplant casting long shadows on a pastel wall',
    'a chrome sphere resting in a field of tall grass', 'a poster wall in a quiet subway station',
  ];
  const DEFAULTS = () => ({
    palette: ['#EAF0FB', '#F5B301', '#4F7CF7', '#1D3FA8', '#0E1626'].map((hex) => ({ hex, lock: false })),
    harmony: 'analog',
    exportFmt: 'css',
    grad: { kind: 'mesh', angle: 135, soft: 62, grain: true, pts: [{ x: 16, y: 22, c: 1 }, { x: 82, y: 16, c: 2 }, { x: 64, y: 74, c: 3 }, { x: 18, y: 86, c: 4 }] },
    type: { pair: 0, base: 17, ratio: 1.25 },
    gen: { algo: 'flow', seed: '42', density: 55, format: '1:1', ground: 'dark' },
    prompt: { motif: IDEAS[1], chips: ['Editorial-Foto', 'Weiches Studio'], pal: true, clean: true, format: '4:5' },
    saved: null,
  });
  let S = DEFAULTS();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && Array.isArray(raw.palette) && raw.palette.length === 5) {
      const d = DEFAULTS();
      S = { ...d, ...raw, grad: { ...d.grad, ...raw.grad }, type: { ...d.type, ...raw.type }, gen: { ...d.gen, ...raw.gen }, prompt: { ...d.prompt, ...raw.prompt } };
    }
  } catch (e) { /* ohne Speicher weiterarbeiten */ }
  if (!Array.isArray(S.saved)) {
    S.saved = [
      { id: 'ex1', kind: 'palette', name: 'Startrampe', example: true, data: { palette: S.palette.map((p) => p.hex) } },
      { id: 'ex2', kind: 'gen', name: 'Strömung · 42', example: true, data: { palette: ['#F4EEF7', '#FF7A59', '#C2409B', '#5B2A86', '#1B1030'], gen: { algo: 'flow', seed: '42', density: 60, format: '1:1', ground: 'dark' } } },
      { id: 'ex3', kind: 'grad', name: 'Mesh · Türkis', example: true, data: { palette: ['#E6FAF4', '#7BE0C3', '#19A7A0', '#1A5C8A', '#0B2238'], grad: { kind: 'mesh', angle: 135, soft: 70, grain: true, pts: [{ x: 20, y: 25, c: 1 }, { x: 78, y: 20, c: 2 }, { x: 70, y: 80, c: 3 }, { x: 22, y: 78, c: 4 }] } } },
    ];
  }
  let saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* voll oder gesperrt */ }
    }, 150);
  }
  const hexes = () => S.palette.map((p) => p.hex);
  const byLight = (pal) => [...pal].sort((a, b) => hexToOklch(b).L - hexToOklch(a).L);
  const vivid = (pal) => [...pal].sort((a, b) => hexToOklch(b).C - hexToOklch(a).C)[0];

  /* ───────── Meldung + Kopieren ───────── */
  let toastTimer;
  function toast(msg, action, fn) {
    const t = $('#toast');
    t.textContent = msg;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = action;
      b.addEventListener('click', () => { fn(); t.hidden = true; });
      t.append(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 2200);
  }
  function copy(text, label = 'Kopiert') {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? label : 'Kopieren ist hier gesperrt. Markiere den Text von Hand.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(label), fallback);
    } else fallback();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const el = $(b.dataset.copy);
    copy('value' in el ? el.value : el.textContent);
  });
  function seg(id, get, set) {
    const root = $(id);
    const sync = () => $$('button', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === get())));
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      set(b.dataset.v); sync();
    });
    sync();
    return sync;
  }

  /* ───────── Farben ───────── */
  const OFFSETS = {
    analog: [-36, -18, 0, 18, 36], komplement: [0, 12, 180, 192, 0], triade: [0, 120, 240, 0, 120],
    split: [0, 150, 210, 0, 150], mono: [0, 0, 0, 0, 0],
  };
  function mix() {
    const r = Math.random;
    const base = r() * 360;
    const Ls = [0.95, 0.83, 0.67, 0.48, 0.26];
    const Cs = [0.02 + r() * 0.04, 0.09 + r() * 0.09, 0.13 + r() * 0.1, 0.1 + r() * 0.1, 0.03 + r() * 0.06];
    // Ein Akzent darf aus der Lichtreihe ausbrechen, sonst wirkt jede Palette wie eine Treppe.
    const pop = S.harmony === 'mono' ? -1 : 1 + Math.floor(r() * 2);
    S.palette = S.palette.map((p, i) => {
      if (p.lock) return p;
      const off = S.harmony === 'zufall' ? r() * 360 : OFFSETS[S.harmony][i];
      const L = Ls[i] + (r() - 0.5) * 0.05;
      const C = i === pop ? 0.17 + r() * 0.05 : Cs[i];
      return { hex: toHex(clamp(L, 0.12, 0.97), C, (base + off + 360) % 360), lock: false };
    });
    paletteChanged();
  }
  const ICON_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const ICON_OPEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>';
  const ICON_EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/></svg>';
  function renderSwatches() {
    $('#swatches').innerHTML = S.palette.map((p, i) => {
      const o = hexToOklch(p.hex), ink = inkOn(p.hex);
      return `<div class="sw" style="background:${p.hex};color:${ink};--swbg:${p.hex}">
        <div class="sw-tools">
          <button class="sw-btn" type="button" data-lock="${i}" aria-pressed="${p.lock}" aria-label="${p.lock ? 'Farbe entsperren' : 'Farbe sperren'}" title="${p.lock ? 'Entsperren' : 'Sperren'}">${p.lock ? ICON_LOCK : ICON_OPEN}</button>
          <label class="sw-btn" title="Farbe ändern">${ICON_EDIT}<input type="color" id="swc${i}" data-edit="${i}" value="${p.hex}" aria-label="Farbe ${i + 1} ändern"></label>
        </div>
        <span class="sw-name">${colorName(p.hex)[0]}</span>
        <button class="sw-hex" type="button" data-hex="${p.hex}" title="Hex-Wert kopieren">${p.hex}</button>
        <span class="sw-lch">oklch(${o.L.toFixed(2)} ${o.C.toFixed(2)} ${Math.round(o.h)})</span>
      </div>`;
    }).join('');
  }
  function renderPairs() {
    const pal = hexes(), out = [];
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const c = contrast(pal[i], pal[j]);
      const grade = c >= 7 ? 'AAA' : c >= 4.5 ? 'AA' : c >= 3 ? 'AA groß' : 'zu schwach';
      const [bg, fg] = lum(pal[i]) > lum(pal[j]) ? [pal[i], pal[j]] : [pal[j], pal[i]];
      out.push({ c, html: `<div class="pair" style="background:${bg};color:${fg}"><b>Aa</b><span>${c.toFixed(1).replace('.', ',')} : 1<br>${grade}</span></div>` });
    }
    $('#pairs').innerHTML = out.sort((a, b) => b.c - a.c).map((o) => o.html).join('');
  }
  function exportText() {
    const pal = hexes();
    if (S.exportFmt === 'json') return JSON.stringify(pal.map((hex) => ({ name: colorName(hex)[0], hex })), null, 2);
    if (S.exportFmt === 'tailwind') {
      return `// tailwind.config.js\ntheme: {\n  extend: {\n    colors: {\n      apollo: {\n${pal.map((h, i) => `        ${(i + 1) * 100}: '${h}',`).join('\n')}\n      },\n    },\n  },\n}`;
    }
    return `:root {\n${pal.map((h, i) => `  --farbe-${i + 1}: ${h}; /* ${colorName(h)[0]} */`).join('\n')}\n}`;
  }
  function renderStrip() { $('#strip').innerHTML = hexes().map((h) => `<i style="background:${h}"></i>`).join(''); }
  function paletteChanged() {
    renderSwatches(); renderPairs(); renderStrip();
    $('#exportCode').textContent = exportText();
    renderGrad(); renderType(); renderGen(); renderPrompt();
    persist();
  }
  $('#swatches').addEventListener('click', (e) => {
    const lock = e.target.closest('[data-lock]'), hex = e.target.closest('[data-hex]');
    if (lock) {
      const p = S.palette[+lock.dataset.lock];
      p.lock = !p.lock; renderSwatches(); persist();
      $(`[data-lock="${lock.dataset.lock}"]`).focus();
    } else if (hex) copy(hex.dataset.hex.toUpperCase(), hex.dataset.hex.toUpperCase() + ' kopiert');
  });
  $('#swatches').addEventListener('change', (e) => {
    if (e.target.dataset.edit === undefined) return;
    S.palette[+e.target.dataset.edit] = { hex: e.target.value.toLowerCase(), lock: true };
    paletteChanged();
  });
  $('#harmony').value = S.harmony;
  $('#harmony').addEventListener('change', (e) => { S.harmony = e.target.value; mix(); });
  $('#mix').addEventListener('click', mix);
  seg('#exportFmt', () => S.exportFmt, (v) => { S.exportFmt = v; $('#exportCode').textContent = exportText(); persist(); });

  /* ───────── Verlauf ───────── */
  function gradCss(g, pal) {
    const cols = pal.slice(1);
    if (g.kind === 'linear') return `background: linear-gradient(${g.angle}deg, ${pal.join(', ')});`;
    if (g.kind === 'conic') return `background: conic-gradient(from ${g.angle}deg at 50% 50%, ${cols.join(', ')}, ${cols[0]});`;
    return `background-color: ${pal[0]};\nbackground-image:\n${g.pts.map((p) => `  radial-gradient(at ${Math.round(p.x)}% ${Math.round(p.y)}%, ${pal[p.c]} 0px, transparent ${g.soft}%)`).join(',\n')};`;
  }
  function applyCss(el, css) {
    el.style.background = ''; el.style.backgroundColor = ''; el.style.backgroundImage = '';
    css.split(/;\s*\n?/).forEach((decl) => {
      const i = decl.indexOf(':');
      if (i > 0) el.style.setProperty(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
    });
  }
  function renderGrad() {
    const g = S.grad, pal = hexes(), stage = $('#gradStage');
    const css = gradCss(g, pal);
    applyCss(stage, css);
    $('#gradCode').textContent = css;
    $('#gradGrain').hidden = !g.grain;
    $('#gradSoftF').hidden = g.kind !== 'mesh';
    $('#gradAngleF').hidden = g.kind === 'mesh';
    $('#gradSoftO').textContent = g.soft + ' %';
    $('#gradAngleO').textContent = g.angle + '°';
    $$('.handle', stage).forEach((h) => h.remove());
    if (g.kind !== 'mesh') return;
    g.pts.forEach((p, i) => {
      const h = document.createElement('button');
      h.type = 'button'; h.className = 'handle'; h.dataset.i = i;
      h.style.cssText = `left:${p.x}%;top:${p.y}%;background:${pal[p.c]}`;
      h.setAttribute('aria-label', `Punkt ${i + 1}, ${colorName(pal[p.c])[0]}. Pfeiltasten verschieben, Eingabetaste wechselt die Farbe.`);
      stage.append(h);
    });
  }
  (function gradEvents() {
    const stage = $('#gradStage');
    let drag = null;
    const softUpdate = () => {
      const css = gradCss(S.grad, hexes());
      applyCss(stage, css); $('#gradCode').textContent = css;
    };
    stage.addEventListener('pointerdown', (e) => {
      const h = e.target.closest('.handle');
      if (!h) return;
      drag = h; h.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = stage.getBoundingClientRect(), p = S.grad.pts[+drag.dataset.i];
      p.x = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
      p.y = clamp(((e.clientY - r.top) / r.height) * 100, 0, 100);
      drag.style.left = p.x + '%'; drag.style.top = p.y + '%';
      softUpdate();
    });
    const end = () => { if (drag) { drag = null; persist(); } };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    const cycle = (i) => {
      const p = S.grad.pts[i];
      p.c = (p.c % 4) + 1;
      renderGrad(); persist();
      $(`.handle[data-i="${i}"]`).focus();
    };
    stage.addEventListener('dblclick', (e) => { const h = e.target.closest('.handle'); if (h) cycle(+h.dataset.i); });
    stage.addEventListener('keydown', (e) => {
      const h = e.target.closest('.handle');
      if (!h) return;
      const p = S.grad.pts[+h.dataset.i], d = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key];
      if (d) {
        e.preventDefault();
        p.x = clamp(p.x + d[0], 0, 100); p.y = clamp(p.y + d[1], 0, 100);
        h.style.left = p.x + '%'; h.style.top = p.y + '%';
        softUpdate(); persist();
      } else if (e.key === 'Enter') { e.preventDefault(); cycle(+h.dataset.i); }
    });
    seg('#gradKind', () => S.grad.kind, (v) => { S.grad.kind = v; renderGrad(); persist(); });
    $('#gradSoft').addEventListener('input', (e) => { S.grad.soft = +e.target.value; $('#gradSoftO').textContent = S.grad.soft + ' %'; softUpdate(); persist(); });
    $('#gradAngle').addEventListener('input', (e) => { S.grad.angle = +e.target.value; $('#gradAngleO').textContent = S.grad.angle + '°'; softUpdate(); persist(); });
    $('#gradGrainC').addEventListener('change', (e) => { S.grad.grain = e.target.checked; renderGrad(); persist(); });
    $('#gradShuffle').addEventListener('click', () => {
      S.grad.pts = S.grad.pts.map((p, i) => ({ x: 8 + Math.random() * 84, y: 8 + Math.random() * 84, c: i + 1 }));
      if (S.grad.kind !== 'mesh') S.grad.angle = Math.round(Math.random() * 360);
      syncControls(); renderGrad(); persist();
    });
  })();

  /* ───────── Schrift ───────── */
  const loadedFonts = new Set();
  function loadPair(p) {
    const key = p.d + '|' + p.b;
    if (loadedFonts.has(key)) return;
    loadedFonts.add(key);
    const fam = (n, w) => 'family=' + n.replace(/ /g, '+') + (w ? ':wght@' + w : '');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${fam(p.d, p.dw)}&${fam(p.b, '400;600')}&display=swap`;
    document.head.append(link);
  }
  const SPEC = { h1: 'Der Adler ist gelandet', h2: 'Gestalten heißt ausprobieren', p: 'Gute Typografie fällt nicht auf. Sie führt das Auge, gibt dem Text einen Rhythmus und lässt Platz zum Atmen. Zwölf Zeilen Fließtext zeigen mehr über eine Schrift als jedes Plakat.', pill: 'Mehr erfahren' };
  function typeSteps(t) { return [-1, 0, 1, 2, 3, 4, 5].map((n) => ({ n, px: t.base * Math.pow(t.ratio, n) })); }
  function typeCss(t) {
    const p = PAIRS[t.pair];
    return `:root {\n  --font-display: "${p.d}", ${p.fd};\n  --font-body: "${p.b}", ${p.fb};\n${typeSteps(t).map((s) => `  --step-${s.n}: ${(s.px / 16).toFixed(3)}rem; /* ${s.px.toFixed(1)} px */`).join('\n')}\n}\nh1 { font: ${p.dw || 400} var(--step-5)/1.05 var(--font-display); }\nh2 { font: ${p.dw || 400} var(--step-3)/1.15 var(--font-display); }\nbody { font: 400 var(--step-0)/1.55 var(--font-body); }`;
  }
  function renderType() {
    const t = S.type, p = PAIRS[t.pair], pal = byLight(hexes());
    loadPair(p);
    const bg = pal[0], fg = pal[4], acc = vivid(hexes());
    const st = Object.fromEntries(typeSteps(t).map((s) => [s.n, s.px]));
    const disp = `font-family:'${p.d}',${p.fd};font-weight:${p.dw || 400};letter-spacing:-0.02em`;
    const body = `font-family:'${p.b}',${p.fb}`;
    const spec = $('#specimen');
    spec.style.background = bg; spec.style.color = fg;
    // Schriftgrößen an die Bühne koppeln, damit große Stufen auf dem Handy nicht ausbrechen.
    const fit = (px) => `min(${px.toFixed(1)}px, ${(px / 9).toFixed(1)}vw + 14px)`;
    const row = (tag, key, style, px) => `<div class="spec-row"><span class="spec-tag">${tag} · ${px.toFixed(1).replace('.', ',')} px</span><div contenteditable="true" spellcheck="false" data-spec="${key}" style="${style};font-size:${fit(px)}">${esc(SPEC[key])}</div></div>`;
    spec.innerHTML =
      row('Stufe 5 · ' + p.d, 'h1', disp + ';line-height:1.02', st[5]) +
      row('Stufe 3', 'h2', disp + ';line-height:1.15', st[3]) +
      row('Stufe 0 · ' + p.b, 'p', body + ';line-height:1.55;max-width:62ch', st[0]) +
      `<div class="spec-row"><span class="spec-tag">Stufe −1</span><span class="spec-pill" contenteditable="true" spellcheck="false" data-spec="pill" style="${body};font-size:${st[-1].toFixed(1)}px;background:${acc};color:${inkOn(acc)}">${esc(SPEC.pill)}</span></div>`;
    $('#typeCode').textContent = typeCss(t);
    $('#typeBaseO').textContent = t.base + ' px';
  }
  $('#specimen').addEventListener('input', (e) => { const k = e.target.dataset.spec; if (k) SPEC[k] = e.target.textContent; });
  $('#typePair').innerHTML = PAIRS.map((p, i) => `<option value="${i}">${p.d} + ${p.b}</option>`).join('');
  $('#typePair').addEventListener('change', (e) => { S.type.pair = +e.target.value; renderType(); persist(); });
  $('#typeBase').addEventListener('input', (e) => { S.type.base = +e.target.value; renderType(); persist(); });
  $('#typeRatio').addEventListener('change', (e) => { S.type.ratio = +e.target.value; renderType(); persist(); });

  /* ───────── Generator ───────── */
  const f1 = (n) => Math.round(n * 10) / 10;
  function makeArt(g, pal) {
    const [fw, fh] = g.format.split(':').map(Number);
    const W = fw >= fh ? 1000 : Math.round((1000 * fw) / fh), H = fw >= fh ? Math.round((1000 * fh) / fw) : 1000;
    const r = rng(g.algo + '/' + g.seed);
    const sorted = byLight(pal);
    const ground = g.ground === 'dark' ? sorted[4] : sorted[0];
    const inks = pal.filter((c) => c !== ground);
    const pick = () => inks[Math.floor(r() * inks.length)];
    const out = [`<rect width="${W}" height="${H}" fill="${ground}"/>`];
    let count = 0;
    if (g.algo === 'flow') {
      const k = 0.6 + r() * 1.6, p1 = r() * 10, p2 = r() * 10, p3 = r() * 10, swirl = 0.6 + r() * 1.2;
      const n = Math.round(60 + g.density * 7);
      for (let i = 0; i < n; i++) {
        let x = r() * W, y = r() * H;
        const steps = 20 + Math.floor(r() * 60);
        let d = `M${f1(x)} ${f1(y)}`, len = 0;
        for (let s = 0; s < steps; s++) {
          const a = (Math.sin(x * 0.004 * k + p1) + Math.sin(y * 0.005 * k + p2) + Math.sin((x + y) * 0.003 * k + p3)) * Math.PI * swirl;
          x += Math.cos(a) * 7; y += Math.sin(a) * 7;
          if (x < -20 || x > W + 20 || y < -20 || y > H + 20) break;
          d += `L${f1(x)} ${f1(y)}`; len++;
        }
        if (len < 3) continue;
        out.push(`<path d="${d}" fill="none" stroke="${pick()}" stroke-width="${f1(0.8 + r() * r() * 9)}" stroke-linecap="round" stroke-linejoin="round" opacity="${f1(0.55 + r() * 0.45)}"/>`);
        count++;
      }
    } else if (g.algo === 'orbit') {
      const cx = W * (0.35 + r() * 0.3), cy = H * (0.35 + r() * 0.3), rot = f1(r() * 180), squash = 0.3 + r() * 0.5;
      const maxR = Math.hypot(W, H) * 0.62, rings = 3 + Math.round(g.density / 7);
      const stars = Math.round(g.density * 2.5);
      for (let i = 0; i < stars; i++) out.push(`<circle cx="${f1(r() * W)}" cy="${f1(r() * H)}" r="${f1(0.6 + r() * 1.8)}" fill="${pick()}" opacity="${f1(0.3 + r() * 0.6)}"/>`);
      const grp = [];
      const sunR = 34 + r() * 60;
      for (let i = 0; i < rings; i++) {
        const rx = sunR + 30 + ((maxR - sunR - 30) * (i + r() * 0.6)) / rings, ry = rx * squash;
        const dash = r() < 0.35 ? ` stroke-dasharray="${f1(2 + r() * 14)} ${f1(6 + r() * 18)}"` : '';
        grp.push(`<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="none" stroke="${pick()}" stroke-width="${f1(0.8 + r() * 2.6)}"${dash} opacity="${f1(0.5 + r() * 0.5)}"/>`);
        if (r() < 0.75) {
          const t = r() * Math.PI * 2;
          grp.push(`<circle cx="${f1(cx + Math.cos(t) * rx)}" cy="${f1(cy + Math.sin(t) * ry)}" r="${f1(5 + r() * r() * 26)}" fill="${pick()}"/>`);
        }
        count++;
      }
      out.push(`<g transform="rotate(${rot} ${f1(cx)} ${f1(cy)})">${grp.join('')}</g>`);
      out.push(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(sunR)}" fill="${vivid(inks)}"/>`);
    } else {
      const cols = 3 + Math.round(g.density / 9), size = W / cols, rows = Math.ceil(H / size);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const a = pick(); let b = pick(); if (b === a) b = ground;
        const X = f1(x * size), Y = f1(y * size), s = f1(size), h = f1(size / 2), kind = Math.floor(r() * 5);
        const corner = Math.floor(r() * 4), ox = corner % 2 ? s : 0, oy = corner > 1 ? s : 0;
        let shape;
        if (kind === 0) shape = `<circle cx="${ox}" cy="${oy}" r="${s}" fill="${b}"/>`;
        else if (kind === 1) shape = `<circle cx="${h}" cy="${h}" r="${f1(size * (0.22 + r() * 0.24))}" fill="${b}"/>`;
        else if (kind === 2) shape = `<circle cx="${ox}" cy="${oy}" r="${h}" fill="none" stroke="${b}" stroke-width="${f1(size * 0.16)}"/><circle cx="${s - ox}" cy="${s - oy}" r="${h}" fill="none" stroke="${b}" stroke-width="${f1(size * 0.16)}"/>`;
        else if (kind === 3) shape = `<path d="M0 0L${s} 0L${corner % 2 ? 0 : s} ${s}Z" fill="${b}"/>`;
        else shape = `<circle cx="${h}" cy="${corner % 2 ? 0 : s}" r="${h}" fill="${b}"/>`;
        // Jede Kachel bekommt ihr eigenes Koordinatensystem und wird auf ihre Fläche beschnitten.
        out.push(`<svg x="${X}" y="${Y}" width="${f1(size + 0.5)}" height="${f1(size + 0.5)}" viewBox="0 0 ${s} ${s}" overflow="hidden"><rect width="${s}" height="${s}" fill="${a}"/>${shape}</svg>`);
        count++;
      }
    }
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${out.join('')}</svg>`, W, H, count };
  }
  let lastArt = '';
  function renderGen() {
    const g = S.gen, art = makeArt(g, hexes());
    lastArt = art.svg;
    $('#artStage').innerHTML = art.svg;
    const unit = { flow: 'Linien', orbit: 'Bahnen', tiles: 'Kacheln' }[g.algo];
    $('#genInfo').textContent = `${art.count} ${unit} · ${art.W} × ${art.H} · ${(art.svg.length / 1024).toFixed(0)} kB als SVG` + (g.seed === '42' ? ' · 42 ist immer eine gute Antwort.' : '');
    $('#genDensityO').textContent = g.density;
  }
  const WORDS = ['mond', 'adler', 'kiesel', 'neon', 'tinte', 'orbit', 'falter', 'quarz', 'nebel', 'funke', 'koralle', 'delta', 'luna', 'saturn', 'pixel', 'raster'];
  seg('#genAlgo', () => S.gen.algo, (v) => { S.gen.algo = v; renderGen(); persist(); });
  $('#genSeed').addEventListener('input', (e) => { S.gen.seed = e.target.value; renderGen(); persist(); });
  $('#genRoll').addEventListener('click', () => {
    S.gen.seed = WORDS[Math.floor(Math.random() * WORDS.length)] + '-' + Math.floor(Math.random() * 900 + 100);
    $('#genSeed').value = S.gen.seed; renderGen(); persist();
  });
  $('#genDensity').addEventListener('input', (e) => { S.gen.density = +e.target.value; renderGen(); persist(); });
  $('#genFormat').addEventListener('change', (e) => { S.gen.format = e.target.value; renderGen(); persist(); });
  $('#genGround').addEventListener('change', (e) => { S.gen.ground = e.target.value; renderGen(); persist(); });
  $('#genCopy').addEventListener('click', () => copy(lastArt, 'SVG kopiert'));

  /* ───────── Prompt ───────── */
  function promptText() {
    const p = S.prompt, parts = [];
    if (p.motif.trim()) parts.push(p.motif.trim().replace(/[.,;]+$/, ''));
    CHIPS.forEach(([, items]) => items.forEach(([de, en]) => { if (p.chips.includes(de)) parts.push(en); }));
    if (p.pal) parts.push('color palette of ' + hexes().map((h) => `${colorName(h)[1]} (${h.toUpperCase()})`).join(', '));
    parts.push('aspect ratio ' + p.format);
    if (p.clean) parts.push('no text, no watermark');
    return parts.join(', ');
  }
  function renderPrompt() {
    const txt = promptText();
    $('#pOut').value = txt;
    $('#pLen').textContent = `${txt.length} Zeichen · ${txt.split(/\s+/).filter(Boolean).length} Wörter`;
    $$('.chip').forEach((c) => c.setAttribute('aria-pressed', String(S.prompt.chips.includes(c.dataset.chip))));
  }
  $('#chipGroups').innerHTML = CHIPS.map(([name, items]) => `<div class="chipgroup"><span>${name}</span><div class="chips" role="group" aria-label="${name}">${items.map(([de]) => `<button class="chip" type="button" data-chip="${de}" aria-pressed="false">${de}</button>`).join('')}</div></div>`).join('');
  $('#chipGroups').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const k = c.dataset.chip, i = S.prompt.chips.indexOf(k);
    if (i >= 0) S.prompt.chips.splice(i, 1); else S.prompt.chips.push(k);
    renderPrompt(); persist();
  });
  $('#pMotif').addEventListener('input', (e) => { S.prompt.motif = e.target.value; renderPrompt(); persist(); });
  $('#pIdea').addEventListener('click', () => {
    let idea;
    do idea = IDEAS[Math.floor(Math.random() * IDEAS.length)]; while (idea === S.prompt.motif);
    S.prompt.motif = idea; $('#pMotif').value = idea; renderPrompt(); persist();
  });
  $('#pFormat').addEventListener('change', (e) => { S.prompt.format = e.target.value; renderPrompt(); persist(); });
  $('#pPal').addEventListener('change', (e) => { S.prompt.pal = e.target.checked; renderPrompt(); persist(); });
  $('#pClean').addEventListener('change', (e) => { S.prompt.clean = e.target.checked; renderPrompt(); persist(); });
  $('#pReset').addEventListener('click', () => { S.prompt.chips = []; renderPrompt(); persist(); });

  /* ───────── Sammlung ───────── */
  const KIND = { palette: 'Palette', grad: 'Verlauf', type: 'Schrift', gen: 'Grafik', prompt: 'Prompt' };
  const HOME = { palette: 'farben', grad: 'verlauf', type: 'schrift', gen: 'generator', prompt: 'prompt' };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function save(kind, name, data) {
    S.saved.unshift({ id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), kind, name, data: clone({ palette: hexes(), ...data }) });
    renderShelf(); persist();
    toast('In der Sammlung gespeichert', 'Ansehen', () => { location.hash = 'sammlung'; });
  }
  $('#savePalette').addEventListener('click', () => save('palette', colorName(vivid(hexes()))[0] + ' und ' + colorName(byLight(hexes())[4])[0], {}));
  $('#saveGrad').addEventListener('click', () => save('grad', { mesh: 'Mesh', linear: 'Linear', conic: 'Konisch' }[S.grad.kind] + ' · ' + colorName(vivid(hexes()))[0], { grad: S.grad }));
  $('#saveType').addEventListener('click', () => save('type', PAIRS[S.type.pair].d + ' + ' + PAIRS[S.type.pair].b, { type: S.type }));
  $('#saveGen').addEventListener('click', () => save('gen', { flow: 'Strömung', orbit: 'Umlaufbahn', tiles: 'Kacheln' }[S.gen.algo] + ' · ' + (S.gen.seed || 'ohne Startwert'), { gen: S.gen }));
  $('#savePrompt').addEventListener('click', () => save('prompt', (S.prompt.motif.trim() || 'Prompt ohne Motiv').slice(0, 48), { prompt: S.prompt, text: promptText() }));
  function thumb(it) {
    const d = it.data;
    if (it.kind === 'palette') return `<div class="thumb">${d.palette.map((h) => `<i style="background:${h}"></i>`).join('')}</div>`;
    if (it.kind === 'grad') return `<div class="thumb" data-grad="${esc(gradCss(d.grad, d.palette))}"></div>`;
    if (it.kind === 'gen') return `<div class="thumb">${makeArt({ ...d.gen, density: Math.min(d.gen.density, 40) }, d.palette).svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid slice" ')}</div>`;
    if (it.kind === 'type') {
      const p = PAIRS[d.type.pair], pal = byLight(d.palette);
      loadPair(p);
      return `<div class="thumb aa" style="background:${pal[0]};color:${pal[4]};font-family:'${p.d}',${p.fd};font-weight:${p.dw || 400}">Aa</div>`;
    }
    return `<div class="thumb text">${esc((d.text || '').slice(0, 170))}…</div>`;
  }
  function renderShelf() {
    $('#savedCount').textContent = S.saved.length;
    const shelf = $('#shelf');
    if (!S.saved.length) {
      shelf.innerHTML = '<div class="empty">Noch nichts gespeichert. In jedem Werkzeug gibt es einen Knopf zum Speichern.</div>';
      return;
    }
    shelf.innerHTML = S.saved.map((it) => `<article class="card">${thumb(it)}<div class="card-body">
      <span class="card-kind">${KIND[it.kind]}${it.example ? '<span class="badge">Beispiel</span>' : ''}</span>
      <span class="card-name">${esc(it.name)}</span>
      <div class="row"><button class="btn primary" type="button" data-load="${it.id}">Laden</button><button class="btn" type="button" data-del="${it.id}">Löschen</button></div>
    </div></article>`).join('');
    $$('[data-grad]', shelf).forEach((el) => applyCss(el, el.dataset.grad));
  }
  $('#shelf').addEventListener('click', (e) => {
    const load = e.target.closest('[data-load]'), del = e.target.closest('[data-del]');
    if (load) {
      const it = S.saved.find((x) => x.id === load.dataset.load), d = clone(it.data);
      S.palette = d.palette.map((hex) => ({ hex, lock: false }));
      if (d.grad) S.grad = d.grad;
      if (d.type) S.type = d.type;
      if (d.gen) S.gen = d.gen;
      if (d.prompt) S.prompt = d.prompt;
      syncControls(); paletteChanged();
      location.hash = HOME[it.kind];
      toast(`„${it.name}“ geladen`);
    } else if (del) {
      const i = S.saved.findIndex((x) => x.id === del.dataset.del), it = S.saved[i];
      S.saved.splice(i, 1); renderShelf(); persist();
      toast('Gelöscht', 'Rückgängig', () => { S.saved.splice(i, 0, it); renderShelf(); persist(); });
    }
  });

  /* ───────── Ansichten ───────── */
  function syncControls() {
    $('#harmony').value = S.harmony;
    $('#gradSoft').value = S.grad.soft; $('#gradAngle').value = S.grad.angle; $('#gradGrainC').checked = S.grad.grain;
    $('#typePair').value = S.type.pair; $('#typeBase').value = S.type.base; $('#typeRatio').value = String(S.type.ratio);
    $('#genSeed').value = S.gen.seed; $('#genDensity').value = S.gen.density; $('#genFormat').value = S.gen.format; $('#genGround').value = S.gen.ground;
    $('#pMotif').value = S.prompt.motif; $('#pFormat').value = S.prompt.format; $('#pPal').checked = S.prompt.pal; $('#pClean').checked = S.prompt.clean;
    $$('#gradKind button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S.grad.kind)));
    $$('#genAlgo button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S.gen.algo)));
  }
  function route() {
    const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'farben';
    TABS.forEach((t) => { $('#v-' + t).hidden = t !== tab; });
    $$('.tabs a').forEach((a) => {
      if (a.dataset.tab === tab) { a.setAttribute('aria-current', 'page'); a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.metaKey || e.ctrlKey || e.altKey) return;
    if ($('#v-farben').hidden) return;
    const el = document.activeElement;
    if (el && el.matches('input, textarea, select, button, a, [contenteditable="true"]')) return;
    e.preventDefault(); mix();
  });

  syncControls();
  paletteChanged();
  renderShelf();
  route();
})();
