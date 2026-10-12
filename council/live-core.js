/* Public-only Supabase client. All privileged actions are SECURITY DEFINER RPCs.
 * The sb_publishable key is deliberately public. NEVER include service_role / secret keys.
 */
export function createCouncilLive(createClient) {
  const projectUrl="https://eflkiihedqlcaibpyoqr.supabase.co";
  const publishableKey="sb_publishable_hd3DBzqzJsK2tVeQxgPENQ_wjiqHdHP";
  const client=createClient(projectUrl,publishableKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
    realtime:{params:{eventsPerSecond:5}}
  });
  const counts={hero:{},maze:{},roundtable:{}};
  const ownVotes={};
  let keywordRows=[];
  let questions=[];
  let channel=null,started=false,ready=false,refreshTimer=null,refreshing=false,lastEvent=0;
  const hooks={
    onCounts:null,onKeywordStats:null,onQuestions:null,onVoteEvent:null,
    onOwnVotes:null,onStatus:null
  };
  function call(kind,payload){if(typeof hooks[kind]==="function")try{hooks[kind](payload);}catch(error){console.warn("council update handler",error);}}
  function errText(error,action){
    const message=String(error?.message||error||"网络连接失败");
    if(/anonymous|disabled|signup.*not.*allow|signups not allowed|Anonymous sign-ins/i.test(message)){
      return "匿名投票功能还未开启，请稍后再试。";
    }
    if(/Rate limit|Too many|429|rate limit/i.test(message))return "操作太频繁，请稍后再试。";
    if(/closed|结束/i.test(message))return "这道题已结束投票。";
    if(/network|fetch|timeout/i.test(message))return "网络连接失败，请检查网络后重试。";
    return (action||"操作失败")+"："+message.slice(0,130);
  }
  async function refreshChoices(){
    const {data,error}=await client.from("council_choices")
      .select("topic_id,choice_id,vote_count");
    if(error)throw Error(errText(error,"读取投票"));
    for(const topic of Object.keys(counts))counts[topic]={};
    (data||[]).forEach(row=>{
      if(Object.prototype.hasOwnProperty.call(counts,row.topic_id)){
        counts[row.topic_id][row.choice_id]=Math.max(0,Number(row.vote_count)||0);
      }
    });
    ready=true;
    call("onCounts",counts);
    return counts;
  }
  async function refreshKeywordStats(){
    const {data,error}=await client.from("council_keyword_stats")
      .select("keyword,question_count,updated_at").order("question_count",{ascending:false}).limit(30);
    if(error)throw Error(errText(error,"读取关键词"));
    keywordRows=(data||[]).map(r=>({keyword:r.keyword,count:Number(r.question_count)||0,updated_at:r.updated_at}));
    call("onKeywordStats",keywordRows);
    return keywordRows;
  }
  async function refreshQuestions(){
    // RLS returns all approved questions + only the current signed-in user's own pending rows.
    const {data,error}=await client.from("council_questions")
      .select("id,body,status,created_at").order("created_at",{ascending:false}).limit(20);
    if(error)throw Error(errText(error,"读取玩家问题"));
    questions=(data||[]).map(x=>({
      id:x.id,text:x.body,at:Date.parse(x.created_at)||Date.now(),status:x.status
    }));
    call("onQuestions",questions);
    return questions;
  }
  async function refreshOwnVotes(){
    const {data:{session},error:sessionError}=await client.auth.getSession();
    if(sessionError)throw sessionError;
    if(!session?.access_token){call("onOwnVotes",ownVotes);return ownVotes;}
    const {data,error}=await client.rpc("council_my_votes");
    if(error)throw Error(errText(error,"恢复投票"));
    for(const k of Object.keys(ownVotes))delete ownVotes[k];
    if(data&&typeof data==="object")Object.assign(ownVotes,data);
    call("onOwnVotes",ownVotes);
    return ownVotes;
  }
  async function ensureAnonymousAuth(){
    const existing=await client.auth.getSession();
    if(existing.error)throw Error(errText(existing.error,"验证投票"));
    if(!existing.data?.session?.access_token){
      const {error}=await client.auth.signInAnonymously();
      if(error)throw Error(errText(error,"匿名验证"));
    }
    return true;
  }
  async function vote(topic,choice){
    if(!["hero","maze","roundtable"].includes(topic)||!/^[a-z0-9_]{2,40}$/.test(choice))throw Error("投票选项不正确");
    await ensureAnonymousAuth();
    const {data,error}=await client.rpc("council_cast_vote",{p_topic:topic,p_choice:choice});
    if(error)throw Error(errText(error,"提交投票"));
    if(data?.counts && Object.prototype.hasOwnProperty.call(counts,topic)){
      counts[topic]={...counts[topic],...data.counts};
      call("onCounts",counts);
    }
    ownVotes[topic]=choice;
    call("onOwnVotes",ownVotes);
    return data||{topic,choice,changed:true};
  }
  async function submitQuestion(text){
    const clean=String(text||"").trim();
    if([...clean].length<8||[...clean].length>160)throw Error("问题需要 8～160 字");
    await ensureAnonymousAuth();
    const {data,error}=await client.rpc("council_submit_question",{p_body:clean});
    if(error)throw Error(errText(error,"提交问题"));
    await Promise.allSettled([refreshKeywordStats(),refreshQuestions()]);
    return data;
  }
  async function refreshAll(){
    if(refreshing)return;
    refreshing=true;
    try{
      const results=await Promise.allSettled([refreshChoices(),refreshKeywordStats(),refreshQuestions()]);
      if(results[0].status==="rejected")throw results[0].reason;
      if(!ready)throw Error("统计还未加载");
      call("onStatus",{state:"ready",message:"已连接真实投票"});
    }catch(error){call("onStatus",{state:"error",message:errText(error,"加载实时数据")});}
    finally{refreshing=false;}
  }
  function subscribe(){
    if(channel)return;
    channel=client.channel("torchlight-council-public")
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"council_choices"},payload=>{
        const row=payload?.new;
        if(!row||!Object.prototype.hasOwnProperty.call(counts,row.topic_id))return;
        counts[row.topic_id][row.choice_id]=Math.max(0,Number(row.vote_count)||0);
        call("onCounts",counts);
      })
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"council_vote_events"},payload=>{
        const row=payload?.new;
        if(!row||!["hero","maze","roundtable"].includes(row.topic_id))return;
        const id=Number(row.id)||0;
        if(id>0&&id<=lastEvent)return;
        if(id>0)lastEvent=id;
        // This stream deliberately has no voter name, IP, identity or question text.
        call("onVoteEvent",{topic:row.topic_id,choice:row.choice_id,action:row.action,id});
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"council_keyword_stats"},()=>{
        // Re-fetch all categories so inserts and updates share a consistent ordering.
        refreshKeywordStats().catch(()=>{});
      })
      .subscribe(status=>{
        if(status==="SUBSCRIBED")call("onStatus",{state:"ready",message:"实时更新已连接"});
        if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")
          call("onStatus",{state:"polling",message:"实时订阅暂不可用，将定时刷新"});
      });
  }
  async function start(){
    if(started)return;
    started=true;
    call("onStatus",{state:"loading",message:"正在读取真实票数…"});
    await refreshAll();
    try{await refreshOwnVotes();}catch(error){call("onStatus",{state:"polling",message:"投票记录读取失败，刷新可重试"});}
    subscribe();
    refreshTimer=window.setInterval(refreshAll,12000);
  }
  function stop(){
    if(refreshTimer)window.clearInterval(refreshTimer);
    if(channel){client.removeChannel(channel);channel=null;}
    started=false;
  }
  return {
    available:true,hooks,counts,ownVotes,start,stop,vote,submitQuestion,
    refreshAll,refreshChoices,refreshQuestions,refreshKeywordStats,refreshOwnVotes,
    getCount:(topic,choice)=>Number(counts[topic]?.[choice]||0),
    isReady:()=>ready,
    getKeywords:()=>keywordRows.slice(),
    getQuestions:()=>questions.slice()
  };
}
