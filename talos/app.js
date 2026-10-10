import { DEFAULT_CONFIG, SPECIES, RARITIES, TOOLS, GIFTS, ASSUMPTIONS, validateConfig } from './rules.js';
import { createGame, createChallenge, applyAction, targets, onBoard, nameOf, editRoom, addTool, recommend, replay, exportRun, importRun, isChallenge, challengeView } from './session-engine.js?v=0.5.0-4';
import {pairDecision} from './interaction.js';
import {PrisonEffects} from './effects.js';
import {goalGuide} from './goal-guide.js';
import {PrisonScene3D} from './scene3d.js';
import {PrisonAudio} from './audio.js?v=0.6.0-1';
import {challengePanel,challengeGuide,cargoChoices,deliveryStatus,patrolRoute,destinationDetail} from './challenge-ui.js?v=0.5.0-4';

const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE='ss14-prison-lab-v1';
let state,initial,selected=0,configDraft=structuredClone(DEFAULT_CONFIG),resultShown=-1;
let armed=false,pairTarget=null,pendingAction=null,uiMode=null,rewardChoice=null,busy=false,contextAnchor=null;
let preferences={advice:false,motion:true,fast:false,quick:false};
try{const saved=JSON.parse(localStorage.getItem('ss14-prison-ui-v2')||'{}');for(const key of Object.keys(preferences))if(typeof saved[key]==='boolean')preferences[key]=saved[key];}catch{}
const effects=new PrisonEffects({enabled:()=>preferences.motion,fast:()=>preferences.fast});
const lockIcon='<svg class="cell-lock" viewBox="0 0 24 30" aria-hidden="true"><path d="M5 12V8a7 7 0 0 1 14 0v4h2v16H3V12zm3 0h8V8a4 4 0 0 0-8 0zm4 5a2 2 0 0 0-1 4v3h2v-3a2 2 0 0 0-1-4"/></svg>';
const eatIcon='<svg viewBox="0 0 40 36" aria-hidden="true"><path d="M3 8q17-10 34 0v12q-17 22-34 0Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M6 6h6v12H6zm11-3h6v14h-6zm11 3h6v12h-6zM11 27h5v-6h-5zm13 0h5v-6h-5z" fill="currentColor"/></svg>';
try {
  const saved=localStorage.getItem(STORE);
  if(saved){const loaded=importRun(JSON.parse(saved));state=loaded.current;initial=loaded.initial;configDraft=structuredClone(state.config);}
} catch(e) { $('error').hidden=false;$('error').textContent=`旧存档未载入：${e.message}`; }
if(!state){state=createGame('talos-first-run');initial=structuredClone(state);}
const scene3d=new PrisonScene3D({stage:document.querySelector('.game-stage'),board:$('board'),motion:()=>preferences.motion,fast:()=>preferences.fast});
const audio=new PrisonAudio({onStatus:renderAudioState});
function renderAudioState(status){
  const prefs=status.preferences,button=$('audio-toggle');
  button.setAttribute('aria-pressed',String(prefs.enabled));
  button.setAttribute('aria-label',prefs.enabled?'关闭声音':'开启声音');
  $('audio-toggle-label').textContent=prefs.enabled?'声音':'静音';
  button.dataset.unlocked=String(status.unlocked);button.dataset.voice=status.voice||'';
  button.dataset.effects=String(status.effects);button.dataset.ambience=String(status.ambiencePlaying);button.dataset.music=String(status.musicPlaying);
  $('audio-master').checked=prefs.enabled;
  for(const kind of ['sfx','voice','ambience','music']){
    $(`audio-${kind}`).checked=prefs[kind];
    $(`audio-${kind}`).disabled=!status.kinds[kind];
    $(`audio-preview-${kind}`).disabled=!status.kinds[kind]||!prefs.enabled||!prefs[kind];
  }
  $('audio-volume').value=String(Math.round(prefs.volume*100));
  $('audio-volume-value').textContent=`${Math.round(prefs.volume*100)}%`;
  $('audio-music-volume').value=String(Math.round(prefs.musicVolume*100));
  $('audio-music-volume').disabled=!status.kinds.music||!prefs.enabled||!prefs.music;
  $('audio-music-volume-value').textContent=`${Math.round(prefs.musicVolume*100)}%`;
  $('audio-status').textContent=!status.ready?'声音准备中…':!status.available?'声音素材待配置':status.kinds.sfx?'声音已就绪':status.kinds.voice?'配音已就绪 · 音效待配置':'环境声已就绪';
}
document.addEventListener('pointerdown',event=>audio.unlock(event),{capture:true});
document.addEventListener('keydown',event=>{if(!event.repeat)audio.unlock(event);},{capture:true});
$('audio-toggle').addEventListener('click',()=>audio.setPreferences({enabled:!audio.getStatus().preferences.enabled}));
$('audio-settings-open').addEventListener('click',()=>$('audio-dialog').showModal());
$('audio-master').addEventListener('change',event=>audio.setPreferences({enabled:event.target.checked}));
for(const kind of ['sfx','voice','ambience','music']){
  $(`audio-${kind}`).addEventListener('change',event=>audio.setPreferences({[kind]:event.target.checked}));
  $(`audio-preview-${kind}`).addEventListener('click',()=>kind==='voice'?audio.voice($('audio-voice-sample').value,{priority:10,replace:true}):kind==='sfx'?audio.devour($('audio-beast-sample').value):audio.preview(kind));
}
$('audio-volume').addEventListener('input',event=>audio.setPreferences({volume:Number(event.target.value)/100}));
$('audio-music-volume').addEventListener('input',event=>audio.setPreferences({musicVolume:Number(event.target.value)/100}));
renderAudioState(audio.getStatus());
let lastSelectSound=0;
function selectionSound(){const now=performance.now();if(now-lastSelectSound>100){lastSelectSound=now;audio.play('select');}}

const positions=[[1,1],[1,2],[1,3],[1,4],[1,5],[1,6],[2,6],[3,6],[4,6],[4,5],[4,4],[4,3],[4,2],[4,1],[3,1],[2,1]];
function persist(){try{localStorage.setItem(STORE,JSON.stringify(exportRun(state,initial)));}catch(e){showError('浏览器未能保存，请使用导出保留这局。');}}
function showError(message){$('error').hidden=false;$('error').textContent=message;}
let goalGuidePinned=false,goalGuideHideTimer;
function positionGoalGuide(){
  const trigger=$('goal-details-trigger').getBoundingClientRect(),tip=$('goal-tooltip'),margin=12;
  const left=innerWidth>700?trigger.right+12:trigger.left;
  const top=innerWidth>700?trigger.top:trigger.bottom+10;
  tip.style.left=`${Math.max(margin,Math.min(left,innerWidth-tip.offsetWidth-margin))}px`;
  tip.style.top=`${Math.max(margin,Math.min(top,innerHeight-tip.offsetHeight-margin))}px`;
}
function showGoalGuide(){
  clearTimeout(goalGuideHideTimer);$('goal-tooltip').hidden=false;
  $('goal-details-trigger').setAttribute('aria-expanded','true');positionGoalGuide();
}
function hideGoalGuide(){
  clearTimeout(goalGuideHideTimer);goalGuidePinned=false;$('goal-tooltip').hidden=true;
  $('goal-details-trigger').setAttribute('aria-expanded','false');
}
function scheduleGoalGuideHide(){
  clearTimeout(goalGuideHideTimer);goalGuideHideTimer=setTimeout(()=>{
    if(!goalGuidePinned&&document.activeElement!==$('goal-details-trigger'))hideGoalGuide();
  },120);
}
function renderGoalGuide(){
  if(isChallenge(state)){
    $('goal-tooltip').innerHTML=challengeGuide(state);
    if(!$('goal-tooltip').hidden)positionGoalGuide();
    return;
  }
  const guide=goalGuide(state),list=(items,tag)=>`<${tag}>${items.map(item=>`<li>${esc(item)}</li>`).join('')}</${tag}>`;
  $('goal-tooltip').innerHTML=`<header class="goal-tooltip-header"><h2>困兽称王</h2><span class="goal-status ${guide.completed?'complete':''}">${esc(guide.status)}</span></header><p class="goal-explanation">${esc(guide.condition)}</p><p class="goal-reward">${esc(guide.reward)}</p><div class="goal-current">${esc(guide.progress)}</div><h3>${esc(guide.routeTitle)}</h3>${list(guide.steps,'ol')}${guide.boosts.length?`<h3>刑具影响</h3>${list(guide.boosts,'ul')}`:''}<div class="goal-notes">${guide.notes.map(note=>`<p>${esc(note)}</p>`).join('')}</div>`;
  if(!$('goal-tooltip').hidden)positionGoalGuide();
}
async function act(action){
  if(busy)return;
  let next;try{next=applyAction(state,action);}catch(e){showError(e.message);return;}
  const before=state;busy=true;cancelChoice();rewardChoice=null;
  const audioAction=audio.actionStart(action);
  if($('reward-dialog').open)$('reward-dialog').close();
  if($('delivery-dialog').open)$('delivery-dialog').close();
  document.querySelector('.game-stage').setAttribute('aria-busy','true');
  $('confirm-action').disabled=true;$('confirm-reward').disabled=true;
  $('motion-status').textContent=({eat:'囚犯吞噬中…',visit:'巡监中…',reroll:'更换囚犯…',end:'本日经营结束…',choose:'获得奖励…',fight:'暴乱演算中…',scout:'侦察路线…',deliver:'押运交付…',skipDelivery:'本次合约已放弃'})[action.type]||'';
  state=next;persist();$('error').hidden=true;
  try{
    if(scene3d.ready)await scene3d.effectBefore(action,before);else await effects.before(action,before);
    audio.actionImpact(action,before,state,audioAction);
    render(true);
    if(scene3d.ready)await scene3d.effectAfter(before,state,action);else await effects.after(before,state,action);
  }
  catch{ /* Visual effects cannot roll back or duplicate a committed action. */ }
  finally{busy=false;document.querySelector('.game-stage').setAttribute('aria-busy','false');render();}
  audio.actionComplete(action,before,state,audioAction);
  $('motion-status').dataset.lastEffect=action.type;
  $('motion-status').textContent=action.type==='eat'?`吞噬完成 · ${state.rooms[action.room].prisoner?nameOf(state.rooms[action.room].prisoner):'绮彩囚犯已收容'}`:action.type==='visit'?'巡监完成':action.type==='reroll'?'更换完成':action.type==='choose'?'已获得奖励':'';
  if(action.type==='scout')$('motion-status').textContent='侦察完成 · 可开门或改去已开牢房';
  if(action.type==='deliver')$('motion-status').textContent='押运完成 · 合约已兑现';
}
function speciesOf(code){return SPECIES.find(p=>p.id===code);}
function buttonsFor(action,label,cls=''){return `<button class="button ${cls}" data-action="${esc(JSON.stringify(action))}">${esc(label)}</button>`;}
function decisionCard(id,label,icon,pressed=false,disabled=false){return `<button class="decision-card" data-decision="${id}" aria-pressed="${pressed}" ${disabled?'disabled':''}><span class="decision-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`;}
function cancelChoice(){pendingAction=null;pairTarget=null;uiMode=null;armed=false;$('context-actions').hidden=true;}
function pointerAt(event,node){
  if(event?.detail&&event.clientX>0)return {x:event.clientX,y:event.clientY};
  const rect=(node||document.querySelector(`[data-room="${selected}"]`)).getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.bottom};
}
function positionContext(point){
  const menu=$('context-actions'),width=document.documentElement.clientWidth,height=innerHeight;
  menu.style.left=`${Math.max(10,Math.min(point.x+12,width-menu.offsetWidth-10))}px`;
  menu.style.top=`${Math.max(10,Math.min(point.y+12,height-menu.offsetHeight-10))}px`;
}
function showContext(html,point){
  const menu=$('context-actions');contextAnchor=pairTarget??selected;menu.innerHTML=html;menu.hidden=false;positionContext(point);
  menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
}
function pairPreview(room){const p=state.rooms[room].prisoner;return `<div class="pair-label"><div class="portrait ${p.code} tier-${p.tier}"></div><span>${room+1}号 ${nameOf(p)}</span></div>`;}
function showPair(target,point){
  const decision=pairDecision(state,selected,target);pairTarget=target;uiMode='eat';pendingAction=decision.action;armed=true;render();
  if(decision.action&&preferences.quick){act(decision.action);return;}
  showContext(`<h3>囚犯吞噬</h3><div class="pair-preview">${pairPreview(selected)}<span>→</span>${pairPreview(target)}</div><p class="${decision.action?'':'invalid'}">${decision.action?'吃后提升稀有度，并随机调整代号。':esc(decision.reason)}</p><div class="context-buttons"><button class="button gold" data-pair-confirm ${decision.action?'':'disabled'}>吃</button>${decision.reverse?'<button class="button" data-pair-swap>交换主次</button>':''}<button class="button cancel" data-cancel>取消</button></div>${!decision.action?'<div class="context-buttons"><button class="button" data-select-second>选为主囚犯</button></div>':''}`,point);
}
function showSingle(point){
  const p=state.rooms[selected].prisoner;if(!p||state.phase!=='manage'||state.pending.length||(isChallenge(state)&&challengeView(state).deliveryPending))return;
  showContext(`<h3>${selected+1}号 ${nameOf(p)}</h3><p>换：重新随机代号与稀有度，可能降阶。消耗今日一次换。</p><div class="context-buttons"><button class="button" data-single-reroll ${state.rerolls>=state.config.rerollsPerDay?'disabled':''}>换</button><button class="button cancel" data-cancel>取消</button></div>`,point);
}
function offerAction(action,event){
  if(busy)return;
  if(action.type==='eat'){selected=action.room;armed=true;showPair(action.prey,pointerAt(event,event?.target));return;}
  $('context-actions').hidden=true;pairTarget=null;uiMode=null;pendingAction=action;
  if(action.room!==undefined){selected=action.room;armed=true;}
  if(preferences.quick&&['visit','reroll','end'].includes(action.type)){act(action);return;}
  render();
}
function render(deferDialogs=false){
  const active=onBoard(state),phase=state.phase;
  const challenge=isChallenge(state)?challengeView(state):null;
  const route=patrolRoute(state,pendingAction?.type==='visit'?pendingAction.room:null);
  $('challenge-panel').innerHTML=challengePanel(state,{selected,pendingAction,busy});
  $('run-badge').hidden=!challenge;
  $('countdown-caption').textContent=challenge?'距离经营结束':'距离暴乱剩余';
  const remains=Math.max(0,state.config.days-state.day+1);
  $('countdown').textContent=['riot','finished'].includes(phase)?'暴乱已开始':`${remains} 天`;
  $('day-tag').textContent=`第 ${state.day} / ${state.config.days} 日`;
  $('day-track').innerHTML=Array.from({length:state.config.days},(_,i)=>`<span class="${i+1<state.day?'past':i+1===state.day?'current':''}"></span>`).join('');
  $('goal-state').textContent=state.goalIndex?'已完成':'进行中';
  $('goal-name').textContent=state.goalIndex>=state.config.goalTiers.length?'目标已达成':'困兽称王';
  const target=state.config.goalTiers[state.goalIndex];
  const displayedGoal=target??state.config.goalTiers.at(-1);
  $('scene-goal').innerHTML=displayedGoal===undefined?'<span class="goal-heading">目标</span><span class="goal-condition">本轮未设置目标</span>':`<span class="goal-heading">目标：困兽称王</span><span class="goal-condition">至少1名囚犯的稀有度达到<br><strong>${RARITIES[displayedGoal]}</strong>${target===undefined?' 已完成':''}</span>`;
  if(challenge)$('scene-goal').innerHTML=`<span class="goal-heading">目标：押运合约</span><span class="goal-condition">完成至少 2 单，必须包含重囚<br><strong>${challenge.completed}/3 单</strong> · ${challenge.tickets} 张调度券</span>`;
  renderGoalGuide();
  $('goal-description').textContent=target===undefined?'已领完本轮设定目标。继续经营，培养绮彩囚犯。':`至少一名囚犯达到${RARITIES[target]}。${state.goalIndex?'后续目标采用实验配置。':''}`;
  const maximum=Math.max(0,...active.map(p=>p.tier),...state.rainbow.map(p=>p.tier));
  $('goal-progress').style.width=`${target===undefined?100:Math.min(100,maximum/Math.max(1,target)*100)}%`;
  $('tool-count').textContent=state.tools.length;
  $('tools').innerHTML=state.tools.map(id=>{const t=TOOLS.find(x=>x.id===id);return `<div class="tool"><span class="tool-icon" aria-hidden="true">${t.icon}</span><div><strong>${t.name}</strong><p>${t.text}</p></div></div>`;}).join('');
  $('tools-empty').hidden=!!state.tools.length;
  $('rainbow-count').textContent=state.rainbow.length;
  $('rainbow').innerHTML=`<div class="rainbow-grid">${state.rainbow.map(p=>`<div class="rainbow-avatar portrait ${p.code}" role="img" aria-label="${nameOf(p)}"></div>`).join('')}${Array.from({length:Math.max(0,6-state.rainbow.length)},()=>'<div class="rainbow-slot" aria-hidden="true"></div>').join('')}</div>`;
  const edible=targets(state,selected);
  state.rooms.forEach((r,i)=>{
    const p=r.prisoner,candidate=phase==='patrol'&&state.destinations.includes(r.id)&&!state.pending.length&&(!challenge?.intel||challenge.intel.room===r.id||r.status==='open');
    const roomName=p?nameOf(p):r.status==='closed'?'未开启牢房':'空牢房';
    let node=$('board').querySelector(`[data-room="${i}"]`);
    if(!node){node=document.createElement('button');node.dataset.room=i;node.style.gridRow=positions[i][0];node.style.gridColumn=positions[i][1];$('board').append(node);}
    node.className=`room ${p?`occupied tier-${p.tier}`:''} ${candidate?'candidate':''} ${i===selected&&armed?'selected':''} ${i===pairTarget?'pair-target':''} ${edible.includes(i)&&phase==='manage'&&armed&&!challenge?.deliveryPending?'prey':''} ${route?.rooms.includes(i)?'route-step':''}`;
    node.setAttribute('aria-label',`${i+1} 号 ${roomName}${candidate?'，可巡监':''}`);node.setAttribute('aria-pressed',String((i===selected&&armed)||i===pairTarget));
    const contentKey=JSON.stringify([r,state.position===i,state.day,targets(state,i).length]);
    if(node.dataset.contentKey!==contentKey){node.innerHTML=`<span class="cell-interior" aria-hidden="true"></span><span class="room-number">${i+1}</span>${p?`<span class="cell-pedestal" aria-hidden="true"></span><span class="portrait ${p.code}"></span><span class="room-name">${speciesOf(p.code).name}</span><span class="room-rarity">${RARITIES[p.tier]}</span>${targets(state,i).length?'<span class="eat-mark" aria-label="有可吃目标">◆</span>':''}`:r.status==='closed'?`<span class="cell-door door-left" aria-hidden="true"></span><span class="cell-door door-right" aria-hidden="true"></span>${lockIcon}`:'<span class="cell-empty" aria-hidden="true">◇</span>'}${r.nest?`<span class="nest-mark">鼠巢 · ${Math.max(0,r.nest.due-state.day)} 日</span>`:''}${r.event?'<span class="event-mark">!</span>':''}${state.position===i?'<span class="current-mark" aria-label="当前位置">✧</span>':''}`;node.dataset.contentKey=contentKey;}
  });
  scene3d.sync(state,{selected,armed,pairTarget});
  const labels={patrol:['PATROL','请选择目的地',''],manage:['MANAGEMENT',uiMode==='eat'?'请选择要吃的囚犯':'请进行决策',''],event:['SPECIAL EVENT',state.event?.kind==='chain'?'连锁反应':'处刑效率',''],riot:['PRISON RIOT','囚犯暴乱',''],finished:['RUN COMPLETE','经营结束','']};
  const [label,title,help]=labels[phase];
  $('phase-label').textContent=label;$('phase-title').textContent=title;$('phase-help').textContent=help;
  if(challenge?.deliveryPending){
    $('phase-title').textContent=`${challenge.contract.name} · ${challenge.earlyDelivery?'提前结算':'交付日'}`;
    $('phase-help').textContent=challenge.contract.description;
    $('center-actions').innerHTML='<button class="button gold" data-open-delivery>选择交付囚犯</button>'+(challenge.earlyDelivery?'<button class="button" data-cancel-early>继续经营</button>':'<button class="button" data-skip-delivery>放弃本次合约</button>');
  }else if(phase==='event'){
    const description=state.event.kind==='chain'?'下次移动开启路径上所有未开牢房，不触发其他效果。':'移除当前囚犯克制的下位囚犯，每名提升一阶；筛选按实验配置。';
    $('phase-help').textContent=description;
    $('center-actions').innerHTML=buttonsFor({type:'event',accept:false},'略过')+' '+(state.event.kind==='chain'||state.rooms[state.event.room].prisoner?buttonsFor({type:'event',accept:true},'接受事件','gold'):'');
  }else if(phase==='riot'){
    const w=state.waves[state.combatIndex];
    $('phase-title').textContent=`${['下层','中层','上层'][w.group]}暴乱`;
    $('phase-help').textContent=`${w.members.length} 名囚犯 · 实验压力 ${w.burden} · 战力 ${state.config.combatPower}`;
    $('center-actions').innerHTML=buttonsFor({type:'fight'},'演算这一场','gold');
  }else if(phase==='finished')$('center-actions').innerHTML='<button class="button gold" data-show-results>查看经营结果</button>';
  else if(phase==='manage'){
    const p=state.rooms[selected]?.prisoner;
    $('center-actions').innerHTML=(p&&edible.length?decisionCard('eat','吃',eatIcon,uiMode==='eat'):'')+(p?decisionCard('reroll','换','↻',pendingAction?.type==='reroll',state.rerolls>=state.config.rerollsPerDay):'')+decisionCard('end','结束','◷',pendingAction?.type==='end');
  }else $('center-actions').innerHTML='';
  $('destination-cards').innerHTML=phase==='patrol'?state.destinations.map(id=>{const p=state.rooms[id].prisoner;return `<button class="decision-card" data-destination="${id}" aria-pressed="${pendingAction?.type==='visit'&&pendingAction.room===id}" ${challenge?.intel&&challenge.intel.room!==id&&state.rooms[id].status==='closed'?'disabled':''}>${p?`<span class="portrait ${p.code} tier-${p.tier}"></span>`:'<span class="decision-icon">▥</span>'}${state.rooms[id].event?'<span class="decision-event" aria-label="此处有事件">!</span>':''}<span>去${id+1}号</span><small class="decision-detail">${esc(destinationDetail(state,id))}</small></button>`;}).join(''):'';
  if(route)$('phase-help').textContent=`连锁路线：${route.rooms.map(id=>id+1).join(' → ')} 号 · 预计开 ${route.closed} 间${route.nests?`，途经 ${route.nests} 个鼠巢`:''}（当前实验路径）`;
  if(pendingAction?.type==='scout'){$('phase-title').textContent=`侦察 ${pendingAction.room+1} 号牢房`;$('phase-help').textContent='确认消耗 1 张调度券。之后可走这条路线，或改去已开牢房。';}
  if(pendingAction?.type==='reroll'){$('phase-title').textContent=`更换 ${pendingAction.room+1} 号囚犯`;$('phase-help').textContent='重新随机代号与稀有度，可能降阶。确认后消耗今日一次换。';}
  if(pendingAction?.type==='skipDelivery'){$('phase-title').textContent='放弃本次合约';$('phase-help').textContent='确认后本次合约记为未完成，囚犯和调度券保留。';}
  $('board-count').textContent=`场上 ${active.length} 名 · 已开 ${state.rooms.filter(r=>r.status==='open').length} 间`;
  $('confirm-action').disabled=!pendingAction||busy||!!state.pending.length;
  $('confirm-action').hidden=uiMode==='eat'&&!pendingAction;
  $('cancel-action').hidden=!(uiMode==='eat'&&!pendingAction);
  $('undo').disabled=!state.history.length;
  const r=state.rooms[selected];
  $('selection-hint').textContent=r?.prisoner?`${selected+1} 号${nameOf(r.prisoner)} · ${edible.length} 个可吃目标`:`已选 ${selected+1} 号牢房`;
  renderInspect();
  $('advice-panel').hidden=!preferences.advice;
  $('advice-placeholder').hidden=preferences.advice;
  const recommendations=preferences.advice?recommend(state):[];
  $('advice').innerHTML=recommendations.map((rec,i)=>`<div class="advice-item"><div class="advice-title">${i===0?'优先参考':'备选'} · ${esc(rec.label)}</div><p>${esc(rec.reason)}</p>${buttonsFor(rec.action,'采用这个选择')}</div>`).join('')||'<p class="hint">本轮已结束，可导出记录或再开一局。</p>';
  $('log').innerHTML=state.log.slice(-9).reverse().map(item=>`<li><time>第 ${item.day} 日</time><span>${esc(item.text)}</span></li>`).join('');
  $('action-count').textContent=`${state.history.length} 次操作`;
  $('seed-display').textContent=`种子 ${state.seed} · 自动保存本机`;
  $('edit-code').value=r.prisoner?.code??(r.status==='closed'?'closed':'empty');
  $('edit-tier').value=String(r.prisoner?.tier??0);
  $('edit-room').disabled=!!challenge||!['patrol','manage'].includes(phase)||!!state.pending.length;
  $('add-tool').disabled=!!challenge||!['patrol','manage'].includes(phase)||!!state.pending.length;
  $('open-rules').disabled=!!challenge;
  $('open-rules').title=challenge?'挑战采用固定规则；可切换复刻练习校准参数。':'';
  $('add-tool-select').innerHTML=TOOLS.filter(t=>!state.tools.includes(t.id)).map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  if(state.pending.length){
    const reward=state.pending[0],catalog=reward.kind==='tool'?TOOLS:GIFTS;
    $('reward-kind').textContent=reward.kind==='tool'?'OBJECTIVE COMPLETE':'RAINBOW PRISONER';
    $('reward-title').textContent=reward.kind==='tool'?'选择一件刑具':'典狱长的珍藏';
    if(!reward.options.includes(rewardChoice))rewardChoice=null;
    $('reward-options').innerHTML=reward.options.map(id=>{const t=catalog.find(x=>x.id===id);return `<button class="reward-choice" data-reward="${id}" aria-pressed="${id===rewardChoice}"><span class="reward-icon" aria-hidden="true">${t.icon}</span><strong>${t.name}</strong><p>${t.text}</p></button>`;}).join('');
    $('confirm-reward').disabled=!rewardChoice||busy;
    if(!deferDialogs&&!$('reward-dialog').open)$('reward-dialog').showModal();
  }else if($('reward-dialog').open)$('reward-dialog').close();
  if(!deferDialogs&&phase==='finished'&&resultShown!==state.revision){resultShown=state.revision;showResults();}
  if(phase!=='finished'&&$('result-dialog').open)$('result-dialog').close();
}
function renderInspect(){
  const r=state.rooms[selected];$('room-number').textContent=`${String(selected+1).padStart(2,'0')}`;
  if(!r.prisoner){
    $('inspect').innerHTML=`<div class="empty-inspect"><span class="door-icon" aria-hidden="true">${r.status==='closed'?'▥':'◇'}</span><span>${r.nest?`鼠巢，第 ${r.nest.due} 日预计成熟`:r.status==='closed'?'尚未开启':'囚犯已离开'}</span></div>${state.phase==='patrol'&&state.destinations.includes(selected)&&!state.pending.length?buttonsFor({type:'visit',room:selected},'前往这间牢房','gold full'):''}`;
    return;
  }
  const p=r.prisoner,prey=targets(state,selected);
  $('inspect').innerHTML=`<div class="inspect-portrait portrait ${p.code} tier-${p.tier}" role="img" aria-label="${nameOf(p)}"></div><div class="inspect-name tier-${p.tier}"><strong>${speciesOf(p.code).name}</strong><span class="rarity-tag">${RARITIES[p.tier]}</span></div><p class="inspect-text">可吃同阶${speciesOf(speciesOf(p.code).prey).name}${p.code==='rat'&&state.tools.includes('rathead')?'或同阶硕鼠':''}。吃后随机调整代号。</p><p class="hint">${prey.length?`可吃目标：${prey.map(target=>`${target+1}号`).join('、')}`:'当前没有可吃目标。'}<br>今日换：${state.rerolls} / ${state.config.rerollsPerDay} 次（实验设定）</p>`;
}
function showResults(){
  const population=[...onBoard(state),...state.rainbow];
  if(isChallenge(state)){
    const v=challengeView(state);
    $('results').innerHTML=`<div class="result-summary"><div><strong>${v.completed}/3</strong><span>完成合约</span></div><div><strong>${v.score}</strong><span>挑战积分</span></div><div><strong>${v.tickets}</strong><span>剩余调度券</span></div></div><h2 class="${v.result?.success?'challenge-success':''}">${v.result?.grade==='full'?'三单全部达成':v.result?.success?'押运挑战通过':'本轮挑战未通过'}</h2><p class="hint">${esc(v.summary)}</p>${(v.contracts??[]).map(c=>`<div class="wave ${c.status==='completed'?'cleared':'failed'}"><span>${esc(c.name)}</span><span>${c.status==='completed'?`已交付 · ${c.score??0} 分`:'未完成'}</span></div>`).join('')}<p class="challenge-origin">最多12日的原创挑战，第${state.day}日结束；合约完成数优先、交付积分次之；囚犯越高阶贡献越多，但押运仍需符合压力与用券限制。</p>`;
    $('result-dialog').querySelector('.result-actions').previousElementSibling.textContent='挑战积分只比较本模式，不代表正式游戏掉落或货币收益。';
    if(!$('result-dialog').open)$('result-dialog').showModal();
    return;
  }
  $('result-dialog').querySelector('.result-actions').previousElementSibling.textContent='战斗、分区和积分为实验设定，未代入真实掉落与价格。';
  $('results').innerHTML=`<div class="result-summary"><div><strong>${state.rainbow.length}</strong><span>绮彩囚犯</span></div><div><strong>${state.stats.eaten}</strong><span>吞噬次数</span></div><div><strong>${state.stats.points}</strong><span>试验积分</span></div></div><p class="hint">${RARITIES.map((name,tier)=>`${name} ${population.filter(p=>p.tier===tier).length}`).join(' · ')}</p>${state.waves.map(w=>`<div class="wave ${w.status}"><span>${['下层','中层','上层'][w.group]} · ${w.members.length} 名</span><span>${({waiting:'未演算',empty:'无囚犯',cleared:'通过',failed:'未通过'})[w.status]}${w.power!==undefined?` · ${w.power} / ${w.burden}`:''}</span></div>`).join('')}`;
  if(!$('result-dialog').open)$('result-dialog').showModal();
}
let exportUrl;
function syncNewMode(){
  const challenge=$('run-mode').value==='challenge';
  $('practice-presets').hidden=challenge;$('challenge-builds').hidden=!challenge;
}
function deliverySelection(){
  const dialog=$('delivery-dialog');
  return {rooms:[...dialog.querySelectorAll('[data-cargo-room]:checked')].map(input=>Number(input.dataset.cargoRoom)),rainbowIds:[...dialog.querySelectorAll('[data-cargo-rainbow]:checked')].map(input=>input.dataset.cargoRainbow),escort:dialog.querySelector('input[name="delivery-escort"]:checked')?.value??'light'};
}
function renderDeliveryStatus(){
  if(!isChallenge(state))return;
  const preview=deliveryStatus(state,deliverySelection());
  $('delivery-preview').textContent=preview.text;
  $('delivery-preview').className=`delivery-preview ${preview.ok?'valid':'invalid'}`;
  $('confirm-delivery').disabled=!preview.ok||busy;
}
function openDelivery(selection){
  if(busy||!isChallenge(state)||!challengeView(state).deliveryPending)return;
  cancelChoice();const view=challengeView(state);
  $('delivery-title').textContent=view.contract.name+(view.earlyDelivery?' · 提前结算':'');
  $('delivery-requirements').textContent=view.contract.description;
  $('delivery-help').textContent=view.earlyDelivery?'确认交付会立即结束本轮。关闭选择可继续经营，不消耗调度券。':'确认后，所选囚犯会离开本局。取消选择不消耗调度券。';
  $('delivery-cargo').innerHTML=cargoChoices(state);
  document.querySelector('input[name="delivery-escort"][value="light"]').checked=true;
  if(selection){
    for(const room of selection.rooms??[])$('delivery-cargo').querySelector(`[data-cargo-room="${Number(room)}"]`)?.click();
    for(const id of selection.rainbowIds??[])$('delivery-cargo').querySelector(`[data-cargo-rainbow="${id}"]`)?.click();
    if(selection.escort==='heavy')document.querySelector('input[name="delivery-escort"][value="heavy"]').checked=true;
  }
  renderDeliveryStatus();if(!$('delivery-dialog').open)$('delivery-dialog').showModal();
}
$('run-mode').addEventListener('change',syncNewMode);
$('delivery-dialog').addEventListener('change',renderDeliveryStatus);
$('delivery-dialog').addEventListener('close',()=>{if(!busy&&isChallenge(state)&&challengeView(state).earlyDelivery)act({type:'cancelEarlyDelivery'});});
$('confirm-delivery').addEventListener('click',()=>act({type:'deliver',...deliverySelection()}));
function exportCurrent(){
  const data=JSON.stringify(exportRun(state,initial),null,2);
  if(exportUrl)URL.revokeObjectURL(exportUrl);
  exportUrl=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  $('export-json').value=data;
  $('download-run').href=exportUrl;
  $('download-run').download=`ss14-prison-day${state.day}-${state.revision}.json`;
  if(!$('export-dialog').open)$('export-dialog').showModal();
}
function startDialog(mode){
  if(busy)return;cancelChoice();if($('settings-dialog').open)$('settings-dialog').close();
  $('seed-input').value=`talos-${Date.now().toString(36)}`;
  if($('result-dialog').open)$('result-dialog').close();
  $('run-mode').value=mode==='challenge'||isChallenge(state)?'challenge':'practice';syncNewMode();
  if(!$('new-dialog').open)$('new-dialog').showModal();
}
function fillConfig(){
  const c=configDraft;
  $('rarity-weights').value=c.rarityWeights.join(',');$('code-weights').value=c.codeWeights.join(',');
  $('rerolls-limit').value=c.rerollsPerDay;$('nest-days').value=c.nestDays;$('nest-tier').value=String(c.nestTier);
  $('muzzle-timing').value=c.muzzleTiming;$('fire-timing').value=c.fireEligibility;
  $('events-chance').value=c.eventsChance;$('combat-power').value=c.combatPower;
  $('reuse-rooms').checked=c.reusableRooms;$('rainbow-counts').checked=c.rainbowCountsForMuzzle;
  $('execution-same').checked=c.executionSameTier;$('wine-changes').checked=c.wineChangesCode;$('circular-neighbors').checked=c.circularNeighbors;
  $('config-json').value=JSON.stringify(c,null,2);
}
document.addEventListener('click',event=>{
  if(busy)return;
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.close){$(button.dataset.close).close();return;}
  if(button.hasAttribute('data-start-challenge')){startDialog('challenge');return;}
  if(button.hasAttribute('data-open-delivery')){openDelivery();return;}
  if(button.hasAttribute('data-early-delivery')){act({type:'openEarlyDelivery'}).then(()=>openDelivery());return;}
  if(button.hasAttribute('data-cancel-early')){act({type:'cancelEarlyDelivery'});return;}
  if(button.hasAttribute('data-skip-delivery')){offerAction({type:'skipDelivery'},event);return;}
  if(button.dataset.scoutRoom!==undefined){offerAction({type:'scout',room:Number(button.dataset.scoutRoom)},event);return;}
  if(button.dataset.reward){if(rewardChoice!==button.dataset.reward)selectionSound();rewardChoice=button.dataset.reward;render();$('confirm-reward').focus({preventScroll:true});return;}
  if(button.hasAttribute('data-cancel')){audio.play('cancel');cancelChoice();render();return;}
  if(button.hasAttribute('data-pair-confirm')){if(pendingAction)act(pendingAction);return;}
  if(button.hasAttribute('data-pair-swap')){const source=selected,target=pairTarget;selected=target;showPair(source,pointerAt(event,button));return;}
  if(button.hasAttribute('data-select-second')){selected=pairTarget;cancelChoice();armed=true;render();return;}
  if(button.hasAttribute('data-single-reroll')){act({type:'reroll',room:selected});return;}
  if(button.dataset.destination!==undefined){if(pendingAction?.room!==Number(button.dataset.destination))selectionSound();offerAction({type:'visit',room:Number(button.dataset.destination)},event);return;}
  if(button.dataset.decision){
    if(button.dataset.decision==='eat'){pendingAction=null;pairTarget=null;uiMode='eat';armed=true;$('context-actions').hidden=true;render();}
    else offerAction(button.dataset.decision==='end'?{type:'end'}:{type:'reroll',room:selected},event);
    return;
  }
  if(button.dataset.action){const action=JSON.parse(button.dataset.action);if(action.type==='deliver')openDelivery(action);else if(['eat','reroll','visit','end','scout','skipDelivery'].includes(action.type))offerAction(action,event);else act(action);return;}
  if(button.hasAttribute('data-show-results')){showResults();return;}
  if(button.dataset.room!==undefined){
    const clicked=Number(button.dataset.room);
    if(state.pending.length||isChallenge(state)&&challengeView(state).deliveryPending)return;
    const intel=isChallenge(state)?challengeView(state).intel:null;
    if(state.phase==='patrol'&&intel&&state.rooms[clicked].status==='closed'&&clicked!==intel.room)return;
    if(clicked!==selected||!armed)selectionSound();
    if(state.phase==='patrol'&&state.destinations.includes(clicked)){offerAction({type:'visit',room:clicked},event);return;}
    if(state.phase==='manage'&&armed&&clicked!==selected&&state.rooms[selected].prisoner&&state.rooms[clicked].prisoner){showPair(clicked,pointerAt(event,button));return;}
    cancelChoice();selected=clicked;armed=!!state.rooms[clicked].prisoner;render();
  }
});
document.addEventListener('click',event=>{const inside=event.composedPath().some(node=>node.id==='context-actions'||node.matches?.('.room,#confirm-action,[data-action]'));if(!$('context-actions').hidden&&!inside){cancelChoice();render();}});
$('board').addEventListener('contextmenu',event=>{const room=event.target.closest('[data-room]');if(!room||busy)return;event.preventDefault();cancelChoice();selected=Number(room.dataset.room);armed=true;render();showSingle({x:event.clientX,y:event.clientY});});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){hideGoalGuide();if(!document.querySelector('dialog[open]')){cancelChoice();render();}}});
const goalTrigger=$('goal-details-trigger'),goalTooltip=$('goal-tooltip');
goalTrigger.addEventListener('mouseenter',showGoalGuide);
goalTrigger.addEventListener('mouseleave',scheduleGoalGuideHide);
goalTooltip.addEventListener('mouseenter',showGoalGuide);
goalTooltip.addEventListener('mouseleave',scheduleGoalGuideHide);
goalTrigger.addEventListener('focus',showGoalGuide);
goalTrigger.addEventListener('blur',()=>{if(!goalGuidePinned)hideGoalGuide();});
goalTrigger.addEventListener('click',()=>{goalGuidePinned=!goalGuidePinned;if(goalGuidePinned)showGoalGuide();else hideGoalGuide();});
document.addEventListener('click',event=>{if(!event.composedPath().includes(goalTrigger)&&!event.composedPath().includes(goalTooltip))hideGoalGuide();});
window.addEventListener('resize',()=>{if(!goalTooltip.hidden)requestAnimationFrame(positionGoalGuide);});
window.addEventListener('resize',()=>{if($('context-actions').hidden)return;requestAnimationFrame(()=>{if($('context-actions').hidden)return;const r=document.querySelector(`[data-room="${contextAnchor}"]`)?.getBoundingClientRect();if(r)positionContext({x:r.x+r.width/2,y:r.y+r.height/2});});});
$('confirm-action').addEventListener('click',()=>{if(pendingAction)act(pendingAction);});
$('cancel-action').addEventListener('click',()=>{if(!busy){audio.play('cancel');cancelChoice();render();}});
$('confirm-reward').addEventListener('click',()=>{if(rewardChoice)act({type:'choose',id:rewardChoice});});
$('new-game').addEventListener('click',startDialog);$('result-new').addEventListener('click',startDialog);
$('new-form').addEventListener('submit',event=>{
  event.preventDefault();
  if(busy)return;
  try{cancelChoice();rewardChoice=null;const seed=$('seed-input').value||'talos';state=$('run-mode').value==='challenge'?createChallenge(seed,{build:document.querySelector('input[name="challenge-build"]:checked').value}):createGame(seed,configDraft,$('preset').value);audio.reset();initial=structuredClone(state);selected=0;resultShown=-1;$('new-dialog').close();$('motion-status').textContent='';$('error').hidden=true;persist();render();}
  catch(e){showError(e.message);}
});
$('undo').addEventListener('click',()=>{
  if(busy)return;
  try{cancelChoice();rewardChoice=null;state=replay({initial,actions:state.history.slice(0,-1)});audio.reset();resultShown=-1;$('settings-dialog').close();persist();render();}
  catch(e){showError(e.message);}
});
$('export').addEventListener('click',exportCurrent);$('result-export').addEventListener('click',exportCurrent);
$('import').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async event=>{
  try{const file=event.target.files[0];if(!file)return;if(file.size>2*1024*1024)throw new Error('存档超过 2 MB');
    const run=importRun(JSON.parse(await file.text()));if(busy)throw new Error('请等待当前操作完成');cancelChoice();rewardChoice=null;audio.reset();state=run.current;initial=run.initial;configDraft=structuredClone(state.config);selected=0;resultShown=-1;$('settings-dialog').close();$('motion-status').textContent='';delete $('motion-status').dataset.lastEffect;persist();render();$('error').hidden=true;
  }catch(e){showError(`导入失败：${e.message}`);}finally{event.target.value='';}
});
$('edit-room').addEventListener('click',()=>{
  try{state=editRoom(state,selected,$('edit-code').value,Number($('edit-tier').value));persist();render();$('error').hidden=true;}catch(e){showError(e.message);}
});
$('add-tool').addEventListener('click',()=>{
  try{state=addTool(state,$('add-tool-select').value);persist();render();$('error').hidden=true;}catch(e){showError(e.message);}
});
$('open-rules').addEventListener('click',()=>{if(busy)return;$('settings-dialog').close();fillConfig();$('rules-dialog').showModal();});
$('config-form').addEventListener('submit',event=>{
  event.preventDefault();
  try{
    const parsed=JSON.parse($('config-json').value);
    configDraft=validateConfig({...parsed,rarityWeights:$('rarity-weights').value.split(',').map(Number),codeWeights:$('code-weights').value.split(',').map(Number),
      rerollsPerDay:Number($('rerolls-limit').value),nestDays:Number($('nest-days').value),nestTier:Number($('nest-tier').value),
      muzzleTiming:$('muzzle-timing').value,fireEligibility:$('fire-timing').value,eventsChance:Number($('events-chance').value),combatPower:Number($('combat-power').value),
      reusableRooms:$('reuse-rooms').checked,rainbowCountsForMuzzle:$('rainbow-counts').checked,executionSameTier:$('execution-same').checked,wineChangesCode:$('wine-changes').checked,circularNeighbors:$('circular-neighbors').checked});
    $('rules-dialog').close();startDialog();
  }catch(e){alert(`参数未保存：${e.message}`);}
});
$('reward-dialog').addEventListener('cancel',event=>event.preventDefault());
$('assumptions').innerHTML=ASSUMPTIONS.map(([label,text])=>`<div class="assumption"><strong>${label}</strong><p>${text}</p></div>`).join('');
for(const id of ['edit-tier','nest-tier'])$(id).innerHTML=RARITIES.slice(0,id==='nest-tier'?5:6).map((name,tier)=>`<option value="${tier}">${name}</option>`).join('');
function syncPreferences(){
  $('advice-toggle').checked=preferences.advice;$('motion-toggle').checked=preferences.motion;$('quick-toggle').checked=preferences.quick;$('speed-toggle').setAttribute('aria-pressed',String(preferences.fast));
  $('advice-rail-toggle').checked=preferences.advice;
  $('advice-rail-state').textContent=preferences.advice?'开启':'关闭';
  document.body.classList.toggle('motion-off',!preferences.motion||matchMedia('(prefers-reduced-motion: reduce)').matches);
  if(!scene3d.active)scene3d.finishTweens();
  scene3d.request();
  try{localStorage.setItem('ss14-prison-ui-v2',JSON.stringify(preferences));}catch{}
}
$('lab-settings').addEventListener('click',()=>{if(!busy){cancelChoice();render();$('settings-dialog').showModal();}});
for(const [id,key] of [['advice-toggle','advice'],['advice-rail-toggle','advice'],['motion-toggle','motion'],['quick-toggle','quick']])$(id).addEventListener('change',event=>{preferences[key]=event.target.checked;syncPreferences();render();});
$('speed-toggle').addEventListener('click',()=>{preferences.fast=!preferences.fast;syncPreferences();});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',syncPreferences);
syncPreferences();
render();
