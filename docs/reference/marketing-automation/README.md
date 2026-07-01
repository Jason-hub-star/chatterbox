---
tags: [reference, growth]
---

# 홍보 자동화 레퍼런스 코드 (자매 프로젝트 이식)

> `GO-TO-MARKET.md §5`의 조사 결과를 뒷받침하는 **실제 동작 코드/스킬**을 미리 옮겨둔 것.
> ChatterBox는 아직 Phase 0 미착수라 `src/`·`supabase/` 자체가 없다 — 이 폴더는 **지금 실행되는 코드가 아니라**, Phase 2(그로스 자동화) 착수 시 바로 열어볼 참고 스니펫이다.
> 원본은 손대지 않았다(복사본). 출처 프로젝트가 계속 바뀌어도 이 스냅샷은 조사 시점(2026-07-01) 그대로 고정.

## 채택 이유

`GO-TO-MARKET.md §5`에서 정리했듯 Meta Graph API 직접 호출 경로를 채택했다 — 그래서 TaillogToss(직접 호출)의 코드를 우선 이식했고, Manus 경유(mungmungfit) 코드는 이식하지 않았다.

## 폴더 구성

### `threads/` — 출처: `TaillogToss/supabase/functions/`, `TaillogToss/.claude/automations/`

| 파일 | 원본 경로 | 용도 |
|---|---|---|
| `publish-to-threads.ts` | `supabase/functions/publish-to-threads/index.ts` | `threads_queue` 1건 → Threads Graph API 2단계 발행(creation_id→publish) |
| `seed-threads-from-blog.ts` | `supabase/functions/seed-threads-from-blog/index.ts` | RSS 피드 → 500자 요약+해시태그 → `threads_queue` INSERT |
| `collect-social-insights.ts` | `supabase/functions/collect-social-insights/index.ts` | 발행 24h 후 인사이트 자동 수집 |
| `marketing-threads-publish.prompt.md` | `.claude/automations/marketing-threads-publish.prompt.md` | 화·금 19:00 cron 자동화 스펙 (Claude Code automation) |
| `marketing-threads-token-refresh.prompt.md` | `.claude/automations/marketing-threads-token-refresh.prompt.md` | 매주 월 09:00, 60일 만료 토큰 7일 전 알림 (자동 갱신은 Meta 설계상 불가 — 사람이 Graph API Explorer에서 수동 발급) |

### `instagram/` — 출처: `TaillogToss/supabase/functions/`, `TaillogToss/.claude/automations/`

| 파일 | 원본 경로 | 용도 |
|---|---|---|
| `publish-to-instagram.ts` | `supabase/functions/publish-to-instagram/index.ts` | text/image/carousel(2~10장) 발행, Graph API 컨테이너 방식 |
| `marketing-instagram-publish.prompt.md` | `.claude/automations/marketing-instagram-publish.prompt.md` | 매주 수 20:00 cron 자동화 스펙. 이미지는 **수동 제작(Canva) 전제** — 자동 생성 아님 |

### `youtube/` — 출처: `vibehub-media/packages/media-engine/src/publish/`, `vibehub-media/apps/backend/src/workers/`

| 파일 | 원본 경로 | 용도 |
|---|---|---|
| `youtube-api.ts` | `packages/media-engine/src/publish/youtube-api.ts` | OAuth2 refresh → `videos.insert`(privacyStatus: private) → 썸네일 업로드 |
| `youtube-local.ts` | `packages/media-engine/src/publish/youtube-local.ts` | YouTube API 미설정 시 fallback — `metadata.json` + 업로드 가이드 로컬 생성 |
| `run-youtube-setup.ts` | `apps/backend/src/workers/run-youtube-setup.ts` | OAuth2 최초 1회 토큰 발급 CLI (`client_secret.json` → refresh token) |

### `shared/` — 출처: `TaillogToss/supabase/functions/_shared/`, `TaillogToss/docs/marketing/`

| 파일 | 원본 경로 | 용도 |
|---|---|---|
| `marketingPiiGuard.ts` | `supabase/functions/_shared/marketingPiiGuard.ts` | 발행 전 PII(개인정보) 패턴 검사 — 모든 publish 함수가 발행 직전 호출 |
| `env-vars-reference.md` | `docs/marketing/env-vars.md` | 필요 환경변수 전체 목록 + 발급 위치 + 검증 curl 명령 |

## 이식 시 반드시 바꿔야 하는 것 (그대로 복사-붙여넣기 금지)

- `publish-to-threads.ts`/`publish-to-instagram.ts`는 `../_shared/contracts.ts`(EdgeContext/ok/fail 타입)를 임포트한다 — 이 파일은 이식하지 않았다. ChatterBox의 기존 Edge Function 계약 패턴(`docs/specs/livekit-edge-fn.md` 참조)에 맞춰 재작성 필요.
- `youtube-api.ts`는 `../types`, `../brand`, `./fetch-with-retry`, `./channel-types`를 참조한다 — 미이식. ChatterBox 자체 타입/재시도 유틸로 대체.
- 테이블명(`threads_queue`, `instagram_queue`)·컬럼명은 TaillogToss 스키마 그대로다. ChatterBox `DATA-SCHEMA.md §0 Naming SSOT`에 맞춰 재정의 필요 (신규 GAP 등록 대상).
- `marketingPiiGuard.ts`의 금지 패턴은 TaillogToss(강아지 훈련 서비스) 도메인 기준이다. ChatterBox는 VTuber/연기 콘텐츠 도메인이므로 검사 패턴 재정의 필요.
- `.prompt.md` 자동화 스펙은 **작성만으로는 동작하지 않는다** — 실제 cron 트리거(Vercel Cron/Supabase pg_cron)를 별도로 붙여야 한다(`GO-TO-MARKET.md §5` 4번 항목 참조, TaillogToss가 이 단계를 건너뛰어 "코드 완료·통합 대기" 상태로 오래 머문 전례 있음).

## 관련 문서

- [[GO-TO-MARKET]] §5 — 이 코드를 채택한 조사 근거·실행 순서
- [[GAP-MATRIX]] 진행 로그 2026-07-01 "G-247 보강" 행
