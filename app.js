import { KEYS, PC_KEYS } from './js/keymap.js';
import { LCD } from './js/lcd.js';
import { Machine } from './js/machine.js';

import { mountFaceplate } from './faceplate.js';
import { setupPublicStudio } from './studio-ui.js';
import {setupProgramLibrary} from './program-library.js';
import { setupTeachMode } from './js/teach.js';

const STORAGE_KEY = 'fx50-public-programs-v1';
const machine = new Machine();
const shell = document.getElementById('shell');
const canvas = document.getElementById('lcd');
const accessibleDisplay = document.getElementById('lcd-accessible');
const status = document.getElementById('status');
const lcd = new LCD(canvas);
// 外殼放大/縮小時 LCD 的 backing store 會跟著變，需要重繪
lcd.onresize = () => { dirty = true; };

let savedSlots = '';
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const snapshot = JSON.parse(saved);
    if (!machine.restoreProgramSnapshot(snapshot)) throw new Error('invalid snapshot');
  }
  savedSlots = JSON.stringify(machine.programSnapshot().slots);
} catch {
  status.textContent = '本地 Program 存档读取失败；当前可以正常按键。';
}

function persistPrograms() {
  const snapshot = machine.programSnapshot();
  const slots = JSON.stringify(snapshot.slots);
  if (slots === savedSlots) return true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    savedSlots = slots;
    return true;
  } catch {
    status.textContent = 'Program 已在当前页面生效，但浏览器未能保存。';
    return false;
  }
}

const faceplate = mountFaceplate(shell, KEYS);
const buttons = faceplate.buttons;
// 老師模式（投影教學輔助層）。預設關閉，?teach 或按 Alt+T 開啟。
let teach = null;

let blink = true;
let lastNoticeId = 0;
let hintTimer = 0;
let dirty = true;
let lastBlink = performance.now();
let lastAnnouncement = '';

function tap(id) {
  const button = buttons.get(id);
  if (button) {
    button.classList.add('is-down');
    setTimeout(() => button.classList.remove('is-down'), 95);
  }
  machine.press(id);
  if (teach) teach.onKey(id);
  persistPrograms();
  blink = true;
  lastBlink = performance.now();
  dirty = true;
}

shell.addEventListener('click', (event) => {
  const button = event.target.closest('.key');
  if (button) tap(button.dataset.id);
});

window.addEventListener('keydown', (event) => {
  if (studio.isOpen()) return;
  if (event.key === 'Tab' || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target instanceof Element && event.target.closest('textarea, input, select, [contenteditable="true"]')) return;
  if (event.target instanceof Element && event.target.closest('button, a, summary') && !event.target.closest('#shell')) return;
  if (event.repeat && [' ', 'F1', 'F2', 'F3'].includes(event.key)) return;
  let mapped = PC_KEYS[event.key];
  if (mapped === undefined && event.key.length === 1) mapped = PC_KEYS[event.key.toLowerCase()];
  if (mapped === undefined) return;
  event.preventDefault();
  if (mapped.startsWith('!')) { tap('SHIFT'); tap(mapped.slice(1)); }
  else tap(mapped);
});

function describeView(view) {
  const parts = [];
  const indicators = [...(view.indicators || [])];
  if (indicators.length) parts.push(`状态：${indicators.join('、')}`);
  if (view.line1?.trim()) parts.push(`上行：${view.line1.trim()}`);
  const lower = [view.left, view.line2].filter(Boolean).join(' ');
  if (lower) parts.push(`下行：${lower}${view.exp ? ` ×10^${view.exp}` : ''}`);
  return parts.join('。') || '显示屏空白';
}

function frame(now) {
  if (now - lastBlink > 480) { blink = !blink; lastBlink = now; dirty = true; }
  if (dirty) {
    const view = machine.view();
    view.blinkOn = blink;
    lcd.render(view);
    faceplate.updateMode(machine.mode);
    const announcement = describeView(view);
    if (announcement !== lastAnnouncement) {
      accessibleDisplay.textContent = announcement;
      lastAnnouncement = announcement;
    }
    if (machine.notice && machine.notice.id !== lastNoticeId) {
      lastNoticeId = machine.notice.id;
      status.textContent = machine.notice.text;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { status.textContent = ''; }, 3000);
    }
    dirty = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);


const studio = setupPublicStudio(machine, () => { dirty = true; blink = true; persistPrograms(); }, persistPrograms);

setupProgramLibrary(machine,()=>{dirty=true;blink=true;},persistPrograms,studio);

teach = setupTeachMode(machine, shell);
const q = new URLSearchParams(location.search);
if (q.has('teach')) teach.enable();
if (q.has('wide')) { document.querySelector('.page')?.classList.add('wide'); }
