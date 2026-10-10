import {legalActions, nameOf, onBoard} from './engine.js';
import {RARITIES, TOOLS} from './rules.js';

// Read visible state only. A route is one legal action, never a predicted RNG chain.
export function goalGuide(s) {
  const goals=s.config.goalTiers, hasGoal=goals.length>0;
  const completed=hasGoal&&s.goalIndex>=goals.length;
  const targetTier=hasGoal?(goals[s.goalIndex]??goals.at(-1)):null;
  const target=targetTier===null?'暂无目标':RARITIES[targetTier];
  const board=onBoard(s), held=id=>s.tools.includes(id);
  const maximum=Math.max(-1,...board.map(p=>p.tier),...s.rainbow.map(p=>p.tier));
  const count=board.length+(s.config.rainbowCountsForMuzzle?s.rainbow.length:0);
  const muzzleCount=count-(s.config.muzzleTiming==='after'?1:0);
  const canReward=TOOLS.some(t=>!held(t.id));
  const guide={
    target, completed, status:!hasGoal?'暂无目标':completed?'已完成':'进行中',
    condition:hasGoal?`至少 1 名囚犯达到${target}或更高稀有度。`:'当前实验配置未设定目标。',
    reward:!hasGoal?'暂无目标奖励。':canReward?'完成目标后，可选择 1 件刑具奖励。':'全部刑具已取得，不再生成刑具选择。',
    progress:completed?'本轮目标已完成，后续囚犯变化不会撤销。':maximum<0?'当前没有囚犯。':`当前最高：${RARITIES[maximum]}${hasGoal&&maximum<targetTier?`，距${target}还差 ${targetTier-maximum} 阶`:''}。`,
    routeTitle:'', steps:[], boosts:[],
    notes:['吞噬后代号随机变化，下一步须重新检查同阶食物。','路径按当前模拟条件计算；未开启牢房和随机结果不作预判。'],
    routes:[],
  };
  if(held('muzzle'))guide.boosts.push(`剧痛口枷：按吃${s.config.muzzleTiming==='after'?'后':'前'}人数判定，不超过 3 名时额外升 2 阶；${s.config.rainbowCountsForMuzzle?'绮彩计入人数':'绮彩不计人数'}。`);
  if(held('rathead'))guide.boosts.push('鼠头串：硕鼠可吃同阶硕鼠；硕鼠作为吞噬者时，额外升 1 阶。');
  if(held('saw'))guide.boosts.push('锈锯：25% 概率额外升 1 阶，不计入保证结果。');
  if(held('rope'))guide.boosts.push('绞首绳：换后的稀有度排除普通、魔法；代号和最终稀有度仍随机。');
  if(held('nest'))guide.boosts.push(`蠕动铁盒：每日标记未开牢房，按当前参数 ${s.config.nestDays} 日后孵化${RARITIES[s.config.nestTier]}硕鼠。`);
  if(held('fire'))guide.boosts.push(`火刑柱：按换${s.config.fireEligibility==='after'?'后':'前'}稀有度判定，低于传奇时有 40% 概率调整为传奇；每日目的地选项减少 1 个。`);
  if(held('keys'))guide.boosts.push('遗落的钥匙串：开门有 80% 概率额外打开两侧未开牢房，新囚犯结果未知。');
  if(held('revenge'))guide.boosts.push('复仇者之匣：吞噬后有 30% 概率开门补充食物；绮彩离场后不继续补食物。');

  const actions=legalActions(s);
  if(s.pending.length) {
    const kind=s.pending[0].kind;
    guide.routeTitle=kind==='tool'?'先领取刑具奖励':'先领取珍藏奖励';
    guide.steps=[kind==='tool'?'选择 1 件刑具并确认，再继续经营。':'选择 1 件典狱长的珍藏并确认，再根据新场面判断。'];
    return guide;
  }
  if(s.phase==='riot'||s.phase==='finished') {
    guide.routeTitle=s.phase==='riot'?'经营阶段已结束':'本轮经营已结束';
    guide.steps=[s.phase==='riot'?'完成暴乱演算并查看本轮结果。':'查看本轮结果，或开始新一轮经营。'];
    return guide;
  }
  if(!hasGoal) {
    guide.routeTitle='暂无目标';
    guide.steps=['可继续经营；设定目标后再显示达成路径。'];
    return guide;
  }
  if(completed) {
    guide.routeTitle='目标已完成';
    guide.steps=['本轮目标无需重复达成。','继续经营可培养绮彩囚犯；后续路径依据新场面重新判断。'];
    return guide;
  }
  if(s.phase==='event') {
    guide.routeTitle='先处理当前事件';
    guide.steps=['确认接受或略过当前事件，再检查可用的同阶吞噬组合。'];
    return guide;
  }
  if(s.phase==='patrol') {
    guide.routeTitle='先选择巡监目的地';
    guide.steps=actions.some(a=>a.type==='visit')?['选择下方目的地并确认，完成巡监。','检查新囚犯是否能组成同阶吞噬；未开牢房的代号与稀有度未知。']:['当前没有可选择的目的地，需检查本轮配置。'];
    return guide;
  }

  guide.routes=actions.filter(a=>a.type==='eat').map(action=>{
    const p=s.rooms[action.room].prisoner;
    const muzzle=held('muzzle')&&muzzleCount<=3?2:0;
    const rathead=held('rathead')&&p.code==='rat'?1:0;
    const gain=1+muzzle+rathead, guaranteedTier=Math.min(5,p.tier+gain);
    return {action, gain, muzzle, rathead, guaranteedTier,
      possibleTier:Math.min(5,guaranteedTier+(held('saw')?1:0)),
      reachesTarget:guaranteedTier>=targetTier};
  }).sort((a,b)=>Number(b.reachesTarget)-Number(a.reachesTarget)||b.guaranteedTier-a.guaranteedTier||b.gain-a.gain||a.action.room-b.action.room||a.action.prey-b.action.prey);
  if(guide.routes.length) {
    const best=guide.routes[0], {room,prey}=best.action;
    guide.routeTitle=best.reachesTarget?'本次吞噬可达成目标':'当前升阶路径';
    guide.steps=[`选择 ${room+1} 号${nameOf(s.rooms[room].prisoner)}，吃掉 ${prey+1} 号${nameOf(s.rooms[prey].prisoner)}。`,
      `基础升 1 阶${best.muzzle?'，口枷额外升 2 阶':''}${best.rathead?'，鼠头串额外升 1 阶':''}；本次保证达到${RARITIES[best.guaranteedTier]}。`];
    if(held('saw')&&best.possibleTier>best.guaranteedTier)guide.steps.push(`锈锯若触发（25%），可额外升 1 阶至${RARITIES[best.possibleTier]}；不计入保证结果。`);
    if(best.reachesTarget)guide.steps.push(canReward?'吞噬结算后达成目标，选择 1 件刑具奖励。':'吞噬结算后达成目标；刑具已全部取得，无需选择奖励。');
    else guide.steps.push(`若尚未达标，吞噬后重查新代号与同阶食物，再继续升至${target}。`);
    if(best.guaranteedTier===5)guide.steps.push('绮彩囚犯单独收容；若同时出现刑具与珍藏奖励，先选刑具。');
    return guide;
  }
  const reroll=actions.some(a=>a.type==='reroll'), end=actions.some(a=>a.type==='end');
  guide.routeTitle='当前没有可吞噬组合';
  guide.steps=reroll?['当前囚犯没有满足条件的同阶配对。','可换一名缺少食物的囚犯；结果随机，重新检查配对。','若仍无配对，结束今天，下一日巡监补充囚犯。']:end?['当前没有同阶配对，今日换次数已用尽。',s.day>=s.config.days?'经营已到最后一日，结束今天进入暴乱演算。':'结束今天，下一日选择目的地补充囚犯，再检查配对。']:['当前没有可执行的经营操作。'];
  return guide;
}
