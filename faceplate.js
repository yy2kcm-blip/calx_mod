// Presentation only. Artwork approved for public use by the owner on 2026-10-11.
import {SHELL_W,SHELL_H} from './js/keymap.js';
import {GLASS} from './js/lcd.js';
export const FACEPLATE=Object.freeze({id:'photo-private-layout',material:'Owner-approved generated faceplate'});
export function mountFaceplate(shell,keys){
 shell.dataset.skin=FACEPLATE.id;
 const pct=(v,t)=>v/t*100+'%';
 Object.assign(shell.querySelector('#lcd').style,{left:pct(GLASS.x,SHELL_W),top:pct(GLASS.y,SHELL_H),width:pct(GLASS.w,SHELL_W),height:pct(GLASS.h,SHELL_H)});
 const buttons=new Map();
 for(const key of keys){const b=document.createElement('button');b.type='button';b.className='key';b.dataset.id=key.id;b.dataset.key=key.id;
 const extra=[key.id!=='FMLA'&&key.shift&&'SHIFT: '+key.shift,key.alpha&&'ALPHA: '+key.alpha,key.cmplxDirect&&'CMPLX: '+key.cmplxDirect].filter(Boolean);
 b.setAttribute('aria-label',key.base+' 鍵'+(extra.length?'，'+extra.join('，'):''));b.title=b.getAttribute('aria-label');
 Object.assign(b.style,{left:pct(key.x,SHELL_W),top:pct(key.y,SHELL_H),width:pct(key.w,SHELL_W),height:pct(key.h,SHELL_H)});shell.append(b);buttons.set(key.id,b);}
 return {buttons,updateMode(){}};
}
