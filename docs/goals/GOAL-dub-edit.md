# GOAL-dub-edit — 센터 세그먼트 편집기 v1 + 감사 UX 픽스

## 골 한 줄
메인뷰 타임라인에서 호스트가 STT 세그먼트를 드래그 트림·삭제하고 전원이 실시간으로 보며(편집중 닉네임 배지), 감사 확정 UX 픽스 5건이 닫힌 상태 — verified by `npm run check:all` + deno check(edit-dub-segment) + 시딩 통합·2탭 E2E(무과금), while preserving 기존 더빙 파이프라인 무회귀(165/165)·ready-잠금 정책. details in docs/goals/GOAL-dub-edit.md

## 1. Outcome (완료 시 참)
- 더빙 방 센터(MainView 더빙 분기)에 세그먼트 타임라인 스트립이 뜨고, 블록 클릭=시크+선택이 동작한다(전원·읽기).
- 호스트가 선택 블록 양끝 핸들 드래그로 시간을 조정하고 [삭제]할 수 있으며, 결과가 **다른 멤버 화면에 실시간 반영**된다.
- 편집 중인 세그먼트에 편집자 닉네임 배지가 다른 멤버에게 보인다.
- 세션이 `recording` 이후면 편집 API가 409 로 거부된다(기녹음 보존).
- 감사 UX 픽스 5건(제출 toast·역할저장 toast·submitted 대기 안내·합성 비활성 힌트·트림 자동펼침 이유)이 반영돼 있다.

## 2. Verification surface
- `npm run check:all` → exit 0 (test 165+α·build·docs 3종)
- `deno check --node-modules-dir=auto supabase/functions/edit-dub-segment/index.ts` → clean
- 시딩 통합(.mjs·service-role 세그먼트 주입 = 무과금): retime 200+JSON/dub_tracks 미러 실측 · 경계 400 · 비호스트 403 · recording 409 · delete→track cascade
- 2탭 E2E(.mjs): 호스트 드래그→DB 변경+게스트 블록 변경·배지 닉네임·삭제 동기
- 아티팩트: `src/features/dub/DubTimeline.tsx` · `supabase/functions/edit-dub-segment/`

## 3. Constraints (후퇴 금지)
- 기존 더빙 파이프라인(업로드→트림→STT→역할→동의→녹음→확정→합성) 무회귀 — 기존 스위트 그린 유지.
- **ready-잠금**: 세그먼트 시간/구조 편집은 세션 `ready` 에서만(`update-dub-segment-text` 게이트 동형) — recording 후 잠금 = 기녹음 테이크 무효화 원천 차단.
- 쓰기 권한 = 호스트 v1(서버 게이트). 배지 발행은 SEC-RA-1 `HOST_CLIENT_TYPES` 화이트리스트 경유(클라 스푸핑 차단).
- 타임라인은 오버레이 금지 — 더빙 분기 flex 스택(자막 bottom-10·네이티브 컨트롤·기존 배지 보존). 360px 오버플로 0.
- i18n 3국어 완역(게이트)·검증 성역(시딩=무과금, 실행 안 한 것 통과 표기 금지).

## 4. Boundaries
- 허용: `src/features/dub/`·`src/features/stage/MainView.tsx`·`src/stores/dubStore.ts`·`src/hooks/useLiveKitRoom.ts`(화이트리스트 1줄)·`src/lib/dub.ts`·i18n 3파일·`supabase/functions/edit-dub-segment/`·docs.
- 금지: 마이그레이션(스키마 무변경 — segments 는 JSON blob)·기존 Edge 수정(신규 1개만)·`stores/index.ts` barrel·새 의존성.
- 범위 밖(후속 defer): 분할(split)·멤버 공동 편집/소프트락·자유 커서·파형·줌·모바일 터치 드래그·시사회 내 음성 표시·마이크 사전 테스트·Realtime 체감지연·트랙별 예상 길이.

## 5. Iteration policy
- phase 순서 E1→E2→E3→E4→E5(아래). 각 phase: 구현 → §2 해당 검증 전체 → 메인 자기리뷰(회귀·타입·검증누락·문서·차단) → PASS 면 §7 기록 후 진행 / FAIL 이면 실패 항목만 최소 변경 재시도.
- 무진전 3패스 → blocked 보고(재현/근사/막힘/불확실 4분류).

| Phase | Outcome(이진) | 검증 |
|---|---|---|
| E1 타임라인 스트립(읽기) | 블록·플레이헤드·클릭 시크+선택(`selectedSegmentId`)·배정 색 렌더 | check:all + 실렌더(시딩·360px) |
| E2 edit-dub-segment Edge | retime/delete·ready 게이트·트랙 미러 | deno + 시딩 통합 5어서션 |
| E3 드래그+실시간+배지 | 핸들 드래그→저장→전원 반영·`dub_edit` 배지 | 2탭 E2E |
| E4 감사 픽스 5건 | toast 2·안내 2·펼침 이유 1 + i18n | check:all + 실렌더 스팟 |
| E5 문서 마감 | §0 [x]+probe·상태머신 1줄·GAP-MATRIX | docs 게이트 3종 |

## 6. Blocked stop condition
- MainView flex 스택 재구성이 vgen/시사회/로컬모드 분기와 충돌해 회귀가 2패스 내 안 잡히면 blocked.
- segments JSON 동시 수정으로 Realtime 수렴이 깨지는 재현이 나오면(LWW 부족) blocked — 소프트락 승격 재설계 질문.

## 7. 실행 기록 (실행 에이전트가 기록)
- 2026-07-19 Fable — E0: 브리프 작성·사다리 등재·§0 행 신설(감사 발견 포함). docs:check·links PASS.
- 2026-07-19 Fable — E1: DubTimeline+MainView flex 스택+selectedSegmentId/segmentAssignees. check:all 165/165 · 실렌더 5/5(블록 6·이니셜 2 — 초기 NG 는 assignees effect 가 segments 비반응 읽기 → deps 정수정·시크 20.0s·360px 오버플로 0). 자기리뷰 PASS(비더빙 flex 단일 자식 = 레이아웃 불변).
- 2026-07-19 Fable — E2: edit-dub-segment 신설·deno clean·v1 배포(플랜 검증 표면 전제) · 프로드 시딩 통합 5/5(retime 200+JSON/트랙 미러·경계 400×2·비호스트 403·recording 409·delete cascade).
- 2026-07-19 Fable — E3: 핸들 드래그(낙관 반영 = 세그 배열 정체성 귀속 — set-state-in-effect 없이 자동 무효)·✕ 삭제·dub_edit 화이트리스트+발신자명 수신측 확정·RoomPage 3s decay. check:all 165/165 · 2탭 E2E 5/5(DB 13000→18716ms·멤버 폭 35→75px·✎배지·삭제 동기·멤버 읽기전용).
- 2026-07-19 Fable — E4: 픽스 5(제출 toast·역할저장 toast·submitted 대기·합성 힌트·트림 펼침 이유)+i18n 5키×3. check:all 165/165 · 스팟 = E1 하네스 재실행 5/5(회귀 0).
- 2026-07-19 Fable — E5: §0 [x]+probe·DubSession.md READY 편집 잠금 1줄·GAP-MATRIX 로그·docs 게이트 3종 0. **완료 판정: 재현됨**(전 phase 실측·기각/defer 명시). 배포 잔여 = CF Pages(트림 v1·타임아웃 픽스와 합류 — /배포 게이트).
- 2026-07-19 Fable — v1.1 줌(주인님 실사용 피드백 "너무 촘촘" — defer 부활): 캡컷식 −/맞춤/＋ ×1~16(스트립 폭=zoom×100%·플레이헤드 중앙 유지·재생 자동 추적)·확대 블록 대사 미리보기·선택 z-우선. 하네스 6/6(스트립 1403 vs 뷰포트 416·블록 42→142px·대사 표시·360px fit 무회귀)·check:all 165/165. 하네스 이니셜 판정은 aria-label 기준으로 정수정(대사 미리보기와 분리).

## 참조 문서
- `docs/research/DUB-TRIM-UX-REFERENCES.md` — UX 4축 권고(설계 근거)
- DOGFOOD §0 DUB-TRIM(v1 트림)·DUB-EDIT 행 — 백로그 SSOT
- `supabase/functions/update-dub-segment-text/index.ts` — 게이트·JSON·미러 선례
- 감사 3방향 발견(2026-07-19, Explore 읽기 전용) 요지는 §0 DUB-EDIT 행에 등재
