-- avatar_jobs 인플라이트 디덥: 같은 (user, 이미지-해시) 동시 제출된 중복 GPU 잡을 원천 차단.
-- 배경: 콘텐츠-해시 디덥(20260713140000)은 status='done' 행만 조회 → 두 동시 제출은 둘 다 캐시 미스로
--   각각 풀 GPU spawn(2026-07-15 라이브 실측 이중과금 ~$2×2). 이 인덱스가 "유저·해시당 in-flight 잡 1개"를
--   DB 레벨에서 강제해 레이스까지 막는다. Edge(create-avatar-job)는 조기반환 + 23505 catch 로 그 잡에 붙인다.

-- 기존 in-flight 중복 선정리(같은 user+hash 에서 가장 오래된 것만 남기고 나머지 failed) — 유니크 생성 실패 방지.
--   (created_at, id) 튜플 비교로 created_at 동률에도 정확히 1개만 남긴다.
update avatar_jobs a
set status = 'failed', error = 'dup_inflight_backfill', completed_at = now()
where a.status in ('queued','running') and a.input_hash is not null
  and exists (
    select 1 from avatar_jobs b
    where b.user_id = a.user_id and b.input_hash = a.input_hash
      and b.status in ('queued','running')
      and (b.created_at, b.id) < (a.created_at, a.id)
  );

-- 유저·이미지-해시당 in-flight(queued|running) 잡 1개 강제. NULL input_hash(디덥 미참여)·done 행은 무제약
-- (done-캐시 인덱스 avatar_jobs_hash_idx WHERE status='done' 와 상보 — cache-done-row 다중 INSERT 정상).
create unique index avatar_jobs_inflight_uniq
  on avatar_jobs (user_id, input_hash)
  where status in ('queued','running') and input_hash is not null;
