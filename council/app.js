(function(){
"use strict";
const $=id=>document.getElementById(id);
const SS14_OPEN=Date.parse("2026-10-16T10:00:00+08:00");
const ROUNDTABLE_END=Date.parse("2026-10-14T20:00:00+08:00");
const STORAGE_KEY="torchlight-council-preview-choice-v1";
const MANIFEST_URL="/assets/torchlight-mentor-avatars/manifest.json";
const ALIASES={
  youga_1:"时空1",youga_2:"时空2",youga_3:"时空3",
  bing_1:"宾1",bing_2:"宾2",selena_1:"人鱼1",selena_2:"人鱼2",
  carino_1:"枪1",carino_2:"枪2",carino_3:"枪3",
  erika_1:"猫1",erika_2:"猫2",erika_3:"猫3",
  gemma_1:"吉玛1",gemma_2:"冰2",gemma_4:"吉玛4",
  rehan_1:"狂1",rehan_2:"狂2",iris_1:"魔灵1",iris_2:"魔灵2",
  rosa_1:"罗莎1",rosa_2:"罗莎2",thea_1:"希雅1",thea_2:"希雅2",thea_3:"希雅3",
  moto_1:"莫托1",moto_2:"莫托2",sage_1:"药娘"
};
const PREVIEW_COUNTS={
  youga_3:202,bing_2:184,selena_2:163,carino_2:149,
  erika_2:133,gemma_2:115,iris_2:103,rehan_2:100,
  carino_1:96,carino_3:91,erika_1:88,erika_3:83,
  bing_1:79,gemma_1:76,gemma_4:73,thea_1:70,
  thea_2:67,thea_3:64,youga_1:61,youga_2:59,
  moto_1:57,moto_2:54,rosa_1:51,rosa_2:49,
  iris_1:47,selena_1:45,rehan_1:42,sage_1:40
};
const LEGACY={
  yuga3:"youga_3",yuga1:"youga_1",yuga2:"youga_2",
  bin2:"bing_2",bin1:"bing_1",selena2:"selena_2",selena1:"selena_1",
  carino2:"carino_2",carino1:"carino_1",carino3:"carino_3",
  erika2:"erika_2",erika1:"erika_1",erika3:"erika_3",
  gemma1:"gemma_2",gemma2:"gemma_1",gemma3:"gemma_4",
  raine1:"rehan_1",raine2:"rehan_2",thea1:"thea_1",thea2:"thea_2",thea3:"thea_3",
  moto1:"moto_1",moto2:"moto_2",moto3:"rosa_1",rosa1:"rosa_2",
  iris1:"iris_1",iris2:"iris_2",sechi1:"sage_1"
};
const COLORS=["#a5dcff","#b8e3a4","#ffd84d","#ffceab","#ffb9cc","#d5c4f9"];
const heroMap=new Map();
const heroes=[];
const rosterCards=new Map();
const chartCards=new Map();
const state={hero:null,maze:null,roundtable:null,simulated:{},motion:true,slotResult:null,spinning:false};
const polling=[
 {id:"maze",host:"maze-options",summary:"maze-summary",closedAt:null,choices:[["support","可以接受",78],["oppose","改得太狠了",71]]},
 {id:"roundtable",host:"roundtable-options",summary:"roundtable-summary",closedAt:ROUNDTABLE_END,choices:[["drops","掉落和刷图收益",47],["balance","英雄和技能平衡",45],["pets","契灵氪金体验",43],["season","赛季玩法节奏",41]]}
];
const reducedMotion=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
let loaded=false;
let mobile=window.innerWidth<=700;
let lastToastTimer=0;
let slotTimer=0;
let lastActivity="";
let activityClock=0;
const sourceName=hero=>hero.name+" · "+hero.trait;
const isHeroClosed=()=>Date.now()>=SS14_OPEN;
const isTopicClosed=topic=>topic.closedAt!==null&&Date.now()>=topic.closedAt;
const fmt=value=>new Intl.NumberFormat("zh-CN").format(value);
const count=hero=>hero.initial+(state.hero===hero.id?1:0)+(state.simulated[hero.id]||0);
const sorted=()=>heroes.slice().sort((a,b)=>count(b)-count(a)||a.id.localeCompare(b.id));
function random(n){
 if(!Number.isInteger(n)||n<1)throw new Error("没有可选英雄");
 if(!window.crypto||!window.crypto.getRandomValues)throw new Error("当前浏览器无法安全随机抽签");
 const data=new Uint32Array(1),cutoff=Math.floor(4294967296/n)*n;
 do {window.crypto.getRandomValues(data);} while(data[0]>=cutoff);
 return data[0]%n;
}
function sampleOne(items){return items[random(items.length)];}
function safeChoice(id){return LEGACY[id]||id;}
function readChoice(){
 try{
  const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
  if(heroMap.has(safeChoice(data.hero)))state.hero=safeChoice(data.hero);
  polling.forEach(topic=>{
   // Compatibility with the previous preview options, preserving meaningful choices.
   const previous={maze:{agree:"support",disagree:"oppose"},roundtable:{}};
   const opt=previous[topic.id]?.[data[topic.id]]||data[topic.id];
   if(topic.choices.some(choice=>choice[0]===opt))state[topic.id]=opt;
  });
 }catch(error){ /* Storage may be denied in privacy mode. */ }
}
function saveChoice(){
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify({hero:state.hero,maze:state.maze,roundtable:state.roundtable}));}
 catch(error){toast("浏览器未允许保存选择，刷新后可能丢失");}
}
function toast(text){
 let node=$("tc-toast");
 if(!node){node=document.createElement("div");node.id="tc-toast";node.className="toast";node.setAttribute("role","status");document.body.appendChild(node);}
 node.textContent=text;node.hidden=false;
 clearTimeout(lastToastTimer);lastToastTimer=setTimeout(()=>{node.hidden=true;},3100);
}
function newPortrait(asset,alt,className){
 const img=document.createElement("img");
 img.className=className||"";
 img.alt=alt;img.loading="lazy";img.decoding="async";img.referrerPolicy="no-referrer";
 return img;
}
function portrait(hero,small){
 const holder=document.createElement("span");holder.className=small?"portrait small":"portrait";
 const fallback=document.createElement("span");fallback.className="portrait-fallback";fallback.textContent=hero.trait.slice(0,1);fallback.setAttribute("aria-hidden","true");
 const img=newPortrait(hero.asset,sourceName(hero)+"头像","");
 img.addEventListener("load",()=>{fallback.hidden=true;});
 img.addEventListener("error",()=>{img.hidden=true;fallback.hidden=false;holder.classList.add("portrait-error");});
 img.src=hero.asset.site_url;
 holder.append(fallback,img);
 return holder;
}
function validAsset(asset,type){
 if(!asset||asset.type!==type||typeof asset.id!=="string"||!asset.id||typeof asset.repository_path!=="string"||typeof asset.site_url!=="string")return false;
 try{
  const uri=new URL(asset.site_url);
  if(uri.protocol!=="https:"||uri.hostname!=="torchlightskill.com"||uri.pathname!=="/"+asset.repository_path)return false;
 }catch(error){return false;}
 if(type==="hero")return asset.id===asset.trait&&!!asset.name&&!!asset.trait_name&&!!asset.source_url&&!!asset.source_snapshot_date&&!!asset.source_freshness;
 if(type==="mentor")return ["mia","shiyu","reina"].includes(asset.id);
 return false;
}
async function getManifest(){
 const response=await fetch(MANIFEST_URL,{cache:"no-cache"});
 if(!response.ok)throw new Error("HTTP "+response.status);
 const m=await response.json();
 if(!m||m.schema_version!==1||!Array.isArray(m.assets))throw new Error("头像清单格式有变化");
 const relevant=m.assets.filter(a=>a.type==="hero"||a.type==="mentor");
 const seen=new Set();
 relevant.forEach(a=>{
  if(!validAsset(a,a.type))throw new Error("头像资料有误："+String(a.id));
  const key=a.type+":"+a.id;
  if(seen.has(key))throw new Error("重复头像："+key);
  seen.add(key);
 });
 const h=relevant.filter(a=>a.type==="hero"),mentors=relevant.filter(a=>a.type==="mentor");
 if(h.length!==28||mentors.length!==3||!["mia","shiyu","reina"].every(id=>mentors.some(a=>a.id===id)))throw new Error("英雄或导师头像数量有变化");
 h.forEach((a,i)=>{
  const hero={id:a.id,name:a.name,trait:a.trait_name,alias:ALIASES[a.id]||a.name,asset:a,color:COLORS[i%COLORS.length],initial:PREVIEW_COUNTS[a.id]??30};
  heroes.push(hero);heroMap.set(hero.id,hero);
 });
 // Hidden mentor section deliberately retains its implementation and source mapping.
 mentors.forEach(a=>{
  const node=document.querySelector('[data-mentor-image="'+a.id+'"]');
  if(node){node.dataset.siteUrl=a.site_url;node.dataset.assetId=a.id;}
 });
 renderSources(m,relevant);
 return m;
}
function renderSources(m,assets){
 $("avatar-source-status").textContent="头像清单 v"+m.schema_version+"（"+m.published_date+"）。共 "+assets.filter(a=>a.type==="hero").length+" 个英雄特性与 3 位导师。素材说明："+m.rights;
 const group=document.createDocumentFragment();
 assets.forEach(a=>{
  const li=document.createElement("li");
  const title=document.createElement("strong");title.textContent=a.type==="hero"?a.name+" · "+a.trait_name+"（"+a.id+"）":a.name+"（导师 "+a.id+"）";
  li.appendChild(title);
  const detail=document.createElement("small");
  detail.textContent=a.type==="hero"?(a.source_snapshot_date+" · "+a.source_freshness+(a.covered_face?" · 有遮面":"")):(a.source||"素材授权待核");
  li.appendChild(detail);
  if(a.source_url){
   const link=document.createElement("a");link.href=a.source_url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="原始图片 ↗";li.appendChild(link);
  }
  group.appendChild(li);
 });
 $("avatar-source-list").replaceChildren(group);
}
function makeChartHero(hero){
 const b=document.createElement("button");b.type="button";b.className="contender";b.dataset.hero=hero.id;
 b.style.setProperty("--hero-color",hero.color);
 const head=document.createElement("span");head.className="contender-head";
 const rank=document.createElement("span");rank.className="contender-rank";
 const number=document.createElement("span");number.className="contender-number";
 const avatar=portrait(hero,true);
 head.append(rank,number,avatar);
 const bar=document.createElement("span");bar.className="contender-bar";
 const meta=document.createElement("span");meta.className="contender-meta";
 const heroName=document.createElement("strong");heroName.textContent=hero.name;
 const heroTrait=document.createElement("small");heroTrait.textContent=hero.trait;
 meta.append(heroName,heroTrait);
 b.append(head,bar,meta);
 b.addEventListener("click",()=>voteHero(hero.id,b));
 chartCards.set(hero.id,{button:b,rank,number,avatar,bar});
 return b;
}
function chart(){
 if(!loaded)return;
 const r=sorted(),take=mobile?4:6,max=Number(count(r[0]))||1;
 const stage=$("chart"),oldRects=new Map();
 Array.from(stage.querySelectorAll(".contender")).forEach(b=>oldRects.set(b.dataset.hero,b.getBoundingClientRect()));
 const frag=document.createDocumentFragment();
 r.slice(0,take).forEach((hero,index)=>{
  if(!chartCards.has(hero.id))makeChartHero(hero);
  const refs=chartCards.get(hero.id);
  const b=refs.button;
  refs.rank.textContent=String(index+1).padStart(2,"0");
  refs.number.textContent=fmt(count(hero));
  // Use consistent zero baseline and a fixed chart height: no label overlap.
  const maxPixels=mobile?172:188;
  refs.bar.style.height=Math.max(4,Math.round(count(hero)/max*maxPixels))+"px";
  b.classList.toggle("leader",index===0);
  b.classList.toggle("mine",state.hero===hero.id);
  b.disabled=isHeroClosed();
  b.setAttribute("aria-pressed",String(state.hero===hero.id));
  b.setAttribute("aria-label",sourceName(hero)+"，"+count(hero)+"张模拟票，排第"+(index+1)+"，"+(state.hero===hero.id?"已选":"点击投票"));
  frag.appendChild(b);
 });
 stage.replaceChildren(frag);
 if(!reducedMotion)stage.querySelectorAll(".contender").forEach(b=>{
  const old=oldRects.get(b.dataset.hero);
  if(!old||!b.animate)return;
  const delta=old.left-b.getBoundingClientRect().left;
  if(Math.abs(delta)>2)b.animate([{transform:"translateX("+delta+"px)"},{transform:"translateX(0px)"}],{duration:460,easing:"cubic-bezier(.2,.8,.2,1)"});
 });
 $("ranking-label").textContent=take;
 $("demo-vote-total").textContent=fmt(heroes.reduce((sum,h)=>sum+count(h),0));
 $("hero-total").textContent=heroes.length;
 const mine=heroMap.get(state.hero);
 if(mine){
  const place=r.findIndex(h=>h.id===mine.id)+1;
  $("my-camp").textContent="我选了 "+sourceName(mine)+" · 当前演示榜第 "+place+" 名";
 }else{
  const requested=new URLSearchParams(location.search).get("hero");
  const linked=heroMap.get(safeChoice(requested));
  $("my-camp").textContent=linked?"朋友推荐你看看 "+sourceName(linked)+"，可以在下面投票。":"还没投票，往下选一个英雄。";
 }
}
function makeRosterHero(hero){
 const b=document.createElement("button");b.type="button";b.className="roster-card";b.dataset.hero=hero.id;
 b.style.setProperty("--hero-color",hero.color);
 const face=portrait(hero,false);
 const info=document.createElement("span");info.className="roster-info";
 const heroName=document.createElement("strong");heroName.textContent=hero.name;
 const trait=document.createElement("span");trait.textContent=hero.trait;
 const alias=document.createElement("small");alias.textContent=hero.alias;
 info.append(heroName,trait,alias);
 const right=document.createElement("span");right.className="roster-count";
 const votes=document.createElement("strong");const tick=document.createElement("span");tick.className="roster-check";tick.textContent="投票";
 right.append(votes,tick);
 const meter=document.createElement("span");meter.className="roster-meter";const meterValue=document.createElement("span");meter.append(meterValue);
 b.append(face,info,right,meter);
 b.addEventListener("click",()=>voteHero(hero.id,b));
 rosterCards.set(hero.id,{button:b,votes,check:tick,meter:meterValue});
 return b;
}
function buildRoster(){
 const frag=document.createDocumentFragment();
 const order=heroes.slice().sort((a,b)=>b.initial-a.initial||a.id.localeCompare(b.id));
 order.forEach(h=>frag.appendChild(makeRosterHero(h)));
 $("hero-list").replaceChildren(frag);
 updateRoster();
}
function updateRoster(){
 if(!loaded)return;
 const max=Math.max(...heroes.map(h=>count(h)),1);
 rosterCards.forEach((ref,id)=>{
  const h=heroMap.get(id),v=count(h);
  ref.votes.textContent=fmt(v);
  ref.check.textContent=state.hero===id?"已投":"投票";
  ref.button.classList.toggle("selected",state.hero===id);
  ref.button.disabled=isHeroClosed();
  ref.button.setAttribute("aria-pressed",String(state.hero===id));
  ref.button.setAttribute("aria-label",sourceName(h)+"，模拟"+v+"票，"+(state.hero===id?"已投":"投票"));
  ref.meter.style.width=Math.round(v/max*100)+"%";
 });
 searchRoster();
}
function searchRoster(){
 if(!loaded)return;
 const query=$("hero-search").value.trim().toLowerCase();
 let shown=0;
 rosterCards.forEach((ref,id)=>{
  const h=heroMap.get(id);
  const matches=!query||[h.name,h.trait,h.alias,sourceName(h)].join(" ").toLowerCase().includes(query);
  ref.button.hidden=!matches;
  if(matches)shown++;
 });
 $("hero-search-summary").textContent=shown+" / "+heroes.length+" 个";
 $("roster-empty").hidden=shown>0;
}
function animateTap(target){
 if(!target||reducedMotion)return;
 const plus=document.createElement("span");plus.className="tap-plus";plus.textContent="+1";
 target.appendChild(plus);
 setTimeout(()=>plus.remove(),760);
}
function voteHero(id,clicked){
 if(!loaded)return;
 const h=heroMap.get(id);if(!h)return;
 if(isHeroClosed()){toast("这期开荒投票已经结束");return;}
 if(state.hero===id){toast("已经投给 "+sourceName(h)+" 了");return;}
 const was=heroMap.get(state.hero);
 state.hero=id;saveChoice();chart();updateRoster();
 if(clicked&&clicked.classList.contains("roster-card"))animateTap(clicked);
 const newNode=chartCards.get(id)?.button;
 if(newNode&&newNode.isConnected)bubble(h,"你投了 +1",false);
 showActivity("你投给了 "+sourceName(h)+" · "+(was?"已从 "+sourceName(was)+" 改选":"投票成功"),false);
 toast("已投给 "+sourceName(h)+(was?" · 可以继续改选":""));
}
function showActivity(value,simulated){
 lastActivity=value;
 const now=new Date();
 const stamp=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
 $("activity-line").textContent=stamp+" · "+(simulated?"模拟：":"")+value;
}
function bubble(hero,label,simulation){
 const item=chartCards.get(hero.id);
 const b=item?.button;
 if(!b||!b.isConnected||reducedMotion)return;
 const root=$("arena-stage");
 if(document.hidden)return;
 const target=item.avatar.getBoundingClientRect(),area=root.getBoundingClientRect();
 const x=Math.max(74,Math.min(area.width-74,target.left+target.width/2-area.left));
 const y=Math.max(63,target.top-area.top-4);
 const bubble=document.createElement("div");bubble.className="vote-bubble";
 bubble.style.left=x+"px";bubble.style.top=y+"px";
 const image=newPortrait(hero.asset,"","bubble-avatar");image.src=hero.asset.site_url;
 const line=document.createElement("span");line.className="bubble-copy";
 const lineTop=document.createElement("strong");lineTop.textContent=simulation?"演示 +1":label;
 const lineBottom=document.createElement("small");lineBottom.textContent=sourceName(hero);
 line.append(lineTop,lineBottom);
 bubble.append(image,line);
 $("bubble-layer").appendChild(bubble);
 setTimeout(()=>bubble.remove(),1900);
}
function tickDemo(){
 if(!loaded||!state.motion||isHeroClosed()||document.hidden)return;
 const top=sorted().slice(0,Math.min(mobile?4:6,heroes.length));
 const candidate=top[random(top.length)];
 state.simulated[candidate.id]=(state.simulated[candidate.id]||0)+1;
 chart();updateRoster();bubble(candidate,"",true);
 showActivity("有人投给了 "+sourceName(candidate)+" +1",true);
}
function toggleMotion(){
 state.motion=!state.motion;
 $("motion-toggle").textContent=state.motion?"暂停演示":"继续演示";
 $("motion-toggle").setAttribute("aria-pressed",String(state.motion));
 showActivity(state.motion?"已继续播放模拟投票":"模拟动态已暂停",false);
}
function renderTopic(topic){
 const host=$(topic.host);
 if(host.children.length!==topic.choices.length){
  const frag=document.createDocumentFragment();
  topic.choices.forEach((option,index)=>{
   const b=document.createElement("button");b.type="button";b.className="poll-button";b.dataset.option=option[0];
   b.innerHTML='<span class="poll-meter" aria-hidden="true"></span><span class="poll-option-index"></span><span class="poll-name"></span><span class="poll-pct"></span>';
   b.querySelector(".poll-name").textContent=option[1];
   b.addEventListener("click",()=>voteTopic(topic,option[0]));
   frag.appendChild(b);
  });
  host.replaceChildren(frag);
 }
 const totals=topic.choices.map(c=>c[2]+(state[topic.id]===c[0]?1:0));
 const sum=totals.reduce((a,b)=>a+b,0)||1;
 Array.from(host.children).forEach((b,i)=>{
  const option=topic.choices[i],amount=totals[i],pct=Math.round(amount/sum*100);
  b.querySelector(".poll-meter").style.width=pct+"%";
  b.querySelector(".poll-option-index").textContent=state[topic.id]===option[0]?"✓":String(i+1).padStart(2,"0");
  b.querySelector(".poll-pct").textContent=pct+"%";
  b.classList.toggle("selected",state[topic.id]===option[0]);
  b.setAttribute("aria-pressed",String(state[topic.id]===option[0]));
  b.disabled=isTopicClosed(topic);
 });
 $(topic.summary).textContent= (isTopicClosed(topic)?"已结束 · ":"") + fmt(totals.reduce((a,b)=>a+b,0))+" 张模拟票";
}
function voteTopic(topic,id){
 if(isTopicClosed(topic)){toast("这道题投票已结束");return;}
 if(state[topic.id]===id){toast("你已经选了这项");return;}
 state[topic.id]=id;saveChoice();renderTopic(topic);
 toast("已选择「"+topic.choices.find(x=>x[0]===id)[1]+"」");
}
function updateCountdown(){
 const el=$("countdown");const gap=Math.max(0,SS14_OPEN-Date.now());
 if(!gap){el.textContent="新赛季已开服";return;}
 const minutes=Math.floor(gap/60000),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60);
 el.textContent=String(days).padStart(2,"0")+" 天 "+String(hours).padStart(2,"0")+" 小时";
}
function openModal(modal){
 if(!modal.open){if(modal.showModal)modal.showModal();else modal.setAttribute("open","");}
 document.body.classList.add("modal-open");
}
function closeModal(modal){
 if(modal.id==="lottery-dialog")stopSpin();
 if(modal.open){if(modal.close)modal.close();else modal.removeAttribute("open");}
 if(!document.querySelector(".modal[open]"))document.body.classList.remove("modal-open");
}
function slotRow(hero,row){
 const node=$(row);node.replaceChildren();
 if(!hero){node.textContent=row==="slot-current"?"点击下面的按钮开始":"—";return;}
 const picture=portrait(hero,row!=="slot-current");
 const copy=document.createElement("span");copy.className="slot-name";
 const title=document.createElement("strong");title.textContent=hero.name;
 const detail=document.createElement("small");detail.textContent=hero.trait;
 copy.append(title,detail);node.append(picture,copy);
}
function showSlot(pre,current,next){slotRow(pre,"slot-prev");slotRow(current,"slot-current");slotRow(next,"slot-next");}
function stopSpin(){
 clearTimeout(slotTimer);slotTimer=0;state.spinning=false;
 $("lottery-spin").disabled=!loaded||isHeroClosed();
}
function openSlot(){
 if(!loaded){toast("英雄清单还在加载");return;}
 stopSpin();state.slotResult=null;showSlot(null,null,null);
 $("lottery-result-label").textContent="还没抽签";
 $("lottery-result-name").textContent="看看会抽到谁？";
 $("lottery-result-sub").textContent="抽签不会自动投票";
 $("spin-label").textContent="开始抽签";
 $("lottery-accept").disabled=true;
 $("lottery-share").disabled=true;
 openModal($("lottery-dialog"));
}
function finishSpin(hero){
 state.spinning=false;state.slotResult=hero;slotTimer=0;
 const i=heroes.findIndex(h=>h.id===hero.id);
 showSlot(heroes[(i+heroes.length-1)%heroes.length],hero,heroes[(i+1)%heroes.length]);
 $("lottery-result-label").textContent="抽到了";
 $("lottery-result-name").textContent=sourceName(hero);
 $("lottery-result-sub").textContent="当前模拟榜第 "+(sorted().findIndex(h=>h.id===hero.id)+1)+" 名，喜欢就投一票";
 $("spin-label").textContent="再抽一次";
 $("lottery-spin").disabled=isHeroClosed();
 $("lottery-accept").disabled=isHeroClosed();
 $("lottery-share").disabled=false;
}
function spin(){
 if(!loaded||state.spinning||isHeroClosed())return;
 let chosen;try{chosen=sampleOne(heroes);}catch(error){toast("当前浏览器不支持随机抽签");return;}
 state.spinning=true;state.slotResult=null;
 $("lottery-spin").disabled=true;$("lottery-accept").disabled=true;$("lottery-share").disabled=true;
 $("lottery-result-label").textContent="正在抽…";$("lottery-result-name").textContent="";$("lottery-result-sub").textContent="每个特性抽中的机会相同";
 if(reducedMotion){finishSpin(chosen);return;}
 let step=0;
 const tick=()=>{
  if(!$("lottery-dialog").open){stopSpin();return;}
  try{showSlot(sampleOne(heroes),sampleOne(heroes),sampleOne(heroes));}
  catch(error){stopSpin();toast("抽签出错，请重试");return;}
  step++;
  if(step>=15){finishSpin(chosen);return;}
  slotTimer=setTimeout(tick,53+step*6);
 };
 tick();
}
function shareUrl(hero){
 const url=new URL("https://torchlightskill.com/council/");
 if(hero)url.searchParams.set("hero",hero.id);
 return url.toString();
}
async function share(kind){
 const hero=kind==="slot"?state.slotResult:heroMap.get(state.hero);
 const url=shareUrl(hero);
 const text=hero?(kind==="slot"?"我随机抽到了 "+sourceName(hero)+"，你也来抽个开荒英雄。":"我开荒准备玩 "+sourceName(hero)+"，你选谁？"):"SS14 你准备玩哪个英雄？来火炬议会投票。";
 if(navigator.share){try{await navigator.share({title:"火炬议会",text,url});return;}catch(e){if(e.name==="AbortError")return;}}
 $("share-link").value=url;$("share-tip").textContent=text;openModal($("share-dialog"));
}
async function copyLink(){
 const inp=$("share-link");
 try{if(!navigator.clipboard)throw Error();await navigator.clipboard.writeText(inp.value);$("share-tip").textContent="链接已复制。";}
 catch(error){inp.focus();inp.select();$("share-tip").textContent="链接已选中，请用系统复制。";}
}
function setUp(){
 $("hero-search").addEventListener("input",searchRoster);
 $("open-lottery").addEventListener("click",openSlot);
 $("lottery-spin").addEventListener("click",spin);
 $("lottery-accept").addEventListener("click",()=>{
  if(!state.slotResult)return;
  voteHero(state.slotResult.id,null);
  closeModal($("lottery-dialog"));
  document.getElementById("all-heroes").scrollIntoView({behavior:reducedMotion?"auto":"smooth"});
 });
 $("lottery-share").addEventListener("click",()=>share("slot"));
 $("lottery-choose").addEventListener("click",()=>closeModal($("lottery-dialog")));
 $("copy-share").addEventListener("click",copyLink);
 $("share-arena").addEventListener("click",()=>share("vote"));
 $("simulate-btn").addEventListener("click",()=>{
  if(!loaded||isHeroClosed())return;
  const prev=state.motion;state.motion=true;tickDemo();state.motion=prev;
 });
 $("motion-toggle").addEventListener("click",toggleMotion);
 document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>closeModal($(button.dataset.close))));
 document.querySelectorAll(".modal").forEach(modal=>{
  modal.addEventListener("click",e=>{if(e.target===modal)closeModal(modal);});
  modal.addEventListener("close",()=>{if(modal.id==="lottery-dialog")stopSpin();document.body.classList.remove("modal-open");});
  modal.addEventListener("cancel",()=>{if(modal.id==="lottery-dialog")stopSpin();});
 });
 window.addEventListener("resize",()=>{
  const now=window.innerWidth<=700;if(now!==mobile){mobile=now;if(loaded)chart();}
 },{passive:true});
 updateCountdown();setInterval(updateCountdown,1000);
 polling.forEach(renderTopic);
 setInterval(()=>{if(isTopicClosed(polling[1]))renderTopic(polling[1]);},30000);
}
async function init(){
 setUp();
 try{
  await getManifest();
  readChoice();loaded=true;
  buildRoster();chart();
  $("open-lottery").disabled=isHeroClosed();
  $("simulate-btn").disabled=isHeroClosed();
  showActivity("模拟有人投票时，会冒出 +1 气泡",true);
  setInterval(tickDemo,5100);
  setTimeout(tickDemo,2100);
 }catch(error){
  $("hero-list").textContent="头像清单加载失败，请刷新重试。";
  $("chart").textContent="暂时无法读取英雄资料。";
  $("hero-search-summary").textContent="加载失败";
  $("avatar-source-status").textContent="读取失败："+error.message;
  state.motion=false;$("motion-toggle").disabled=true;
 }
}
init();
})();