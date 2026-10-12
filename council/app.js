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
const LIVE=window.TorchCouncilLive;
const polling=[
 {id:"maze",host:"maze-options",summary:"maze-summary",closedAt:null,choices:[["support","可以接受",0],["oppose","改得太狠了",0]]},
 {id:"roundtable",host:"roundtable-options",summary:"roundtable-summary",closedAt:ROUNDTABLE_END,choices:[["drops","掉落和刷图收益",0],["balance","英雄和技能平衡",0],["pets","契灵氪金体验",0],["season","赛季玩法节奏",0]]}
];
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
function readChoice(){ /* Live votes are restored by Supabase Auth only. */ }
function saveChoice(){ /* No legacy demo localStorage writes. */ }
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
  b.classList.toggle("leader",index===0);
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
function buildRoster(){
 const frag=document.createDocumentFragment();
 const order=heroes.slice().sort((a,b)=>a.position-b.position);
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
  ref.action.disabled=isHeroClosed()||!remoteReady;
  ref.action.setAttribute("aria-pressed",String(state.hero===id));
  ref.action.setAttribute("aria-label",sourceName(h)+"，真实"+v+"票，"+(state.hero===id?"已投":"投票"));
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
 } catch(error) {
   toast(String(error?.message||error));
 }
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
 const lineTop=document.createElement("strong");lineTop.textContent=label||"真实 +1";
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

/* 策划圆桌：匿名问题与关键词本机即时预览。等 Supabase 连接后替换为后端聚合数据。 */
const ROUND_QUESTIONS_KEY="torchlight-council-roundtable-questions-local-v1";
const ROUND_MAX_QUESTIONS=40;
const ROUND_MIN_INTERVAL=10000;
const ROUND_KEYWORDS=[
 {label:"掉落",matches:["掉落","爆率","出货","爆东西","爆装"]},
 {label:"迷城",matches:["迷城","燃料"]},
 {label:"刷图收益",matches:["刷图","刷宝","搬砖","收益","产出"]},
 {label:"英雄平衡",matches:["英雄","平衡","砍","加强","削弱","增强","数值"]},
 {label:"契灵",matches:["契灵","宠物","氪金","充钱"]},
 {label:"赛季玩法",matches:["赛季","塔罗斯","新玩法","机制","活动"]},
 {label:"装备打造",matches:["装备","打造","词缀","词条"]},
 {label:"交易价格",matches:["交易","价格","拍卖","物价","市场"]},
 {label:"开荒难度",matches:["开荒","前期","难度","速刷","过图"]},
 {label:"游戏体验",matches:["卡顿","掉线","延迟","服务器","崩溃","bug","BUG"]}
];
let roundQuestions=[];
function keywordsForQuestion(value){
 const text=value.toLowerCase();
 const matched=ROUND_KEYWORDS.filter(entry=>entry.matches.some(term=>text.includes(term.toLowerCase()))).map(entry=>entry.label);
 return matched.length?matched:["其他"];
}
function loadRoundQuestions(){
 try{
  const entries=JSON.parse(localStorage.getItem(ROUND_QUESTIONS_KEY)||"[]");
  if(Array.isArray(entries)){
   roundQuestions=entries.filter(v=>v&&typeof v.text==="string"&&v.text.trim().length>=8&&v.text.length<=160&&Number.isFinite(v.at)).slice(-ROUND_MAX_QUESTIONS);
  }
 }catch(error){roundQuestions=[];}
}
function saveRoundQuestions(){
 try{
  localStorage.setItem(ROUND_QUESTIONS_KEY,JSON.stringify(roundQuestions));
  return true;
 }catch(error){
  $("roundtable-submit-feedback").textContent="无法在当前浏览器保存，请检查隐私设置。";
  return false;
 }
}
function renderRoundQuestions(){
 const cloud=$("keyword-cloud"),list=$("roundtable-question-list");
 if(!cloud||!list)return;
 const counts=new Map();
 for(const question of roundQuestions){
  for(const word of keywordsForQuestion(question.text))counts.set(word,(counts.get(word)||0)+1);
 }
 const ranking=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"zh-CN")).slice(0,12);
 const cloudFrag=document.createDocumentFragment();
 if(!ranking.length){
  const empty=document.createElement("span");empty.className="keyword-empty";empty.textContent="还没有提交的问题";cloudFrag.appendChild(empty);
 }else{
  const maximum=ranking[0][1];
  ranking.forEach(([word,n],i)=>{
   const item=document.createElement("span");item.className="keyword-pill";
   const prominence=maximum?Math.round(100*n/maximum):0;
   item.style.setProperty("--weight",String(prominence));
   item.classList.toggle("keyword-leading",i===0);
   const tag=document.createElement("strong");tag.textContent=word;
   const volume=document.createElement("small");volume.textContent=String(n);
   item.append(tag,volume);cloudFrag.appendChild(item);
  });
 }
 cloud.replaceChildren(cloudFrag);
 $("keyword-status").textContent=roundQuestions.length?"本机 · 即时更新":"本机预览";
 $("question-total").textContent=roundQuestions.length+" 条（本机）";
 const frag=document.createDocumentFragment();
 if(!roundQuestions.length){
  const empty=document.createElement("li");empty.className="question-empty";empty.textContent="等你提交第一个问题";frag.appendChild(empty);
 }else{
  roundQuestions.slice(-5).reverse().forEach(q=>{
   const li=document.createElement("li");li.className="question-item";
   const text=document.createElement("span");text.className="question-text";text.textContent=q.text;
   const bottom=document.createElement("div");bottom.className="question-meta";
   const date=document.createElement("time");
   date.dateTime=new Date(q.at).toISOString();
   date.textContent=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(q.at));
   const remove=document.createElement("button");remove.type="button";remove.className="remove-local-question";remove.textContent="删除";
   remove.setAttribute("aria-label","删除本机问题："+q.text.slice(0,18));
   remove.addEventListener("click",()=>{
    roundQuestions=roundQuestions.filter(entry=>entry.id!==q.id);
    saveRoundQuestions();renderRoundQuestions();
    $("roundtable-submit-feedback").textContent="已从当前浏览器删除这条问题。";
   });
   const shareQuestion=document.createElement("button");shareQuestion.type="button";shareQuestion.className="share-local-question";shareQuestion.textContent="分享";
   shareQuestion.setAttribute("aria-label","分享这条圆桌问题："+q.text.slice(0,18));
   shareQuestion.addEventListener("click",()=>share("roundtable-question",q.text));
   bottom.append(date,shareQuestion,remove);li.append(text,bottom);frag.appendChild(li);
  });
 }
 list.replaceChildren(frag);
}
function submitRoundQuestion(event){
 event.preventDefault();
 const field=$("roundtable-question-input"),feedback=$("roundtable-submit-feedback");
 if(!field)return;
 if(Date.now()>=ROUNDTABLE_END){
  feedback.textContent="本轮圆桌征集已结束。";
  return;
 }
 const value=field.value.trim().replace(/\s+/g," ");
 if(value.length<8||value.length>160){
  feedback.textContent="请写 8～160 个字，说明你具体想问什么。";
  return;
 }
 if(roundQuestions.some(item=>item.text===value)){
  feedback.textContent="这条问题已经在当前浏览器保存过了。";
  return;
 }
 if(roundQuestions.length&&Date.now()-roundQuestions[roundQuestions.length-1].at<ROUND_MIN_INTERVAL){
  feedback.textContent="请稍等几秒再提交，避免重复问题。";
  return;
 }
 const q={id:String(Date.now())+"-"+String(Math.floor(Math.random()*10000)),text:value,at:Date.now()};
 roundQuestions.push(q);roundQuestions=roundQuestions.slice(-ROUND_MAX_QUESTIONS);
 if(!saveRoundQuestions()){roundQuestions.pop();return;}
 field.value="";$("question-length").textContent="0 / 160 字";
 renderRoundQuestions();
 feedback.textContent="已保存在当前浏览器，右侧热词已更新。全站同步要等 Supabase 接入。";
}
function setupRoundtable(){
 loadRoundQuestions();renderRoundQuestions();
 const form=$("roundtable-question-form"),field=$("roundtable-question-input");
 if(!form||!field)return;
 field.addEventListener("input",()=>{
  $("question-length").textContent=Array.from(field.value).length+" / 160 字";
 });
 form.addEventListener("submit",submitRoundQuestion);
 if(Date.now()>=ROUNDTABLE_END){
  $("submit-roundtable-question").disabled=true;
  field.disabled=true;
  $("roundtable-submit-feedback").textContent="本轮圆桌提问已经结束。";
 }
 window.addEventListener("storage",event=>{
  if(event.key===ROUND_QUESTIONS_KEY){loadRoundQuestions();renderRoundQuestions();}
 });
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
 const totals=topic.choices.map(c=>c[2]);
 const sum=totals.reduce((a,b)=>a+b,0)||1;
 Array.from(host.children).forEach((b,i)=>{
  const option=topic.choices[i],amount=totals[i],pct=Math.round(amount/sum*100);
  b.querySelector(".poll-meter").style.width=pct+"%";
  b.querySelector(".poll-option-index").textContent=state[topic.id]===option[0]?"✓":String(i+1).padStart(2,"0");
  b.querySelector(".poll-pct").textContent=pct+"%";
  b.classList.toggle("selected",state[topic.id]===option[0]);
  b.setAttribute("aria-pressed",String(state[topic.id]===option[0]));
  b.disabled=isTopicClosed(topic)||!remoteReady;
 });
 $(topic.summary).textContent= (isTopicClosed(topic)?"已结束 · ":"") + fmt(totals.reduce((a,b)=>a+b,0))+" 张投票";
 const shareButton=$(topic.id==="maze"?"share-maze":"share-roundtable");
 if(shareButton)shareButton.textContent=state[topic.id]?"分享我的选择 ↗":"分享这道投票 ↗";
}
async function voteTopic(topic,id){
 if(!remoteReady){toast("正在连接真实投票，请稍后再试");return;}
 if(isTopicClosed(topic)){toast("这道题投票已结束");return;}
 if(state[topic.id]===id){toast("你已经选了这项");return;}
 try {
   await LIVE.vote(topic.id,id);
   state[topic.id]=id;
   renderTopic(topic);
   toast("已选择「"+topic.choices.find(c=>c[0]===id)[1]+"」，票数已同步");
 }catch(error){toast(String(error?.message||error));}
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
  case "maze":
   url.searchParams.set("kind","maze");
   if(state.maze)url.searchParams.set("choice",state.maze);
   title=state.maze==="support"?"我觉得迷城这次调整还能接受，你呢？":state.maze==="oppose"?"迷城这次砍得太狠了，你觉得呢？":"迷城燃料被砍，你能接受吗？";
   caption="朋友可以在分享页直接选择自己的立场。";
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
   if(state.roundtable)url.searchParams.set("choice",state.roundtable);
   const topic=polling.find(t=>t.id==="roundtable");
   const answer=topic.choices.find(c=>c[0]===state.roundtable);
   title=answer?"圆桌会谈，我最想问："+answer[1]+"。你想问什么？":"官方圆桌会谈，你最想让策划回答什么？";
   caption="朋友可以直接投票，选出最关心的话题。";
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
 $("share-tip").textContent=item.caption+" 当前是演示版，投票只保存在各自浏览器。";
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
 $("open-lottery").addEventListener("click",openSlot);
 $("lottery-spin").addEventListener("click",spin);
 $("lottery-accept").addEventListener("click",()=>{
  if(!state.slotResult)return;
  voteHero(state.slotResult.id,null);
  closeModal($("lottery-dialog"));
  document.getElementById("all-heroes").scrollIntoView({behavior:reducedMotion?"auto":"smooth"});
 });
 $("lottery-share").addEventListener("click",()=>share("slot"));
 $("share-lottery-game").addEventListener("click",()=>share("lottery"));
 $("lottery-choose").addEventListener("click",()=>closeModal($("lottery-dialog")));
 $("copy-share").addEventListener("click",copyLink);
 $("share-arena").addEventListener("click",()=>share("vote"));
 $("share-maze").addEventListener("click",()=>share("maze"));
 $("share-roundtable").addEventListener("click",()=>share("roundtable"));
 $("native-share").addEventListener("click",nativeShare);
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
 setInterval(()=>{
  if(isTopicClosed(polling[1]))renderTopic(polling[1]);
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
  readChoice();loaded=true;
  buildRoster();chart();
  const incoming=new URLSearchParams(location.search);
  const sharedHero=heroMap.get(safeChoice(incoming.get("hero")));
  if(sharedHero){
   const ref=rosterCards.get(sharedHero.id);
   if(ref)ref.button.classList.add("invited");
   $("my-camp").textContent="朋友邀请你支持 "+sourceName(sharedHero)+"。可以直接点击下方卡片投票。";
   const hash=location.hash;
   if(hash==="#all-heroes"){
    $("hero-search").value=sharedHero.alias;
    searchRoster();
   }
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
  $("simulate-btn").disabled=isHeroClosed();
  showActivity("模拟有人投票时，会冒出 +1 气泡",true);
  setInterval(tickDemo,5100);
  setTimeout(tickDemo,2100);
 }catch(error){
  $("hero-list").textContent="头像清单加载失败，请刷新重试。";
  $("chart").textContent="暂时无法读取英雄资料。";
  $("hero-search-summary").textContent="加载失败";
  state.motion=false;$("motion-toggle").disabled=true;
 }
}
init();
})();