-- SEC-7 / SEC-8 (dogfood-audit 재감사 2026-07-07): SECURITY DEFINER RPC 클라 직접호출 차단.
-- SSOT: docs/DOGFOOD-AUDIT-2026-07.md §0 A-P0 SEC-7·SEC-8 · §1 보안표
--
-- 근본원인: Supabase 기본권한(`alter default privileges in schema public grant execute on functions
--   to anon, authenticated, service_role`)이 public 스키마 새 함수마다 anon/authenticated 에
--   EXECUTE 를 "명시적으로" 부여한다 → `revoke ... from public` 만으로는 anon/authenticated 가 안 빠진다.
--   실측(격리 pg17.6.1.127 has_function_privilege): deduct_credit 은 public revoke 후에도 authenticated=t,
--   check_rate_limit 은 anon=t·authenticated=t. 완전 revoke(public+anon+authenticated)만 f 가 된다.
-- 정수정: join_room_as_participant 마이그(20260706120000)와 동일 패턴으로 세 역할 전부 revoke.
--   service_role(Edge Function 클라)은 default-priv `service_role=X` 로 EXECUTE 를 유지 → 서버 경로 무손상.
--
-- 익스플로잇(수정 전): 앱 anon 키로
--   rpc/refund_credit(<본인 완료잡>)  → 소비한 유료 생성 무한 무료화(크레딧 원복)
--   rpc/deduct_credit(<피해자>, 9999, …) → 타인 크레딧 고갈
--   rpc/check_rate_limit('vgen:<피해자>', …) 반복 → 피해자 429 DoS(SEC-1/4/6 무력화)

revoke all on function check_rate_limit(text, int, int)  from public, anon, authenticated;  -- SEC-8
revoke all on function deduct_credit(uuid, int, uuid)    from public, anon, authenticated;  -- SEC-7
revoke all on function refund_credit(uuid)               from public, anon, authenticated;  -- SEC-7

-- 방어심화: 상태변경 유지보수 함수도 클라 직접호출 차단(실익 낮으나 표면 축소 — 같은 근본원인 클래스).
revoke all on function reconcile_stuck_vgen_jobs()       from public, anon, authenticated;

-- 유지(의도적 미포함): current_user_id()·is_room_member()·is_dub_member() 는 RLS 헬퍼로 클라 호출이
--   정상 경로(본인 uid·멤버십 boolean 반환, 민감정보 없음)라 revoke 하지 않는다.
