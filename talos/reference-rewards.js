import {TOOLS,GIFTS,SPECIES} from './rules.js?v=0.6.8-1';

// Known preview samples only. The host owns rooms, markers, events and RNG.
// Callback hooks avoid importing either engine and keep those states intact.
export const hasReferenceRewards=s=>s?.reference?.version==='public-preview-v3';
const ids=items=>items.map(item=>item.id);
const toolIds=ids(TOOLS),giftIds=ids(GIFTS);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const identity=(id,s)=>typeof id==='string'&&/^p\d+$/.test(id)&&Number(id.slice(1))>=1&&Number(id.slice(1))<s.nextId;
const owns=(s,id)=>s.tools.includes(id);
export function referenceRerollBlockReason(s){
  return hasReferenceRewards(s)&&owns(s,'rope')&&s.config.rarityWeights.slice(2).every(weight=>weight===0)?'绞首绳排除低阶后没有有效权重，请在新局练习参数中保留稀有或更高的权重。':'';
}

function rewardRecord(s,kind,source,inmateId,options){
  const record={id:`r${s.reference.rewardRecords.length+1}`,kind,source,inmateId,day:s.day,options:[...options],status:options.length?'pending':'exhausted',chosen:null,chosenDay:null};
  s.reference.rewardRecords.push(record);
  if(options.length)s.pending.push({kind,options:[...options],source:'referenceSample',rewardId:record.id});
  return record;
}
export function queueReferenceMilestone(s,p,hooks){
  if(!hasReferenceRewards(s)||s.goalIndex||p.tier<4)return;
  s.goalIndex=1;
  const options=hooks.shuffle(s,toolIds.filter(id=>!owns(s,id))).slice(0,3);
  rewardRecord(s,'tool','goal',p.id,options);
  hooks.log(s,options.length?'至臻目标达成：从已展示刑具样本中选择一件；三选一与等权抽样为练习策略。':'至臻目标达成：已展示刑具样本全部持有，不生成空的奖励选择。');
}
export function queueReferenceTreasure(s,p,hooks){
  const record=rewardRecord(s,'gift','rainbow',p.id,giftIds);
  s.reference.treasures.push({inmateId:p.id,day:s.day,status:'pending',rewardId:record.id,chosen:null,chosenDay:null});
  hooks.log(s,'绮彩囚犯单独收容：从四张已展示珍藏样本中选择一张；每名各一次的队列口径为练习策略。');
}

export function chooseReferenceReward(s,id,hooks){
  const pending=s.pending.shift(),record=s.reference.rewardRecords.find(record=>record.id===pending.rewardId);
  record.status='chosen';record.chosen=id;record.chosenDay=s.day;
  if(pending.kind==='tool'){
    s.tools.push(id);hooks.log(s,`获得刑具：${TOOLS.find(tool=>tool.id===id).name}。刑具保留，并在满足对应条件时持续生效。`);
    if(id==='fire'&&s.phase==='patrol'){
      const count=Math.max(1,s.config.destinations-1);
      s.destinations=s.destinations.slice(0,count);hooks.log(s,'刑具·火刑柱生效：本日尚未巡监的目的地减少一项，保留原选项顺序，不重新随机。');
    }
    return;
  }
  const treasure=s.reference.treasures.find(item=>item.rewardId===record.id);
  treasure.status='chosen';treasure.chosen=id;treasure.chosenDay=s.day;
  hooks.log(s,`使用珍藏：${GIFTS.find(gift=>gift.id===id).name}。本次选择立即结算，不额外消耗经营日。`);
  if(id==='ring'){
    const rooms=hooks.shuffle(s,s.rooms.filter(room=>room.status==='closed')).slice(0,3);
    for(const room of rooms)hooks.extraOpen(s,room.id);
    hooks.log(s,`珍藏·三首扳指生效：额外开启 ${rooms.length} 间牢房，不触发刑具、事变或房间效果；基础目标与绮彩收容仍记录。`);
  }
  if(id==='horn'){
    const eligible=hooks.board(s).filter(p=>hooks.targets(s,p.room).length).map(p=>p.id);
    let eaten=0;
    for(const inmateId of eligible){
      const room=s.rooms.find(room=>room.prisoner?.id===inmateId);if(!room)continue;
      const targets=hooks.targets(s,room.id);if(!targets.length)continue;
      hooks.eat(s,room.id,targets[Math.floor(hooks.random(s)*targets.length)]);eaten++;
    }
    hooks.log(s,`珍藏·斗争铜号生效：按存活囚犯身份依次吞噬 ${eaten} 次；新产生的奖励继续排队。`);
  }
  if(id==='wine'){
    const rooms=s.rooms.filter(room=>room.prisoner&&room.prisoner.tier<3);
    for(const room of rooms)hooks.promote(s,room,1,s.config.wineChangesCode);
    hooks.log(s,`珍藏·赤色佳酿生效：${rooms.length} 名低于传奇的囚犯各升 1 阶；${s.config.wineChangesCode?'按练习参数随机变号':'保留代号'}。`);
  }
  if(id==='brand'){
    const candidates=hooks.shuffle(s,hooks.board(s).filter(p=>!hooks.targets(s,p.room).length)).slice(0,4);
    let changed=0;
    for(const p of candidates){
      const room=s.rooms[p.room];if(!room.prisoner||hooks.targets(s,room.id).length)continue;
      const choices=SPECIES.filter(code=>s.rooms.some(other=>hooks.canEat(s,{...room.prisoner,code:code.id},other.prisoner)));
      if(choices.length){room.prisoner.code=choices[Math.floor(hooks.random(s)*choices.length)].id;changed++;}
    }
    hooks.log(s,`珍藏·原罪烙印生效：调整 ${changed} 名没有同阶食物的囚犯代号；不升阶，没有同阶伙伴时不伪造目标。`);
  }
  hooks.clearInvalidPrey(s);
}

export function referenceEatToolPlan(s,{code,beforeCount,afterCount,baseGain},hooks){
  let gain=baseGain,revenge=false;
  for(const effect of s.config.triggerOrder){
    if(effect==='muzzle'&&owns(s,'muzzle')&&(s.config.muzzleTiming==='before'?beforeCount:afterCount)<=3){gain+=2;hooks.log(s,'刑具·剧痛口枷生效：人数条件满足，额外升 2 阶。');}
    if(effect==='rathead'&&owns(s,'rathead')&&code==='rat'){gain++;hooks.log(s,'刑具·鼠头串生效：硕鼠吞噬额外升 1 阶。');}
    if(effect==='saw'&&owns(s,'saw')&&hooks.random(s)<.25){gain++;hooks.log(s,'刑具·锈锯触发：额外升 1 阶（25%为练习概率）。');}
    if(effect==='revenge'&&owns(s,'revenge')&&hooks.random(s)<.3)revenge=true;
  }
  return {gain,revenge};
}
export function referenceAfterEat(s,inmateId,revenge,hooks){
  if(!revenge)return;
  const current=s.rooms.find(room=>room.prisoner?.id===inmateId)?.prisoner;
  const rooms=s.rooms.filter(room=>room.status==='closed');
  if(!current||!rooms.length){hooks.log(s,'刑具·复仇者之匣判定命中，但囚犯已收容或无关闭牢房，本次不生成食物。');return;}
  const room=rooms[Math.floor(hooks.random(s)*rooms.length)],foods=SPECIES.find(species=>species.id===current.code).prey;
  const code=foods.length===1?foods[0]:foods[Math.floor(hooks.random(s)*foods.length)];
  hooks.extraOpen(s,room.id,{code,tier:current.tier});
  hooks.log(s,`刑具·复仇者之匣触发：${room.id+1} 号补入当前代号可吃的同阶目标；不连带其他开门效果（30%为练习概率）。`);
}
export function referencePrimaryOpen(s,roomId,hooks){
  if(!owns(s,'keys')||hooks.random(s)>=.8)return;
  const neighbors=[roomId-1,roomId+1].map(id=>s.config.circularNeighbors?(id+16)%16:id).filter(id=>id>=0&&id<16);
  let opened=0;for(const id of neighbors)if(s.rooms[id].status==='closed'){hooks.extraOpen(s,id);opened++;}
  hooks.log(s,`刑具·钥匙串触发：额外开启 ${opened} 间相邻牢房，不继续触发其他效果（80%为练习概率）。`);
}
export function referenceRerollInmate(s,before,hooks){
  const weights=[...s.config.rarityWeights];if(owns(s,'rope'))weights[0]=weights[1]=0;
  if(weights.every(weight=>weight===0))throw new Error('绞首绳排除低阶后没有有效权重，请调整练习参数');
  let tier=hooks.weighted(s,weights);const code=SPECIES[hooks.weighted(s,s.config.codeWeights)].id;
  if(owns(s,'fire')&&(s.config.fireEligibility==='before'?before.tier:tier)<3&&hooks.random(s)<.4){tier=3;hooks.log(s,'刑具·火刑柱触发：更换后的囚犯调整为传奇（40%为练习概率）。');}
  if(owns(s,'rope'))hooks.log(s,'刑具·绞首绳生效：更换排除普通和魔法；代号仍随机。');
  return hooks.inmate(s,code,tier);
}
export function referenceDayTools(s,hooks){
  if(!owns(s,'nest'))return;
  const available=s.rooms.filter(room=>room.status==='closed'&&!room.nest);if(!available.length)return;
  const room=available[Math.floor(hooks.random(s)*available.length)];room.nest={due:s.day+s.config.nestDays,source:'referenceTool'};
  hooks.log(s,`刑具·蠕动铁盒生效：${room.id+1} 号标为鼠巢，第 ${room.nest.due} 日成熟；时间和稀有度采用练习参数。`);
}

export function validateReferenceRewards(s){
  const fail=()=>{throw new Error('样本刑具、珍藏或奖励队列记录无效');};
  if(!Array.isArray(s.tools)||new Set(s.tools).size!==s.tools.length||s.tools.some(id=>!toolIds.includes(id))||!Array.isArray(s.pending)||!Array.isArray(s.reference.rewardRecords)||![0,1].includes(s.goalIndex)||!equal(s.config.goalTiers,[4]))fail();
  const records=s.reference.rewardRecords;
  let waiting=false;
  for(const [i,record] of records.entries()){
    const pool=record.kind==='tool'?toolIds:giftIds;
    if(!exact(record,['id','kind','source','inmateId','day','options','status','chosen','chosenDay'])||record.id!==`r${i+1}`||!['tool','gift'].includes(record.kind)||record.source!==(record.kind==='tool'?'goal':'rainbow')||!identity(record.inmateId,s)||!Number.isInteger(record.day)||record.day<1||record.day>s.day||!Array.isArray(record.options)||new Set(record.options).size!==record.options.length||record.options.some(id=>!pool.includes(id))||!['pending','chosen','exhausted'].includes(record.status))fail();
    if(record.kind==='gift'&&!equal(record.options,giftIds))fail();
    if(record.kind==='tool'&&record.status!=='exhausted'&&record.options.length!==3)fail();
    if(record.status==='pending')waiting=true;else if(waiting&&record.status==='chosen')fail();
    if(record.status==='exhausted'){
      if(record.kind!=='tool'||record.options.length||record.chosen!==null||record.chosenDay!==null||toolIds.some(id=>!owns(s,id)))fail();
    }else if(!record.options.length||record.status==='pending'&&(record.chosen!==null||record.chosenDay!==null)||record.status==='chosen'&&(!record.options.includes(record.chosen)||!Number.isInteger(record.chosenDay)||record.chosenDay<record.day||record.chosenDay>s.day))fail();
  }
  const goals=records.filter(record=>record.kind==='tool');
  if(goals.length!==s.goalIndex||!equal(s.tools,goals.filter(record=>record.status==='chosen').map(record=>record.chosen)))fail();
  const pending=records.filter(record=>record.status==='pending');
  if(pending.length!==s.pending.length||s.pending.some((item,index)=>!exact(item,['kind','options','source','rewardId'])||item.kind!==pending[index].kind||item.source!=='referenceSample'||item.rewardId!==pending[index].id||!equal(item.options,pending[index].options)))fail();
  if(s.pending.length&&!['patrol','manage','event'].includes(s.phase))fail();
  const gifts=records.filter(record=>record.kind==='gift');
  if(gifts.length!==s.rainbow.length||!Array.isArray(s.reference.treasures)||s.reference.treasures.length!==gifts.length||new Set(gifts.map(record=>record.inmateId)).size!==gifts.length)fail();
  for(const [index,treasure] of s.reference.treasures.entries()){
    const record=gifts[index];
    if(!exact(treasure,['inmateId','day','status','rewardId','chosen','chosenDay'])||treasure.inmateId!==record.inmateId||treasure.rewardId!==record.id||treasure.day!==record.day||treasure.status!==record.status||treasure.chosen!==record.chosen||treasure.chosenDay!==record.chosenDay||!s.rainbow.some(inmate=>inmate.id===record.inmateId))fail();
  }
  return true;
}
export function referenceRewardsView(s){
  const records=structuredClone(s.reference.rewardRecords);
  return {rewardRecords:records,rewardSummary:{enabled:true,goalReached:s.goalIndex===1,toolRewards:records.filter(record=>record.kind==='tool').length,giftRewards:records.filter(record=>record.kind==='gift').length,pending:s.pending.length,chosen:records.filter(record=>record.status==='chosen').length,catalogue:'displayed_samples',completeCatalogue:false,rerollBlockReason:referenceRerollBlockReason(s)}};
}
