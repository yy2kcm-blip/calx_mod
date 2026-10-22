// teach.js — 老師模式：投影教學用的視覺輔助層
//
// 四個功能共用一塊覆蓋畫布（疊在面盤最上層）：
//   1. 觸控光點      —— 讓全班看得到老師的手按在哪裡
//   2. 最後按下的鍵  —— 持續高亮並浮出按鍵說明（真機印在 PNG 上的小字投影時看不清）
//   3. 標註畫布      —— 點哪個鍵就在哪個鍵上畫圈並標名，或自由手繪
//   4. 寬屏佈局      —— 計算機吃滿視窗寬度（投影用）
//
// 設計上最重要的一點：覆蓋畫布預設是 pointer-events:none，
// 因此它只是「畫在上面」，完全不擋按鍵。點按某個鍵時，
// 按鍵的 click 照常觸發（計算器照跑），同時本模組在 pointerup 時
// 依 e.target 找到那個鍵、替它畫圈標註 —— 一次触控完成「圈注 + 按鍵」。
// 只有在「畫筆」模式下才把覆蓋畫布切成 pointer-events:auto，此時按鍵暫停，
// 讓老師用手指自由手繪。
//
// 工具列是一個可拖曳的浮窗，位置會記住；按鈕只有圖標，說明放在 title。

import { KEYS, SHELL_W, SHELL_H } from './keymap.js';

const TAU = Math.PI * 2;
const DOT_LIFE = 700;        // 觸控光點存活時間(ms)
const STROKE_COLOR = '#ff2d55';
const MARK_COLOR = '#ff9500';
const LABEL_BG = 'rgba(18,22,28,.88)';

const STYLE = `
.teach-overlay{position:absolute;inset:0;pointer-events:none;z-index:5;}
.teach-overlay.pen-mode{pointer-events:auto;cursor:crosshair;touch-action:none;}
.key.is-latest{outline:3px solid ${MARK_COLOR};outline-offset:2px;box-shadow:0 0 12px ${MARK_COLOR}88;border-radius:inherit;}
.teach-caption{position:absolute;z-index:6;pointer-events:none;display:none;transform:translate(-50%,-100%);
  background:${LABEL_BG};color:#fff;font:600 13px/1.4 system-ui,-apple-system,"PingFang TC",sans-serif;
  padding:4px 9px;border-radius:7px;white-space:nowrap;box-shadow:0 3px 10px #0006;}
.teach-caption.show{display:block;}
.teach-caption b{color:#ffc46b;}

/* 可拖曳的工具浮窗 */
.teach-panel{position:fixed;z-index:60;display:none;left:auto;right:16px;bottom:16px;
  flex-direction:column;gap:0;min-width:0;
  background:rgba(255,255,255,.95);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  border:1px solid #dce5ee;border-radius:14px;box-shadow:0 12px 34px #1c314355;overflow:hidden;}
.teach-panel.show{display:flex;}
.teach-grip{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;
  background:#f2f6fa;border-bottom:1px solid #e3ebf3;cursor:grab;touch-action:none;user-select:none;}
.teach-grip:active{cursor:grabbing;}
.teach-dot{width:8px;height:8px;border-radius:50%;background:${MARK_COLOR};flex:0 0 auto;}
.teach-mode{font-size:12px;font-weight:700;color:#54687e;flex:1 1 auto;white-space:nowrap;}
.teach-grip button{width:26px;height:26px;min-height:26px;padding:0;border:0;background:transparent;
  color:#8797a9;font-size:14px;line-height:1;border-radius:7px;flex:0 0 auto;}
.teach-grip button:hover{background:#e3ebf3;color:#3d5266;}
.teach-tools{display:flex;gap:4px;padding:6px;}
.teach-tools button{width:40px;height:40px;min-height:40px;padding:0;border-radius:10px;
  font-size:19px;line-height:1;display:inline-flex;align-items:center;justify-content:center;
  background:#fff;border:1px solid #dce5ee;}
.teach-tools button:hover{background:#eef4fb;}
.teach-tools button[aria-pressed="true"]{background:#e9f2ff;border-color:#78a5e3;}
.teach-panel.collapsed .teach-tools{display:none;}
.teach-panel.collapsed .teach-grip{border-bottom:0;}

/* 老師模式關閉時的浮動開關鈕 */
.teach-fab{position:fixed;right:16px;bottom:16px;z-index:55;width:44px;height:44px;min-height:44px;
  padding:0;border-radius:50%;font-size:20px;line-height:1;
  display:inline-flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,.95);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  border:1px solid #f0dcb4;color:#8a5a10;box-shadow:0 8px 22px #1c314333;}
.teach-fab[aria-pressed="true"]{display:none;}
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

/** 圓角矩形路徑。 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function setupTeachMode(machine, shell) {
  injectStyle();

  // ================= 狀態 =================
  const STORE_KEY = 'calcx-teach-annotations-v1';
  const WIDE_KEY = 'calcx-teach-wide-v1';
  const PANEL_KEY = 'calcx-teach-panel-v1';

  const page = document.querySelector('.page') || document.body;
  let enabled = false;
  let mode = 'touch';
  let wide = false;
  let dots = [];            // {x, y, t}  設計座標
  let strokes = [];         // {pts: [{x,y}]}
  let marks = [];           // {keyId, label, x, y, w, h}
  let drawing = null;
  let touchStart = null;
  let latestKey = null;
  let dirty = true;

  // ================= 覆蓋畫布 =================
  const overlay = document.createElement('canvas');
  overlay.id = 'teach-overlay';
  overlay.className = 'teach-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  shell.appendChild(overlay);
  const ctx = overlay.getContext('2d');

  // ================= 按鍵說明浮層 =================
  const caption = document.createElement('div');
  caption.className = 'teach-caption';
  shell.appendChild(caption);

  // ================= 工具浮窗 =================
  const panel = document.createElement('div');
  panel.className = 'teach-panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', '老師模式工具');
  panel.innerHTML =
    '<div class="teach-grip" title="拖曳可移動">' +
      '<span class="teach-dot" aria-hidden="true"></span>' +
      '<span class="teach-mode">指示</span>' +
      '<button type="button" data-teach-action="collapse" title="收合" aria-label="收合或展開工具列">▾</button>' +
      '<button type="button" data-teach-action="close" title="關閉老師模式" aria-label="關閉老師模式">✕</button>' +
    '</div>' +
    '<div class="teach-tools"></div>';
  const tools = panel.querySelector('.teach-tools');
  const modeLabel = panel.querySelector('.teach-mode');
  document.body.appendChild(panel);

  // 純圖標按鈕（說明放在 title / aria-label，不佔版面）
  const mkBtn = (id, icon, title) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.teachAction = id;
    b.textContent = icon;
    b.title = title;
    b.setAttribute('aria-label', title);
    tools.appendChild(b);
    return b;
  };
  mkBtn('touch', '👆', '指示：顯示觸控光點，最後按下的鍵持續高亮');
  mkBtn('mark', '⭕', '標記：點鍵即在該鍵上畫圈並標名（該鍵照常執行）');
  mkBtn('pen', '✏️', '畫筆：自由手繪（此時按鍵暫停）');
  mkBtn('undo', '↩', '復原：移除最後一個標註');
  mkBtn('clear', '🗑', '清除：清除所有標註');
  mkBtn('export', '⤓', '匯出 PNG：把畫面含標註存成圖片');
  mkBtn('wide', '⛶', '寬屏：讓計算機吃滿視窗寬度（投影用）');

  // 老師模式關閉時的浮動開關鈕
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'teach-fab';
  chip.textContent = '🎓';
  chip.title = '老師模式';
  chip.setAttribute('aria-label', '老師模式');
  chip.setAttribute('aria-pressed', 'false');
  document.body.appendChild(chip);

  // ================= 座標換算 =================
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

  // ================= 繪製 =================
  function render() {
    const r = box();
    ctx.clearRect(0, 0, r.width, r.height);
    const { kx, ky } = scale();
    const k = Math.min(kx, ky);

    // 觸控光點：淡出
    const now = performance.now();
    dots = dots.filter((d) => now - d.t < DOT_LIFE);
    for (const d of dots) {
      const age = (now - d.t) / DOT_LIFE;
      const c = toLocal(d.x, d.y);
      ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.beginPath();
      ctx.arc(c.x, c.y, (16 + age * 16) * k, 0, TAU);
      ctx.strokeStyle = '#ff2d55';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = Math.max(0, 0.28 * (1 - age));
      ctx.fillStyle = '#ff2d55';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 9 * k, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 自由筆刷
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = 4 * k;
    for (const s of strokes) {
      if (s.pts.length < 2) continue;
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
      ctx.lineWidth = 3.5 * k;
      roundRect(ctx, p0.x - 4, p0.y - 4, w + 8, h + 8, Math.min(w, h) * 0.34);
      ctx.stroke();

      const fs = Math.max(11, 22 * k);
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

  // ================= 儲存 =================
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

  // ================= 最後按下的鍵 =================
  function setLatest(key) {
    // latestKey 存的是 DOM 元素（按鍵按鈕），不是 keymap 的資料物件
    if (latestKey) latestKey.classList.remove('is-latest');
    latestKey = key ? shell.querySelector('.key[data-id="' + key.id + '"]') : null;
    if (!key) { caption.classList.remove('show'); return; }
    if (latestKey) latestKey.classList.add('is-latest');
    const text = keyLabel(key);
    const r = box();
    const kx = r.width / SHELL_W, ky = r.height / SHELL_H;
    const cx = (key.x + key.w / 2) * kx;
    const cy = key.y * ky;
    const p1y = (key.y + key.h) * ky;
    caption.innerHTML = '<b>' + text.split('  ')[0] + '</b>' +
      (text.includes('  ') ? '  ' + text.split('  ').slice(1).join(' ') : '');
    caption.style.left = cx + 'px';
    // 鍵很靠上面時，浮層改放到鍵的下方，否則會被裁掉
    caption.style.top = (cy < 40 ? p1y + 24 : cy - 10) + 'px';
    caption.classList.add('show');
  }

  // ================= 事件 =================
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

  // ================= 模式 =================
  const MODE_NAME = { touch: '指示', mark: '標記', pen: '畫筆' };
  function setMode(next) {
    mode = next;
    overlay.classList.toggle('pen-mode', mode === 'pen');
    modeLabel.textContent = MODE_NAME[mode] || mode;
    for (const b of tools.querySelectorAll('button[data-teach-action]')) {
      const a = b.dataset.teachAction;
      if (a === 'touch' || a === 'mark' || a === 'pen') b.setAttribute('aria-pressed', String(a === mode));
    }
  }

  // ================= 寬屏（投影）佈局 =================
  function setWide(on) {
    wide = !!on;
    page.classList.toggle('wide', wide);
    for (const b of tools.querySelectorAll('button[data-teach-action="wide"]')) {
      b.setAttribute('aria-pressed', String(wide));
    }
    try { localStorage.setItem(WIDE_KEY, wide ? '1' : '0'); } catch { /* 存不了就算了 */ }
  }

  // ================= 面板互動 =================
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-teach-action]');
    if (!b) return;
    const action = b.dataset.teachAction;
    if (action === 'touch' || action === 'mark' || action === 'pen') { setMode(action); return; }
    if (action === 'close') { enable(false); return; }
    if (action === 'collapse') {
      const collapsed = panel.classList.toggle('collapsed');
      b.textContent = collapsed ? '▸' : '▾';
      b.title = collapsed ? '展開' : '收合';
      return;
    }
    if (action === 'undo') {
      if (marks.length) marks.pop();
      else if (strokes.length) strokes.pop();
      dirty = true; save(); return;
    }
    if (action === 'clear') {
      marks = []; strokes = []; dirty = true; save(); return;
    }
    if (action === 'export') { exportPNG(); return; }
    if (action === 'wide') { setWide(!wide); return; }
  });

  // ================= 浮窗拖曳 =================
  const grip = panel.querySelector('.teach-grip');
  let drag = null;
  grip.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    try { grip.setPointerCapture(e.pointerId); } catch { /* 某些環境不支援 capture */ }
    e.preventDefault();
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.moved = true;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const x = Math.max(4, Math.min(window.innerWidth - w - 4, e.clientX - drag.dx));
    const y = Math.max(4, Math.min(window.innerHeight - h - 4, e.clientY - drag.dy));
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) {
      try { localStorage.setItem(PANEL_KEY, JSON.stringify({ left: panel.style.left, top: panel.style.top })); } catch { /* 存不了就算了 */ }
    }
    drag = null;
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
  try {
    const pos = JSON.parse(localStorage.getItem(PANEL_KEY) || 'null');
    if (pos && pos.left && pos.top) {
      panel.style.left = pos.left; panel.style.top = pos.top;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
    }
  } catch { /* 壞掉的記錄就忽略 */ }

  // ================= 匯出 PNG =================
  async function exportPNG() {
    const r = box();
    const dpr = window.devicePixelRatio || 1;
    const out = document.createElement('canvas');
    out.width = Math.round(r.width * dpr);
    out.height = Math.round(r.height * dpr);
    const octx = out.getContext('2d');
    octx.scale(dpr, dpr);
    try {
      const img = new Image();
      img.src = './assets/fx-50fh-ii-generated-transparent.png';
      await img.decode();
      octx.drawImage(img, 0, 0, r.width, r.height);
    } catch { /* 圖沒載到就只匯出標註層 */ }
    const lcd = document.getElementById('lcd');
    if (lcd) {
      const lr = lcd.getBoundingClientRect();
      octx.drawImage(lcd, lr.left - r.left, lr.top - r.top, lr.width, lr.height);
    }
    octx.drawImage(overlay, 0, 0, r.width, r.height);
    const a = document.createElement('a');
    a.download = 'calcx-annotated.png';
    a.href = out.toDataURL('image/png');
    a.click();
  }

  // ================= 開關 =================
  function enable(on) {
    enabled = on === undefined ? !enabled : !!on;
    panel.classList.toggle('show', enabled);
    chip.setAttribute('aria-pressed', String(enabled));
    overlay.classList.toggle('pen-mode', enabled && mode === 'pen');
    if (enabled) {
      resize(); load(); setMode(mode);
      // 第一次開啟時：視窗夠寬（多半是投影或桌面）就自動吃滿寬度
      let stored = null;
      try { stored = localStorage.getItem(WIDE_KEY); } catch { /* 讀不到就當沒存過 */ }
      setWide(stored === null ? window.innerWidth >= 1000 : stored === '1');
    } else { setLatest(null); }
    dirty = true;
    return enabled;
  }

  chip.addEventListener('click', () => enable());

  window.addEventListener('resize', () => { if (enabled) resize(); });
  // 鍵盤快捷鍵：Alt+T 切換老師模式
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 't' || e.key === 'T')) { e.preventDefault(); enable(); }
  });

  return { enable, isEnabled: () => enabled, onKey, setMode, setWide, exportPNG };
}
