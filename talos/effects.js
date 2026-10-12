export class PrisonEffects {
  constructor({enabled=()=>true,fast=()=>false}={}){this.enabled=enabled;this.fast=fast;}
  get active(){return this.enabled()&&!matchMedia('(prefers-reduced-motion: reduce)').matches;}
  get rate(){return this.fast()?0.45:1;}
  room(id){return document.querySelector(`[data-room="${id}"]`);}
  async animate(node,frames,duration){
    if(!node||!this.active||!node.animate)return;
    const animation=node.animate(frames,{duration:duration*this.rate,easing:'cubic-bezier(.2,.7,.3,1)'});
    try{await animation.finished;}catch{}finally{animation.cancel();}
  }
  async fly(from,to,code,kind='prey'){
    if(!from||!to||!this.active)return;
    const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
    const size=Math.max(24,Math.min(a.width,a.height)*.65),node=document.createElement('div');
    node.className=kind==='prey'?`fx-ghost portrait ${code}`:'fx-warden';node.setAttribute('aria-hidden','true');
    Object.assign(node.style,{left:`${a.x+a.width/2-size/2}px`,top:`${a.y+a.height/2-size/2}px`,width:`${size}px`,height:`${size}px`});document.body.append(node);
    const x=b.x+b.width/2-a.x-a.width/2,y=b.y+b.height/2-a.y-a.height/2;
    try{await this.animate(node,[{transform:'translate3d(0,0,0) scale(1)',opacity:1},{transform:`translate3d(${x*.5}px,${y*.5-30}px,0) scale(.75)`,opacity:.95,offset:.5},{transform:`translate3d(${x}px,${y}px,0) scale(.12)`,opacity:0}],340);}finally{node.remove();}
  }
  async before(action,before){
    if(!this.active)return;
    const node=this.room(action.room);
    if(action.type==='eat'){
      const prey=this.room(action.prey),visiblePrey=before.rooms[action.prey]?.prisoner;
      const animations=[this.animate(node,[{transform:'translateY(0)'},{transform:'translateY(-5px) scale(1.04)',filter:'brightness(1.65)'},{transform:'translateY(0)'}],340)];
      if(visiblePrey)animations.push(this.fly(prey,node,visiblePrey.code),this.animate(prey,[{opacity:1},{opacity:.1,filter:'brightness(2)'}],300));
      // A closed scratch room exposes its rarity, never the concealed animal's identity.
      else animations.push(this.animate(prey,[{filter:'brightness(1)',boxShadow:'inset 0 0 0 0 #ffe1ab'},{filter:'brightness(2.2)',boxShadow:'inset 0 0 0 3px #ffe1ab'},{filter:'brightness(1)',boxShadow:'inset 0 0 0 0 #ffe1ab'}],340));
      await Promise.all(animations);
    }
    else if(action.type==='visit'){
      const doors=node?.querySelectorAll('.cell-door');
      await Promise.all([this.fly(this.room(before.position),node,null,'warden'),...[...(doors??[])].map((door,i)=>this.animate(door,[{transform:'rotateY(0deg)'},{transform:`rotateY(${i?108:-108}deg)`,opacity:.1}],300))]);
    }else if(action.type==='reroll')await this.animate(node,[{filter:'brightness(1)',transform:'rotateY(0deg)'},{filter:'brightness(2.5)',transform:'rotateY(72deg)'},{filter:'brightness(1)',transform:'rotateY(0deg)'}],280);
    else if(action.type==='end')await this.animate(document.querySelector('.game-stage'),[{filter:'brightness(1)'},{filter:'brightness(.7)'},{filter:'brightness(1)'}],200);
  }
  async after(before,after,action){
    if(!this.active)return;
    const animations=[];
    for(const room of after.rooms){const old=before.rooms[room.id];if(room.prisoner&&(old.status==='closed'||room.prisoner.tier!==old.prisoner?.tier||room.prisoner.code!==old.prisoner?.code))animations.push(this.animate(this.room(room.id),[{filter:'brightness(2)',transform:'translateY(-5px)'},{filter:'brightness(1)',transform:'translateY(0)'}],270));}
    if(action.type==='choose')animations.push(this.animate(document.querySelector('.game-tools'),[{filter:'brightness(2.2)'},{filter:'brightness(1)'}],220));
    await Promise.all(animations);
  }
}
