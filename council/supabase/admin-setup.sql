-- Fire Torchlight Council admin setup. Run once via Supabase migrations when deploying.
-- Additive: does not publish/reject existing questions or alter voting functions.
begin;

create schema if not exists council_admin_private;
revoke all on schema council_admin_private from public, anon;
grant usage on schema council_admin_private to authenticated;

create table if not exists council_admin_private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists council_admin_private.reviews (
  question_id uuid primary key references public.council_questions(id) on delete cascade,
  category text not null default '',
  note text not null default '' check (char_length(note) <= 500),
  merged_into uuid references public.council_questions(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  check (merged_into is null or merged_into <> question_id)
);
create table if not exists council_admin_private.audit (
  id bigint generated always as identity primary key,
  question_id uuid not null references public.council_questions(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists council_admin_audit_question_time_idx
  on council_admin_private.audit(question_id, created_at desc);
alter table council_admin_private.admins enable row level security;
alter table council_admin_private.reviews enable row level security;
alter table council_admin_private.audit enable row level security;
revoke all on all tables in schema council_admin_private from public, anon, authenticated;
revoke all on all sequences in schema council_admin_private from public, anon, authenticated;

-- This private lookup intentionally bypasses RLS on the unexposed membership table.
-- All privileged workers call it before reading/writing any private information.
create or replace function council_admin_private.require_admin()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null
     or coalesce((auth.jwt()->>'is_anonymous')::boolean, true)
     or not exists (
       select 1 from council_admin_private.admins a
       join auth.users u on u.id = a.user_id
       where a.user_id = v_user and u.is_anonymous is false and u.email is not null
     ) then
    raise exception 'Council administrator access required' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

create or replace function council_admin_private.session()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := council_admin_private.require_admin();
begin
  return jsonb_build_object('user_id', v_user);
end;
$$;

create or replace function council_admin_private.overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform council_admin_private.require_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.council_questions),
    'pending', (select count(*) from public.council_questions where status='pending'),
    'approved', (select count(*) from public.council_questions where status='approved'),
    'rejected', (select count(*) from public.council_questions where status='rejected'),
    'keywords', coalesce((
      select jsonb_agg(jsonb_build_object('keyword', k.keyword, 'count', k.n) order by k.n desc, k.keyword)
      from (select keyword, count(distinct q.id) n
            from public.council_questions q
            cross join lateral unnest(q.keywords) keyword
            group by keyword) k
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function council_admin_private.list_questions(
  p_status text default 'all', p_query text default '', p_keyword text default '',
  p_from timestamptz default null, p_to timestamptz default null,
  p_sort text default 'recent', p_page integer default 1, p_size integer default 30
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_query text := btrim(coalesce(p_query,'')); v_result jsonb;
begin
  perform council_admin_private.require_admin();
  if p_status is null or p_status not in ('all','pending','approved','rejected')
     or p_sort is null or p_sort not in ('recent','hot')
     or p_page is null or p_page < 1 or p_page > 100000
     or p_size is null or p_size < 1 or p_size > 100
     or char_length(v_query) > 160 or char_length(coalesce(p_keyword,'')) > 40
     or (p_from is not null and p_to is not null and p_from >= p_to) then
    raise exception 'Invalid question filters' using errcode='22023';
  end if;
  with filtered as (
    select q.id, q.body, q.keywords, q.status, q.created_at,
           coalesce(s.support_count, 0) clicks,
           coalesce(r.category, '') category, coalesce(r.note, '') note,
           r.merged_into, target.body merged_body, r.reviewed_at,
           coalesce((select jsonb_agg(h.entry order by h.created_at desc) from
             (select a.created_at, jsonb_build_object('at',a.created_at,'before',a.before_state,'after',a.after_state) entry
              from council_admin_private.audit a where a.question_id=q.id
              order by a.created_at desc, a.id desc limit 5) h), '[]'::jsonb) history
    from public.council_questions q
    left join public.council_seat_stats s on s.seat_key='question:'||q.id::text
    left join council_admin_private.reviews r on r.question_id=q.id
    left join public.council_questions target on target.id=r.merged_into
    where (p_status='all' or q.status=p_status)
      and (v_query='' or position(lower(v_query) in lower(q.body)) > 0)
      and (coalesce(p_keyword,'')='' or p_keyword=any(q.keywords) or p_keyword=r.category)
      and (p_from is null or q.created_at >= p_from)
      and (p_to is null or q.created_at < p_to)
  ), page_rows as (
    select * from filtered
    order by case when p_sort='hot' then clicks else 0 end desc, created_at desc, id desc
    limit p_size offset (p_page-1)*p_size
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'page', p_page, 'size', p_size, 'snapshot_at', now(),
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by
      case when p_sort='hot' then x.clicks else 0 end desc, x.created_at desc, x.id desc)
      from page_rows x), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function council_admin_private.moderate(
  p_ids uuid[], p_status text default '', p_category text default null,
  p_note text default null, p_merged_into uuid default null,
  p_unmerge boolean default false, p_expected_status text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := council_admin_private.require_admin();
  v_ids uuid[]; v_id uuid; v_q public.council_questions%rowtype;
  v_review council_admin_private.reviews%rowtype;
  v_status text; v_category text; v_note text; v_merge uuid; v_before jsonb; v_after jsonb;
begin
  select array_agg(distinct i) into v_ids from unnest(p_ids) i where i is not null;
  if coalesce(cardinality(v_ids),0)<1 or cardinality(v_ids)>100
     or p_status is null or p_status not in ('','pending','approved','rejected')
     or (p_expected_status is not null and p_expected_status not in ('pending','approved','rejected'))
     or (p_category is not null and p_category not in ('','掉落','迷城','刷图收益','英雄平衡','契灵','赛季玩法','装备打造','交易价格','开荒难度','游戏体验','其他'))
     or char_length(coalesce(p_note,''))>500
     or (p_merged_into is not null and (p_merged_into=any(v_ids) or p_status<>'rejected' or p_unmerge)) then
    raise exception 'Invalid moderation request' using errcode='22023';
  end if;
  -- Lock the source(s) and merge destination in a stable order; concurrent merges
  -- cannot publish a destination which has just been withdrawn.
  perform id from public.council_questions
    where id=any(v_ids) or id=p_merged_into order by id for update;
  if (select count(*) from public.council_questions where id=any(v_ids))<>cardinality(v_ids) then
    raise exception 'Question no longer exists' using errcode='22023';
  end if;
  if p_merged_into is not null and not exists (
    select 1 from public.council_questions q
    left join council_admin_private.reviews r on r.question_id=q.id
    where q.id=p_merged_into and q.status='approved' and r.merged_into is null
  ) then
    raise exception 'Merge destination must be a published question' using errcode='22023';
  end if;
  if p_merged_into is not null and exists (
    select 1 from council_admin_private.reviews where merged_into=any(v_ids)
  ) then
    raise exception 'Unmerge existing source questions before merging their destination' using errcode='22023';
  end if;
  foreach v_id in array v_ids loop
    select * into v_q from public.council_questions where id=v_id;
    select * into v_review from council_admin_private.reviews where question_id=v_id;
    if p_expected_status is not null and v_q.status<>p_expected_status then
      raise exception 'Question status changed; refresh before saving' using errcode='40001';
    end if;
    v_status := case when p_status='' then v_q.status else p_status end;
    v_category := coalesce(p_category,v_review.category,'');
    v_note := coalesce(p_note,v_review.note,'');
    v_merge := case when v_status='approved' or p_unmerge then null else coalesce(p_merged_into,v_review.merged_into) end;
    if v_merge is not null and v_status<>'rejected' then
      raise exception 'Clear the merge before returning to pending' using errcode='22023';
    end if;
    v_before := jsonb_build_object('status',v_q.status,'category',coalesce(v_review.category,''),
      'note',coalesce(v_review.note,''),'merged_into',v_review.merged_into);
    v_after := jsonb_build_object('status',v_status,'category',v_category,'note',v_note,'merged_into',v_merge);
    if v_before=v_after then continue; end if;
    update public.council_questions set status=v_status where id=v_id;
    insert into council_admin_private.reviews(question_id,category,note,merged_into,reviewed_by,reviewed_at)
      values(v_id,v_category,v_note,v_merge,v_actor,now())
      on conflict(question_id) do update set category=excluded.category,note=excluded.note,
        merged_into=excluded.merged_into,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
    insert into council_admin_private.audit(question_id,actor_id,before_state,after_state)
      values(v_id,v_actor,v_before,v_after);
  end loop;
  return jsonb_build_object('processed',cardinality(v_ids));
end;
$$;

-- The exposed API consists of invoker wrappers. Definer workers stay in the
-- unexposed schema, with explicit role grants and per-call membership checks.
create or replace function public.council_admin_session()
returns jsonb language sql security invoker set search_path = '' as $$
  select council_admin_private.session();
$$;
create or replace function public.council_admin_overview()
returns jsonb language sql security invoker set search_path = '' as $$
  select council_admin_private.overview();
$$;
create or replace function public.council_admin_list_questions(
  p_status text default 'all', p_query text default '', p_keyword text default '',
  p_from timestamptz default null, p_to timestamptz default null,
  p_sort text default 'recent', p_page integer default 1, p_size integer default 30
) returns jsonb language sql security invoker set search_path = '' as $$
  select council_admin_private.list_questions(p_status,p_query,p_keyword,p_from,p_to,p_sort,p_page,p_size);
$$;
create or replace function public.council_admin_moderate(
  p_ids uuid[], p_status text default '', p_category text default null,
  p_note text default null, p_merged_into uuid default null,
  p_unmerge boolean default false, p_expected_status text default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select council_admin_private.moderate(p_ids,p_status,p_category,p_note,p_merged_into,p_unmerge,p_expected_status);
$$;

revoke all on all functions in schema council_admin_private from public, anon, authenticated;
grant execute on function council_admin_private.session() to authenticated;
grant execute on function council_admin_private.overview() to authenticated;
grant execute on function council_admin_private.list_questions(text,text,text,timestamptz,timestamptz,text,integer,integer) to authenticated;
grant execute on function council_admin_private.moderate(uuid[],text,text,text,uuid,boolean,text) to authenticated;
revoke all on function public.council_admin_session() from public, anon, authenticated;
revoke all on function public.council_admin_overview() from public, anon, authenticated;
revoke all on function public.council_admin_list_questions(text,text,text,timestamptz,timestamptz,text,integer,integer) from public, anon, authenticated;
revoke all on function public.council_admin_moderate(uuid[],text,text,text,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.council_admin_session() to authenticated;
grant execute on function public.council_admin_overview() to authenticated;
grant execute on function public.council_admin_list_questions(text,text,text,timestamptz,timestamptz,text,integer,integer) to authenticated;
grant execute on function public.council_admin_moderate(uuid[],text,text,text,uuid,boolean,text) to authenticated;

commit;
