import {SPECIES,TOOLS} from './rules.js?v=0.6.8-1';
import {seedNumber} from './engine.js?v=0.6.8-1';

export const CHALLENGE_V2='talos-original-contract-v2';

// These choices use a separate seed stream, so displaying a contract or a
// restock never consumes the prison's RNG or reads an unopened prisoner.
function shuffled(seed,items){
  let rng=seedNumber(seed);const out=[...items];
  for(let i=out.length-1;i>0;i--){
    rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;rng=rng>>>0||1;
    const j=Math.floor(rng/4294967296*(i+1));[out[i],out[j]]=[out[j],out[i]];
  }
  return out;
}

export const CONTRACT_VARIANTS=[
  [
    {variantId:'mixed',name:'混编押运',description:'至少交付3名囚犯，包含至少2种代号。',requirements:['至少3名囚犯','至少2种代号']},
    {variantId:'cohort',name:'成群押运',description:'至少交付4名囚犯；代号与稀有度不限。',requirements:['至少4名囚犯','代号与稀有度不限']},
    {variantId:'rareCrew',name:'精锐带队',description:'至少交付1名稀有或传奇囚犯，以及2名普通或魔法囚犯。',requirements:['至少1名稀有或传奇','至少2名普通或魔法']},
  ],
  [
    {variantId:'elite',name:'精锐押运',description:'至少交付2名稀有或传奇囚犯，整批包含至少2种代号。',requirements:['至少2名稀有或传奇','至少2种代号']},
    {variantId:'paired',name:'同族护送',description:'至少交付1名传奇囚犯，以及1名与其同代号、稀有度低于传奇的囚犯。',requirements:['至少1名传奇','至少1名同代号的普通、魔法或稀有']},
    {variantId:'rareTrio',name:'精锐集结',description:'至少交付3名稀有或传奇囚犯；代号不限。',requirements:['至少3名稀有或传奇','代号不限']},
  ],
  [
    {variantId:'high',name:'重囚押运',description:'至少交付1名至臻或绮彩囚犯；单独收容的绮彩也可交付。',requirements:['至少1名至臻或绮彩']},
    {variantId:'preferred',name:'重囚悬赏',description:'',requirements:['至少1名至臻或绮彩','悬赏代号只加分，不影响达标']},
  ],
];

export function createContracts(seed){
  return CONTRACT_VARIANTS.map((pool,i)=>{
    const variant=structuredClone(shuffled(`${seed}|contract-v2|${i}`,pool)[0]);
    const contract={id:['mixed','elite','high'][i],deadline:[4,8,12][i],...variant};
    if(variant.variantId==='preferred'){
      const species=shuffled(`${seed}|contract-v2|preference`,SPECIES)[0];
      contract.preferenceCode=species.id;contract.bonusPoints=8;
      contract.description=`至少交付1名至臻或绮彩囚犯；每名${species.name}至臻或绮彩额外获得8分。其他代号同样可达标。`;
    }
    return contract;
  });
}

export function qualifiesV2(contract,cargo){
  const codes=new Set(cargo.map(p=>p.code)),elite=cargo.filter(p=>p.tier===2||p.tier===3);
  switch(contract.variantId){
    case 'mixed':return cargo.length>=3&&codes.size>=2;
    case 'cohort':return cargo.length>=4;
    case 'rareCrew':return elite.length>=1&&cargo.filter(p=>p.tier<=1).length>=2;
    case 'elite':return elite.length>=2&&codes.size>=2;
    case 'paired':return cargo.some(p=>p.tier===3&&cargo.some(q=>q.id!==p.id&&q.code===p.code&&q.tier<3));
    case 'rareTrio':return elite.length>=3;
    case 'high':case 'preferred':return cargo.some(p=>p.tier>=4);
    default:return false;
  }
}

export function cargoBonus(contract,cargo){
  return contract.preferenceCode?cargo.filter(p=>p.tier>=4&&p.code===contract.preferenceCode).length*contract.bonusPoints:0;
}

export function restockOptions(seed,contractId,owned,refreshUsed=false){
  const available=TOOLS.map(t=>t.id).filter(id=>!owned.includes(id));
  const first=shuffled(`${seed}|restock-v2|${contractId}|0`,available).slice(0,3);
  if(!refreshUsed)return first;
  // Prefer unseen choices; retain enough previous choices only when the pool
  // is small. A paid refresh is offered only when at least one new item exists.
  const order=shuffled(`${seed}|restock-v2|${contractId}|1`,available);
  return [...order.filter(id=>!first.includes(id)),...order.filter(id=>first.includes(id))].slice(0,3);
}

export function queueRestock(s,contractId){
  const c=s.challenge,owned=[...s.tools],options=restockOptions(s.seed,contractId,owned);
  if(!options.length){
    c.restocks.push({contractId,day:s.day,owned,refreshUsed:false,chosen:null,exhausted:true});
    s.log.push({day:s.day,text:'原创挑战：刑具已全部持有，本次整备没有可领取条目；调度券保持不变。'});
    return s;
  }
  c.restock={contractId,day:s.day,owned,options,refreshUsed:false};
  s.pending.unshift({kind:'tool',options:[...options],source:'challengeRestock'});
  s.log.push({day:s.day,text:'原创挑战：合约完成，可从公开的刑具整备中选择一件；选择不额外耗日。'});
  return s;
}

export function restockView(s){
  const r=s.challenge?.restock;if(!r)return null;
  const hasAlternative=TOOLS.filter(t=>!r.owned.includes(t.id)).length>r.options.length;
  const canRefresh=!r.refreshUsed&&s.challenge.tickets>=1&&hasAlternative;
  return {contractId:r.contractId,options:[...r.options],refreshUsed:r.refreshUsed,refreshCost:1,canRefresh,
    reason:r.refreshUsed?'本次刷新已使用':!hasAlternative?'剩余刑具已全部展示':s.challenge.tickets<1?'调度券不足':'花1张调度券刷新一次；至少更换一个选项，不退款。'};
}
