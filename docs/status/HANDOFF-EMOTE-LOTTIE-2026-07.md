---
tags: [status, handoff]
---

# HANDOFF — 이모트 LoL 기능화 + 옐로 Lottie (메인레포 이관)

> 2026-07-10 룸 이모트 기능화 세션(Opus) 인계. **Phase 1–4 완료·커밋**(로컬 jason `main`). **Lottie(옐로 이모트)는 환경 블로커로 메인레포에서 진행 예정**(주인님 지시). 배포는 미실행(Phase 7).

## 완료 (이번 세션 · 커밋됨, 미배포)

| 커밋 | 내용 |
|---|---|
| `a656783` | **Phase 1** 하단바 스텁 배선 — 🎧→믹서·🎭→PiP(controlled-prop 리프트, 배우전용)·⏺→'준비중'. AudioMixerPanel/FloatingSelfMonitor 로컬 open 제거→RoomPage 소유. i18n `room.ctrlRecordSoon`. 테스트 2종 제어형 갱신. |
| `0e907fe` | **Phase 2** 신규 방 기본 배경=모닥불 — `create-room/index.ts:38` insert +`background_url`. **Edge 재배포 필요**(미실행). |
| `0659c05` | **Phase 3** 이모트 로드아웃 피커 — `EmoteLoadoutPicker.tsx`(추가/제거/순서/기본복원/저장, `setSlots` 소비)·`reactionCatalog.ts`(EMOTE_CATALOG 24 단일 SSOT)·`STORAGE_KEY` export·유닛 5. i18n reaction.* 11키. |
| `daeafa8` | **Phase 4** 우도크 재분배 — `EmoteConsoleCard.tsx`(방분위기 인라인+로드아웃 전 슬롯 wrap+✏️피커). MoodMeterCard·SoundboardCard **삭제**(흡수). RightPanel flex-1 세로↑. |

게이트 각 phase 통과: tsc 0 · lint 0 · vitest **125/125** · i18nCoverage 4/4.

## ⚠️ 배포 상태 — **미배포**
- 프론트(Phase 1·3·4 **+5–6 Lottie**): 커밋만. CF Pages(`chatterbox-7r8.pages.dev`) **미갱신** — 라이브는 구버전.
- create-room Edge(Phase 2): 커밋만. **재배포 안 하면 신규 방에 모닥불 기본배경 안 붙음**.
- → 배포 재개 시 Phase 7 루프: `build`→번들 비밀키 감사(성역)→`create-room` Edge 재배포→CF Pages→인증 룸 실렌더.

## 남은 작업

### Phase 5–6 — 옐로 Lottie 이모트 — **완료 (2026-07-10, 이 워크트리에서)**
**블로커 정정:** "skills CLI 미존재"는 오판 — 진범은 **rtk 훅의 npx 재작성**(`npx skills` → `rtk skills` → "Unknown command"). **절대경로 `/opt/homebrew/bin/npx skills add diffusionstudio/lottie`** 로 우회 성공([[work-in-jason-worktree]] npx 함정과 동일 뿌리). `text-to-lottie` 스킬 설치됨(`.claude/skills/text-to-lottie/`).

**구현(설계된 확장점 그대로 drop-in):**
- 자산: `public/lotties/emotes/` 8종(기본 로드아웃 전부) — 96×96·60fps·2s 루프·투명, 옐로/앰버 라운드(fire-amber), 합계 ~29KB. 생성기 스크립트로 저작 후 lottie_light 헤드리스 몽타주(8종×5프레임) 육안 3라운드 튜닝.
- 코드: `lottieEmoteMap.ts`(LOTTIE_BY_ID·MAX_LOTTIE_FLOATS=8) · `EmoteGlyph.tsx`(단일 렌더러+성능 가드 전부) · 통합 3곳 스왑 · `EMOTE_ID_BY_EMOJI` 역색인 · 휠 화면끝 클램프(부수 ponytail 해소) · 의존성 `lottie-web@5.13`(lottie_light **지연 청크** 169KB/gzip 47KB — 초기 번들 영향 0).
- 검증: tsc 0·lint 0·vitest 130/130(계약 테스트 +5)·docs:check·build PASS + **인룸 E2E 7/7**(dev 프론트+프로드 백엔드: 콘솔 8/8 Lottie 실렌더·발사→플로트 svg·지연청크 로드·콘솔에러 0). 상세 = `docs/contracts/ReactionWheel.md §비주얼 레이어`.

**설계된 확장점(구현하면 drop-in):**
- 이모트는 전부 **데이터 주도**(`reactionCatalog.ts` `EMOTE_CATALOG` = `{id,emoji,label}[]`). id 가 안정 키.
- **신설 예정** `src/features/reaction/lottieEmoteMap.ts` — `LOTTIE_BY_ID: Record<string,string>`(id→`/lotties/emotes/<id>.json`). 빈 맵=전부 emoji.
- **신설 예정** `EmoteGlyph.tsx` — 이모트 비주얼 단일 렌더러. `LOTTIE_BY_ID[id]` 있으면 lottie, 없으면 emoji. **성능 가드(성역):** `prefers-reduced-motion`→정지/emoji · 모바일(coarse/<480)→emoji · 파싱 캐시 · 좌석 플로트 동시 상한(최근 ≤8 lottie, 초과 emoji; MAX_FLOATS=30).
- **통합 지점 3곳**(EmoteGlyph 로 스왑, 로직 무변경): `ReactionWheel.tsx` 칩 · `EmoteConsoleCard.tsx` 버튼 · `ReactionOverlay.tsx` 좌석 플로트.
- **옐로 요구**("이모지는 노란색이여야함"): 생성 프롬프트 = 통일된 **옐로/앰버 라운드 이모트**(fire-amber #FF8C2A 모닥불 언어). 자산 없이 지금 옐로를 원하면 임시로 이모트 컨테이너에 `bg-fire-amber/10~15` 앰버 틴트 적용 가능(저비용).
- **자산 추가 절차**: ①`public/lotties/emotes/<id>.json` ②`LOTTIE_BY_ID` 1줄 ③렌더러 의존성(`@lottiefiles/dotlottie-react` 권장/`lottie-react`) 추가 후 EmoteGlyph lottie 분기 활성. **컴포넌트 로직 변경 0**.
- 부수: `ReactionWheel.tsx` 화면끝 클램프(ponytail `ReactionWheel.md:75`) 소규모.

### Phase 7 — SSOT 백로그 + 문서 + 배포
- **SSOT 갭 감사(이 세션 수행, 정정본)** — GAP-MATRIX 백로그로 기록 필요(파일이 병행세션 dirty라 이번 미기록). 실누락(전부 신규+백엔드 의존 또는 설계 defer, 구현 아님):
  - HOST-09/10/11 채팅 안전(슬로우·금칙어·클리어) · ROOM-15 뷰어↔배우 자기전환 · ROOM-18 영상 스크러버 · ROOM-22 관객 폴 · HOST-13 호스트 승계 · 다음순서 큐 · 채팅 오버레이 버블.
  - **정정:** ROOM-08 음량믹서는 "미노출" 아님 — 무대에 실재, 이 세션이 🎧로 배선(정찰 orca stale 오판).
  - 추가 지점: RightPanel 탭은 `RoomPage.tsx:634 tabs` 배열에 1개 push로 확장(백로그 기능 후속 진입로).
- 문서 as-built: `docs/contracts/ReactionWheel.md`(피커·확장점) · `docs/contracts/RightPanel.md`(:9 주석 stale — 실탭=chat·dub·vgen·notes·host + Mood 흡수 정정) · `docs/design/ROOM-REDESIGN-2026-07.md §4`(하단바·기본배경·우도크 재분배). `docs:check`.

## 확장성 원칙 (주인님 요구 "추가확장가능")
① 이모트 추가 = `EMOTE_CATALOG` 1행(+옐로면 lottie 파일+`LOTTIE_BY_ID` 1줄). ② 도구/패널 추가 = `RoomPage.tsx:634 tabs` 1 push(주입 셸 무변경). ③ 하드코딩 분산 금지 — 이모트/맵은 단일 SSOT 파일. ④ 레이어 분리: 기능(피커/slots)⊥비주얼(lottie 매핑)⊥소리(SFX 후속, 미결 defer).

## ⚠️ 운영 (성역)
- **병행세션 미커밋 다수**(aria 청소·docs 6·의상실 등) 워크트리 공존. 커밋 **룸/리액션 스코프 명시 목록만**, 공유파일(**locales·package.json·GAP-MATRIX·docs**)은 **HEAD 재구성 선별 스테이징**([[jason-worktree-concurrent-sessions]]). 이 세션 로케일 3파일은 그 방식으로 처리함(스크립트 패턴: `git show HEAD:… → 내 키 삽입 → hash-object -w → update-index --cacheinfo`).
- 작업·게이트 전부 `~/jason/ChatterBox` 절대경로([[work-in-jason-worktree]]). **정찰이 orca(stale) 읽으면 폐기·jason 직접 재검증**([[deployed-fn-drift]]) — 이 세션 SSOT 감사·UI 인벤토리 둘 다 orca 오판 → jason 재검증으로 정정함.

## first verify (재시작)
`npm run type-check && npm run lint && npx vitest run && npm run docs:check` — 현재 그린(125/125). Lottie 착수 시 렌더러 의존성 추가 후 번들 사이즈 실측.
