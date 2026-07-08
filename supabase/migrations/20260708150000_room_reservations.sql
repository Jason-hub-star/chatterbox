-- room_reservations: 예약 공연(LOB-06 MVP). SSOT: docs/DATA-SCHEMA.md §1.24
-- as-built 편차: 예약 = 약속+인앱 알림. 방 선생성·invite_code_hash 연결은 후속(방은 시작 때 만드는
--   것 — 선생성은 빈 방 ended 로직과 충돌·YAGNI). 대상자 원장은 notifications(reservation_invite) 행.
-- email/push 리마인더는 provider 후속(스펙 동일) — in-app 리마인더는 pg_cron 10분 주기.
create table room_reservations (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null references users(id) on delete cascade,
  title        text not null,
  scheduled_at timestamptz not null,
  reminded_at  timestamptz, -- 리마인더 발송 멱등 가드
  created_at   timestamptz default now()
);

create index idx_reservations_sched on room_reservations(scheduled_at) where reminded_at is null;

alter table room_reservations enable row level security;

-- 호스트 본인 예약만 조회(로비 예약 섹션이 직접 SELECT). 쓰기는 Edge(service_role)만 — 정책 없음.
create policy reservations_select_own on room_reservations
  for select to authenticated
  using (host_id = current_user_id());

-- 리마인더: 시작 30분 전 진입 시 호스트+초대받은 사람 전원에게 reservation_reminder 알림 1회.
-- 대상 = 그 예약의 reservation_invite 알림 수신자(원장 재사용) + 호스트.
create or replace function send_reservation_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select id, host_id, title, scheduled_at from room_reservations
     where scheduled_at between now() and now() + interval '30 minutes'
       and reminded_at is null
     for update skip locked
  loop
    insert into notifications (user_id, type, payload)
    select distinct n.user_id, 'reservation_reminder',
           jsonb_build_object('room_title', r.title, 'scheduled_at', r.scheduled_at)
      from notifications n
     where n.type = 'reservation_invite'
       and (n.payload ->> 'reservation_id') = r.id::text;

    insert into notifications (user_id, type, payload)
    values (r.host_id, 'reservation_reminder',
            jsonb_build_object('room_title', r.title, 'scheduled_at', r.scheduled_at));

    update room_reservations set reminded_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- SECURITY DEFINER — 클라 노출 금지(3중 revoke, [[supabase-definer-rpc-revoke]]).
revoke all on function send_reservation_reminders() from public;
revoke all on function send_reservation_reminders() from anon;
revoke all on function send_reservation_reminders() from authenticated;
grant execute on function send_reservation_reminders() to service_role;

-- pg_cron 10분 주기(있을 때만 — 로컬 미탑재 graceful skip, vgen-reconcile 과 동형).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      execute 'create extension if not exists pg_cron';
      perform cron.schedule(
        'reservation-reminders',
        '*/10 * * * *',
        'select public.send_reservation_reminders();'
      );
    exception when others then
      raise notice 'pg_cron schedule skipped: %', sqlerrm;
    end;
  end if;
end;
$$;
