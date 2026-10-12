import {referenceView,isReference,hasReferenceRewards,applyAction,editRoom,targets,onBoard,nameOf} from './session-engine.js?v=0.6.14-1';
import {RARITIES,SPECIES,TOOLS,GIFTS} from './rules.js?v=0.6.8-1';
import {journalSpeciesSymbol} from './run-journal.js?v=0.6.14-1';
import {rewardIcon,ruleText} from './reward-icons.js?v=0.6.2-1';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const terminal=s=>['riot','finished'].includes(s.phase);
export const REFERENCE_PRESETS=[['normal','空监狱 · 从第一扇牢门开始'],['tusk','象牙 · 换人连带升阶'],['prey','猎物 · 狂狮与目标共同成长'],['scratch','划痕 · 头狼吞噬关闭房'],['nest','鼠巢 · 两轮后稀有硕鼠']];
export const LEGACY_PRESETS=[['empty','旧版空监狱'],['normal','旧版六囚犯示例'],['muzzle','旧版口枷样本'],['rat','旧版鼠系样本']];
const markNames={tusk:'象牙',prey:'猎物',scratch:'划痕',nest:'鼠巢',reveal:'探查'};
export function specialEventBadge(className='event-mark'){
  return `<span class="${className} special-event-badge" role="img" aria-label="特殊事件 · 开门触发"><svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M16 1 29 8v16l-13 7L3 24V8Z" fill="#171008" stroke="#ffd879" stroke-width="1.6"/><path d="M16 4 26 10v12l-10 6L6 22V10Z" fill="#704218" stroke="#cb8c39" stroke-width=".8"/><path d="m13 8 1 12h4l1-12Z" fill="#fff0b0"/><circle cx="16" cy="24" r="2.1" fill="#fff0b0"/><path d="M1 3 5 6M27 6l4-3M1 29l4-3m22 0 4 3" fill="none" stroke="#e9ad4f" stroke-width="1.4"/></svg></span>`;
}
export function referenceSpecialEffectsMarkup(s){
  const effects=referenceView(s).specialEventEffects??[];
  if(!effects.length)return '';
  return effects.slice().reverse().map(effect=>{
    const pending=effect.status==='pending'&&s.phase==='event'&&s.event?.kind===effect.kind&&s.event.room===effect.room;
    const used=['used','skipped','expired'].includes(effect.status);
    const status={pending:'待处理',ready:'待巡监',used:'已使用',skipped:'已略过',expired:'已结束'}[effect.status];
    const description=effect.kind==='chain'?'下次移动开启路径上的所有未开牢房，不触发其他效果。':'移除当前囚犯克制且稀有度严格低于它的已开囚犯，每移除一名提升一阶。';
    const note=effect.kind==='chain'?'按本局练习路径处理，仅生效一次。':`按发动前代号与稀有度筛选；${s.config.referenceParameters.executionChangesCode?'处刑后变号开启（练习参数）':'处刑后保持代号'}。`;
    const tag=pending?'button':'article';
    return `<${tag}${pending?' type="button" data-open-event':''} class="room-effect ${used?'is-used':''} status-${effect.status==='ready'?'active':effect.status}" data-effect-id="${esc(effect.id)}" data-effect-status="${effect.status}" tabindex="0" aria-label="${esc(`${effect.label}，${effect.room+1}号，第${effect.day}日获得，${status}。${description} ${note}`)}"><span class="room-effect-icon" aria-hidden="true">${specialEventBadge('effect-event')}</span><span class="room-effect-copy"><strong>${esc(effect.label)}</strong><small>${effect.room+1} 号 · ${status}</small></span><span class="room-effect-description">${esc(description)}<em>${esc(note)}${effect.usedDay?` · 第${effect.usedDay}日处理`:''}</em></span></${tag}>`;
  }).join('');
}
export function referenceGoal(s){
  const view=referenceView(s),population=onBoard(s),complete=terminal(s);
  if(hasReferenceRewards(s)){
    const milestone=s.goalIndex>0,pendingTool=s.pending.some(r=>r.kind==='tool');
    const stage=milestone?(pendingTool?'待领刑具':'已领刑具'):'培养一名至臻';
    return {overall:{currentExquisite:population.filter(p=>p.tier===4).length,totalRainbow:s.rainbow.length,remainingDays:complete?0:s.config.days-s.day+1,status:complete?'经营完成':'养成中',progress:`当前至臻 ${population.filter(p=>p.tier===4).length} · 绮彩 ${s.rainbow.length}`,nextTarget:complete?'查看待镇压交接名单':s.pending.length?'先选择当前奖励，再继续经营':milestone?`培养更多绮彩 · 当前 ${s.rainbow.length} 名`:'培养一名至臻，选择一件刑具'},
      completed:milestone,status:complete?'经营完成':stage,condition:'阶段目标：至少一名囚犯达到至臻，可选择一件刑具。领取后继续培养更多绮彩。',reward:'刑具在本局持续生效；绮彩单独收容后选择典狱长的珍藏，选择后立即生效。',
      routeTitle:complete?'经营结束，准备交接':s.pending.length?'选择奖励':s.phase==='patrol'?'巡监与已知标记':'检查同阶配对与标记',
      steps:complete?['查看沙盘剩余囚犯与单独收容囚犯。','当前界面只交接经营成果。']:['打开牢房后检查同阶克制组合，培养至臻可领取刑具。','刑具获得后持续生效；吞噬变号后重新检查配对。','培养绮彩后选择珍藏；奖励选择不额外耗日，全部领取后继续经营。'],
      boosts:[...s.tools.map(id=>`已获得刑具：${TOOLS.find(t=>t.id===id).name}`),...view.markers.map(m=>`${m.room+1}号 ${m.label}：${m.displayText}`)],notes:view.assumptions};
  }
  return {overall:{currentExquisite:population.filter(p=>p.tier===4).length,totalRainbow:s.rainbow.length,remainingDays:complete?0:s.config.days-s.day+1,status:complete?'经营完成':'养成中',progress:`当前至臻 ${population.filter(p=>p.tier===4).length} · 绮彩 ${s.rainbow.length}`,nextTarget:complete?'查看待镇压交接名单':`培养更多绮彩 · 当前 ${s.rainbow.length} 名`},
    completed:false,status:complete?'经营完成':'进行中',condition:'持续培养更多绮彩囚犯，不限定只养一名至臻。',reward:'绮彩会离开沙盘单独收容，并记录一次珍藏获得；完整珍藏池未公开，不虚构抽卡。',
    routeTitle:complete?'经营结束，准备交接':s.phase==='patrol'?'巡监与已知标记':'检查同阶配对与标记',steps:complete?['查看沙盘剩余囚犯与单独收容囚犯。','正式游戏随后进入镇压；本工具本轮只练习经营。']:['打开未知牢房后，再检查同阶克制组合。','利用已出现的标记；吞噬变号后重新检查配对。','没有合适组合时可以更换或结束今天；限制与随机权重属于练习参数。'],boosts:view.markers.map(m=>`${m.room+1}号 ${m.label}：${m.displayText}`),notes:view.assumptions};
}
export function referencePairDecision(s,source,target){
  const a=s.rooms[source]?.prisoner,r=s.rooms[target];
  if(!isReference(s)||s.phase!=='manage'||s.pending.length||!a||!r||source===target)return {action:null,reverse:null,reason:s.pending.length?'请先选择当前奖励':'请先选择一名场上囚犯，再选择目标'};
  const reverse=r.prisoner&&targets(s,target).includes(source)?{type:'eat',room:target,prey:source}:null;
  if(targets(s,source).includes(target))return {action:{type:'eat',room:source,prey:target},reverse,reason:r.reference.scratch?'同阶头狼可吞噬划痕房':'同阶克制成立'};
  return {action:null,reverse,reason:r.status==='closed'?'关闭房需要划痕标记与同阶头狼；探查只揭示稀有度':'不满足同阶克制条件'};
}
export function referenceRoomBadges(s,id){
  const markers=referenceView(s).markers.filter(m=>m.kind!=='special-event'&&(m.room===id||m.kind==='prey'&&m.linkedRoom===id));
  return markers.length?`<span class="reference-room-marks">${markers.map(m=>`<span class="reference-mark-badge reference-mark-${m.kind}">${esc(m.kind==='prey'&&m.linkedRoom===id?'猎物目标':m.label)}${m.hiddenTier!==undefined?` · ${RARITIES[m.hiddenTier]}`:''}${m.kind==='nest'?` · ${Math.max(0,m.due-s.day)}日`:''}${m.kind==='prey'?` · ${m.remaining}轮`:''}</span>`).join('')}</span>`:'';
}
export function referenceRoomDescription(s,id,compact=false){
  const r=s.rooms[id],view=referenceView(s),markers=view.markers.filter(m=>m.room===id||m.kind==='prey'&&m.linkedRoom===id);
  const known=r.reference.revealedTier;
  return [r.prisoner?nameOf(r.prisoner):r.status==='closed'?known===null?'门后囚犯未知':`${RARITIES[known]} · 代号未知`:'空牢房',...markers.map(m=>compact&&m.kind==='special-event'?'特殊事件 · 开门触发':m.displayText)].join('；');
}
export function referenceMarkersMarkup(s){
  const markers=referenceView(s).markers.filter(m=>m.kind!=='special-event');return `<h3>本局标记</h3>${markers.length?markers.map(m=>`<article class="room-effect reference-marker-card" tabindex="0" aria-label="${esc(`${m.room+1}号 ${m.label} ${m.displayText}`)}"><strong>${m.room+1} 号 · ${esc(m.label)}</strong><p>${esc(m.displayText)}</p><span class="room-effect-description">${esc(m.displayText)}<em>${m.kind==='prey'?'绑定双方身份与代号；消失、替换或变号清除。施加资格与计时口径为练习策略。':m.kind==='tusk'?'本地候选为已开房，含换后囚犯；不足4名全选。':m.kind==='scratch'?'仅显示稀有度；开门清除。基础升阶是否叠加属于练习参数。':m.kind==='nest'?hasReferenceRewards(s)&&s.rooms[m.room].nest?.source==='referenceTool'?('按'+s.config.nestDays+'次日切换成熟为'+RARITIES[s.config.nestTier]+'硕鼠；提前开门清除。'):'按两次日切换成熟；提前开门清除，不按任意两次操作计数。':'仅显示稀有度，不开启牢门，不显示代号。'}</em></span></article>`).join(''):'<p class="reference-uncertainty">当前没有养成标记。在起始页可进入标记专项练习。</p>'}`;
}
export function referenceRewardEffectsMarkup(s){
  if(!hasReferenceRewards(s))return '';
  return s.reference.rewardRecords.filter(r=>r.kind==='gift').slice().reverse().map(record=>{
    const gift=GIFTS.find(g=>g.id===record.chosen),used=record.status==='chosen';
    const title=gift?.name??'典狱长的珍藏',description=gift?.text??'绮彩囚犯已单独收容，选择一项珍藏后继续经营。';
    return `<article class="room-effect ${used?'is-used':''} status-${used?'used':'pending'}" data-effect-id="${esc(record.id)}" data-effect-status="${used?'used':'pending'}" tabindex="0" aria-label="${esc(`${title}，第${record.day}日获得，${used?'已生效':'待选择'}。${description}`)}"><span class="room-effect-icon" aria-hidden="true">${rewardIcon(gift?.id??'ring')}</span><span class="room-effect-copy"><strong>${esc(title)}</strong><small>第 ${record.day} 日 · ${used?'已生效':'待选择'}</small></span><span class="room-effect-description">${ruleText(description)}<em>已展示奖励样本${used?` · 第 ${record.chosenDay} 日使用`:''}</em></span></article>`;
  }).join('');
}
export function referenceRewardStatus(s){
  if(!hasReferenceRewards(s))return {enabled:false,chosen:0,pending:0,stage:'旧局奖励未接入',text:'此局保持旧规则，只记录珍藏；新建一局可体验刑具和珍藏选择。'};
  const records=s.reference.rewardRecords,chosen=records.filter(r=>r.kind==='gift'&&r.status==='chosen').length,pending=records.filter(r=>r.kind==='gift'&&r.status==='pending').length;
  return {enabled:true,chosen,pending,stage:s.goalIndex?(s.pending.some(r=>r.kind==='tool')?'刑具待选择':'刑具已领取'):'至臻目标待完成',text:`珍藏已生效 ${chosen} 次${pending?` · 待选择 ${pending} 次`:''}。绮彩收容后选择珍藏；候选为已展示样本。`};
}
export function referenceHandoffMarkup(s){
  const v=referenceView(s),inmates=v.endgameInmates;
  return `<section class="reference-handoff"><h3>经营完成 · 待镇压囚犯</h3><p>沙盘剩余 ${onBoard(s).length} 名 · 单独收容 ${s.rainbow.length} 名 · 记录珍藏 ${v.treasures.length} 次</p><ul class="reference-handoff-list">${RARITIES.map((rarity,tier)=>{const group=inmates.filter(p=>p.tier===tier);return `<li class="reference-handoff-group tier-${tier}"><strong>${rarity} · ${group.length} 名</strong>${group.length?`<span class="reference-handoff-inmates">${group.map(p=>`<span class="reference-handoff-inmate">${journalSpeciesSymbol(p.code)}${esc(SPECIES.find(x=>x.id===p.code).name)}${p.origin==='confined'?' · 已收容':''}</span>`).join('')}</span>`:'<span class="reference-handoff-empty">无该稀有度囚犯</span>'}</li>`;}).join('')}</ul><p class="reference-uncertainty">此处只交接经营成果。正式游戏随后镇压囚犯并点亮秘藏；不在本界面模拟刷怪、战力、复活、真实物品掉落或搬砖收益。</p></section>`;
}
const referenceJournalCaches=new WeakMap();
function freezeJournalView(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freezeJournalView(item);Object.freeze(value);}return value;
}
export function referenceJournalView(initial,state){
  // Cache only derived history. Record signatures also detect imported or
  // in-place edits; a shortened/changed prefix always starts a fresh replay.
  const initialSignature=JSON.stringify(initial),signatures=state.history.map(record=>JSON.stringify(record));
  let cache=referenceJournalCaches.get(initial);
  const append=cache&&cache.initialSignature===initialSignature&&cache.signatures.length<=signatures.length&&cache.signatures.every((signature,index)=>signature===signatures[index]);
  if(append&&cache.state===state&&cache.history===state.history&&cache.revision===state.revision&&cache.signatures.length===signatures.length)return cache.view;
  if(!append)cache={initialSignature,signatures:[],replayed:structuredClone(initial),entries:[{id:'reference-start',day:1,verb:'开局',summary:'资料校准练习',details:['固定练习场面不代表官方开局；未知权重与操作限制保留为练习参数。'],codes:[...new Set(onBoard(initial).map(p=>p.code))].slice(0,2)}]};
  try{
    for(let i=cache.signatures.length;i<state.history.length;i++){
      const record=state.history[i],before=cache.replayed;
      const {revision,day,...action}=record,after=action.type==='edit'?editRoom(before,action.room,action.code,action.tier):applyAction(before,action);
      const details=after.log.slice(before.log.length).map(l=>l.text),verb=({visit:after.phase==='event'?'事变':'开门',event:action.accept?'接受':'略过',eat:'吞噬',reroll:'换人',end:after.day>before.day?'过日':'交接',reveal:'探查',mark:'标记',edit:'校准',choose:before.pending[0]?.kind==='tool'?'刑具':'珍藏'})[action.type]??'记录';
      const actors=action.type==='eat'?[before.rooms[action.room].prisoner,before.rooms[action.prey].prisoner]:action.type==='reroll'?[before.rooms[action.room].prisoner,after.rooms[action.room].prisoner]:action.type==='visit'?[after.rooms[action.room].prisoner]:onBoard(after).filter(p=>!onBoard(before).some(q=>q.id===p.id));
      cache.entries.push({id:`reference-${i}`,day:before.day,verb,summary:details[0]??'经营场面更新',details,codes:[...new Set(actors.filter(Boolean).map(p=>p.code))].slice(0,2)});cache.replayed=after;cache.signatures.push(signatures[i]);
    }
    // The renderer receives a frozen snapshot, never the mutable cache model.
    const entries=structuredClone(cache.entries),groups=[];for(const e of entries){let g=groups.find(g=>g.day===e.day);if(!g){g={day:e.day,entries:[]};groups.push(g);}g.entries.push(e);}
    cache.view=freezeJournalView({entries,groups});cache.state=state;cache.history=state.history;cache.revision=state.revision;referenceJournalCaches.set(initial,cache);return cache.view;
  }catch(error){referenceJournalCaches.delete(initial);throw error;}
}
export function referenceJournalMarkup(initial,s){const view=referenceJournalView(initial,s);return `<header class="run-journal-heading"><h2>经营记录</h2><span>${s.history.length} 次</span></header><div class="run-journal-scroll" tabindex="0" aria-label="按日滚动查看经营记录">${view.groups.map(g=>`<section class="journal-day"><h3>第 ${g.day} 日</h3><ol>${g.entries.map(e=>`<li class="journal-entry"><button type="button" class="journal-entry-trigger" data-journal-detail="${e.id}" aria-label="${esc(e.summary)}"><span class="journal-entry-icons">${e.codes.length?e.codes.map(journalSpeciesSymbol).join(''):'<span class="journal-operation-mark">◆</span>'}</span><span class="journal-entry-verb">${esc(e.verb)}</span></button></li>`).join('')}</ol></section>`).join('')}</div>`;}
export function referenceJournalDetailMarkup(initial,s,id){const e=referenceJournalView(initial,s).entries.find(e=>e.id===id);return e?`<header><span>第 ${e.day} 日 · ${esc(e.verb)}</span><h3>${esc(e.summary)}</h3></header><ul>${e.details.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>`:'';}
