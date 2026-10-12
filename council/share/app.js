(function(){
"use strict";
const $=id=>document.getElementById(id);
const BASE="https://torchlightskill.com/council/share/";
const MANIFEST="/assets/torchlight-mentor-avatars/manifest.json";
const LIVE=window.TorchCouncilLive;
const HERO_END=Date.parse("2026-10-16T10:00:00+08:00");
const ROUNDTABLE_END=Date.parse("2026-10-14T20:00:00+08:00");
const ALLOWED=new Set(["hero","lottery","ranking","maze","roundtable","topic"]);
const TOPICS={
 mode_reduction:{id:"mode_reduction",index:1,short:"老玩法做减法",title:"新玩法不断加，老玩法什么时候做减法？",question:"你最支持哪种调整？",choices:[["rework","重做收益低、体验差的老玩法"],["merge","合并流程相似、奖励重复的玩法"],["rotation","部分玩法按赛季轮换，减少同时存在的数量"],["simplify","保留全部玩法，优先简化操作和规则"]]},
 ember_drop_data:{id:"ember_drop_data",index:2,short:"初火掉率",title:"初火掉率怎么调，能不能把数字说清楚？",question:"你最希望官方公开什么？",choices:[["drop_numbers","初火掉率、单次掉落数量分别改了多少"],["build_gap","普通配置和高投入配置的收益差距"],["net_return","扣除门票、计入耗时后的实际收益对比"],["reasoning","调整依据，以及后续是否继续调整"]]},
 reward_access:{id:"reward_access",index:3,short:"自由刷图",title:"我只想刷喜欢的玩法，为什么还要为构筑补其他玩法的课？",question:"限定装备和养成材料，你更接受哪种安排？",choices:[["exclusive","保留玩法专属奖励，维持各玩法特色"],["alternative","增加效率较低的替代获取途径"],["exchange","提供兑换，让玩家可以选择刷什么"],["general_access","普通养成通用，只有顶级奖励限定玩法"]]},
 legacy_friction:{id:"legacy_friction",index:4,short:"重复劳动",title:"新玩法可以复杂，老玩法能不能少一点重复劳动？",question:"你最想先减少哪种负担？",choices:[["unlock","解锁、铺路和前置准备"],["item_handling","反复拾取、整理、兑换材料"],["ui_steps","进出界面、领奖和重复确认"],["rule_lookup","查规则、查掉落、查生效条件"]]}
};
const params=new URLSearchParams(location.search);
const kind=ALLOWED.has(params.get("kind"))?params.get("kind"):"ranking";
const heroId=/^[a-z0-9_]{1,32}$/.test(params.get("hero")||"")?params.get("hero"):"";
const sharedChoice=/^[a-z0-9_]{1,32}$/.test(params.get("choice")||"")?params.get("choice"):"";
const sharedTopicId=/^[a-z0-9_]{2,40}$/.test(params.get("topic")||"")?params.get("topic"):"";
const sharedQuestion=(params.get("question")||"").trim().replace(/\s+/g," ").slice(0,160);
const state={kind,hero:null,title:"",intro:"",choice:null,manifest:null};
function labelHero(hero){return hero.name+" · "+hero.trait_name;}
function feedback(text){$("export-feedback").textContent=text;}
function joinFeedback(text){$("join-feedback").textContent=text;}
function navigation(target){location.href=target;}
function pollEnd(){return kind==="roundtable" && Date.now()>=ROUNDTABLE_END;}
function heroEnd(){return Date.now()>=HERO_END;}
function snapshot(){
 return LIVE?.ownVotes||{};
}
async function persist(topic,choice){
 if(!LIVE?.available||!LIVE.isReady()){
   joinFeedback("实时投票暂时不可用，请稍后重试。");return false;
 }
 try {
   await LIVE.vote(topic,choice);
   return true;
 }catch(error){
   joinFeedback(String(error?.message||error));return false;
 }
}
function setLink(id,href,label){
 const el=$(id);el.href=href;
 if(label)el.textContent=label;
}
function showPicture(hero){
 const wrap=$("invite-portrait");
 const ring=$("invite-portrait-ring");
 ring.replaceChildren();
 const image=document.createElement("img");
 image.alt=labelHero(hero)+"头像";
 image.referrerPolicy="no-referrer";
 image.addEventListener("error",()=>{
  ring.replaceChildren(document.createTextNode(hero.trait_name.slice(0,1)));
 });
 image.src=hero.site_url;
 ring.appendChild(image);
 $("invite-portrait-caption").textContent=labelHero(hero);
 wrap.hidden=false;
}
function setHeading(overline,title,description){
 $("invite-overline").textContent=overline;
 $("invite-title").textContent=title;
 $("invite-description").textContent=description;
 state.title=title;
 state.intro=description;
 document.title=title+" · 火炬议会";
}
function setupHero(hero){
 state.hero=hero;
 showPicture(hero);
 $("invite-kind").textContent="SS14 / 开荒英雄";
 setHeading("朋友准备玩的英雄","我准备玩 "+labelHero(hero)+"。你呢？","你可以选同一个英雄，也可以去排行榜看看其他选择。");
 $("choice-tag").hidden=false;
 $("choice-tag").textContent="对方选择："+labelHero(hero);
 const primary=$("primary-action");
 primary.textContent="我也选这个英雄 ↗";primary.disabled=heroEnd();
 const current=snapshot().hero;
 if(current===hero.id)joinFeedback("你已经投给这个英雄。");
 else if(heroEnd())joinFeedback("这期赛前开荒投票已经结束，可以查看结果。");
 primary.onclick=async()=>{
  if(heroEnd()){joinFeedback("本期已结束，无法继续投票。");return;}
  primary.disabled=true;
  const success=await persist("hero",hero.id);
  if(success){
   joinFeedback("投票成功，已计入全站真实票数。去排行榜看看吧。");
   primary.textContent="已投给这个英雄 ✓";
  }else{primary.disabled=false;}
 };
 setLink("secondary-action","../?hero="+encodeURIComponent(hero.id)+"#all-heroes","看看其他英雄 ↗");
}
function setupLottery(hero){
 state.hero=hero||null;
 $("invite-kind").textContent="SS14 / 随机开荒";
 if(hero){
  showPicture(hero);
  setHeading("我刚抽到的英雄","我随机抽到了 "+labelHero(hero)+"。","不想纠结选谁？你也抽一个试试，看会抽中什么英雄。");
  $("choice-tag").hidden=false;
  $("choice-tag").textContent="抽签结果："+labelHero(hero);
  setLink("secondary-action","../?hero="+encodeURIComponent(hero.id)+"#all-heroes","看看这个英雄 ↗");
 }else{
  setHeading("随机抽英雄","不知道玩谁？让老虎机决定。","28 个英雄特性机会相同，抽到了还可以重抽。");
  setLink("secondary-action","../#all-heroes","我还是自己选 ↗");
 }
 const primary=$("primary-action");
 primary.textContent="我也抽一次 ↗";primary.disabled=heroEnd();
 if(heroEnd())joinFeedback("这期赛前抽签已经结束。");
 primary.onclick=()=>navigation("../?open=lottery#top");
}
function setupRanking(){
 $("invite-kind").textContent="SS14 / 开荒投票";
 setHeading("开荒英雄投票","SS14 开荒你准备玩谁？","28 个英雄特性都能选。看看朋友准备玩什么，你也选一个。");
 const primary=$("primary-action");
 primary.textContent="选我的开荒英雄 ↗";primary.disabled=false;
 primary.onclick=()=>navigation("../#all-heroes");
 setLink("secondary-action","../?open=lottery#top","随机抽一个 ↗");
}
function setupPoll(type){
 const poll=POLLS[type];
 $("invite-kind").textContent=type==="maze"?"SS14 / 迷城调整":"SS14 / 策划圆桌";
 const chosen=poll.choices.find(c=>c[0]===sharedChoice)||null;
 state.choice=chosen?chosen[0]:null;
 let heading="";
 if(type==="maze"){
  heading=chosen?chosen[0]==="support"?"我觉得迷城这次调整还能接受，你呢？":"我觉得迷城这次改得太狠，你呢？":"迷城燃料被砍，你能接受吗？";
 }else{
  heading=chosen?"我最想问策划："+chosen[1]+"。你呢？":"你最想让策划回答哪件事？";
 }
 if(type==="roundtable"&&sharedQuestion.length>=8)heading="我想问策划："+sharedQuestion;
 setHeading(type==="roundtable"&&sharedQuestion.length>=8?"朋友提出的问题":"看看你会选什么",heading,
 type==="maze"?"有人能接受，有人觉得砍得太狠。你选哪边？":sharedQuestion.length>=8?"这条问题来自朋友分享的链接，还没有经过审核。你也可以提交自己的问题。":"掉落、平衡、契灵、赛季玩法，选你最在意的一件事。");
 const answerHost=$("share-poll-options");
 answerHost.hidden=false;
 answerHost.classList.toggle("quad",poll.choices.length===4);
 const fragment=document.createDocumentFragment();
 poll.choices.forEach(choice=>{
  const btn=document.createElement("button");btn.type="button";btn.className="share-answer";
  btn.textContent=choice[1];
  btn.dataset.choice=choice[0];
  const own=snapshot()[type];
  btn.classList.toggle("marked",own===choice[0]);
  btn.setAttribute("aria-pressed",String(own===choice[0]));
  btn.disabled=pollEnd();
  btn.addEventListener("click",async()=>{
   if(pollEnd()){joinFeedback("这道题已经结束投票。");return;}
   const success=await persist(type,choice[0]);
   if(success){
    for(const sibling of answerHost.children){
     const yes=sibling.dataset.choice===choice[0];
     sibling.classList.toggle("marked",yes);
     sibling.setAttribute("aria-pressed",String(yes));
    }
    joinFeedback("你选了「"+choice[1]+"」，已计入全站真实票数。");
    $("primary-action").textContent="去看这道题 ↗";
   }
  });
  fragment.appendChild(btn);
 });
 answerHost.replaceChildren(fragment);
 if(type==="roundtable"&&sharedQuestion.length>=8){
  $("choice-tag").hidden=false;
  $("choice-tag").textContent="分享者提出的问题 · 尚未审核";
 }else if(chosen){
  $("choice-tag").hidden=false;
  $("choice-tag").textContent="对方投给："+chosen[1];
 }
 if(pollEnd())joinFeedback("本期圆桌投票已结束，还可以查看这道题。");
 const primary=$("primary-action");primary.textContent=type==="roundtable"?"我也要提问题 ↗":"去看这道题 ↗";primary.disabled=false;
 primary.onclick=()=>{
  const chosenNow=snapshot()[type];
  const query="?poll="+encodeURIComponent(type)+(chosenNow?"&choice="+encodeURIComponent(chosenNow):"");
  navigation("../"+query+(type==="roundtable"?"#roundtable":"#topics"));
 };
 setLink("secondary-action",type==="roundtable"?"../#roundtable":"../#topics",type==="roundtable"?"看看大家关心什么 ↗":"看其他投票 ↗");
}
function validateAsset(asset){
 if(!asset||asset.type!=="hero"||asset.id!==asset.trait||asset.id!==heroId||!asset.trait_name||!asset.name)return false;
 if(typeof asset.site_url!=="string"||typeof asset.repository_path!=="string")return false;
 try{
  const url=new URL(asset.site_url);
  return url.protocol==="https:"&&url.hostname==="torchlightskill.com"&&url.pathname==="/"+asset.repository_path;
 }catch(error){return false;}
}
async function show(){
 if(kind==="maze"||kind==="roundtable"){setupPoll(kind);return;}
 if(kind==="ranking"||!heroId){kind==="lottery"?setupLottery(null):setupRanking();return;}
 try{
  const res=await fetch(MANIFEST,{cache:"no-cache"});
  if(!res.ok)throw Error("头像清单加载失败");
  const manifest=await res.json();
  const hero=Array.isArray(manifest.assets)?manifest.assets.find(asset=>asset.id===heroId&&asset.type==="hero"):null;
  if(!validateAsset(hero))throw Error("没有找到这个英雄特性");
  state.manifest=manifest;
  if(kind==="hero")setupHero(hero);
  else setupLottery(hero);
 }catch(error){
  $("invite-kind").textContent="SS14 / 开荒英雄";
  setHeading("邀请链接","这张邀请里的英雄暂时无法显示。","你仍可以打开完整英雄列表，选择想玩的特性。");
  $("primary-action").textContent="查看全部英雄 ↗";
  $("primary-action").disabled=false;
  $("primary-action").onclick=()=>navigation("../#all-heroes");
  setLink("secondary-action","../?open=lottery#top","随机抽一个 ↗");
  joinFeedback("暂时无法读取对应头像与特性，没有显示其他英雄的头像代替。");
 }
}
function shareText(){
 if(kind==="hero")return "我准备这样开荒，你怎么看？";
 if(kind==="lottery")return "我刚随机抽了开荒英雄，你也来试试。";
 if(kind==="maze")return "迷城燃料这次调整，你站哪边？";
 if(kind==="roundtable")return "圆桌会谈，你最想问策划什么？";
 return "SS14 开荒，你准备玩哪个英雄？";
}
async function copyLink(){
 try{
  if(!navigator.clipboard?.writeText)throw Error("clipboard unavailable");
  await navigator.clipboard.writeText(location.href);
  feedback("专属链接已复制。直接发给朋友就能打开这份投票。");
 }catch(error){
  const inp=document.createElement("input");
  inp.value=location.href;inp.style.cssText="position:absolute;left:-9999px";
  document.body.appendChild(inp);inp.select();
  feedback("当前浏览器无法自动复制，请手动复制地址栏中的专属链接。");
  inp.remove();
 }
}
async function systemShare(){
 if(navigator.share){
  try{await navigator.share({title:"火炬议会",text:shareText(),url:location.href});feedback("已打开系统分享");return;}
  catch(error){if(error?.name==="AbortError"){feedback("分享已取消");return;}}
 }
 await copyLink();
}
function wrapDraw(ctx,str,x,y,maxWidth,lineHeight,maxLines){
 const arr=Array.from(str),lines=[];let current="";
 for(const char of arr){
  if(ctx.measureText(current+char).width>maxWidth && current){lines.push(current);current=char;}
  else current+=char;
 }
 if(current)lines.push(current);
 lines.slice(0,maxLines).forEach((line,index)=>ctx.fillText(line,x,y+index*lineHeight,maxWidth));
 return Math.min(lines.length,maxLines);
}
async function posterImage(hero){
 if(!hero)return null;
 return await new Promise(resolve=>{
  const image=new Image();
  image.crossOrigin="anonymous";
  image.onload=()=>resolve(image);
  image.onerror=()=>resolve(null);
  image.src=hero.site_url;
 });
}
async function makePoster(){
 const btn=$("save-poster");btn.disabled=true;feedback("正在生成分享图片…");
 try{
  const canvas=$("poster-canvas");
  const c=canvas.getContext("2d");if(!c)throw Error("Canvas unavailable");
  if(document.fonts?.ready)await document.fonts.ready;
  const w=1080,h=1440,ink="#26201a",paper="#fff4dd",orange="#ff5c2b",sun="#ffd84d";
  c.clearRect(0,0,w,h);
  c.fillStyle=paper;c.fillRect(0,0,w,h);
  c.strokeStyle=ink;c.lineWidth=6;c.strokeRect(42,42,996,1356);
  c.fillStyle=sun;c.fillRect(45,45,990,176);
  c.beginPath();c.moveTo(45,221);c.lineTo(1035,221);c.stroke();
  c.fillStyle=ink;c.font="800 58px sans-serif";c.fillText("✳ 火炬议会",94,151);
  c.font="700 24px monospace";c.fillText("TORCHLIGHT COUNCIL / SS14",94,191);
  c.fillStyle="#9d3217";c.font="800 30px sans-serif";c.fillText("朋友给你发来一份投票",94,308);
  let heading=state.title||"SS14 开荒，你玩谁？";
  c.fillStyle=ink;c.font="800 68px sans-serif";
  const lines=wrapDraw(c,heading,94,411,890,90,4);
  const picTop=Math.max(655,434+(lines-1)*90);
  if(state.hero){
   const centerX=540,centerY=picTop+116,r=143;
   c.fillStyle=sun;c.beginPath();c.arc(centerX+9,centerY+9,r+9,0,Math.PI*2);c.fill();
   c.save();c.beginPath();c.arc(centerX,centerY,r,0,Math.PI*2);c.clip();
   c.fillStyle="#ffb9cc";c.fillRect(centerX-r,centerY-r,2*r,2*r);
   const img=await posterImage(state.hero);
   if(img){
    const ratio=Math.max(2*r/img.width,2*r/img.height);
    const dw=img.width*ratio,dh=img.height*ratio;
    c.drawImage(img,centerX-dw/2,centerY-dh/2,dw,dh);
   }else{
    c.fillStyle=ink;c.font="800 112px sans-serif";c.textAlign="center";
    c.fillText(state.hero.trait_name.slice(0,1),centerX,centerY+38);c.textAlign="start";
   }
   c.restore();c.strokeStyle=ink;c.lineWidth=8;c.beginPath();c.arc(centerX,centerY,r,0,Math.PI*2);c.stroke();
   c.fillStyle=ink;c.font="800 46px sans-serif";c.textAlign="center";
   c.fillText(labelHero(state.hero),540,Math.min(1110,centerY+212),930);c.textAlign="start";
  }else{
   c.fillStyle="#a5dcff";c.fillRect(95,picTop-20,890,276);
   c.strokeStyle=ink;c.lineWidth=5;c.strokeRect(95,picTop-20,890,276);
   c.fillStyle=ink;c.font="800 48px sans-serif";wrapDraw(c,state.intro||"点开链接投上你的一票",135,picTop+89,820,67,3);
  }
  c.fillStyle=sun;c.fillRect(45,1192,990,204);
  c.strokeStyle=ink;c.lineWidth=6;c.beginPath();c.moveTo(45,1192);c.lineTo(1035,1192);c.stroke();
  c.fillStyle=ink;c.font="800 44px sans-serif";c.fillText("你会怎么选？",94,1271);
  c.font="800 27px sans-serif";c.fillText("torchlightskill.com/council/share/",94,1323);
  c.font="600 19px sans-serif";c.fillStyle="#665647";c.fillText("保存图片后，请把专属分享链接一起发给朋友",94,1366);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
  if(!blob)throw Error("PNG export unavailable");
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download="火炬议会-"+kind+(state.hero?"-"+state.hero.id:"")+".png";
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),5000);
  feedback("分享图片已生成。建议把专属链接一起发出去，朋友点链接才能直接投票。");
 }catch(error){
  feedback("生成图片失败，请先使用「复制链接」分享。");
 }finally{btn.disabled=false;}
}
async function init(){
 $("copy-link").addEventListener("click",copyLink);
 $("share-system").addEventListener("click",systemShare);
 $("save-poster").addEventListener("click",makePoster);
 if(LIVE?.available){
   try{await LIVE.start();}
   catch(error){joinFeedback("投票服务暂时不可用，请稍后再试。");}
 }
 await show();
 if(!LIVE?.isReady()){
   document.querySelectorAll(".share-answer").forEach(node=>node.disabled=true);
   if(kind==="hero")$("primary-action").disabled=true;
   joinFeedback("当前无法连接投票服务，分享链接仍然可以使用。");
 }
}
init();
})();
