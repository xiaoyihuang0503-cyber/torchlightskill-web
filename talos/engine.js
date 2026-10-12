import { DEFAULT_CONFIG, SPECIES, RARITIES, TOOLS, GIFTS, FOOD_CHAIN_VERSION, validateConfig } from './rules.js?v=0.6.8-1';
import {isReference,referenceCanEat,referenceTargets,referenceLegalActions,applyReferenceAction,editReferenceRoom,addReferenceMarker,validateReferenceState,recommendReference,createReferenceGame} from './reference-rules.js?v=0.6.12-1';
export {createReferenceGame,referenceView,referenceVisibleState,addReferenceMarker,isReference} from './reference-rules.js?v=0.6.12-1';

export function seedNumber(value) {
  let n = 2166136261;
  for (const char of String(value)) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return n >>> 0 || 1;
}
function random(s) {
  let n = s.rng >>> 0;
  n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
  s.rng = n >>> 0 || 1;
  return s.rng / 4294967296;
}
function pick(s, list) { return list[Math.floor(random(s) * list.length)]; }
function shuffled(s, list) {
  const a = [...list];
  for (let i=a.length-1; i>0; i--) { const j=Math.floor(random(s)*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function weighted(s, weights) {
  let value=random(s)*weights.reduce((a,b)=>a+b,0);
  for (let i=0;i<weights.length;i++) { value-=weights[i]; if (value<0) return i; }
  return weights.length-1;
}
function log(s, text) { s.log.push({ day:s.day, text }); }
const has = (s, id) => s.tools.includes(id);
const species = code => SPECIES.find(x=>x.id===code);
export const nameOf = p => p ? `${RARITIES[p.tier]}${species(p.code).name}` : '空牢房';
export const onBoard = s => s.rooms.filter(r=>r.prisoner).map(r=>({ ...r.prisoner, room:r.id }));
function release(s, r) { r.prisoner=null; r.status=s.config.reusableRooms ? 'closed' : 'open'; r.nest=null; }
function prisoner(s, code=null, tier=null) {
  return { id:`p${s.nextId++}`, code:code ?? SPECIES[weighted(s,s.config.codeWeights)].id,
    tier:tier ?? weighted(s,s.config.rarityWeights) };
}
// Saves without a marker replay their original cycle until the recorded upgrade.
export function preyCodes(s, code) {
  const item=species(code);
  return item ? s.foodChain===FOOD_CHAIN_VERSION ? [...item.prey] : [item.legacyPrey] : [];
}
export function canEat(s, a, b) {
  if(isReference(s))return referenceCanEat(s,a,b);
  if (!a || !b || a.id===b.id || a.tier!==b.tier || a.tier>=5) return false;
  return preyCodes(s,a.code).includes(b.code) || (has(s,'rathead') && a.code==='rat' && b.code==='rat');
}
export function targets(s, room) {
  if(isReference(s))return referenceTargets(s,room);
  const a=s.rooms[room]?.prisoner;
  return s.rooms.filter(r=>canEat(s,a,r.prisoner)).map(r=>r.id);
}
function checkMilestone(s, p) {
  if (p.tier >= (s.config.goalTiers[s.goalIndex] ?? Infinity) && !s.pending.some(x=>x.kind==='tool')) {
    const choices=shuffled(s,TOOLS.filter(t=>!s.tools.includes(t.id))).slice(0,3).map(t=>t.id);
    s.goalIndex++;
    if (choices.length) s.pending.push({kind:'tool',options:choices});
    log(s,`目标达成：${nameOf(p)}，可选择刑具。`);
  }
  if (p.tier>=5) {
    const r=s.rooms.find(x=>x.prisoner?.id===p.id);
    if (!r) return;
    s.rainbow.push({...p});
    release(s,r);
    s.pending.push({kind:'gift',options:GIFTS.map(g=>g.id)});
    log(s,'绮彩囚犯单独收容，获得典狱长的珍藏。');
  }
}
function promote(s, r, amount, changeCode=true) {
  if (!r.prisoner) return;
  r.prisoner.tier=Math.min(5,r.prisoner.tier+amount);
  if (changeCode) r.prisoner.code=SPECIES[weighted(s,s.config.codeWeights)].id;
  checkMilestone(s,r.prisoner);
}
function open(s, id, primary=false, forced=null) {
  const r=s.rooms[id];
  if (!r || r.status!=='closed') return false;
  r.status='open'; r.nest=null; r.prisoner=forced ? prisoner(s,forced.code,forced.tier) : prisoner(s);
  s.stats.opened++;
  log(s,`打开 ${id+1} 号牢房：${nameOf(r.prisoner)}${primary ? '' : '（额外开门）'}。`);
  const generated={...r.prisoner};
  checkMilestone(s,r.prisoner);
  if (primary && has(s,'keys') && random(s)<0.8) {
    const neighbors=[id-1,id+1].map(n=>s.config.circularNeighbors ? (n+s.rooms.length)%s.rooms.length : n).filter(n=>n>=0&&n<s.rooms.length);
    log(s,'钥匙串触发：打开两侧未开启牢房，不继续触发其他效果。');
    for (const n of neighbors) open(s,n,false);
  }
  return generated;
}
function eat(s, eaterId, preyId) {
  const a=s.rooms[eaterId], b=s.rooms[preyId];
  if (!a || !b || !canEat(s,a.prisoner,b.prisoner)) throw new Error('当前双方不满足同阶吞噬条件');
  const beforeCount=onBoard(s).length + (s.config.rainbowCountsForMuzzle ? s.rainbow.length : 0);
  const beforeCode=a.prisoner.code, beforeName=nameOf(a.prisoner), preyName=nameOf(b.prisoner);
  const eaterIdentity=a.prisoner.id;
  release(s,b);
  let gain=1, revenge=false;
  const afterCount=onBoard(s).length+(s.config.rainbowCountsForMuzzle ? s.rainbow.length : 0);
  for (const effect of s.config.triggerOrder) {
    if (effect==='muzzle' && has(s,'muzzle') && (s.config.muzzleTiming==='before' ? beforeCount : afterCount)<=3) { gain+=2; log(s,'剧痛口枷生效：额外升 2 阶。'); }
    if (effect==='rathead' && has(s,'rathead') && beforeCode==='rat') { gain++; log(s,'鼠头串生效：额外升 1 阶。'); }
    if (effect==='saw' && has(s,'saw') && random(s)<0.25) { gain++; log(s,'锈锯触发：额外升 1 阶。'); }
    if (effect==='revenge' && has(s,'revenge') && random(s)<0.3) revenge=true;
  }
  s.stats.eaten++;
  log(s,`${beforeName}吃掉${preyName}，本次计划升 ${gain} 阶（封顶绮彩）。`);
  promote(s,a,gain,true);
  // A separately confined prisoner cannot eat on the board; this edge is explicitly provisional.
  const current=s.rooms.find(r=>r.prisoner?.id===eaterIdentity)?.prisoner;
  if (revenge && current) {
    const available=s.rooms.filter(r=>r.status==='closed');
    if (available.length) {
      const room=pick(s,available).id,foods=preyCodes(s,current.code);
      // Keep the original RNG sequence for the legacy one-target rule.
      const code=foods.length===1 ? foods[0] : pick(s,foods);
      open(s,room,false,{code,tier:current.tier});
    }
  }
  if (current) log(s,`当前变为${nameOf(current)}，已重新计算可吃目标。`);
}
function beginDay(s) {
  s.phase='patrol'; s.rerolls=0;
  for (const r of s.rooms.filter(r=>r.nest && r.nest.due<=s.day)) {
    log(s,`${r.id+1} 号鼠巢成熟（采用当前实验参数）。`);
    open(s,r.id,false,{code:'rat',tier:s.config.nestTier});
  }
  if (has(s,'nest')) {
    const rooms=s.rooms.filter(r=>r.status==='closed'&&!r.nest);
    if (rooms.length) { const r=pick(s,rooms); r.nest={due:s.day+s.config.nestDays}; log(s,`${r.id+1} 号牢房标为鼠巢，预计第 ${r.nest.due} 日成熟。`); }
  }
  const closed=s.rooms.filter(r=>r.status==='closed');
  const options=closed.length ? closed : s.rooms;
  const count=Math.max(1,s.config.destinations-(has(s,'fire')?1:0));
  s.destinations=shuffled(s,options).slice(0,count).map(r=>r.id);
}
function applyGift(s,id) {
  log(s,`获得珍藏：${GIFTS.find(g=>g.id===id).name}。`);
  if (id==='ring') for (const r of shuffled(s,s.rooms.filter(r=>r.status==='closed')).slice(0,3)) open(s,r.id,false);
  if (id==='horn') {
    const eligible=onBoard(s).filter(p=>targets(s,p.room).length).map(p=>p.id);
    for (const identity of eligible) {
      const r=s.rooms.find(x=>x.prisoner?.id===identity);
      if (!r) continue;
      const options=targets(s,r.id);
      if (options.length) eat(s,r.id,pick(s,options));
    }
  }
  if (id==='wine') {
    for (const r of s.rooms.filter(r=>r.prisoner && r.prisoner.tier<3)) promote(s,r,1,s.config.wineChangesCode);
  }
  if (id==='brand') {
    const candidates=shuffled(s,onBoard(s).filter(p=>!targets(s,p.room).length)).slice(0,4);
    for (const p of candidates) {
      const r=s.rooms[p.room];
      if (!r.prisoner || targets(s,r.id).length) continue;
      const possible=SPECIES.filter(code=>s.rooms.some(other=>canEat(s,{...r.prisoner,code:code.id},other.prisoner)));
      if (possible.length) r.prisoner.code=pick(s,possible).id;
    }
  }
}
function finalize(s) {
  s.phase='riot'; s.destinations=[]; s.event=null;
  const population=[...onBoard(s),...s.rainbow];
  s.waves=[0,1,2].map(group=>{
    const members=population.filter(p=>(p.tier<2?0:p.tier<4?1:2)===group);
    return {group, members, status:members.length?'waiting':'empty', burden:members.reduce((n,p)=>n+s.config.combatCosts[p.tier],0)};
  });
  s.combatIndex=s.waves.findIndex(w=>w.status==='waiting');
  log(s,`${s.config.days} 日经营结束，开始暴乱演算；战力和积分为实验参数。`);
  if (s.combatIndex<0) s.phase='finished';
}
export function createGame(seed='talos',config=DEFAULT_CONFIG,preset='normal') {
  const s={schema:'ss14.prison.run.v1',foodChain:FOOD_CHAIN_VERSION,seed:String(seed),rng:seedNumber(seed),config:validateConfig(config),
    day:1,phase:'patrol',position:0,rooms:[],tools:[],rainbow:[],pending:[],event:null,chain:false,
    destinations:[],rerolls:0,goalIndex:0,nextId:1,log:[],history:[],revision:0,
    stats:{opened:0,eaten:0,swaps:0,points:0},waves:[],combatIndex:-1};
  for(let i=0;i<s.config.rooms;i++) s.rooms.push({id:i,status:'closed',prisoner:null,nest:null,
    event:random(s)<s.config.eventsChance ? pick(s,['chain','execution']) : null});
  const layouts={normal:[['elephant',0],['lion',0],['wolf',1],['rat',1],['rat',2],['elephant',2]],
    muzzle:[['elephant',0],['lion',0],['wolf',3]], rat:[['rat',2],['rat',2],['elephant',3]]};
  const cells=[0,1,4,5,9,10,12,13,14,15,2,3,6,7,8,11];
  const layout=preset==='normal'?layouts.normal.slice(0,s.config.initialPrisoners):layouts[preset];
  if (!layout) throw new Error('未知练习场面');
  for (let i=0;i<(preset==='normal'?s.config.initialPrisoners:layout.length);i++) {
    const [code,tier]=layout[i] ?? [null,null],r=s.rooms[cells[i]];
    r.status='open';r.prisoner=prisoner(s,code,tier);r.event=null;
  }
  if(preset==='muzzle')s.tools=['muzzle'];
  if(preset==='rat')s.tools=['nest','rathead'];
  log(s,`新局开始：${seed}。初始场面与随机分布均为实验设定。`);
  beginDay(s);
  if(preset!=='normal')s.phase='manage';
  return s;
}
export function legalActions(s) {
  if(isReference(s))return referenceLegalActions(s);
  if(s.pending.length)return s.pending[0].options.map(id=>({type:'choose',id}));
  if(s.phase==='patrol')return s.destinations.map(room=>({type:'visit',room}));
  if(s.phase==='event')return [{type:'event',accept:false},...(s.event.kind==='chain'||s.rooms[s.event.room].prisoner ? [{type:'event',accept:true}]:[])];
  if(s.phase==='manage')return [
    ...onBoard(s).flatMap(p=>targets(s,p.room).map(prey=>({type:'eat',room:p.room,prey}))),
    ...(s.rerolls<s.config.rerollsPerDay ? onBoard(s).map(p=>({type:'reroll',room:p.room})):[]),{type:'end'}];
  if(s.phase==='riot')return [{type:'fight'}];
  return [];
}
export function upgradeFoodChain(state) {
  validateState(state);
  if(state.foodChain===FOOD_CHAIN_VERSION)return state;
  const s=structuredClone(state);
  s.foodChain=FOOD_CHAIN_VERSION;s.revision++;
  s.history.push({type:'upgradeFoodChain',version:FOOD_CHAIN_VERSION,revision:s.revision,day:s.day});
  log(s,'吞噬规则更新：象吃狮、狼；狮吃狼、鼠；狼吃鼠；鼠吃象。象不能吃鼠，双方仍需同稀有度。');
  return s;
}
export function applyAction(state,action) {
  if(isReference(state)){
    if(action?.type==='mark'){
      const {type,kind,...options}=action;return addReferenceMarker(state,kind,options);
    }
    return applyReferenceAction(state,action);
  }
  if(action?.type==='upgradeFoodChain') {
    if(Object.keys(action).length!==2||action.version!==FOOD_CHAIN_VERSION||state.foodChain!==undefined)throw new Error('吞噬规则升级操作无效');
    return upgradeFoodChain(state);
  }
  if(!legalActions(state).some(a=>Object.keys(a).length===Object.keys(action).length&&Object.keys(a).every(k=>a[k]===action[k])))throw new Error('场面已变化或该操作当前不可用');
  const s=structuredClone(state);
  s.revision++;s.history.push({...action,revision:s.revision,day:s.day});
  if(action.type==='visit') {
    const destination=action.room;
    if(s.chain) {
      let n=s.position;
      while(n!==destination){n=(n+1)%s.rooms.length;open(s,n,false);}
      s.chain=false;log(s,'连锁反应按实验顺时针路径开门，不继续触发开门效果。');
    } else open(s,destination,true);
    s.position=destination;s.phase='manage';
    const r=s.rooms[destination];
    if(r.event){s.event={kind:r.event,room:destination};s.phase='event';r.event=null;}
  }
  if(action.type==='eat')eat(s,action.room,action.prey);
  if(action.type==='reroll'){
    const r=s.rooms[action.room],beforeTier=r.prisoner.tier,beforeName=nameOf(r.prisoner);
    const weights=[...s.config.rarityWeights];if(has(s,'rope'))weights[0]=weights[1]=0;
    if(weights.every(x=>x===0))throw new Error('排除低档后没有有效权重，请调整实验参数');
    r.prisoner.tier=weighted(s,weights);r.prisoner.code=SPECIES[weighted(s,s.config.codeWeights)].id;
    if(has(s,'fire')&&(s.config.fireEligibility==='before'?beforeTier:r.prisoner.tier)<3&&random(s)<0.4)r.prisoner.tier=3;
    s.rerolls++;s.stats.swaps++;log(s,`${beforeName}换为${nameOf(r.prisoner)}。`);checkMilestone(s,r.prisoner);
  }
  if(action.type==='choose'){
    const reward=s.pending.shift();
    if(reward.kind==='tool'){s.tools.push(action.id);log(s,`获得刑具：${TOOLS.find(t=>t.id===action.id).name}。`);}
    else applyGift(s,action.id);
  }
  if(action.type==='event'){
    const event=s.event;s.event=null;s.phase='manage';
    if(!action.accept)log(s,'略过事件，保留当前场面。');
    else if(event.kind==='chain'){s.chain=true;log(s,'连锁反应生效：下次移动开启路径上的未开牢房。');}
    else{
      const r=s.rooms[event.room],code=r.prisoner.code,tier=r.prisoner.tier;
      const foods=preyCodes(s,code);
      const victims=s.rooms.filter(other=>other.id!==r.id&&other.prisoner&&foods.includes(other.prisoner.code)&&(!s.config.executionSameTier||other.prisoner.tier===tier));
      for(const victim of victims)release(s,victim);
      log(s,`处刑效率移除 ${victims.length} 名囚犯（采用当前实验筛选）。`);
      if(victims.length)promote(s,r,victims.length,true);
    }
  }
  if(action.type==='end'){
    if(s.day>=s.config.days)finalize(s);else{s.day++;beginDay(s);log(s,`第 ${s.day} 日开始。`);}
  }
  if(action.type==='fight'){
    const w=s.waves[s.combatIndex];
    const power=s.config.combatPower*(0.85+random(s)*0.3);
    w.status=power>=w.burden?'cleared':'failed';w.power=Math.round(power);
    if(w.status==='cleared')s.stats.points+=w.members.reduce((n,p)=>n+2**p.tier,0);
    log(s,`${['下层','中层','上层'][w.group]}${w.status==='cleared'?'通过':'未通过'}：实验战力 ${w.power} / 压力 ${w.burden}。`);
    if(w.status==='failed'){s.phase='finished';log(s,'本轮演算结束；积分仅用于实验比较，不表示正式失败结算。');}
    else{s.combatIndex=s.waves.findIndex(w=>w.status==='waiting');if(s.combatIndex<0)s.phase='finished';}
  }
  validateState(s);
  return s;
}

export function editRoom(state,id,code,tier) {
  if(isReference(state))return editReferenceRoom(state,id,code,tier);
  if(!['patrol','manage'].includes(state.phase)||state.pending.length)throw new Error('先完成当前事件或奖励选择，再编辑场面');
  const s=structuredClone(state),r=s.rooms[id];
  if(!r)throw new Error('牢房不存在');
  if(code==='closed'){r.status='closed';r.prisoner=null;r.nest=null;}
  else if(code==='empty'){r.status='open';r.prisoner=null;r.nest=null;}
  else{
    if(!species(code)||!Number.isInteger(tier)||tier<0||tier>5)throw new Error('囚犯参数无效');
    r.status='open';r.prisoner=prisoner(s,code,tier);r.nest=null;checkMilestone(s,r.prisoner);
  }
  s.revision++;s.history.push({type:'edit',room:id,code,tier,revision:s.revision,day:s.day});log(s,`手动校准 ${id+1} 号牢房。`);validateState(s);return s;
}
export function addTool(state,id) {
  if(isReference(state))throw new Error('公开资料未提供完整刑具卡池；请在独立的旧版实验场校准样本刑具');
  if(!TOOLS.some(t=>t.id===id)||state.tools.includes(id))throw new Error('该刑具不存在或已取得');
  if(!['patrol','manage'].includes(state.phase)||state.pending.length)throw new Error('先完成当前选择');
  const s=structuredClone(state);s.tools.push(id);s.revision++;s.history.push({type:'addTool',id,revision:s.revision,day:s.day});log(s,`实验添加刑具：${TOOLS.find(t=>t.id===id).name}。`);return s;
}
export function replay(run) {
  let s=structuredClone(run.initial);
  for(const a of run.actions){
    if(a.type==='edit')s=editRoom(s,a.room,a.code,a.tier);
    else if(a.type==='addTool')s=addTool(s,a.id);
    else{const {revision,day,...action}=a;s=applyAction(s,action);}
  }
  return s;
}
export function validateState(s) {
  if(s?.reference)return validateReferenceState(s);
  if(!s||s.schema!=='ss14.prison.run.v1')throw new Error('这不是监狱实验场存档');
  if(s.foodChain!==undefined&&s.foodChain!==FOOD_CHAIN_VERSION)throw new Error('吞噬规则版本无效');
  validateConfig(s.config);
  if(!Number.isInteger(s.day)||s.day<1||s.day>s.config.days||!['patrol','manage','event','riot','finished'].includes(s.phase))throw new Error('游戏日或阶段无效');
  if(!Number.isInteger(s.rng)||s.rng<1||s.rng>4294967295||!Number.isInteger(s.nextId)||s.nextId<1)throw new Error('随机状态无效');
  if(!Array.isArray(s.rooms)||s.rooms.length!==16||s.rooms.some((r,i)=>r.id!==i||!['open','closed'].includes(r.status)||r.status==='closed'&&r.prisoner))throw new Error('牢房状态无效');
  const population=[...s.rooms.map(r=>r.prisoner).filter(Boolean),...s.rainbow];
  if(population.some(p=>!species(p.code)||!Number.isInteger(p.tier)||p.tier<0||p.tier>5||!/^p\d+$/.test(p.id))||new Set(population.map(p=>p.id)).size!==population.length)throw new Error('囚犯状态或身份无效');
  if(s.rainbow.some(p=>p.tier!==5))throw new Error('单独收容只允许绮彩囚犯');
  if(!Array.isArray(s.tools)||new Set(s.tools).size!==s.tools.length||s.tools.some(id=>!TOOLS.some(t=>t.id===id)))throw new Error('刑具状态无效');
  if(!Array.isArray(s.pending)||s.pending.some(q=>!['tool','gift'].includes(q.kind)||!Array.isArray(q.options)||!q.options.length||q.options.some(id=>!(q.kind==='tool'?TOOLS:GIFTS).some(t=>t.id===id))))throw new Error('奖励状态无效');
  if(!Array.isArray(s.destinations)||s.destinations.some(n=>!Number.isInteger(n)||n<0||n>=16))throw new Error('目的地无效');
  if(!Array.isArray(s.log)||!Array.isArray(s.history)||!s.stats||!Number.isInteger(s.revision)||s.revision<0)throw new Error('操作记录无效');
  if(!Array.isArray(s.rainbow)||!Number.isInteger(s.position)||s.position<0||s.position>=16||!Number.isInteger(s.goalIndex)||s.goalIndex<0||!Number.isInteger(s.rerolls)||s.rerolls<0)throw new Error('经营状态无效');
  if(s.rooms.some(r=>r.nest&&(!Number.isInteger(r.nest.due)||r.nest.due<1)||r.event&&!['chain','execution'].includes(r.event)))throw new Error('鼠巢或事件状态无效');
  if(s.phase==='event'&&(!s.event||!['chain','execution'].includes(s.event.kind)||!Number.isInteger(s.event.room)||s.event.room<0||s.event.room>=16))throw new Error('待处理事件无效');
  if(['opened','eaten','swaps','points'].some(k=>!Number.isInteger(s.stats[k])||s.stats[k]<0))throw new Error('统计数值无效');
  if(!Array.isArray(s.waves)||s.phase==='riot'&&(!Number.isInteger(s.combatIndex)||!s.waves[s.combatIndex]||s.waves[s.combatIndex].status!=='waiting'))throw new Error('暴乱阶段无效');
  return true;
}

export function exportRun(current,initial) {
  validateState(current);validateState(initial);
  return {schema:'ss14.prison.export.v1',version:current.config.version,initial:structuredClone(initial),
    actions:structuredClone(current.history),current:structuredClone(current)};
}
export function importRun(payload) {
  if(!payload||payload.schema!=='ss14.prison.export.v1'||payload.version!==DEFAULT_CONFIG.version)throw new Error('存档格式或规则版本不兼容');
  if(!Array.isArray(payload.actions)||payload.actions.length>10000)throw new Error('操作记录过大或无效');
  validateState(payload.initial);validateState(payload.current);
  if(!!payload.initial.reference!==!!payload.current.reference)throw new Error('资料练习与旧实验存档模式不一致');
  const rebuilt=replay(payload);
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
  if(isReference(payload.initial)){
    if(payload.initial.reference.preset!==payload.current.reference.preset)throw new Error('资料练习场面版本不一致');
    const expected=createReferenceGame(payload.initial.seed,payload.initial.config,payload.initial.reference.preset,payload.initial.reference.version);
    if(JSON.stringify(canonical(expected))!==JSON.stringify(canonical(payload.initial)))throw new Error('资料练习初始场面必须与版本固定开局一致');
  }
  if(JSON.stringify(canonical(rebuilt))!==JSON.stringify(canonical(payload.current)))throw new Error('存档与操作记录不一致，无法可靠重放');
  return {initial:structuredClone(payload.initial),current:rebuilt};
}

// Guidance ranks visible opportunities only. It does not peek at unopened rooms or predict live profit.
export function recommend(s) {
  if(isReference(s))return recommendReference(s);
  const actions=legalActions(s);
  return actions.map(action=>{
    let score=0,label='',reason='';
    if(action.type==='eat'){
      const p=s.rooms[action.room].prisoner;let gain=1;
      const count=onBoard(s).length+(s.config.rainbowCountsForMuzzle?s.rainbow.length:0)-(s.config.muzzleTiming==='after'?1:0);
      if(has(s,'muzzle')&&count<=3)gain+=2;
      if(has(s,'rathead')&&p.code==='rat')gain++;
      const after=Math.min(5,p.tier+gain);score=20+gain*8+after*3+(after===5?35:0);
      label=`${action.room+1} 号吃 ${action.prey+1} 号`;
      reason=`同阶配对成立；按当前参数预计升 ${gain} 阶${after===5?'，可触及绮彩':''}。吃后必须重查代号。`;
    }
    if(action.type==='visit'){
      const r=s.rooms[action.room];score=r.status==='closed'?15:2;
      if(r.nest){score-=12;reason='这里有未成熟鼠巢，先比较其他目的地。';}
      if(s.chain){let n=s.position,opened=0;while(n!==r.id){n=(n+1)%16;if(s.rooms[n].status==='closed')opened++;}score+=opened*3;reason=`当前连锁路径可新增 ${opened} 间牢房；注意人数条件。`;}
      label=`前往 ${r.id+1} 号牢房`;reason||='补充未知囚犯；不开门前不预测里面是什么。';
    }
    if(action.type==='reroll'){
      const useful=targets(s,action.room).length||s.rooms.some(r=>targets(s,r.id).includes(action.room));score=useful?-20:4;
      label=`换 ${action.room+1} 号囚犯`;reason=useful?'它能参与现成配对，先保留；随机换可能破坏这一组食物。':'结果随机，可能损失现有食物；未知概率下只作为条件备选。';
    }
    if(action.type==='choose'){
      const kind=s.pending[0].kind,item=(kind==='tool'?TOOLS:GIFTS).find(x=>x.id===action.id);
      const count=onBoard(s).length;score=5;label=`选择${item.name}`;reason=item.text;
      if(action.id==='muzzle')score=count<=3?30:8;
      if(action.id==='rathead')score=onBoard(s).filter(p=>p.code==='rat').length*8;
      if(action.id==='nest')score=s.config.days-s.day>=s.config.nestDays?18:0;
      if(action.id==='keys'||action.id==='ring')score=count<4?20:5;
      if(action.id==='wine')score=onBoard(s).filter(p=>p.tier<3).length*4;
      if(action.id==='brand')score=onBoard(s).filter(p=>!targets(s,p.room).length&&onBoard(s).some(q=>q.id!==p.id&&q.tier===p.tier)).length*5;
      if(action.id==='horn')score=onBoard(s).filter(p=>targets(s,p.room).length).length*6;
      if(has(s,'muzzle')&&count>0&&count<=3&&['keys','ring'].includes(action.id)){score-=12;reason+=' 当前已有口枷，扩张可能关闭低人数条件。';}
    }
    if(action.type==='event'){score=action.accept?7:3;label=action.accept?'接受事件':'略过事件';reason='事件按当前实验参数处理；先看它会消耗哪些组合。';}
    if(action.type==='end'){score=0;label='结束今天';reason='保留现有囚犯，进入下一日。';}
    if(action.type==='fight'){score=1;label='演算下一场暴乱';reason='使用实验战力与难度参数，不代表正式通关或收益。';}
    return {action,score,label,reason};
  }).sort((a,b)=>b.score-a.score).slice(0,3);
}
