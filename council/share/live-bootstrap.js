import { createCouncilLive } from "../live-core.js?v=20261013-clicks1";
try {
  let library;
  try { library=await import("https://esm.sh/@supabase/supabase-js@2.87.3?bundle"); }
  catch(firstError) {
    library=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.87.3/+esm");
  }
  if(typeof library.createClient!=="function")throw new Error("Supabase SDK missing createClient");
  window.TorchCouncilLive=createCouncilLive(library.createClient);
} catch (error) {
  console.warn("Council share SDK could not load",error);
  window.TorchCouncilLive={available:false,isReady:()=>false,getCount:()=>0,
    hooks:{},start:async()=>{throw Error("实时服务连接失败，请刷新页面重试。");}};
}
await import("./v2-share-app.js?v=20261013-clicks1");
