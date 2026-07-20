# GOAL-dub-panel-unify — 더빙 3패널 정본 재배치 (사다리 U · PANEL-UNIFY-V2)

## 골 한 줄
더빙 조작이 좌=대사 액션 정본 / 우=얇은 라이프사이클 레일 / 센터=녹음 HUD+상태 시각화로 재배치되고 세그 트리플 중복 렌더가 소멸한 상태 — verified by `npm run check:all` + phase 별 실렌더 하네스(DB 실측), while preserving Edge 계약 무변경·기녹음 보존·S4 솔로 원버튼·비더빙 무대 무회귀. details in docs/goals/GOAL-dub-panel-unify.md

## 배경 (2026-07-20 주인님 승인 방향)
솔로 더빙에서 우패널이 동일 `핸들·대기·● 녹음` 행 수십 개(정보 0) — 세그 엔티티가 좌패널·타임라인·우패널 3곳 중복. 정찰 교정(실측): 우패널 탭은 `hidden` 유지(`RightPanel.tsx` "MUST NOT 언마운트")라 데이터층 승격 불필요 — 리팩터 = DubRecorder 엔진↔목록 UI 분리. 추가 지시: **"더빙된 상태가 보여야 — 파형이나 색"**(U3).

## 1. Outcome / 5. Phases (이진·검증 명령)
| # | 항목 | Outcome(완료 시 참) | 검증 |
|---|---|---|---|
| U0 | 문서화 | 브리프+사다리 U+§0 갱신 | docs:check·links 0 |
| U1 | 엔진 헤드리스 | dubStore `recEngine{start,stop,replay,submit}` 레지스트리+상태(recordingTrackId·previewUrl·recBusy) 승격, `recordRequest` 브리지 삭제, 좌패널 직결 — 동작 등가 | check:all + 실렌더(좌 🎙→녹음·중지 = F8 등가) |
| U2 | 센터 녹음 HUD | 배너→[🎙 지금 녹음] 원버튼·녹음 HUD(레벨미터+■)·프리뷰 HUD(재생+캘리브+제출) | 실렌더(원버튼→녹음→제출 DB 실측)+360px |
| U3 | 더빙 상태 시각화 | 타임라인 세그 미녹음=반투명/제출=채움/확정=✓ + 좌패널 행 상태 + 프리뷰 미니 파형(canvas) | 실렌더(제출 전후 스타일 변화+파형 픽셀 비어있지 않음) |
| U4 | 우패널 레일 축소 | 세그별 트랙 행 제거 → 진행 n/m+호스트 확정 컴팩트 목록(submitted/synced만) | 실렌더(솔로 세그행 스팸 소멸)+다인 확정 무회귀 |
| U5 | 실증 총괄 | 원버튼 e2e·탭 전환 중 녹음 지속·솔로(S4) 무회귀·시사회/베드 공존·360px 0 | 통합 실렌더 + check:all + 문서 마감 |

## 2. Verification surface
`npm run check:all`(165+α) · phase 별 실렌더 하네스(프로드 시딩·무과금 — `dub-f-spot.mjs` 골격 재사용·DUB 탭 클릭 관례) · U5 통합.

## 3. Constraints (후퇴 금지)
Edge/서버 계약 무변경(프론트 전용·마이그 0) · 기녹음 보존·제출/확정 게이트 무약화 · S4 솔로 원버튼·시사회·캘리브레이션·레벨미터 기능 무손실 · 비더빙 무대 무회귀 · i18n 3국어 · 360px · 사다리 F 검증 표면 green 유지.

## 4. Boundaries
허용: src/features/{dub,stage}/ · stores/dubStore · i18n · docs · 실렌더 스크래치. 금지: supabase/functions(무수정) · 마이그 · 새 의존성. 범위 밖: 호스트 확정 좌패널 이동(V3)·아바타 위치 방 공유·HAIR-MATTE·소스 전체 파형 트랙(V3).

## 6. Blocked stop condition
엔진 분리 후 F8 등가 실렌더 무진전 3패스 → blocked·4분류 보고. 플랜 정본: `~/.claude/plans/snoopy-rolling-sutton.md`(승인 2026-07-20).

## 7. 실행 기록
- 2026-07-20 Fable — 플랜모드 승인(주인님 피드백: 더빙 상태 시각화 U3 추가)·U0 착수.
- 2026-07-20 Fable — U0 완료: 브리프·사다리 U·§0 V2 행 갱신 + 오늘 CF 배포로 stale 된 ⏳ 3건(TRIM·VISIBILITY·EDIT) 정정. docs:check/links/drift 0.
- 2026-07-20 Fable — U1 완료: rec 상태 6종(recTrackId·recPreview·recBusy·recCalMs·recMicStream·recError) dubStore 승격+blob 엔진 ref·recEngine{start,stop,replay,submit} 등록·recordRequest 브리지 삭제·좌패널 직결. check:all 165/165(drift 가 F8 probe 삭제를 REGRESSION 실포착 → recEngine 승계)·실렌더 10/10(F2/F4/F5/F6/F7/F8 전 항목 그린).
- 2026-07-20 Fable — U2 완료: 배너 [지금 녹음] 원버튼(myTurnTrackId)+녹음 HUD(레벨미터·■)+프리뷰 HUD(캘리브·재재생·다시 녹음·제출)+recError 센터 배지. 실렌더 6/6(`dub-u-spot.mjs` — 테이크 루프·360px 랩·제출 DB submitted+recording_url+cal 100). 부수 결함 2 수정: 솔로 초대 필(z-20)이 배너 클릭 가로챔→더빙 중 숨김 / 프리뷰 배지가 HUD 와 중복·360px 겹침→제거(키 3로케일 삭제).
- 2026-07-20 Fable — U3 완료: segmentStatus 파생(assignee 매칭 동일 키)+타임라인 미녹음 점선 opacity 0.5/제출 채움/확정 ✓+좌패널 amber/green ✓+프리뷰 미니 파형(TakeWaveform — decodeAudioData 피크 canvas). 실렌더 4/4(`dub-u3-spot.mjs` — opacity 0.5→1·synced ✓ 양패널·파형 690픽셀). i18n 5키×3(recordNow·retake·segRecorded·segConfirmed·waveformLabel).
- 2026-07-20 Fable — U4 완료: DubRecorder 세그 행/원본 오디오/번역 토글 제거 → 레일(안내 1줄+확정 대기 목록+진행 n/m)·dubSessionId prop 삭제·confirmButton "확인(synced)"→"확정" ×3. **자기리뷰 실갭 수정**: 확정 해제 후 재녹음 진입점 소실 → myTurnRanges 를 synced 제외 전체로 확장(submitted 플래그 — 배너 제외·좌패널 🎙 재녹음). 실렌더 4/4(`dub-u4-spot.mjs` — rail 0→1·확정→synced·해제→🎙→재제출 DB).
- 2026-07-20 Fable — 후속 UX(주인님 "Segment 8 등 개발자 텍스트 친화 교체"): ①레일의 `speaker_name` 영어 합성 라벨("Segment N", assign-dub-roles MVP)을 실제 대사(translated||transcript, 폴백 "대사 N") 노출로 교체 ②헤더·좌패널 raw DB status 배지("recording"/"ready")를 친화 라벨(DUB_SESSION_STATUS_I18N — 녹음 중/녹음 준비/합성 중…)로 ③타임라인 "세그먼트/Segment"→"대사/Line/セリフ" 용어 통일(segEditLabel·mySegment 와 정합). i18n 9키×3. 실렌더(`dub-u4-spot.mjs` 친화 어서션 5/5 — 레일 "1.0s·첫 대사·제출됨"·Segment 소거·배지 "녹음 중")·check:all 0. 전역 스캔: 잔존 raw status 는 AvatarForgeDevPage(개발 전용)뿐.
- 2026-07-20 Fable — **CF Pages 배포 완료**(프론트 전용·Edge 0). check:all 0 → build → 번들 비밀키 감사 클린(서버키 6+service_role+__dubStore DEV 훅 프로드 제외) → wrangler(별칭 미승격 → `--branch main` 재배포로 프로덕션 승격, 번들 해시 일치) → 헤드리스 부팅 그린 → **프로드 라이브 실증 5/5**(`dub-u4-spot.mjs` BASE=배포URL — 레일 "첫 대사·제출됨"·배지 "녹음 중"·확정/해제 왕복). 함정 기록: `wrangler pages deploy` 가 dirty tree 에서 프리뷰로 떨어질 수 있음 → **`--branch main` 명시 필수**(deployed-fn drift 동류).
- 2026-07-20 Fable — **U5 완주·골 종결**. 통합 실렌더 `dub-u5-spot.mjs` 3/3×3회(솔로 원버튼 체인 ready→recording·**채팅 탭 전환 중 녹음 HUD 유지·비활성 탭 상태 그대로 제출 완주** — hidden 탭 엔진 구동 실증) + 최종 코드에서 U2 6/6·U3 4/4 재확인 + F 회귀 10/10 + `check:all` 0. **부수 실결함 정수정**: DubPanel refresh out-of-order 레이스(연속 refresh 의 늦은 응답이 recording→ready 역행 → DubRecorder 언마운트·recEngine 사망·조작 무반응 — 시퀀스 토큰 latest-wins 가드). DEV 훅 `window.__dubStore` 추가(프로드 제외·하네스 실측용). 관찰 한계(정직 기록): 전이 직후 첫 클릭 1회 드롭 사례 — store/엔진 정상(수동 start 즉시 동작)·리렌더 중 노드 교체로 DOM 클릭 유실, 재클릭 동작. 후속 조사 후보(V3). 배포는 골 밖(`/배포` 승인 게이트).
