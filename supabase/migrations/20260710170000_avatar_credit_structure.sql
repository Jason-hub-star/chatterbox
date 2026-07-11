-- avatar_jobs 크레딧 구조 예약 — 결제 슬라이스 대비(도그푸딩 §A-P1c 옵션 A).
-- vgen_jobs 크레딧 컬럼 + deduct_credit/refund_credit(vgen 하드코딩) 패턴의 avatar 판.
-- ⚠️ 실차감은 create-avatar-job 의 AVATAR_CREDIT_ENABLED flag 가 게이트 — flag off(기본)면 무료. 구조만 심는다.
-- vgen 의 deduct_credit/refund_credit 는 손대지 않는다(회귀 0). PG(Stripe/Toss) 미정이라 결제 경로는 후속.
-- SSOT: docs/specs/VgenCostAnalysis.md(크레딧 단위) · DATA-SCHEMA §credits · [[supabase-definer-rpc-revoke]]

-- 1) avatar_jobs 크레딧 컬럼(vgen_jobs 미러). 소유자 = 기존 user_id 컬럼(vgen 의 triggered_by 대응).
alter table avatar_jobs
  add column credit_cost         int,
  add column credit_deducted_at  timestamptz,
  add column credit_refunded_at  timestamptz;

-- 2) credit_transactions.reason 에 'avatar_job' 추가(원장 결제-호환 유지).
alter table credit_transactions drop constraint credit_tx_reason_chk;
alter table credit_transactions add constraint credit_tx_reason_chk
  check (reason in ('vgen_job','avatar_job','refund','purchase','bonus'));

-- 3) avatar 전용 원자 차감/환불 RPC — deduct_credit/refund_credit 의 avatar_jobs 판(vgen 무손상).
--    원자성: credits 행 FOR UPDATE 로 read-then-update 레이스 봉쇄(vgen 과 동일 규칙).
create or replace function deduct_avatar_credit(p_user_id uuid, p_amount int, p_job_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  select balance into v_balance from public.credits where user_id = p_user_id for update;
  if v_balance is null then raise exception 'CREDITS_NOT_FOUND'; end if;
  if v_balance < p_amount then raise exception 'CREDIT_INSUFFICIENT'; end if;

  update public.credits
     set balance = balance - p_amount, total_spent = total_spent + p_amount, updated_at = now()
   where user_id = p_user_id;

  insert into public.credit_transactions (user_id, amount, reason, ref_id)
  values (p_user_id, -p_amount, 'avatar_job', p_job_id);

  update public.avatar_jobs
     set credit_cost = p_amount, credit_deducted_at = now(), updated_at = now()
   where id = p_job_id;

  return v_balance - p_amount;
end;
$$;

-- 멱등 환불: credit_deducted_at IS NOT NULL AND credit_refunded_at IS NULL 일 때만 실행, 아니면 no-op.
create or replace function refund_avatar_credit(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.avatar_jobs;
begin
  select * into v_job from public.avatar_jobs where id = p_job_id for update;
  if not found then return false; end if;
  if v_job.credit_deducted_at is null or v_job.credit_refunded_at is not null then
    return false;
  end if;

  update public.credits
     set balance = balance + v_job.credit_cost,
         total_spent = greatest(0, total_spent - v_job.credit_cost),
         updated_at = now()
   where user_id = v_job.user_id;

  insert into public.credit_transactions (user_id, amount, reason, ref_id)
  values (v_job.user_id, v_job.credit_cost, 'refund', p_job_id);

  update public.avatar_jobs
     set credit_refunded_at = now(), updated_at = now()
   where id = p_job_id;

  return true;
end;
$$;

-- 4) 실행권한: service_role(Edge)·cron 만. default-priv 가 anon/authenticated 에 EXECUTE 를 명시부여하므로
--    public 만 revoke 로는 안 빠진다 → 3중 revoke 필수(SEC-7/8 정수정 패턴, [[supabase-definer-rpc-revoke]]).
revoke all on function deduct_avatar_credit(uuid, int, uuid) from public, anon, authenticated;
revoke all on function refund_avatar_credit(uuid) from public, anon, authenticated;
