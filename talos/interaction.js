import {canEat} from './engine.js?v=0.6.14-1';

// Selection is presentation state: it never consumes a prisoner or RNG.
export function pairDecision(state, source, target) {
  const a=state.rooms[source]?.prisoner,b=state.rooms[target]?.prisoner;
  if(state.phase!=='manage'||state.pending.length)return {action:null,reverse:null,reason:'当前无法进行吞噬'};
  if(!a||!b)return {action:null,reverse:null,reason:'请选择两名囚犯'};
  if(source===target)return {action:null,reverse:null,reason:'请选择另一名囚犯'};
  const reverse=canEat(state,b,a)?{type:'eat',room:target,prey:source}:null;
  if(canEat(state,a,b))return {action:{type:'eat',room:source,prey:target},reverse,reason:'可吃目标'};
  return {action:null,reverse,reason:a.tier!==b.tier?'稀有度不同，无法吞噬':'当前囚犯无法吞噬该代号'};
}
