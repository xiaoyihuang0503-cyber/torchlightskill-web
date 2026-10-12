(function(){
"use strict";
const $=id=>document.getElementById(id);
const SS14_OPEN=Date.parse("2026-10-16T10:00:00+08:00");
const ROUNDTABLE_END=Date.parse("2026-10-14T20:00:00+08:00");
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
const state={hero:null,maze:null,roundtable:null,motion:true,slotResult:null,spinning:false};
const LIVE=window.TorchCouncilLive;
/* Four user-approved 2026 SS14 topics. Full copy is displayed verbatim in the focus panel. */
const polling=[
 {id:"mode_reduction",short:"老玩法做减法",title:"新玩法不断加，老玩法什么时候做减法？",question:"你最支持哪种调整？",
  followup:"未来两个赛季，具体哪些老玩法准备重做、合并或暂时退出？能否公布名单和时间表？",
  closedAt:null,choices:[["rework","重做收益低、体验差的老玩法",0],["merge","合并流程相似、奖励重复的玩法",0],["rotation","部分玩法按赛季轮换，减少同时存在的数量",0],["simplify","保留全部玩法，优先简化操作和规则",0]]},
 {id:"ember_drop_data",short:"初火掉率",title:"初火掉率怎么调，能不能把数字说清楚？",question:"你最希望官方公开什么？",
  followup:"迷城这次下调，到底改了哪些数值？86、89是否分别测算？能否给出同配置、同耗时的前后对照？",
  closedAt:null,choices:[["drop_numbers","初火掉率、单次掉落数量分别改了多少",0],["build_gap","普通配置和高投入配置的收益差距",0],["net_return","扣除门票、计入耗时后的实际收益对比",0],["reasoning","调整依据，以及后续是否继续调整",0]]},
 {id:"reward_access",short:"自由刷图",title:"我只想刷喜欢的玩法，为什么还要为构筑补其他玩法的课？",question:"限定装备和养成材料，你更接受哪种安排？",
  followup:"玩家只专注一两种玩法，能否完成主要养成？哪些奖励必须绑定特定玩法，理由是什么？",
  closedAt:null,choices:[["exclusive","保留玩法专属奖励，维持各玩法特色",0],["alternative","增加效率较低的替代获取途径",0],["exchange","提供兑换，让玩家可以选择刷什么",0],["general_access","普通养成通用，只有顶级奖励限定玩法",0]]},
 {id:"legacy_friction",short:"重复劳动",title:"新玩法可以复杂，老玩法能不能少一点重复劳动？",question:"你最想先减少哪种负担？",
  followup:"老玩法有哪些操作可以自动完成、批量处理或直接取消？这次能承诺先改哪几项？",
  closedAt:null,choices:[["unlock","解锁、铺路和前置准备",0],["item_handling","反复拾取、整理、兑换材料",0],["ui_steps","进出界面、领奖和重复确认",0],["rule_lookup","查规则、查掉落、查生效条件",0]]}
];
let activeTopicId=polling[0].id;
let renderedTopicId=null;
let rosterSort="votes";
let previousLeader=null;
let hadRealCountSnapshot=false;
const reducedMotion=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
let loaded=false;
let remoteReady=false;
let questionBusy=false;
let mobile=window.innerWidth<=700;
let lastToastTimer=0;
let slotTimer=0;
let lastActivity="";
let activityClock=0;
const sourceName=hero=>hero.name+" · "+hero.trait;
const isHeroClosed=()=>Date.now()>=SS14_OPEN;
const isTopicClosed=topic=>topic.closedAt!==null&&Date.now()>=topic.closedAt;
const fmt=value=>new Intl.NumberFormat("zh-CN").format(value);
const count=hero=>LIVE?.getCount("hero",hero.id)||0;
const sorted=()=>heroes.slice().sort((a,b)=>count(b)-count(a)||a.position-b.position);
function random(n){
 if(!Number.isInteger(n)||n<1)throw new Error("没有可选英雄");
 if(!window.crypto||!window.crypto.getRandomValues)throw new Error("当前浏览器无法安全随机抽签");
 const data=new Uint32Array(1),cutoff=Math.floor(4294967296/n)*n;
 do {window.crypto.getRandomValues(data);} while(data[0]>=cutoff);
 return data[0]%n;
}
function sampleOne(items){return items[random(items.length)];}
function safeChoice(id){return LEGACY[id]||id;}
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
  const hero={id:a.id,name:a.name,trait:a.trait_name,alias:ALIASES[a.id]||a.name,asset:a,color:COLORS[i%COLORS.length],initial:0,position:i};
  heroes.push(hero);heroMap.set(hero.id,hero);
 });
 // Hidden mentor section deliberately retains its implementation and source mapping.
 mentors.forEach(a=>{
  const node=document.querySelector('[data-mentor-image="'+a.id+'"]');
  if(node){node.dataset.siteUrl=a.site_url;node.dataset.assetId=a.id;}
 });
 return m;
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
  b.classList.toggle("leader",index===0&&count(hero)>0);
  b.classList.toggle("mine",state.hero===hero.id);
  b.disabled=isHeroClosed()||!remoteReady;
  b.setAttribute("aria-pressed",String(state.hero===hero.id));
  b.setAttribute("aria-label",sourceName(hero)+"，"+count(hero)+"张真实票，排第"+(index+1)+"，"+(state.hero===hero.id?"已选":"点击投票"));
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
 const totalReal=heroes.reduce((sum,h)=>sum+count(h),0);
 if(!totalReal) $("my-camp").textContent="🗳️ 等待第一个开荒投票";
 $("hero-total").textContent=heroes.length;
 const mine=heroMap.get(state.hero);
 if(mine){
  const place=r.findIndex(h=>h.id===mine.id)+1;
  $("my-camp").textContent="我选了 "+sourceName(mine)+" · 真实榜第 "+place+" 名";
 }else{
  const requested=new URLSearchParams(location.search).get("hero");
  const linked=heroMap.get(safeChoice(requested));
  $("my-camp").textContent=linked?"朋友推荐你看看 "+sourceName(linked)+"，可以在下面投票。":"还没投票，往下选一个英雄。";
 }
}
function makeRosterHero(hero){
 const card=document.createElement("article");card.className="roster-card";card.dataset.hero=hero.id;
 card.style.setProperty("--hero-color",hero.color);
 const action=document.createElement("button");action.type="button";action.className="roster-vote";action.dataset.hero=hero.id;
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
 action.append(face,info,right,meter);
 action.addEventListener("click",()=>voteHero(hero.id,card));
 const shareButton=document.createElement("button");
 shareButton.type="button";shareButton.className="roster-share";shareButton.textContent="分享 ↗";
 shareButton.setAttribute("aria-label","分享 "+sourceName(hero)+" 的开荒投票");
 shareButton.addEventListener("click",()=>share("hero",hero.id));
 card.append(action,shareButton);
 rosterCards.set(hero.id,{button:card,action:action,shareButton:shareButton,votes,check:tick,meter:meterValue});
 return card;
}
function sortRoster(){
 const host=$("hero-list"),drawer=$("all-heroes");
 if(!host||!loaded||!rosterCards.size||!drawer?.open)return;
 // Do not move a focused voting control under someone's finger or keyboard.
 const focus=document.activeElement;
 if(focus&&host.contains(focus))return;
 const order=heroes.slice().sort((a,b)=>
   rosterSort==="name"
     ?a.name.localeCompare(b.name,"zh-CN")||a.position-b.position
     :count(b)-count(a)||a.position-b.position
 );
 const current=Array.from(host.children).map(n=>n.dataset?.hero||"").join(",");
 const wanted=order.map(h=>h.id).join(",");
 if(current===wanted)return;
 const fragment=document.createDocumentFragment();
 order.forEach(h=>fragment.appendChild(rosterCards.get(h.id).button));
 host.replaceChildren(fragment);
}
function buildRoster(){
 const fragment=document.createDocumentFragment();
 heroes.slice().sort((a,b)=>a.position-b.position).forEach(h=>fragment.appendChild(makeRosterHero(h)));
 $("hero-list").replaceChildren(fragment);
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
  ref.action.disabled=isHeroClosed()||!remoteReady;
  ref.action.setAttribute("aria-pressed",String(state.hero===id));
  ref.action.setAttribute("aria-label",sourceName(h)+"，真实"+v+"票，"+(state.hero===id?"已投":"投票"));
  ref.meter.style.width=Math.round(v/max*100)+"%";
 });
 sortRoster();
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
async function voteHero(id,clicked){
 if(!loaded||!remoteReady){toast("正在连接投票服务，请稍后再试");return;}
 const hero=heroMap.get(id);if(!hero)return;
 if(isHeroClosed()){toast("本期投票已结束");return;}
 if(state.hero===id){toast("你已经选了 "+sourceName(hero));return;}
 const previous=heroMap.get(state.hero);
 try {
   await LIVE.vote("hero",id);
   state.hero=id;
   chart();updateRoster();
   if(clicked&&clicked.classList.contains("roster-card"))animateTap(clicked);
   showActivity("你投给了 "+sourceName(hero)+(previous?"（已改选）":""),false);
   toast("已投给 "+sourceName(hero)+"，分享给朋友来支持吧");
   return true;
 } catch(error) {
   toast(String(error?.message||error));
   return false;
 }
}
function showActivity(value,simulated){
 lastActivity=value;
 const now=new Date();
 const stamp=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
 $("activity-line").textContent=stamp+" · "+value;
}
function bubble(hero,label,simulation){
 if(reducedMotion||document.hidden)return;
 const root=$("arena-stage"),item=chartCards.get(hero.id),area=root.getBoundingClientRect();
 const visible=!!(item?.button?.isConnected);
 const target=visible?item.avatar.getBoundingClientRect():null;
 const x=visible?Math.max(74,Math.min(area.width-74,target.left+target.width/2-area.left)):area.width/2;
 const y=visible?Math.max(63,target.top-area.top-4):86;
 const bubble=document.createElement("div");bubble.className="vote-bubble";
 bubble.style.left=x+"px";bubble.style.top=y+"px";
 const image=newPortrait(hero.asset,"","bubble-avatar");image.src=hero.asset.site_url;
 const line=document.createElement("span");line.className="bubble-copy";
 const lineTop=document.createElement("strong");lineTop.textContent=label||"真实 +1";
 const lineBottom=document.createElement("small");lineBottom.textContent=sourceName(hero);
 line.append(lineTop,lineBottom);
 bubble.append(image,line);
 $("bubble-layer").appendChild(bubble);
 setTimeout(()=>bubble.remove(),1900);
}
function toggleMotion(){
 state.motion=!state.motion;
 $("motion-toggle").textContent=state.motion?"隐藏气泡":"显示气泡";
 $("motion-toggle").setAttribute("aria-pressed",String(state.motion));
 showActivity(state.motion?"继续显示真实投票气泡":"气泡已隐藏，票数仍会实时刷新",false);
}

/* 策划圆桌关键词经服务端汇总，只公开经过审核的玩家提问。 */
/* Public keyword totals are aggregated in Postgres.
 * Pending question text is readable only by its creator until approved.
 */
let roundQuestions=[];
let keywordRows=[];
function renderRoundQuestions(){
 const cloud=$("keyword-cloud"),list=$("roundtable-question-list");
 if(!cloud||!list)return;
 const ranking=keywordRows.slice().sort((a,b)=>b.count-a.count||a.keyword.localeCompare(b.keyword,"zh-CN")).slice(0,12);
 const fragment=document.createDocumentFragment();
 if(!ranking.length){
   const empty=document.createElement("span");empty.className="keyword-empty";
   empty.textContent="还没有玩家提问";
   fragment.appendChild(empty);
 }else{
   ranking.forEach((row,index)=>{
     const item=document.createElement("span");item.className="keyword-pill";
     item.classList.toggle("keyword-leading",index===0);
     const label=document.createElement("strong");label.textContent=row.keyword;
     const number=document.createElement("small");number.textContent=String(row.count);
     item.append(label,number);fragment.appendChild(item);
   });
 }
 cloud.replaceChildren(fragment);
 $("keyword-status").textContent=LIVE?.isReady()?"真实提交 · 实时统计":"正在同步";
 const approved=roundQuestions.filter(q=>q.status==="approved");
 const pending=roundQuestions.filter(q=>q.status==="pending");
 $("question-total").textContent=approved.length+" 条公开"+(pending.length?" · "+pending.length+" 条自己待审核":"");
 const listFragment=document.createDocumentFragment();
 if(!roundQuestions.length){
   const empty=document.createElement("li");empty.className="question-empty";
   empty.textContent="还没有公开的问题。提交后会先进入审核。";
   listFragment.appendChild(empty);
 }else{
   roundQuestions.slice(0,8).forEach(q=>{
     const item=document.createElement("li");item.className="question-item";
     const text=document.createElement("span");text.className="question-text";text.textContent=q.text;
     const meta=document.createElement("div");meta.className="question-meta";
     const time=document.createElement("time");
     const ts=Number.isFinite(q.at)?q.at:Date.now();
     time.dateTime=new Date(ts).toISOString();
     time.textContent=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(ts));
     meta.appendChild(time);
     if(q.status==="pending"){
       const flag=document.createElement("span");flag.textContent="仅自己可见 · 待审核";flag.className="question-review-status";meta.appendChild(flag);
     }else{
       const button=document.createElement("button");button.type="button";
       button.className="share-local-question";button.textContent="分享";
       button.addEventListener("click",()=>share("roundtable-question",q.text));
       meta.appendChild(button);
     }
     item.append(text,meta);listFragment.appendChild(item);
   });
 }
 list.replaceChildren(listFragment);
}
async function submitRoundQuestion(event){
 event.preventDefault();
 const input=$("roundtable-question-input"),feedback=$("roundtable-submit-feedback"),button=$("submit-roundtable-question");
 if(!input||questionBusy)return;
 if(Date.now()>=ROUNDTABLE_END){feedback.textContent="本轮圆桌征集已结束。";return;}
 if(!LIVE?.isReady()){feedback.textContent="提问服务正在连接，请稍后再试。";return;}
 const value=input.value.trim().replace(/\s+/g," ");
 if([...value].length<8||[...value].length>160){feedback.textContent="请写 8～160 个字，说明具体想问什么。";return;}
 questionBusy=true;button.disabled=true;feedback.textContent="正在提交…";
 try{
   const result=await LIVE.submitQuestion(value);
   input.value="";$("question-length").textContent="0 / 160 字";
   feedback.textContent=result?.status==="pending"?"提交成功，问题等待审核。关键词已进入全站统计。":"提交成功。";
 }catch(error){feedback.textContent=String(error?.message||error);}
 finally{questionBusy=false;button.disabled=Date.now()>=ROUNDTABLE_END;}
}
function setupRoundtable(){
 renderRoundQuestions();
 const form=$("roundtable-question-form"),input=$("roundtable-question-input");
 if(!form||!input)return;
 input.addEventListener("input",()=>{$("question-length").textContent=Array.from(input.value).length+" / 160 字";});
 form.addEventListener("submit",submitRoundQuestion);
 if(Date.now()>=ROUNDTABLE_END){
   $("submit-roundtable-question").disabled=true;
   input.disabled=true;
   $("roundtable-submit-feedback").textContent="本轮圆桌提问已结束。";
 }
}
function topicById(id){return polling.find(p=>p.id===id)||null;}
function seatCount(topic){return topic.choices.reduce((sum,c)=>sum+Number(c[2]||0),0);}
function renderChairs(){
 let combined=0;
 polling.forEach(topic=>{
   const chair=$("chair-"+topic.id);
   if(!chair)return;
   const votes=seatCount(topic);combined+=votes;
   chair.querySelector(".chair-votes").textContent=fmt(votes)+" 票";
   chair.classList.toggle("has-my-vote",!!state[topic.id]);
   chair.setAttribute("aria-label",topic.short+"，"+votes+"票"+(state[topic.id]?"，我已投票":"")+"，点击坐下查看");
 });
 const summary=$("all-topic-total");
 if(summary)summary.textContent="🗳️ "+fmt(combined)+" 票 · 4 个议题";
}
function setActiveTopic(id,focus=false){
 const topic=topicById(id);if(!topic)return;
 const changed=activeTopicId!==id;
 activeTopicId=id;
 const focusPanel=$("active-topic-panel");
 polling.forEach(t=>{
   const chair=$("chair-"+t.id);
   if(!chair)return;
   const selected=t.id===id;
   chair.setAttribute("aria-selected",String(selected));
   chair.tabIndex=selected?0:-1;
   chair.classList.toggle("active",selected);
 });
 focusPanel.setAttribute("aria-labelledby","chair-"+id);
 $("focus-topic-index").textContent="席位 "+String(polling.indexOf(topic)+1).padStart(2,"0")+" / 04";
 $("focus-topic-title").textContent=topic.title;
 $("focus-topic-question").textContent=topic.question;
 $("focus-followup-text").textContent=topic.followup;
 $("chair-hint").textContent="已选第 "+(polling.indexOf(topic)+1)+" 席 · "+topic.short;
 if(changed){$("topic-followup").open=false;renderedTopicId=null;}
 renderTopic(topic);
 if(focus){$("chair-"+id).focus();}
}
function renderTopic(topic){
 renderChairs();
 if(topic.id!==activeTopicId)return;
 const host=$("focus-topic-options");
 if(!host)return;
 if(renderedTopicId!==topic.id||host.children.length!==topic.choices.length){
   const fragment=document.createDocumentFragment();
   topic.choices.forEach((option,index)=>{
     const btn=document.createElement("button");btn.type="button";
     btn.className="focus-choice";btn.dataset.option=option[0];btn.dataset.topic=topic.id;
     const label=document.createElement("span");label.className="focus-choice-label";
     const order=document.createElement("span");order.className="focus-choice-order";order.textContent=String(index+1);
     const copy=document.createElement("span");copy.textContent=option[1];
     label.append(order,copy);
     const bottom=document.createElement("span");bottom.className="focus-choice-bottom";
     const status=document.createElement("span");status.className="focus-choice-status";
     const percentage=document.createElement("strong");percentage.className="focus-choice-pct";
     bottom.append(status,percentage);
     const meter=document.createElement("span");meter.className="focus-choice-bar";meter.setAttribute("aria-hidden","true");
     btn.append(label,bottom,meter);
     btn.addEventListener("click",()=>voteTopic(topic,option[0]));
     fragment.append(btn);
   });
   host.replaceChildren(fragment);
   renderedTopicId=topic.id;
 }
 const sum=seatCount(topic);
 Array.from(host.children).forEach((btn,index)=>{
   const item=topic.choices[index],votes=Number(item[2]||0);
   const chosen=state[topic.id]===item[0];
   btn.classList.toggle("selected",chosen);
   btn.setAttribute("aria-pressed",String(chosen));
   btn.disabled=!remoteReady||isTopicClosed(topic);
   btn.querySelector(".focus-choice-order").textContent=chosen?"✓":String(index+1);
   btn.querySelector(".focus-choice-status").textContent=chosen?"✅ 已选":fmt(votes)+" 票";
   btn.querySelector(".focus-choice-pct").textContent=sum>0?(Math.round(votes/sum*100)+"%"):"0%";
   btn.querySelector(".focus-choice-bar").style.width=(sum>0?votes/sum*100:0)+"%";
   btn.setAttribute("aria-label",item[1]+"，"+votes+"票"+(chosen?"，已选":""));
 });
 $("focus-topic-total").textContent="🗳️ "+fmt(sum)+" 票";
 $("share-active-topic").textContent=state[topic.id]?"📣 分享我的选择 ↗":"📣 分享这题 ↗";
 const status=$("focus-topic-live");
 if(!remoteReady){
   status.textContent="⏳ 正在连接真实投票";status.classList.remove("live-success");
 }else if(!sum&&!state[topic.id]){
   status.textContent="🪑 这道题还没人投票，你可以投第一票";status.classList.remove("live-success");
 }else if(!status.classList.contains("live-success")){
   status.textContent="⚡ 真实票数自动更新，支持改选";
 }
}
async function voteTopic(topic,id){
 if(!remoteReady){toast("正在连接真实投票，请稍后再试");return;}
 if(isTopicClosed(topic)){toast("这道题投票已结束");return;}
 if(state[topic.id]===id){toast("这项已经投过了");return;}
 try{
   const result=await LIVE.vote(topic.id,id);
   state[topic.id]=id;
   renderTopic(topic);
   const chosen=topic.choices.find(c=>c[0]===id);
   $("focus-topic-live").textContent="✅ 已投票 · "+chosen[1]+" · 📣 可以分享给朋友";
   $("focus-topic-live").classList.add("live-success");
   toast("✅ 投票成功，已经计入全站票数");
   return result;
 }catch(error){
   toast(String(error?.message||error));
   $("focus-topic-live").textContent="投票没成功，可以重试";
   $("focus-topic-live").classList.remove("live-success");
 }
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
 $("lottery-result-sub").textContent="真实榜第 "+(sorted().findIndex(h=>h.id===hero.id)+1)+" 名，喜欢就投一票";
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
function shareEntry(kind,heroId){
 const url=new URL("https://torchlightskill.com/council/share/");
 const hero=heroMap.get(heroId);
 let caption="",title="";
 switch(kind){
  case "hero":
  case "vote":
   if(hero||state.hero&&heroMap.has(state.hero)){
    const selected=hero||heroMap.get(state.hero);
    url.searchParams.set("kind","hero");
    url.searchParams.set("hero",selected.id);
    title="我准备玩 "+sourceName(selected)+"，你呢？";
    caption="朋友点开可以直接选这个英雄，或者换一个。";
   }else{
    url.searchParams.set("kind","ranking");
    title="SS14 开荒你玩谁？";
    caption="发给朋友，让他们来选自己的英雄。";
   }
   break;
  case "slot":
  case "lottery":
   url.searchParams.set("kind","lottery");
   if(hero||state.slotResult){
    const selected=hero||state.slotResult;
    url.searchParams.set("hero",selected.id);
    title="我随机抽到了 "+sourceName(selected)+"！";
    caption="朋友可以自己再抽一次，也可以投给你抽中的英雄。";
   }else{
    title="不知道用谁开荒？随机抽一个。";
    caption="朋友点开就能去玩开荒老虎机。";
   }
   break;
  case "topic": {
   const current=topicById(heroId)||topicById(activeTopicId);
   if(!current)throw Error("找不到这道问题");
   url.searchParams.set("kind","topic");
   url.searchParams.set("topic",current.id);
   const chosenId=state[current.id];
   const chosen=current.choices.find(c=>c[0]===chosenId);
   if(chosen)url.searchParams.set("choice",chosen[0]);
   title=chosen?"我在圆桌上选了「"+chosen[1]+"」，你呢？":current.title;
   caption="朋友点开就能看到这把椅子对应的问题，直接投上自己的一票。";
   break;
  }
  case "maze":
   // Kept only for old historical links; new v2 doesn't cast the two-choice poll.
   url.searchParams.set("kind","maze");
   title="以前的迷城调整投票";
   caption="这里保留历史链接，现在可以进入新的四道圆桌问题。";
   break;
  case "roundtable-question":
   url.searchParams.set("kind","roundtable");
   const question=typeof heroId==="string"?heroId.trim().slice(0,160):"";
   if(question.length>=8){
    url.searchParams.set("question",question);
    title="我想问策划："+question;
    caption="朋友可以阅读你的问题，也能提交自己的问题。";
   }else{
    title="10 月 14 日策划圆桌，你想问什么？";
    caption="朋友可以直接提问。";
   }
   break;
  case "roundtable":
   url.searchParams.set("kind","roundtable");
   title="你最想问策划什么？";
   caption="朋友点开后可以进入圆桌提问，也可以投四道焦点议题。";
   break;
  default:
   url.searchParams.set("kind","ranking");
   title="SS14 开荒，你玩谁？";
   caption="邀请朋友一起来选开荒英雄。";
 }
 return {url:url.toString(),title,caption,kind};
}
function share(kind,heroId){
 const item=shareEntry(kind,heroId);
 $("share-link").value=item.url;
 $("share-preview-text").textContent=item.title;
 $("open-share-page").href=item.url;
 $("share-tip").textContent=item.caption+" 朋友投票后会计入全站真实票数。";
 $("share-dialog").dataset.shareTitle=item.title;
 openModal($("share-dialog"));
}
async function nativeShare(){
 const url=$("share-link").value;
 const title=$("share-dialog").dataset.shareTitle||"火炬议会";
 if(navigator.share){
  try { await navigator.share({title:"火炬议会",text:title,url});return; }
  catch(error){if(error?.name==="AbortError")return;}
 }
 await copyLink();
}
async function copyLink(){
 const inp=$("share-link");
 try{if(!navigator.clipboard)throw Error();await navigator.clipboard.writeText(inp.value);$("share-tip").textContent="链接已复制。";}
 catch(error){inp.focus();inp.select();$("share-tip").textContent="链接已选中，请用系统复制。";}
}
function setUp(){
 setupRoundtable();
 $("hero-search").addEventListener("input",searchRoster);
 $("hero-sort").addEventListener("change",event=>{
   rosterSort=event.target.value==="name"?"name":"votes";sortRoster();
 });
 $("all-heroes").addEventListener("toggle",()=>sortRoster());
 $("hero-list").addEventListener("focusout",()=>window.setTimeout(sortRoster,20));
 document.querySelectorAll('a[href="#all-heroes"]').forEach(link=>{
   link.addEventListener("click",()=>{$("all-heroes").open=true;});
 });
 // Tab semantics: four chairs are one roving keyboard focus group.
 const chairs=Array.from(document.querySelectorAll(".topic-chair"));
 chairs.forEach((chair,index)=>{
   chair.addEventListener("click",()=>setActiveTopic(chair.dataset.topic));
   chair.addEventListener("keydown",event=>{
     let next=null;
     if(event.key==="ArrowRight"||event.key==="ArrowDown")next=(index+1)%chairs.length;
     if(event.key==="ArrowLeft"||event.key==="ArrowUp")next=(index+chairs.length-1)%chairs.length;
     if(event.key==="Home")next=0;
     if(event.key==="End")next=chairs.length-1;
     if(next!==null){event.preventDefault();setActiveTopic(chairs[next].dataset.topic,true);}
   });
 });
 $("share-active-topic").addEventListener("click",()=>share("topic",activeTopicId));
 $("followup-to-question").addEventListener("click",()=>{
   const topic=topicById(activeTopicId);
   if(topic)$("roundtable-question-input").placeholder="关于「"+topic.short+"」，你还想问什么？";
 });
 setActiveTopic(activeTopicId);
 $("open-lottery").addEventListener("click",openSlot);
 $("lottery-spin").addEventListener("click",spin);
 $("lottery-accept").addEventListener("click",async()=>{
  if(!state.slotResult)return;
  const ok=await voteHero(state.slotResult.id,null);
  if(ok){
    closeModal($("lottery-dialog"));
    $("all-heroes").open=true;
    sortRoster();
    $("all-heroes").scrollIntoView({behavior:reducedMotion?"auto":"smooth"});
  }
 });
 $("lottery-share").addEventListener("click",()=>share("slot"));
 $("share-lottery-game").addEventListener("click",()=>share("lottery"));
 $("lottery-choose").addEventListener("click",()=>{
   closeModal($("lottery-dialog"));
   $("all-heroes").open=true;
 });
 $("copy-share").addEventListener("click",copyLink);
 $("share-arena").addEventListener("click",()=>share("vote"));
 $("share-roundtable").addEventListener("click",()=>share("roundtable"));
 $("native-share").addEventListener("click",nativeShare);
 $("motion-toggle").addEventListener("click",toggleMotion);
 document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>closeModal($(button.dataset.close))));
 document.querySelectorAll(".modal").forEach(modal=>{
  modal.addEventListener("click",e=>{if(e.target===modal)closeModal(modal);});
  modal.addEventListener("close",()=>{if(modal.id==="lottery-dialog")stopSpin();document.body.classList.remove("modal-open");});
  modal.addEventListener("cancel",()=>{if(modal.id==="lottery-dialog")stopSpin();});
 });
 window.addEventListener("resize",()=>{
   const now=window.innerWidth<=700;
   if(now!==mobile){mobile=now;if(loaded)chart();}
 },{passive:true});
 updateCountdown();setInterval(updateCountdown,1000);
 setInterval(()=>{
   if(Date.now()>=ROUNDTABLE_END){
     $("submit-roundtable-question").disabled=true;
     $("roundtable-question-input").disabled=true;
   }
 },30000);
}
async function init(){
 setUp();
 try{
  await getManifest();
  loaded=true;
  buildRoster();chart();
  const incoming=new URLSearchParams(location.search);
  const sharedHero=heroMap.get(safeChoice(incoming.get("hero")));
  if(sharedHero){
    const ref=rosterCards.get(sharedHero.id);
    if(ref)ref.button.classList.add("invited");
    $("my-camp").textContent="朋友邀请你支持 "+sourceName(sharedHero)+"，可以直接点击下方卡片投票。";
    if(location.hash==="#all-heroes"){$("hero-search").value=sharedHero.alias;searchRoster();}
  }
  const pollId=incoming.get("poll"),choice=incoming.get("choice");
  const topic=polling.find(t=>t.id===pollId);
  if(topic&&topic.choices.some(option=>option[0]===choice)){
    const target=document.querySelector('#'+topic.host+' [data-option="'+choice+'"]');
    if(target)target.classList.add("invited");
  }
  if(incoming.get("open")==="lottery"){
    window.setTimeout(()=>{if(!isHeroClosed())openSlot();},220);
  }
  $("open-lottery").disabled=isHeroClosed();
  if(!LIVE?.available){
    $("vote-source-label").textContent="实时服务连接失败";
    showActivity("无法加载实时投票模块，请刷新页面重试",false);
    $("roundtable-submit-feedback").textContent="提问服务暂时不可用，请刷新页面重试。";
    return;
  }
  LIVE.hooks.onCounts=()=>{
    remoteReady=true;
    polling.forEach(t=>{
      t.choices.forEach(c=>{c[2]=LIVE.getCount(t.id,c[0]);});
    });
    chart();updateRoster();polling.forEach(renderTopic);
    $("vote-source-label").textContent="真实投票 · 即时更新";
  };
  LIVE.hooks.onOwnVotes=values=>{
    state.hero=heroMap.has(values.hero)?values.hero:null;
    polling.forEach(t=>{state[t.id]=t.choices.some(c=>c[0]===values[t.id])?values[t.id]:null;});
    chart();updateRoster();polling.forEach(renderTopic);
  };
  LIVE.hooks.onVoteEvent=event=>{
    if(!state.motion||document.hidden)return;
    if(event.topic==="hero"){
      const h=heroMap.get(event.choice);
      if(h){bubble(h,"真实 +1",false);showActivity("有玩家投给了 "+sourceName(h),false);}
    }else{
      const poll=polling.find(t=>t.id===event.topic);
      const option=poll?.choices.find(c=>c[0]===event.choice);
      if(option)showActivity("有玩家选择了「"+option[1]+"」",false);
    }
  };
  LIVE.hooks.onKeywordStats=rows=>{keywordRows=rows;renderRoundQuestions();};
  LIVE.hooks.onQuestions=rows=>{roundQuestions=rows;renderRoundQuestions();};
  LIVE.hooks.onStatus=status=>{
    if(status?.state==="error"&&!remoteReady){
      $("vote-source-label").textContent="连接失败";
    }else if(status?.state==="polling"){
      $("vote-source-label").textContent="真实票数 · 定时刷新";
    }else if(status?.state==="ready"){
      $("vote-source-label").textContent="真实票数 · 实时更新";
    }
    if(status?.message)showActivity(status.message,false);
  };
  await LIVE.start();
 }catch(error){
  $("hero-list").textContent="暂时无法读取英雄资料，请刷新重试。";
  $("chart").textContent="暂时无法读取真实票数。";
  $("hero-search-summary").textContent="连接失败";
  $("vote-source-label").textContent="连接失败";
  $("roundtable-submit-feedback").textContent="无法连接数据服务："+String(error?.message||error);
 }
}
init();
})();