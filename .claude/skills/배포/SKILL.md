---
name: 배포
description: 구현 완료 슬라이스를 프로덕션에 올리고 라이브로 실증한 뒤 문서·커밋까지 닫는 일괄 마감 절차 — db push(서울 pooler)·함수 deploy(재시도·실측)·CF Pages·프로드 통합/2탭 E2E·백로그 §0/GAP/drift 문서 마감. "배포하고 라이브테스트", "라이브로 올려", "페이즈 마감", "배포 몰아치기" 요청 시.
user_invocable: true
tags: [deploy, verify, docs, release]
trigger: "슬라이스/페이즈 완료분을 프로드 반영+라이브 검증+문서 마감까지 한 번에 닫을 때"
version: 1
---

# bepo — 배포 → 라이브 실증 → 문서 마감 일괄

전제: 구현 + 로컬 실측(`supabase-slice-verify`)이 끝난 상태. **배포·커밋·push 는 주인님 승인 후에만** — 이 스킬은 승인 이후의 실행 순서와 함정을 고정한다. 검증은 성역: 각 단계의 "성공"은 실측(psql·functions list·PASS 카운트)으로만 주장한다.

## 순서

① **프리플라이트** — `npm run check:all`(tsc·lint·test·build·docs:check·docs:drift 일괄) + 변경 Edge fn `deno check --node-modules-dir=auto <fn>/index.ts`. `_shared/` 공유 파일을 건드렸으면 **전 함수 스윕**: `deno check --node-modules-dir=auto supabase/functions/*/index.ts`.

② **백엔드 배포**
- 마이그: `PW=$(awk -F= '/^SUPABASE_DB_PASSWORD=/{print $2}' .env); supabase db push --db-url "postgresql://postgres.owfcrolbvikkqrotmleq:${PW}@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"` → 직후 같은 URL psql 로 **테이블/정책/cron 실존 실측**.
- 함수: `export SUPABASE_ACCESS_TOKEN=$(awk -F= '/^SUPABASE_ACCESS_TOKEN=/{print $2}' .env); supabase functions deploy [이름…]` — `_shared/` 수정 시 이름 생략(전체 배포 = 드리프트 근절 관례).

③ **프론트** — `cf-pages-deploy-verify` 스킬 그대로(빌드 → 번들 비밀키 감사(awk 판) → wrangler → curl 3종 200).

④ **라이브 실증** — 로컬 통합테스트 .mjs 를 그대로 프로드로 재조준:
- env 스위칭만으로 재사용: `SUPABASE_URL=https://owfcrolbvikkqrotmleq.supabase.co` + `ANON_KEY`/`SERVICE_ROLE_KEY`(awk 로 .env 추출) + LiveKit 3종. 테스트 방·행은 finally 정리(테스트 유저 잔존은 무해 관례).
- UI 와이어까지 검증 대상이면 배포판 2탭 E2E(`supabase-slice-verify`의 `deployed-room-e2e.mjs`, `BASE=<배포 URL>`) — 신규 어서션은 그 템플릿 위에 얹는다.

⑤ **문서 마감 + 커밋** — 백로그 §0 `[x]`+실측 증거(probe 주석 유지·자동 [x] 금지) → GAP-MATRIX 진행 로그 1줄 → `npm run docs:check && npm run docs:drift`(STALE/REGRESSION 0) → **명시 파일 목록**으로 커밋(병행 세션 스윕 방지) → push(승인분).

## 함정 (2026-07-11~12 페이즈루프 실측)

1. **rtk: .env 에 grep 전면 금지** — 값 추출은 전부 awk. 위반 시 시크릿이 세션 로그에 노출된다(3회 사고 이력).
2. **deploy 를 파이프에 물리면 awk/tail 이 exit code 를 삼킨다** — `supabase functions deploy > log 2>&1; echo $?` 로 종료코드 보존. "성공처럼 보이는 실패"의 근원.
3. **functions deploy 는 JSR DNS 일시장애로 죽을 수 있다**(`jsr.io … Temporary failure in name resolution`) — 그냥 재시도. 부분 배포는 무해(성공분은 이미 등록됨).
4. **배포 성공 판정은 `supabase functions list` 의 버전·갱신시각 실측** — 배포본이 소스보다 오래될 수 있다(deployed-fn drift). "명령이 돌았다" ≠ "배포됐다".
5. **LIVEKIT_SERVER_URL 은 .env 에 없다** — `VITE_LIVEKIT_URL` 을 리네임해 주입: `awk -F= '/^VITE_LIVEKIT_URL=/{sub(/^VITE_LIVEKIT_URL/,"LIVEKIT_SERVER_URL"); print}' .env`.
6. **fn.env 실키는 검증 끝나면 즉시 더미 복구 + serve 종료**(`pkill -f "supabase functions serve"`) — scratch 에 실키 잔존 금지(성역).
7. **DEV 훅은 프로드 번들에 없다**(`__streamAvatar` 등 `import.meta.env.DEV` 게이트) — 프로드 실증은 프로드에서 잡히는 ground truth 로 대체(예: 캔버스 픽셀 시간변화 = 렌더 루프 구동 증명, preserveDrawingBuffer 필요).
8. **소셜우선 로그인**: E2E 는 `[이메일로 로그인]` 클릭 선행(`deployed-room-e2e.mjs` 템플릿 반영됨, 2026-07-12).

## Verify (완료 체크)

- [ ] psql 실측: 신규 테이블/정책/cron 존재
- [ ] `functions list`: 대상 함수 갱신시각 = 오늘, 신규 함수 ACTIVE
- [ ] curl 3종(root/asset/deep) 200 + 번들 비밀키 감사 클린
- [ ] 프로드 통합/E2E PASS 카운트를 사실로 보고(안 돌린 것 통과 표기 금지)
- [ ] docs:drift STALE/REGRESSION 0 · 커밋은 명시 파일 목록 · fn.env 더미 복구

## 관련

- `cf-pages-deploy-verify`(③ 상세) · `supabase-slice-verify`(로컬 하네스·E2E 템플릿) · `/backlog`(백로그 소스·배포 게이트)
- 메모리: `rtk-grep-secret-leak` · `deployed-fn-drift` · `chatterbox-e2e-traps`
