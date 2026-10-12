import {DEFAULT_CONFIG} from './rules.js?v=0.6.8-1';
import {createChallenge,createReferenceGame,exportRun,importRun,isChallenge,isReference} from './session-engine.js?v=0.6.12-1';

export const RUN_STORE='ss14-prison-lab-v1';

// Reading the entry screen validates a save, but never starts or writes a run.
export function readStartupSave(storage){
  try{
    if(!storage)throw new Error('浏览器不允许读取本机存档');
    const raw=storage.getItem(RUN_STORE);
    if(!raw)return {run:null,error:'',protectedSave:false};
    try{return {run:importRun(JSON.parse(raw)),error:'',protectedSave:false};}
    catch(error){return {run:null,error:`旧存档未载入：${error.message}。原存档已保留，新局请导出保存。`,protectedSave:true};}
  }catch(error){return {run:null,error:`${error.message}。仍可开始，本次不写入本机存档，请导出保存。`,protectedSave:true};}
}

export function createStartupRun({seed='talos',mode='reference',preset='normal',build='supply',config=DEFAULT_CONFIG}={}){
  if(!['reference','challenge'].includes(mode))throw new Error('新局仅支持经营规则演习和原创挑战；旧版样本请继续或导入已有存档。');
  const current=mode==='reference'?createReferenceGame(seed,config,preset==='empty'?'normal':preset):createChallenge(seed,{build});
  return {current,initial:structuredClone(current)};
}

// Call only for an explicit start/import or a committed game action.
export function saveStartupRun(storage,run,{protectedSave=false}={}){
  if(protectedSave)return {saved:false,error:'本机存档未能验证，已保留原内容。本局请使用导出保存。'};
  try{
    if(!storage)throw new Error('存档不可用');
    storage.setItem(RUN_STORE,JSON.stringify(exportRun(run.current,run.initial)));
    return {saved:true,error:''};
  }catch{return {saved:false,error:'浏览器未能保存，本局仍可继续。请使用导出保留这局。'};}
}

export function startupRunSummary(state){
  const reference=isReference(state),complete=reference&&['riot','finished'].includes(state.phase);
  const mode=reference?'资料校准练习':isChallenge(state)?'挑战经营':state.config.initialPrisoners===0?'空监狱经营':'预设练习';
  const phase=complete?'经营完成 · 待镇压交接':({patrol:'待巡监',manage:'经营中',event:'事件待处理',riot:'暴乱演算',finished:'已结束'})[state.phase];
  return {mode,phase,day:state.day,days:state.config.days,finished:state.phase==='finished'||complete,
    label:complete?'查看经营交接':state.phase==='finished'?'查看上局结果':`继续第 ${state.day} 日`,
    detail:`${mode} · 第 ${state.day} / ${state.config.days} 日 · ${phase}`};
}

export function startupConfigDraft(state){
  const draft=structuredClone(state.config);
  // Zero belongs to the explicit empty start; keep preset practice populated.
  if(draft.initialPrisoners===0)draft.initialPrisoners=DEFAULT_CONFIG.initialPrisoners;
  // v1 disabled all events internally. Restore the explicit new-game default
  // only in this draft, without changing the continued/imported legacy run.
  if(state.reference?.version==='public-preview-v1'){
    draft.eventsChance=DEFAULT_CONFIG.eventsChance;
    draft.referenceParameters={...draft.referenceParameters,specialEvents:true,executionChangesCode:false};
  }
  return draft;
}

export function startupPhaseHelp(state){
  if(state.phase==='patrol')return state.day===1&&state.history.length===0?
    state.config.initialPrisoners===0&&!isChallenge(state)?'第 1 日：监狱还是空的。选择一间目的地，确认巡监后开启第一扇牢门。':
    '第 1 日：场上囚犯由所选开局配给。选择目的地，再确认巡监。':
    '选择目的地，再确认巡监；已开启的牢房也可能成为目的地。';
  if(state.phase==='manage')return '先选囚犯，可吞噬同阶目标或更换；准备好后选择结束，再确认。';
  return '';
}
