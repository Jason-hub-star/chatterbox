-- NOTI-VGEN: 영상생성 잡 완료/실패 알림. vgen_jobs.status 가 done/failed 로 전이하면 notifications 행 생성.
--
-- 배경(UIUX 감사 2026-08-08): `vgen-webhook` 은 status 를 PATCH 하고 끝난다 — 완료 통지가 **아예 없었다**.
--   유료 크레딧을 태우는 작업인데 끝난 걸 알려면 방(또는 공방 스튜디오 방)에 다시 들어가
--   recentJobs 목록을 눈으로 확인해야 했다. 진행률 UI(VgenStatusTab)는 방 안에만 있어 로비로 나가면
--   진행 여부조차 안 보인다(아바타의 AvatarForgePill 같은 전역 표시자 없음).
--
-- 방식: 20260713180000_avatar_job_notify.sql 의 형판을 그대로 복제한다. 웹훅 코드는 **수정하지 않는다** —
--   status 를 쓰는 경로가 웹훅 하나가 아니므로(타임아웃 정리·수동 실패 처리 등) 트리거가 근본 지점이다.
--   ⚠️ SECURITY DEFINER 필수: notifications 는 INSERT 정책이 없어 BYPASSRLS 역할만 쓸 수 있다.
--     여기엔 current_user 게이트가 없어 DEFINER 의 role 치환이 무해하다(guard_is_admin 의 INVOKER 와 반대).
--   전이할 때만 발화(is distinct from old) — fal 이 같은 request_id 를 10회까지 재전송해도 중복 0.
--   room_id 는 보존한다(아바타 잡과 달리 vgen 은 방 소속) — 알림 클릭이 그 방으로 갈 수 있어야 한다.

create or replace function public.notify_vgen_job_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_studio boolean;
begin
  if new.status is distinct from old.status
     and new.status in ('done', 'failed') then
    -- 목적지 분기를 payload 에 굽는다: 공방 스튜디오 방(is_studio)은 유저에게 "방"이 아니라 공방 화면이라
    --   `/rooms/<id>` 로 보내면 안 된다. 클라가 rooms 를 다시 조회하는 대신 여기서 한 번에 판정한다.
    select is_studio into v_is_studio from rooms where id = new.room_id;
    insert into notifications (user_id, type, room_id, payload)
    values (
      new.triggered_by,
      case when new.status = 'done' then 'vgen_job_done' else 'vgen_job_failed' end,
      new.room_id,
      jsonb_build_object(
        'job_id', new.id,
        'failure_reason', new.failure_reason,
        'is_studio', coalesce(v_is_studio, false)
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_vgen_job_status on public.vgen_jobs;
create trigger notify_vgen_job_status
  after update on public.vgen_jobs
  for each row execute function public.notify_vgen_job_status();
