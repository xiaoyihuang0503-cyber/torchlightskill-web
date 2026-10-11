(function(){
"use strict";
const $=id=>document.getElementById(id);
const OPEN_AT=Date.parse("2026-10-16T10:00:00+08:00");
const ROUND_END=Date.parse("2026-10-14T20:00:00+08:00");
const KEY="torchlight-council-preview-choice-v1";
const heroRows=[
["yuga3","尤加","最终之人","时空3","终","#aaa4cf",128],
["bin2","宾","创想鬼才","宾2","创","#d4b68c",127],
["selena2","赛琳娜","与深海共舞","人鱼2","汐","#82b9c8",126],
["carino2","卡里诺","至暗掠影","枪2","影","#c78d9e",125],
["erika2","艾瑞卡","电光猫影","猫2","猫","#b8cd85",124],
["gemma1","吉玛","冰结之心","冰1","冰","#8cbbdc",123],
["raine1","雷恩","怒火","狂1","怒","#cb9d87",78],
["raine2","雷恩","怒影","狂2","狂","#b98e7c",74],
["carino1","卡里诺","荣光游侠","枪1","枪","#b3a98f",71],
["carino3","卡里诺","战火狂徒","枪3","火","#d1a486",69],
["erika1","艾瑞卡","疾风追猎","猫1","风","#94b9aa",65],
["erika3","艾瑞卡","寻仇之刺","猫3","刺","#a0acba",63],
["bin1","宾","爆破新星","宾1","爆","#ccb08b",58],
["gemma2","吉玛","冰火融合","冰2","融","#c1a8ca",55],
["gemma3","吉玛","欢愉之焰","吉玛3","焰","#b9a18a",54],
["thea1","希雅","众神之伟智","希雅1","神","#b2adcb",50],
["thea2","希雅","众神之化身","希雅2","化","#c0a2bd",49],
["thea3","希雅","渎神","希雅3","渎","#a8b9be",45],
["yuga1","尤加","时空幻象","时空1","时","#959ec8",44],
["yuga2","尤加","时空流逝","时空2","空","#a7b1ce",42],
["moto1","莫托","号令征召","莫托1","令","#b3b99c",39],
["moto2","莫托","冲锋征召","莫托2","冲","#b6a98a",37],
["moto3","莫托","圣庭战车","莫托3","庭","#abb5a3",35],
["rosa1","罗莎","无垢之刃","罗莎","刃","#beafb0",32],
["iris1","伊瑞斯","生长的微风","魔灵1","灵","#9bb6a2",30],
["iris2","伊瑞斯","守望的暖风","魔灵2","守","#b3c49e",28],
["selena1","赛琳娜","与海潮同歌","人鱼1","歌","#90b9c7",26],
["sechi1","赛琪","甘草前调","药娘","药","#b1be92",25]];
const heroes=heroRows.map(r=>({id:r[0],name:r[1],trait:r[2],alias:r[3],mark:r[4],color:r[5],base:r[6]}));
const heroIds=new Map(heroes.map(h=>[h.id,h]));
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
    if(heroIds.has(saved.hero))choices.hero=saved.hero;
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
  btn.querySelector(".contender-avatar").textContent=h.mark;
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
    const from=heroIds.get(new URLSearchParams(location.search).get("hero"));
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
    const ava=document.createElement("span");ava.className="hero-choice-avatar";ava.textContent=h.mark;
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
function openPicker(){$("hero-search").value="";picker();showDialog($("hero-dialog"));setTimeout(()=>$("hero-search").focus(),50);}
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
  if(spinning||closedHero())return;
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
  cancelSpin();draw=null;slotRows("—","✳  点击开始抽签","—");
  $("lottery-result-label").textContent="SS14 · 全部可选英雄特性等概率随机";
  $("lottery-result-name").textContent="命运尚未揭晓";
  $("lottery-result-sub").textContent="不影响当前投票 · 完全免费";$("lottery-announce").textContent="";
  $("spin-label").textContent="开始抽签";$("lottery-accept").disabled=true;$("lottery-share").disabled=true;
  $("lottery-spin").disabled=closedHero();showDialog($("lottery-dialog"));
}
function simulate(){
  if(closedHero()){notice("本期战况已封榜");return;}
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
  read();chart();topics.forEach(renderTopic);countdown();
  setInterval(countdown,1000);
  setInterval(()=>{
    if(closedHero()&&$("chart").querySelector("button:not(:disabled)")){chart();if($("hero-dialog").open)picker();}
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
  window.addEventListener("resize",()=>{const m=window.innerWidth<=700;if(m!==lastMobile){lastMobile=m;chart();}},{passive:true});
}
init();
})();
