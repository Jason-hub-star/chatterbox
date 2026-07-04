-- 크레딧 원자 차감/환불 RPC — VGEN slice1.
-- SSOT: docs/DATA-SCHEMA.md §1.8 "크레딧 차감 원자성 규칙(C3)" · docs/specs/RefundPolicy.md
--
-- 설계 결정(Opus 검토):
--  - 원자성: PL/pgSQL 함수 1개 = 1 트랜잭션. credits 행을 FOR UPDATE 로 잠가 read-then-update 레이스 봉쇄.
--    (스캔이 지적한 read-then-update 이중차감 버그의 근본 해결.)
--  - deduct: balance 잠금→검증→차감→원장 INSERT→vgen_jobs.credit_deducted_at 스탬프를 한 트랜잭션에.
--    잔액 부족 시 예외(CREDIT_INSUFFICIENT) → Edge Function 이 402 로 매핑.
--  - refund: job_id 만 받아 내부에서 금액/유저 조회(호출자가 금액 못 위조). 이중환불 방지 —
--    credit_deducted_at IS NOT NULL AND credit_refunded_at IS NULL 일 때만 실행, 아니면 no-op(멱등).
--  - 실행권한: service_role(Edge)·cron 만. public/authenticated 는 revoke(클라 직접 호출 차단).

-- 원자 차감. 반환: 차감 후 잔액. 잔액 부족 시 raise CREDIT_INSUFFICIENT.
create or replace function deduct_credit(p_user_id uuid, p_amount int, p_job_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  select balance into v_balance from public.credits where user_id = p_user_id for update;
  if v_balance is null then
    raise exception 'CREDITS_NOT_FOUND';
  end if;
  if v_balance < p_amount then
    raise exception 'CREDIT_INSUFFICIENT';
  end if;

  update public.credits
     set balance = balance - p_amount,
         total_spent = total_spent + p_amount,
         updated_at = now()
   where user_id = p_user_id;

  insert into public.credit_transactions (user_id, amount, reason, ref_id)
  values (p_user_id, -p_amount, 'vgen_job', p_job_id);

  update public.vgen_jobs
     set credit_cost = p_amount,
         credit_deducted_at = now(),
         updated_at = now()
   where id = p_job_id;

  return v_balance - p_amount;
end;
$$;

-- 멱등 환불. 반환: 실제 환불했으면 true, 미차감/이미환불이면 false(no-op).
create or replace function refund_credit(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.vgen_jobs;
begin
  select * into v_job from public.vgen_jobs where id = p_job_id for update;
  if not found then
    return false;
  end if;
  if v_job.credit_deducted_at is null or v_job.credit_refunded_at is not null then
    return false;  -- 미차감 또는 이미 환불 → no-op
  end if;

  update public.credits
     set balance = balance + v_job.credit_cost,
         total_spent = greatest(0, total_spent - v_job.credit_cost),
         updated_at = now()
   where user_id = v_job.triggered_by;

  insert into public.credit_transactions (user_id, amount, reason, ref_id)
  values (v_job.triggered_by, v_job.credit_cost, 'refund', p_job_id);

  update public.vgen_jobs
     set credit_refunded_at = now(),
         updated_at = now()
   where id = p_job_id;

  return true;
end;
$$;

revoke all on function deduct_credit(uuid, int, uuid) from public;
revoke all on function refund_credit(uuid) from public;
