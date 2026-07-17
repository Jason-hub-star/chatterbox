-- 좀비 방 회수 reaper: pg_cron(*/5) → edge fn reap-stale-rooms 에 net.http_post.
-- 근본 = softLeaveRoom(마지막 배우 나감)에만 의존하는 종료 설계의 백스톱. leave-room·livekit-webhook
-- 둘 다 못 뜨는 경로(호스트가 방만 만들고 LiveKit 미접속·webhook 이전 방·전달 실패)의 'connected'
-- 고착 행이 로비 좀비가 되던 것을 LiveKit presence 대조로 회수한다(판정은 함수, 여긴 트리거만).
--
-- 이 레포 첫 크론→Edge 호출. 인증은 전용 시크릿 REAPER_SECRET(함수 env) ↔ Vault 'reaper_secret'
-- 한 쌍을 내가 심는다. SUPABASE_SERVICE_ROLE_KEY 는 런타임에 신형 sb_secret 포맷이라 .env/vault 값과
-- 문자열이 달라 매칭이 취약 → 전용 시크릿으로 모호함 제거(값은 git 에 없음, Vault 런타임 조회).
-- ⚠️ 1회 배포 셋업(이 파일 밖 · 커밋 금지), 함수와 Vault 에 같은 랜덤 값:
--      supabase secrets set REAPER_SECRET=<RS>            (함수 런타임)
--      select vault.create_secret('<RS>', 'reaper_secret'); (크론 http_post bearer)
--    미등재/ null 이면 http_post 가 빈 bearer 를 보내고 함수가 401 → 무해(회수만 안 됨, 파괴 없음).
--
-- 로컬(db reset): pg_cron/pg_net 부재면 graceful skip — 기존 크론 마이그과 동형(vgen/avatar watchdog).

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    begin
      execute 'create extension if not exists pg_cron';
      execute 'create extension if not exists pg_net';
      perform cron.schedule(
        'reap-stale-rooms',
        '*/5 * * * *',
        $cron$
        select net.http_post(
          url := 'https://owfcrolbvikkqrotmleq.supabase.co/functions/v1/reap-stale-rooms',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(
              (select decrypted_secret from vault.decrypted_secrets where name = 'reaper_secret'), '')
          ),
          body := '{}'::jsonb
        );
        $cron$
      );
    exception when others then
      raise notice 'reap-stale-rooms cron skipped: %', sqlerrm;
    end;
  end if;
end;
$$;
