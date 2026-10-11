import { DEFAULT_CONFIG, SPECIES, RARITIES, TOOLS, GIFTS, ASSUMPTIONS, validateConfig } from './rules.js?v=0.6.8-1';
import { applyAction, targets, onBoard, nameOf, editRoom, addTool, recommend, replay, exportRun, importRun, isChallenge, challengeView, upgradeFoodChain, undoUserAction } from './session-engine.js?v=0.6.8-1';
import {preyCodes} from './engine.js?v=0.6.8-1';
import {pairDecision} from './interaction.js?v=0.6.8-1';
import {PrisonEffects} from './effects.js?v=0.6.3-1';
import {goalGuide} from './goal-guide.js?v=0.6.8-1';
import {PrisonScene3D} from './scene3d.js?v=0.6.5-1';
import {PrisonAudio,musicTracks} from './audio.js?v=0.6.5-1';
import {challengePanel,challengeGuide,cargoChoices,deliveryStatus,patrolRoute,destinationDetail} from './challenge-ui.js?v=0.6.8-1';
import {rewardIcon,ruleText} from './reward-icons.js?v=0.6.2-1';
import {rainbowMarkup,animateRainbowArrivals} from './rainbow-ui.js?v=0.6.8-1';
import {readStartupSave,createStartupRun,saveStartupRun,startupRunSummary,startupConfigDraft,startupPhaseHelp} from './startup.js?v=0.6.8-1';
import {journalMarkup,effectsMarkup,journalDetailMarkup} from './run-journal.js?v=0.6.8-1';
import {MobilePrisonUI} from './mobile-ui.js?v=0.6.7-1';

const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,initial,selected=0,configDraft=structuredClone(DEFAULT_CONFIG),resultShown=-1;
let armed=false,pairTarget=null,pendingAction=null,uiMode=null,rewardChoice=null,busy=false,contextAnchor=null;
let startupActive=true,runStorage=null;
let journalInitial=null,journalRevision=-1,journalPinned=false,journalAnchor=null,journalHideTimer;
try{runStorage=localStorage;}catch{}
const startupSave=readStartupSave(runStorage);
let preferences={advice:false,adviceExpanded:false,motion:true,fast:false,quick:false,journalHidden:false,sidebarHidden:false};
try{const saved=JSON.parse(localStorage.getItem('ss14-prison-ui-v2')||'{}');for(const key of Object.keys(preferences))if(typeof saved[key]==='boolean')preferences[key]=saved[key];}catch{}
const mobileUI=new MobilePrisonUI({onLayout:()=>syncLayout()});
const effects=new PrisonEffects({enabled:()=>preferences.motion,fast:()=>preferences.fast});
const lockIcon='<svg class="cell-lock" viewBox="0 0 24 30" aria-hidden="true"><path d="M5 12V8a7 7 0 0 1 14 0v4h2v16H3V12zm3 0h8V8a4 4 0 0 0-8 0zm4 5a2 2 0 0 0-1 4v3h2v-3a2 2 0 0 0-1-4"/></svg>';
const eatIcon='<svg viewBox="0 0 40 36" aria-hidden="true"><path d="M3 8q17-10 34 0v12q-17 22-34 0Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M6 6h6v12H6zm11-3h6v14h-6zm11 3h6v12h-6zM11 27h5v-6h-5zm13 0h5v-6h-5z" fill="currentColor"/></svg>';
const scene3d=new PrisonScene3D({stage:document.querySelector('.game-stage'),board:$('board'),motion:()=>preferences.motion,fast:()=>preferences.fast});
const audio=new PrisonAudio({onStatus:renderAudioState});
$('audio-music-track').innerHTML='<option value="random">随机播放</option>'+musicTracks.map(track=>`<option value="${track.id}">${esc(track.title)}</option>`).join('');
function renderAudioState(status){
  const prefs=status.preferences,button=$('audio-toggle');
  button.setAttribute('aria-pressed',String(prefs.enabled));
  button.setAttribute('aria-label',prefs.enabled?'关闭声音':'开启声音');
  $('audio-toggle-label').textContent=prefs.enabled?'声音':'静音';
  $('startup-audio').textContent=prefs.enabled?'声音：开启':'声音：关闭';
  $('startup-audio').setAttribute('aria-pressed',String(prefs.enabled));
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
  $('audio-music-track').value=status.selectedMusic||'random';
  $('audio-music-track').disabled=!status.kinds.music;
  $('audio-music-refresh').disabled=!status.kinds.music;
  $('audio-current-music').textContent=status.currentMusic?`${status.musicMode==='random'?'随机 · ':''}${status.currentMusic.title}`:'等待曲库加载';
  button.dataset.musicTrack=status.currentMusic?.id||'';
  $('audio-status').textContent=!status.ready?'声音准备中…':!status.available?'声音素材待配置':status.kinds.sfx?'声音已就绪':status.kinds.voice?'配音已就绪 · 音效待配置':'环境声已就绪';
}
document.addEventListener('pointerdown',event=>audio.unlock(event),{capture:true});
document.addEventListener('keydown',event=>{if(!event.repeat)audio.unlock(event);},{capture:true});
$('audio-toggle').addEventListener('click',()=>audio.setPreferences({enabled:!audio.getStatus().preferences.enabled}));
$('startup-audio').addEventListener('click',()=>audio.setPreferences({enabled:!audio.getStatus().preferences.enabled}));
$('audio-settings-open').addEventListener('click',()=>$('audio-dialog').showModal());
$('audio-master').addEventListener('change',event=>audio.setPreferences({enabled:event.target.checked}));
for(const kind of ['sfx','voice','ambience','music']){
  $(`audio-${kind}`).addEventListener('change',event=>audio.setPreferences({[kind]:event.target.checked}));
  $(`audio-preview-${kind}`).addEventListener('click',()=>kind==='voice'?audio.voice($('audio-voice-sample').value,{priority:10,replace:true}):kind==='sfx'?audio.devour($('audio-beast-sample').value):audio.preview(kind));
}
$('audio-volume').addEventListener('input',event=>audio.setPreferences({volume:Number(event.target.value)/100}));
$('audio-music-volume').addEventListener('input',event=>audio.setPreferences({musicVolume:Number(event.target.value)/100}));
$('audio-music-track').addEventListener('change',event=>audio.setMusicTrack(event.target.value));
$('audio-music-refresh').addEventListener('click',()=>audio.refreshMusic());
renderAudioState(audio.getStatus());
let lastSelectSound=0;
function selectionSound(){const now=performance.now();if(now-lastSelectSound>100){lastSelectSound=now;audio.play('select');}}

const positions=[[1,1],[1,2],[1,3],[1,4],[1,5],[1,6],[2,6],[3,6],[4,6],[4,5],[4,4],[4,3],[4,2],[4,1],[3,1],[2,1]];
function persist(){
  startupSave.run={current:structuredClone(state),initial:structuredClone(initial)};
  const result=saveStartupRun(runStorage,startupSave.run,startupSave);
  startupSave.error=result.error;
  if(!result.saved)showError(result.error);
  return result.saved;
}
function showError(message){$('error').hidden=false;$('error').textContent=message;}
function showStartupError(message){$('startup-error').hidden=!message;$('startup-error').textContent=message;}
function renderStartup(){
  const run=startupSave.run,summary=run?startupRunSummary(run.current):null;
  $('startup-continue').hidden=!summary;
  if(summary){$('continue-run').textContent=summary.label;$('saved-run-summary').textContent=summary.detail;}
  showStartupError(startupSave.error);
}
function showStartup(){
  if(busy)return;
  startupActive=true;cancelChoice();rewardChoice=null;hideGoalGuide();hideMechanics();hideJournalDetail();
  if(state)startupSave.run={current:structuredClone(state),initial:structuredClone(initial)};
  for(const id of ['settings-dialog','result-dialog','new-dialog','event-dialog'])if($(id).open)$(id).close();
  $('game-screen').hidden=true;$('game-screen').inert=true;$('game-screen').setAttribute('aria-hidden','true');
  $('startup-screen').hidden=false;renderStartup();
  (startupSave.run?$('continue-run'):$('startup-empty')).focus({preventScroll:true});
}
function enterRun(run,{save=false,musicEntry=true}={}){
  cancelChoice();rewardChoice=null;state=upgradeFoodChain(run.current);initial=run.initial;
  save=save||state!==run.current;
  configDraft=startupConfigDraft(state);selected=0;resultShown=-1;
  for(const id of ['settings-dialog','result-dialog','new-dialog','event-dialog'])if($(id).open)$(id).close();
  startupActive=false;$('startup-screen').hidden=true;
  $('game-screen').hidden=false;$('game-screen').inert=false;$('game-screen').removeAttribute('aria-hidden');
  $('motion-status').textContent='';delete $('motion-status').dataset.lastEffect;$('error').hidden=true;
  hideJournalDetail();audio.reset();if(musicEntry)audio.enterMusic();if(save)persist();scene3d.resize();render();
  if(!state.pending.length&&isChallenge(state)&&challengeView(state).deliveryPending)openDelivery();
  if(!document.querySelector('dialog[open]'))document.querySelector('#destination-cards button,#center-actions button')?.focus({preventScroll:true});
}
let goalGuidePinned=false,goalGuideHideTimer;
function positionGoalGuide(){
  const trigger=$('goal-details-trigger').getBoundingClientRect(),tip=$('goal-tooltip'),margin=12;
  const left=innerWidth>700?trigger.right+12:trigger.left;
  const top=innerWidth>700?trigger.top:trigger.bottom+10;
  tip.style.left=`${Math.max(margin,Math.min(left,innerWidth-tip.offsetWidth-margin))}px`;
  tip.style.top=`${Math.max(margin,Math.min(top,innerHeight-tip.offsetHeight-margin))}px`;
}
function showGoalGuide(){
  if(mobileUI.active&&!$('context-actions').hidden)return;
  clearTimeout(goalGuideHideTimer);$('goal-tooltip').hidden=false;
  $('goal-details-trigger').setAttribute('aria-expanded','true');positionGoalGuide();
}
function hideGoalGuide(){
  clearTimeout(goalGuideHideTimer);goalGuidePinned=false;$('goal-tooltip').hidden=true;
  $('goal-details-trigger').setAttribute('aria-expanded','false');
}
let mechanicsHideTimer;
function showMechanics(){
  clearTimeout(mechanicsHideTimer);
  const tip=$('mechanics-tooltip'),anchor=$('lab-settings').getBoundingClientRect();
  tip.style.maxHeight=`${Math.max(80,innerHeight-anchor.bottom-24)}px`;
  tip.hidden=false;$('lab-settings').setAttribute('aria-expanded','true');
  tip.style.left=`${Math.max(12,Math.min(anchor.left,innerWidth-tip.offsetWidth-12))}px`;
  tip.style.top=`${anchor.bottom+12}px`;
}
function hideMechanics(){ $('mechanics-tooltip').hidden=true; $('lab-settings').setAttribute('aria-expanded','false'); }
$('lab-settings').addEventListener('mouseenter',showMechanics);
$('lab-settings').addEventListener('focus',showMechanics);
$('lab-settings').addEventListener('mouseleave',()=>{mechanicsHideTimer=setTimeout(hideMechanics,140);});
$('lab-settings').addEventListener('blur',()=>{mechanicsHideTimer=setTimeout(hideMechanics,140);});
$('lab-settings').addEventListener('click',hideMechanics);
$('mechanics-tooltip').addEventListener('mouseenter',()=>clearTimeout(mechanicsHideTimer));
$('mechanics-tooltip').addEventListener('mouseleave',hideMechanics);
function renderJournal(){
  if(journalInitial===initial&&journalRevision===state.revision)return;
  const old=$('run-journal').querySelector('.run-journal-scroll');
  const follow=journalInitial!==initial||!old||old.scrollHeight-old.scrollTop-old.clientHeight<40,top=old?.scrollTop||0;
  $('run-journal').innerHTML=journalMarkup(initial,state);
  $('room-effects').innerHTML=effectsMarkup(initial,state);
  const scroll=$('run-journal').querySelector('.run-journal-scroll');
  if(scroll)scroll.scrollTop=follow?scroll.scrollHeight:top;
  journalInitial=initial;journalRevision=state.revision;
}
function hideJournalDetail(){
  clearTimeout(journalHideTimer);$('journal-tooltip').hidden=true;
  journalAnchor?.setAttribute('aria-expanded','false');journalAnchor=null;journalPinned=false;
}
function showJournalDetail(anchor){
  if(startupActive||busy||!state)return;
  clearTimeout(journalHideTimer);const tip=$('journal-tooltip');
  if(anchor.dataset.journalDetail)tip.innerHTML=journalDetailMarkup(initial,state,anchor.dataset.journalDetail);
  else{const description=anchor.querySelector('.room-effect-description');tip.innerHTML=`<h3>${esc(anchor.querySelector('strong')?.textContent||'房间效果')}</h3>${description?.innerHTML||esc(anchor.getAttribute('aria-label')||'')}`;}
  if(!tip.innerHTML)return;
  journalAnchor?.setAttribute('aria-expanded','false');journalAnchor=anchor;anchor.setAttribute('aria-expanded','true');
  tip.hidden=false;const rect=anchor.getBoundingClientRect();
  const left=rect.right+12+tip.offsetWidth<=innerWidth-12?rect.right+12:Math.max(12,rect.left-tip.offsetWidth-12);
  tip.style.left=`${left}px`;tip.style.top=`${Math.max(12,Math.min(rect.top,innerHeight-tip.offsetHeight-12))}px`;
}
document.addEventListener('pointerover',event=>{const anchor=event.target.closest('[data-journal-detail],.room-effect');if(anchor&&!journalPinned)showJournalDetail(anchor);});
document.addEventListener('focusin',event=>{const anchor=event.target.closest('[data-journal-detail],.room-effect');if(anchor&&!journalPinned)showJournalDetail(anchor);});
document.addEventListener('pointerout',event=>{if(journalPinned)return;const anchor=event.target.closest('[data-journal-detail],.room-effect');if(anchor&&!anchor.contains(event.relatedTarget))journalHideTimer=setTimeout(hideJournalDetail,140);});
document.addEventListener('focusout',event=>{if(!journalPinned&&event.target.closest('[data-journal-detail],.room-effect'))journalHideTimer=setTimeout(hideJournalDetail,140);});
$('journal-tooltip').addEventListener('pointerenter',()=>clearTimeout(journalHideTimer));
$('journal-tooltip').addEventListener('pointerleave',()=>{if(!journalPinned)hideJournalDetail();});
document.addEventListener('click',event=>{if(journalPinned&&!event.target.closest('[data-journal-detail],#journal-tooltip'))hideJournalDetail();});
function scheduleGoalGuideHide(){
  clearTimeout(goalGuideHideTimer);goalGuideHideTimer=setTimeout(()=>{
    if(!goalGuidePinned&&document.activeElement!==$('goal-details-trigger'))hideGoalGuide();
  },120);
}
function renderGoalGuide(guide){
  if(isChallenge(state)){
    $('goal-tooltip').innerHTML=challengeGuide(state);
    if(!$('goal-tooltip').hidden)positionGoalGuide();
    return;
  }
  const list=(items,tag)=>`<${tag}>${items.map(item=>`<li>${esc(item)}</li>`).join('')}</${tag}>`;
  $('goal-tooltip').innerHTML=`<header class="goal-tooltip-header"><h2>培养更多绮彩</h2><span class="goal-status">${esc(guide.overall.status)}</span></header><p class="goal-explanation">${state.config.days} 个经营日内，尽可能培养更多绮彩囚犯，并完成暴乱镇压。</p><div class="goal-current">${esc(guide.overall.progress)}</div><section class="stage-goal"><h3>阶段目标 · 困兽称王 <span class="goal-status ${guide.completed?'complete':''}">${esc(guide.status)}</span></h3><p>${esc(guide.condition)}</p><p class="goal-reward">${esc(guide.reward)}</p></section><h3>${esc(guide.routeTitle)}</h3>${list(guide.steps,'ol')}${guide.boosts.length?`<h3>刑具影响</h3>${list(guide.boosts,'ul')}`:''}<div class="goal-notes">${guide.notes.map(note=>`<p>${esc(note)}</p>`).join('')}</div>`;
  if(!$('goal-tooltip').hidden)positionGoalGuide();
}
function renderRunOverview(guide,challenge){
  $('practice-overview').hidden=!!challenge;
  $('challenge-panel').hidden=!challenge;
  $('run-mode-label').textContent=challenge?'原创挑战':'基础经营';
  if(challenge)return;
  const o=guide.overall,stage=guide.completed?(state.pending.some(p=>p.kind==='tool')?'待领刑具':'已完成'):guide.status;
  $('practice-overview').innerHTML=`<h3 class="run-objective">培养更多绮彩</h3><p class="run-condition">${state.config.days} 日经营，持续养成高阶囚犯，最终镇压暴乱。</p><div class="run-counts"><div><strong>${o.currentExquisite}</strong><span>当前至臻</span></div><div><strong>${o.totalRainbow}</strong><span>累计绮彩</span></div><div><strong>${o.remainingDays}</strong><span>剩余经营日</span></div></div><p class="run-next">${esc(['riot','finished'].includes(state.phase)?o.status:o.nextTarget)}</p><div class="stage-goal"><div class="stage-heading"><span>阶段目标 · 困兽称王</span><span class="goal-status ${guide.completed?'complete':''}">${esc(stage)}</span></div><p>${esc(guide.condition)}</p><small>${esc(guide.reward)}</small></div>`;
  $('advice-objective').innerHTML=`<div class="advice-caption">${esc(o.nextTarget)} · ${esc(o.remainingDaysText)}</div><h3>${esc(guide.routeTitle)}</h3><p>${guide.steps.slice(0,2).map(esc).join('<br>')}</p>`;
}
async function act(action){
  if(busy||startupActive||!state)return;
  let next;try{next=applyAction(state,action);}catch(e){showError(e.message);return;}
  const before=state;busy=true;cancelChoice();rewardChoice=null;hideJournalDetail();
  const audioAction=audio.actionStart(action);
  if($('reward-dialog').open)$('reward-dialog').close();
  if($('delivery-dialog').open)$('delivery-dialog').close();
  if($('event-dialog').open)$('event-dialog').close();
  document.querySelector('.game-stage').setAttribute('aria-busy','true');
  $('confirm-action').disabled=true;$('confirm-reward').disabled=true;
  $('motion-status').textContent=({eat:'囚犯吞噬中…',visit:'巡监中…',reroll:'更换囚犯…',end:'本日经营结束…',choose:'获得奖励…',fight:'暴乱演算中…',scout:'侦察路线…',deliver:'押运交付…',skipDelivery:'本次合约已放弃'})[action.type]||'';
  state=next;$('error').hidden=true;persist();
  try{
    if(scene3d.ready)await scene3d.effectBefore(action,before);else await effects.before(action,before);
    audio.actionImpact(action,before,state,audioAction);
    render(true);
    await Promise.all([
      scene3d.ready?scene3d.effectAfter(before,state,action):effects.after(before,state,action),
      animateRainbowArrivals(before,state,action,{enabled:preferences.motion,fast:preferences.fast}),
    ]);
  }
  catch{ /* Visual effects cannot roll back or duplicate a committed action. */ }
  finally{busy=false;document.querySelector('.game-stage').setAttribute('aria-busy','false');render();}
  audio.actionComplete(action,before,state,audioAction);
  $('motion-status').dataset.lastEffect=action.type;
  const oldEater=action.type==='eat'?before.rooms[action.room].prisoner:null;
  const newEater=oldEater?state.rooms[action.room].prisoner||state.rainbow.find(p=>p.id===oldEater.id):null;
  $('motion-status').textContent=action.type==='eat'?`吞噬完成 · ${newEater&&oldEater.code!==newEater.code?`随机换号：${speciesOf(oldEater.code).name} → ${nameOf(newEater)}`:newEater?nameOf(newEater):'绮彩囚犯已收容'}`:action.type==='visit'?'巡监完成':action.type==='reroll'?'更换完成':action.type==='choose'?'已获得奖励':'';
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
  if(mobileUI.active){hideGoalGuide();hideMechanics();hideJournalDetail();}
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
  if(startupActive||!state)return;
  const active=onBoard(state),phase=state.phase;
  const challenge=isChallenge(state)?challengeView(state):null;
  const guide=challenge?null:goalGuide(state);
  const route=patrolRoute(state,pendingAction?.type==='visit'?pendingAction.room:null);
  $('challenge-panel').innerHTML=challenge?challengePanel(state,{selected,pendingAction,busy}):'';
  renderRunOverview(guide,challenge);
  $('advice-objective').hidden=!!challenge;
  $('run-badge').hidden=!challenge;
  $('countdown-caption').textContent=challenge?'距离经营结束':'距离暴乱剩余';
  const remains=Math.max(0,state.config.days-state.day+1);
  $('countdown').textContent=['riot','finished'].includes(phase)?'暴乱已开始':`${remains} 天`;
  $('day-tag').textContent=`第 ${state.day} / ${state.config.days} 日`;
  $('day-track').innerHTML=Array.from({length:state.config.days},(_,i)=>`<span class="${i+1<state.day?'past':i+1===state.day?'current':''}"></span>`).join('');
  $('goal-state').textContent=state.goalIndex?'已完成':'进行中';
  $('goal-name').textContent='阶段目标 · 困兽称王';
  const target=state.config.goalTiers[state.goalIndex];
  $('scene-goal').innerHTML=challenge?'':`<span class="goal-heading">经营目标</span><span class="goal-main">培养更多绮彩</span><span class="goal-condition">至臻 ${guide.overall.currentExquisite} · 绮彩 ${guide.overall.totalRainbow}<br>经营结束后镇压暴乱</span>`;
  if(challenge)$('scene-goal').innerHTML=`<span class="goal-heading">目标：押运合约</span><span class="goal-condition">完成至少 2 单，必须包含重囚<br><strong>${challenge.completed}/3 单</strong> · ${challenge.tickets} 张调度券</span>`;
  renderGoalGuide(guide);
  $('goal-description').textContent=target===undefined?'已领完本轮设定目标。继续经营，培养绮彩囚犯。':`至少一名囚犯达到${RARITIES[target]}。${state.goalIndex?'后续目标采用实验配置。':''}`;
  const maximum=Math.max(0,...active.map(p=>p.tier),...state.rainbow.map(p=>p.tier));
  $('goal-progress').style.width=`${target===undefined?100:Math.min(100,maximum/Math.max(1,target)*100)}%`;
  $('tool-count').textContent=state.tools.length;
  $('tools').innerHTML=state.tools.map(id=>{const t=TOOLS.find(x=>x.id===id);return `<div class="tool"><span class="tool-icon" aria-hidden="true">${rewardIcon(id)}</span><div><strong>${esc(t.name)}</strong><p>${ruleText(t.text)}</p></div></div>`;}).join('');
  $('tools-empty').hidden=!!state.tools.length;
  renderJournal();
  $('rainbow-count').textContent=state.rainbow.length;
  $('rainbow').innerHTML=rainbowMarkup(state);
  const edible=targets(state,selected);
  state.rooms.forEach((r,i)=>{
    const p=r.prisoner,candidate=phase==='patrol'&&state.destinations.includes(r.id)&&!state.pending.length&&(!challenge?.intel||challenge.intel.room===r.id||r.status==='open');
    const roomName=p?nameOf(p):r.status==='closed'?'未开启牢房':'空牢房';
    let node=$('board').querySelector(`[data-room="${i}"]`);
    if(!node){node=document.createElement('button');node.dataset.room=i;node.style.gridRow=positions[i][0];node.style.gridColumn=positions[i][1];$('board').append(node);}
    node.className=`room ${p?`occupied tier-${p.tier}`:''} ${candidate?'candidate':''} ${pendingAction?.type==='visit'&&pendingAction.room===i?'destination-selected':''} ${i===selected&&armed?'selected':''} ${i===pairTarget?'pair-target':''} ${edible.includes(i)&&phase==='manage'&&armed&&!challenge?.deliveryPending?'prey':''} ${route?.rooms.includes(i)?'route-step':''}`;
    node.setAttribute('aria-label',`${i+1} 号 ${roomName}${candidate?'，可巡监':''}`);node.setAttribute('aria-pressed',String((i===selected&&armed)||i===pairTarget));
    const contentKey=JSON.stringify([r,state.position===i,state.day,targets(state,i).length]);
    if(node.dataset.contentKey!==contentKey){node.innerHTML=`<span class="cell-interior" aria-hidden="true"></span><span class="room-number">${i+1}</span>${p?`<span class="cell-pedestal" aria-hidden="true"></span><span class="portrait ${p.code}"></span><span class="room-name">${speciesOf(p.code).name}</span><span class="room-rarity">${RARITIES[p.tier]}</span>${targets(state,i).length?'<span class="eat-mark" aria-label="有可吃目标">◆</span>':''}`:r.status==='closed'?`<span class="cell-door door-left" aria-hidden="true"></span><span class="cell-door door-right" aria-hidden="true"></span>${lockIcon}`:'<span class="cell-empty" aria-hidden="true">◇</span>'}${r.nest?`<span class="nest-mark">鼠巢 · ${Math.max(0,r.nest.due-state.day)} 日</span>`:''}${r.event?'<span class="event-mark">!</span>':''}${state.position===i?'<span class="current-mark" aria-label="当前位置">✧</span>':''}`;node.dataset.contentKey=contentKey;}
  });
  scene3d.sync(state,{selected,armed,pairTarget,routeRooms:route?.rooms||[]});
  const labels={patrol:['PATROL','请选择目的地',startupPhaseHelp(state)],manage:['MANAGEMENT',uiMode==='eat'?'请选择要吃的囚犯':'请进行决策',uiMode==='eat'?'选主囚犯，再选同阶可吃目标，确认吞噬。':startupPhaseHelp(state)],event:['SPECIAL EVENT',state.event?.kind==='chain'?'连锁反应':'处刑效率',''],riot:['PRISON RIOT','囚犯暴乱',''],finished:['RUN COMPLETE','经营结束','']};
  const [label,title,help]=labels[phase];
  $('phase-label').textContent=label;$('phase-title').textContent=title;$('phase-help').textContent=help;
  if(challenge?.deliveryPending){
    $('phase-title').textContent=`${challenge.contract.name} · ${challenge.earlyDelivery?'提前结算':'交付日'}`;
    $('phase-help').textContent=challenge.contract.description;
    $('center-actions').innerHTML='<button class="button gold" data-open-delivery>选择交付囚犯</button>'+(challenge.earlyDelivery?'<button class="button" data-cancel-early>继续经营</button>':'<button class="button" data-skip-delivery>放弃本次合约</button>');
  }else if(phase==='event'){
    const description=state.event.kind==='chain'?'下次移动开启路径上所有未开牢房，不触发其他效果。':'移除当前囚犯克制的下位囚犯，每名提升一阶；筛选按实验配置。';
    $('phase-help').textContent='查看事件，决定接受或略过。';
    $('center-actions').innerHTML='<button class="button gold" data-open-event>查看事件</button>';
    $('event-heading').textContent=state.event.kind==='chain'?'连锁反应':'处刑效率';
    $('event-description').textContent=state.event.kind==='chain'?'锁链将沿途的牢门牵连在一起。请典狱长决定是否开启这条巡监路线。':'囚犯已押送至中央广场。请典狱长决定处置方式。';
    $('event-art').innerHTML=rewardIcon(state.event.kind==='chain'?'keys':'saw');
    $('event-rule').innerHTML=ruleText(description);
    $('event-options').innerHTML=buttonsFor({type:'event',accept:false},'略过')+' '+(state.event.kind==='chain'||state.rooms[state.event.room].prisoner?buttonsFor({type:'event',accept:true},'确认','gold'):'');
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
  if(pendingAction?.type==='visit'){
    $('phase-title').textContent=`已选择 ${pendingAction.room+1} 号牢房`;
    if(!route)$('phase-help').textContent='点击右侧确认，前往这间牢房。';
  }
  $('board-count').textContent=`场上 ${active.length} 名 · 已开 ${state.rooms.filter(r=>r.status==='open').length} 间`;
  $('confirm-action').disabled=!pendingAction||busy||!!state.pending.length;
  $('confirm-action').dataset.intent=pendingAction?.type||'';
  $('confirm-action').setAttribute('aria-label',pendingAction?.type==='visit'?`确认前往 ${pendingAction.room+1} 号牢房`:'确认当前操作');
  $('confirm-choice-label').textContent=pendingAction?.type==='visit'?`${pendingAction.room+1} 号牢房`:'';
  $('confirm-choice-label').hidden=pendingAction?.type!=='visit';
  $('confirm-action').hidden=uiMode==='eat'&&!pendingAction;
  $('cancel-action').hidden=!(uiMode==='eat'&&!pendingAction);
  $('undo').disabled=!state.history.some(action=>action.type!=='upgradeFoodChain');
  const r=state.rooms[selected];
  $('selection-hint').textContent=r?.prisoner?`${selected+1} 号${nameOf(r.prisoner)} · ${edible.length} 个可吃目标`:`已选 ${selected+1} 号牢房`;
  renderInspect();
  $('advice-panel').hidden=!preferences.advice;
  $('advice-placeholder').hidden=preferences.advice;
  const recommendations=preferences.advice?recommend(state):[];
  $('advice').innerHTML=recommendations.map((rec,i)=>`<div class="advice-item"><div class="advice-title">${i===0?'优先参考':'备选'} · ${esc(rec.label)}</div><p>${esc(rec.reason)}</p>${buttonsFor(rec.action,'采用这个选择')}</div>`).join('')||`<p class="hint">${challenge?.restock?'先在刑具整备中选择一件，再继续经营。':'本轮已结束，可导出记录或再开一局。'}</p>`;
  $('log').innerHTML=state.log.slice(-9).reverse().map(item=>`<li><time>第 ${item.day} 日</time><span>${esc(item.text)}</span></li>`).join('');
  $('action-count').textContent=`${state.history.length} 次操作`;
  $('seed-display').textContent=`种子 ${state.seed} · ${startupSave.protectedSave||startupSave.error?'本局请导出保存':'自动保存本机'}`;
  $('edit-code').value=r.prisoner?.code??(r.status==='closed'?'closed':'empty');
  $('edit-tier').value=String(r.prisoner?.tier??0);
  $('edit-room').disabled=!!challenge||!['patrol','manage'].includes(phase)||!!state.pending.length;
  $('add-tool').disabled=!!challenge||!['patrol','manage'].includes(phase)||!!state.pending.length;
  $('open-rules').disabled=!!challenge;
  $('open-rules').title=challenge?'挑战采用固定规则；可切换复刻练习校准参数。':'';
  $('add-tool-select').innerHTML=TOOLS.filter(t=>!state.tools.includes(t.id)).map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  if(state.pending.length){
    const reward=state.pending[0],catalog=reward.kind==='tool'?TOOLS:GIFTS;
    const restock=reward.source==='challengeRestock'?challenge?.restock:null;
    $('reward-dialog').dataset.kind=reward.kind;
    $('reward-kind').textContent=restock?'合约奖励 · 原创挑战':reward.kind==='tool'?'OBJECTIVE COMPLETE':'RAINBOW PRISONER';
    $('reward-kind').hidden=!restock;
    $('reward-title').textContent=restock?'刑具整备':reward.kind==='tool'?'选择一件刑具':'典狱长的珍藏';
    $('restock-controls').hidden=!restock;
    if(restock){
      $('refresh-restock').disabled=busy||!restock.canRefresh;
      $('refresh-restock').textContent=restock.refreshUsed?'本次已刷新':'刷新刑具 · 1 调度券';
      $('restock-note').textContent=`调度券 ${challenge.tickets} · ${restock.reason} 选择一件后继续经营；选择不额外耗日。`;
    }
    if(!reward.options.includes(rewardChoice))rewardChoice=null;
    $('reward-options').innerHTML=reward.options.map(id=>{const t=catalog.find(x=>x.id===id);return `<button class="reward-choice" data-reward="${id}" aria-pressed="${id===rewardChoice}"><span class="reward-art" aria-hidden="true">${rewardIcon(id)}</span><strong class="reward-name">${esc(t.name)}</strong><p class="reward-description">${ruleText(t.text)}</p></button>`;}).join('');
    $('confirm-reward').disabled=!rewardChoice||busy;
    if(!deferDialogs&&!$('reward-dialog').open)$('reward-dialog').showModal();
  }else{ $('restock-controls').hidden=true; if($('reward-dialog').open)$('reward-dialog').close(); }
  if(phase==='event'&&!state.pending.length){
    if(!deferDialogs&&!$('event-dialog').open)$('event-dialog').showModal();
  }else if($('event-dialog').open)$('event-dialog').close();
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
  const foods=preyCodes(state,p.code).map(code=>speciesOf(code).name);
  if(p.code==='rat'&&state.tools.includes('rathead'))foods.push('硕鼠');
  $('inspect').innerHTML=`<div class="inspect-portrait portrait ${p.code} tier-${p.tier}" role="img" aria-label="${nameOf(p)}"></div><div class="inspect-name tier-${p.tier}"><strong>${speciesOf(p.code).name}</strong><span class="rarity-tag">${RARITIES[p.tier]}</span></div><p class="inspect-text">可吃同阶${foods.join('、')}。${p.code==='elephant'?'不能吃硕鼠。':''}吃后随机调整代号。</p><p class="hint">${prey.length?`可吃目标：${prey.map(target=>`${target+1}号`).join('、')}`:'当前没有可吃目标。'}<br>今日换：${state.rerolls} / ${state.config.rerollsPerDay} 次（实验设定）</p>`;
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
  $('results').innerHTML=`<h3 class="result-objective">本轮养成成果</h3><div class="result-summary"><div><strong>${onBoard(state).filter(p=>p.tier===4).length}</strong><span>当前至臻</span></div><div><strong>${state.rainbow.length}</strong><span>累计绮彩</span></div><div><strong>${state.stats.points}</strong><span>试验积分</span></div></div><p class="hint">吞噬 ${state.stats.eaten} 次 · ${RARITIES.map((name,tier)=>`${name} ${population.filter(p=>p.tier===tier).length}`).join(' · ')}</p>${state.waves.map(w=>`<div class="wave ${w.status}"><span>${['下层','中层','上层'][w.group]} · ${w.members.length} 名</span><span>${({waiting:'未演算',empty:'无囚犯',cleared:'通过',failed:'未通过'})[w.status]}${w.power!==undefined?` · ${w.power} / ${w.burden}`:''}</span></div>`).join('')}`;
  if(!$('result-dialog').open)$('result-dialog').showModal();
}
let exportUrl;
function syncNewMode(){
  const challenge=$('run-mode').value==='challenge';
  $('practice-presets').hidden=challenge;$('challenge-builds').hidden=!challenge;
  $('new-mode-help').textContent=challenge?'12 日原创挑战。补给开局配给 6 名囚犯，紧编与育鼠配给 3 名；这些囚犯是初始配置。':
    $('preset').value==='empty'?'从第 1 日、16 间未开启牢房开始，第一次巡监后才会有囚犯。':
    $('preset').value==='normal'?'基础练习预置 6 名示例囚犯，从第 1 日巡监开始。':'专项练习预置 3 名囚犯与对应刑具，从第 1 日经营阶段开始。';
  $('new-save-warning').hidden=!startupSave.run&&!startupSave.protectedSave;
  $('new-save-warning').textContent=startupSave.protectedSave?'本机存档未能验证，本次不会替换原内容；新局请导出保存。':'点击开始经营会替换当前自动存档；返回或按 Escape 会保留原局。';
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
$('run-mode').addEventListener('change',syncNewMode);$('preset').addEventListener('change',syncNewMode);
$('delivery-dialog').addEventListener('change',renderDeliveryStatus);
$('delivery-dialog').addEventListener('close',()=>{if(!busy&&!startupActive&&isChallenge(state)&&challengeView(state).earlyDelivery)act({type:'cancelEarlyDelivery'});});
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
function startDialog(mode='practice',preset='empty'){
  if(busy)return;showStartup();
  $('seed-input').value=`talos-${Date.now().toString(36)}`;
  $('run-mode').value=mode==='challenge'?'challenge':'practice';$('preset').value=preset;syncNewMode();
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
  if(startupActive||!state)return;
  if(button.dataset.journalDetail){const pinned=journalPinned&&journalAnchor===button;if(pinned)hideJournalDetail();else{showJournalDetail(button);journalPinned=true;}return;}
  if(button.id==='refresh-restock'){act({type:'refreshRestock'});return;}
  if(button.hasAttribute('data-open-event')){$('event-dialog').showModal();return;}
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
document.addEventListener('click',event=>{const inside=event.composedPath().some(node=>node.id==='context-actions'||node.matches?.('.room,#confirm-action,[data-action],.run-sidebar,.layout-toggle'));if(!$('context-actions').hidden&&!inside){cancelChoice();render();}});
$('board').addEventListener('contextmenu',event=>{const room=event.target.closest('[data-room]');if(!room||busy)return;event.preventDefault();cancelChoice();selected=Number(room.dataset.room);armed=true;render();showSingle({x:event.clientX,y:event.clientY});});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){hideGoalGuide();hideMechanics();hideJournalDetail();if(!document.querySelector('dialog[open]')){cancelChoice();render();}}});
const goalTrigger=$('goal-details-trigger'),goalTooltip=$('goal-tooltip');
goalTrigger.addEventListener('mouseenter',showGoalGuide);
goalTrigger.addEventListener('mouseleave',scheduleGoalGuideHide);
goalTooltip.addEventListener('mouseenter',showGoalGuide);
goalTooltip.addEventListener('mouseleave',scheduleGoalGuideHide);
goalTrigger.addEventListener('focus',showGoalGuide);
goalTrigger.addEventListener('blur',()=>{if(!goalGuidePinned)hideGoalGuide();});
goalTrigger.addEventListener('click',()=>{if(mobileUI.active&&!$('context-actions').hidden){cancelChoice();render();}goalGuidePinned=!goalGuidePinned;if(goalGuidePinned)showGoalGuide();else hideGoalGuide();});
document.addEventListener('click',event=>{if(!event.composedPath().includes(goalTrigger)&&!event.composedPath().includes(goalTooltip))hideGoalGuide();});
window.addEventListener('resize',()=>{if(!goalTooltip.hidden)requestAnimationFrame(positionGoalGuide);});
window.addEventListener('resize',()=>{if($('context-actions').hidden)return;requestAnimationFrame(()=>{if($('context-actions').hidden)return;const r=document.querySelector(`[data-room="${contextAnchor}"]`)?.getBoundingClientRect();if(r)positionContext({x:r.x+r.width/2,y:r.y+r.height/2});});});
$('confirm-action').addEventListener('click',()=>{if(pendingAction)act(pendingAction);});
$('cancel-action').addEventListener('click',()=>{if(!busy){audio.play('cancel');cancelChoice();render();}});
$('confirm-reward').addEventListener('click',()=>{if(rewardChoice)act({type:'choose',id:rewardChoice});});
$('new-game').addEventListener('click',showStartup);$('result-new').addEventListener('click',showStartup);
$('startup-empty').addEventListener('click',()=>startDialog('practice','empty'));
$('startup-challenge').addEventListener('click',()=>startDialog('challenge'));
$('startup-practice').addEventListener('click',()=>startDialog('practice','normal'));
$('startup-import').addEventListener('click',()=>$('import-file').click());
$('continue-run').addEventListener('click',()=>{if(startupSave.run)enterRun(structuredClone(startupSave.run));});
$('new-dialog').addEventListener('close',()=>{if(startupActive)(startupSave.run?$('continue-run'):$('startup-empty')).focus({preventScroll:true});});
$('new-form').addEventListener('submit',event=>{
  event.preventDefault();
  if(busy)return;
  try{const run=createStartupRun({seed:$('seed-input').value||'talos',mode:$('run-mode').value,preset:$('preset').value,build:document.querySelector('input[name="challenge-build"]:checked').value,config:configDraft});enterRun(run,{save:true});}
  catch(e){showStartupError(e.message);}
});
$('undo').addEventListener('click',()=>{
  if(busy)return;
  try{cancelChoice();rewardChoice=null;state=undoUserAction(initial,state);audio.reset();resultShown=-1;$('settings-dialog').close();persist();render();}
  catch(e){showError(e.message);}
});
$('export').addEventListener('click',exportCurrent);$('result-export').addEventListener('click',exportCurrent);
$('import').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async event=>{
  try{const file=event.target.files[0];if(!file)return;if(file.size>2*1024*1024)throw new Error('存档超过 2 MB');
    const run=importRun(JSON.parse(await file.text()));if(busy)throw new Error('请等待当前操作完成');enterRun(run,{save:true,musicEntry:false});
  }catch(e){const message=`导入失败：${e.message}`;if(startupActive)showStartupError(message);else showError(message);}finally{event.target.value='';}
});
$('edit-room').addEventListener('click',()=>{
  try{state=editRoom(state,selected,$('edit-code').value,Number($('edit-tier').value));$('error').hidden=true;persist();render();}catch(e){showError(e.message);}
});
$('add-tool').addEventListener('click',()=>{
  try{state=addTool(state,$('add-tool-select').value);$('error').hidden=true;persist();render();}catch(e){showError(e.message);}
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
  $('advice-summary-state').textContent=preferences.advice?'已开启':'未开启';
  $('advice-section').open=preferences.adviceExpanded;
  document.body.classList.toggle('motion-off',!preferences.motion||matchMedia('(prefers-reduced-motion: reduce)').matches);
  syncLayout();
  if(!scene3d.active)scene3d.finishTweens();
  scene3d.request();
  try{localStorage.setItem('ss14-prison-ui-v2',JSON.stringify(preferences));}catch{}
}
function syncLayout(){
  const layout=mobileUI.layout(preferences);
  const screen=$('game-screen'),journal=$('run-journal'),sidebar=$('run-sidebar');
  screen.classList.toggle('journal-hidden',layout.journalHidden);
  screen.classList.toggle('sidebar-hidden',layout.sidebarHidden);
  screen.classList.toggle('immersive',layout.journalHidden&&layout.sidebarHidden);
  journal.hidden=layout.journalHidden;sidebar.hidden=layout.sidebarHidden;
  for(const [id,hidden,label] of [['journal-toggle',layout.journalHidden,'经营记录'],['sidebar-toggle',layout.sidebarHidden,'右侧栏']]){
    const button=$(id);button.setAttribute('aria-expanded',String(!hidden));
    button.setAttribute('aria-label',`${hidden?'展开':'收起'}${label}`);
    button.querySelector('.layout-chevron').textContent=id==='journal-toggle'?(hidden?'›':'‹'):(hidden?'‹':'›');
  }
  $('immersive-toggle').checked=layout.journalHidden&&layout.sidebarHidden;
}
for(const [id,key] of [['journal-toggle','journalHidden'],['sidebar-toggle','sidebarHidden']])$(id).addEventListener('click',()=>{
  hideJournalDetail();hideGoalGuide();hideMechanics();
  if(mobileUI.togglePanel(key))return;
  preferences[key]=!preferences[key];syncPreferences();
});
$('immersive-toggle').addEventListener('change',event=>{
  hideJournalDetail();hideGoalGuide();hideMechanics();
  if(mobileUI.setImmersive(event.target.checked))return;
  preferences.journalHidden=event.target.checked;preferences.sidebarHidden=event.target.checked;syncPreferences();
});
$('lab-settings').addEventListener('click',()=>{if(!busy){cancelChoice();render();$('settings-dialog').showModal();}});
for(const [id,key] of [['advice-toggle','advice'],['advice-rail-toggle','advice'],['motion-toggle','motion'],['quick-toggle','quick']])$(id).addEventListener('change',event=>{preferences[key]=event.target.checked;syncPreferences();render();});
$('speed-toggle').addEventListener('click',()=>{preferences.fast=!preferences.fast;syncPreferences();});
$('advice-section').addEventListener('toggle',()=>{
  preferences.adviceExpanded=$('advice-section').open;
  try{localStorage.setItem('ss14-prison-ui-v2',JSON.stringify(preferences));}catch{}
});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',syncPreferences);
syncPreferences();
showStartup();
