import { SPECIES } from './rules.js?v=0.6.8-1';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// The live collection is the only source of occupancy. Delivered prisoners leave it.
export function rainbowMarkup(state) {
  const avatars=state.rainbow.map(p=>{
    const species=SPECIES.find(s=>s.id===p.code),name=`绮彩${species?.name??'囚犯'}`;
    return `<div class="rainbow-avatar" data-rainbow-id="${escape(p.id)}" role="img" aria-label="${escape(name)}" title="${escape(name)} · 单独收容"><span class="rainbow-face portrait ${escape(species?.id??'')}" aria-hidden="true"></span><span class="rainbow-frame" aria-hidden="true"></span><span class="rainbow-name" aria-hidden="true">${escape(species?.name??'囚犯')}</span></div>`;
  }).join('');
  const slots=Array.from({length:Math.max(0,6-state.rainbow.length)},()=>'<div class="rainbow-slot" aria-hidden="true"><span class="rainbow-slot-mark">◇</span></div>').join('');
  return `<div class="rainbow-grid">${avatars}${slots}</div>`;
}

export function rainbowArrivals(before,after,action={}) {
  const previous=new Set(before.rainbow.map(p=>p.id));
  return after.rainbow.filter(p=>!previous.has(p.id)).map(prisoner=>{
    const source=before.rooms.find(r=>r.prisoner?.id===prisoner.id);
    const room=source?.id??(['visit','reroll','eat','event'].includes(action.type)&&Number.isInteger(action.room)?action.room:null);
    return {prisoner,room};
  });
}

// Run after rendering the committed state, for both the Three.js and CSS scenes.
export async function animateRainbowArrivals(before,after,action,{enabled=true,fast=false,root=document}={}) {
  if(!enabled||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const grid=root.querySelector('#rainbow');
  if(!grid)return;
  const avatars=[...grid.querySelectorAll('[data-rainbow-id]')];
  await Promise.all(rainbowArrivals(before,after,action).map(async({prisoner,room})=>{
    const target=avatars.find(node=>node.dataset.rainbowId===prisoner.id);
    if(!target)return;
    const from=room===null?null:root.querySelector(`[data-room="${room}"]`);
    const pulse=target.animate?.([{filter:'brightness(1)',transform:'scale(1)'},{filter:'brightness(1.7)',transform:'scale(1.07)',offset:.55},{filter:'brightness(1)',transform:'scale(1)'}],{duration:fast?220:480,easing:'ease-out'});
    let ghost,flight;
    if(from&&root.body){
      const a=from.getBoundingClientRect(),b=target.getBoundingClientRect();
      const size=Math.max(22,Math.min(a.width,a.height)*.7);
      ghost=root.createElement('div');
      ghost.className=`rainbow-arrival-ghost portrait ${SPECIES.find(s=>s.id===prisoner.code)?.id??''}`;
      ghost.setAttribute('aria-hidden','true');
      Object.assign(ghost.style,{left:`${a.x+a.width/2-size/2}px`,top:`${a.y+a.height/2-size/2}px`,width:`${size}px`,height:`${size}px`});
      root.body.append(ghost);
      const x=b.x+b.width/2-a.x-a.width/2,y=b.y+b.height/2-a.y-a.height/2;
      flight=ghost.animate?.([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${x*.45}px,${y*.45-22}px) scale(.8)`,opacity:1,offset:.5},{transform:`translate(${x}px,${y}px) scale(.3)`,opacity:0}],{duration:fast?160:360,easing:'cubic-bezier(.2,.7,.3,1)'});
    }
    try{await Promise.all([pulse?.finished,flight?.finished].filter(Boolean));}
    catch{ /* The committed collection remains visible if an animation is interrupted. */ }
    finally{pulse?.cancel();flight?.cancel();ghost?.remove();}
  }));
}
