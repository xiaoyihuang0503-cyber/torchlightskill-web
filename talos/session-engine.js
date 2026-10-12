import * as engine from './engine.js?v=0.6.14-1';
import {SPECIES,RARITIES,TOOLS,FOOD_CHAIN_VERSION} from './rules.js?v=0.6.8-1';
import {CHALLENGE_VERSION,LEGACY_CHALLENGE_VERSION,ESCORTS,isChallenge,withoutChallenge,baseFingerprint,sameValue,refreshDestinations,deliveryOptions,deliveryPreview,settleChallenge,validateChallenge,challengeView,createChallenge,canOpenEarlyDelivery,currentContract} from './challenge.js?v=0.6.14-1';
import {queueRestock,restockOptions,restockView} from './challenge-v2.js?v=0.6.14-1';

export {onBoard,targets,nameOf,canEat,seedNumber} from './engine.js?v=0.6.14-1';
export {createChallenge,isChallenge,challengeView,deliveryPreview} from './challenge.js?v=0.6.14-1';
export const createGame=engine.createGame;
export {createReferenceGame,referenceView,referenceVisibleState,addReferenceMarker,isReference,hasReferenceRewards} from './reference-rules.js?v=0.6.14-1';
export const CHALLENGE_EXPORT_SCHEMA='ss14.prison.challenge.export.v1';
const exact=(a,keys)=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===keys.length&&keys.every(k=>Object.hasOwn(a,k));

export function legalActions(s){
  if(!isChallenge(s))return engine.legalActions(s);
  if(s.challenge.result)return [];
  if(s.challenge.restock)return [...s.challenge.restock.options.map(id=>({type:'choose',id})),...(restockView(s).canRefresh?[{type:'refreshRestock'}]:[])];
  if(s.challenge.deliveryPending)return [...deliveryOptions(s),{type:s.challenge.earlyDelivery===true?'cancelEarlyDelivery':'skipDelivery'}];
  const actions=engine.legalActions(s);
  if(s.pending.length)return actions;
  const early=canOpenEarlyDelivery(s)?[{type:'openEarlyDelivery'}]:[];
  if(s.phase!=='patrol')return [...actions,...early];
  if(s.challenge.preview)return [...actions.filter(a=>a.type==='visit'&&(a.room===s.challenge.preview.room||s.rooms[a.room].status==='open')),...early];
  const scouts=s.challenge.tickets>0&&!s.challenge.scoutedDays.includes(s.day)?actions.filter(a=>s.rooms[a.room].status==='closed').map(a=>({type:'scout',room:a.room})):[];
  return [...actions,...scouts,...early];
}

function record(before,next,action){
  next.revision=before.revision+1;next.history=[...structuredClone(before.history),{...structuredClone(action),revision:next.revision,day:before.day}];
  validateChallenge(next);return next;
}
export function upgradeFoodChain(state){
  validateState(state);
  if(state.foodChain===FOOD_CHAIN_VERSION)return state;
  const s=engine.upgradeFoodChain(state);
  if(isChallenge(s)){
    if(s.challenge.preview){
      const nextBase=s.challenge.preview.nextBase;
      nextBase.foodChain=FOOD_CHAIN_VERSION;
      nextBase.log.splice(state.log.length,0,structuredClone(s.log.at(-1)));
      s.challenge.preview.baseFingerprint=baseFingerprint(s);
    }
    validateChallenge(s);
  }
  return s;
}
function advanceAfterDelivery(s){
  if(s.day===12||s.challenge.earlyDelivery===true)return settleChallenge(s);
  const c=structuredClone(s.challenge),base=engine.applyAction(withoutChallenge(s),{type:'end'});base.challenge=c;
  return refreshDestinations(base);
}

export function applyAction(state,action){
  if(action?.type==='upgradeFoodChain'){
    if(!exact(action,['type','version'])||action.version!==FOOD_CHAIN_VERSION||state.foodChain!==undefined)throw new Error('吞噬规则升级操作无效');
    return upgradeFoodChain(state);
  }
  if(!isChallenge(state))return engine.applyAction(state,action);
  validateChallenge(state);
  if(!action||typeof action!=='object'||Array.isArray(action))throw new Error('挑战操作格式无效');
  if(state.challenge.restock){
    const s=structuredClone(state),c=s.challenge,r=c.restock;
    if(action.type==='choose'&&exact(action,['type','id'])&&r.options.includes(action.id)){
      s.tools.push(action.id);s.pending.shift();c.restocks.push({contractId:r.contractId,day:r.day,owned:r.owned,refreshUsed:r.refreshUsed,chosen:action.id});c.restock=null;
      s.log.push({day:s.day,text:`原创挑战：整备取得${TOOLS.find(t=>t.id===action.id).name}；本日继续，调度券不返还。`});
      if(s.phase==='patrol')refreshDestinations(s);
      return record(state,s,action);
    }
    if(action.type==='refreshRestock'&&exact(action,['type'])&&restockView(s).canRefresh){
      c.tickets--;r.refreshUsed=true;r.options=restockOptions(s.seed,r.contractId,r.owned,true);s.pending[0].options=[...r.options];
      s.log.push({day:s.day,text:'原创挑战：消耗1张调度券刷新刑具整备，公开选项已更新；本次不能再次刷新。'});
      return record(state,s,action);
    }
    throw new Error('先完成刑具整备；刷新需1张调度券且每次整备最多一次');
  }
  if(action.type==='openEarlyDelivery'){
    if(!exact(action,['type'])||!canOpenEarlyDelivery(state))throw new Error('第9日起且已处理前两单、奖励与事件后，才能自愿开启重囚交付');
    const s=structuredClone(state);s.challenge.deliveryPending=true;s.challenge.earlyDelivery=true;return record(state,s,action);
  }
  if(action.type==='cancelEarlyDelivery'){
    if(!exact(action,['type'])||!state.challenge.deliveryPending||state.challenge.earlyDelivery!==true)throw new Error('现在没有可取消的提前交付窗口');
    const s=structuredClone(state);s.challenge.deliveryPending=false;delete s.challenge.earlyDelivery;return record(state,s,action);
  }
  if(action.type==='deliver'){
    if(!exact(action,['type','rooms','rainbowIds','escort']))throw new Error('交付操作字段无效');
    const preview=deliveryPreview(state,action);if(!preview.ok)throw new Error(preview.reason);
    const s=structuredClone(state),c=s.challenge;
    for(const id of action.rooms){s.rooms[id].prisoner=null;s.rooms[id].status=s.config.reusableRooms?'closed':'open';s.rooms[id].nest=null;}
    s.rainbow=s.rainbow.filter(p=>!action.rainbowIds.includes(p.id));
    c.tickets-=preview.cost;c.completed++;c.score+=preview.score;
    c.deliveries.push({contractId:preview.contract.id,day:s.day,success:true,score:preview.score,cost:preview.cost,burden:preview.burden,rooms:[...action.rooms],rainbowIds:[...action.rainbowIds],names:preview.names,escort:action.escort,...(c.earlyDelivery===true?{early:true}:{}),...(c.version===CHALLENGE_VERSION?{variantId:preview.contract.variantId,bonusScore:preview.bonusScore}:{})});
    c.deliveryPending=false;s.log.push({day:s.day,text:`原创挑战：完成${preview.contract.name}，交付 ${preview.names.length} 名囚犯，花费 ${preview.cost} 张调度券。`});
    const next=advanceAfterDelivery(s);
    if(c.version===CHALLENGE_VERSION&&c.deliveries.length<=2)queueRestock(next,preview.contract.id);
    return record(state,next,action);
  }
  if(action.type==='skipDelivery'){
    if(!exact(action,['type'])||!state.challenge.deliveryPending)throw new Error('现在不能跳过交付');
    if(state.challenge.earlyDelivery===true)throw new Error('提前窗口不能跳过重囚合约；取消后可以继续经营');
    const s=structuredClone(state),c=s.challenge,contract=currentContract(s);
    c.deliveries.push({contractId:contract.id,day:s.day,success:false,score:0,cost:0,burden:0,rooms:[],rainbowIds:[],names:[],escort:null,...(c.version===CHALLENGE_VERSION?{variantId:contract.variantId,bonusScore:0}:{})});c.deliveryPending=false;
    s.log.push({day:s.day,text:`原创挑战：跳过${contract.name}，保留当前囚犯。`});
    return record(state,advanceAfterDelivery(s),action);
  }
  if(!legalActions(state).some(a=>sameValue(a,action)))throw new Error('场面已变化或该操作当前不可用');
  if(action.type==='scout'){
    const s=structuredClone(state),c=s.challenge,base=withoutChallenge(state),nextBase=engine.applyAction(base,{type:'visit',room:action.room});
    const p=nextBase.rooms[action.room].prisoner??nextBase.rainbow.find(p=>!base.rainbow.some(q=>q.id===p.id));
    if(!p)throw new Error('本次路线没有可侦察的新囚犯');
    c.tickets--;c.scoutedDays.push(s.day);c.intel={room:action.room,code:p.code,tier:p.tier};
    c.preview={room:action.room,baseFingerprint:baseFingerprint(state),nextBase};
    return record(state,s,action);
  }
  if(action.type==='visit'&&state.challenge.preview){
    const next=action.room===state.challenge.preview.room?structuredClone(state.challenge.preview.nextBase):engine.applyAction(withoutChallenge(state),action),c=structuredClone(state.challenge);c.preview=null;c.intel=null;next.challenge=c;
    return record(state,next,action);
  }
  if(action.type==='end'&&currentContract(state)?.deadline===state.day){
    const s=structuredClone(state);s.challenge.deliveryPending=true;return record(state,s,action);
  }
  const next=engine.applyAction(withoutChallenge(state),action);next.challenge=structuredClone(state.challenge);
  if(next.day!==state.day)refreshDestinations(next);
  return record(state,next,action);
}

export function editRoom(state,...args){if(isChallenge(state))throw new Error('原创挑战使用固定规则，不能校准囚犯场面');return engine.editRoom(state,...args);}
export function addTool(state,...args){if(isChallenge(state))throw new Error('原创挑战不能实验添加刑具');return engine.addTool(state,...args);}
export function validateState(s){return isChallenge(s)?validateChallenge(s):engine.validateState(s);}

export function replay(run){
  if(!isChallenge(run.initial))return engine.replay(run);
  let s=structuredClone(run.initial);validateChallenge(s);
  for(const a of run.actions){const {revision,day,...action}=a;s=applyAction(s,action);}
  return s;
}
export function undoUserAction(initial,state){
  let end=state.history.length;
  while(end&&state.history[end-1].type==='upgradeFoodChain')end--;
  if(!end)throw new Error('还没有可撤回的操作');
  return upgradeFoodChain(replay({initial,actions:state.history.slice(0,end-1)}));
}
export function exportRun(current,initial){
  if(!isChallenge(current)&&!isChallenge(initial))return engine.exportRun(current,initial);
  if(!isChallenge(current)||!isChallenge(initial))throw new Error('挑战存档的初始与当前模式不一致');
  validateChallenge(current);validateChallenge(initial);
  if(current.challenge.version!==initial.challenge.version)throw new Error('挑战初始与当前规则版本不一致');
  return {schema:CHALLENGE_EXPORT_SCHEMA,version:current.challenge.version,initial:structuredClone(initial),actions:structuredClone(current.history),current:structuredClone(current)};
}
export function importRun(payload){
  if(payload?.schema!==CHALLENGE_EXPORT_SCHEMA){
    if(isChallenge(payload?.initial)||isChallenge(payload?.current))throw new Error('挑战存档必须使用独立挑战格式');
    return engine.importRun(payload);
  }
  if(![LEGACY_CHALLENGE_VERSION,CHALLENGE_VERSION].includes(payload.version)||!Array.isArray(payload.actions)||payload.actions.length>10000||!isChallenge(payload.initial)||!isChallenge(payload.current)||payload.initial.challenge.version!==payload.version||payload.current.challenge.version!==payload.version)throw new Error('挑战存档版本或操作记录无效');
  validateChallenge(payload.initial);validateChallenge(payload.current);
  const expected=createChallenge(payload.initial.seed,{build:payload.initial.challenge.build,version:payload.version,foodChain:payload.initial.foodChain??null});
  if(!sameValue(expected,payload.initial))throw new Error('挑战初始场面必须与固定开局一致');
  const rebuilt=replay(payload);if(!sameValue(rebuilt,payload.current))throw new Error('挑战存档与操作记录不一致');
  return {initial:structuredClone(payload.initial),current:rebuilt};
}

export function recommend(s){
  if(!isChallenge(s))return engine.recommend(s);
  if(s.challenge.restock)return [];
  if(s.challenge.deliveryPending){
    return legalActions(s).slice(0,3).map(a=>{
      if(a.type==='skipDelivery')return {action:a,score:0,label:'跳过这次交付',reason:'这单记为未完成；保留囚犯和调度券，准备剩余合约。'};
      if(a.type==='cancelEarlyDelivery')return {action:a,score:0,label:'取消提前交付',reason:'恢复当前巡监或经营，不花券；确认交付才结束本轮，打开窗口不代表已经成功。'};
      const p=deliveryPreview(s,a);return {action:a,score:30-p.cost,label:`${ESCORTS[a.escort].name} · ${p.names.length} 名`,reason:`${p.reason}；压力 ${p.burden}，花费 ${p.cost} 券，交付 ${p.score} 分。`};
    });
  }
  if(s.phase==='patrol'&&s.challenge.preview){
    const p=s.challenge.intel;return legalActions(s).filter(a=>a.type==='visit').map(a=>a.room===p.room?{action:a,score:30,label:`前往已侦察的 ${p.room+1} 号`,reason:`已花券侦察：${RARITIES[p.tier]}${SPECIES.find(x=>x.id===p.code).name}；也可改去已开房，调度券不退。`}:{action:a,score:5,label:`回到已开 ${a.room+1} 号`,reason:'保留人数；若有连锁或尚未处理的事件，仍按当前可见路径与实际事件结算。调度券不退。'});
  }
  return engine.recommend(s);
}
