-- 아바타 잡 완료/실패 알림: avatar_jobs.status 가 done/failed 로 전이하면 notifications 행 생성.
-- 배경(대기 UX): useAvatarJobs 구독이 AtelierPage 마운트에만 살아, 25~40분 대기 중 페이지를 떠나면
--   완료 토스트를 놓친다(uiux-distilled #22 "추적 경로 2개↑" 위반). notifications 테이블
--   (20260708140000)로 이탈해도 남는 알림을 만들어 NotificationBell 이 광장/재방문 시 보여준다.
--
-- 방식: avatar_jobs AFTER UPDATE 트리거. 파이프라인(service_role)이 status 를 PATCH 할 때 발화.
--   ⚠️ SECURITY DEFINER 필수(guard_is_admin 의 INVOKER 와 반대): notifications 는 INSERT 정책이
--     없어 BYPASSRLS 역할(postgres/service_role)만 쓴다 — DEFINER(owner=postgres)로 RLS 를 우회해
--     insert 한다. 여기선 current_user 게이트가 없어 DEFINER 의 role 치환이 무해하다.
--   status 가 실제로 done/failed 로 "전이"할 때만(is distinct from old) — 재PATCH 중복 발화 차단.
--   room_id 는 null(아바타 잡은 룸 없음 — notifications.room_id FK nullable).

create or replace function public.notify_avatar_job_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('done', 'failed') then
    insert into notifications (user_id, type, payload)
    values (
      new.user_id,
      case when new.status = 'done' then 'avatar_job_done' else 'avatar_job_failed' end,
      jsonb_build_object('job_id', new.id, 'result_project_url', new.result_project_url)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_avatar_job_status on public.avatar_jobs;
create trigger notify_avatar_job_status
  after update on public.avatar_jobs
  for each row execute function public.notify_avatar_job_status();
