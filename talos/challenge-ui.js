import {challengeView,deliveryPreview,onBoard,nameOf} from './session-engine.js?v=0.5.0-4';
import {RARITIES} from './rules.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const contracts=[['混编押运',4],['精锐押运',8],['重囚押运',12]];

export function challengePanel(state,{selected,pendingAction,busy=false}={}){
  if(!state.challenge)return '';
  const v=challengeView(state),active=v.contract;
  const stages=(v.contracts??contracts.map(([name,deadline],i)=>({name,deadline,status:i<v.contractIndex?'missed':i===v.contractIndex?'active':'future'}))).map(c=>`<div class="contract-stage ${c.status==='active'?'current':c.status==='completed'?'complete':c.status==='missed'?'missed':''}"><span>第 ${c.deadline} 日</span><br>${esc(c.name)}${c.status==='completed'?' ✓':c.status==='missed'?' · 未交付':''}</div>`).join('');
  const room=pendingAction?.type==='visit'?pendingAction.room:selected;
  const canScout=state.phase==='patrol'&&!state.pending.length&&!v.deliveryPending&&!v.scoutedToday&&v.tickets>=1&&state.destinations.includes(room)&&state.rooms[room]?.status==='closed'&&!busy;
  const intel=v.intel?`<p class="challenge-intel">已侦察 ${v.intel.room+1} 号：${esc(nameOf({code:v.intel.code,tier:v.intel.tier}))}。<br>可确认开门，或改去已开牢房；调度券不退。</p>`:'';
  const delivery=v.deliveryPending?`<button class="button gold" data-open-delivery ${busy?'disabled':''}>选择交付囚犯</button>${v.earlyDelivery?`<button class="button" data-cancel-early ${busy?'disabled':''}>继续经营</button>`:`<button class="button" data-skip-delivery ${busy?'disabled':''}>放弃本次合约</button>`}`:'';
  const early=v.canOpenEarlyDelivery?`<button class="button gold" data-early-delivery ${busy?'disabled':''}>提前重囚押运</button><p class="hint">第 9 日起可提前交付。确认交付会立即结束本轮；也可继续经营到第 12 日。</p>`:'';
  const scout=state.phase==='patrol'&&!v.deliveryPending?`<button class="button" data-scout-room="${room}" ${canScout?'':'disabled'}>${v.intel?'本日已侦察':canScout?`侦察 ${room+1} 号 · 1 券`:'选择未开目的地后可侦察'}</button><p class="hint">侦察花 1 券，每日最多一次。看清陌生囚犯，再决定扩张或保留人数。</p>`:'';
  const finished=v.status==='finished'?`<h2 class="${v.result?.success?'challenge-success':''}">${v.result?.grade==='full'?'三单全部达成':v.result?.success?'押运挑战通过':'本轮挑战结束'}</h2><p>${esc(v.summary)}</p>`:`<h2>${esc(active?.name??'押运挑战')}</h2><p>${esc(active?.description??'完成至少两份合约。')}</p><p class="hint">${v.deliveryPending?'本日交付开放，交付或放弃后才继续。':`本次交付：第 ${active?.deadline??12} 日结束时。`}</p>`;
  return `<div class="challenge-kicker"><span>押运合约 · ${esc(v.buildName??v.build)}</span><span>原创挑战</span></div><div class="challenge-metrics"><div><strong>${v.tickets}</strong><span>调度券</span></div><div><strong>${v.completed}/3</strong><span>已完成合约</span></div><div><strong>${v.score}</strong><span>挑战积分</span></div></div><div class="contract-stages">${stages}</div>${finished}${intel}<div class="challenge-controls">${delivery}${early}${scout}</div><p class="challenge-origin">交付拿走所选囚犯。至少完成 2 单且包含重囚合约才能通过，3 单为全部达成；积分只用于本挑战。</p>`;
}

export function challengeGuide(state){
  const v=challengeView(state),contract=v.contract;
  return `<header class="goal-tooltip-header"><h2>押运合约</h2><span class="goal-status">${v.completed}/3 单</span></header><p class="goal-explanation">12 日内完成至少两份合约，其中必须包含重囚押运。所有合约与结算为原创挑战。</p><p class="goal-reward">交付积分按所选囚犯计算；交付后，他们不再参与后续养成。</p><div class="goal-current">第 ${v.day}/12 日 · 调度券 ${v.tickets} · 挑战积分 ${v.score}</div><h3>三次交付条件</h3><ol><li>第 4 日：至少 3 名囚犯、至少 2 种代号。</li><li>第 8 日：至少 2 名稀有或传奇、至少 2 种代号。</li><li>第 12 日：至少 1 名至臻或绮彩；第 9 日起可提前交付，确认即结束本轮。</li></ol><h3>当前阶段</h3><p>${esc(v.deliveryPending?'本次交付已开放，选择货物并核对押运规格。':contract?.description??v.summary)}</p><div class="goal-notes"><p>轻押运花 1 券、压力最多 36；重押运花 3 券、压力最多 72。侦察也花 1 券。</p><p>养成继续使用当前实验口径；升阶后代号仍随机。没有保证交付的隐藏囚犯。</p></div>`;
}

export function cargoChoices(state){
  const cargo=[...onBoard(state).map(p=>({...p,source:'room'})),...state.rainbow.map(p=>({...p,source:'rainbow'}))];
  return cargo.map(p=>`<label class="cargo-choice"><input type="checkbox" ${p.source==='room'?`data-cargo-room="${p.room}"`:`data-cargo-rainbow="${esc(p.id)}"`}><span class="portrait ${esc(p.code)}" aria-hidden="true"></span><span><strong>${esc(nameOf(p))}</strong><small>${p.source==='room'?`${p.room+1} 号`:'单独收容'} · 压力 ${state.config.combatCosts[p.tier]}</small></span></label>`).join('')||'<p class="hint">当前没有可交付囚犯，可关闭选择后放弃本次合约。</p>';
}

export function deliveryStatus(state,selection){
  const result=deliveryPreview(state,selection);
  const details=`整批压力 ${result.burden??0} · 消耗 ${selection.escort==='heavy'?3:1} 券 · 当前 ${challengeView(state).tickets} 券`;
  return {...result,text:result.ok?`${details}。符合合约，交付获得 ${result.score} 挑战积分。${challengeView(state).earlyDelivery?'确认后立即结束本轮。':''}`:`${details}。${result.reason||'请选择符合合约的囚犯。'}`};
}

export function patrolRoute(state,room){
  if(!state.chain||state.phase!=='patrol'||!Number.isInteger(room)||!state.destinations.includes(room))return null;
  const rooms=[];let n=state.position;
  while(n!==room&&rooms.length<16){n=(n+1)%16;rooms.push(n);}
  return {rooms,closed:rooms.filter(id=>state.rooms[id].status==='closed').length,nests:rooms.filter(id=>state.rooms[id].nest).length};
}

export function destinationDetail(state,room){
  const prisoner=state.rooms[room]?.prisoner;
  if(prisoner)return nameOf(prisoner);
  const intel=state.challenge?challengeView(state).intel:null;
  return intel?.room===room?`已侦察 · ${nameOf({code:intel.code,tier:intel.tier})}`:state.rooms[room]?.status==='closed'?'门后囚犯未知':'已开空牢房';
}
