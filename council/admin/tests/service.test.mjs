import test from 'node:test';
import assert from 'node:assert/strict';
import {filterParams, questionsCsv, createAdminService} from '../core.mjs';

test('filters use inclusive Beijing dates, with the end converted to an exclusive bound',()=>{
  assert.deepEqual(filterParams({from:'2026-10-13',to:'2026-10-13',query:' 初火 '},2),{
    p_status:'all',p_query:'初火',p_keyword:'',p_from:'2026-10-12T16:00:00.000Z',p_to:'2026-10-13T16:00:00.000Z',p_sort:'recent',p_page:2,p_size:30
  });
  assert.throws(()=>filterParams({from:'2026-10-14',to:'2026-10-13'}));
});
test('CSV preserves multiline Chinese text and neutralizes spreadsheet formulas',()=>{
  const csv=questionsCsv([{id:'id',body:' =HYPERLINK("x")\n下一行',note:'@SUM(1)',status:'pending',keywords:['掉落'],clicks:9}]);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\' =HYPERLINK(""x"")\n下一行"'));assert.ok(csv.includes('"\'@SUM(1)"'));assert.ok(!csv.includes('author_id'));
});
test('admin storage stays separate, invalid admin logins are signed out locally',async()=>{
  let options, signedOut;
  const storage={};
  const service=createAdminService((url,key,config)=>{
    options=config;assert.match(key,/^sb_publishable_/);
    return {auth:{signInWithPassword:async()=>({}),getUser:async()=>({data:{user:{id:'u',email:'a@test',is_anonymous:false}}}),signOut:async opt=>{signedOut=opt;return{};}},rpc:async()=>({error:{code:'42501',message:'Denied'}})};
  },storage);
  assert.equal(options.auth.storage,storage);assert.equal(options.auth.storageKey,'torchlight-council-admin-v1');
  await assert.rejects(service.login('a@test','p'));assert.deepEqual(signedOut,{scope:'local'});
});
test('export retrieves subsequent pages and rejects oversized exports without silently truncating',async()=>{
  let calls=[];
  const service=createAdminService(()=>({rpc:async(name,params)=>{
    calls.push(params.p_page);return {data:{total:101,rows:Array.from({length:params.p_page===1?100:1},(_,i)=>({id:`${params.p_page}-${i}`}))}};
  }}),{});
  const rows=await service.exportRows({status:'pending'});assert.equal(rows.length,101);assert.deepEqual(calls,[1,2]);
  await assert.rejects(service.exportRows({},100),/超过 100 条/);
});
test('export freezes new submissions, uses chronological order and detects concurrent moderation',async()=>{
  const params=[];
  const service=createAdminService(()=>({rpc:async(name,p)=>{
    params.push(p);return{data:{total:p.p_page===1?101:100,snapshot_at:'2026-10-13T11:00:00Z',rows:Array.from({length:p.p_page===1?100:1},(_,i)=>({id:`${p.p_page}-${i}`}))}};
  }}),{});
  await assert.rejects(service.exportRows({sort:'hot'}),/审核结果发生变化/);
  assert.equal(params[0].p_sort,'recent');assert.equal(params[1].p_to,'2026-10-13T11:00:00Z');
});
