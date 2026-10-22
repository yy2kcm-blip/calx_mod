import { parseProgramText, formatProgramText } from './js/program-codec.js';
import { PROGRAM_MEMORY } from './js/program.js';
import { bytesOf, tok } from './js/tokens.js';

const MODES=new Set(['COMP','CMPLX','BASE','SD','REG']);
const DRAFT_KEY='calcx-public-drafts-v1';
export function validateDraft(source,mode,otherBytes=0){
  if(!MODES.has(mode))return {ok:false,message:'請選擇有效的計算模式。'};
  if(typeof source!=='string'||source.length>20000)return {ok:false,message:'程式文字過長。'};
  const parsed=parseProgramText(source,mode);
  if(parsed.errors.length)return {ok:false,parsed,message:`第 ${parsed.errors[0].index+1} 個字元無法辨識：${parsed.errors[0].character}`};
  if(otherBytes+parsed.bytes>PROGRAM_MEMORY)return {ok:false,parsed,message:`超出共享記憶體 ${PROGRAM_MEMORY} B，請縮短程式。`};
  return {ok:true,parsed,message:'符號及容量檢查通過；執行時仍會檢查程式語法。'};
}
export function setupPublicStudio(machine,onChange,persistPrograms){
  const $=id=>document.getElementById(id),dialog=$('studio-dialog'),source=$('program-source'),mode=$('studio-mode'),feedback=$('program-feedback');
  let slot=0,undo=null,opener=null,drafts=[null,null,null,null],storageAvailable=true,dirtyDraft=false;
  try{const saved=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(Array.isArray(saved)&&saved.length===4)drafts=saved.map(d=>d&&typeof d.source==='string'&&d.source.length<=20000&&MODES.has(d.mode)?d:null);}catch{storageAvailable=false;}
  function canonical(index){const p=machine.programSnapshot().slots[index];return {source:p?formatProgramText(p.tokens.map(tok)):'',mode:p?.mode||'COMP'};}
  function persistDrafts(){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(drafts));storageAvailable=true;}catch{storageAvailable=false;}}
  function capture(){if(dirtyDraft)drafts[slot]={source:source.value,mode:mode.value};persistDrafts();}
  function message(text,error=false){feedback.textContent=text;feedback.dataset.error=String(error);}
  const undoMatches=snap=>undo&&JSON.stringify(snap.slots[undo.slot])===JSON.stringify(undo.after);
  const undoConflict=()=>message(`P${undo.slot+1} 已在其他入口修改，無法撤銷上次保存；現有程式已保留。`,true);
  function review(){
    const snap=machine.programSnapshot();const other=snap.slots.reduce((sum,p,i)=>sum+(i!==slot&&p?bytesOf(p.tokens.map(tok)):0),0);
    const result=validateDraft(source.value,mode.value,other),busy=machine.prog?.stage==='running';
    $('program-bytes').textContent=`${result.parsed?.bytes||0} B · 合計 ${other+(result.parsed?.bytes||0)} / ${PROGRAM_MEMORY} B`;
    $('studio-save').disabled=!result.ok||busy;$('studio-run').disabled=!result.ok||busy||!result.parsed?.tokens.length;
    $('studio-undo').disabled=!undo||busy||!undoMatches(snap);
    const saved=canonical(slot),same=source.value===saved.source&&mode.value===saved.mode;
    $('draft-status').textContent=!storageAvailable?'瀏覽器無法保存草稿。請下載文字備份。':same?'內容已與計算器同步。':'草稿已保存在此瀏覽器；按「保存」才會更新計算器。';
    if(busy)message('程式正在執行或等待輸入。請先關閉編輯器，用 EXE 繼續或 ON 結束。',true);
    else if(undo&&!undoMatches(snap))undoConflict();
    else message(result.message,!result.ok);
    return result;
  }
  function select(index){slot=index;dirtyDraft=Boolean(drafts[slot]);const d=drafts[slot]||canonical(slot);source.value=d.source;mode.value=d.mode;
    dialog.querySelector('.editor-label').textContent=`P${slot+1} 程式內容`;$('studio-save').textContent=`保存到 P${slot+1}`;
    for(const b of dialog.querySelectorAll('[data-slot]'))b.setAttribute('aria-pressed',String(Number(b.dataset.slot)===slot));review();
  }
  function close(){capture();dialog.close();opener?.focus({preventScroll:true});}
  function open(event){opener=event.currentTarget;select(slot);dialog.showModal();$('studio-close').focus({preventScroll:true});}
  function save(){
    capture();const result=review();if(!result.ok||machine.prog?.stage==='running')return false;
    const before=machine.programSnapshot();
    try{machine.setStudioProgram(slot,mode.value,result.parsed.tokenIds);}catch(error){message(error.message,true);return false;}
    undo={slot,saved:before.slots[slot],after:machine.programSnapshot().slots[slot]};dirtyDraft=false;drafts[slot]=null;persistDrafts();const persisted=persistPrograms();onChange();review();
    message(persisted?`P${slot+1} 已保存 · ${result.parsed.bytes} B。`:'本次已生效，但瀏覽器無法永久儲存。請下載文字備份。',!persisted);return true;
  }
  for(const b of document.querySelectorAll('[data-open-studio]'))b.addEventListener('click',open);
  $('studio-close').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  for(const b of dialog.querySelectorAll('[data-slot]'))b.addEventListener('click',()=>{capture();select(Number(b.dataset.slot));});
  source.addEventListener('input',()=>{dirtyDraft=true;capture();review();});mode.addEventListener('change',()=>{dirtyDraft=true;capture();review();});
  for(const b of dialog.querySelectorAll('[data-insert]'))b.addEventListener('click',()=>{source.setRangeText(b.dataset.insert,source.selectionStart,source.selectionEnd,'end');source.focus();dirtyDraft=true;capture();review();});
  $('studio-save').addEventListener('click',save);
  $('studio-run').addEventListener('click',()=>{if(!save())return;dialog.close();machine.runProgram(slot);onChange();$('shell').focus({preventScroll:true});$('shell').scrollIntoView({block:'start',behavior:'instant'});});
  $('studio-undo').addEventListener('click',()=>{
    if(!undo||machine.prog?.stage==='running')return;
    const snap=machine.programSnapshot();
    // The calculator editor and library may change a slot after this dialog's
    // last review. Compare again immediately before restoring that slot.
    if(!undoMatches(snap)){$('studio-undo').disabled=true;undoConflict();return;}
    snap.slots[undo.slot]=undo.saved;
    if(machine.restoreProgramSnapshot(snap)){
      // Undo restores the calculator save. Drafts typed since that save are
      // independent work, including drafts in a slot that is not displayed.
      undo=null;persistDrafts();const keptDrafts=drafts.some(Boolean),draftsPersisted=storageAvailable;
      const persisted=persistPrograms();onChange();select(slot);
      const draftNote=!keptDrafts?'':draftsPersisted?'未保存草稿已保留。':'未保存草稿只保留在本頁；瀏覽器無法永久保存草稿，請下載文字備份。';
      message((persisted?'已撤銷上次保存，還原該位置的程式。':'已在本頁撤銷，但瀏覽器無法永久儲存；刷新後可能恢復舊內容。請下載文字備份。')+draftNote,!persisted||(keptDrafts&&!draftsPersisted));
    }
    else message('無法還原上次保存，請先檢查共享記憶體容量；現有程式已保留。',true);
  });
  $('studio-export').addEventListener('click',()=>{const blob=new Blob([source.value],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`CalcX-P${slot+1}-${mode.value}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const resize=()=>document.documentElement.style.setProperty('--visual-height',`${window.visualViewport?.height||window.innerHeight}px`);
  window.visualViewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);resize();
  return {isOpen:()=>dialog.open,
    getDraft:index=>drafts[index],
    setDraft(index,value){drafts[index]=value;persistDrafts();if(slot===index)select(slot);}
  };
}
