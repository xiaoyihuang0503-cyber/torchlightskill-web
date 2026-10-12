/* Torchlight Council v2 — browser UI. All public counts and events come from Supabase. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const LIVE=window.TorchCouncilLive;
const OPEN_AT=Date.parse("2026-10-16T10:00:00+08:00");
const ASK_CLOSE_AT=Date.parse("2026-10-14T20:00:00+08:00");
const MANIFEST="/assets/torchlight-mentor-avatars/manifest.json";
const SITE="https://torchlightskill.com/council/";
const SHARE=SITE+"share/";
const reduced=!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const SHORT_IDS={youga_1:"时空1",youga_2:"时空2",youga_3:"时空3",bing_1:"宾1",bing_2:"宾2",
 selena_1:"人鱼1",selena_2:"人鱼2",carino_1:"枪1",carino_2:"枪2",carino_3:"枪3",
 erika_1:"猫1",erika_2:"猫2",erika_3:"猫3",gemma_1:"吉玛1",gemma_2:"吉玛2",gemma_4:"吉玛4",
 rehan_1:"狂1",rehan_2:"狂2",iris_1:"魔灵1",iris_2:"魔灵2",rosa_1:"罗莎1",rosa_2:"罗莎2",
 thea_1:"希雅1",thea_2:"希雅2",thea_3:"希雅3",moto_1:"莫托1",moto_2:"莫托2",sage_1:"药娘"};
const COLORS=["#ffd84d","#ffb9cc","#a5dcff","#b8e3a4","#ffcead","#cebaf3"];
const FOCUS=[
 {id:"mode_reduction",short:"老玩法做减法",emoji:"🛠️",
  title:"新玩法不断加，老玩法什么时候做减法？",prompt:"你最支持哪种调整？",
  options:[["rework","重做收益低、体验差的老玩法"],["merge","合并流程相似、奖励重复的玩法"],["rotation","部分玩法按赛季轮换，减少同时存在的数量"],["simplify","保留全部玩法，优先简化操作和规则"]],
  followup:"未来两个赛季，具体哪些老玩法准备重做、合并或暂时退出？能否公布名单和时间表？"},
 {id:"ember_drop_data",short:"初火掉率透明",emoji:"🔥",
  title:"初火掉率怎么调，能不能把数字说清楚？",prompt:"你最希望官方公开什么？",
  options:[["drop_numbers","初火掉率、单次掉落数量分别改了多少"],["build_gap","普通配置和高投入配置的收益差距"],["net_return","扣除门票、计入耗时后的实际收益对比"],["reasoning","调整依据，以及后续是否继续调整"]],
  followup:"迷城这次下调，到底改了哪些数值？86、89是否分别测算？能否给出同配置、同耗时的前后对照？"},
 {id:"reward_access",short:"自由刷图与奖励",emoji:"🎒",
  title:"我只想刷喜欢的玩法，为什么还要为构筑补其他玩法的课？",prompt:"限定装备和养成材料，你更接受哪种安排？",
  options:[["exclusive","保留玩法专属奖励，维持各玩法特色"],["alternative","增加效率较低的替代获取途径"],["exchange","提供兑换，让玩家可以选择刷什么"],["general_access","普通养成通用，只有顶级奖励限定玩法"]],
  followup:"玩家只专注一两种玩法，能否完成主要养成？哪些奖励必须绑定特定玩法，理由是什么？"},
 {id:"legacy_friction",short:"减少重复劳动",emoji:"🧹",
  title:"新玩法可以复杂，老玩法能不能少一点重复劳动？",prompt:"你最想先减少哪种负担？",
  options:[["unlock","解锁、铺路和前置准备"],["item_handling","反复拾取、整理、兑换材料"],["ui_steps","进出界面、领奖和重复确认"],["rule_lookup","查规则、查掉落、查生效条件"]],
  followup:"老玩法有哪些操作可以自动完成、批量处理或直接取消？这次能承诺先改哪几项？"}
];
const state={
 heroes:[],heroById:new Map(),heroNodes:new Map(),rankNodes:new Map(),
 selected:{},activeTopic:0,selectedSeat:"topic:mode_reduction",chairs:[],
 approvedQuestions:[],pendingQuestions:[],keywordRows:[],
 heroSort:"votes",search:"",motion:!reduced,loaded:false,ready:false,
 slotResult:null,spinning:false,slotTimer:null,toastTimer:null,eventIds:new Set(),
 recentRank:[],rankInitialized:false,lastEmoji:0,lastActivity:0,
 incomingHero:null
};
let heroLoadPromise=null;
const labelHero=hero=>hero.name+" · "+hero.trait;
const fmt=v=>new Intl.NumberFormat("zh-CN").format(Number(v)||0);
const emojiByPosition=i=>["👑","🔥","⚡","🚀","✨","💪"][i%6];
const getCount=(topic,id)=>Number(LIVE?.getCount?.(topic,id)||0);
const isClosed=()=>Date.now()>=OPEN_AT;
function toast(message){
 let el=$("council-toast");
 if(!el){el=document.createElement("div");el.id="council-toast";el.className="toast";el.setAttribute("role","status");document.body.appendChild(el);}
 el.textContent=message;el.hidden=false;
 window.clearTimeout(state.toastTimer);state.toastTimer=window.setTimeout(()=>el.hidden=true,3300);
}
function statusText(msg){
 const el=$("activity-line");if(el)el.textContent=msg;
}
function realCount(hero){return getCount("hero",hero.id);}
function orderedHeroes(){
 return state.heroes.slice().sort((a,b)=>realCount(b)-realCount(a)||a.position-b.position);
}
function makeImage(asset,alt,className){
 const img=document.createElement("img");img.className=className||"";img.alt=alt;
 img.loading="lazy";img.decoding="async";img.referrerPolicy="no-referrer";return img;
}
function portrait(hero,small){
 const holder=document.createElement("span");holder.className=small?"portrait small":"portrait";
 const fallback=document.createElement("span");fallback.className="portrait-fallback";fallback.textContent=hero.trait[0]||"✳";fallback.setAttribute("aria-hidden","true");
 const image=makeImage(hero.asset,labelHero(hero)+"头像","");
 image.addEventListener("load",()=>{fallback.hidden=true;});
 image.addEventListener("error",()=>{image.hidden=true;fallback.hidden=false;});
 image.src=hero.asset.site_url;
 holder.append(fallback,image);return holder;
}
function validHero(a){
 if(!a||a.type!=="hero"||a.id!==a.trait||!a.trait_name||!a.name)return false;
 if(typeof a.site_url!=="string"||typeof a.repository_path!=="string")return false;
 try{
  const u=new URL(a.site_url);
  return u.protocol==="https:"&&u.hostname==="torchlightskill.com"&&u.pathname==="/"+a.repository_path;
 }catch(error){return false;}
}
async function loadHeroes(){
 const response=await fetch(MANIFEST,{cache:"no-cache"});
 if(!response.ok)throw Error("英雄头像资料暂时无法加载");
 const json=await response.json();
 const assets=Array.isArray(json.assets)?json.assets.filter(a=>a.type==="hero"):[];
 if(assets.length!==28||assets.some(a=>!validHero(a)))throw Error("英雄资料不完整，请稍后再试");
 state.heroes=assets.map((a,i)=>({
  id:a.id,name:a.name,trait:a.trait_name,alias:SHORT_IDS[a.id]||a.name,asset:a,
  position:i,color:COLORS[i%COLORS.length]
 }));
 state.heroById=new Map(state.heroes.map(h=>[h.id,h]));
 state.loaded=true;
}
function ensureHeroes(){
 if(state.loaded)return Promise.resolve();
 if(!heroLoadPromise)heroLoadPromise=loadHeroes().finally(()=>{heroLoadPromise=null;});
 return heroLoadPromise;
}
function makeHeroColumn(h){
 const b=document.createElement("button");b.type="button";b.className="contender";b.dataset.hero=h.id;
 b.style.setProperty("--hero-color",h.color);
 const head=document.createElement("span");head.className="contender-head";
 const rank=document.createElement("span");rank.className="contender-rank";
 const num=document.createElement("span");num.className="contender-number";
 const face=portrait(h,true);head.append(rank,num,face);
 const bar=document.createElement("span");bar.className="contender-bar";
 const meta=document.createElement("span");meta.className="contender-meta";
 const name=document.createElement("strong");name.textContent=h.name;
 const trait=document.createElement("small");trait.textContent=h.trait;meta.append(name,trait);
 b.append(head,bar,meta);
 b.addEventListener("click",()=>voteHero(h.id,b));
 state.rankNodes.set(h.id,{b,rank,num,bar,face});
 return b;
}
function makeHeroCard(h){
 const item=document.createElement("article");item.className="roster-card";item.dataset.hero=h.id;
 item.style.setProperty("--hero-color",h.color);
 const vote=document.createElement("button");vote.className="roster-vote";vote.type="button";
 vote.dataset.hero=h.id;
 const face=portrait(h,false);
 const info=document.createElement("span");info.className="roster-info";
 const name=document.createElement("strong");name.textContent=h.name;
 const trait=document.createElement("span");trait.textContent=h.trait;
 const alias=document.createElement("small");alias.textContent=h.alias;info.append(name,trait,alias);
 const side=document.createElement("span");side.className="roster-count";
 const count=document.createElement("strong"),action=document.createElement("span");
 action.className="roster-check";side.append(count,action);
 const meter=document.createElement("span");meter.className="roster-meter";
 const fill=document.createElement("span");meter.append(fill);
 vote.append(face,info,side,meter);
 vote.addEventListener("click",()=>voteHero(h.id,item));
 const shareBtn=document.createElement("button");shareBtn.type="button";shareBtn.className="roster-share";shareBtn.textContent="📣 分享";
 shareBtn.setAttribute("aria-label","分享 "+labelHero(h)+" 的投票");
 shareBtn.addEventListener("click",()=>share("hero",{hero:h.id}));
 item.append(vote,shareBtn);
 state.heroNodes.set(h.id,{item,vote,count,action,fill});
 return item;
}
function updateCards(){
 const max=Math.max(1,...state.heroes.map(realCount));
 for(const h of state.heroes){
  const ref=state.heroNodes.get(h.id);
  if(!ref)continue;
  const v=realCount(h),selected=state.selected.hero===h.id;
  ref.count.textContent=fmt(v);ref.action.textContent=selected?"✅ 已投":"投票";
  ref.item.classList.toggle("selected",selected);
  ref.vote.disabled=!state.ready||isClosed();
  ref.vote.setAttribute("aria-pressed",String(selected));
  ref.vote.setAttribute("aria-label",labelHero(h)+", "+fmt(v)+"票，"+(selected?"已投":"投票"));
  ref.fill.style.width=(v>0?Math.round(v/max*100):0)+"%";
 }
 if($("all-heroes").open)arrangeCards();
}
function arrangeCards(){
 const order=state.heroes.slice();
 if(state.heroSort==="votes")order.sort((a,b)=>realCount(b)-realCount(a)||a.position-b.position);
 else order.sort((a,b)=>a.name.localeCompare(b.name,"zh-CN")||a.position-b.position);
 const host=$("hero-list"),active=document.activeElement;
 const activeId=active?.dataset?.hero;
 const before=active?.getBoundingClientRect?.();
 const group=document.createDocumentFragment();
 let shown=0;
 for(const h of order){
  const ref=state.heroNodes.get(h.id);
  const q=state.search.toLowerCase();
  const yes=!q||[h.name,h.trait,h.alias].join(" ").toLowerCase().includes(q);
  ref.item.hidden=!yes;
  if(yes)shown++;
  group.appendChild(ref.item);
 }
 host.replaceChildren(group);
 $("hero-search-summary").textContent=shown+" / 28 个特性";
 $("roster-empty").hidden=shown!==0;
 if(activeId&&before&&active?.isConnected){
  const after=active.getBoundingClientRect();
  const dy=after.top-before.top;
  if(Math.abs(dy)>4&&window.scrollBy)window.scrollBy({top:dy,left:0,behavior:"instant"});
 }
}
function updateHeroChart(){
 if(!state.loaded)return;
 const host=$("chart"),ranked=orderedHeroes(),limit=window.innerWidth<=700?4:6;
 const previous=new Map();
 host.querySelectorAll(".contender").forEach(node=>previous.set(node.dataset.hero,node.getBoundingClientRect()));
 const max=Math.max(0,realCount(ranked[0]));
 const fragment=document.createDocumentFragment();
 ranked.slice(0,limit).forEach((hero,i)=>{
  if(!state.rankNodes.has(hero.id))makeHeroColumn(hero);
  const ref=state.rankNodes.get(hero.id),n=realCount(hero);
  ref.rank.textContent=max>0&&i===0?"👑 01":String(i+1).padStart(2,"0");
  ref.num.textContent=fmt(n);
  ref.bar.style.height=(max>0?Math.max(4,Math.round(n/max*(window.innerWidth<=700?172:188))):4)+"px";
  ref.b.classList.toggle("leader",max>0&&i===0);
  ref.b.classList.toggle("mine",state.selected.hero===hero.id);
  ref.b.disabled=!state.ready||isClosed();
  ref.b.setAttribute("aria-pressed",String(state.selected.hero===hero.id));
  ref.b.setAttribute("aria-label",labelHero(hero)+", "+fmt(n)+"票，第"+(i+1)+"名");
  fragment.appendChild(ref.b);
 });
 host.replaceChildren(fragment);
 if(!reduced){
  host.querySelectorAll(".contender").forEach(node=>{
   const rect=previous.get(node.dataset.hero);
   if(!rect||!node.animate)return;
   const dx=rect.left-node.getBoundingClientRect().left;
   if(Math.abs(dx)>2)node.animate([{transform:"translateX("+dx+"px)"},{transform:"translateX(0)"}],{duration:470,easing:"cubic-bezier(.2,.8,.2,1)"});
  });
 }
 $("ranking-label").textContent=String(limit);
 $("hero-total").textContent=String(state.heroes.length);
 $("demo-vote-total").textContent=fmt(state.heroes.reduce((n,h)=>n+realCount(h),0));
 const mine=state.heroById.get(state.selected.hero);
 if(mine){
  const rank=ranked.findIndex(h=>h.id===mine.id)+1;
  $("my-camp").textContent="✅ 我的英雄："+labelHero(mine)+" · 当前第 "+rank+" 名";
 }else if(state.incomingHero){
  $("my-camp").textContent="📣 朋友邀请你支持："+labelHero(state.incomingHero);
 }else{$("my-camp").textContent="还没投票？展开全部英雄选一个。";}
 const newRank=ranked.map(h=>h.id);
 if(state.rankInitialized&&max>0){
  const oldTop=state.recentRank[0],newTop=newRank[0];
  if(oldTop!==newTop&&Date.now()-state.lastEmoji>650){
   const hero=state.heroById.get(newTop);
   statusText("👑 "+labelHero(hero)+"升到榜首！");
   state.lastEmoji=Date.now();
  }
 }
 state.recentRank=newRank;state.rankInitialized=true;
}
async function voteHero(id,node){
 if(!state.ready){toast("正在连接投票服务，请稍后再试");return false;}
 if(isClosed()){toast("本期赛前投票已结束");return false;}
 if(state.selected.hero===id){toast("你已经支持这个英雄啦");return true;}
 const h=state.heroById.get(id);if(!h)return false;
 try{
  const result=await LIVE.vote("hero",id);
  state.selected.hero=id;updateHeroChart();updateCards();
  toast("✅ 已投给 "+labelHero(h)+"！📣 叫朋友来支持吧");
  if(node&&!reduced){
   const plus=document.createElement("span");plus.className="tap-plus";plus.textContent="🔥 +1";
   node.appendChild(plus);window.setTimeout(()=>plus.remove(),760);
  }
  return true;
 }catch(error){toast(String(error?.message||error));return false;}
}
function handleBubble(h,message){
 if(!state.motion||reduced||document.hidden)return;
 const host=$("bubble-layer"),area=$("arena-stage").getBoundingClientRect();
 const ref=state.rankNodes.get(h.id);
 const visible=ref?.b?.isConnected;
 const pos=visible?ref.face.getBoundingClientRect():null;
 const x=pos?Math.max(72,Math.min(area.width-72,pos.left+pos.width/2-area.left)):area.width/2;
 const y=pos?Math.max(62,pos.top-area.top-2):75;
 while(host.children.length>=2)host.firstElementChild.remove();
 const bubble=document.createElement("div");bubble.className="vote-bubble";
 bubble.style.left=x+"px";bubble.style.top=y+"px";
 const img=makeImage(h.asset,"","bubble-avatar");img.src=h.asset.site_url;
 const copy=document.createElement("span");copy.className="bubble-copy";
 const top=document.createElement("strong");top.textContent=message||"🗳️ +1";
 const desc=document.createElement("small");desc.textContent=labelHero(h);
 copy.append(top,desc);bubble.append(img,copy);host.appendChild(bubble);
 window.setTimeout(()=>bubble.remove(),1850);
}
function showCountdown(){
 const span=$("countdown"),gap=Math.max(0,OPEN_AT-Date.now());
 if(!gap){span.textContent="SS14 已开服";return;}
 const d=Math.floor(gap/86400000),h=Math.floor(gap%86400000/3600000);
 span.textContent=String(d).padStart(2,"0")+" 天 "+String(h).padStart(2,"0")+" 小时";
}
/* One compact switchable poll board; exact original copy and independent counters. */
const currentTopic=()=>FOCUS[state.activeTopic];
function topicVotes(topic){return topic.options.reduce((sum,c)=>sum+getCount(topic.id,c[0]),0);}
function renderTabs(){
 const host=$("topic-tabs"),fragment=document.createDocumentFragment();
 FOCUS.forEach((t,i)=>{
  const btn=document.createElement("button");btn.type="button";btn.className="focus-tab";
  btn.dataset.topic=t.id;
  btn.classList.toggle("active",i===state.activeTopic);
  btn.setAttribute("aria-current",i===state.activeTopic?"true":"false");
  const num=document.createElement("span");num.className="focus-tab-num";num.textContent=String(i+1).padStart(2,"0");
  const name=document.createElement("span");name.className="focus-tab-name";
  const title=document.createElement("strong");title.textContent=t.emoji+" "+t.short;
  const votes=document.createElement("small");votes.textContent=fmt(topicVotes(t))+" 票";
  name.append(title,votes);
  const mark=document.createElement("span");mark.className="focus-tab-mark";
  mark.textContent=state.selected[t.id]?"✅":i===state.activeTopic?"●":"→";
  btn.append(num,name,mark);
  btn.addEventListener("click",()=>selectTopic(i));
  fragment.appendChild(btn);
 });
 host.replaceChildren(fragment);
}
function updateTabCounts(){
 const nodes=$("topic-tabs").querySelectorAll(".focus-tab");
 nodes.forEach((b,i)=>{
  const t=FOCUS[i],el=b.querySelector(".focus-tab-name small");
  if(el)el.textContent=fmt(topicVotes(t))+" 票";
  b.querySelector(".focus-tab-mark").textContent=state.selected[t.id]?"✅":i===state.activeTopic?"●":"→";
 });
}
function selectTopic(i){
 const next=(i+FOCUS.length)%FOCUS.length;
 state.activeTopic=next;
 const topic=FOCUS[next];
 $("focus-followup").open=false;
 $("focus-step").textContent="议题 "+String(next+1).padStart(2,"0")+" / 04";
 $("focus-title").textContent=topic.title;
 $("focus-prompt").textContent=topic.prompt;
 $("focus-followup-body").textContent=topic.followup;
 $("focus-activity").textContent="四个选项分别计票，点选后可以改。";
 renderTabs();
 const fragment=document.createDocumentFragment();
 topic.options.forEach(([id,copy],j)=>{
  const btn=document.createElement("button");btn.type="button";btn.className="focus-vote-option";btn.dataset.choice=id;
  const meter=document.createElement("span");meter.className="focus-vote-meter";meter.setAttribute("aria-hidden","true");
  const number=document.createElement("span");number.className="focus-vote-num";number.textContent=String(j+1);
  const label=document.createElement("span");label.className="focus-vote-copy";label.textContent=copy;
  const percentage=document.createElement("span");percentage.className="focus-vote-percent";percentage.textContent="0%";
  btn.append(meter,number,label,percentage);
  btn.addEventListener("click",()=>voteFocus(topic,id));
  fragment.appendChild(btn);
 });
 $("focus-options").replaceChildren(fragment);
 updateFocusCounts();
}
function updateFocusCounts(){
 const topic=currentTopic(),total=topicVotes(topic);
 $("focus-live-count").textContent=fmt(total)+" 票";
 const buttons=$("focus-options").querySelectorAll(".focus-vote-option");
 buttons.forEach(button=>{
  const id=button.dataset.choice,n=getCount(topic.id,id),pct=total?Math.round(n/total*100):0;
  button.querySelector(".focus-vote-percent").textContent=pct+"%";
  button.querySelector(".focus-vote-meter").style.width=pct+"%";
  const chosen=state.selected[topic.id]===id;
  button.classList.toggle("selected",chosen);
  button.setAttribute("aria-pressed",String(chosen));
  button.querySelector(".focus-vote-num").textContent=chosen?"✅":String(topic.options.findIndex(x=>x[0]===id)+1);
  button.disabled=!state.ready;
  button.setAttribute("aria-label",topic.options.find(x=>x[0]===id)?.[1]+", "+fmt(n)+"票，占"+pct+"%");
 });
 const shareText=state.selected[topic.id]?"📣 分享我的选择 ↗":"📣 分享这道题 ↗";
 $("focus-share").textContent=shareText;
 updateTabCounts();
}
async function voteFocus(topic,choice){
 if(!state.ready){toast("正在连接投票服务，请稍后再试");return;}
 if(state.selected[topic.id]===choice){toast("这项已经是你的选择");return;}
 try{
  await LIVE.vote(topic.id,choice);
  state.selected[topic.id]=choice;
  updateFocusCounts();
  const label=topic.options.find(c=>c[0]===choice)?.[1]||"选项";
  const message="✅ 已投票： "+label+"  📣 快分享给朋友！";
  $("focus-activity").textContent=message;
  toast("🗳️ 投票成功，可以分享给朋友");
 }catch(error){toast(String(error?.message||error));}
}
/* Eight visual seats, four fixed topic followups + three approved questions + empty chair. */
const SEAT_POS=[[50,13],[77,22],[88,50],[77,77],[50,87],[23,77],[12,50],[23,22]];
const OFFICIAL_SLOT=[0,2,4,6];
function seatsFromData(){
 const result=new Array(8);
 FOCUS.forEach((t,i)=>{
  result[OFFICIAL_SLOT[i]]={
   key:"topic:"+t.id,kind:"official",title:t.short,body:t.followup,
   topic:t.id,emoji:t.emoji
  };
 });
 const published=state.approvedQuestions.slice().sort((a,b)=>
  LIVE.getSeatCount("question:"+b.id)-LIVE.getSeatCount("question:"+a.id)||b.at-a.at);
 [1,3,5].forEach((slot,i)=>{
  const q=published[i];
  result[slot]=q?{
   key:"question:"+q.id,kind:"player",title:q.text.slice(0,16)+(q.text.length>16?"…":""),
   body:q.text,emoji:"💬",id:q.id
  }:{key:"empty:"+slot,kind:"empty",title:"等玩家提问",body:"点击空椅子提交你最想问的问题。",emoji:"➕"};
 });
 result[7]={key:"empty:main",kind:"empty",title:"占座提问",body:"这把椅子留给你。",emoji:"➕",main:true};
 return result;
}
function makeSeatButton(seat,index,mini){
 const button=document.createElement("button");button.type="button";
 button.className=mini?"seat-strip-button":"seat-chair";
 button.dataset.seat=seat.key;
 button.classList.toggle("player",seat.kind==="player");
 button.classList.toggle("empty",seat.kind==="empty");
 button.classList.toggle("main-empty",!!seat.main);
 button.classList.toggle("seat-official",seat.kind==="official");
 button.classList.toggle("selected",state.selectedSeat===seat.key);
 if(!mini){
  button.style.setProperty("--seat-x",SEAT_POS[index][0]+"%");
  button.style.setProperty("--seat-y",SEAT_POS[index][1]+"%");
 }
 const icon=document.createElement("span");icon.className="seat-chair-emoji";icon.textContent=seat.emoji;
 const title=document.createElement(mini?"strong":"span");title.className=mini?"":"seat-chair-title";title.textContent=seat.title;
 const count=document.createElement(mini?"small":"span");count.className=mini?"":"seat-chair-count";
 count.textContent=seat.kind==="empty"?"点这里提问":fmt(LIVE?.getSeatCount?.(seat.key)||0)+" 人想问";
 button.append(icon,title,count);
 button.setAttribute("aria-label",seat.title+(seat.kind==="empty"?"，点击提交问题":"，"+count.textContent));
 button.addEventListener("click",()=>selectSeat(seat.key,true));
 return button;
}
function renderSeatMap(){
 state.chairs=seatsFromData();
 const root=$("seat-map"),strip=$("seat-strip");
 // Preserve the physical table center while replacing seat buttons.
 root.querySelectorAll(".seat-chair").forEach(b=>b.remove());
 strip.replaceChildren();
 let total=0;
 const fragment=document.createDocumentFragment();
 const mini=document.createDocumentFragment();
 state.chairs.forEach((seat,i)=>{
  fragment.appendChild(makeSeatButton(seat,i,false));
  mini.appendChild(makeSeatButton(seat,i,true));
  if(seat.kind!=="empty")total+=LIVE?.getSeatCount?.(seat.key)||0;
 });
 root.appendChild(fragment);strip.appendChild(mini);
 $("table-total").textContent=total?"🔥 "+fmt(total)+" 次问题支持":"🪑 支持喜欢的问题，帮它上桌";
 if(state.selectedSeat&&!state.chairs.some(x=>x.key===state.selectedSeat)){
  state.selectedSeat="topic:mode_reduction";
 }
 updateSeatDetail();
}
function updateSeatNumbers(){
 if(!state.chairs.length)return;
 const total=state.chairs.reduce((sum,seat)=>sum+(seat.kind==="empty"?0:LIVE?.getSeatCount?.(seat.key)||0),0);
 $("table-total").textContent=total?"🔥 "+fmt(total)+" 次问题支持":"🪑 等待第一票支持";
 for(const host of [$("seat-map"),$("seat-strip")]){
  host.querySelectorAll("[data-seat]").forEach(el=>{
   const seat=state.chairs.find(x=>x.key===el.dataset.seat);
   if(!seat)return;
   const number=el.querySelector(".seat-chair-count")||el.querySelector("small");
   if(number)number.textContent=seat.kind==="empty"?"点这里提问":fmt(LIVE?.getSeatCount?.(seat.key)||0)+" 人想问";
   el.classList.toggle("selected",state.selectedSeat===seat.key);
  });
 }
 updateSeatDetail();
}
function selectSeat(key,scroll){
 const chair=state.chairs.find(s=>s.key===key);
 if(!chair)return;
 state.selectedSeat=key;
 const ask=chair.kind==="empty";
 $("seat-detail").hidden=ask;
 $("seat-ask-panel").hidden=!ask;
 updateSeatDetail();
 updateSeatNumbers();
 if(scroll&&window.innerWidth<=700){
  const panel=$("seat-panel")||$("seat-detail");
  panel?.scrollIntoView?.({block:"nearest",behavior:reduced?"auto":"smooth"});
 }
 if(ask)$("roundtable-question-input").focus({preventScroll:true});
}
function updateSeatDetail(){
 const seat=state.chairs.find(s=>s.key===state.selectedSeat);
 if(!seat||seat.kind==="empty")return;
 $("seat-detail-tag").textContent=seat.kind==="official"?"📌 焦点议题追问":"💬 玩家已审核问题";
 $("seat-detail-title").textContent=seat.title;
 $("seat-detail-body").textContent=seat.body;
 const n=LIVE?.getSeatCount?.(seat.key)||0;
 $("seat-detail-count").textContent=n?"🔥 "+fmt(n)+" 人想让策划回答":"等第一位玩家支持";
 const voted=!!LIVE?.hasSupported?.(seat.key);
 $("seat-support").textContent=voted?"✅ 你已经支持这道问题":"🔥 我也想问这个";
 $("seat-support").disabled=voted||!state.ready;
 $("seat-share").disabled=false;
}
async function supportSeat(){
 const seat=state.chairs.find(s=>s.key===state.selectedSeat);
 if(!seat||seat.kind==="empty")return;
 if(LIVE.hasSupported(seat.key)){toast("已经支持过这个问题");return;}
 if(!state.ready){toast("实时服务尚未连接");return;}
 const button=$("seat-support");button.disabled=true;
 try{
  const result=await LIVE.supportSeat(seat.key);
  updateSeatNumbers();
  toast(result?.changed?"🔥 支持成功！这道问题 +1，分享出去让更多人看见":"✅ 已经支持过这个问题");
 }catch(error){toast(String(error?.message||error));button.disabled=false;}
}
function renderRoundQuestions(){
 const q=LIVE?.getQuestions?.()||[];
 state.approvedQuestions=q.filter(x=>x.status==="approved");
 state.pendingQuestions=q.filter(x=>x.status==="pending");
 const keywords=LIVE?.getKeywords?.()||[];
 const cloud=$("keyword-cloud"),fragment=document.createDocumentFragment();
 if(!keywords.length){
  const empty=document.createElement("span");empty.className="keyword-empty";empty.textContent="还没有问题热词";fragment.appendChild(empty);
 }else{
  keywords.slice(0,10).forEach((k,i)=>{
   const pill=document.createElement("span");pill.className="keyword-pill";pill.classList.toggle("keyword-leading",i===0);
   const label=document.createElement("strong");label.textContent=k.keyword;
   const n=document.createElement("small");n.textContent=fmt(k.count);
   pill.append(label,n);fragment.appendChild(pill);
  });
 }
 cloud.replaceChildren(fragment);
 $("keyword-status").textContent=LIVE?.isReady?.()?"全站实时":"连接中";
 $("question-total").textContent=state.approvedQuestions.length+" 条公开"+
  (state.pendingQuestions.length?" · "+state.pendingQuestions.length+" 条自己待审核":"");
 const list=$("roundtable-question-list"),group=document.createDocumentFragment();
 for(const question of q.slice(0,6)){
  const li=document.createElement("li");
  const line=document.createElement("span");line.className="question-text";line.textContent=question.text;
  const meta=document.createElement("div");meta.className="question-meta";
  const time=document.createElement("time");time.dateTime=new Date(question.at).toISOString();
  time.textContent=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(question.at));
  meta.appendChild(time);
  if(question.status==="pending"){
   const flag=document.createElement("span");flag.className="question-review-status";flag.textContent="⏳ 仅自己可见，待审核";meta.appendChild(flag);
  }else{
   const btn=document.createElement("button");btn.type="button";btn.className="share-local-question";btn.textContent="📣 分享";
   btn.addEventListener("click",()=>share("seat",{seat:"question:"+question.id}));meta.appendChild(btn);
  }
  li.append(line,meta);group.appendChild(li);
 }
 if(!q.length){const li=document.createElement("li");li.className="question-empty";li.textContent="还没有审核通过的问题";group.appendChild(li);}
 list.replaceChildren(group);
 renderSeatMap();
}
async function sendQuestion(event){
 event.preventDefault();
 const input=$("roundtable-question-input"),button=$("submit-roundtable-question"),feedback=$("roundtable-submit-feedback");
 const body=input.value.trim().replace(/\s+/g," ");
 if([...body].length<8||[...body].length>160){feedback.textContent="请写 8～160 个字，说明具体想问什么。";return;}
 if(Date.now()>=ASK_CLOSE_AT){feedback.textContent="本轮圆桌提问已结束。";return;}
 if(!state.ready){feedback.textContent="正在连接提问服务，请稍后再试。";return;}
 button.disabled=true;feedback.textContent="提交中…";
 try{
  const data=await LIVE.submitQuestion(body);
  if(data?.status==="pending"){
   input.value="";$("question-length").textContent="0 / 160 字";
   feedback.textContent="✅ 提交成功，正在等待审核。关键词已进入全站统计。";
   toast("💬 提交成功！审核通过后有机会入席");
  }else{feedback.textContent="✅ 已提交。";}
 }catch(error){feedback.textContent=String(error?.message||error);}
 finally{button.disabled=Date.now()>=ASK_CLOSE_AT;}
}
function showSlot(pre,current,next){
 for(const [id,h] of [["slot-prev",pre],["slot-current",current],["slot-next",next]]){
  const host=$(id);host.replaceChildren();
  if(!h){host.textContent=id==="slot-current"?"🎰 点击开始抽签":"—";continue;}
  const img=portrait(h,id!=="slot-current");
  const label=document.createElement("span");label.className="slot-name";
  const name=document.createElement("strong");name.textContent=h.name;
  const trait=document.createElement("small");trait.textContent=h.trait;
  label.append(name,trait);host.append(img,label);
 }
}
function drawRandom(){
 const n=state.heroes.length;if(n<1)throw Error("没有可抽选的英雄");
 if(!window.crypto?.getRandomValues)throw Error("浏览器不支持安全随机抽签");
 const max=4294967296,limit=Math.floor(max/n)*n,bits=new Uint32Array(1);
 do{window.crypto.getRandomValues(bits)}while(bits[0]>=limit);
 return state.heroes[bits[0]%n];
}
async function openLottery(){
 if(!state.loaded){
  toast("🎰 正在读取英雄特性，请稍候…");
  try{await ensureHeroes();}
  catch(error){toast("英雄资料加载失败，请检查网络再试一次");return;}
 }
 state.slotResult=null;state.spinning=false;
 if(state.slotTimer)window.clearTimeout(state.slotTimer);
 showSlot(null,null,null);
 $("lottery-result-label").textContent="还没抽";
 $("lottery-result-name").textContent="来看看随机到谁";
 $("lottery-result-sub").textContent="抽签不会自动投票";
 $("lottery-accept").disabled=true;$("lottery-share").disabled=true;
 $("lottery-spin").disabled=false;$("spin-label").textContent="开始抽签";
 $("lottery-dialog").showModal();
 document.body.classList.add("modal-open");
}
function finishSlot(hero){
 state.spinning=false;state.slotResult=hero;state.slotTimer=null;
 const i=state.heroes.findIndex(h=>h.id===hero.id);
 const arr=state.heroes;
 showSlot(arr[(i+arr.length-1)%arr.length],hero,arr[(i+1)%arr.length]);
 $("lottery-result-label").textContent="🎉 抽中了";
 $("lottery-result-name").textContent=labelHero(hero);
 $("lottery-result-sub").textContent=state.ready
  ?"真实榜第 "+(orderedHeroes().findIndex(h=>h.id===hero.id)+1)+" 名"
  :"🎰 抽签成功！实时投票服务连接后才能投票";
 $("lottery-accept").disabled=!state.ready||isClosed();
 $("lottery-share").disabled=false;$("lottery-spin").disabled=false;
 $("spin-label").textContent="再抽一次";
}
function spinSlot(){
 if(state.spinning||!state.loaded)return;
 let chosen;try{chosen=drawRandom()}catch(error){toast(String(error?.message||error));return;}
 state.spinning=true;state.slotResult=null;
 $("lottery-spin").disabled=true;$("spin-label").textContent="抽取中…";
 $("lottery-accept").disabled=true;$("lottery-share").disabled=true;
 $("lottery-result-label").textContent="🎰 旋转中…";$("lottery-result-name").textContent="？";
 if(reduced){finishSlot(chosen);return;}
 let steps=0;
 const tick=()=>{
  if(!$("lottery-dialog").open){state.spinning=false;return;}
  showSlot(drawRandom(),drawRandom(),drawRandom());
  steps++;
  if(steps>=(window.innerWidth<=700?12:17)){finishSlot(chosen);return;}
  state.slotTimer=window.setTimeout(tick,42+steps*5);
 };
 tick();
}
function closeDialog(d){
 if(d.id==="lottery-dialog"&&state.slotTimer){window.clearTimeout(state.slotTimer);state.slotTimer=null;state.spinning=false;}
 if(d.open)d.close();
 document.body.classList.toggle("modal-open",!!document.querySelector("dialog.modal[open]"));
}
/* Share independent topic, hero, chair or lottery URLs. */
function share(kind,args={}){
 const url=new URL(SHARE);
 let heading="来火炬议会投一票";
 if(kind==="hero"){
  const hero=state.heroById.get(args.hero)||state.heroById.get(state.selected.hero);
  if(hero){url.searchParams.set("kind","hero");url.searchParams.set("hero",hero.id);heading="我开荒准备玩 "+labelHero(hero)+"，你呢？";}
  else{url.searchParams.set("kind","ranking");heading="SS14 开荒，你玩哪个英雄？";}
 }else if(kind==="lottery"){
  url.searchParams.set("kind","lottery");
  const hero=state.heroById.get(args.hero)||state.slotResult;
  if(hero){url.searchParams.set("hero",hero.id);heading="我随机抽到了 "+labelHero(hero)+"！你也试试？";}
  else heading="🎰 不知道玩谁？来抽个开荒英雄";
 }else if(kind==="topic"){
  const topic=FOCUS.find(t=>t.id===args.topic)||currentTopic();
  url.searchParams.set("kind","topic");url.searchParams.set("topic",topic.id);
  const option=state.selected[topic.id];
  if(option)url.searchParams.set("choice",option);
  const label=topic.options.find(o=>o[0]===option)?.[1];
  heading=label?"🗳️ "+topic.title+" 我选了「"+label+"」，你呢？":topic.title+"，你站哪边？";
 }else if(kind==="seat"){
  url.searchParams.set("kind","seat");
  const seat=args.seat||state.selectedSeat;
  const chair=state.chairs.find(c=>c.key===seat);
  if(chair){url.searchParams.set("seat",seat);heading="🪑 我想让策划回答："+chair.body;}
  else heading="🪑 你最想让策划回答什么？";
 }else{
  url.searchParams.set("kind","ranking");heading="开荒选谁？让朋友也投一票";
 }
 $("share-link").value=url.toString();
 $("share-preview-text").textContent=heading;
 $("open-share-page").href=url.toString();
 $("share-tip").textContent="发给朋友后，他们可以直接打开对应英雄、议题或席位。";
 $("share-dialog").dataset.title=heading;
 if($("lottery-dialog").open)closeDialog($("lottery-dialog"));
 $("share-dialog").showModal();
 document.body.classList.add("modal-open");
}
async function copyShare(){
 try{await navigator.clipboard.writeText($("share-link").value);$("share-tip").textContent="✅ 链接已复制";}
 catch(error){$("share-link").focus();$("share-link").select();$("share-tip").textContent="链接已选中，请用系统复制。";}
}
async function nativeShare(){
 if(navigator.share){try{await navigator.share({title:"火炬议会",text:$("share-dialog").dataset.title,url:$("share-link").value});return;}catch(error){if(error?.name==="AbortError")return;}}
 await copyShare();
}
function bind(){
 $("open-hero-pool").addEventListener("click",()=>{
  $("all-heroes").open=true;$("all-heroes").scrollIntoView({behavior:reduced?"auto":"smooth",block:"start"});
  arrangeCards();
 });
 $("roster-toggle").addEventListener("click",()=>window.setTimeout(()=>{
  $("roster-summary-right").textContent=$("all-heroes").open?"⌃ 收起":"⌄ 展开";
  if($("all-heroes").open)arrangeCards();
 },0));
 $("hero-search").addEventListener("input",e=>{state.search=e.target.value.trim();arrangeCards();});
 $("hero-sort").addEventListener("change",e=>{state.heroSort=e.target.value;arrangeCards();});
 $("open-lottery").addEventListener("click",openLottery);
 $("lottery-spin").addEventListener("click",spinSlot);
 $("lottery-accept").addEventListener("click",async()=>{
  if(!state.slotResult)return;
  const good=await voteHero(state.slotResult.id);
  if(good)closeDialog($("lottery-dialog"));
 });
 $("lottery-share").addEventListener("click",()=>share("lottery"));
 $("lottery-choose").addEventListener("click",event=>{
  event.preventDefault();
  closeDialog($("lottery-dialog"));$("all-heroes").open=true;arrangeCards();$("all-heroes").scrollIntoView({behavior:reduced?"auto":"smooth"});
 });
 $("share-arena").addEventListener("click",()=>share("hero"));
 $("share-lottery-game").addEventListener("click",()=>share("lottery"));
 $("focus-next").addEventListener("click",()=>selectTopic(state.activeTopic+1));
 $("focus-share").addEventListener("click",()=>share("topic",{topic:currentTopic().id}));
 $("focus-ask").addEventListener("click",()=>{
  selectSeat("topic:"+currentTopic().id,false);
  $("roundtable").scrollIntoView({behavior:reduced?"auto":"smooth",block:"start"});
 });
 $("share-roundtable").addEventListener("click",()=>share("seat"));
 $("seat-support").addEventListener("click",supportSeat);
 $("seat-share").addEventListener("click",()=>share("seat"));
 $("seat-ask-back").addEventListener("click",()=>selectSeat("topic:mode_reduction",false));
 $("roundtable-question-input").addEventListener("input",e=>{$("question-length").textContent=[...e.target.value].length+" / 160 字";});
 $("roundtable-question-form").addEventListener("submit",sendQuestion);
 $("motion-toggle").addEventListener("click",()=>{
  state.motion=!state.motion;
  $("motion-toggle").textContent=state.motion?"隐藏气泡":"显示气泡";
  $("motion-toggle").setAttribute("aria-pressed",String(state.motion));
 });
 $("copy-share").addEventListener("click",copyShare);
 $("native-share").addEventListener("click",nativeShare);
 document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeDialog($(b.dataset.close))));
 document.querySelectorAll(".modal").forEach(d=>{
  d.addEventListener("click",e=>{if(e.target===d)closeDialog(d)});
  d.addEventListener("cancel",()=>{if(d.id==="lottery-dialog"&&state.slotTimer)window.clearTimeout(state.slotTimer);});
  d.addEventListener("close",()=>{
   if(d.id==="lottery-dialog"&&state.slotTimer){window.clearTimeout(state.slotTimer);state.slotTimer=null;state.spinning=false;}
   document.body.classList.toggle("modal-open",!!document.querySelector("dialog.modal[open]"));
  });
 });
 window.addEventListener("resize",()=>{
  const current=window.innerWidth<=700;
  if(current!==state.lastMobile){state.lastMobile=current;updateHeroChart();}
 },{passive:true});
}
function wireLive(){
 LIVE.hooks.onCounts=()=>{
  state.ready=true;
  updateHeroChart();updateCards();updateFocusCounts();
  $("vote-source-label").textContent="真实票数 · 实时更新";
 };
 LIVE.hooks.onOwnVotes=values=>{
  state.selected=values||{};
  updateHeroChart();updateCards();updateFocusCounts();updateSeatDetail();
 };
 LIVE.hooks.onVoteEvent=event=>{
  if(!state.motion)return;
  if(event.topic==="hero"){
   const h=state.heroById.get(event.choice);
   if(h){handleBubble(h,event.action==="switch"?"🔁 改选 +1":"🗳️ 真实 +1");statusText("🔥 有人支持 "+labelHero(h));}
  }else{
   const t=FOCUS.find(x=>x.id===event.topic);
   if(t&&t.id===currentTopic().id){
    const label=t.options.find(o=>o[0]===event.choice)?.[1];
    $("focus-activity").textContent="🗳️ 有玩家刚选了「"+label+"」";
   }
  }
 };
 LIVE.hooks.onSeatStats=()=>{
  updateSeatNumbers();
 };
 LIVE.hooks.onMySeats=()=>updateSeatDetail();
 LIVE.hooks.onSeatEvent=event=>{
  if(!state.motion)return;
  if(event.seat===state.selectedSeat)toast("🔥 这把椅子刚刚多了一票支持");
 };
 LIVE.hooks.onQuestions=()=>renderRoundQuestions();
 LIVE.hooks.onKeywordStats=()=>renderRoundQuestions();
 LIVE.hooks.onStatus=message=>{
  if(message?.state==="error"&&!state.ready)$("vote-source-label").textContent="连接失败，请刷新";
  else if(message?.state==="polling")$("vote-source-label").textContent="定时同步中";
  else if(message?.state==="ready")$("vote-source-label").textContent="真实票数 · 实时更新";
  if(message?.message)statusText(message.message);
 };
}
async function init(){
 state.lastMobile=window.innerWidth<=700;
 bind();showCountdown();window.setInterval(showCountdown,60000);
 if(Date.now()>=ASK_CLOSE_AT){$("submit-roundtable-question").disabled=true;$("roundtable-question-input").disabled=true;}
 try{
  await ensureHeroes();
  const group=document.createDocumentFragment();
  state.heroes.forEach(h=>group.appendChild(makeHeroCard(h)));
  $("hero-list").replaceChildren(group);
  const query=new URLSearchParams(location.search);
  const incomingId=query.get("hero");
  state.incomingHero=state.heroById.get(incomingId)||null;
  const incomingTopic=FOCUS.findIndex(t=>t.id===query.get("topic")||t.id===query.get("poll"));
  state.activeTopic=incomingTopic>=0?incomingTopic:0;
  selectTopic(state.activeTopic);
  renderSeatMap();updateHeroChart();updateCards();
  if(location.hash==="#all-heroes"||state.incomingHero&&location.hash.includes("heroes")){
   $("all-heroes").open=true;arrangeCards();
  }
  if(!LIVE?.available){$("vote-source-label").textContent="实时服务加载失败";statusText("刷新页面后重试");return;}
  wireLive();await LIVE.start();
  if(query.get("open")==="lottery"&&!isClosed())window.setTimeout(openLottery,200);
  const seat=decodeURIComponent(query.get("seat")||"");
  if(seat)selectSeat(seat,false);
  if(query.get("open")==="ask")selectSeat("empty:main",false);
 }catch(error){
  $("vote-source-label").textContent="加载失败";
  statusText(String(error?.message||error));
  toast("英雄或数据服务加载失败，请刷新页面再试");
 }
}
init();
})();
