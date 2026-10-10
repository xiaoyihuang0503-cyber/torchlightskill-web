import {applyAction,editRoom,addTool} from './session-engine.js?v=0.6.3-1';
import {SPECIES,RARITIES,TOOLS,GIFTS} from './rules.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const species=code=>SPECIES.find(item=>item.id===code);
const itemName=id=>(TOOLS.find(item=>item.id===id)??GIFTS.find(item=>item.id===id))?.name??'效果';
const prisonerName=p=>p?`${RARITIES[p.tier]??''}${species(p.code)?.name??'囚犯'}`:'囚犯已离场';
const visiblePopulation=state=>[...state.rooms.filter(room=>room.status==='open'&&room.prisoner).map(room=>({...room.prisoner,room:room.id})),...state.rainbow.map(p=>({...p,room:null}))];
const findPrisoner=(state,id)=>visiblePopulation(state).find(p=>p.id===id);
const iconOf=p=>p&&species(p.code)?{code:p.code,tier:p.tier,name:prisonerName(p)}:null;
const uniqueIcons=prisoners=>prisoners.filter(Boolean).map(iconOf).filter(Boolean).filter((icon,index,list)=>list.findIndex(other=>other.code===icon.code&&other.tier===icon.tier)===index).slice(0,4);
const caches=new WeakMap();

function eventDescription(kind,state){
  if(kind==='chain')return '接受后，下一次巡监沿当前实验顺时针路径打开沿途未开牢房；不继续触发开门刑具。完成这次巡监后消耗。';
  return `移除当前囚犯克制的${state.config.executionSameTier?'同阶':'所有稀有度的'}下位囚犯；每移除一名，当前囚犯提升一阶，封顶绮彩，并随机调整代号。`;
}
function newEffect(event,state,id){
  return {id,kind:event.kind,name:event.kind==='chain'?'连锁反应':'处刑效率',room:event.room??null,day:state.day,status:'pending',description:eventDescription(event.kind,state),note:'待处理 · 接受或略过',usedRevision:null};
}
function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))deepFreeze(item);Object.freeze(value);}return value;
}
function initialModel(initial){
  const known=visiblePopulation(initial),details=[known.length?`初始可见囚犯：${known.map(prisonerName).join('、')}。`:'从空监狱开始。'];
  if(initial.tools.length)details.push(`初始刑具：${initial.tools.map(itemName).join('、')}；持续生效。`);
  const effects=[];
  if(initial.event)effects.push(newEffect(initial.event,initial,'initial-event'));
  if(initial.chain)effects.push({...newEffect({kind:'chain'},initial,'initial-chain'),status:'active',note:'已接受 · 待下一次巡监'});
  return {entries:[{id:'start',day:initial.day,verb:'开局',summary:'经营开始',details,icons:uniqueIcons(known),revision:initial.revision}],effects};
}
function describeAction(before,after,action,index){
  const actionDay=before.day,logAdded=after.log.slice(before.log.length).map(item=>item.text),knownBefore=visiblePopulation(before),knownAfter=visiblePopulation(after);
  const previousIds=new Set(knownBefore.map(p=>p.id)),arrivals=knownAfter.filter(p=>!previousIds.has(p.id));
  let verb='操作',summary='场面更新',icons=[],details=[];
  if(action.type==='visit'){
    const count=after.stats.opened-before.stats.opened;verb=count?'开门':'巡监';summary=`前往 ${action.room+1} 号 · ${count?`开 ${count} 间`:'已开牢房'}`;
    icons=uniqueIcons(arrivals);details.push(`前往 ${action.room+1} 号牢房。`);
    for(const p of arrivals)details.push(`${p.room===null?'绮彩单独收容':`${p.room+1}号`}：${prisonerName(p)}。`);
    if(!count)details.push('目的地已开启，本次没有新增囚犯。');
  }else if(action.type==='eat'){
    const eater=before.rooms[action.room].prisoner,prey=before.rooms[action.prey].prisoner,result=findPrisoner(after,eater.id);
    verb='吞噬';summary=`${species(eater.code).name} 吃 ${species(prey.code).name}`;icons=uniqueIcons([eater,prey,result]);
    details.push(`${action.room+1}号 ${prisonerName(eater)} 吞噬 ${action.prey+1}号 ${prisonerName(prey)}。`);
    details.push(`结果：${prisonerName(result)}${result?.room===null?'，已单独收容':''}。吞噬后的代号会随机调整。`);
  }else if(action.type==='reroll'){
    const original=before.rooms[action.room].prisoner,result=findPrisoner(after,original.id);verb='换号';summary=`${action.room+1} 号 · ${result?prisonerName(result):'已离场'}`;icons=uniqueIcons([original,result]);
    details.push(`${prisonerName(original)} → ${prisonerName(result)}${result?.room===null?'（绮彩单独收容）':''}。今日换次数 ${after.rerolls}/${after.config.rerollsPerDay}。`);
  }else if(action.type==='event'){
    const event=before.event;verb=action.accept?'接受':'略过';summary=`${event.kind==='chain'?'连锁反应':'处刑效率'}`;
    if(event.kind==='execution'&&action.accept){
      const p=before.rooms[event.room].prisoner,result=p?findPrisoner(after,p.id):null;icons=uniqueIcons([p,result]);
      const removed=knownBefore.filter(p=>!knownAfter.some(q=>q.id===p.id));details.push(`实际移除 ${removed.length} 名：${removed.map(prisonerName).join('、')||'无'}。`);
      if(p)details.push(`当前结果：${prisonerName(result)}。`);
    }
  }else if(action.type==='choose'){
    const reward=before.pending[0],item=(reward.kind==='tool'?TOOLS:GIFTS).find(item=>item.id===action.id);
    verb=reward.kind==='tool'?'刑具':'珍藏';summary=item.name;details.push(item.text,reward.kind==='tool'?'取得后持续生效，不会在一次触发后消失。':'选择后立即使用，效果已结算。');icons=uniqueIcons(arrivals);
  }else if(action.type==='end'){
    verb=after.challenge?.deliveryPending&&!before.challenge.deliveryPending?'交付':after.day>before.day?'过日':'暴乱';summary=verb==='交付'?'合约交付待选':after.day>before.day?`第 ${after.day} 日开始`:'经营结束';
    if(after.day>before.day)details.push(`结束第 ${before.day} 日，进入第 ${after.day} 日。`);icons=uniqueIcons(arrivals);
  }else if(action.type==='scout'){
    verb='侦察';summary=`${action.room+1} 号 · −1 券`;const intel=after.challenge?.intel;
    if(intel){details.push(`已侦察：${prisonerName(intel)}。囚犯尚未入场；改变路线不退券。`);icons=uniqueIcons([intel]);}
  }else if(action.type==='deliver'){
    const cargo=[...action.rooms.map(room=>before.rooms[room].prisoner),...action.rainbowIds.map(id=>before.rainbow.find(p=>p.id===id))].filter(Boolean),cost=before.challenge.tickets-after.challenge.tickets;
    verb='押运';summary=`交付 ${cargo.length} 名 · −${cost} 券`;icons=uniqueIcons(cargo);details.push(`交付囚犯：${cargo.map(prisonerName).join('、')}。剩余调度券 ${after.challenge.tickets}。`);
  }else if(action.type==='refreshRestock'){
    verb='整备';summary='刷新刑具 · −1 券';details.push(`可选刑具：${after.challenge.restock.options.map(itemName).join('、')}。本次刷新已用，调度券 ${after.challenge.tickets}。`);
  }else if(action.type==='skipDelivery'){
    verb='放弃';summary='本单合约未完成';details.push('保留当前囚犯与调度券；这份合约记为未完成。');
  }else if(action.type==='openEarlyDelivery'){
    verb='交付';summary='打开提前交付';details.push('打开重囚交付选择；尚未交付，也未消耗调度券。');
  }else if(action.type==='cancelEarlyDelivery'){
    verb='返回';summary='取消提前交付';details.push('恢复本日经营；不消耗调度券。');
  }else if(action.type==='fight'){
    verb='镇压';const wave=after.waves[before.combatIndex];summary=`${['下层','中层','上层'][wave.group]} · ${wave.status==='cleared'?'通过':'未通过'}`;icons=uniqueIcons(wave.members);details.push(`实验战力 ${wave.power} / 压力 ${wave.burden}。`);
  }else if(action.type==='edit'){
    verb='校准';summary=`${action.room+1} 号 · 实验`;icons=uniqueIcons([after.rooms[action.room].prisoner]);details.push(`手动校准为${action.code==='closed'?'未开启':action.code==='empty'?'空牢房':prisonerName(after.rooms[action.room].prisoner)}。`);
  }else if(action.type==='addTool'){
    verb='校准';summary=itemName(action.id);details.push('实验添加刑具，持续生效。');
  }
  details.push(...logAdded.filter(text=>!details.includes(text)));
  return {id:`action-${index}`,day:actionDay,revision:after.revision,verb,summary,icons,details};
}
function updateEffects(model,before,after,action,index){
  if(action.type==='visit'&&before.chain){
    for(const effect of model.effects.filter(effect=>effect.kind==='chain'&&effect.status==='active')){
      effect.status='used';effect.usedRevision=after.revision;effect.note=`第 ${before.day} 日巡监已使用 · 实际开 ${after.stats.opened-before.stats.opened} 间`;
    }
  }
  if(after.event&&(!before.event||action.type==='visit'))model.effects.push(newEffect(after.event,after,`event-${index}`));
  if(action.type==='event'&&before.event){
    const effect=[...model.effects].reverse().find(effect=>effect.status==='pending'&&effect.kind===before.event.kind&&effect.room===before.event.room);
    if(effect){
      if(!action.accept){effect.status='skipped';effect.usedRevision=after.revision;effect.note='已略过 · 没有使用，也未改变场面';}
      else if(before.event.kind==='chain'){effect.status='active';effect.note='已接受 · 待下一次巡监，尚未消耗';}
      else{const beforeIds=visiblePopulation(before),afterIds=new Set(visiblePopulation(after).map(p=>p.id));effect.status='used';effect.usedRevision=after.revision;effect.note=`已使用 · 移除 ${beforeIds.filter(p=>!afterIds.has(p.id)).length} 名囚犯`;}
    }
  }
  if(action.type==='choose'&&before.pending[0]?.kind==='gift'){
    const item=GIFTS.find(item=>item.id===action.id);model.effects.push({id:`gift-${index}`,kind:'gift',itemId:item.id,name:item.name,room:null,day:before.day,status:'used',description:item.text,note:'珍藏已使用 · 选择时立即结算',usedRevision:after.revision});
  }
  // An ended run cannot keep an accepted route looking available.
  if(['riot','finished'].includes(after.phase)){for(const effect of model.effects.filter(effect=>effect.status==='active')){effect.status='expired';effect.note='本轮已结束 · 未再触发巡监';}}
}
function applyRecorded(state,record){
  if(record.type==='edit')return editRoom(state,record.room,record.code,record.tier);
  if(record.type==='addTool')return addTool(state,record.id);
  const {revision,day,...action}=record;return applyAction(state,action);
}

/** Derive public history only through committed, replayable actions. Never inspect hidden room events. */
export function journalView(initial,state){
  if(!initial||!state)return deepFreeze({entries:[],effects:[],groups:[],revision:0,error:null});
  const initialSignature=JSON.stringify(initial),signatures=state.history.map(action=>JSON.stringify(action));
  let cache=caches.get(initial);
  if(cache?.state===state&&cache.initialSignature===initialSignature&&cache.signatures.length===signatures.length&&cache.signatures.every((signature,index)=>signature===signatures[index]))return cache.view;
  const append=cache&&cache.initialSignature===initialSignature&&cache.signatures.length<=signatures.length&&cache.signatures.every((signature,index)=>signature===signatures[index]);
  if(!append){cache={initialSignature,signatures:[],replayed:structuredClone(initial),model:initialModel(initial)};}
  let error=null;
  try{
    for(let index=cache.signatures.length;index<state.history.length;index++){
      const action=state.history[index],before=cache.replayed,after=applyRecorded(before,action);
      cache.model.entries.push(describeAction(before,after,action,index));updateEffects(cache.model,before,after,action,index);cache.replayed=after;cache.signatures.push(signatures[index]);
    }
  }catch{error='这段记录无法可靠重放，请先核对存档。';}
  const entries=structuredClone(cache.model.entries),effects=structuredClone(cache.model.effects);
  const groups=[];for(const entry of entries){let group=groups.find(group=>group.day===entry.day);if(!group){group={day:entry.day,entries:[]};groups.push(group);}group.entries.push(entry);}
  cache.view=deepFreeze({entries,effects,groups,revision:state.revision,error});cache.state=state;caches.set(initial,cache);return cache.view;
}

function iconMarkup(icon){return `<span class="journal-beast portrait ${escape(icon.code)} tier-${icon.tier}" role="img" aria-label="${escape(icon.name)}"></span>`;}
// Rail symbols are one-color silhouettes; detailed portraits remain in the floating panel.
const beastSilhouettes={
  elephant:'M10 8C6 3 1 7 1 15s4 12 9 9l2-3 1 5c0 6 10 6 13 0l-4-3c-1 5-4 5-4 1l1-6 3 5c6 4 9-1 9-8s-5-12-9-7c-3-5-9-5-12 0Z',
  lion:'M16 2 21 4 26 4 28 9 31 13 29 19 29 24 24 27 20 31 15 29 10 31 6 27 2 24 3 18 1 13 5 9 6 4 11 4ZM8 13l6 2-5 2Zm16 0-6 2 5 2Zm-12 7h8l-4 5Z',
  wolf:'M3 2l10 5h6l10-5-2 16-4 6-7 6-7-6-4-6ZM8 12l6 3-5 1Zm16 0-6 3 5 1ZM13 22h6l-3 3Z',
  rat:'M9 12C1 12 1 2 7 2c4 0 7 4 5 8h8c-2-4 1-8 5-8 6 0 6 10-2 10l1 8-8 10-8-10ZM9 16a2 2 0 1 0 4 0 2 2 0 1 0-4 0Zm10 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0Zm-6 8h6l-3 3Z',
};
function railIconMarkup(icon){return `<span class="journal-symbol journal-symbol-${escape(icon.code)}" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false" aria-hidden="true"><path fill-rule="evenodd" d="${beastSilhouettes[icon.code]??''}"/></svg></span>`;}
function entryMarkup(entry){
  const detail=[`第 ${entry.day} 日 · ${entry.summary}`,...entry.details].join('\n');
  return `<li class="journal-entry" data-journal-entry="${escape(entry.id)}"><button type="button" class="journal-entry-trigger" data-journal-detail="${escape(entry.id)}" aria-label="${escape(detail)}"><span class="journal-entry-icons" aria-hidden="true">${entry.icons.length?entry.icons.slice(0,2).map(railIconMarkup).join(''):'<span class="journal-operation-mark">◆</span>'}</span><span class="journal-entry-verb">${escape(entry.verb)}</span></button></li>`;
}
/** Inner HTML for an independent narrow rail, not an overlay over the 16-room scene. */
export function journalMarkup(initial,state){
  const view=journalView(initial,state);return `<header class="run-journal-heading"><h2>经营记录</h2><span>${Math.max(0,view.entries.length-1)} 次</span></header><div class="run-journal-scroll" tabindex="0" aria-label="按日滚动查看经营记录">${view.groups.map(group=>`<section class="journal-day" data-journal-day="${group.day}"><h3>第 ${group.day} 日</h3><ol>${group.entries.map(entryMarkup).join('')}</ol></section>`).join('')}${view.error?`<p class="journal-warning">${escape(view.error)}</p>`:''}</div>`;
}
/** A shared floating details panel lets keyboard/touch read entries outside the narrow scroll rail. */
export function journalDetailMarkup(initial,state,id){
  const entry=journalView(initial,state).entries.find(entry=>entry.id===id);if(!entry)return '';
  return `<header><span>第 ${entry.day} 日 · ${escape(entry.verb)}</span><h3>${escape(entry.summary)}</h3></header>${entry.icons.length?`<div class="journal-detail-icons">${entry.icons.map(iconMarkup).join('')}</div>`:''}<ul>${entry.details.map(detail=>`<li>${escape(detail)}</li>`).join('')}</ul>`;
}
/** Inner HTML below the existing tools. Only revealed room events and selected gifts appear here. */
export function effectsMarkup(initial,state){
  const effects=journalView(initial,state).effects;if(!effects.length)return '<p class="room-effects-empty">开门事件将在这里保留</p>';
  return effects.slice().reverse().map(effect=>{
    const used=['used','skipped','expired'].includes(effect.status),label=[effect.name,effect.room===null?'':`${effect.room+1}号牢房`,`第 ${effect.day} 日获得`,effect.description,effect.note].filter(Boolean).join('\n');
    const isPending=effect.status==='pending'&&state.phase==='event'&&state.event?.kind===effect.kind&&state.event.room===effect.room;
    const tag=isPending?'button':'article',icon=effect.kind==='chain'?'⛓':effect.kind==='execution'?'╱':GIFTS.find(item=>item.id===effect.itemId)?.icon??'◇';
    return `<${tag}${isPending?' type="button" data-open-event':''} class="room-effect ${used?'is-used':''} status-${effect.status}" data-effect-id="${escape(effect.id)}" data-effect-status="${effect.status}" tabindex="0" aria-label="${escape(label)}"><span class="room-effect-icon" aria-hidden="true">${escape(icon)}</span><span class="room-effect-copy"><strong>${escape(effect.name)}</strong><small>${effect.room===null?(effect.kind==='gift'?'珍藏':'连锁'):`${effect.room+1} 号`} · ${effect.status==='pending'?'待处理':effect.status==='active'?'待巡监':effect.status==='skipped'?'已略过':effect.status==='expired'?'已结束':'已使用'}</small></span><span class="room-effect-description" role="tooltip">${escape(effect.description)}<em>${escape(effect.note)}</em></span></${tag}>`;
  }).join('');
}
