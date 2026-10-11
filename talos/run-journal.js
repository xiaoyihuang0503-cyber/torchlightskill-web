import {applyAction,editRoom,addTool} from './session-engine.js?v=0.6.8-1';
import {SPECIES,RARITIES,TOOLS,GIFTS} from './rules.js?v=0.6.8-1';

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
  if(action.type==='upgradeFoodChain'){
    verb='规则';summary='吞噬关系更新';details.push('象吃狮、狼；狮吃狼、鼠；狼吃鼠；鼠吃象。象不能吃鼠，双方仍需同稀有度。更新不消耗天数、囚犯或调度券。');
  }else if(action.type==='visit'){
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
  elephant:'M14 3C5-1 1 6 1 14C1 22 6 27 13 24L17 22L18 12L21 14L23 24C23.5 30 30 31 31 25L28 23C28 27 26 27 26 23L25 11C24.5 6 20 4 17 5C16 4 15 3 14 3ZM12 6C5 4 3 10 4 17C5 22 8 23 12 20L13 18C8 22 6 18 6 14C6 10 8 8 12 9ZM19 8.5a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0Z',
  lion:'M16 1.5C18.4 1.5 19 3.7 20.9 3.6C23.8 2.8 25.5 4.8 25.7 7.2C28.7 7.5 30 9.8 29.3 12.2C32 14.3 31.5 17.4 29.1 18.9C30.1 21.9 28.5 24.6 25.4 24.9C24.7 28.2 22.2 29.4 19.5 28.2C17.5 31.2 14.5 31.2 12.5 28.2C9.8 29.4 7.3 28.2 6.6 24.9C3.5 24.6 1.9 21.9 2.9 18.9C.5 17.4 0 14.3 2.7 12.2C2 9.8 3.3 7.5 6.3 7.2C6.5 4.8 8.2 2.8 11.1 3.6C13 3.7 13.6 1.5 16 1.5ZM10.4 7.9C7.8 9.4 7 12.7 8.1 16.9L10.1 16.2C9.2 13.2 9.7 10.5 11.5 9.1ZM21.6 7.9C24.2 9.4 25 12.7 23.9 16.9L21.9 16.2C22.8 13.2 22.3 10.5 20.5 9.1ZM10 12.7L14 13.2L12.2 15L10 14.2ZM22 12.7L18 13.2L19.8 15L22 14.2ZM13.3 17.7H18.7L16 20.2ZM11.4 21.3C13.2 24.4 18.8 24.4 20.6 21.3L18.6 20.9C17.1 22.6 14.9 22.6 13.4 20.9Z',
  wolf:'M3 29L6 21L5 14L2 3L11 7L17 2L19 11L24 13L29.8 13.8L31 17L26 19L23.5 22L19 23L16 29ZM6 7L8 13L10 9ZM19.4 13.4L23 14.5L20 16ZM21 17.5L28.5 16.5L26 18.4L21.5 20.5Z',
  rat:'M9 23C5 23 3 25 3 27C3 29 6 30 9 28L11 26L11 29C7 31 1 30 1 26C1 22 4 20 7 20C5 16 6 12 10 10C8 6 10 2 14 2C18 2 20 6 18 10C23 10 25 13 26 15L30 18Q31 19 30 21L24 24L22 27H12L10 25ZM12 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0ZM22 15a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0Z',
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
