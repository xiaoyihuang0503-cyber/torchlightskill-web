import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db;
const admin='11111111-1111-4111-8111-111111111111';
const player='22222222-2222-4222-8222-222222222222';
const member='33333333-3333-4333-8333-333333333333';
const q1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const q2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const q3='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function identity(id,anonymous=false,role='authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,is_anonymous:anonymous,app_metadata:{council_admin:true},user_metadata:{council_admin:true}})]);
  await db.exec(`set role ${role}`);
}
before(async()=>{
  db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; grant usage on schema auth to anon,authenticated;
    create table auth.users(id uuid primary key, email text, is_anonymous boolean);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    create table public.council_questions(id uuid primary key, author_id uuid references auth.users(id), body text not null, keywords text[] not null default '{}', status text not null check(status in ('pending','approved','rejected')), created_at timestamptz default now());
    create table public.council_seat_stats(seat_key text primary key, support_count bigint default 0);
    alter table public.council_questions enable row level security;
    grant select on public.council_questions to anon,authenticated;
    create policy approved_read on public.council_questions for select to anon,authenticated using(status='approved');
    create policy own_read on public.council_questions for select to authenticated using(author_id=(select auth.uid()));
    insert into auth.users values('${admin}','owner@example.test',false),('${player}',null,true),('${member}','member@example.test',false);
    insert into public.council_questions(id,author_id,body,keywords,status,created_at) values
      ('${q1}','${player}','初火掉率到底调了多少？',array['掉落'],'pending','2026-10-13T09:00:00Z'),
      ('${q2}','${player}','宠物反复切换真的太麻烦了',array['契灵'],'pending','2026-10-13T10:00:00Z'),
      ('${q3}','${player}','掉落数值什么时候公开说明？',array['掉落'],'approved','2026-10-12T10:00:00Z');
    insert into public.council_seat_stats values('question:${q1}',42),('question:${q3}',7);
  `);
  const sql=await readFile(new URL('../../supabase/admin-setup.sql',import.meta.url),'utf8');
  await db.exec(sql);
  // Setup is repeatable and does not reset data.
  await db.exec(sql);
  await db.query('insert into council_admin_private.admins(user_id) values($1)',[admin]);
});
after(async()=>{await db.close();});

test('ordinary anonymous players cannot read or moderate the admin data',async()=>{
  await identity(player,true);
  await assert.rejects(db.query('select public.council_admin_overview()'),/administrator access/);
  await assert.rejects(db.query('select public.council_admin_moderate($1::uuid[], $2)',[[q1],'approved']),/administrator access/);
  await assert.rejects(db.query('select * from council_admin_private.admins'),/permission denied/);
  await assert.rejects(db.query('update public.council_questions set status=$1 where id=$2',['approved',q1]),/permission denied/);
  await identity(member,false);
  await assert.rejects(db.query('select public.council_admin_overview()'),/administrator access/);
  // App/user metadata alone never grants membership.
  await identity(null,false,'anon');
  await assert.rejects(db.query('select public.council_admin_overview()'),/permission denied/);
  const rows=await db.query('select id from public.council_questions');assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].id,q3);
});
test('the allowlisted admin can search, filter by Beijing dates, paginate and order by heat',async()=>{
  await identity(admin);
  const summary=(await db.query('select public.council_admin_overview() as data')).rows[0].data;
  assert.equal(summary.total,3);assert.equal(summary.pending,2);assert.equal(summary.keywords[0].count,2);
  const result=(await db.query("select public.council_admin_list_questions('pending','','掉落',null,null,'hot',1,1) as data")).rows[0].data;
  assert.equal(result.total,1);assert.equal(result.rows[0].id,q1);assert.equal(result.rows[0].clicks,42);
  const search=(await db.query("select public.council_admin_list_questions('all','宠物') as data")).rows[0].data;assert.equal(search.total,1);
  const dates=(await db.query("select public.council_admin_list_questions('all','','','2026-10-12T16:00:00Z','2026-10-13T16:00:00Z') as data")).rows[0].data;assert.equal(dates.total,2);
});
test('moderation is atomic, preserves original text/counts, records audit and detects stale status',async()=>{
  await identity(admin);
  await db.query("select public.council_admin_moderate($1::uuid[],'approved','掉落','需要策划说明',null,false,'pending')",[[q1]]);
  await assert.rejects(db.query("select public.council_admin_moderate($1::uuid[],'rejected',null,null,null,false,'pending')",[[q1]]),/status changed/);
  await assert.rejects(db.query("select public.council_admin_moderate($1::uuid[],'rejected')",[[q1,'99999999-9999-4999-8999-999999999999']]),/no longer exists/);
  const row=(await db.query("select public.council_admin_list_questions('all','初火') as data")).rows[0].data.rows[0];
  assert.equal(row.status,'approved');assert.equal(row.body,'初火掉率到底调了多少？');assert.equal(row.clicks,42);assert.equal(row.note,'需要策划说明');assert.equal(row.history.length,1);
});
test('merging keeps the source record and original heat, prohibits self/pending destinations and can be undone',async()=>{
  await identity(admin);
  await assert.rejects(db.query("select public.council_admin_moderate($1::uuid[],'rejected',null,null,$2)",[[q1],q1]),/Invalid moderation/);
  await assert.rejects(db.query("select public.council_admin_moderate($1::uuid[],'rejected',null,null,$2)",[[q1],q2]),/destination must be/);
  await db.query("select public.council_admin_moderate($1::uuid[],'rejected',null,null,$2)",[[q1],q3]);
  let row=(await db.query("select public.council_admin_list_questions('rejected','初火') as data")).rows[0].data.rows[0];
  assert.equal(row.merged_into,q3);assert.equal(row.clicks,42);assert.equal(row.body,'初火掉率到底调了多少？');
  // Existing sources cannot be left in an invisible chain by merging their destination.
  await db.query("select public.council_admin_moderate($1::uuid[],'approved')",[[q2]]);
  await assert.rejects(db.query("select public.council_admin_moderate($1::uuid[],'rejected',null,null,$2)",[[q3],q2]),/Unmerge existing source/);
  await identity(null,false,'anon');
  const publicRows=await db.query('select id from public.council_questions');assert.ok(!publicRows.rows.some(x=>x.id===q1));
  await identity(admin);
  await db.query("select public.council_admin_moderate($1::uuid[],'approved',null,null,null,true)",[[q1]]);
  row=(await db.query("select public.council_admin_list_questions('approved','初火') as data")).rows[0].data.rows[0];assert.equal(row.merged_into,null);assert.equal(row.clicks,42);
});
test('membership revocation takes effect for the next request without a JWT refresh',async()=>{
  await db.exec('reset role');await db.query('delete from council_admin_private.admins where user_id=$1',[admin]);
  await identity(admin);
  await assert.rejects(db.query('select public.council_admin_overview()'),/administrator access/);
});
