import { createCouncilLive } from "./live-core.js";
try {
  const library=await import("https://esm.sh/@supabase/supabase-js@2.57.0?bundle");
  if(typeof library.createClient!=="function")throw new Error("Supabase SDK missing createClient");
  window.TorchCouncilLive=createCouncilLive(library.createClient);
} catch (error) {
  console.warn("Council live SDK could not load",error);
  window.TorchCouncilLive={available:false,isReady:()=>false,getCount:()=>0,
    hooks:{},start:async()=>{throw Error("实时服务连接失败，请刷新页面重试。");}};
}
await import("./app.js?v=20261012-live1");
