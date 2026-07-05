-- 로비 Realtime 자동갱신 (LOB-01, Phase 2 로비 피드 AC).
-- SSOT: docs/DATA-SCHEMA.md §1.2 · docs/MILESTONES.md Phase 2
--
-- 문제: rooms RLS(rooms_select_member)는 host/참가자 전용이라, 로비 사용자(비참가자)는
--   안 들어간 방을 SELECT 못 한다 → postgres_changes 구독을 걸어도 로비 이벤트가 안 온다.
-- 반려안: rooms SELECT RLS 를 넓히면 public_rooms 뷰가 일부러 숨긴 내부 컬럼
--   (host_id·authority_state_json·background_key)이 전 인증 사용자에 노출된다(보안 후퇴).
-- 채택: rooms 변경 시 트리거가 민감정보 없는 nudge 만 public 'lobby' 채널로 broadcast.
--   클라는 nudge 를 받으면 public_rooms 뷰를 재조회한다(민감 컬럼은 뷰가 이미 필터).
--   → RLS 무변경 · 컬럼 노출 0 · Edge Function 무수정. 모든 로비 관심 변경(새 방 INSERT,
--   인원수/잠금/종료/제목/장르 UPDATE)은 rooms 한 테이블을 지나가므로 트리거 1개로 충분.

create or replace function broadcast_lobby_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- fail-open(중요): 브로드캐스트는 best-effort UX(로비 자동갱신)일 뿐이다. AFTER 트리거의
  --   미처리 예외는 트랜잭션 전체를 abort 시키므로, realtime.send 실패(파티션 누락·권한 등)가
  --   방 생성/입장/퇴장 같은 핵심 쓰기를 롤백시키면 안 된다. 반드시 감싸서 삼킨다.
  --   실패 시 로비는 수동 새로고침(버튼)으로 폴백된다.
  begin
    perform realtime.send(
      jsonb_build_object('room_id', coalesce(new.id, old.id)),
      'lobby_change',
      'lobby',
      false  -- public 채널: 로비는 공개 발견 지점(인증 사용자 누구나 수신), RLS 인가 불요
    );
  exception when others then
    null;  -- 브로드캐스트 실패 무시(핵심 방 쓰기는 커밋 유지)
  end;
  return null;  -- AFTER 트리거 반환값 무시
end;
$$;

-- current_participants·max_participants·status·is_locked·title·genre·host_id 변경만 발화
-- (public_rooms 뷰 노출 + 로비 full/표시에 쓰는 컬럼). max_participants 는 로비 'full' 계산
-- (current >= max)에 쓰이므로 정원 변경도 갱신돼야 한다. authority_state_json 등 무관 컬럼
-- 갱신에는 발화 안 함(브로드캐스트 노이즈 억제).
drop trigger if exists rooms_lobby_broadcast on rooms;
create trigger rooms_lobby_broadcast
  after insert
     or update of status, is_locked, current_participants, max_participants, title, genre, host_id
     or delete
  on rooms
  for each row
  execute function broadcast_lobby_change();
