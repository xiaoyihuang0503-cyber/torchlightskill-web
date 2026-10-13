// Same public project configuration as ../live-core.js. No privileged keys.
export const PROJECT_URL = 'https://eflkiihedqlcaibpyoqr.supabase.co';
export const PUBLISHABLE_KEY = 'sb_publishable_hd3DBzqzJsK2tVeQxgPENQ_wjiqHdHP';
export const CATEGORIES = ['掉落','迷城','刷图收益','英雄平衡','契灵','赛季玩法','装备打造','交易价格','开荒难度','游戏体验','其他'];
export const STATUS_LABELS = {pending:'待审核', approved:'已公开', rejected:'已拒绝'};

export function filterParams(filters = {}, page = 1, size = 30) {
  const from = filters.from ? new Date(`${filters.from}T00:00:00+08:00`) : null;
  const to = filters.to ? new Date(`${filters.to}T00:00:00+08:00`) : null;
  if ((from && !Number.isFinite(+from)) || (to && !Number.isFinite(+to))) throw Error('日期格式不正确。');
  if (to) to.setUTCDate(to.getUTCDate() + 1);
  if (from && to && +from >= +to) throw Error('开始日期需要早于或等于结束日期。');
  return {
    p_status: filters.status || 'all', p_query: String(filters.query || '').trim(),
    p_keyword: filters.keyword || '', p_from: from?.toISOString() || null,
    p_to: to?.toISOString() || null, p_sort: filters.sort || 'recent', p_page: page, p_size: size
  };
}

export function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(+date) ? date.toLocaleString('zh-CN', {timeZone:'Asia/Shanghai', hour12:false}) : '—';
}

function csvCell(value) {
  let text = String(value ?? '');
  // Prevent user-supplied spreadsheet formulas, including leading whitespace.
  if (/^[\s]*[=+\-@]/u.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
}
export function questionsCsv(rows) {
  const header = ['问题ID','投稿原文','审核状态','原始关键词','运营分类','点击次数','投稿时间（北京）','处理时间（北京）','归并目标ID','内部备注'];
  const data = rows.map(q => [q.id,q.body,STATUS_LABELS[q.status] || q.status,(q.keywords || []).join('、'),q.category,q.clicks,formatTime(q.created_at),q.reviewed_at ? formatTime(q.reviewed_at) : '',q.merged_into,q.note]);
  return '\uFEFF' + [header,...data].map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function friendlyError(error) {
  if (error?.code === '42501') return '这个账号没有管理员权限，或权限已被撤销。';
  if (error?.code === 'PGRST202' || /function.*schema cache/i.test(error?.message || '')) return '后台接口尚未安装，请先执行 admin-setup.sql 并绑定管理员账号。';
  if (error?.code === '40001') return '问题状态已被其他管理员修改，请刷新后再处理。';
  if (/Invalid login credentials/i.test(error?.message || '')) return '邮箱或密码不正确，请检查后重试。';
  if (/network|fetch|timeout|Failed to/i.test(error?.message || '')) return '网络连接失败，请重试。';
  if (/Merge destination/i.test(error?.message || '')) return '归并目标需要是已公开且未归并的问题。';
  if (/Unmerge existing source/i.test(error?.message || '')) return '本条已有其他问题归并到它，请先解除这些归并，再更换目标。';
  return String(error?.message || error || '操作失败，请重试。').slice(0,180);
}

export function createAdminService(createClient, storage) {
  const client = createClient(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: {storage, storageKey:'torchlight-council-admin-v1', persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}
  });
  async function rpc(name, params) {
    const {data,error} = await client.rpc(name,params);
    if (error) throw error;
    return data;
  }
  async function authorize() {
    const {data,error} = await client.auth.getUser();
    if (error) throw error;
    if (!data?.user || data.user.is_anonymous) throw Object.assign(Error('请使用管理员邮箱登录。'),{code:'42501'});
    await rpc('council_admin_session');
    return data.user;
  }
  return {
    async restore() {
      const {data,error} = await client.auth.getSession();
      if (error) throw error;
      return data?.session ? authorize() : null;
    },
    async login(email,password) {
      const {error} = await client.auth.signInWithPassword({email,password});
      if (error) throw error;
      try { return await authorize(); }
      catch (error) { await client.auth.signOut({scope:'local'}); throw error; }
    },
    async logout() {
      const {error} = await client.auth.signOut({scope:'local'});
      if (error) throw error;
    },
    overview: () => rpc('council_admin_overview'),
    list: (filters,page=1,size=30) => rpc('council_admin_list_questions',filterParams(filters,page,size)),
    moderate: params => rpc('council_admin_moderate',params),
    async exportRows(filters, limit=10000) {
      let rows=[], expectedTotal=null, cutoff=null;
      const seen=new Set();
      for (let page=1; ; page++) {
        // Stable chronological order avoids live click counts moving rows
        // between pages. Freeze new submissions at the first server timestamp.
        const params=filterParams({...filters,sort:'recent'},page,100);
        if(cutoff)params.p_to=cutoff;
        const data = await rpc('council_admin_list_questions',params);
        if (Number(data.total)>limit) throw Error(`筛选结果超过 ${limit} 条，请缩小日期或关键词范围后导出。`);
        if (!Array.isArray(data.rows)) throw Error('导出数据格式不正确。');
        if(expectedTotal===null){
          expectedTotal=Number(data.total);
          if(data.snapshot_at)cutoff=params.p_to && Date.parse(params.p_to)<Date.parse(data.snapshot_at) ? params.p_to : data.snapshot_at;
        }else if(expectedTotal!==Number(data.total))throw Error('导出期间审核结果发生变化，请重试。');
        for(const row of data.rows){
          if(seen.has(row.id))throw Error('导出期间数据顺序发生变化，请重试。');
          seen.add(row.id);
        }
        rows.push(...data.rows);
        if (rows.length>=Number(data.total)) return rows;
        if (!data.rows.length) throw Error('导出期间数据发生变化，请重试。');
      }
    }
  };
}
