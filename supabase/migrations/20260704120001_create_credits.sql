-- credits(재화 지갑) + credit_transactions(원장) + 유저별 자동 시드 — VGEN slice1.
-- SSOT: docs/DATA-SCHEMA.md §1.9·§1.10 · docs/specs/RefundPolicy.md
--
-- 설계 결정(Opus 검토):
--  - RLS: 본인 행만 SELECT. UPDATE/INSERT 정책 없음(deny) = RPC/Edge Function(service_role)만(원장 무결성).
--  - 신규 users 행마다 credits 1행 자동 생성(AFTER INSERT 트리거) + 기존 백필. balance=100 무료.
--    handle_new_user(auth.users 트리거) 수정 대신 users 트리거로 — auth 경로 무관하게 1:1 보장.
--  - credit_transactions.reason: 'vgen_job'|'refund'|'purchase'|'bonus'.
--    'purchase'(결제 충전)는 결제 슬라이스 예약 — 원장은 지금 결제-호환 구조로만 두고 코드경로 없음.

create table credits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references users(id) on delete cascade,
  balance      int not null default 100,    -- 무료 시작 크레딧
  total_earned int not null default 100,
  total_spent  int not null default 0,
  updated_at   timestamptz not null default now()
);

create table credit_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  amount     int not null,                  -- 양수=적립, 음수=차감
  reason     text not null,                 -- vgen_job | refund | purchase | bonus
  ref_id     uuid,                          -- 맥락 FK(예: vgen_jobs.id)
  created_at timestamptz not null default now(),
  constraint credit_tx_reason_chk
    check (reason in ('vgen_job','refund','purchase','bonus'))
);

create index credit_tx_user_idx on credit_transactions (user_id, created_at desc);
create index credit_tx_ref_idx  on credit_transactions (ref_id);

create trigger set_updated_at
  before update on credits
  for each row execute function update_timestamp();

-- ── RLS: 본인 행만 읽기. 쓰기 정책 없음 = service_role 전용. ──
alter table credits enable row level security;
alter table credit_transactions enable row level security;

create policy credits_select_own on credits
  for select using (user_id = current_user_id());

create policy credit_tx_select_own on credit_transactions
  for select using (user_id = current_user_id());

-- ── 유저별 credits 자동 시드(1:1) ──
create or replace function seed_user_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credits (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_user_created_seed_credits
  after insert on public.users
  for each row execute function seed_user_credits();

-- 기존 users 백필(트리거 도입 전 계정).
insert into public.credits (user_id)
select id from public.users
on conflict (user_id) do nothing;

-- ── Realtime: 잔액 변화 구독(userStore.creditBalance). 원장은 구독 안 함(§1.10). ──
alter publication supabase_realtime add table credits;
