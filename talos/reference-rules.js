import {DEFAULT_CONFIG,SPECIES,RARITIES,FOOD_CHAIN_VERSION,validateConfig} from './rules.js?v=0.6.8-1';

// Public test-preview text supports these effects, but does not supply their
// spawn rates or all timing details. This profile never rewrites legacy runs.
export const LEGACY_REFERENCE_VERSION='public-preview-v1';
export const REFERENCE_VERSION='public-preview-v2';
export const isReference=s=>[LEGACY_REFERENCE_VERSION,REFERENCE_VERSION].includes(s?.reference?.version);
const hasSpecialEvents=s=>s.reference.version===REFERENCE_VERSION&&s.config.referenceParameters.specialEvents;
const eventKinds=['chain','execution'];
const codes=SPECIES.map(p=>p.id), phases=['patrol','manage','event','riot','finished'];
const exact=(a,keys)=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===keys.length&&keys.every(k=>Object.hasOwn(a,k));
const label=p=>`${RARITIES[p.tier]}${SPECIES.find(x=>x.id===p.code).name}`;
const board=s=>s.rooms.filter(r=>r.prisoner).map(r=>({...r.prisoner,room:r.id}));
function random(s){let n=s.rng>>>0;n^=n<<13;n^=n>>>17;n^=n<<5;s.rng=n>>>0||1;return s.rng/4294967296;}
function seedNumber(seed){let n=2166136261;for(const c of String(seed))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0||1;}
function weighted(s,weights){let n=random(s)*weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++){n-=weights[i];if(n<0)return i;}return weights.length-1;}
function shuffle(s,items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function inmate(s,code=null,tier=null){return {id:`p${s.nextId++}`,code:code??codes[weighted(s,s.config.codeWeights)],tier:tier??weighted(s,s.config.rarityWeights)};}
function log(s,text){s.log.push({day:s.day,text});}
function roomData(){return {hidden:null,revealedTier:null,tusk:false,scratch:false};}
const params=s=>s.config.referenceParameters;
const findInmate=(s,id)=>s.rooms.find(r=>r.prisoner?.id===id);

function clearInvalidPrey(s){
  s.reference.prey=s.reference.prey.filter(m=>{
    const lion=findInmate(s,m.lionId)?.prisoner,prey=findInmate(s,m.preyId)?.prisoner;
    const valid=lion&&prey&&lion.code===m.lionCode&&prey.code===m.preyCode;
    if(!valid)log(s,'猎物标记清除：一方离场、被替换或代号改变。');
    return valid;
  });
}
function clearRoom(s,r,status=s.config.reusableRooms?'closed':'open'){
  r.prisoner=null;r.status=status;r.nest=null;r.event=null;r.reference=roomData();
}
function collect(s,r){
  if(!r.prisoner||r.prisoner.tier<5)return;
  const p={...r.prisoner};s.rainbow.push(p);
  s.reference.treasures.push({inmateId:p.id,day:s.day,status:'catalogue_unavailable'});
  clearRoom(s,r);
  log(s,`${label(p)}单独收容；记录一次典狱长的珍藏，完整候选池待补，不模拟抽取。`);
}
function promote(s,r,gain,changeCode=false){
  if(!r?.prisoner)return;
  r.prisoner.tier=Math.min(5,r.prisoner.tier+gain);
  if(changeCode)r.prisoner.code=codes[weighted(s,s.config.codeWeights)];
  collect(s,r);
}
function ensureHidden(s,r){if(!r.reference.hidden)r.reference.hidden=inmate(s);return r.reference.hidden;}
const specialRecords=s=>s.reference.specialEventRecords??[];
function consumeChainRecord(s,status='used'){
  for(const entry of specialRecords(s).filter(e=>e.kind==='chain'&&e.status==='ready')){entry.status=status;entry.usedDay=s.day;}
}
function openRoom(s,r,forced=null){
  if(r.status!=='closed')return null;
  const event=r.event;r.event=null;
  const revealed=r.reference.revealedTier;
  r.prisoner=forced?inmate(s,forced.code,forced.tier):(r.reference.hidden??inmate(s));
  r.status='open';r.nest=null;r.reference.hidden=null;r.reference.revealedTier=null;r.reference.scratch=false;
  s.stats.opened++;log(s,`打开 ${r.id+1} 号牢房：${label(r.prisoner)}。${revealed!==null?'已清除探查/划痕显示。':''}`);
  collect(s,r);clearInvalidPrey(s);return event;
}
function beginDay(s){
  s.phase='patrol';s.rerolls=0;s.reference.reveals=0;
  // Local timing policy: each day transition is one round; tick both references
  // from the same snapshot, then clear missing/code-changed references and expire.
  clearInvalidPrey(s);
  const active=[...s.reference.prey];
  for(const m of active){
    if(m.nextDay>s.day)continue;
    const lion=findInmate(s,m.lionId),prey=findInmate(s,m.preyId);
    if(!lion||!prey)continue;
    log(s,'猎物标记日开始生效：双方各升 1 阶（练习按日切换计回合）。');
    promote(s,lion,1);promote(s,prey,1);m.remaining--;m.nextDay=s.day+1;
  }
  s.reference.prey=s.reference.prey.filter(m=>m.remaining>0);
  clearInvalidPrey(s);
  for(const r of s.rooms.filter(r=>r.nest&&r.nest.due<=s.day)){
    log(s,`${r.id+1} 号鼠巢经过两次日切换，自动打开并生成稀有硕鼠。`);
    const event=openRoom(s,r,{code:'rat',tier:2});
    if(event)log(s,`${r.id+1} 号特殊事件随鼠巢自动开门消耗，本次额外开门不触发事变（练习处理）。`);
  }
  const closed=s.rooms.filter(r=>r.status==='closed');
  s.destinations=shuffle(s,closed.length?closed:s.rooms).slice(0,s.config.destinations).map(r=>r.id);
}

export function referenceCanEat(s,a,b){
  if(!a||!b||a.id===b.id||a.tier!==b.tier||a.tier>=5)return false;
  return SPECIES.find(p=>p.id===a.code)?.prey.includes(b.code)??false;
}
export function referenceTargets(s,id){
  const p=s.rooms[id]?.prisoner;if(!p)return [];
  return s.rooms.filter(r=>referenceCanEat(s,p,r.prisoner)||(p.code==='wolf'&&p.tier<5&&r.status==='closed'&&r.reference.scratch&&r.reference.hidden?.tier===p.tier)).map(r=>r.id);
}
function mark(s,kind,{room,prey}){
  const r=s.rooms[room];if(!r)throw new Error('标记房间不存在');
  if(kind==='tusk'){
    if(!r.prisoner)throw new Error('象牙练习标记需要场上囚犯');
    r.reference.tusk=true;
  }else if(kind==='scratch'){
    if(r.status!=='closed')throw new Error('划痕标记需要关闭牢房');
    const p=ensureHidden(s,r);r.reference.scratch=true;r.reference.revealedTier=p.tier;
  }else if(kind==='nest'){
    if(r.status!=='closed')throw new Error('鼠巢练习仅标记关闭牢房');
    r.nest={due:s.day+2};
  }else if(kind==='prey'){
    const target=s.rooms[prey];
    if(!r.prisoner||r.prisoner.code!=='lion'||!target?.prisoner||!referenceCanEat(s,r.prisoner,target.prisoner))throw new Error('猎物练习需狂狮与同阶可克制目标');
    if(s.reference.prey.some(m=>m.lionId===r.prisoner.id||m.preyId===target.prisoner.id))throw new Error('该囚犯已参与猎物标记');
    s.reference.prey.push({lionId:r.prisoner.id,lionCode:'lion',preyId:target.prisoner.id,preyCode:target.prisoner.code,remaining:3,nextDay:s.day+1});
  }else throw new Error('未知资料标记');
  log(s,`练习场面添加${{tusk:'象牙',scratch:'划痕',nest:'鼠巢',prey:'猎物'}[kind]}标记；标记生成来源与概率未核实。`);
}

export function createReferenceGame(seed='reference',config=DEFAULT_CONFIG,preset='normal',version=REFERENCE_VERSION){
  if(![LEGACY_REFERENCE_VERSION,REFERENCE_VERSION].includes(version))throw new Error('资料练习版本无效');
  const p={scratchBaseGainIncluded:true,tuskIncludeReplaced:true,revealLimitPerDay:1,...(version===REFERENCE_VERSION?{specialEvents:true,executionChangesCode:false}:{}),...config.referenceParameters};
  const c=validateConfig({...config,initialPrisoners:0,eventsChance:version===REFERENCE_VERSION&&p.specialEvents?(config.eventsChance??DEFAULT_CONFIG.eventsChance):0,goalTiers:[],referenceParameters:p});
  const s={schema:'ss14.prison.run.v1',foodChain:FOOD_CHAIN_VERSION,seed:String(seed),rng:seedNumber(seed),config:c,
    day:1,phase:'patrol',position:0,rooms:[],tools:[],rainbow:[],pending:[],event:null,chain:false,destinations:[],rerolls:0,goalIndex:0,nextId:1,log:[],history:[],revision:0,
    stats:{opened:0,eaten:0,swaps:0,points:0},waves:[],combatIndex:-1,
    reference:{version,preset,prey:[],reveals:0,treasures:[],endgameInmates:[],caches:[],combat:{entered:false,ended:false,endReason:null,revivalsRecorded:0},...(version===REFERENCE_VERSION?{specialEventRecords:[]}: {})}};
  for(let i=0;i<16;i++)s.rooms.push({id:i,status:'closed',prisoner:null,nest:null,event:hasSpecialEvents(s)&&random(s)<c.eventsChance?eventKinds[Math.floor(random(s)*eventKinds.length)]:null,reference:roomData()});
  const place=(id,code,tier)=>{const r=s.rooms[id];r.status='open';r.event=null;r.prisoner=inmate(s,code,tier);};
  if(preset==='tusk'){place(0,'elephant',0);place(1,'lion',1);place(4,'wolf',1);place(5,'rat',2);place(9,'elephant',2);mark(s,'tusk',{room:0});}
  else if(preset==='prey'){place(0,'lion',0);place(1,'wolf',0);mark(s,'prey',{room:0,prey:1});}
  else if(preset==='scratch'){place(0,'wolf',1);s.rooms[1].reference.hidden=inmate(s,'elephant',1);mark(s,'scratch',{room:1});}
  else if(preset==='nest')mark(s,'nest',{room:1});
  else if(preset!=='normal')throw new Error('未知资料练习场面');
  log(s,'公开资料校准练习：文字规则依据测试预览；初始场面、随机权重、日切换与操作限制属于本地练习参数。');
  beginDay(s);if(preset!=='normal')s.phase='manage';validateReferenceState(s);return s;
}

export function referenceLegalActions(s){
  if(s.phase==='patrol')return [...s.destinations.map(room=>({type:'visit',room})),...(s.reference.reveals<params(s).revealLimitPerDay?s.rooms.filter(r=>r.status==='closed'&&r.reference.revealedTier===null).map(r=>({type:'reveal',room:r.id})):[])];
  if(s.phase==='event')return [{type:'event',accept:false},...(s.event.kind==='chain'||s.rooms[s.event.room].prisoner?[{type:'event',accept:true}]:[])];
  if(s.phase==='manage')return [...board(s).flatMap(p=>referenceTargets(s,p.room).map(prey=>({type:'eat',room:p.room,prey}))),...(s.rerolls<s.config.rerollsPerDay?board(s).map(p=>({type:'reroll',room:p.room})):[]),{type:'end'}];
  if(s.phase==='riot')return ['defeated','revival','exhausted'].map(outcome=>({type:'resolveCombat',outcome}));
  if(s.phase==='finished')return s.reference.caches.filter(c=>c.status==='lit').map(c=>({type:'openCache',tier:c.tier}));
  return [];
}
function finalize(s){
  consumeChainRecord(s,'expired');
  s.phase='riot';s.destinations=[];s.event=null;s.chain=false;s.reference.prey=[];
  const population=[...board(s).map(({room,...p})=>({...p,origin:'board'})),...s.rainbow.map(p=>({...p,origin:'confined'}))];
  s.reference.endgameInmates=population;
  s.waves=RARITIES.map((_,tier)=>{const members=population.filter(p=>p.tier===tier);return {group:tier,members,status:members.length?'waiting':'empty'};});
  s.reference.caches=RARITIES.map((_,tier)=>({tier,status:'unlit',count:population.filter(p=>p.tier===tier).length}));
  s.combatIndex=s.waves.findIndex(w=>w.status==='waiting');
  s.reference.combat.entered=true;
  log(s,'经营结束：沙盘与单独收容的囚犯按六种稀有度分组。手动记录镇压结果；没有虚构战力、复活次数或掉落。');
  if(s.combatIndex<0){s.phase='finished';s.reference.combat.ended=true;s.reference.combat.endReason='all_defeated';}
}
function record(s,state,action){s.revision=state.revision+1;s.history.push({...action,revision:s.revision,day:state.day});validateReferenceState(s);return s;}
export function applyReferenceAction(state,action){
  validateReferenceState(state);
  if(!action||!referenceLegalActions(state).some(a=>exact(action,Object.keys(a))&&Object.keys(a).every(k=>a[k]===action[k])))throw new Error('场面已变化或资料练习操作当前不可用');
  const s=structuredClone(state);
  if(action.type==='visit'){
    s.phase='manage';
    if(s.chain){
      let cursor=s.position;const path=[];
      while(cursor!==action.room){cursor=(cursor+1)%s.rooms.length;path.push(cursor);}
      // A confined inmate can leave the current-position room closed again.
      // Visiting that legal destination still opens its gate and uses the chain.
      if(!path.length)path.push(action.room);
      for(const room of path){
        const event=openRoom(s,s.rooms[room]);
        if(event)log(s,`${room+1} 号特殊事件随连锁额外开门消耗，本次不触发事变（练习处理）。`);
      }
      s.chain=false;consumeChainRecord(s);log(s,'连锁反应生效：沿顺时针练习路径开启未开牢房；划痕与鼠巢随开门清除，不触发沿途事变。');
    }else{
      const kind=openRoom(s,s.rooms[action.room]);
      if(kind){s.event={kind,room:action.room};s.phase='event';specialRecords(s).push({id:`e${specialRecords(s).length+1}`,kind,room:action.room,day:s.day,status:'pending',usedDay:null});log(s,`${action.room+1} 号牢房触发特殊事件：${kind==='chain'?'连锁反应':'处刑效率'}，等待决定。`);}
    }
    s.position=action.room;
  }
  if(action.type==='reveal'){
    const r=s.rooms[action.room],p=ensureHidden(s,r);r.reference.revealedTier=p.tier;s.reference.reveals++;
    log(s,`探查 ${r.id+1} 号牢房：仅显示${RARITIES[p.tier]}，不开门；实际稀有度仍可能受未复刻的刑具与事变影响。`);
  }
  if(action.type==='eat'){
    const eater=s.rooms[action.room],prey=s.rooms[action.prey],scratch=prey.status==='closed';
    const a={...eater.prisoner},b={...(scratch?prey.reference.hidden:prey.prisoner)};
    const gain=scratch?2+(params(s).scratchBaseGainIncluded?1:0):1;
    clearRoom(s,prey);s.stats.eaten++;
    log(s,`${label(a)}吃掉${scratch?'划痕房中同阶囚犯':label(b)}，升 ${gain} 阶${scratch?'（额外 2 阶；基础升阶叠加口径为练习参数）':''}，随后随机代号。`);
    promote(s,eater,gain,true);clearInvalidPrey(s);
  }
  if(action.type==='reroll'){
    const r=s.rooms[action.room],wasTusk=r.reference.tusk,before={...r.prisoner};
    r.prisoner=inmate(s);s.rerolls++;s.stats.swaps++;
    log(s,`${label(before)}换为${label(r.prisoner)}；生成概率使用练习权重。`);
    collect(s,r);clearInvalidPrey(s);
    if(wasTusk){
      const pool=s.rooms.filter(x=>x.prisoner&&(params(s).tuskIncludeReplaced||x.id!==r.id));
      const chosen=shuffle(s,pool).slice(0,4);
      log(s,`象牙生效：随机 ${chosen.length} 名场上囚犯各升 1 阶；不足 4 人全选，候选池仅含已开牢房（练习策略）。`);
      for(const candidate of chosen)promote(s,candidate,1);
      clearInvalidPrey(s);
    }
  }
  if(action.type==='event'){
    const event=s.event;s.event=null;s.phase='manage';
    const entry=specialRecords(s).find(e=>e.status==='pending');
    entry.status=!action.accept?'skipped':event.kind==='chain'?'ready':'used';if(entry.status==='used')entry.usedDay=s.day;
    if(!action.accept)log(s,'略过特殊事件，保留开门后的囚犯与标记。');
    else if(event.kind==='chain'){s.chain=true;log(s,'连锁反应已准备：仅下一次巡监移动沿路径开门；采用顺时针练习路线，不触发其他效果。');}
    else{
      const main=s.rooms[event.room],snapshot={...main.prisoner},foods=SPECIES.find(p=>p.id===snapshot.code).prey;
      const victims=s.rooms.filter(r=>r.id!==main.id&&r.prisoner&&r.prisoner.tier<snapshot.tier&&foods.includes(r.prisoner.code));
      // Freeze eligibility before promoting: growth must never expand this pool,
      // and concealed inmates cannot become execution targets.
      for(const victim of victims)clearRoom(s,victim);
      log(s,`处刑效率：移除 ${victims.length} 名被${label(snapshot)}克制且稀有度严格更低的场上囚犯，每名升 1 阶。`);
      if(victims.length){promote(s,main,victims.length,params(s).executionChangesCode);if(params(s).executionChangesCode)log(s,'处刑后的随机变号已按开启的练习参数执行。');}
      clearInvalidPrey(s);
    }
  }
  if(action.type==='end'){if(s.day>=s.config.days)finalize(s);else{s.day++;beginDay(s);log(s,`第 ${s.day} 日开始。`);}}
  if(action.type==='resolveCombat'){
    if(action.outcome==='revival'){s.reference.combat.revivalsRecorded++;log(s,'记录一次复活；资料未给本轮次数上限，不自动扣虚构次数。');}
    else if(action.outcome==='exhausted'){s.reference.combat.ended=true;s.reference.combat.endReason='revivals_exhausted';s.phase='finished';log(s,'记录复活次数耗尽；仅能开启此前已点亮的秘藏。');}
    else{
      const w=s.waves[s.combatIndex];w.status='cleared';s.reference.caches[w.group].status='lit';
      log(s,`记录${RARITIES[w.group]}囚犯组已击败，对应秘藏点亮；尚未开启。`);
      s.combatIndex=s.waves.findIndex(w=>w.status==='waiting');
      if(s.combatIndex<0){s.phase='finished';s.reference.combat.ended=true;s.reference.combat.endReason='all_defeated';}
    }
  }
  if(action.type==='openCache'){
    s.reference.caches[action.tier].status='opened';log(s,`开启${RARITIES[action.tier]}典狱秘藏；记录开箱状态，不模拟未公布的物品概率或兑现收益。`);
  }
  return record(s,state,action);
}

export function addReferenceMarker(state,kind,options){
  validateReferenceState(state);
  if(!['patrol','manage'].includes(state.phase))throw new Error('仅经营中可手动校准标记');
  const keys=kind==='prey'?['room','prey']:['room'];if(!exact(options,keys)||keys.some(k=>!Number.isInteger(options[k])))throw new Error('标记参数无效');
  const s=structuredClone(state);mark(s,kind,options);return record(s,state,{type:'mark',kind,...options});
}
export function editReferenceRoom(state,id,code,tier){
  validateReferenceState(state);
  if(!['patrol','manage'].includes(state.phase))throw new Error('仅经营中可校准场面');
  if(!Number.isInteger(id)||!state.rooms[id])throw new Error('牢房不存在');
  if(!['closed','empty',...codes].includes(code)||!Number.isInteger(tier)||tier<0||tier>5)throw new Error('囚犯参数无效');
  const s=structuredClone(state),r=s.rooms[id];clearRoom(s,r,code==='closed'?'closed':'open');
  if(codes.includes(code)){r.prisoner=inmate(s,code,tier);collect(s,r);}
  clearInvalidPrey(s);log(s,`手动校准 ${id+1} 号牢房，清除该房标记与旧目标引用。`);
  return record(s,state,{type:'edit',room:id,code,tier});
}

export function referenceView(s){
  validateReferenceState(s);
  const markers=[];
  for(const r of s.rooms){
    if(r.event)markers.push({room:r.id,kind:'special-event',label:'特殊事件',displayText:'打开该牢门后出现特殊事件，届时可确认或略过；当前不预告事件种类。'});
    if(r.reference.tusk)markers.push({room:r.id,kind:'tusk',label:'象牙',displayText:'换后随机最多 4 名场上囚犯各升 1 阶'});
    if(r.reference.scratch)markers.push({room:r.id,kind:'scratch',label:'划痕',hiddenTier:r.reference.revealedTier,displayText:`${RARITIES[r.reference.revealedTier]} · 同阶头狼可吞噬，额外升 2 阶`});
    else if(r.reference.revealedTier!==null)markers.push({room:r.id,kind:'reveal',label:'已探查',hiddenTier:r.reference.revealedTier,displayText:`${RARITIES[r.reference.revealedTier]} · 代号未知`});
    if(r.nest)markers.push({room:r.id,kind:'nest',label:'鼠巢',due:r.nest.due,displayText:`第 ${r.nest.due} 日自动开房 · 稀有硕鼠`});
  }
  for(const m of s.reference.prey){const lion=findInmate(s,m.lionId),prey=findInmate(s,m.preyId);markers.push({room:lion.id,linkedRoom:prey.id,kind:'prey',label:'猎物',remaining:m.remaining,due:m.nextDay,displayText:`与 ${prey.id+1} 号联动 · 剩 ${m.remaining} 次日开始升阶`});}
  return {mode:'公开资料校准练习',version:s.reference.version,preset:s.reference.preset,markers,specialEventEffects:specialRecords(s).map(e=>({...e,label:e.kind==='chain'?'连锁反应':'处刑效率',displayText:e.kind==='chain'?'下一次巡监移动沿路径打开未开牢房，不触发其他开门效果。':'移除当前囚犯克制且稀有度严格更低的场上囚犯，每名升 1 阶。'})),caches:structuredClone(s.reference.caches),combat:{...s.reference.combat,index:s.combatIndex,status:s.phase},treasures:structuredClone(s.reference.treasures),endgameInmates:structuredClone(s.reference.endgameInmates),
    assumptions:[
      '资料来自测试预览；正式上线规则和完整卡池尚未核验。',
      '开门/换人随机权重、每日换人次数、目的地选项与耗天按本地练习参数；不代表官方限制或收益。',
      `象牙候选为已开牢房${params(s).tuskIncludeReplaced?'，包含换后囚犯':''}；不足四人全选。官方候选池与不足人数策略待核。`,
      `猎物从下一日开始触发三次；双方同一快照升阶后清除失效引用。正式触发与过期顺序待核。`,
      '猎物专项练习仅允许狂狮与同阶可克制目标施加标记；这项起始资格属于本地练习限制，公开文本尚未给全。',
      `划痕按${params(s).scratchBaseGainIncluded?'基础 1 阶 + 额外 2 阶':'仅额外 2 阶'}练习，封顶绮彩；跨代号资格与叠加口径待核。`,
      '鼠巢按两次日切换成熟，提前开门清除；不按任意两次操作成熟。',
      '探查只显示稀有度；练习每日次数可配置。欺压未给基数及完整触发，不模拟概率。',
      '绮彩收容、进入终局、击败点亮与开启秘藏分别记录；不模拟战力、复活上限、真实掉落或利润。',
      ...(s.reference.version===REFERENCE_VERSION?[
        `特殊事件${params(s).specialEvents?`启用，初始房间发生率 ${Math.round(s.config.eventsChance*100)}%`:'关闭'}；发生率、两种事件等权、可略过与不额外耗日均为本地练习参数，不代表完整事变池。`,
        '连锁仅下一次移动生效，顺时针路线为练习策略；沿途事件随额外开门消耗、划痕与鼠巢清除，不连带触发其他效果。',
        `处刑使用当前代号与稀有度快照，只处理场上严格低阶克制目标；处刑后${params(s).executionChangesCode?'随机变号':'保持代号'}为练习参数，尚无完整触发顺序。`
      ]:[])
    ]};
}

// Safe input for UI/advice: neither hidden identity nor hidden code is present.
// The full state remains replayable locally, but must not be used as foresight.
export function referenceVisibleState(s){
  const view=referenceView(s);
  return {day:s.day,phase:s.phase,position:s.position,destinations:[...s.destinations],rainbow:structuredClone(s.rainbow),
    rooms:s.rooms.map(r=>({id:r.id,status:r.status,prisoner:r.prisoner?{...r.prisoner}:null,knownTier:r.reference.revealedTier,nest:r.nest?{...r.nest}:null,...(s.reference.version===REFERENCE_VERSION?{specialEvent:!!r.event}:{})})),
    ...view};
}

export function validateReferenceState(s){
  if(!isReference(s)||s.schema!=='ss14.prison.run.v1'||s.foodChain!==FOOD_CHAIN_VERSION||s.challenge)throw new Error('资料练习版本或模式无效');
  validateConfig(s.config);
  const p=params(s);
  if(!p||typeof p.scratchBaseGainIncluded!=='boolean'||typeof p.tuskIncludeReplaced!=='boolean'||!Number.isInteger(p.revealLimitPerDay)||p.revealLimitPerDay<0||p.revealLimitPerDay>16)throw new Error('资料练习参数无效');
  const v2=s.reference.version===REFERENCE_VERSION;
  if(v2&&(typeof p.specialEvents!=='boolean'||typeof p.executionChangesCode!=='boolean'))throw new Error('特殊事件练习参数无效');
  if((!v2||!p.specialEvents)&&s.config.eventsChance!==0||s.config.initialPrisoners!==0||s.config.goalTiers.length||s.tools?.length||s.pending?.length||typeof s.chain!=='boolean'||!v2&&(s.chain!==false||s.event!==null))throw new Error('资料练习不得伪造未知卡池或事件概率');
  if(s.phase==='event'){
    if(!hasSpecialEvents(s)||!exact(s.event,['kind','room'])||!eventKinds.includes(s.event.kind)||!Number.isInteger(s.event.room)||s.event.room<0||s.event.room>=16||s.event.room!==s.position||s.rooms[s.event.room].status!=='open'&&s.rooms[s.event.room].prisoner)throw new Error('待处理特殊事件无效');
  }else if(s.event!==null)throw new Error('待处理特殊事件与阶段不一致');
  if(s.chain&&(!hasSpecialEvents(s)||!['patrol','manage'].includes(s.phase)))throw new Error('连锁只能等待下一次巡监移动');
  if(!Number.isInteger(s.day)||s.day<1||s.day>s.config.days||!phases.includes(s.phase)||!Number.isInteger(s.rng)||s.rng<1||s.rng>4294967295||!Number.isInteger(s.nextId)||s.nextId<1)throw new Error('资料练习日或随机状态无效');
  if(!Array.isArray(s.rooms)||s.rooms.length!==16||s.rooms.some((r,i)=>r.id!==i||!['open','closed'].includes(r.status)||r.event!==null&&(!hasSpecialEvents(s)||!eventKinds.includes(r.event)||r.status!=='closed')||!r.reference))throw new Error('资料练习牢房无效');
  const population=[];
  for(const r of s.rooms){const d=r.reference;
    if(typeof d.tusk!=='boolean'||typeof d.scratch!=='boolean'||r.status==='closed'&&r.prisoner||r.status==='open'&&(d.hidden||d.scratch||d.revealedTier!==null)||d.tusk&&!r.prisoner||d.scratch&&!d.hidden||d.revealedTier!==null&&(!d.hidden||d.revealedTier!==d.hidden.tier)||r.nest&&(r.status!=='closed'||!Number.isInteger(r.nest.due)||r.nest.due<=s.day))throw new Error('资料标记或探查状态无效');
    if(r.prisoner)population.push(r.prisoner);if(d.hidden)population.push(d.hidden);
  }
  if(!Array.isArray(s.rainbow)||s.rainbow.some(q=>q.tier!==5))throw new Error('单独收容状态无效');population.push(...s.rainbow);
  if(population.some(q=>!codes.includes(q.code)||!Number.isInteger(q.tier)||q.tier<0||q.tier>5||!/^p\d+$/.test(q.id)||Number(q.id.slice(1))>=s.nextId)||new Set(population.map(q=>q.id)).size!==population.length||s.rooms.some(r=>r.prisoner?.tier===5))throw new Error('资料囚犯身份或稀有度无效');
  if(!Array.isArray(s.reference.prey)||s.reference.prey.some(m=>{const a=findInmate(s,m.lionId)?.prisoner,b=findInmate(s,m.preyId)?.prisoner;return !a||!b||a.id===b.id||a.code!=='lion'||m.lionCode!=='lion'||b.code!==m.preyCode||!Number.isInteger(m.remaining)||m.remaining<1||m.remaining>3||!Number.isInteger(m.nextDay)||m.nextDay!==s.day+1;}))throw new Error('猎物引用或计时无效');
  const preyIds=s.reference.prey.flatMap(m=>[m.lionId,m.preyId]);
  if(new Set(preyIds).size!==preyIds.length)throw new Error('猎物标记不得重复绑定囚犯');
  if(!Number.isInteger(s.reference.reveals)||s.reference.reveals<0||s.reference.reveals>p.revealLimitPerDay||!Number.isInteger(s.rerolls)||s.rerolls<0||s.rerolls>s.config.rerollsPerDay||!Number.isInteger(s.position)||s.position<0||s.position>=16||s.goalIndex!==0)throw new Error('资料经营次数无效');
  if(!Array.isArray(s.destinations)||new Set(s.destinations).size!==s.destinations.length||s.destinations.some(x=>!Number.isInteger(x)||x<0||x>=16)||!Array.isArray(s.log)||!Array.isArray(s.history)||!Number.isInteger(s.revision)||s.revision<0||s.history.length!==s.revision||!s.stats||['opened','eaten','swaps','points'].some(k=>!Number.isInteger(s.stats[k])||s.stats[k]<0)||s.stats.points!==0)throw new Error('资料操作记录无效');
  if(!['normal','tusk','prey','scratch','nest'].includes(s.reference.preset)||!Array.isArray(s.reference.treasures)||s.reference.treasures.length!==s.rainbow.length||s.reference.treasures.some(t=>t.status!=='catalogue_unavailable'||!s.rainbow.some(q=>q.id===t.inmateId)||!Number.isInteger(t.day)||t.day<1||t.day>s.day)||new Set(s.reference.treasures.map(t=>t.inmateId)).size!==s.reference.treasures.length)throw new Error('资料珍藏记录无效');
  if(v2){
    const records=s.reference.specialEventRecords;
    if(!Array.isArray(records)||records.some((e,i)=>
      !exact(e,['id','kind','room','day','status','usedDay'])||e.id!==`e${i+1}`||!eventKinds.includes(e.kind)||
      !Number.isInteger(e.room)||e.room<0||e.room>=16||!Number.isInteger(e.day)||e.day<1||e.day>s.day||
      !['pending','ready','used','skipped','expired'].includes(e.status)||['ready','expired'].includes(e.status)&&e.kind!=='chain'||
      (['used','expired'].includes(e.status)?!Number.isInteger(e.usedDay)||e.usedDay<e.day||e.usedDay>s.day:e.usedDay!==null)))throw new Error('特殊事件效果记录无效');
    const pending=records.filter(e=>e.status==='pending'),ready=records.filter(e=>e.status==='ready');
    if(pending.length!==(s.phase==='event'?1:0)||pending.some(e=>e.kind!==s.event.kind||e.room!==s.event.room)||ready.length!==(s.chain?1:0)||!p.specialEvents&&records.length)throw new Error('特殊事件记录与待处理效果不一致');
  }
  const c=s.reference.combat;
  if(!c||typeof c.entered!=='boolean'||typeof c.ended!=='boolean'||!Number.isInteger(c.revivalsRecorded)||c.revivalsRecorded<0||!Array.isArray(s.reference.caches)||!Array.isArray(s.reference.endgameInmates)||!Array.isArray(s.waves))throw new Error('资料终局状态无效');
  if(!c.entered){if(c.ended||c.endReason!==null||s.reference.caches.length||s.reference.endgameInmates.length||s.waves.length||s.combatIndex!==-1||!['patrol','manage',...(v2?['event']:[])].includes(s.phase))throw new Error('经营与终局状态混淆');}
  else{
    const expected=[...board(s).map(({room,...q})=>({...q,origin:'board'})),...s.rainbow.map(q=>({...q,origin:'confined'}))];
    if(JSON.stringify(expected)!==JSON.stringify(s.reference.endgameInmates)||s.waves.length!==6||s.reference.caches.length!==6)throw new Error('终局名单或六阶分组无效');
    for(let i=0;i<6;i++){const w=s.waves[i],cache=s.reference.caches[i],members=expected.filter(q=>q.tier===i);
      if(w.group!==i||JSON.stringify(w.members)!==JSON.stringify(members)||!['waiting','cleared','empty'].includes(w.status)||(!members.length)!==(w.status==='empty')||cache.tier!==i||cache.count!==members.length||!['unlit','lit','opened'].includes(cache.status)||(w.status==='cleared')!==(cache.status!=='unlit')||cache.status==='opened'&&!c.ended)throw new Error('点亮秘藏必须对应已击败分组');
    }
    const waiting=s.waves.findIndex(w=>w.status==='waiting');
    if(s.combatIndex!==waiting||c.ended!==(s.phase==='finished')||!c.ended&&s.phase!=='riot'||!c.ended&&c.endReason!==null||c.ended&&!['all_defeated','revivals_exhausted'].includes(c.endReason)||c.endReason==='all_defeated'&&waiting>=0)throw new Error('资料镇压结束状态无效');
  }
  return true;
}

export function recommendReference(s){
  return referenceLegalActions(s).filter(a=>a.type!=='reveal').map(action=>{
    if(action.type==='eat')return {action,score:20,label:`${action.room+1} 号吃 ${action.prey+1} 号`,reason:s.rooms[action.prey].reference.scratch?'同阶头狼可吞噬划痕房；叠加口径为练习参数，不能据此预测正式收益。':'同阶克制关系成立，基础升 1 阶；代号随机，随后重查配对。'};
    if(action.type==='visit')return {action,score:5,label:`前往 ${action.room+1} 号牢房`,reason:'关闭房只依据已显示的稀有度/标记；不读取隐藏代号进行推荐。'};
    if(action.type==='reroll')return {action,score:0,label:`换 ${action.room+1} 号囚犯`,reason:'代号与稀有度权重未知，当前采用练习参数。'};
    if(action.type==='end')return {action,score:-1,label:'结束今天',reason:'按练习日切换推进猎物与鼠巢计时。'};
    if(action.type==='event')return {action,score:0,label:action.accept?'确认特殊事件':'略过特殊事件',reason:s.event.kind==='chain'?'仅下一次移动沿练习路径开门，不触发沿途事变。':'只移除当前囚犯克制且严格低阶的场上目标；未开房不参与。'};
    if(action.type==='resolveCombat')return {action,score:0,label:({defeated:'记录本组击败',revival:'记录复活',exhausted:'记录复活耗尽'})[action.outcome],reason:'根据实际或练习结果手动记录，不自动预测战斗成败。'};
    return {action,score:0,label:`开启${RARITIES[action.tier]}秘藏`,reason:'仅已点亮秘藏可以开启；不抽取未公开权重的物品。'};
  }).sort((a,b)=>b.score-a.score).slice(0,3);
}
