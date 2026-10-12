/* Torchlight Council atmosphere engine.
 * ALL numbers from this module are synthetic visual demo values.
 * Never persist them, send them to Supabase, or present them as real ballots.
 */
function stableHash(value){
 let hash=2166136261;
 for(const letter of String(value)){
   hash^=letter.charCodeAt(0);
   hash=Math.imul(hash,16777619);
 }
 return hash>>>0;
}
function sequence(seed){
 let s=seed>>>0;
 return function random(){
   s=(s+0x6D2B79F5)>>>0;
   let r=Math.imul(s^(s>>>15),1|s);
   r^=r+Math.imul(r^(r>>>7),61|r);
   return ((r^(r>>>14))>>>0)/4294967296;
 };
}
export function createHeatEngine(heroes,topics,officialSeats,seed=20261012){
 const rand=sequence(seed),hero={},poll={},seat={};
 const heroIds=heroes.map(h=>h.id);
 for(const [index,id] of heroIds.entries()){
   const score=stableHash(id);
   hero[id]=75+(score%63)+(index<10?22:0);
 }
 for(const t of topics){
   const map={};
   for(const [index,choice] of t.options.entries()){
     const id=choice[0];
     map[id]=27+(stableHash(t.id+":"+id)%65)+index*3;
   }
   poll[t.id]=map;
 }
 for(const key of officialSeats){
   seat[key]=10+(stableHash(key)%39);
 }
 let ticks=0;
 const choose=items=>items[Math.floor(rand()*items.length)];
 const increment=()=>1+Math.floor(rand()*4);
 function advance(){
   const stage=(ticks++)%7;
   if((stage===0||stage===1||stage===3||stage===5)&&heroIds.length){
     const top=heroIds.slice().sort((a,b)=>hero[b]-hero[a]);
     const range=top.slice(0,Math.min(8,top.length));
     const nearest=range.filter(id=>hero[id]>=hero[range[0]]-12);
     const id=rand()<.74?choose(nearest.length?nearest:range):choose(heroIds);
     const delta=increment()+(rand()<.12?4:0);
     hero[id]+=delta;
     return{type:"hero",id,delta,value:hero[id]};
   }
   if((stage===2||stage===6)&&topics.length){
     const topic=topics[(ticks+Math.floor(rand()*topics.length))%topics.length];
     const choice=choose(topic.options)[0],delta=increment();
     poll[topic.id][choice]+=delta;
     return{type:"topic",topic:topic.id,id:choice,delta,value:poll[topic.id][choice]};
   }
   const key=choose(officialSeats),delta=increment();
   seat[key]=(seat[key]||0)+delta;
   return{type:"seat",id:key,delta,value:seat[key]};
 }
 return{
   hero:id=>Number(hero[id]||0),
   poll:(topic,choice)=>Number(poll[topic]?.[choice]||0),
   seat:key=>Number(seat[key]||0),
   heroTotal:()=>Object.values(hero).reduce((a,b)=>a+b,0),
   advance,
   snapshot:()=>({hero:{...hero},poll:Object.fromEntries(Object.entries(poll).map(([k,v])=>[k,{...v}])),seat:{...seat}}),
   ticks:()=>ticks
 };
}
