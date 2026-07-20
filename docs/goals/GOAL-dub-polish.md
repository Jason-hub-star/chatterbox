# GOAL-dub-polish — 더빙 폴리시 사다리 F (피드백 배치 + /감사 신규 전량)

## 골 한 줄
주인님 실사용 피드백 배치(2026-07-19)와 /감사 3기 신규 발견 전량이 구현·실측된 상태 — verified by `npm run check:all` + F1 프로드 통합 + phase 별 실렌더/E2E, while preserving 더빙 파이프라인·비더빙 무대 무회귀(165/165)·기녹음 보존 원칙. details in docs/goals/GOAL-dub-polish.md

## 1. Outcome / 5. Phases (이진·검증 명령)
| # | 항목 | Outcome(완료 시 참) | 검증 |
|---|---|---|---|
| F1 | DUB-CONSENT-VIEWER(**High**) | 뷰어는 동의 계수·게이트에서 제외(배우만) + 뷰어에게 동의/배정 액션 미노출 — 관전자 있어도 녹음 시작 가능 | deno + 프로드 통합(뷰어 join 방: 배우만 동의→all_consented→start 200·뷰어 동의 403) |
| F2 | DUB-SCRIPT-TELEPORT | 좌패널 세그 클릭 → 센터 시크+타임라인 선택 | 실렌더(클릭→currentTime·selected) |
| F3 | 신호·통지 묶음 | 체인 완료 toast·솔로 원버튼 진행 라벨·내 트랙 변경(시간/해제) toast·토글 "내 화면만" 카피 | check:all + 실렌더 스팟 |
| F4 | DUB-NEW | completed/failed 에서 [새 영상으로 더빙] → Selector 재표시·새 세션 자연 전환 | 실렌더(버튼→업로드 UI) |
| F5 | DUB-STEP-BACK | 호스트 recording→ready 되돌림(잠금 해제·트랙/녹음 보존) + 텍스트 수정 recording 허용 | deno + 통합(역전이·잠금해제·텍스트 200/시간 409 유지) |
| F6 | DUB-AVATAR-DRAG | 오버레이 아바타 드래그 재배치(로컬 v1·영상 박스 내 클램프) | 실렌더(드래그→위치 변경) |
| F7 | DUB-A11Y-M | 키보드 retime(선택 세그 ←/→·Shift)·터치 타겟 44px(줌/삭제/핸들)·비호스트 ✏️ 안내·시사회 카피 | check:all + 실렌더 스팟 |
| F8 | PANEL-UNIFY v1 | 좌패널 내 세그에 [녹음] 버튼 → store 브리지로 DubRecorder 시작(조작 동선 좌측 개방) | 실렌더(좌패널 클릭→REC 진입) |
| — | DUB-HAIR-MATTE | **HOLD(크로스레포)** — Vtube 매팅 개선, 이 레포 불가·병행세션 확인 선행 | Vtube 세션 |

## 2. Verification surface
`npm run check:all`(165+α) · F1/F5 deno+프로드 시딩 통합(무과금) · F2/F4/F6/F8 실렌더 하네스(시딩) · 각 phase 메인 자기리뷰.

## 3. Constraints (후퇴 금지)
기녹음 보존(F5 역전이는 트랙·녹음물 무삭제·시간/구조 편집은 ready 잠금 유지) · 서버 게이트 약화 금지(F1 은 강화) · 비더빙 무대·다인 흐름 무회귀 · i18n 3국어 · 360px.

## 4. Boundaries
허용: src/features/{dub,stage}/ · stores/dubStore · lib/dub · supabase/functions/{record-consent,start-dub-recording,update-dub-segment-text,revert-dub-session(신규)} · i18n · docs. 금지: 마이그레이션 · 새 의존성. 범위 밖: PANEL-UNIFY 전면 재배치(v1 개방까지만)·아바타 위치 방 공유·HAIR-MATTE(Vtube).

## 6. Blocked stop condition
F5 역전이가 상태머신 계약과 충돌 반복 → blocked·정본 설계 질문. 무진전 3패스 blocked(4분류).

## 7. 실행 기록
- 2026-07-19 Fable — 사다리 조립("전부 ㄱ" 승인)·F1 착수.
- 2026-07-19 Fable — **F1~F8 완주**. F1: record-consent v10 배포·프로드 3/3(`dub-f1-consent.mjs`). F5: revert-dub-session v1·update-dub-segment-text v6 배포·프로드 6/6(`dub-f5-stepback.mjs` — 비호스트 403·recording 텍스트 200·retime 409 유지·revert→ready+잠금해제+기녹음 보존·재revert 409·재시작 role_version++). F2/F4/F6/F7/F8: 통합 실렌더 10/10(`dub-f-spot.mjs` — 텔레포트 시크 8.5s·failed→새 영상↔복귀·오버레이 드래그+클램프·키보드 retime DB 6000→6100·360px 오버플로 0·좌패널 녹음→■중지). F3: check:all 그린(i18nCoverage 포함). 게이트: `npm run check:all` 0(165+α). 부수 발견 수정 1: recordRequest stale nonce 를 마운트 시점 초기화(탭 여는 순간 기습 녹음 방지). 재현/근사/막힘/불확실: 전 phase 재현(실측), 막힘 0 — HAIR-MATTE 만 HOLD(크로스레포). 배포 잔여: CF Pages 프론트(오늘 프론트 전량) — `/배포` 승인 게이트.
