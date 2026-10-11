(function(){
"use strict";
const $=id=>document.getElementById(id);
const OPEN_AT=Date.parse("2026-10-16T10:00:00+08:00");
const ROUND_END=Date.parse("2026-10-14T20:00:00+08:00");
const KEY="torchlight-council-preview-choice-v1";
const AVATAR_MANIFEST_URL="/assets/torchlight-mentor-avatars/manifest.json";
const VERSION_TRAIT_NOTE="当前官方英雄模块参考，不代表已确认 SS14 新版角色立绘";
const HERO_ALIASES={
  youga_1:"时空1",youga_2:"时空2",youga_3:"时空3",
  bing_1:"宾1",bing_2:"宾2",selena_1:"人鱼1",selena_2:"人鱼2",
  carino_1:"枪1",carino_2:"枪2",carino_3:"枪3",
  erika_1:"猫1",erika_2:"猫2",erika_3:"猫3",
  gemma_1:"吉玛1",gemma_2:"冰2",gemma_4:"吉玛4",
  rehan_1:"狂1",rehan_2:"狂2",iris_1:"魔灵1",iris_2:"魔灵2",
  rosa_1:"罗莎1",rosa_2:"罗莎2",thea_1:"希雅1",thea_2:"希雅2",thea_3:"希雅3",
  moto_1:"莫托1",moto_2:"莫托2",sage_1:"药娘"
};
const DEMO_VOTES={
  youga_3:218,bing_2:215,selena_2:211,carino_2:207,
  erika_2:205,gemma_2:201,iris_2:154,rehan_2:148,
  carino_1:137,carino_3:133,erika_1:129,erika_3:122,
  bing_1:116,gemma_1:112,gemma_4:108,thea_1:104,
  thea_2:100,thea_3:96,youga_1:93,youga_2:88,
  moto_1:84,moto_2:80,rosa_1:77,rosa_2:74,
  iris_1:70,selena_1:67,rehan_1:63,sage_1:60
};
const LEGACY_IDS={
  yuga3:"youga_3",yuga1:"youga_1",yuga2:"youga_2",
  bin2:"bing_2",bin1:"bing_1",selena2:"selena_2",selena1:"selena_1",
  carino2:"carino_2",carino1:"carino_1",carino3:"carino_3",
  erika2:"erika_2",erika1:"erika_1",erika3:"erika_3",
  gemma1:"gemma_2",gemma2:"gemma_1",gemma3:"gemma_4",
  raine1:"rehan_1",raine2:"rehan_2",thea1:"thea_1",thea2:"thea_2",thea3:"thea_3",
  moto1:"moto_1",moto2:"moto_2",moto3:"rosa_1",rosa1:"rosa_2",
  iris1:"iris_1",iris2:"iris_2",sechi1:"sage_1"
};
const heroes=[];
const heroIds=new Map();
let manifestLoaded=false;

function assetImg(asset,alt,cssClass){
  const img=document.createElement("img");
  img.className=cssClass||"";
  img.alt=alt;
  img.loading="lazy";
  img.decoding="async";
  img.referrerPolicy="no-referrer";
  // Use the manifest's own published site URL. Never borrow another trait's portrait.
  return img;
}
function setHeroPortrait(host,hero){
  host.classList.add("has-portrait");
  const initial=document.createElement("span");
  initial.className="portrait-initial";
  initial.textContent=hero.mark;
  initial.setAttribute("aria-hidden","true");
  const img=assetImg(hero.asset,name(hero)+" · 英雄特性头像","portrait-image");
  img.addEventListener("load",()=>{initial.hidden=true;});
  img.addEventListener("error",()=>{img.hidden=true;initial.hidden=false;host.classList.add("image-error");});
  img.src=hero.asset.site_url;
  host.replaceChildren(initial,img);
}
function validPortraitAsset(a,type){
  if(!a || a.type!==type || typeof a.id!=="string" || !a.id || typeof a.site_url!=="string" || typeof a.repository_path!=="string")return false;
  try{
    const u=new URL(a.site_url);
    if(u.protocol!=="https:"||u.hostname!=="torchlightskill.com")return false;
    if(u.pathname!=="/"+a.repository_path)return false;
    if(!a.repository_path.startsWith("assets/torchlight-mentor-avatars/"+(type==="hero"?"heroes/":"mentors/")))return false;
  }catch(error){return false;}
  if(type==="hero")return a.trait===a.id && typeof a.name==="string" && !!a.name.trim() && typeof a.trait_name==="string" && !!a.trait_name.trim() && !!a.source_url && !!a.source_snapshot_date && !!a.source_freshness;
  return ["mia","shiyu","reina"].includes(a.id);
}
function addPortraitSources(manifest,entries){
  const ul=$("avatar-source-list");
  const fragment=document.createDocumentFragment();
  entries.forEach(a=>{
    const li=document.createElement("li");
    const strong=document.createElement("strong");
    strong.textContent=a.type==="hero"?a.name+" · "+a.trait_name+" ("+a.id+")":a.name+" · 导师 ("+a.id+")";
    li.append(strong,document.createTextNode("　"));
    if(a.source_url){
      const link=document.createElement("a");
      link.href=a.source_url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="原始图片 ↗";
      li.append(link,document.createTextNode("　"));
    }
    const details=document.createElement("span");
    details.textContent=a.type==="hero"
      ?(a.source_snapshot_date+" · "+a.source_freshness+(a.covered_face?" · 遮面角色":""))
      :(a.source||"来源待确认");
    li.append(details);
    fragment.append(li);
  });
  ul.replaceChildren(fragment);
  $("avatar-source-status").textContent="清单 v"+manifest.schema_version+" · 发布 "+manifest.published_date+" · "+entries.filter(a=>a.type==="hero").length+" 个特性头像与 "+entries.filter(a=>a.type==="mentor").length+" 位导师 · SS14 最新立绘未作权威核验。图片权利说明："+(manifest.rights||"未提供额外使用授权说明");
}
function hydrateMentors(entries){
  ["mia","shiyu","reina"].forEach(id=>{
    const a=entries.find(asset=>asset.type==="mentor"&&asset.id===id);
    const img=document.querySelector('[data-mentor-image="'+id+'"]');
    const holder=img?.closest(".mentor-art");
    if(!a||!img||!holder) return;
    const placeholder=holder.querySelector(".portrait-placeholder");
    img.addEventListener("load",()=>{if(placeholder)placeholder.hidden=true;});
    img.addEventListener("error",()=>{img.hidden=true;if(placeholder)placeholder.hidden=false;});
    img.src=a.site_url;
    img.hidden=false;
  });
}
async function loadAvatarManifest(){
  const response=await fetch(AVATAR_MANIFEST_URL,{cache:"no-cache"});
  if(!response.ok)throw new Error("头像清单 HTTP "+response.status);
  const m=await response.json();
  if(m.schema_version!==1||!Array.isArray(m.assets))throw new Error("头像清单格式不兼容");
  const filtered=m.assets.filter(a=>a.type==="hero"||a.type==="mentor");
  const ids=new Set();
  for(const a of filtered){
    if(!validPortraitAsset(a,a.type))throw new Error("头像条目缺少来源、类型或特性字段："+String(a.id));
    const key=a.type+":"+a.id;
    if(ids.has(key))throw new Error("头像清单含重复 id："+key);
    ids.add(key);
  }
  const heroAssets=filtered.filter(a=>a.type==="hero");
  const mentorAssets=filtered.filter(a=>a.type==="mentor");
  if(!heroAssets.length || !["mia","shiyu","reina"].every(id=>mentorAssets.some(a=>a.id===id)))throw new Error("头像清单缺少英雄或导师条目");
  const built=heroAssets.map((a,i)=>({
    id:a.id,name:a.name,trait:a.trait_name,alias:HERO_ALIASES[a.id]||a.name,
    mark:(a.trait_name||a.name).charAt(0),
    color:["#ffb9cc","#a5dcff","#ffd84d","#b8e3a4","#ffcda0","#cebcff"][i%6],
    base:DEMO_VOTES[a.id]??Math.max(15,58-i),asset:a
  }));
  heroes.splice(0,heroes.length,...built);
  heroIds.clear();heroes.forEach(h=>heroIds.set(h.id,h));
  hydrateMentors(mentorAssets);
  addPortraitSources(m,filtered);
  manifestLoaded=true;
}
const topics=[
{id:"maze",host:"maze-options",summary:"maze-summary",deadline:0,options:[["agree","调整合理",67],["disagree","砍过头了",66]]},
{id:"roundtable",host:"roundtable-options",summary:"roundtable-summary",deadline:ROUND_END,options:[["drops","开荒掉落与收益",47],["balance","英雄与技能平衡",45],["pets","契灵与氪金体验",44],["season","赛季玩法节奏",43]]}
];
const choices={hero:null,maze:null,roundtable:null};
const fake={};
const nodes=new Map();
const reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let lastMobile=window.innerWidth<=700,draw=null,spinTimer=null,spinning=false,toastTimer=null;
const closedHero=()=>Date.now()>=OPEN_AT;
const closedTopic=t=>!!t.deadline&&Date.now()>=t.deadline;
const name=h=>h.name+" · "+h.trait;
const heroVotes=h=>h.base+(choices.hero===h.id?1:0)+(fake[h.id]||0);
const rank=()=>heroes.slice().sort((a,b)=>heroVotes(b)-heroVotes(a)||a.id.localeCompare(b.id));
const topicVotes=(t,o)=>o[2]+(choices[t.id]===o[0]?1:0);
const fmt=n=>new Intl.NumberFormat("zh-CN").format(n);
function read(){
  try{const saved=JSON.parse(localStorage.getItem(KEY)||"{}");
    const savedId=LEGACY_IDS[saved.hero]||saved.hero;
    if(heroIds.has(savedId))choices.hero=savedId;
    for(const t of topics)if(t.options.some(o=>o[0]===saved[t.id]))choices[t.id]=saved[t.id];
  }catch(e){}
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(choices));}catch(e){notice("当前浏览器未开放本地存储，刷新后可能丢失选择");}}
function random(n){
  if(n<=1)return 0;
  if(!window.crypto||!crypto.getRandomValues)throw Error("当前浏览器不支持安全随机抽签");
  const limit=Math.floor(4294967296/n)*n,array=new Uint32Array(1);
  do{crypto.getRandomValues(array);}while(array[0]>=limit);
  return array[0]%n;
}
function notice(text){
  let x=$("tc-toast");
  if(!x){x=document.createElement("div");x.id="tc-toast";x.setAttribute("role","status");x.setAttribute("aria-live","polite");x.style.cssText="position:fixed;z-index:200;bottom:23px;left:50%;transform:translateX(-50%);max-width:calc(100% - 32px);padding:11px 18px;border:1px solid #f0f6cb;background:#deefa7;color:#192119;font:600 13px/1.55 sans-serif;text-align:center;box-shadow:0 12px 36px #0008;";document.body.append(x);}
  x.textContent=text;x.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.hidden=true,3000);
}
function makeNode(h){
  const btn=document.createElement("button");btn.type="button";btn.className="contender";btn.dataset.hero=h.id;btn.style.setProperty("--hero-color",h.color);
  btn.innerHTML='<span class="contender-rank"></span><span class="contender-top"><span class="contender-votes"></span><span class="contender-avatar"></span></span><span class="contender-bar"></span><span class="contender-ground"><span class="contender-name"></span><span class="contender-trait"></span><span class="contender-cta"></span></span>';
  setHeroPortrait(btn.querySelector(".contender-avatar"),h);
  btn.querySelector(".contender-name").textContent=h.name;
  btn.querySelector(".contender-trait").textContent=h.trait;
  btn.addEventListener("click",()=>voteHero(h.id,false));
  nodes.set(h.id,btn);return btn;
}
function chart(){
  const ranked=rank(),top=window.innerWidth<=700?4:6,highest=heroVotes(ranked[0]);
  const host=$("chart"),rects=new Map();
  Array.from(host.children).forEach(n=>{if(n.dataset&&n.dataset.hero)rects.set(n.dataset.hero,n.getBoundingClientRect());});
  const fragment=document.createDocumentFragment();
  ranked.slice(0,top).forEach((h,i)=>{
    const b=nodes.get(h.id)||makeNode(h),c=heroVotes(h);
    b.querySelector(".contender-rank").textContent=i===0&&highest?"#01  LEADER":"#"+String(i+1).padStart(2,"0");
    b.querySelector(".contender-votes").innerHTML=fmt(c)+"<small> 票</small>";
    b.querySelector(".contender-bar").style.height=(highest?Math.round(c/highest*(window.innerWidth<=700?205:247)):0)+"px";
    b.querySelector(".contender-cta").textContent=closedHero()?"已封榜":choices.hero===h.id?"已站队":"点击站队 ↗";
    b.classList.toggle("is-mine",choices.hero===h.id);b.classList.toggle("is-leader",i===0&&highest>0);
    b.setAttribute("aria-pressed",String(choices.hero===h.id));b.disabled=closedHero();
    b.setAttribute("aria-label",name(h)+"，模拟"+c+"票，排名第"+(i+1)+(choices.hero===h.id?"，你的阵营":"，点击站队"));
    fragment.append(b);
  });
  host.replaceChildren(fragment);
  if(!reduceMotion)Array.from(host.children).forEach(b=>{
    const old=rects.get(b.dataset.hero);if(!old||!b.animate)return;
    const delta=old.left-b.getBoundingClientRect().left;
    if(Math.abs(delta)>2)b.animate([{transform:"translateX("+delta+"px)"},{transform:"translateX(0)"}],{duration:470,easing:"cubic-bezier(.2,.8,.2,1)"});
  });
  $("ranking-label").textContent="前 "+top+" 位";
  $("hero-total").textContent=fmt(heroes.length);
  $("demo-vote-total").textContent=fmt(heroes.reduce((s,h)=>s+heroVotes(h),0));
  const mine=heroIds.get(choices.hero),camp=$("my-camp");
  if(!mine){
    const linkedId=new URLSearchParams(location.search).get("hero");
    const from=heroIds.get(LEGACY_IDS[linkedId]||linkedId);
    camp.textContent=from?"好友邀请你关注「"+name(from)+"」阵营":"尚未站队 · 点击英雄加入阵营";return;
  }
  const i=ranked.findIndex(h=>h.id===mine.id);
  const gap=i===0?0:heroVotes(ranked[0])-heroVotes(mine)+1;
  const strong=document.createElement("strong");strong.textContent="我的阵营："+name(mine);
  const tail=document.createTextNode(i===0?" · 当前模拟榜领跑":" · 第 "+(i+1)+" 名，距榜首还差 "+gap+" 票");
  camp.replaceChildren(strong,tail);
}
function voteHero(id,viaSlot){
  const h=heroIds.get(id);if(!h)return;
  if(closedHero()){notice("赛季已开服，阵营战已封榜");return;}
  if(choices.hero===id)notice("你已经站在「"+name(h)+"」阵营");
  else{
    const changed=!!choices.hero;choices.hero=id;save();chart();notice((changed?"已改选：":"已加入：")+name(h)+"（本地演示）");
  }
  if($("hero-dialog").open)closeDialog($("hero-dialog"));
  if(viaSlot&&$("lottery-dialog").open)closeDialog($("lottery-dialog"));
}
function picker(){
  const q=$("hero-search").value.trim().toLowerCase();
  const found=rank().filter(h=>!q||[h.name,h.trait,h.alias,name(h)].join(" ").toLowerCase().includes(q));
  $("hero-search-summary").textContent=found.length+" / "+heroes.length+" 个英雄特性";
  const fragment=document.createDocumentFragment();
  found.forEach(h=>{
    const btn=document.createElement("button");btn.type="button";btn.className="hero-choice";btn.classList.toggle("is-selected",choices.hero===h.id);btn.style.setProperty("--hero-color",h.color);
    const ava=document.createElement("span");ava.className="hero-choice-avatar";setHeroPortrait(ava,h);
    const copy=document.createElement("span");copy.className="hero-choice-body";
    const title=document.createElement("strong");title.textContent=name(h);
    const alias=document.createElement("span");alias.textContent=h.alias;copy.append(title,alias);
    const number=document.createElement("span");number.className="hero-choice-count";number.textContent=fmt(heroVotes(h))+" 票";
    btn.append(ava,copy,number);btn.disabled=closedHero();btn.setAttribute("aria-pressed",String(choices.hero===h.id));
    btn.addEventListener("click",()=>voteHero(h.id,false));fragment.append(btn);
  });
  if(!found.length){const p=document.createElement("p");p.className="hero-empty";p.textContent="找不到对应特性，试试别的关键词。";fragment.append(p);}
  $("hero-list").replaceChildren(fragment);
}
function renderTopic(t){
  const host=$(t.host),total=t.options.reduce((s,o)=>s+topicVotes(t,o),0);
  if(host.children.length!==t.options.length){
    const fragment=document.createDocumentFragment();
    t.options.forEach((o,i)=>{
      const b=document.createElement("button");b.type="button";b.className="poll-option";b.dataset.option=o[0];
      b.innerHTML='<span class="poll-meter" aria-hidden="true"></span><span class="poll-choice-icon"></span><span class="poll-choice-text"></span><span class="poll-choice-data"></span>';
      b.querySelector(".poll-choice-text").textContent=o[1];
      b.addEventListener("click",()=>voteTopic(t,o[0]));fragment.append(b);
    });host.replaceChildren(fragment);
  }
  Array.from(host.children).forEach((b,i)=>{
    const o=t.options[i],c=topicVotes(t,o),pct=total?Math.round(c/total*100):0;
    b.classList.toggle("is-selected",choices[t.id]===o[0]);
    b.querySelector(".poll-choice-icon").textContent=choices[t.id]===o[0]?"✓":String(i+1).padStart(2,"0");
    b.querySelector(".poll-choice-data").textContent=pct+"%";
    b.querySelector(".poll-meter").style.width=pct+"%";
    b.setAttribute("aria-pressed",String(choices[t.id]===o[0]));b.disabled=closedTopic(t);
    b.setAttribute("aria-label",o[1]+"，模拟"+c+"票，占"+pct+"%");
  });
  $(t.summary).textContent=closedTopic(t)?"本期已封榜 · "+fmt(total)+" 张演示票":fmt(total)+" 张演示票 · "+(choices[t.id]?"已站队，可改选":"点击选择立场");
}
function voteTopic(t,id){
  if(closedTopic(t)){notice("该轮投票已经封榜");return;}
  if(choices[t.id]===id){notice("当前已经选择这个立场");return;}
  choices[t.id]=id;save();renderTopic(t);
  notice("已站队："+t.options.find(o=>o[0]===id)[1]+"（本地演示）");
}
function countdown(){
  const delta=Math.max(0,OPEN_AT-Date.now()),time=$("countdown");
  if(delta===0){time.textContent="新赛季已开启";time.style.fontSize="25px";return;}
  const s=Math.floor(delta/1000),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);
  time.innerHTML=String(d).padStart(2,"0")+"<span>天</span>"+String(h).padStart(2,"0")+"<span>时</span>"+String(m).padStart(2,"0")+"<span>分</span>";
}
function showDialog(d){if(!d.open){if(typeof d.showModal==="function")d.showModal();else d.setAttribute("open","");}document.body.classList.add("dialog-active");}
function closeDialog(d){if(d.id==="lottery-dialog")cancelSpin();if(d.open){if(typeof d.close==="function")d.close();else d.removeAttribute("open");}if(!document.querySelector(".tc-dialog[open]"))document.body.classList.remove("dialog-active");}
function openPicker(){if(!manifestLoaded){notice("英雄清单尚未加载");return;}$("hero-search").value="";picker();showDialog($("hero-dialog"));setTimeout(()=>$("hero-search").focus(),50);}
function slotRows(a,b,c){$("slot-prev").textContent=a;$("slot-current").textContent=b;$("slot-next").textContent=c;}
function cancelSpin(){clearTimeout(spinTimer);spinTimer=null;spinning=false;$("lottery-spin").disabled=closedHero();}
function settle(h){
  draw=h;spinning=false;spinTimer=null;
  const pos=heroes.findIndex(x=>x.id===h.id);
  slotRows(heroes[(pos+heroes.length-1)%heroes.length].trait,name(h),heroes[(pos+1)%heroes.length].trait);
  $("lottery-result-label").textContent="命运选中了";
  $("lottery-result-name").textContent=name(h);
  $("lottery-result-sub").textContent="模拟榜第 "+(rank().findIndex(x=>x.id===h.id)+1)+" 名 · "+fmt(heroVotes(h))+" 票";
  $("lottery-announce").textContent="已揭晓结果，点击「接受天命」后才会记录你的本地选择。";
  $("lottery-spin").disabled=closedHero();$("lottery-accept").disabled=closedHero();
  $("lottery-share").disabled=false;$("spin-label").textContent="再抽一次";
}
function spin(){
  if(spinning||closedHero()||!heroes.length)return;
  let h;try{h=heroes[random(heroes.length)];}catch(err){notice(err.message);return;}
  draw=null;spinning=true;$("lottery-spin").disabled=true;$("lottery-accept").disabled=true;$("lottery-share").disabled=true;
  $("lottery-result-label").textContent="命运旋转中…";$("lottery-result-name").textContent="???";$("lottery-result-sub").textContent="所有特性等概率抽取";$("lottery-announce").textContent="";
  if(reduceMotion){settle(h);return;}
  let step=0;
  const tick=()=>{
    if(!$("lottery-dialog").open){cancelSpin();return;}
    const a=heroes[random(heroes.length)],b=heroes[random(heroes.length)],c=heroes[random(heroes.length)];
    slotRows(a.trait,name(b),c.trait);
    step++;if(step>=21){settle(h);return;}
    spinTimer=setTimeout(tick,42+step*5);
  };tick();
}
function openSlot(){
  if(!manifestLoaded){notice("英雄清单尚未加载");return;}
  cancelSpin();draw=null;slotRows("—","✳  点击开始抽签","—");
  $("lottery-result-label").textContent="SS14 · 全部可选英雄特性等概率随机";
  $("lottery-result-name").textContent="命运尚未揭晓";
  $("lottery-result-sub").textContent="不影响当前投票 · 完全免费";$("lottery-announce").textContent="";
  $("spin-label").textContent="开始抽签";$("lottery-accept").disabled=true;$("lottery-share").disabled=true;
  $("lottery-spin").disabled=closedHero();showDialog($("lottery-dialog"));
}
function simulate(){
  if(closedHero()||!heroes.length){notice("本期尚不能参与演示追赶");return;}
  const list=rank().slice(0,6);let h;
  try{h=list[1+random(list.length-1)];}catch(e){h=list[1];}
  const bonus=2+Math.floor(Math.random()*3);fake[h.id]=(fake[h.id]||0)+bonus;
  chart();notice("演出模拟："+name(h)+" +"+bonus+" 张模拟票");
}
function shareUrl(h){
  const u=new URL("https://torchlightskill.com/council/");
  if(h)u.searchParams.set("hero",h.id);
  return u.toString();
}
async function share(kind){
  const h=kind==="lottery"?draw:heroIds.get(choices.hero);
  const link=shareUrl(h);
  const text=!h?"火炬议会 SS14 开荒阵营战，来选你的开荒英雄！":kind==="lottery"?"我在火炬议会开荒命运机抽到「"+name(h)+"」，你会抽到谁？":"我在火炬议会交互预览中选了「"+name(h)+"」开荒，你会选谁？";
  if(navigator.share){try{await navigator.share({title:"火炬议会 Torchlight Council",text,url:link});return;}catch(e){if(e&&e.name==="AbortError")return;}}
  $("share-link").value=link;$("share-tip").textContent=text+" 复制链接后发给朋友即可。";showDialog($("share-dialog"));
}
async function copyShare(){
  const input=$("share-link");
  try{if(!navigator.clipboard||!navigator.clipboard.writeText)throw Error();await navigator.clipboard.writeText(input.value);$("share-tip").textContent="链接已复制，可以发给朋友。";}
  catch(e){input.focus();input.select();$("share-tip").textContent="复制未成功。链接已选中，请使用系统复制。";}
}
function init(){
  topics.forEach(renderTopic);countdown();
  ["pick-hero","open-lottery","simulate-btn"].forEach(id=>{$(id).disabled=true;});
  loadAvatarManifest().then(()=>{
    read();chart();
    ["pick-hero","open-lottery","simulate-btn"].forEach(id=>{$(id).disabled=closedHero();});
  }).catch(error=>{
    $("chart").textContent="头像或特性清单加载失败，请刷新重试。"+error.message;
    $("avatar-source-status").textContent="清单暂时无法加载："+error.message+"。为避免错配头像，已经暂停英雄投票与抽签。";
    $("hero-total").textContent="—";$("demo-vote-total").textContent="—";
  });
  setInterval(countdown,1000);
  setInterval(()=>{
    if(manifestLoaded&&closedHero()&&$("chart").querySelector("button:not(:disabled)")){chart();if($("hero-dialog").open)picker();}
    if(closedTopic(topics[1]))renderTopic(topics[1]);
  },15000);
  $("pick-hero").addEventListener("click",openPicker);
  $("open-lottery").addEventListener("click",openSlot);
  $("simulate-btn").addEventListener("click",simulate);
  $("share-arena").addEventListener("click",()=>share("arena"));
  $("hero-search").addEventListener("input",picker);
  $("lottery-spin").addEventListener("click",spin);
  $("lottery-accept").addEventListener("click",()=>{if(draw)voteHero(draw.id,true);});
  $("lottery-choose").addEventListener("click",()=>{closeDialog($("lottery-dialog"));openPicker();});
  $("lottery-share").addEventListener("click",()=>share("lottery"));
  $("copy-share").addEventListener("click",copyShare);
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeDialog($(b.dataset.close))));
  document.querySelectorAll(".tc-dialog").forEach(d=>{
    d.addEventListener("click",e=>{if(e.target===d)closeDialog(d);});
    d.addEventListener("close",()=>{if(d.id==="lottery-dialog")cancelSpin();if(!document.querySelector(".tc-dialog[open]"))document.body.classList.remove("dialog-active");});
    d.addEventListener("cancel",()=>{if(d.id==="lottery-dialog")cancelSpin();});
  });
  window.addEventListener("resize",()=>{const m=window.innerWidth<=700;if(m!==lastMobile){lastMobile=m;if(manifestLoaded)chart();}},{passive:true});
}
init();
})();
