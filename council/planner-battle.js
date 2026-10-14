/* Player-written issue chase leaderboard and comic planner bombardment.
 * Real "supports" are authenticated Supabase RPC (one per identity/seat).
 * Infinite bombs are decorative clicks, NOT votes. Pending text stays private.
 */
export function createPlannerBattle({LIVE,FOCUS,ISSUES=[],reduced=false,toast=()=>{}}){
  const $=id=>document.getElementById(id);
  const fields=new Map();
  const history=new Map();
  const state={
    selected:"topic:bomb_01",questions:[],pending:[],batchKeys:[],
    ranked:[],localClicks:0,pendingClicks:0,pendingBySeat:new Map(),combo:0,lastClick:0,lastSave:0,
    timer:0,flushTimer:0,busy:false,totalKnown:false,lastGlobal:0,
    activeBombs:0,lastRemoteBomb:0,submitBusy:false,submitting:false,reactionTimer:0,expanded:false,ambientTimer:0,pendingSelect:null
  };
  const STORAGE="torchlight-council-petition-local-v1";
  const QUEUE_STORAGE="torchlight-council-pending-bomb-clicks-v2";
  const fmt=n=>new Intl.NumberFormat("zh-CN").format(Math.max(0,Number(n)||0));
  const confirmed=key=>Math.max(0,Number(LIVE?.getSeatCount?.(key))||0);
  const nSupport=key=>confirmed(key)+Math.max(0,state.pendingBySeat.get(key)||0);
  function candidates(){
    const rows=ISSUES.map((issue,i)=>({
      key:"topic:"+issue.id,title:issue.title,full:issue.title,
      kind:"official",emoji:issue.emoji||"💣",time:0,order:i
    }));
    const approved=state.questions.filter(q=>q.status==="approved");
    approved.forEach((q,i)=>rows.push({
      key:"question:"+q.id,title:q.text,full:q.text,kind:"player",
      emoji:"💬",time:Number(q.at)||0,order:ISSUES.length+i
    }));
    return rows.sort((a,b)=>nSupport(b.key)-nSupport(a.key)
      ||b.time-a.time||a.order-b.order);
  }
  function randomizeBatch(all){
    // The confirmed global leader always has a place; the remaining seven
    // questions are random and changing the batch never resets their counters.
    const top=globalTopIssue();
    const champion=top&&confirmed(top.key)>0?top.key:null;
    const pool=all.filter(row=>row.key!==champion);
    for(let i=pool.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [pool[i],pool[j]]=[pool[j],pool[i]];
    }
    state.batchKeys=[
      ...(champion?[champion]:[]),
      ...pool.slice(0,champion?7:8).map(row=>row.key)
    ];
  }
  function nextBatch(){
    const all=candidates();
    if(all.length<=8){state.batchKeys=all.map(row=>row.key);syncRows();return;}
    const previous=state.batchKeys.join(",");
    randomizeBatch(all);
    // Best-effort ensure the next group differs from the previous one.
    for(let attempt=0;state.batchKeys.join(",")===previous&&attempt<4;attempt++)randomizeBatch(all);
    state.expanded=false;
    syncRows();
  }
  function updateMobileDockLabel(){
    const node=$("mobile-bomb-title"),combo=$("mobile-bomb-combo");
    const selected=state.ranked.find(row=>row.key===state.selected);
    if(node){
      node.textContent=selected?"🎯 "+selected.title:"💣 选择问题开始炸";
      node.title=selected?.title||"";
    }
    if(combo)combo.textContent=state.combo?"💥 "+fmt(state.combo)+" 连击":"连击 0";
  }
  function editingText(){
    const active=document.activeElement;
    if(!active)return false;
    return /^(INPUT|TEXTAREA|SELECT)$/i.test(active.tagName||"")||
      Boolean(active.isContentEditable);
  }
  function syncMobileDock(){
    const dock=$("mobile-bomb-dock"),arena=$("topics"),body=document.body;
    if(!dock||!arena||!body)return;
    if(window.innerWidth>700||document.hidden){
      dock.hidden=true;
      body.classList.remove("bomb-dock-visible");
      $("mobile-bomb-fx")?.classList.remove("active");
      return;
    }
    body.classList.add("bomb-dock-ready");
    const height=window.visualViewport?.height||window.innerHeight||680;
    const rect=arena.getBoundingClientRect();
    const dialogOpen=$("lottery-dialog")?.open||$("share-dialog")?.open;
    const keyboardOpen=window.visualViewport?.height && window.innerHeight &&
      window.visualViewport.height<window.innerHeight*.7;
    const visible=rect.top<height*.83 && rect.bottom>Math.min(height*.45,130) &&
      !dialogOpen&&!editingText()&&!keyboardOpen;
    dock.hidden=!visible;
    body.classList.toggle("bomb-dock-visible",visible);
    $("mobile-bomb-fx")?.classList.toggle("active",visible);
    if(visible){
      const dockHeight=Math.ceil(dock.getBoundingClientRect().height||104);
      body.style.setProperty("--bomb-dock-height",dockHeight+"px");
      updateMobileDockLabel();
    }
  }
  function revealPlannerOnMobile(){
    if(window.innerWidth>700||!document.body?.classList.contains("bomb-dock-visible"))return false;
    const stage=$("planner-stage");
    if(!stage)return false;
    const rect=stage.getBoundingClientRect();
    const dockHeight=$("mobile-bomb-dock")?.getBoundingClientRect().height||105;
    const freeBottom=(window.visualViewport?.height||window.innerHeight||680)-dockHeight-12;
    if(rect.top>=0&&rect.bottom<=freeBottom)return false;
    stage.scrollIntoView?.({behavior:"auto",block:"start"});
    return true;
  }
  function effectLayer(){
    if(window.innerWidth<=700&&document.body?.classList.contains("bomb-dock-visible"))
      return $("mobile-bomb-fx")||$("planner-fx-layer");
    return $("planner-fx-layer");
  }
  /* Spotlight is the absolute, SERVER-CONFIRMED #1 across all public questions.
     It must not be derived from the eight randomized cards or local queued clicks. */
  function globalTopIssue(){
    return candidates().slice().sort((a,b)=>confirmed(b.key)-confirmed(a.key)
      ||a.order-b.order)[0]||null;
  }
  function refreshTopSpotlight(){
    const button=$("top-issue-spotlight");
    const title=$("top-issue-title");
    const hits=$("top-issue-count");
    const badge=$("top-issue-rank");
    if(!button||!title||!hits)return;
    const leader=globalTopIssue();
    if(!leader){
      title.textContent="暂时还没有公开问题";
      hits.textContent="0";
      if(badge)badge.textContent="暂无问题";
      button.disabled=true;
      button.removeAttribute?.("data-seat");
      return;
    }
    const previous=button.dataset.seat||"";
    const value=confirmed(leader.key);
    button.dataset.seat=leader.key;
    const ready=!!LIVE?.isReady?.();
    title.textContent=leader.title;
    hits.textContent=ready?fmt(value):"—";
    if(badge)badge.textContent=!ready?"读取中":value>0?"全站 TOP 1":"等待首炸";
    button.disabled=false;
    button.setAttribute("aria-label",(ready&&value>0?"当前全站被炸最多的问题：":"热门问题候选：")+
      leader.title+(ready?"，累计"+fmt(value)+"次点击。":"，真实点击数同步中。")+" 点击前往炸策划大会。");
    if(previous&&previous!==leader.key&&value>0&&!reduced){
      button.classList.remove("is-new-leader");
      void button.offsetWidth;
      button.classList.add("is-new-leader");
      window.setTimeout(()=>button.classList.remove("is-new-leader"),650);
    }
  }
  function openTopSpotlight(){
    const leader=globalTopIssue();
    if(!leader)return;
    state.selected=leader.key;
    // Temporarily include the champion in the eight-card batch, so it is
    // actually selectable even when the current batch was randomized.
    if(!state.expanded&&!state.batchKeys.includes(leader.key)){
      state.batchKeys=[leader.key,...state.batchKeys.filter(key=>key!==leader.key)].slice(0,8);
    }
    syncRows();
    const stage=$("planner-stage")||$("topics");
    stage?.scrollIntoView?.({behavior:reduced?"auto":"smooth",block:"start"});
    window.setTimeout(syncMobileDock,150);
  }
  function tierFor(key){
    const place=state.ranked.findIndex(row=>row.key===key);
    const votes=nSupport(key);
    // More clicks unlock stronger visual firepower. This is not a unique-person ballot.
    if(place===0&&votes>=30)return 3;
    if(votes>=10||(place===0&&votes>=5))return 2;
    return 1;
  }
  function isSupported(key){return Boolean(LIVE?.hasSupported?.(key));}
  function makeRow(row){
    const button=document.createElement("button");
    button.type="button";button.className="planner-issue";
    button.dataset.plannerSeat=row.key;
    const number=document.createElement("b");number.className="planner-rank";
    const copy=document.createElement("span");copy.className="planner-issue-copy";
    const title=document.createElement("strong");title.className="planner-row-title";
    const extra=document.createElement("small");extra.className="planner-row-source";
    copy.append(title,extra);
    const votes=document.createElement("span");votes.className="planner-row-score";
    const bar=document.createElement("span");bar.className="planner-row-meter";bar.setAttribute("aria-hidden","true");
    const fill=document.createElement("span");fill.className="planner-row-fill";bar.append(fill);
    button.append(number,copy,votes,bar);
    button.addEventListener("click",()=>select(row.key));
    fields.set(row.key,{button,number,title,extra,votes,fill});
    return fields.get(row.key);
  }
  function syncRows(){
    const host=$("planner-issue-grid");if(!host)return;
    const all=candidates(),before=new Map();
    if(!state.batchKeys.length)randomizeBatch(all);
    const champion=globalTopIssue();
    if(!state.expanded&&champion&&confirmed(champion.key)>0&&
       !state.batchKeys.includes(champion.key)){
      state.batchKeys=[champion.key,...state.batchKeys].slice(0,8);
    }
    const group=new Set(state.batchKeys);
    const order=(state.expanded?all:all.filter(row=>group.has(row.key))).slice(0,state.expanded?100:8);
    host.querySelectorAll("[data-planner-seat]").forEach(b=>{
      before.set(b.dataset.plannerSeat,b.getBoundingClientRect());
    });
    state.ranked=order;
    const max=Math.max(1,nSupport(order[0]?.key));
    const frag=document.createDocumentFragment();
    order.forEach((row,index)=>{
      let node=fields.get(row.key);
      if(!node)node=makeRow(row);
      const count=nSupport(row.key),previous=history.get(row.key);
      history.set(row.key,count);
      node.number.textContent=index===0&&count>0?"👑":"#"+String(index+1).padStart(2,"0");
      node.title.textContent=row.title;
      node.extra.textContent=row.kind==="player"?"玩家提问 · 已审核":"预置议题 · #"+String(row.order+1).padStart(2,"0");
      const pending=state.pendingBySeat.get(row.key)||0;
      node.votes.textContent="💣 "+fmt(count)+" 次点击"+(pending>0?" · 同步中":"");
      node.fill.style.width=(count>0?Math.max(6,Math.round(count/max*100)):0)+"%";
      node.button.style.setProperty("--issue-grow",Math.min(24,Math.floor(Math.log2(count+1)*5))+"px");
      node.button.classList.toggle("is-burning",count>=10);
      node.button.classList.toggle("is-heavy",count>=30);
      node.button.classList.toggle("selected",row.key===state.selected);
      node.button.classList.toggle("is-leader",index===0&&count>0);
      node.button.classList.toggle("is-chaser",index>0&&index<3&&count>0);
      node.button.classList.toggle("is-grown",count>0);
      node.button.setAttribute("aria-pressed",String(row.key===state.selected));
      node.button.setAttribute("aria-label","第"+(index+1)+"名："+row.title+"；策划被炸"+count+"次"+(pending>0?"，含"+pending+"次待同步":""));
      frag.appendChild(node.button);
      if(previous!==undefined&&count>previous&&!reduced&&node.button.animate){
        node.button.animate([{filter:"brightness(1.38)"},{filter:"brightness(1)"}],
          {duration:750,easing:"ease-out"});
      }
    });
    host.replaceChildren(frag);
    if(!reduced){
      host.querySelectorAll("[data-planner-seat]").forEach(node=>{
        const rect=before.get(node.dataset.plannerSeat);
        if(!rect||!node.animate)return;
        const dy=rect.top-node.getBoundingClientRect().top;
        if(Math.abs(dy)>3)node.animate([
          {transform:"translateY("+dy+"px)"},{transform:"translateY(0)"}
        ],{duration:440,easing:"cubic-bezier(.2,.8,.3,1)"});
      });
    }
    const countEl=$("planner-pool-count"),more=$("planner-more");
    if(countEl)countEl.textContent=state.expanded
      ?"全部 "+all.length+" 道题 · 按累计点击热度排序"
      :"本批 "+order.length+" / "+all.length+" 道题 · 按累计点击热度排序";
    if(more){more.hidden=all.length<=8;more.textContent=state.expanded?"↑ 收起，返回随机八题":"↓ 展开全部 "+all.length+" 道题";}
    const shuffle=$("planner-shuffle");if(shuffle)shuffle.disabled=all.length<=8;
    if(!order.some(row=>row.key===state.selected))state.selected=order[0]?.key||"topic:bomb_01";
    refreshSelected();
    updateMobileDockLabel();
    refreshTopSpotlight();
    const pending=$("planner-pending-count");
    if(pending){
      pending.hidden=!state.pending.length;
      pending.textContent="⏳ 我的待审核问题："+state.pending.length+" 条 · 审核通过后参与排名";
    }
  }
  function refreshSelected(){
    const row=state.ranked.find(x=>x.key===state.selected);
    if(!row)return;
    const votes=nSupport(row.key);
    const tier=tierFor(row.key);
    const total=document.getElementById("planner-current");
    if(total)total.textContent=row.emoji+" "+row.title+" · 💣 "+fmt(votes)+" 次点击"+((state.pendingBySeat.get(row.key)||0)>0?"（同步中）":"");
    const bomb=$("petition-orb");
    if(bomb){
      const mini=bomb.querySelector(".petition-orb-mini");
      if(mini)mini.textContent=(tier===3?"👑 30+ 票重炮":tier===2?"⚡ 高票双响炮":"💣 小炸弹")+" · 无限点";
    }
    const vote=$("planner-vote");
    if(vote){
      vote.disabled=false;
      vote.textContent=LIVE?.isReady?.()?"💣 再炸一次 +1":"💣 点击 +1（稍后同步）";
    }
  }
  function select(key){
    if(!state.ranked.some(row=>row.key===key))return;
    state.selected=key;
    for(const row of state.ranked){
      fields.get(row.key)?.button.classList.toggle("selected",row.key===key);
      fields.get(row.key)?.button.setAttribute("aria-pressed",String(row.key===key));
    }
    refreshSelected();
    updateMobileDockLabel();
  }
  function openForm(open=true){
    const form=$("planner-question-form");
    if(!form)return;
    form.hidden=!open;
    const button=$("planner-write");
    if(button)button.textContent=open?"收起提问 ↑":"✍️ 我来写问题";
    if(open)$("planner-question-input")?.focus({preventScroll:true});
  }
  async function submit(event){
    event.preventDefault();
    if(state.submitBusy)return;
    const input=$("planner-question-input");
    const body=String(input?.value||"").trim().replace(/\s+/g," ");
    const status=$("planner-question-status"),button=$("planner-question-submit");
    if([...body].length<8||[...body].length>160){
      status.textContent="请写 8～160 个字，把你想问的事情说具体。";return;
    }
    if(!LIVE?.isReady?.()){
      status.textContent="提问服务正在连接，请稍后再试。";return;
    }
    state.submitBusy=true;button.disabled=true;status.textContent="正在提交问题…";
    try{
      const result=await LIVE.submitQuestion(body);
      if(result?.status!=="pending")throw Error("提交结果未知，请稍后查询。");
      input.value="";$("planner-question-length").textContent="0 / 160 字";
      status.textContent="✅ 已提交！审核通过后，你的问题会加入真实支持排行榜。";
      toast("💬 问题已提交，待审核上榜！");
      // LIVE.submitQuestion already refreshes the user's own pending list.
    }catch(error){status.textContent=String(error?.message||error);}
    finally{state.submitBusy=false;button.disabled=false;}
  }
  function supportCurrent(){
    const row=state.ranked.find(x=>x.key===state.selected);
    if(!row)return;
    tap();
    $("petition-feedback").textContent="💥 "+row.title+" · 又给策划来了一发！";
  }
  function framePoint(node,container){
    if(!node||!container)return null;
    const b=node.getBoundingClientRect(),c=container.getBoundingClientRect();
    return{x:b.left-c.left+b.width/2,y:b.top-c.top+b.height/2};
  }
  function reactToImpact(tier,real){
    const sprite=$("planner-mascot"),stage=$("planner-stage"),status=$("planner-status");
    const reaction=tier>=3?"knockout":tier===2?"hit":"shock";
    if(sprite){
      sprite.dataset.reaction=reaction;
      sprite.classList.remove("reaction-shake");
      void sprite.offsetWidth;
      sprite.classList.add("reaction-shake");
    }
    if(stage&&tier>=3)stage.classList.add("planner-finale");
    if(status){
      status.textContent=tier>=3?"策划：我人都被炸扁啦！😵":
        tier===2?"策划：怎么还有双响炮？！💫":
        real?"策划：收到真实支持了！💥":"策划：这问题又炸来啦！";
    }
    window.clearTimeout(state.reactionTimer);
    state.reactionTimer=window.setTimeout(()=>{
      if(sprite){sprite.dataset.reaction="normal";sprite.classList.remove("reaction-shake");}
      stage?.classList.remove("planner-finale");
      if(status)status.textContent="策划：我会认真看问题的…";
    },tier>=3?1850:tier===2?1280:850);
  }
  function impact(tier,real){
    reactToImpact(tier,real);
    if(reduced||document.hidden)return;
    const layer=effectLayer(),card=$("planner-stage"),target=$("planner-target");
    if(!layer||!target||!card)return;
    const b=framePoint(target,layer);
    if(!b)return;
    card.classList.remove("is-hit");void card.offsetWidth;card.classList.add("is-hit");
    window.setTimeout(()=>card.classList.remove("is-hit"),550);
    const burst=document.createElement("span");
    burst.className="planner-impact planner-impact-"+tier;
    burst.textContent=tier===3?"💥":tier===2?"⚡💥":"💥";
    burst.style.left=b.x+"px";burst.style.top=b.y+"px";
    layer.appendChild(burst);
    const ring=document.createElement("span");ring.className="planner-shockwave planner-shockwave-"+tier;
    ring.style.left=b.x+"px";ring.style.top=b.y+"px";layer.appendChild(ring);
    window.setTimeout(()=>{burst.remove();ring.remove();},800);
    const icons=tier===3?["🔥","⚡","💥","💫","✨","🔥","⚡","✨","💫","💥","🔥","✨"]:
      tier===2?["🔥","⚡","💫","✨","💥","🔥","✨","⚡"]:["💫","✨","💥","🔥","✨"];
    const centerX=b.x,centerY=b.y;
    icons.forEach((icon,i)=>{
      if(layer.querySelectorAll(".planner-debris").length>=28)return;
      const angle=(Math.PI*2*i/icons.length)+Math.random()*.25,
        radius=(tier===3?114:tier===2?89:61)*(0.7+Math.random()*.6);
      const p=document.createElement("span");p.className="planner-debris";p.textContent=icon;
      p.style.left=centerX+"px";p.style.top=centerY+"px";
      p.style.setProperty("--debris-x",(Math.cos(angle)*radius).toFixed(1)+"px");
      p.style.setProperty("--debris-y",(Math.sin(angle)*radius).toFixed(1)+"px");
      p.style.setProperty("--debris-rotate",Math.round(Math.random()*160-80)+"deg");
      layer.appendChild(p);window.setTimeout(()=>p.remove(),1150);
    });
    const label=document.createElement("span");label.className="planner-combo-hit";
    label.textContent=real?"✅ 真实支持 +1":tier===3?"👑 重炮命中!":tier===2?"⚡ 暴击!":"💥 命中!";
    label.style.left=b.x+"px";label.style.top=(b.y-32)+"px";
    layer.appendChild(label);window.setTimeout(()=>label.remove(),1050);
  }
  function fireBomb(key=state.selected,{real=false,force=false}={}){
    if(document.hidden)return;
    if(reduced){impact(tierFor(key),real);return;}
    const layer=effectLayer(),stage=$("planner-stage"),target=$("planner-target");
    if(!layer||!stage||!target)return;
    if(layer.querySelectorAll(".planner-projectile").length>=10){impact(tierFor(key),real);return;}
    const fromDock=window.innerWidth<=700&&document.body?.classList.contains("bomb-dock-visible");
    const row=fromDock?$("mobile-bomb-fire"):(fields.get(key)?.button||$("petition-orb"));
    const source=framePoint(row,layer),end=framePoint(target,layer);
    if(!source||!end)return;
    const tier=tierFor(key);
    const count=tier===3?3:tier===2?2:1;
    // More votes → higher rank → more projectiles. No synthetic votes.
    for(let i=0;i<count;i++){
      const p=document.createElement("span");p.className="planner-projectile planner-projectile-"+tier;
      p.textContent=tier===3?"💣":tier===2?"🧨":"💣";
      p.style.left=source.x+"px";p.style.top=source.y+"px";
      layer.appendChild(p);
      const dx=end.x-source.x+(i-1)*9,dy=end.y-source.y+(i-1)*5;
      const high=-(42+tier*23+i*11),duration=480+tier*70+i*55;
      const run=()=>{
        if(!p.isConnected)return;
        const animate=p.animate?.([
          {offset:0,transform:"translate(-50%,-50%) rotate(-25deg) scale(.65)",opacity:.92},
          {offset:.38,transform:"translate(calc(-50% + "+dx*.36+"px),calc(-50% + "+(dy*.36+high)+"px)) rotate(80deg) scale(1.12)",opacity:1},
          {offset:.77,transform:"translate(calc(-50% + "+dx*.78+"px),calc(-50% + "+(dy*.78+high*.35)+"px)) rotate(285deg) scale(1.18)",opacity:1},
          {offset:1,transform:"translate(calc(-50% + "+dx+"px),calc(-50% + "+dy+"px)) rotate(400deg) scale(.85)",opacity:1}
        ],{duration,easing:"ease-in-out",fill:"forwards"});
        const done=()=>{p.remove();if(i===0)impact(tier,real);};
        if(animate)animate.onfinish=done;
        else {p.style.left=end.x+"px";p.style.top=end.y+"px";window.setTimeout(done,duration);}
      };
      if(i===0)run();else window.setTimeout(run,i*75);
    }
  }
  function playAmbient(){
    if(reduced||document.hidden||state.busy)return;
    const now=Date.now();
    if(now-state.lastClick<4500||now-state.lastRemoteBomb<4000)return;
    const stage=$("planner-stage");
    const rect=stage?.getBoundingClientRect?.();
    if(rect && Number.isFinite(window.innerHeight) && (rect.top>window.innerHeight+90||rect.bottom<0))return;
    const top=state.ranked[0];
    if(!top||confirmed(top.key)<1)return;
    // Decorative reprise of a genuinely supported issue. NO ballot or click increment.
    fireBomb(top.key,{real:false});
  }
  function saveClicks(){
    try{
      localStorage.setItem(STORAGE,String(state.localClicks));
      localStorage.setItem(QUEUE_STORAGE,JSON.stringify([...state.pendingBySeat].filter(([,v])=>v>0)));
      state.lastSave=Date.now();
    }catch(error){/* Taps still work when storage is unavailable. */}
  }
  function readClicks(){
    try{
      const v=Number(localStorage.getItem(STORAGE));
      state.localClicks=Number.isSafeInteger(v)&&v>=0?v:0;
      const raw=JSON.parse(localStorage.getItem(QUEUE_STORAGE)||"[]");
      if(Array.isArray(raw)){
        for(const entry of raw.slice(0,300)){
          if(!Array.isArray(entry)||entry.length!==2)continue;
          const [key,value]=entry;
          const validKey=typeof key==="string" &&
            /^(topic:[a-z0-9_]+|question:[0-9a-f-]{36})$/.test(key);
          if(validKey&&Number.isSafeInteger(value)&&value>0){
            state.pendingBySeat.set(key,value);
            state.pendingClicks+=value;
          }
        }
      }
    }catch(error){state.localClicks=0;state.pendingBySeat.clear();state.pendingClicks=0;}
    $("petition-total").textContent=fmt(state.localClicks);
    $("petition-combo").textContent="0 连击";
    $("petition-global-total").textContent="—";
  }
  function onGlobalCount(data){
    const number=Number(data?.total);
    if(!Number.isFinite(number)||number<0)return;
    state.totalKnown=true;
    state.lastGlobal=Math.max(state.lastGlobal,number);
    const label=$("petition-global-total");
    if(label)label.textContent=fmt(state.lastGlobal);
    $("petition-global").textContent="🌍 全站实时累计 · 每次点击都计入（同步后更新）";
  }
  function queueFlush(wait=950){
    if(state.flushTimer||state.submitting||state.pendingClicks<=0)return;
    state.flushTimer=window.setTimeout(()=>{
      state.flushTimer=0;
      flush().catch(error=>console.warn("Planner click sync",error));
    },wait);
  }
  async function flush(){
    if(state.submitting||state.pendingClicks<=0)return;
    if(!LIVE?.isReady?.()||document.hidden){queueFlush(2500);return;}
    const next=[...state.pendingBySeat.entries()].find(([,count])=>count>0);
    if(!next){state.pendingClicks=0;saveClicks();return;}
    const [seat,pending]=next,batch=Math.min(25,pending);
    state.submitting=true;
    try{
      const result=await LIVE.bombIssue(seat,batch);
      const accepted=Math.max(0,Math.min(batch,Number(result?.accepted)||0));
      if(accepted>0){
        const remaining=Math.max(0,(state.pendingBySeat.get(seat)||0)-accepted);
        if(remaining===0)state.pendingBySeat.delete(seat);
        else state.pendingBySeat.set(seat,remaining);
        state.pendingClicks=Math.max(0,state.pendingClicks-accepted);
        saveClicks();
        onGlobalCount(result);
        syncRows();
      }
      // A short request cooldown protects the database, not the total click count.
      if(result?.reason==="cooldown")queueFlush(1200);
    }catch(error){
      const reason=String(error?.message||error);
      if(/not approved|invalid issue key|invalid or inactive question|unknown official seat|问题.*未审核/i.test(reason)){
        // Rejecting a public question must not leave an endless retry loop.
        const dropped=state.pendingBySeat.get(seat)||0;
        state.pendingBySeat.delete(seat);
        state.pendingClicks=Math.max(0,state.pendingClicks-dropped);
        saveClicks();
        toast("这道问题已更新或暂不可投弹，请刷新后选择其他问题");
        syncRows();
      }else{
        if(!state.totalKnown)$("petition-global").textContent="🌍 暂时无法同步 · 已在本机排队";
        console.warn("Planner click sync waiting to retry",error);
      }
    }finally{
      state.submitting=false;
      if(state.pendingClicks>0)queueFlush(1300);
    }
  }
  function tap(){
    const row=state.ranked.find(x=>x.key===state.selected);
    if(!row)return;
    const now=Date.now();
    state.combo=now-state.lastClick<1100?state.combo+1:1;
    state.lastClick=now;
    state.localClicks+=1;
    state.pendingClicks+=1;
    state.pendingBySeat.set(row.key,(state.pendingBySeat.get(row.key)||0)+1);
    $("petition-total").textContent=fmt(state.localClicks);
    $("petition-combo").textContent="💥 "+fmt(state.combo)+" 连击";
    updateMobileDockLabel();
    const reveal=revealPlannerOnMobile();
    syncRows();
    if(reveal){
      const run=()=>{if(!document.hidden)fireBomb(row.key);};
      if(typeof window.requestAnimationFrame==="function")window.requestAnimationFrame(run);
      else window.setTimeout(run,18);
    }else fireBomb(row.key);
    const msg=state.combo===10?"⚡ 10 连炸！策划快看！":state.combo===30?"💥 30 连炸！全桌都听见了！":
      state.combo===100?"👑 100 连炸！整场都炸响！":state.combo>=5?"🔥 "+fmt(state.combo)+" 连击！火力全开！":
      "💣 策划又被炸一下！当前问题热度 +1";
    $("petition-feedback").textContent=msg;
    if(state.localClicks%5===0||now-state.lastSave>1100)saveClicks();
    queueFlush(950);
    window.clearTimeout(state.timer);
    state.timer=window.setTimeout(()=>{state.combo=0;$("petition-combo").textContent="0 连击";updateMobileDockLabel();},1750);
  }
  function updateQuestions(){
    state.questions=(LIVE?.getQuestions?.()||[]).filter(q=>q.status==="approved");
    state.pending=(LIVE?.getQuestions?.()||[]).filter(q=>q.status==="pending");
    if(state.pendingSelect && candidates().some(row=>row.key===state.pendingSelect)){
      state.selected=state.pendingSelect;state.expanded=true;state.pendingSelect=null;
    }
    syncRows();
  }
  function refreshSeats(){syncRows();}
  function onSeatEvent(event){
    if(!event?.seat)return;
    refreshSeats();
    const now=Date.now();
    if(now-state.lastRemoteBomb<1400)return;
    state.lastRemoteBomb=now;
    if(state.ranked.some(x=>x.key===event.seat))fireBomb(event.seat,{real:true});
  }
  function onFormalVote(topicId){
    const seat="topic:"+topicId;
    if(state.ranked.some(x=>x.key===seat))fireBomb(seat,{real:true});
  }
  function notifyReady(){refreshSelected();if(state.pendingClicks>0)queueFlush(900);}
  function mount(){
    try{
      const seat=new URLSearchParams(location.search).get("seat");
      if(seat && /^(topic:[a-z0-9_]+|question:[0-9a-f-]{36})$/.test(seat)){
        state.expanded=true;
        // Seed issue deep links resolve immediately even before the database loads.
        if(ISSUES.some(issue=>seat==="topic:"+issue.id))state.selected=seat;
        else state.pendingSelect=seat;
      }
    }catch(error){/* A malformed link must not block the game. */}
    readClicks();
    syncRows();
    window.setInterval(playAmbient,12000);
    $("petition-orb").addEventListener("click",tap);
    $("planner-target").addEventListener("click",tap);
    $("planner-vote").addEventListener("click",supportCurrent);
    $("mobile-bomb-fire")?.addEventListener("click",tap);
    $("mobile-bomb-repeat")?.addEventListener("click",tap);
    window.addEventListener("scroll",syncMobileDock,{passive:true});
    window.addEventListener("resize",syncMobileDock,{passive:true});
    window.visualViewport?.addEventListener?.("resize",syncMobileDock,{passive:true});
    document.addEventListener("focusin",syncMobileDock);
    document.addEventListener("focusout",()=>window.setTimeout(syncMobileDock,100));
    $("lottery-dialog")?.addEventListener("close",syncMobileDock);
    $("share-dialog")?.addEventListener("close",syncMobileDock);
    $("planner-more").addEventListener("click",()=>{state.expanded=!state.expanded;syncRows();});
    $("planner-shuffle").addEventListener("click",nextBatch);
    $("top-issue-spotlight")?.addEventListener("click",openTopSpotlight);
    $("planner-write").addEventListener("click",()=>openForm($("planner-question-form").hidden));
    $("planner-question-cancel").addEventListener("click",()=>openForm(false));
    $("planner-question-input").addEventListener("input",e=>{
      $("planner-question-length").textContent=[...e.target.value].length+" / 160 字";
    });
    $("planner-question-form").addEventListener("submit",submit);
    window.addEventListener("pagehide",saveClicks);
    document.addEventListener("visibilitychange",()=>{
      if(document.hidden)saveClicks();
      else if(state.pendingClicks>0)queueFlush(1000);
    });
    // Wait for a verified public database read before claiming a real global count.
    syncMobileDock();
  }
  return{
    mount,tap,select,refreshSeats,updateQuestions,onGlobalCount,
    onSeatEvent,onFormalVote,notifyReady,fireBomb,
    getState:()=>state,
    getRanked:()=>state.ranked.slice()
  };
}
