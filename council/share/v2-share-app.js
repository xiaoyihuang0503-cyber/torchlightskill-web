import { drawCouncilPoster, SITE_QR_URL } from "./qr-poster.js";
import { BOMB_ISSUES } from "../bomb-issues.js?v=20261013-issues20";
/* Torchlight Council v2 share landing: deep links to real polls and chairs. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const LIVE=window.TorchCouncilLive;
const BASE="https://torchlightskill.com/council/";
const params=new URLSearchParams(location.search);
const kinds=new Set(["hero","ranking","lottery","topic","seat","maze","roundtable"]);
const kind=kinds.has(params.get("kind"))?params.get("kind"):"ranking";
const heroId=/^[a-z0-9_]{2,40}$/.test(params.get("hero")||"")?params.get("hero"):"";
const topicId=/^[a-z0-9_]{2,40}$/.test(params.get("topic")||"")?params.get("topic"):"";
const choiceId=/^[a-z0-9_]{2,40}$/.test(params.get("choice")||"")?params.get("choice"):"";
const seatId=(params.get("seat")||"").slice(0,100);
const heroClosed=()=>Date.now()>=Date.parse("2026-10-16T10:00:00+08:00");
const focus=[
 {id:"mode_reduction",title:"新玩法不断加，老玩法什么时候做减法？",prompt:"你最支持哪种调整？",
  choices:[["rework","重做收益低、体验差的老玩法"],["merge","合并流程相似、奖励重复的玩法"],["rotation","部分玩法按赛季轮换，减少同时存在的数量"],["simplify","保留全部玩法，优先简化操作和规则"]],
  followup:"未来两个赛季，具体哪些老玩法准备重做、合并或暂时退出？能否公布名单和时间表？"},
 {id:"ember_drop_data",title:"初火掉率怎么调，能不能把数字说清楚？",prompt:"你最希望官方公开什么？",
  choices:[["drop_numbers","初火掉率、单次掉落数量分别改了多少"],["build_gap","普通配置和高投入配置的收益差距"],["net_return","扣除门票、计入耗时后的实际收益对比"],["reasoning","调整依据，以及后续是否继续调整"]],
  followup:"迷城这次下调，到底改了哪些数值？86、89是否分别测算？能否给出同配置、同耗时的前后对照？"},
 {id:"reward_access",title:"我只想刷喜欢的玩法，为什么还要为构筑补其他玩法的课？",prompt:"限定装备和养成材料，你更接受哪种安排？",
  choices:[["exclusive","保留玩法专属奖励，维持各玩法特色"],["alternative","增加效率较低的替代获取途径"],["exchange","提供兑换，让玩家可以选择刷什么"],["general_access","普通养成通用，只有顶级奖励限定玩法"]],
  followup:"玩家只专注一两种玩法，能否完成主要养成？哪些奖励必须绑定特定玩法，理由是什么？"},
 {id:"legacy_friction",title:"新玩法可以复杂，老玩法能不能少一点重复劳动？",prompt:"你最想先减少哪种负担？",
  choices:[["unlock","解锁、铺路和前置准备"],["item_handling","反复拾取、整理、兑换材料"],["ui_steps","进出界面、领奖和重复确认"],["rule_lookup","查规则、查掉落、查生效条件"]],
  followup:"老玩法有哪些操作可以自动完成、批量处理或直接取消？这次能承诺先改哪几项？"}
];
const state={topic:null,hero:null,seat:null,title:"",description:"",ready:false};
function display(kindLabel,overline,title,description){
 $("invite-kind").textContent=kindLabel;
 $("invite-overline").textContent=overline;
 $("invite-title").textContent=title;
 $("invite-description").textContent=description;
 document.title=title+" · 火炬议会";
 state.title=title;state.description=description;
}
function note(msg){$("join-feedback").textContent=msg;}
function setLink(href,label){$("secondary-action").href=href;$("secondary-action").textContent=label;}
function route(href){location.href=href;}
function setPicture(hero){
 const host=$("invite-portrait-ring");host.replaceChildren();
 const img=document.createElement("img");img.alt=hero.name+" · "+hero.trait_name+" 头像";
 img.referrerPolicy="no-referrer";
 img.addEventListener("error",()=>{host.textContent=hero.trait_name[0]||"✳";});
 img.src=hero.site_url;host.appendChild(img);
 $("invite-portrait-caption").textContent=hero.name+" · "+hero.trait_name;
 $("invite-portrait").hidden=false;
}
function allowedHero(hero){
 if(!hero||hero.type!=="hero"||hero.id!==hero.trait||hero.id!==heroId||!hero.trait_name)return false;
 try{const u=new URL(hero.site_url);return u.protocol==="https:"&&u.hostname==="torchlightskill.com"&&u.pathname==="/"+hero.repository_path;}catch(error){return false;}
}
async function findHero(){
 const res=await fetch("/assets/torchlight-mentor-avatars/manifest.json",{cache:"no-cache"});
 if(!res.ok)throw Error("英雄资料读取失败");
 const json=await res.json();
 const item=json.assets?.find(x=>x.type==="hero"&&x.id===heroId);
 if(!allowedHero(item))throw Error("该英雄特性暂时无法识别");
 return item;
}
async function submitVote(topic,choice){
 if(!LIVE?.isReady?.()){note("实时投票服务尚未连接，请稍后再试。");return false;}
 try{
  await LIVE.vote(topic,choice);
  note("✅ 投票成功！这一票已经计入全站真实统计。");
  return true;
 }catch(error){note(String(error?.message||error));return false;}
}
function ownChoice(topic){return LIVE?.ownVotes?.[topic]||null;}
function setupRanking(){
 display("SS14 / 英雄实时榜","朋友邀请你参与","SS14 开荒，你玩哪个英雄？","28 个英雄特性都可以投，榜单会按真实票数实时排序。");
 $("primary-action").textContent="👑 去看英雄榜";
 $("primary-action").disabled=false;
 $("primary-action").onclick=()=>route("../#hero-board");
 setLink("../#all-heroes","打开全部英雄 ↗");
}
async function setupHero(){
 let hero;
 try{hero=await findHero();}catch(error){
  display("SS14 / 开荒英雄","分享链接","这位英雄暂时无法显示","为了避免头像和特性错配，请到完整英雄榜选择。");
  $("primary-action").disabled=false;$("primary-action").textContent="查看全部英雄";
  $("primary-action").onclick=()=>route("../#hero-board");
  setLink("../?open=lottery#top","随机抽一个 ↗");note(String(error?.message||error));return;
 }
 state.hero=hero;setPicture(hero);
 display("SS14 / 开荒英雄","朋友准备玩的英雄","我准备玩 "+hero.name+" · "+hero.trait_name+"。你呢？","朋友邀请你来支持这个英雄，你也可以选别的。");
 $("choice-tag").hidden=false;$("choice-tag").textContent="朋友选择："+hero.name+" · "+hero.trait_name;
 const primary=$("primary-action");primary.textContent="✅ 我也投这个英雄";primary.disabled=heroClosed()||!state.ready;
 primary.onclick=async()=>{
  primary.disabled=true;const ok=await submitVote("hero",hero.id);
  primary.disabled=!state.ready||heroClosed()||ok;
  if(ok)primary.textContent="✅ 已投给这个英雄";
 };
 setLink("../?hero="+encodeURIComponent(hero.id)+"#all-heroes","我想看看其他英雄 ↗");
}
async function setupLottery(){
 if(heroId){
  try{
   const hero=await findHero();state.hero=hero;setPicture(hero);
   display("SS14 / 随机开荒","朋友刚抽到的英雄","我随机抽到了 "+hero.name+" · "+hero.trait_name+"！","你也可以自己抽一次，28 个特性机会相同。");
   $("choice-tag").hidden=false;$("choice-tag").textContent="抽签结果："+hero.name+" · "+hero.trait_name;
   setLink("../?hero="+encodeURIComponent(hero.id)+"#all-heroes","查看这个英雄 ↗");
  }catch(error){display("SS14 / 随机开荒","随机英雄","你会抽中谁？","不想纠结开荒人选？来试试老虎机。");setLink("../#all-heroes","还是自己选 ↗");}
 }else{
  display("SS14 / 随机开荒","🎰 开荒抽签","你会抽中哪个英雄？","28 个特性随机抽，不喜欢随时可以再抽。");
  setLink("../#all-heroes","我还是自己选 ↗");
 }
 $("primary-action").textContent="🎰 我也抽一次";
 $("primary-action").disabled=heroClosed();
 $("primary-action").onclick=()=>route("../?open=lottery#top");
}
function updateTopicVotes(){
 const t=state.topic;if(!t)return;
 const totals=t.choices.map(o=>LIVE?.getCount?.(t.id,o[0])||0),sum=totals.reduce((a,b)=>a+b,0);
 const options=$("share-poll-options").querySelectorAll(".share-answer");
 options.forEach((btn,i)=>{
  const chosen=ownChoice(t.id)===t.choices[i][0];
  btn.classList.toggle("marked",chosen);
  btn.setAttribute("aria-pressed",String(chosen));
  const label=btn.querySelector("strong");
  const votes=btn.querySelector("small");
  if(label)label.textContent=t.choices[i][1];
  if(votes)votes.textContent=(sum?Math.round(totals[i]/sum*100):0)+"% · "+totals[i]+" 票";
  btn.disabled=!state.ready;
 });
}
function setupTopic(){
 const t=focus.find(t=>t.id===topicId);
 if(!t){setupRanking();note("这道题已经更新，请在新版焦点投票中选择。");return;}
 state.topic=t;
 display("SS14 / 本周焦点投票","朋友邀你投一票",t.title,t.prompt);
 const marked=t.choices.find(c=>c[0]===choiceId);
 if(marked){
  $("choice-tag").hidden=false;
  $("choice-tag").textContent="朋友选了："+marked[1]+"。你呢？";
 }
 const host=$("share-poll-options");host.hidden=false;host.classList.add("quad");
 const fragment=document.createDocumentFragment();
 for(const [id,label] of t.choices){
  const button=document.createElement("button");button.type="button";button.className="share-answer";button.dataset.choice=id;
  const title=document.createElement("strong");title.textContent=label;
  const info=document.createElement("small");info.textContent="0% · 0 票";
  button.append(title,info);
  button.disabled=!state.ready;
  button.addEventListener("click",async()=>{
   button.disabled=true;
   await submitVote(t.id,id);
   updateTopicVotes();
  });
  fragment.appendChild(button);
 }
 host.replaceChildren(fragment);
 updateTopicVotes();
 const primary=$("primary-action");
 primary.textContent="🗳️ 看四个议题的结果";primary.disabled=false;
 primary.onclick=()=>route("../?topic="+encodeURIComponent(t.id)+"#topics");
 setLink("../?seat="+encodeURIComponent("topic:"+t.id)+"#roundtable","🪑 这道题的圆桌追问 ↗");
}
async function setupSeat(){
 const seat=seatId;
 if(!/^(topic:[a-z0-9_]+|question:[0-9a-f-]{36})$/.test(seat)){
  display("炸策划大会","问题席位","来圆桌占个座","每把椅子代表一道追问，支持你最想让策划回答的问题。");
  $("primary-action").textContent="💣 打开炸策划大会";$("primary-action").disabled=false;
  $("primary-action").onclick=()=>route("../#roundtable");
  setLink("../?open=ask#roundtable","➕ 我也要提问 ↗");return;
 }
 let title="",body="";
 const official=seat.startsWith("topic:")?focus.find(t=>"topic:"+t.id===seat):null;
 const seed=BOMB_ISSUES.find(t=>seat==="topic:"+t.id);
 if(seed){title=seed.title;body="预置问题 · 每次点击都增加这道问题的热度";}
 else if(official){title=official.title;body=official.followup;}
 else if(seat.startsWith("question:")){
  const question=await LIVE?.getApprovedQuestion?.(seat.slice(9));
  if(question){title=question.text;body="这是一位玩家提交并通过审核的问题。";}
  else{
   display("炸策划大会","这个问题暂时未公开","这条问题还不能公开","玩家问题审核通过后才会出现在圆桌上。");
   $("primary-action").textContent="💣 去看圆桌";$("primary-action").disabled=false;$("primary-action").onclick=()=>route("../#roundtable");
   setLink("../?open=ask#roundtable","我来提一个问题 ↗");return;
  }
 }
 state.seat=seat;
 display("炸策划大会 / 当前问题","💣 每点一次就能再炸一下！",title,body);
 $("choice-tag").hidden=false;
 const refresh=()=>{$("choice-tag").textContent="💣 当前累计 "+(LIVE?.getSeatCount?.(seat)||0)+" 次点击";};
 refresh();
 const button=$("primary-action");
 button.textContent="💣 再炸策划一下 +1";
 button.disabled=!state.ready;
 button.onclick=async()=>{
  if(button.disabled)return;
  button.disabled=true;
  try{
   const result=await LIVE.supportSeat(seat);
   refresh();
   if(Number(result?.accepted)>0){
     note("💥 又炸了一下！当前问题热度 +1，可以继续点击。");
   }else{
     note("点击太快了，稍等一下再继续炸！");
   }
  }catch(error){note(String(error?.message||error));}
  finally{button.disabled=!state.ready;}
 };
 setLink("../?seat="+encodeURIComponent(seat)+"#topics","去炸策划大会给它加火力 ↗");
}
function setupLegacy(){
 display("旧版投票","议题已经更新",kind==="maze"?"迷城燃料问题已进入新版焦点投票":"策划圆桌现在可以点椅子提问",
 "你原来的链接仍能进入网站，但旧投票不会自动转成新四道题的选票。");
 $("primary-action").disabled=false;
 $("primary-action").textContent="🗳️ 去看新版焦点投票";
 $("primary-action").onclick=()=>route("../?topic=ember_drop_data#topics");
 setLink("../#roundtable","🪑 去策划圆桌 ↗");
}
async function launch(){
 if(!LIVE?.available){
  note("实时服务暂时无法加载。你仍然可以打开网站查看内容。");
 }else{
  LIVE.hooks.onCounts=()=>updateTopicVotes();
  LIVE.hooks.onOwnVotes=()=>{updateTopicVotes();};
  LIVE.hooks.onSeatStats=()=>{if(state.seat)$("choice-tag").textContent="🔥 当前 "+(LIVE.getSeatCount(state.seat)||0)+" 人支持";};
  try{await LIVE.start();state.ready=LIVE.isReady();}catch(error){note("投票服务连接失败，请稍后再试。");}
 }
 if(kind==="hero")await setupHero();
 else if(kind==="lottery")await setupLottery();
 else if(kind==="topic")setupTopic();
 else if(kind==="seat")await setupSeat();
 else if(kind==="maze"||kind==="roundtable")setupLegacy();
 else setupRanking();
 if(state.topic)updateTopicVotes();
}
async function copyLink(){
 try{await navigator.clipboard.writeText(location.href);$("export-feedback").textContent="✅ 专属链接已复制，直接发给朋友就能投票。";}
 catch(error){$("export-feedback").textContent="复制失败，请手动复制浏览器地址栏里的链接。";}
}
async function systemShare(){
 if(navigator.share){try{await navigator.share({title:"火炬议会",text:state.title,url:location.href});return;}catch(error){if(error?.name==="AbortError")return;}}
 await copyLink();
}
let previousPosterUrl=null;
function posterText(){
 const heading=String(state.title||"这道题，你站哪边？");
 if(kind==="hero")return {
   category:"🔥 开荒英雄 · SS14",
   title:heading,
   detail:"扫描二维码，进入火炬议会选择你的英雄"
 };
 if(kind==="lottery")return {
   category:"🎰 随机开荒 · 28 个特性",
   title:heading,
   detail:"扫描二维码，自己来抽一个开荒英雄"
 };
 if(kind==="topic"){
   const picked=state.topic?.choices?.find(c=>c[0]===choiceId);
   return {
     category:"🗳️ 本周焦点投票",
     title:state.topic?.title||heading,
     detail:picked?"我选择："+picked[1]:"扫码参与投票，你更支持哪一项？"
   };
 }
 if(kind==="seat")return {
   category:"🪑 策划圆桌 · 问题席位",
   title:heading,
   detail:"扫码查看圆桌问题，支持你最想让策划回答的"
 };
 if(kind==="ranking")return {
   category:"👑 SS14 开荒实时榜",
   title:heading,
   detail:"扫码看完整的英雄榜，为你的英雄投一票"
 };
 return {
   category:"🗳️ 火炬议会 · 玩家话题",
   title:heading,
   detail:"扫描二维码，进入火炬议会一起讨论"
 };
}
async function poster(){
 const button=$("save-poster"),feedback=$("export-feedback");
 if(button.disabled)return;
 button.disabled=true;
 feedback.textContent="正在绘制二维码海报…";
 try{
   // The QR matrix is embedded locally: rendering requires no network, fonts or images.
   const canvas=$("poster-canvas");
   const copy=posterText();
   drawCouncilPoster(canvas,copy);
   let url;
   if(typeof canvas.toBlob==="function"){
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
     if(blob)url=URL.createObjectURL(blob);
   }
   if(!url)url=canvas.toDataURL("image/png");
   if(previousPosterUrl?.startsWith("blob:"))URL.revokeObjectURL(previousPosterUrl);
   previousPosterUrl=url;
   const preview=$("poster-preview-image"),download=$("poster-preview-download");
   preview.src=url;
   preview.alt=copy.category+" · "+copy.title+" · 二维码跳转 "+SITE_QR_URL;
   download.href=url;
   const filenameMap={hero:"英雄",lottery:"随机英雄",topic:"焦点投票",seat:"策划圆桌",ranking:"英雄排行榜"};
   download.download="火炬议会-"+(filenameMap[kind]||"玩家话题")+"-二维码海报.png";
   $("poster-preview-panel").hidden=false;
   feedback.textContent="✅ 二维码海报已生成！手机可长按下方图片保存，也可以点下载 PNG。";
   // An explicit download link remains as fallback for iOS browsers that ignore download().
 }catch(error){
   console.warn("QR poster creation failed",error);
   feedback.textContent="海报生成失败，请刷新后重试，或先复制链接。";
 }finally{button.disabled=false;}
}
function init(){
 $("copy-link").addEventListener("click",copyLink);
 $("share-system").addEventListener("click",systemShare);
 $("save-poster").addEventListener("click",poster);
 launch();
}
init();
})();
