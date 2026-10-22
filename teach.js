// teach.js — 老師模式：投影教學用的視覺輔助層
//
// 三個功能共用一塊覆蓋畫布（疊在面盤最上層）：
//   1. 觸控光點      —— 讓全班看得到老師的手按在哪裡
//   2. 最後按下的鍵  —— 持續高亮並浮出按鍵說明（真機印在 PNG 上的小字投影時看不清）
//   3. 標註畫布      —— 點哪個鍵就在哪個鍵上畫圈並標名，或自由手繪
//
// 設計上最重要的一點：覆蓋畫布預設是 pointer-events:none，
// 因此它只是「畫在上面」，完全不擋按鍵。點按某個鍵時，
// 按鍵的 click 照常觸發（計算器照跑），同時本模組在 pointerup 時
// 依 e.target 找到那個鍵、替它畫圈標註 —— 一次触控完成「圈注 + 按鍵」。
// 只有在「畫筆」模式下才把覆蓋畫布切成 pointer-events:auto，此時按鍵暫停，
// 讓老師用手指自由手繪。

import { KEYS, SHELL_W, SHELL_H } from './keymap.js';

const TAU = Math.PI * 2;
const DOT_LIFE = 700;        // 觸控光點存活時間(ms)
const STROKE_COLOR = '#ff2d55';
const MARK_COLOR = '#ff9500';
const LABEL_BG = 'rgba(18,22,28,.88)';

const STYLE = `
.teach-overlay{position:absolute;inset:0;pointer-events:none;z-index:5;}
.teach-overlay.pen-mode{pointer-events:auto;cursor:crosshair;touch-action:none;}
.shell[data-skin="photo-private-layout"] .key.is-latest{outline:3px solid ${MARK_COLOR};outline-offset:2px;box-shadow:0 0 12px ${MARK_COLOR}88;}
.teach-caption{position:absolute;z-index:6;pointer-events:none;display:none;transform:translate(-50%,-100%);
  background:${LABEL_BG};color:#fff;font:600 13px/1.4 system-ui,-apple-system,"PingFang TC",sans-serif;
  padding:4px 9px;border-radius:7px;white-space:nowrap;box-shadow:0 3px 10px #0006;}
.teach-caption.show{display:block;}
.teach-caption b{color:#ffc46b;}
.teach-bar{display:none;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 10px;}
.teach-bar.show{display:flex;}
.teach-bar button{font-size:12px;padding:6px 10px;min-height:34px;border-radius:9px;}
.teach-bar button[aria-pressed="true"]{background:#e9f2ff;color:#1f65c7;border-color:#78a5e3;font-weight:700;}
.teach-chip{font-size:12px;padding:6px 11px;min-height:34px;border-radius:9px;background:#fff7e8;color:#8a5a10;border-color:#f0dcb4;}
.teach-chip[aria-pressed="true"]{background:#fff0d6;border-color:${MARK_COLOR};font-weight:700;}
.teach-hint{width:100%;font-size:11.5px;color:#7b8b9c;line-height:1.7;}
.teach-hint b{color:#54687e;}
`;

function injectStyle() {
  if (document.getElementById('teach-style')) return;
  const s = document.createElement('style');
  s.id = 'teach-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

/** 按鍵說明文字：base + 可用的 SHIFT / ALPHA 副圖。 */
function keyLabel(key) {
  const parts = [];
  if (key.base) parts.push(key.base);
  if (key.shift) parts.push('SHIFT+' + key.shift);
  if (key.alpha) parts.push('ALPHA+' + key.alpha);
  return parts.join('  ') || key.id;
}

/** 在按鍵矩形外畫一圈橢圓 + 標籤（設計座標）。 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function setupTeachMode(machine, shell, options = {}) {
  injectStyle();

  const section = shell.closest('section') || shell.parentElement;

  // ---------- 覆蓋畫布 ----------
  const overlay = document.createElement('canvas');
  overlay.id = 'teach-overlay';
  overlay.className = 'teach-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  shell.appendChild(overlay);
  const ctx = overlay.getContext('2d');

  // ---------- 工具列 ----------
  const bar = document.createElement('div');
  bar.className = 'teach-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', '老師模式工具列');
  const mkBtn = (id, text, title) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.teachAction = id;
    b.textContent = text;
    if (title) b.title = title;
    bar.appendChild(b);
    return b;
  };
  mkBtn('touch', '👆 指示', '顯示觸控光點；最後按下的鍵會持續高亮');
  mkBtn('mark', '⭕ 標記', '點任何鍵都會在該鍵上畫圈並標上名稱（該鍵照常執行）');
  mkBtn('pen', '✏️ 畫筆', '自由手繪；此時按鍵暫停');
  mkBtn('undo', '↩ 復原', '移除最後一個標註');
  mkBtn('clear', '🗑 清除', '清除所有標註');
  mkBtn('export', '⤓ 匯出 PNG', '把目前的畫面（含標註）存成圖片');
  const hint = document.createElement('p');
  hint.className = 'teach-hint';
  hint.innerHTML = '老師模式：<b>👆 指示</b>讓全班看到你按哪裡；<b>⭕ 標記</b>點鍵即圈註並標名（鍵照常執行）；<b>✏️ 畫筆</b>可自由圈畫。標註會存在這部裝置。';
  bar.appendChild(hint);
  section.insertBefore(bar, shell);

  // 開關 chip
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'teach-chip';
  chip.textContent = '🎓 老師模式';
  chip.setAttribute('aria-pressed', 'false');
  const statusEl = document.getElementById('status');
  (statusEl ? statusEl.parentElement : section).insertBefore(chip, bar);

  // ---------- 按鍵說明浮層 ----------
  const caption = document.createElement('div');
  caption.className = 'teach-caption';
  shell.appendChild(caption);

  // ---------- 狀態 ----------
  let enabled = false;
  let mode = 'touch';
  let dots = [];            // {x, y, t}  設計座標
  let strokes = [];         // {pts: [{x,y}]}
  let marks = [];           // {keyId, label, x, y, w, h}
  let drawing = null;
  let touchStart = null;
  let latestKey = null;
  let dirty = true;
  const STORE_KEY = 'calcx-teach-annotations-v1';

  // ---------- 座標換算 ----------
  const box = () => shell.getBoundingClientRect();
  function toDesign(clientX, clientY) {
    const r = box();
    return {
      x: (clientX - r.left) * SHELL_W / Math.max(1, r.width),
      y: (clientY - r.top) * SHELL_H / Math.max(1, r.height)
    };
  }
  function toLocal(dx, dy) {
    const r = box();
    return { x: dx * r.width / SHELL_W, y: dy * r.height / SHELL_H };
  }
  function scale() {
    const r = box();
    return { kx: r.width / SHELL_W, ky: r.height / SHELL_H };
  }

  function resize() {
    const r = box();
    const dpr = window.devicePixelRatio || 1;
    overlay.width = Math.max(1, Math.round(r.width * dpr));
    overlay.height = Math.max(1, Math.round(r.height * dpr));
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  }

  // ---------- 繪製 ----------
  function render() {
    const r = box();
    ctx.clearRect(0, 0, r.width, r.height);
    const { kx, ky } = scale();

    // 觸控光點：淡出
    const now = performance.now();
    dots = dots.filter((d) => now - d.t < DOT_LIFE);
    for (const d of dots) {
      const age = (now - d.t) / DOT_LIFE;
      const c = toLocal(d.x, d.y);
      ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.beginPath();
      ctx.arc(c.x, c.y, (16 + age * 16) * Math.min(kx, ky), 0, TAU);
      ctx.strokeStyle = '#ff2d55';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = Math.max(0, 0.28 * (1 - age));
      ctx.fillStyle = '#ff2d55';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 9 * Math.min(kx, ky), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 自由筆刷
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokes) {
      if (s.pts.length < 2) continue;
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth = 4 * Math.min(kx, ky);
      ctx.beginPath();
      s.pts.forEach((p, i) => {
        const c = toLocal(p.x, p.y);
        if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
      });
      ctx.stroke();
    }

    // 按鍵圈註
    for (const m of marks) {
      const p0 = toLocal(m.x, m.y);
      const p1 = toLocal(m.x + m.w, m.y + m.h);
      const w = p1.x - p0.x, h = p1.y - p0.y;
      ctx.strokeStyle = MARK_COLOR;
      ctx.lineWidth = 3.5 * Math.min(kx, ky);
      roundRect(ctx, p0.x - 4, p0.y - 4, w + 8, h + 8, Math.min(w, h) * 0.34);
      ctx.stroke();

      // 標籤：放在鍵的上方，空間不夠就放下面
      const fs = Math.max(11, 22 * Math.min(kx, ky));
      ctx.font = '700 ' + fs + 'px system-ui,-apple-system,"PingFang TC",sans-serif';
      const tw = ctx.measureText(m.label).width;
      const th = fs * 1.5;
      let ly = p0.y - 8;
      if (ly - th < 0) ly = p1.y + 8 + th;
      let lx = p0.x + w / 2;
      lx = Math.max(tw / 2 + 4, Math.min(lx, r.width - tw / 2 - 4));
      ctx.fillStyle = LABEL_BG;
      roundRect(ctx, lx - tw / 2 - 7, ly - th, tw + 14, th, 6);
      ctx.fill();
      ctx.fillStyle = '#ffd28a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.label, lx, ly - th / 2);
    }
  }

  function loop() {
    if (enabled) {
      if (dots.length) dirty = true;
      if (dirty) { render(); dirty = false; }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- 儲存 ----------
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ strokes, marks }));
    } catch { /* 瀏覽器不給存就罷了，標註只是輔助 */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.strokes)) strokes = data.strokes;
      if (Array.isArray(data.marks)) marks = data.marks;
      dirty = true;
    } catch { /* 壞掉的存檔就丟掉 */ }
  }

  // ---------- 最後按下的鍵 ----------
  function setLatest(key) {
    if (latestKey) latestKey.classList.remove('is-latest');
    latestKey = key || null;
    if (!key) { caption.classList.remove('show'); return; }
    key.classList.add('is-latest');
    const text = keyLabel(key);
    const r = box();
    const kx = r.width / SHELL_W, ky = r.height / SHELL_H;
    const cx = (key.x + key.w / 2) * kx;
    const cy = key.y * ky;
    caption.innerHTML = '<b>' + text.split('  ')[0] + '</b>' +
      (text.includes('  ') ? '  ' + text.split('  ').slice(1).join(' ') : '');
    caption.style.left = cx + 'px';
    caption.style.top = (cy - 10) + 'px';
    caption.classList.add('show');
  }

  // ---------- 事件 ----------
  function findKeyFromEvent(e) {
    const el = e.target && e.target.closest ? e.target.closest('.key') : null;
    if (el) {
      const k = KEYS.find((x) => x.id === el.dataset.id);
      if (k) return k;
    }
    // 幾何命中（點在面板空白處但落在某鍵範圍內）
    const p = toDesign(e.clientX, e.clientY);
    return KEYS.find((k) => p.x >= k.x && p.x <= k.x + k.w && p.y >= k.y && p.y <= k.y + k.h) || null;
  }

  shell.addEventListener('pointerdown', (e) => {
    if (!enabled) return;
    const p = toDesign(e.clientX, e.clientY);
    dots.push({ x: p.x, y: p.y, t: performance.now() });
    dirty = true;
    touchStart = { p, moved: false };
    if (mode === 'pen') {
      drawing = { pts: [p] };
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  shell.addEventListener('pointermove', (e) => {
    if (!enabled) return;
    if (mode === 'pen' && drawing) {
      drawing.pts.push(toDesign(e.clientX, e.clientY));
      dirty = true;
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (touchStart && !touchStart.moved) {
      const p = toDesign(e.clientX, e.clientY);
      if (Math.hypot(p.x - touchStart.p.x, p.y - touchStart.p.y) > 16) touchStart.moved = true;
    }
  }, { passive: false });

  shell.addEventListener('pointerup', (e) => {
    if (!enabled) return;
    if (mode === 'pen' && drawing) {
      if (drawing.pts.length > 1) strokes.push(drawing);
      drawing = null;
      dirty = true;
      save();
    } else if (mode === 'mark' && touchStart && !touchStart.moved) {
      const key = findKeyFromEvent(e);
      if (key) {
        marks.push({ keyId: key.id, label: keyLabel(key), x: key.x, y: key.y, w: key.w, h: key.h });
        dirty = true;
        save();
      }
    }
    touchStart = null;
  });

  // 鍵盤輸入也走同一條路徑（app.js 的 tap() 會呼叫 onKey）
  function onKey(id) {
    if (!enabled) return;
    const key = KEYS.find((k) => k.id === id);
    if (key) setLatest(key);
  }

  // ---------- 工具列 ----------
  function setMode(next) {
    mode = next;
    overlay.classList.toggle('pen-mode', mode === 'pen');
    for (const b of bar.querySelectorAll('button[data-teach-action]')) {
      const a = b.dataset.teachAction;
      if (a === 'touch' || a === 'mark' || a === 'pen') b.setAttribute('aria-pressed', String(a === mode));
    }
  }

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-teach-action]');
    if (!b) return;
    const action = b.dataset.teachAction;
    if (action === 'touch' || action === 'mark' || action === 'pen') { setMode(action); return; }
    if (action === 'undo') {
      if (marks.length) marks.pop();
      else if (strokes.length) strokes.pop();
      dirty = true; save(); return;
    }
    if (action === 'clear') {
      marks = []; strokes = []; dirty = true; save(); return;
    }
    if (action === 'export') { exportPNG(); return; }
  });

  // ---------- 匯出 PNG ----------
  async function exportPNG() {
    const r = box();
    const out = document.createElement('canvas');
    out.width = Math.round(r.width * (window.devicePixelRatio || 1));
    out.height = Math.round(r.height * (window.devicePixelRatio || 1));
    const octx = out.getContext('2d');
    octx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    // 面盤底圖
    try {
      const img = new Image();
      img.src = './assets/fx-50fh-ii-generated-transparent.png';
      await img.decode();
      octx.drawImage(img, 0, 0, r.width, r.height);
    } catch { /* 圖沒載到就只匯出標註層 */ }
    // LCD
    const lcd = document.getElementById('lcd');
    if (lcd) {
      const lr = lcd.getBoundingClientRect();
      octx.drawImage(lcd, lr.left - r.left, lr.top - r.top, lr.width, lr.height);
    }
    // 標註層
    octx.drawImage(overlay, 0, 0, r.width, r.height);
    const a = document.createElement('a');
    a.download = 'calcx-annotated.png';
    a.href = out.toDataURL('image/png');
    a.click();
  }

  // ---------- 開關 ----------
  function enable(on) {
    enabled = on === undefined ? !enabled : !!on;
    bar.classList.toggle('show', enabled);
    chip.setAttribute('aria-pressed', String(enabled));
    overlay.classList.toggle('pen-mode', enabled && mode === 'pen');
    if (enabled) { resize(); load(); setMode(mode); }
    else { setLatest(null); }
    dirty = true;
    return enabled;
  }

  chip.addEventListener('click', () => enable());

  window.addEventListener('resize', () => { if (enabled) resize(); });
  // 鍵盤快捷鍵：Alt+T 切換老師模式
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 't' || e.key === 'T')) { e.preventDefault(); enable(); }
  });

  return { enable, isEnabled: () => enabled, onKey, setMode, exportPNG };
}
