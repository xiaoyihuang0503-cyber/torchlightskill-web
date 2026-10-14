-- Zero-vote issue refresh, 2026-10-14. Preserve all old titles, IDs and counters.
-- New meanings use revision IDs; the originals become inactive only at zero clicks.
begin;
alter table public.council_bomb_issues
  drop constraint council_bomb_issues_id_check,
  add constraint council_bomb_issues_id_check
    check (id ~ '^bomb_(0[1-9]|1[0-9]|20)(_v[1-9][0-9]*)?$');

CREATE OR REPLACE FUNCTION public.council_bomb_issue(p_seat text, p_clicks integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_question uuid;
  v_previous timestamptz;
  v_seat_total bigint:=0;
  v_global_total bigint:=0;
begin
  if v_actor is null then
    raise exception 'Anonymous sign-in required' using errcode='28000';
  end if;
  -- Batches prevent hundreds of writes for repeated taps. No total/daily cap.
  if p_clicks is null or p_clicks<1 or p_clicks>25 then
    raise exception 'Invalid click batch' using errcode='22023';
  end if;
  if p_seat in ('topic:mode_reduction','topic:ember_drop_data',
                 'topic:reward_access','topic:legacy_friction') then
    null;
  elsif p_seat ~ '^topic:bomb_(0[1-9]|1[0-9]|20)(_v[1-9][0-9]*)?$' then
    perform 1 from public.council_bomb_issues
       where id=substr(p_seat,7) and is_active=true for share;
    if not found then
      raise exception 'Invalid or inactive question' using errcode='22023';
    end if;
  elsif p_seat ~ '^question:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_question:=substr(p_seat,10)::uuid;
    if not exists(select 1 from public.council_questions
       where id=v_question and status='approved') then
      raise exception 'Question is not approved' using errcode='22023';
    end if;
  else
    raise exception 'Invalid issue key' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bomb:'||v_actor::text,16861));
  select b.last_accepted_at into v_previous from public.council_bomb_write_throttle b
   where b.actor_id=v_actor for update;
  if found and v_previous>now()-interval '450 milliseconds' then
    select coalesce(s.support_count,0) into v_seat_total
      from public.council_seat_stats s where s.seat_key=p_seat;
    select total_clicks into v_global_total from public.council_petition_totals where id='ask_official';
    return jsonb_build_object('seat',p_seat,'accepted',0,
      'count',coalesce(v_seat_total,0),'total',coalesce(v_global_total,0),'reason','cooldown');
  end if;

  insert into public.council_bomb_write_throttle(actor_id,last_accepted_at)
  values(v_actor,now()) on conflict(actor_id) do update set last_accepted_at=now();
  insert into public.council_seat_stats(seat_key,support_count,updated_at)
  values(p_seat,p_clicks,now())
  on conflict(seat_key) do update set
    support_count=public.council_seat_stats.support_count+excluded.support_count,
    updated_at=now()
  returning support_count into v_seat_total;

  insert into public.council_petition_totals(id,total_clicks,updated_at)
  values('ask_official',p_clicks,now())
  on conflict(id) do update set
    total_clicks=public.council_petition_totals.total_clicks+excluded.total_clicks,
    updated_at=now()
  returning total_clicks into v_global_total;

  insert into public.council_seat_events(seat_key,clicks) values(p_seat,p_clicks);
  return jsonb_build_object('seat',p_seat,'accepted',p_clicks,
    'count',v_seat_total,'total',v_global_total,'changed',true,'reason','ok');
end;
$function$;

-- Synchronize the zero-vote guard with concurrent counter writes.
lock table public.council_seat_stats in share row exclusive mode;
do $refresh$
declare
  r record;
  v_old public.council_bomb_issues%rowtype;
  v_new public.council_bomb_issues%rowtype;
begin
  for r in select * from (values
    ('bomb_11','bomb_11_v2','刷图掉一地，不能少点手动拾取吗？','开荒能不能多几条划算的刷法，别总围着监视者转？',11),
    ('bomb_13','bomb_13_v2','几千份秘密，非得让玩家一个个点开吗？','画中雪原这类攻坚玩法，难度能不能和刷图门槛分开算？',13),
    ('bomb_16','bomb_16_v2','装备到底值多少，不能给个成交价参考吗？','开荒核心暗金太贵，能不能多给点掉落渠道？',16),
    ('bomb_17','bomb_17_v2','开荒关键契灵，不能多给点定向获取渠道吗？','赛季玩法的基础收益，能不能少依赖掉落契灵？',17),
    ('bomb_19','bomb_19_v2','装备改一次就得重新修车，不能提前把调整说清楚吗？','削超模组合，能不能少让其他流派跟着挨刀？',19)
  ) as changes(old_id,new_id,old_title,new_title,position) loop
    select * into strict v_old from public.council_bomb_issues where id=r.old_id for update;
    if v_old.title<>r.old_title or v_old.position<>r.position then
      raise exception 'Original question changed: %',r.old_id;
    end if;
    select * into v_new from public.council_bomb_issues where id=r.new_id;
    if found then
      if v_old.is_active or not v_new.is_active or v_new.title<>r.new_title or v_new.position<>r.position then
        raise exception 'Revision already exists with different content: %',r.new_id;
      end if;
      continue; -- A matching completed revision is safe to replay without resetting votes.
    end if;
    if not v_old.is_active or coalesce((select support_count from public.council_seat_stats
         where seat_key='topic:'||r.old_id),0)<>0 then
      raise exception 'Question has votes or is inactive; leave unchanged: %',r.old_id;
    end if;
    insert into public.council_bomb_issues(id,title,position,is_active)
      values(r.new_id,r.new_title,r.position,true);
    update public.council_bomb_issues set is_active=false where id=r.old_id;
  end loop;
  if (select count(*) from public.council_bomb_issues where is_active)<>20 then
    raise exception 'Expected exactly 20 active questions';
  end if;
end;
$refresh$;
commit;

