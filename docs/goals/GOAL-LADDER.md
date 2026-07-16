---
tags: [status, goals]
---

<!--
  GOAL-LADDER.md — 2026-07-12 승인된 골 사다리(8골)의 상태판.
  각 골의 6요소 상세는 GOAL-*.md 브리프(대형 골만 두껍게, 스몰윈은 얇게).
  완료(배포까지 종결)된 골 브리프는 archive/ 로 이관 — 이 표가 영구 인덱스(§7 감사추적은 archive 보존).
  규칙(골 프롬프트 계약): 유닛당 골 1개 · 승인 게이트는 골 경계 · Constraints 에
  "이전 골 검증 표면 green 유지" 누적 · 완료 판정은 주장 아닌 증거(실행 명령·실측).
  상태: PENDING → ACTIVE → DONE(증거 요약 1줄) / BLOCKED(사유).
-->

# 골 사다리 — 문서→퀵픽스→수직→UIUX→템플릿화 (2026-07-12 승인)

| # | 골 | Outcome (완료 시 참) | Verification 표면 | 상태 |
|---|---|---|---|---|
| G1 | 문서 리팩토링 | docs/ 루트 md ≤15, archive/·ops/·plan/ 재편, INDEX 폴더 1:1 | `docs:check`+`docs:drift` 그린 + 참조 링크 무결성 0 깨짐 | **DONE**(2026-07-12: 루트 52→14·이동 37+1·경로 재작성 61터치·`docs:links` 신설 — check PASS·drift 12행 0/0·links 0 broken·기존 깨진 링크 11도 수리) |
| G2 | F-패스 퀵픽스 | F-1 닉네임·F-3 링크공유·F-4 쇼츠생성 라벨·F-5 채팅 아이콘·F-6 노트→채팅 통합·F-7 방분위기 제거 + U-0 4건 (F-2 라이브 중복은 재현 시) | `check:all` + 실렌더 스모크(닉네임·토스트·휠 키보드) | **DONE**(2026-07-12: F-1=livekit-token name←display_name 근본수정 · **F-2 재현·수정**(🔴 이모지+CSS 점 이중=i18n서 제거) · F-3 호스트 초대링크 승격 · F-4/F-5 라벨 3언어 · F-6 ChatNotesTab 세그먼트 통합(탭 5→4) · F-7 mood 제거 · U-0 4건은 재감사서 기구현 판명(stale)+혼자입장 초대칩 신규 — check:all 그린(131/131)·deno clean·**실렌더 스모크 8/8**. ✅ 배포 완료(2026-07-12 G3-E 동편: livekit-token v10+CF Pages)) |
| G3 | V-3 인앱 녹화 | 전원 동의→무대 녹화→R2→작품 재생 e2e, ⏺ 실배선 (방식: 클라 캔버스 합성 P1 — GOAL-g3 §0) | 통합테스트 + 프로드 라이브 녹화 1건 실측(bepo·구 ship-live) | **DONE**(2026-07-12: A+B 통합 17/17·C 하네스 8/8·D 2탭 13/13 → **E 배포**: 마이그 push(psql 테이블2·정책2·cron1)+Edge 6종(recording 5 v1+livekit-token v10, 오늘 ACTIVE 실측)+CF Pages(curl 3종 200·번들 감사 CLEAN) → **프로드 통합 17/17 + 프로드 2탭 라이브 10/10**: R2 실업로드 PUT 200·473,761B webm ready·presign GET 바이트일치·HostConsole video 실디코드. G2 배포 대기분(F-1 닉네임·G2 프론트)도 동편 라이브) |
| G4 | V-10 자막편집(더빙) | STT 세그먼트 편집 UI→합성 산출물 자막 반영 | 통합 + 산출물 실측(vtt/번인 ffprobe) | **DONE** — 로컬 통합 10/10·E2E 11/11 + 배포(Edge v1·CF) 후 프로드 통합 10/10·**클릭스루 13/13**(배포판 편집→실 wasm 합성→R2 산출물 mov_text 에 편집 텍스트·타이밍 ffprobe/SRT 실측) |
| G5 | V-5 관객 투표 | 생성→투표→집계 2탭 동기(뷰어 포함) | 통합 + 2탭 E2E | **DONE**(2026-07-12: 로컬 통합 26/26·2탭 11/11 → **bepo**: 마이그 push(psql 테이블2·정책2·부분 unique 실측)+Edge 3종 v1 ACTIVE(15:06 실측)+CF Pages(`index-CHOD3OHB.js` 서빙·시크릿 감사 0·curl 3종 200) → **프로드 통합 26/26 + 배포판 2탭 클릭스루 11/11**(생성→라이브 투표→reveal percent→리로드 복원→close, 실 LiveKit relay)) |
| G6 | U-무대몰입 | U-2 BGM(3곡 순환·배경 디커플·자동재생 0.25)+SFX 3계열 → U-1 파티클+배경 바람 모션 | 실렌더 + reduced-motion 가드 + autoplay 게이트 실측 | **DONE**(2026-07-13: BGM 3곡+SFX 4종($0.84)+GlowMotes preset+바람 팬 — 로컬 E2E **15/15** → **bepo**: CF Pages(`index-c3z_feIF.js` 서빙·시크릿 감사 7패턴 0·curl 5종 200(사운드 자산 포함)) → **배포판 클릭스루 13/13**(BGM 재생 vol 0.25·게이트 시뮬·SFX 3계열 실 relay·파티클 픽셀·reduced-motion·360px 491≤511). 백엔드 변경 0. **후기**: 불씨 파티클은 주인님 실사용 판정으로 제거(2026-07-13) — 대체 = 불빛 일렁임 재설계) |
| G7 | U-연출 마감 | U-6 로딩/입장 연출(월드별·로티·입장 green) + U-3 배속(호스트 동기) + F-8 대극장 아트 | 360px 실렌더 + vod_sync rate 2탭 | **DONE**(2026-07-13: U-6 은 시안 판정으로 **네온 "On Air" red→green** 확정(로티/월드별 액센트 대체) · U-3 rate 3단+×rate 보정+끝시크 가드 · F-8=무대 전용 대극장 원화 후보 생성 — check:all 138/138 · E2E 15/15 ×2연속(드리프트 수렴 6/5ms·360px 0). ✅ bepo DONE(2026-07-13: CF `index-BCXYszum.js` 별칭 실측·배포판 E2E 13/13·시크릿 감사 0). **골 밖 대기**: F-8 채택 취향 판정. 상세 GOAL-g7-ux-finish §7) |
| G8 | 하네스 템플릿화 | backlog-drift·bepo·goal-backlog·slice-verify 4종을 jason-agent-harness-template 에 이관·REGISTRY 등재 | `scripts/check-harness.sh` PASS | **DONE**(2026-07-13: 하네스 문서 4(backlog-drift-probe·deploy-verify-close·goal-backlog-ladder·supabase-slice-verify 함정 22+1)+범용 스크립트 이식+REGISTRY 활성 표 4행(candidate) — check-harness **PASS**(기준선 대비 회귀 0)·드리프트 스크립트 스모크 STALE 1/REGRESSION 1/exit 1·usage exit 2 실측. 템플릿 레포는 비-git(파일 실존이 증거). 상세 GOAL-g8-harness-template §7) |

## 골별 근거 매트릭스 — 쓸 스킬 · 읽을 문서 (2026-07-12 하이쿠 6기 병렬 실측)

| 골 | 스킬 | 필독 문서 | 실측 핵심(갭/재사용) |
|---|---|---|---|
| G2 | doc-sync · supabase-slice-verify(실렌더) · bepo | DOGFOOD:49 · `contracts/ChatPanel.md`·`RightPanel.md` | 닉네임=livekit-token `name` 주입이 근본수정(`useLiveKitRoom.ts:276` 폴백이 증상) · 노트는 이미 chat 채널 message_type=note(UI만 통합) · mood 제거=`EmoteConsoleCard.tsx:25` |
| G3 | phase-loop · change-impact-map · supabase-slice-verify · bepo | `FEATURE-SPEC:99` · `DATA-SCHEMA §1.11 recordings·§1.22 room_artifacts` · `specs/security/consent-credits-quota.md` · `contracts/VgenExport.md` | 스키마·동의정책·버튼 자리(`RoomBottomBar:94`)·LIVEKIT 키 **기존재** — 갭은 start-room-egress Edge+웹훅+작품함 필터뿐 |
| G4 | phase-loop · supabase-slice-verify · bepo | `DATA-SCHEMA §1.12` · `state-machines/DubSession.md`(READY) · `contracts/DubCompositor.md §3` | 세그먼트 shape `{id,start_ms,end_ms,text,translated_text}`(dub_sessions.diarization_result_json) · 편집 UI=`DubPanel.tsx:192-217`(호스트 게이트 재사용) · 합성=`ffmpeg.ts:83-91`에 `-vf subtitles`(SRT 생성) · 신규 Edge `update-dub-segment-text` 1개 |
| G5 | supabase-slice-verify · bepo | `FEATURE-SPEC:108` · `API-SURFACE:126`(**submit-viewer-poll 계약 기존재**) · `contracts/MobileViewer.md §4.2` · `state-machines/StageMode.md` | 갭=polls·poll_responses 마이그 2뿐 · 재사용: broadcastData·check_rate_limit·수신핸들러(서버릴레이만)·공유 Modal |
| G6 | text-to-audio(음원 생성) · supabase-slice-verify(E2E) · cf-pages-deploy-verify · bepo | `contracts/AudioMixer.md`(BGM=HTMLAudioElement MUST) · `contracts/ReactionWheel.md §비주얼`(MAX_LOTTIE_FLOATS=8·강등 패턴) · `design/DESIGN-TOKENS.md §6·8` | **BGM 확정(2026-07-13 상의)**: 잔잔 피아노 3곡 순환(`public/sounds/bgm-*.m4a`·-16 LUFS 정규화·배경 **디커플** — 배경별 무드는 루프 피로·비청취로 기각) · SFX 3계열=이모트 팝(ReactionOverlay 스폰 — EmoteGlyph 는 휠 칩에도 쓰여 부적합)·투표·입장 차임(CassetteAI $0.01/발, 착수 시 생성) · `audioStore.bgmVolume`+믹서 슬라이더=계약 defer 마감 · 파티클=기존 `GlowMotes` preset 확장(배경 키 유지) · reduced-motion 관례 8곳 기존재 · autoplay 정책=첫 제스처 게이트 필수(리로드 재입장이 실케이스) · 녹화 믹스 불포함 defer |
| G7 | text-to-lottie(로딩 글리프) · scene-pipeline(대극장 아트) · cf-pages-deploy-verify · bepo | `design/DESIGN-TOKENS.md`(spring-green·모션) · `src/features/stage/vodSync.ts`(rate 필드 추가점) · `src/scenes/manifest.ts:108`(theater.webp) | CampfireGlyph=순수 CSS(교체 지점 명확) · ProgressBar 는 이미 `--scene-accent` 연동 · 배속=드리프트 보정식 1x 가정 수정 동반 |
| G8 | (직접) | `~/jason/jason-agent-harness-template/HARNESS-MANIFEST.yaml` · `harnesses/REGISTRY.md`(keep-discard-with-evidence) | 이관 4종: check-backlog-drift(+probe 규약)·bepo 골격·goal-backlog 규약(6요소 매핑)·supabase-slice-verify(함정 22) |

## 골 사다리 R — 룸 페이지 갭 (2026-07-17 감사 A-P1e 후속 · 브리프 `GOAL-room-gaps.md`)

| # | 골 | Outcome (완료 시 참) | Verification 표면 | 상태 |
|---|---|---|---|---|
| R1 | RM-HOSTXFER 호스트 이양(V-6 부활) | HostConsole 대상 선택→이양→host_id 갱신·전원 isHost 재파생 | `check:all` + deno check(transfer-host) + §0 probe | **DONE**(2026-07-17: Edge+래퍼+수신+콘솔 모달+i18n — deno clean·159/159·자기리뷰 PASS·라이브 2탭은 배포 게이트) |
| R2 | RM-EDIT 방 설정 편집 | 제목/장르 변경→서버 재검증→전원 상단바 반영 | `check:all` + deno check(update-room-settings) | **DONE**(2026-07-17: Edge+래퍼+수신+콘솔 섹션+i18n — deno clean·159/159·자기리뷰 PASS·title 80자=create-room SSOT 미러) |
| R3 | RM-GUEST-CTA 게스트 전환 | 채팅 잠금에 로그인 CTA·현 방 `?watch=1` 복귀 | `check:all`(프론트만) | **DONE**(2026-07-17: onGuestCta 콜백 주입+state.from 복귀 — 159/159·자기리뷰 PASS) |
| R4 | RM-MUTE-DUR duration 음소거 | `muted_until` 마이그+만료 자동해제+콘솔 셀렉트 | `check:all` + 로컬 db reset·psql + deno check | **DONE**(2026-07-17: 마이그 불필요 판명(컬럼 20260702050002 기존재) — Edge 3수정+파생 3점+콘솔 셀렉트·deno ×3 clean·159/159·자기리뷰 PASS) |
| R5 | RM-SOFTLEAVE 탭닫기 승계 | keepalive leave(완화)+livekit-webhook(근본) | `check:all` + deno check(웹훅 라이브는 배포 게이트) | **DONE**(2026-07-17: roomLeave 공유 추출+웹훅(재실 대조)+비호스트 keepalive — deno ×2 clean·159/159·자기리뷰 PASS·LiveKit 대시보드 등록은 배포 게이트) |
| — | **승인 게이트**: R6 대본 시스템 설계(마이그 형태·시드 구성) 플랜 승인 | | | |
| R6 | RM-SCRIPT 방별 대본 선택 | ~~`rooms.script_id`+시드 3종~~ → **스펙 정본 재설계 대상**: scripts 테이블+시드 팩(CNT-09)+업로드(CNT-02) — G-286 방향 | 별도 세션 플랜모드 설계 승인 후 | **HOLD**(2026-07-17 주인님 결정: 컬럼-only 안은 스펙(G-286)과 어긋남 판명 — 별도 세션서 정본 설계) |
| R7 | 트랙B 룸 UX 델타 1패스 | 미읽음 뱃지·수락실패 toast·더빙 세그먼트 강조·좌석번호·노트 고지·DUB 뷰어 안내(3국어) | `check:all` + i18nCoverage | **DONE**(2026-07-17: 6건+i18n 7키×3 — 159/159·자기리뷰 PASS·R6 승인 대기 중 선행 처리(의존성 0)) |

## 골 경계 승인 게이트

- G1 뒤: 새 문서 구조 확인(커밋 승인)
- G6/G7 사이(또는 G7 착수 전): U-6 연출 시안 2종(로티 글리프 vs 네온사인) 취향 판정
- 각 골 끝: 배포·커밋·push 승인(기존 게이트 그대로)

## 전제 기본값 (주인님 미이의 시 유지)

- F-패스가 수직(G3~G5)보다 선행 · 자막편집은 더빙 우선(쇼츠는 엔진 재사용 후속) · U-4 드래그·라이트모드 defer/기각 · F-2 라이브 중복은 위치 제보(스크린샷) 대기 — 미제보 시 G2 에서 실렌더 수색 1회 후 미재현이면 스킵 보고.

## defer 대장 (이번 사다리 밖)

V-4 로컬 백업 녹화 · ~~V-6 이양 UI~~(→ 사다리 R1 부활, 2026-07-17) · 손들기 뷰어 버튼(주인님 폐기 결정 2026-07-17 — 승격은 초대 전제 재설계 필요) · V-8 귓속말 · V-9 리허설 피드백 · U-4 드래그 재배치 · 라이트모드(기각 예정 — G1 에서 DOGFOOD 행 정리) · VGen 쇼츠 자막(G4 엔진 재사용) · 채팅 오버레이 버블 · 영상 스크러버.

## 사다리 밖 스몰윈(standalone 골)

사다리(G1~G8) 외 단발 골. 완료(배포까지 종결)는 `archive/` 로 이관, 활성은 `goals/` 유지. 이 표가 인덱스.

| 골 | Outcome | 상태 | 브리프 |
|---|---|---|---|
| ambient-glow | 원화 광원 연출(무대 불 일렁임·로비 구름 그늘) | **DONE**(bepo 92f6199·999109a) | `archive/GOAL-ambient-glow.md` |
| hygiene-host-guard | 호스트 권한 하드닝 | **DONE**(2026-07-12 종결) | `archive/GOAL-hygiene-host-guard.md` |
| admin-selfpromo-lock | `users.is_admin` 셀프승격 자물쇠(선제) | **DONE**(프로드 6/6·콘솔 UI defer) | `archive/GOAL-admin-selfpromo-lock.md` |
| teleprompter-dock | 텔레프롬프터 좌 dock A안 위계(대사 지배) | **ACTIVE**(커밋 4730543·배포 대기) | `GOAL-teleprompter-dock.md` |

## 완료 브리프 아카이브 (감사추적 보존)

DONE 골 브리프는 `archive/` 에 §7 실행 기록과 함께 보존(이 문서가 SSOT 인덱스):
- 사다리: `archive/GOAL-g3-room-recording.md` · `archive/GOAL-g7-ux-finish.md` · `archive/GOAL-g8-harness-template.md` (g1·g2·g4·g5·g6 은 스몰윈이라 브리프 없이 위 표 상태만).
- standalone: `archive/GOAL-{ambient-glow, hygiene-host-guard, admin-selfpromo-lock}.md`.
