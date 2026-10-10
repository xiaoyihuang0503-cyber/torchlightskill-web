import {createGame as createBaseGame,onBoard,nameOf,validateState} from './engine.js';
import {DEFAULT_CONFIG} from './rules.js';

export const CHALLENGE_VERSION='talos-original-contract-v1';
export const CHALLENGE_SCHEMA='ss14.prison.challenge.state.v1';
export const BUILDS=[
  {id:'supply',name:'补给开局',difficulty:'标准',preset:'normal',description:'六名囚犯与钥匙串；补充人数，准备混编交付。'},
  {id:'muzzle',name:'紧编开局',difficulty:'进阶',preset:'muzzle',description:'三名囚犯与剧痛口枷；保留少人数升阶。'},
  {id:'rat',name:'育鼠开局',difficulty:'入门',preset:'rat',description:'三名囚犯、蠕动铁盒与鼠头串；经营硕鼠配对。'},
];
export const CONTRACTS=[
  {id:'mixed',name:'混编押运',deadline:4,description:'至少交付3名囚犯，包含至少2种代号。',requirements:['至少3名囚犯','至少2种代号']},
  {id:'elite',name:'精锐押运',deadline:8,description:'至少交付2名稀有或传奇囚犯，整批包含至少2种代号。',requirements:['至少2名稀有或传奇','至少2种代号']},
  {id:'high',name:'重囚押运',deadline:12,description:'至少交付1名至臻或绮彩囚犯；单独收容的绮彩也可交付。',requirements:['至少1名至臻或绮彩']},
];
export const ESCORTS={light:{name:'轻押运',cost:1,capacity:36},heavy:{name:'重押运',cost:3,capacity:72}};
export const isChallenge=s=>!!s?.challenge;
export function withoutChallenge(state){const base=structuredClone(state);delete base.challenge;return base;}
export function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;}
export const sameValue=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function baseFingerprint(state){const base=withoutChallenge(state);delete base.revision;delete base.history;return JSON.stringify(canonical(base));}

// This original challenge offers a known-room route to preserve a small population.
// Selection uses room position only, never unopened content or an extra RNG draw.
export function refreshDestinations(s){
  if(s.phase!=='patrol')return s;
  const closed=s.destinations.filter(id=>s.rooms[id].status==='closed');
  const known=s.rooms.filter(r=>r.status==='open').sort((a,b)=>((a.id-s.position+16)%16)-((b.id-s.position+16)%16))[0];
  if(closed.length&&known){
    const limit=Math.max(1,s.config.destinations-(s.tools.includes('fire')?1:0));
    s.destinations=[...closed.slice(0,Math.max(1,limit-1)),known.id];
  }
  return s;
}

export function createChallenge(seed='talos-challenge',{build='supply'}={}){
  const item=BUILDS.find(x=>x.id===build);if(!item)throw new Error('挑战开局不存在');
  const s=createBaseGame(seed,{...DEFAULT_CONFIG,days:12},item.preset);
  if(build==='supply')s.tools.push('keys');
  s.phase='patrol';
  s.challenge={schema:CHALLENGE_SCHEMA,version:CHALLENGE_VERSION,build,tickets:6,completed:0,score:0,
    deliveries:[],deliveryPending:false,intel:null,preview:null,scoutedDays:[],result:null};
  refreshDestinations(s);validateChallenge(s);return s;
}

function currentContract(s){return CONTRACTS[Math.min(s.challenge.deliveries.length,CONTRACTS.length-1)];}
export function canOpenEarlyDelivery(s){
  return isChallenge(s)&&!s.challenge.result&&!s.challenge.deliveryPending&&s.challenge.deliveries.length===2&&s.day>=9&&s.day<=12&&['patrol','manage'].includes(s.phase)&&!s.pending.length&&!s.event;
}
function isDeliveryDay(s,contract){
  return s.challenge.earlyDelivery===true?contract.id==='high'&&s.challenge.deliveries.length===2&&s.day>=9&&s.day<=12:s.day===contract.deadline;
}
function qualifies(contract,cargo){
  const codes=new Set(cargo.map(p=>p.code));
  return contract.id==='mixed'?cargo.length>=3&&codes.size>=2:contract.id==='elite'?cargo.filter(p=>p.tier===2||p.tier===3).length>=2&&codes.size>=2:cargo.some(p=>p.tier>=4);
}

export function deliveryPreview(s,cargoSpec={}){
  const fail=reason=>({ok:false,reason,burden:0,cost:0,score:0,names:[],contract:isChallenge(s)?structuredClone(currentContract(s)):null});
  if(!cargoSpec||typeof cargoSpec!=='object'||Array.isArray(cargoSpec))return fail('先选择交付囚犯');
  const {rooms=[],rainbowIds=[],escort='light'}=cargoSpec;
  if(!isChallenge(s))return fail('当前是经营复刻模式');
  const validPhase=s.challenge.earlyDelivery===true?['patrol','manage'].includes(s.phase):s.phase==='manage';
  if(!s.challenge.deliveryPending||!validPhase||s.pending.length||s.event)return fail('现在还没有到押运窗口');
  if(!Array.isArray(rooms)||!Array.isArray(rainbowIds))return fail('货物必须使用房号和收容囚犯列表');
  if(rooms.length>16||rainbowIds.length>s.rainbow.length)return fail('货物数量无效');
  if(new Set(rooms).size!==rooms.length||new Set(rainbowIds).size!==rainbowIds.length)return fail('同一囚犯不能重复交付');
  if(!ESCORTS[escort]||!Object.hasOwn(ESCORTS,escort))return fail('押运方式不存在');
  const cargo=[];
  for(const room of rooms){
    if(!Number.isInteger(room)||room<0||room>=16)return fail('房号必须为0到15的整数');
    const p=s.rooms[room].prisoner;if(!p)return fail('选中的囚犯已经离开');cargo.push(p);
  }
  for(const id of rainbowIds){
    if(typeof id!=='string'||!/^p\d+$/.test(id))return fail('收容囚犯身份无效');
    const p=s.rainbow.find(p=>p.id===id);if(!p)return fail('选中的绮彩已经离开');cargo.push(p);
  }
  if(!cargo.length)return fail('先选择交付囚犯');
  if(new Set(cargo.map(p=>p.id)).size!==cargo.length)return fail('同一囚犯不能重复交付');
  const contract=currentContract(s),transport=ESCORTS[escort];
  const burden=cargo.reduce((n,p)=>n+s.config.combatCosts[p.tier],0),score=cargo.reduce((n,p)=>n+2**p.tier,0);
  const result={ok:false,reason:'',burden,cost:transport.cost,score,names:cargo.map(nameOf),contract:structuredClone(contract)};
  if(!isDeliveryDay(s,contract))return {...result,reason:'当前交付日与合约不一致'};
  if(!qualifies(contract,cargo))return {...result,reason:contract.description};
  if(burden>transport.capacity)return {...result,reason:`压力 ${burden} 超过${transport.name}上限 ${transport.capacity}`};
  if(s.challenge.tickets<transport.cost)return {...result,reason:'调度券不足，需保留足够押运费用'};
  return {...result,ok:true,reason:`符合${contract.name}，交付后这些囚犯离开场面`};
}

// A few convenience candidates; the UI can submit any explicitly selected cargo.
export function deliveryOptions(s){
  if(!isChallenge(s)||!s.challenge.deliveryPending)return [];
  const board=onBoard(s).map(p=>({...p,kind:'room'})),pool=[...board,...s.rainbow.map(p=>({...p,kind:'rainbow',room:null}))];
  const best={};
  function examine(cargo,burden){
    if(!qualifies(currentContract(s),cargo))return;
    const rooms=cargo.filter(p=>p.kind==='room').map(p=>p.room),rainbowIds=cargo.filter(p=>p.kind==='rainbow').map(p=>p.id);
    for(const escort of ['light','heavy']){
      const e=ESCORTS[escort];if(burden>e.capacity||s.challenge.tickets<e.cost)continue;
      const value=cargo.reduce((n,p)=>n+2**p.tier,0),a={type:'deliver',rooms,rainbowIds,escort};
      if(!best[escort]||value>best[escort].value)best[escort]={value,action:a};
      if(!best.minimum||e.cost<best.minimum.cost||e.cost===best.minimum.cost&&value<best.minimum.value)best.minimum={cost:e.cost,value,action:a};
    }
  }
  function enumerate(i,cargo,burden){
    if(i===pool.length){if(cargo.length)examine(cargo,burden);return;}
    enumerate(i+1,cargo,burden);
    const p=pool[i],cost=s.config.combatCosts[p.tier];
    if(burden+cost<=72)enumerate(i+1,[...cargo,p],burden+cost);
  }
  enumerate(0,[],0);
  const seen=new Set();return ['minimum','light','heavy'].flatMap(k=>{
    const a=best[k]?.action,key=JSON.stringify(a);if(!a||seen.has(key))return [];seen.add(key);return [a];
  });
}

export function settleChallenge(s){
  const c=s.challenge,success=c.completed>=2&&c.deliveries.some(d=>d.contractId==='high'&&d.success);c.result={success,grade:c.completed===3?'full':success?'passed':'failed',completed:c.completed,totalContracts:3,score:c.score,ticketsRemaining:c.tickets};
  c.deliveryPending=false;delete c.earlyDelivery;c.intel=null;c.preview=null;s.phase='finished';s.destinations=[];s.event=null;s.waves=[];s.combatIndex=-1;
  return s;
}

export function challengeView(s){
  if(!isChallenge(s))return null;
  const c=s.challenge,build=BUILDS.find(x=>x.id===c.build),contract=currentContract(s),status=c.result?'finished':c.deliveryPending?'delivery':'playing';
  const contracts=CONTRACTS.map((p,i)=>({...structuredClone(p),status:c.deliveries[i]?(c.deliveries[i].success?'completed':'missed'):i===c.deliveries.length?'active':'future',score:c.deliveries[i]?.score??0}));
  return {build:c.build,buildName:build.name,buildDifficulty:build.difficulty,day:s.day,days:12,tickets:c.tickets,contractIndex:Math.min(c.deliveries.length,2),contract:structuredClone(contract),
    contracts,completed:c.completed,totalContracts:3,score:c.score,deliveryPending:c.deliveryPending,earlyDelivery:c.earlyDelivery===true,canOpenEarlyDelivery:canOpenEarlyDelivery(s),
    intel:c.intel?{room:c.intel.room,code:c.intel.code,tier:c.intel.tier}:null,scoutedToday:c.scoutedDays.includes(s.day),routeLocked:!!c.preview,
    result:structuredClone(c.result),status,summary:c.result?`${c.result.success?'挑战成功':'挑战未达标'}：完成 ${c.completed}/3 单，交付 ${c.score} 分；须至少 2 单且含重囚`:`已完成 ${c.completed}/3 单；完成至少 2 单，且必须完成重囚押运`,
    escorts:structuredClone(ESCORTS),deliveryHistory:structuredClone(c.deliveries),original:true};
}

export function validateChallenge(s){
  validateState(s);const c=s.challenge;
  if(!c||c.schema!==CHALLENGE_SCHEMA||c.version!==CHALLENGE_VERSION||!BUILDS.some(b=>b.id===c.build)||s.config.days!==12)throw new Error('挑战版本或开局无效');
  if(!sameValue(s.config,{...DEFAULT_CONFIG,days:12}))throw new Error('原创挑战采用固定规则，不能改实验参数');
  if(!Number.isInteger(c.tickets)||c.tickets<0||c.tickets>6||!Number.isInteger(c.completed)||c.completed<0||c.completed>3||!Number.isInteger(c.score)||c.score<0)throw new Error('挑战资源或结算无效');
  if(!Array.isArray(c.deliveries)||c.deliveries.length>3||typeof c.deliveryPending!=='boolean'||!Array.isArray(c.scoutedDays)||new Set(c.scoutedDays).size!==c.scoutedDays.length||c.scoutedDays.some(d=>!Number.isInteger(d)||d<1||d>12))throw new Error('挑战记录无效');
  if(c.earlyDelivery!==undefined&&(c.earlyDelivery!==true||!c.deliveryPending||c.deliveries.length!==2||s.day<9||s.day>12))throw new Error('提前交付标记无效');
  if(c.deliveries.some((d,i)=>d.contractId!==CONTRACTS[i].id||(d.early===true?(i!==2||!d.success||!Number.isInteger(d.day)||d.day<9||d.day>12):d.day!==CONTRACTS[i].deadline)||(d.early!==undefined&&d.early!==true)||typeof d.success!=='boolean'||!Number.isInteger(d.score)||d.score<0))throw new Error('合约交付记录无效');
  if(c.completed!==c.deliveries.filter(d=>d.success).length||c.score!==c.deliveries.reduce((n,d)=>n+d.score,0))throw new Error('合约结算与记录不一致');
  if(c.deliveryPending&&((c.earlyDelivery===true?!['patrol','manage'].includes(s.phase):s.phase!=='manage')||s.pending.length||s.event||c.deliveries.length>=3||!isDeliveryDay(s,currentContract(s))))throw new Error('当前押运窗口无效');
  if(c.preview){
    if(s.phase!=='patrol'||!c.intel||c.preview.room!==c.intel.room||!s.destinations.includes(c.preview.room)||!c.scoutedDays.includes(s.day)||typeof c.preview.baseFingerprint!=='string'||c.preview.nextBase?.challenge)throw new Error('锁定巡监记录无效');
    validateState(c.preview.nextBase);
    if(baseFingerprint(s)!==c.preview.baseFingerprint)throw new Error('侦察后的基础场面已变化，锁定结果不可使用');
  }else if(c.intel)throw new Error('侦察信息缺少锁定路线');
  if(c.result){
    const success=c.completed>=2&&c.deliveries.some(d=>d.contractId==='high'&&d.success);
    if(s.phase!=='finished'||c.deliveries.length!==3||s.day!==c.deliveries.at(-1).day||c.result.completed!==c.completed||c.result.score!==c.score||c.result.success!==success||c.result.grade!==(c.completed===3?'full':success?'passed':'failed'))throw new Error('最终挑战结算无效');
  }else if(s.phase==='finished'||s.phase==='riot')throw new Error('挑战结束必须先完成合约结算');
  return true;
}
