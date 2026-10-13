import {CATEGORIES,STATUS_LABELS,createAdminService,formatTime,questionsCsv,friendlyError} from './core.mjs';
const $ = id => document.getElementById(id);
const state = {service:null, user:null, filters:{}, page:1, total:0, rows:[], selected:new Set(), revision:0, busy:false, editor:null};
const number = n => Number(n || 0).toLocaleString('zh-CN');
function el(tag,text,className) {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function option(value,label) {const node=el('option',label);node.value=value;return node;}
function notice(message,error=false) {$('notice').textContent=message;$('notice').dataset.error=String(error);$('notice').hidden=!message;}
function clearWorkspace() {
  state.revision++; state.user=null; state.rows=[]; state.selected.clear(); state.editor=null;
  for(const id of ['questions','stats','keywords','history','original-body']) $(id).replaceChildren();
  if($('editor').open)$('editor').close();
  $('workspace').hidden=true;$('login-panel').hidden=false;$('account').hidden=true;$('account').textContent='';$('logout').hidden=true;
}
function failure(error) {
  if(['42501','PGRST301','PGRST302'].includes(error?.code)) clearWorkspace();
  notice(friendlyError(error),true);
}
function readFilters() {return {query:$('query').value,status:$('status').value,keyword:$('keyword').value,from:$('from-date').value,to:$('to-date').value,sort:$('sort').value};}
function updateSelection() {
  $('selected-count').textContent=`已选 ${state.selected.size} 条`;
  $('select-all').checked=state.rows.length>0 && state.rows.every(q=>state.selected.has(q.id));
  $('select-all').indeterminate=state.selected.size>0 && !$('select-all').checked;
  for(const id of ['bulk-approve','bulk-reject'])$(id).disabled=!state.selected.size || state.busy;
}
function renderStats(data) {
  const frag=document.createDocumentFragment();
  for(const [key,label] of [['total','全部投稿'],['pending','待审核'],['approved','已公开'],['rejected','已拒绝 / 已归并']]) {
    const card=el('div',undefined,'stat');card.dataset.status=key;card.append(el('span',label),el('strong',number(data[key])));frag.append(card);
  }
  $('stats').replaceChildren(frag);
  const keys=[...new Set([...CATEGORIES,...(data.keywords || []).map(k=>k.keyword)])];
  $('keyword').replaceChildren(option('','全部关键词'),...keys.map(k=>option(k,k)));$('keyword').value=state.filters.keyword || '';
  const chips=document.createDocumentFragment();
  for(const k of (data.keywords || []).slice(0,15)) {
    const button=el('button',`${k.keyword} ${number(k.count)}`);button.type='button';button.classList.toggle('active',state.filters.keyword===k.keyword);
    button.onclick=()=>{if(state.busy)return;$('keyword').value=state.filters.keyword===k.keyword?'':k.keyword;state.filters=readFilters();state.page=1;reload();};chips.append(button);
  }
  if(!chips.childNodes.length)chips.append(el('span','暂无投稿关键词','muted'));
  $('keywords').replaceChildren(chips);
}
function actionButton(label,handler) {const button=el('button',label);button.type='button';button.disabled=state.busy;button.onclick=handler;return button;}
function renderQuestions() {
  const frag=document.createDocumentFragment();
  for(const q of state.rows) {
    const article=el('article',undefined,'question');
    const check=document.createElement('input');check.type='checkbox';check.checked=state.selected.has(q.id);check.disabled=state.busy;check.setAttribute('aria-label',`选择问题：${q.body}`);
    check.onchange=()=>{check.checked?state.selected.add(q.id):state.selected.delete(q.id);updateSelection();};
    const content=el('div');content.append(el('p',q.body,'question-text'));
    const meta=el('div',undefined,'question-meta');const badge=el('span',q.merged_into?'已归并':STATUS_LABELS[q.status],'badge');badge.dataset.status=q.status;
    meta.append(badge,el('time',formatTime(q.created_at)),el('span',`${number(q.clicks)} 次点击`));content.append(meta);
    if(q.merged_into)content.append(el('p',`归并到：${q.merged_body || q.merged_into}`,'question-note'));
    if(q.note)content.append(el('p',`内部备注：${q.note}`,'question-note'));
    const foot=el('div',undefined,'question-foot');const tags=el('div',undefined,'question-tags');
    for(const k of q.keywords || [])tags.append(el('span',k,'tag'));
    if(q.category)tags.append(el('span',`分类 · ${q.category}`,'tag'));
    const actions=el('div',undefined,'question-actions');
    if(q.status!=='approved')actions.append(actionButton('公开',()=>moderate([q.id],'approved',q.status)));
    if(q.status!=='rejected')actions.append(actionButton('拒绝',()=>moderate([q.id],'rejected',q.status)));
    actions.append(actionButton('整理',()=>openEditor(q)));foot.append(tags,actions);content.append(foot);article.append(check,content);frag.append(article);
  }
  if(!state.rows.length)frag.append(el('div','没有符合筛选条件的问题。','empty'));
  $('questions').replaceChildren(frag);
  const pages=Math.max(1,Math.ceil(state.total/30));$('page-label').textContent=`共 ${number(state.total)} 条 · 第 ${state.page} / ${pages} 页`;
  $('previous').disabled=state.page<=1 || state.busy;$('next').disabled=state.page>=pages || state.busy;updateSelection();
}
function setBusy(busy) {
  state.busy=busy;$('questions').setAttribute('aria-busy',String(busy));
  for(const id of ['refresh','export','select-all','previous','next'])$(id).disabled=busy;
  for(const node of $('filters').elements)node.disabled=busy;
  for(const node of $('questions').querySelectorAll('button,input'))node.disabled=busy;
  updateSelection();
}
async function reload() {
  if(!state.user)return;
  const revision=++state.revision;state.selected.clear();setBusy(true);
  try {
    const [overview,data]=await Promise.all([state.service.overview(),state.service.list(state.filters,state.page)]);
    if(revision!==state.revision || !state.user)return;
    // A moderation operation can remove the final row from the final page.
    const maxPage=Math.max(1,Math.ceil(Number(data.total)/30));
    if(state.page>maxPage){state.page=maxPage;return await reload();}
    state.rows=data.rows || [];state.total=Number(data.total)||0;renderStats(overview);renderQuestions();
  } catch(error) {if(revision===state.revision)failure(error);}
  finally {if(revision===state.revision){setBusy(false);renderQuestions();}else if(!state.user){setBusy(false);}}
}
async function enter(user) {
  state.user=user;state.page=1;state.filters=readFilters();$('workspace').hidden=false;$('login-panel').hidden=true;
  $('account').textContent=user.email;$('account').hidden=false;$('logout').hidden=false;notice('');await reload();
}
async function moderate(ids,status,expected) {
  if(state.busy)return;
  setBusy(true);
  try {
    await state.service.moderate({p_ids:ids,p_status:status,p_expected_status:expected || null});
    notice(`已处理 ${ids.length} 条：${STATUS_LABELS[status]}。`);await reload();
  } catch(error) {failure(error);}
  finally {setBusy(false);if(state.user)renderQuestions();}
}
function openEditor(q) {
  state.editor=q;$('original-body').textContent=q.body;$('edit-status').value=q.status;$('edit-category').value=q.category || '';$('edit-note').value=q.note || '';$('merge-search').value='';
  $('merge-target').replaceChildren(option('','不归并'));
  if(q.merged_into){$('merge-target').append(option(q.merged_into,q.merged_body || q.merged_into));$('merge-target').value=q.merged_into;}
  $('edit-error').hidden=true;$('edit-error').textContent='';
  const entries=(q.history || []).map(h=>el('p',`${formatTime(h.at)} · ${STATUS_LABELS[h.before.status]} → ${STATUS_LABELS[h.after.status]}${h.after.category ? ' · '+h.after.category : ''}${h.after.merged_into ? ' · 归并问题' : ''}`));
  $('history').replaceChildren(...(entries.length?[el('strong','最近处理记录'),...entries]:[]));
  $('editor').showModal();
}
async function connect() {
  $('login-button').disabled=true;$('retry').hidden=true;
  try {
    let sdk;
    try {sdk=await import('https://esm.sh/@supabase/supabase-js@2.87.3?bundle');}
    catch {sdk=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.87.3/+esm');}
    // Dedicated storage prevents admin login from replacing the public voter.
    state.service=createAdminService(sdk.createClient,window.sessionStorage);
    try {const user=await state.service.restore();if(user)await enter(user);}
    catch(error){await state.service.logout().catch(()=>{});failure(error);}
    $('login-button').textContent='登录工作台';$('login-button').disabled=false;
  } catch(error) {notice('后台连接失败，请检查网络后重新连接。',true);$('retry').hidden=false;}
}
CATEGORIES.forEach(k=>$('edit-category').append(option(k,k)));
$('retry').onclick=connect;
$('login-form').onsubmit=async event=>{
  event.preventDefault();if(!state.service)return;$('login-button').disabled=true;notice('');
  try {const user=await state.service.login($('email').value.trim(),$('password').value);$('password').value='';await enter(user);}
  catch(error){$('password').value='';failure(error);}
  finally{$('login-button').disabled=false;}
};
$('logout').onclick=async()=>{clearWorkspace();try{await state.service.logout();notice('已退出登录。');}catch(error){failure(error);}};
$('refresh').onclick=()=>reload();
$('filters').onsubmit=event=>{event.preventDefault();state.filters=readFilters();state.page=1;notice('');reload();};
$('reset-filters').onclick=()=>{$('filters').reset();state.filters=readFilters();state.page=1;notice('');reload();};
$('select-all').onchange=event=>{state.selected.clear();if(event.target.checked)state.rows.forEach(q=>state.selected.add(q.id));renderQuestions();};
$('bulk-approve').onclick=()=>moderate([...state.selected],'approved');
$('bulk-reject').onclick=()=>moderate([...state.selected],'rejected');
$('previous').onclick=()=>{state.page--;reload();};$('next').onclick=()=>{state.page++;reload();};
$('export').onclick=async()=>{
  if(state.busy)return;setBusy(true);const revision=state.revision;
  try {
    const rows=await state.service.exportRows({...state.filters});if(revision!==state.revision || !state.user)return;
    const url=URL.createObjectURL(new Blob([questionsCsv(rows)],{type:'text/csv;charset=utf-8'}));
    const link=el('a');link.href=url;link.download=`火炬议会-玩家问题-${new Date().toISOString().slice(0,10)}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notice(`已导出 ${number(rows.length)} 条筛选结果。`);
  } catch(error){failure(error);}finally{setBusy(false);if(state.user)renderQuestions();}
};
for(const id of ['close-editor','cancel-editor'])$(id).onclick=()=>{$('editor').close();state.editor=null;};
$('editor').addEventListener('close',()=>{state.editor=null;});
$('find-targets').onclick=async()=>{
  const q=state.editor;if(!q)return;$('find-targets').disabled=true;
  try {
    const data=await state.service.list({status:'approved',query:$('merge-search').value},1,50);
    if(state.editor!==q)return;
    const current=$('merge-target').value;
    const targets=(data.rows || []).filter(row=>row.id!==q.id && !row.merged_into);
    if(q.merged_into && !targets.some(row=>row.id===q.merged_into))targets.unshift({id:q.merged_into,body:q.merged_body || q.merged_into});
    $('merge-target').replaceChildren(option('','不归并'),...targets.map(row=>option(row.id,row.body)));
    if(targets.some(row=>row.id===current))$('merge-target').value=current;
    if(!targets.length){$('edit-error').textContent='没有找到可归并的已公开问题。';$('edit-error').hidden=false;}
  } catch(error){if(error?.code==='42501')failure(error);else{$('edit-error').textContent=friendlyError(error);$('edit-error').hidden=false;}}
  finally{$('find-targets').disabled=false;}
};
$('merge-target').onchange=()=>{if($('merge-target').value)$('edit-status').value='rejected';};
$('edit-form').onsubmit=async event=>{
  event.preventDefault();const q=state.editor;if(!q)return;
  const target=$('merge-target').value;
  if(target && $('edit-status').value!=='rejected'){$('edit-error').textContent='归并的问题需要设为已拒绝；如需重新公开，请先选“不归并”。';$('edit-error').hidden=false;return;}
  const params={p_ids:[q.id],p_status:$('edit-status').value,p_category:$('edit-category').value,p_note:$('edit-note').value.trim(),p_merged_into:target || null,p_unmerge:!target,p_expected_status:q.status};
  // Keep the modal fixed during the write; all values sent above are captured.
  for(const node of $('edit-form').elements)node.disabled=true;
  try{await state.service.moderate(params);$('editor').close();notice('问题已整理，原文与已有点击记录已保留。');await reload();}
  catch(error){if(error?.code==='42501')failure(error);else{$('edit-error').textContent=friendlyError(error);$('edit-error').hidden=false;}}
  finally{for(const node of $('edit-form').elements)node.disabled=false;}
};
connect();
