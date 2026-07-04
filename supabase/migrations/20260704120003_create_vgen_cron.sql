-- VGEN stuck 잡 재조정(타임아웃 자동 실패+환불) — VGEN slice1.
-- SSOT: docs/DATA-SCHEMA.md §1.8 "타임아웃 자동 환불(pg_cron)" · docs/specs/RefundPolicy.md
--
-- 설계 결정(Opus 검토):
--  - webhook 유실 안전망: 차감됐는데 120초 넘게 pending/generating 이면 실패+환불.
--    webhook(vgen-webhook)은 terminal-state 멱등이라 뒤늦게 도착해도 refund_credit 이중가드로 안전.
--  - 로직은 함수(reconcile_stuck_vgen_jobs)로 — 로컬 db reset 에서 직접 호출로 검증 가능.
--  - pg_cron 스케줄 등록은 DO/exception 로 감싼다: 로컬(supabase)에 pg_cron 미탑재여도 db reset 안 깨짐.
--    프로덕션은 pg_cron 확장 활성 시 자동 등록(5분 주기). ponytail: Edge cron 대체 가능.

create or replace function reconcile_stuck_vgen_jobs()
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
    select id from public.vgen_jobs
     where status in ('pending','generating')
       and credit_deducted_at is not null
       and credit_refunded_at is null
       and credit_deducted_at < now() - interval '120 seconds'
     for update skip locked
  loop
    perform refund_credit(r.id);
    update public.vgen_jobs
       set status = 'failed',
           failure_reason = 'timeout',
           completed_at = now(),
           updated_at = now()
     where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- pg_cron 5분 주기 등록(있을 때만; 로컬 미탑재면 graceful skip).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      execute 'create extension if not exists pg_cron';
      perform cron.schedule(
        'vgen-reconcile-stuck',
        '*/5 * * * *',
        'select public.reconcile_stuck_vgen_jobs();'
      );
    exception when others then
      raise notice 'pg_cron schedule skipped: %', sqlerrm;
    end;
  end if;
end;
$$;
