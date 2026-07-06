-- rate_limit_counters: 범용 고정윈도 레이트리밋 카운터. SSOT: docs/DOGFOOD-AUDIT-2026-07.md §0 SEC-1
-- 클라 직접 접근 금지 — Edge Function(service_role)만. deny-all RLS(room_secrets 와 동형).
-- 재사용: 잠금방 비번 시도(SEC-1) · 비용 API 캡(SEC-4) 등을 bucket_key 로 구분.
create table rate_limit_counters (
  bucket_key   text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now()
);

alter table rate_limit_counters enable row level security;
-- 정책 없음(deny-all): service_role 만 읽기/쓰기.

-- check_rate_limit: 원자적 증가 + 윈도 만료 시 리셋. 허용이면 true, 초과면 false.
-- p_key 별 p_window_sec 초 창에서 최대 p_max 회 허용(각 호출이 1회로 계수). 만료된 창은 자동 리셋.
create or replace function check_rate_limit(p_key text, p_max int, p_window_sec int)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into rate_limit_counters (bucket_key, count, window_start)
  values (p_key, 1, now())
  on conflict (bucket_key) do update
    set count = case
          when rate_limit_counters.window_start < now() - make_interval(secs => p_window_sec)
          then 1 else rate_limit_counters.count + 1 end,
        window_start = case
          when rate_limit_counters.window_start < now() - make_interval(secs => p_window_sec)
          then now() else rate_limit_counters.window_start end
  returning count <= p_max;
$$;
