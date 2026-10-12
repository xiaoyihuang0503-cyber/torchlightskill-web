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
  const counts={hero:{},maze:{},roundtable:{},mode_reduction:{},ember_drop_data:{},reward_access:{},legacy_friction:{}};
  const ownVotes={};
  let keywordRows=[];
  let questions=[];
  let petitionTotal=0;
  let seatStats={};
  let mySeats=[];
  let channel=null,started=false,ready=false,refreshTimer=null,refreshing=false,lastEvent=0;
  const hooks={
    onCounts:null,onKeywordStats:null,onQuestions:null,onVoteEvent:null,
    onOwnVotes:null,onStatus:null,onSeatStats:null,onMySeats:null,onSeatEvent:null,onPetition:null
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
    if(!["hero","maze","roundtable","mode_reduction","ember_drop_data","reward_access","legacy_friction"].includes(topic)||!/^[a-z0-9_]{2,40}$/.test(choice))throw Error("投票选项不正确");
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

  async function refreshSeatStats(){
    const {data,error}=await client.from("council_seat_stats")
      .select("seat_key,support_count");
    if(error)throw Error(errText(error,"读取圆桌支持数"));
    seatStats={};
    for(const row of data||[])seatStats[row.seat_key]=Math.max(0,Number(row.support_count)||0);
    call("onSeatStats",seatStats);
    return seatStats;
  }
  async function refreshMySeats(){
    const {data:{session},error:authError}=await client.auth.getSession();
    if(authError)throw authError;
    if(!session?.access_token){mySeats=[];call("onMySeats",mySeats);return mySeats;}
    const {data,error}=await client.rpc("council_my_supported_seats");
    if(error)throw Error(errText(error,"读取已支持的问题"));
    mySeats=Array.isArray(data)?data:[];
    call("onMySeats",mySeats);
    return mySeats;
  }
  async function bombIssue(seat,clicks=1){
    if(typeof seat!=="string"||
       !/^(topic:[a-z0-9_]+|question:[0-9a-f-]{36})$/.test(seat))throw Error("问题编号不正确");
    if(!Number.isInteger(clicks)||clicks<1||clicks>25)throw Error("单次点击批量需要 1～25 次");
    await ensureAnonymousAuth();
    const {data,error}=await client.rpc("council_bomb_issue",{p_seat:seat,p_clicks:clicks});
    if(error)throw Error(errText(error,"统计炸弹点击"));
    if(data?.seat===seat){
      const amount=Math.max(0,Number(data.accepted)||0);
      if(Number.isFinite(Number(data.count))){
        seatStats={...seatStats,[seat]:Math.max(0,Number(data.count))};
        call("onSeatStats",seatStats);
      }
      if(Number.isFinite(Number(data.total))){
        petitionTotal=Math.max(0,Number(data.total));
        call("onPetition",{total:petitionTotal});
      }
      return {...data,changed:amount>0,accepted:amount};
    }
    throw Error("炸弹点击未返回有效结果，请重试");
  }
  async function supportSeat(seat){
    // Backward-compatible share-page method: every tap counts, no unique-user lock.
    return bombIssue(seat,1);
  }
  async function getApprovedQuestion(id){
    if(!/^[0-9a-f-]{36}$/.test(String(id||"")))return null;
    const {data,error}=await client.from("council_questions").select("id,body,status,created_at")
      .eq("id",id).eq("status","approved").maybeSingle();
    if(error)return null;
    return data&&data.status==="approved"?{id:data.id,text:data.body,status:data.status,at:Date.parse(data.created_at)||Date.now()}:null;
  }
  async function refreshPetition(){
    const {data,error}=await client.from("council_petition_totals")
      .select("total_clicks").eq("id","ask_official").maybeSingle();
    if(error)throw Error(errText(error,"读取全站回应数"));
    petitionTotal=Math.max(0,Number(data?.total_clicks)||0);
    call("onPetition",{total:petitionTotal});
    return petitionTotal;
  }
  async function addPetition(clicks){
    if(!Number.isInteger(clicks)||clicks<1||clicks>25)throw Error("点击数量不正确");
    await ensureAnonymousAuth();
    const {data,error}=await client.rpc("council_add_petition",{p_clicks:clicks});
    if(error)throw Error(errText(error,"同步火苗"));
    if(data&&Number.isFinite(Number(data.total))){
      petitionTotal=Math.max(0,Number(data.total));
      call("onPetition",{total:petitionTotal});
    }
    return data;
  }
  async function refreshAll(){
    if(refreshing)return;
    refreshing=true;
    try{
      const results=await Promise.allSettled([refreshChoices(),refreshKeywordStats(),refreshQuestions(),refreshSeatStats(),refreshPetition()]);
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
        if(!row||!Object.prototype.hasOwnProperty.call(counts,row.topic_id))return;
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

      .on("postgres_changes",{event:"*",schema:"public",table:"council_seat_stats"},payload=>{
        const row=payload?.new;
        if(row?.seat_key){
          seatStats={...seatStats,[row.seat_key]:Math.max(0,Number(row.support_count)||0)};
          call("onSeatStats",seatStats);
        }
      })
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"council_seat_events"},payload=>{
        const row=payload?.new;
        if(row?.seat_key)call("onSeatEvent",{seat:row.seat_key,id:Number(row.id)||0});
      })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"council_petition_totals"},payload=>{
        const row=payload?.new;
        if(row?.id!=="ask_official")return;
        petitionTotal=Math.max(0,Number(row.total_clicks)||0);
        call("onPetition",{total:petitionTotal});
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
    try{await Promise.all([refreshOwnVotes(),refreshMySeats()]);}catch(error){call("onStatus",{state:"polling",message:"我的投票记录读取失败"});}
    subscribe();
    refreshTimer=window.setInterval(()=>{if(!document.hidden)refreshAll();},30000);
  }
  function stop(){
    if(refreshTimer)window.clearInterval(refreshTimer);
    if(channel){client.removeChannel(channel);channel=null;}
    started=false;
  }
  return {
    available:true,hooks,counts,ownVotes,start,stop,vote,submitQuestion,supportSeat,bombIssue,getApprovedQuestion,refreshSeatStats,refreshMySeats,refreshPetition,addPetition,
    refreshAll,refreshChoices,refreshQuestions,refreshKeywordStats,refreshOwnVotes,
    getCount:(topic,choice)=>Number(counts[topic]?.[choice]||0),
    isReady:()=>ready,
    getPetitionTotal:()=>petitionTotal,
    getSeatCount:(seat)=>Number(seatStats[seat]||0),
    hasSupported:(seat)=>mySeats.includes(seat),
    getSeatStats:()=>({...seatStats}),
    getKeywords:()=>keywordRows.slice(),
    getQuestions:()=>questions.slice()
  };
}
