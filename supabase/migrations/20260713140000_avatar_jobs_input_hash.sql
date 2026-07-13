-- avatar_jobs.input_hash: 콘텐츠-해시 디덥(레버 ④). 20260709120000 이 "디덥은 이번 슬라이스 제외"로
-- 비워둔 자리를 채운다. 파이프라인이 결정론적(동일 PNG→동일 rig, specs/avatar-pipeline.md §1)이라
-- 같은 그림 재주문은 33분 연산을 스킵하고 캐시된 project.json 을 즉시 반환한다.
--  - input_hash = `${sha256(png)}:v${RIG_CACHE_VERSION}` (버전 접두로 파이프라인 업그레이드 시 캐시 무효화).
--  - 조회는 본인(user_id) 스코프 · status='done' 만. 부분 인덱스로 인덱스 크기 최소화.
--  - 쓰기는 여전히 service_role(Edge) 만 — 기존 RLS(select-own) 불변.

alter table avatar_jobs add column input_hash text;

create index avatar_jobs_hash_idx
  on avatar_jobs (user_id, input_hash)
  where status = 'done';
