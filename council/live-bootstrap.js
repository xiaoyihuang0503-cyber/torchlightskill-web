/* Load local UI immediately. Supabase SDK is fetched in the background so slow
   mobile CDN connections cannot prevent the lottery from opening. */
import { createCouncilLive } from "./live-core.js";

let delegate=null;
const blankVotes={};
const hooks={};
const sdkPromise=(async()=>{
 try {
   let sdk;
   try { sdk=await import("https://esm.sh/@supabase/supabase-js@2.87.3?bundle"); }
   catch(firstError) { sdk=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.87.3/+esm"); }
   if(typeof sdk.createClient!=="function")throw Error("Supabase client SDK is unavailable");
   return createCouncilLive(sdk.createClient);
 }catch(error){
   console.warn("Council realtime connection unavailable; lottery remains playable",error);
   return null;
 }
})();
async function connected(){
 if(!delegate)delegate=await sdkPromise;
 if(!delegate)throw Error("实时投票暂时无法连接，随机抽英雄仍可以使用。");
 return delegate;
}
function read(method,args,fallback){
 if(!delegate||typeof delegate[method]!=="function")return fallback;
 return delegate[method](...args);
}
window.TorchCouncilLive={
 available:true,
 hooks,
 get ownVotes(){return delegate?.ownVotes||blankVotes;},
 isReady(){return read("isReady",[],false);},
 getCount(...args){return read("getCount",args,0);},
 getSeatCount(...args){return read("getSeatCount",args,0);},
 getPetitionTotal(){return read("getPetitionTotal",[],0);},
 hasSupported(...args){return read("hasSupported",args,false);},
 getQuestions(){return read("getQuestions",[],[]);},
 getKeywords(){return read("getKeywords",[],[]);},
 async start(){
   const live=await connected();
   Object.assign(live.hooks,hooks);
   return live.start();
 },
 async vote(...args){return (await connected()).vote(...args);},
 async supportSeat(...args){return (await connected()).supportSeat(...args);},
 async addPetition(...args){return (await connected()).addPetition(...args);},
 async submitQuestion(...args){return (await connected()).submitQuestion(...args);},
 async getApprovedQuestion(...args){return (await connected()).getApprovedQuestion(...args);}
};
await import("./v2-app.js?v=20261012-bombv3");
