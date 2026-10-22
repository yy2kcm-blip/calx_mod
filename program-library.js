import {catalog as publicCatalog} from './program-library-catalog.js';
import {parseProgramText} from './js/program-codec.js';
import {bytesOf,tok} from './js/tokens.js';
export function setupProgramLibrary(machine,onChange,persist,studio,options={}){
  const catalog=options.catalog||publicCatalog;
  const title=options.local?'本地程式庫':'程式庫';
  const undoKey=options.local?'calcx-local-injection-undo-v1':'calcx-public-injection-undo-v1';
  const opener=document.createElement('button');
  opener.className='studio-open';opener.textContent=title+' · 一鍵注入';
  document.querySelector('[data-open-studio]').after(opener);
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-labelledby','local-library-title');
  dialog.innerHTML=`<header class="dialog-header"><div><p class="eyebrow">${title}</p><h2 id="local-library-title">一鍵注入 Program</h2></div><button class="close-button" aria-label="關閉程式庫">×</button></header>
  <div class="dialog-content"><p>初始四個槽均為空白。選擇程式和位置後注入，已注入的程式會保存在此瀏覽器。</p>
  <label>選擇程式 <select id="local-program"></select></label><p id="local-description"></p>
  <label>注入位置 <select id="local-slot"></select></label><p id="local-capacity"></p><p id="local-target"></p>
  <output id="local-feedback" role="status" aria-live="polite"></output></div>
  <footer class="dialog-actions"><button id="local-undo">撤銷上次注入</button><button id="local-install" class="primary">注入</button></footer>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id),picker=$('local-program'),slot=$('local-slot'),install=$('local-install'),undoButton=$('local-undo'),feedback=$('local-feedback');
  for(const p of catalog){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;picker.append(option);}
  for(let i=0;i<4;i++){const option=document.createElement('option');option.value=i;option.textContent='P'+(i+1);slot.append(option);}
  let undo=null;
  try{undo=JSON.parse(localStorage.getItem(undoKey)||'null');if(!Number.isInteger(undo?.slot)||undo.slot<0||undo.slot>3)undo=null;}catch{}
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const message=t=>{feedback.textContent=t;};
  function review(){
    const p=catalog.find(p=>p.id===picker.value),index=Number(slot.value),snapshot=machine.programSnapshot();
    const parsed=parseProgramText(p.source,p.mode);
    const other=snapshot.slots.reduce((sum,s,i)=>sum+(i!==index&&s?bytesOf(s.tokens.map(tok)):0),0);
    for(let i=0;i<4;i++)slot.options[i].textContent=`P${i+1} · ${snapshot.slots[i]?.tokens.length?'已有程式':'空白'}`;
    $('local-description').textContent=p.description;
    $('local-capacity').textContent=`${p.mode} · ${parsed.bytes} B；注入後合計 ${other+parsed.bytes} / 680 B`;
    $('local-target').textContent=snapshot.slots[index]?.tokens.length?`將替換 P${index+1} 的程式，可撤銷上次注入。`:`將寫入空白的 P${index+1}。`;
    const busy=machine.prog?.stage==='running';
    install.disabled=busy||parsed.errors.length>0||other+parsed.bytes>680;
    install.textContent=snapshot.slots[index]?.tokens.length?`替換 P${index+1}（可撤銷）`:`注入到 P${index+1}`;
    undoButton.disabled=busy||!undo||!same(snapshot.slots[undo.slot],undo.after);
    if(busy)message('程式正在執行。請先關閉程式庫，按 ON 結束後再注入。');
    else if(other+parsed.bytes>680)message('記憶體不足，請選擇其他位置或先整理程式。');
    return {p,index,snapshot,parsed};
  }
  function close(){dialog.close();opener.focus();}
  opener.addEventListener('click',()=>{message('');review();dialog.showModal();});
  dialog.querySelector('.close-button').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  picker.addEventListener('change',()=>{message('');review();});slot.addEventListener('change',()=>{message('');review();});
  install.addEventListener('click',()=>{
    const {p,index,snapshot,parsed}=review();if(install.disabled)return;
    const draft=studio.getDraft(index);
    machine.setStudioProgram(index,p.mode,parsed.tokenIds);
    undo={slot:index,before:snapshot.slots[index],after:machine.programSnapshot().slots[index],draft};
    studio.setDraft(index,null);
    const saved=persist();try{localStorage.setItem(undoKey,JSON.stringify(undo));}catch{}
    onChange();review();message(`${p.name}已注入 P${index+1}。按 Prog → ${index+1} 運行。${saved?'':'瀏覽器未能保存，請下載文字備份。'}`);
  });
  undoButton.addEventListener('click',()=>{
    review();if(undoButton.disabled)return;
    const snapshot=machine.programSnapshot(),index=undo.slot;snapshot.slots[index]=undo.before;
    if(!machine.restoreProgramSnapshot(snapshot))return;
    studio.setDraft(index,undo.draft||null);undo=null;
    try{localStorage.removeItem(undoKey);}catch{}
    const saved=persist();onChange();review();message(saved?`已還原 P${index+1}。`:`已在本頁還原 P${index+1}，但瀏覽器未能保存；刷新後可能恢復舊內容。請下載文字備份。`);
  });
  const studioOpen=studio.isOpen;studio.isOpen=()=>dialog.open||studioOpen();
}
