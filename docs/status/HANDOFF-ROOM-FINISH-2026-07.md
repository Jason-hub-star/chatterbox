---
tags: [status, handoff]
---

# HANDOFF — 룸 마무리 (하단 스텁 배선 + 신규 방 기본 배경)

> 2026-07-10 룸 UIUX 리디자인 세션(Fable) 인계. 주인님이 "룸 마무리"를 다음 작업으로 콜 → **착수 직전 조사만 마치고 다음 세션 인계**(주인님 지시). 엔진 무변경, 프레젠테이션+create-room 1줄.

## next entrypoint
`src/features/room/RoomBottomBar.tsx` (죽은 스텁 3개: 🎧 line 73~·⏺ 82~·🎭 91~)

## read first
1. `docs/design/ROOM-REDESIGN-2026-07.md` — § defer 목록 + as-built(이 세션 SSOT)
2. `src/features/room/RoomBottomBar.tsx` — 스텁 3개
3. 이 문서 § 조사 결과

## 현재 상태 (완료·배포됨)
룸 리디자인 커밋 `7ebf613`~`ac4eda4` 전부 push·CF Pages 라이브(`chatterbox-7r8.pages.dev`). 인증 실렌더 검증 완료.
- R2 무대(호스트 앰버링·크라운) · R3 세션정보 카드 · R4 우도크(방분위기·사운드보드·도구탭 5개) · 상단 라이브 타이머
- **무대 씬**: 모닥불 배경(`public/scenes/room-stage/campfire-forest.webp`, 주인님 제공) 배선 — 방장이 **관리 탭 → STAGE_BACKGROUNDS**에서 선택 시 전원 반영. MainView 씬 히어로화·빈 슬롯 숨김·별자리 직선 제거·씬이 센터 칼럼 꽉 채움(여백 제거)
- 공유링크 버그 `/room/`→`/rooms/` 정수정(`b179e72`)

## § 다음 작업 = 룸 마무리 (착수 대기)

### 조사 결과 (핵심 — 배선 방식)
1. **🎧 헤드폰 → AudioMixerPanel 열기** (`src/features/room/AudioMixerPanel.tsx`)
   - 현재: **로컬 `useState open`(11행)** + 자체 🎚 토글 버튼(`absolute right-14 top-2`). 마스터+참가자별 볼륨 슬라이더(audioStore).
   - 배선 필요: open 상태를 외부(하단바)에서 제어하려면 **prop 또는 스토어로 리프트**.
2. **🎭 아바타/카메라 → 트래킹/PiP 토글** (`src/features/room/FloatingSelfMonitor.tsx`)
   - 현재: **로컬 `useState open`(15행)** + 자체 📷 토글(`absolute right-2 top-2`). 기본 off(켤 때만 WebGL 컨텍스트 +1), 모바일(coarse/<480px) 미노출.
   - 배선 필요: open 상태 리프트. "아바타/카메라 ON" = self PiP 미리보기 on-off 로 해석.
3. **⏺ 녹음 → defer**: Egress 엔진 부재(`recordings` 테이블만 존재, 시작/정지 Edge 없음) → 비활성 유지 + '준비중' 명시(가짜 녹화 금지).
4. **신규 방 기본 배경 = 모닥불** (`supabase/functions/create-room/index.ts:38`)
   - 현재 insert: `{ host_id, title, max_participants, language, genre, status:"waiting", current_participants:1 }`
   - 추가: `background_url: "/scenes/room-stage/campfire-forest.webp"` **1줄** → **Edge 재배포 필요**(`supabase functions deploy create-room --project-ref owfcrolbvikkqrotmleq`). 서버 배경검증은 `/scenes/` prefix라 통과.

### 추천 구현 (미니멀)
- **RoomPage state 로 open 관리**(스토어 신설 회피 — 단일 방이라 YAGNI): 두 패널을 `open`/`onToggle` **controlled prop** 화 → `AudioMixerPanel`/`FloatingSelfMonitor` 의 로컬 `useState` 제거, RoomPage 가 소유. 하단바 헤드폰/아바타 콜백이 토글. 기존 인패널 🎚/📷 토글은 제거(하단바가 primary) 또는 유지(중복 허용, 콜 필요).
- 파일: `RoomBottomBar.tsx`(3 스텁 실배선·props 추가) · `RoomPage.tsx`(open state·콜백·bottomBarContent 배선) · `AudioMixerPanel.tsx`·`FloatingSelfMonitor.tsx`(controlled prop) · `create-room/index.ts`(+deploy) · i18n(녹음 '준비중' 라벨 시 3언어 선별 스테이징).

## blockers
none — 엔진(hook/store/rig) 무변경. create-room Edge 1줄+재배포만 백엔드 터치(deno check 후 deploy).

## ⚠️ 운영 주의 (병행 세션 — 성역)
- 워크트리에 **병행 세션 미커밋 60+파일**(아리아 청소·의상실·rig 리팩터)이 있고 **CF Pages에 라이브**(이 세션이 워킹트리 전체 배포). 룸 파일은 클린/커밋됨.
- 커밋은 **룸-스코프 명시 목록만**(`git add <파일>`), 로케일 등 공유파일은 **HEAD 재구성 선별 스테이징**([[jason-worktree-concurrent-sessions]] 메모리). 착수 전 `git status`로 병행 진행·HEAD 이동 재확인.
- **aria 스토리지 삭제 언블록됨**(이 세션 재배포로 프론트 구번들 의존 해소) — 별개 트랙(`docs/plan/ROADMAP-LOBBY-V4.md` line 71).

## 배포·검증 루프 (이 세션 확립)
1. `npm run build` → **번들 비밀키 감사(성역)**: `.env` 서버키가 `dist/`에 있나 `/usr/bin/grep -rlF`(rtk 우회, 값 미출력) — 있으면 STOP.
2. `export CLOUDFLARE_ACCOUNT_ID=276b9380f073c8007ba2d3d41b2c6703 && npx wrangler pages deploy dist --project-name chatterbox --commit-dirty=true` → 별칭 새 번들 hash 확인.
3. **인증 룸 실렌더**: `.claude/skills/supabase-slice-verify/templates/deployed-room-e2e.mjs`(BASE=배포URL). 라우트 `/rooms/:roomId`(**복수** — 단수 `/room/`은 앱 404). 세션 주입 storageKey=`sb-<ref>-auth-token`(기본). playwright-core는 `npm i --no-save` 임시설치 후 제거.

## first verify (재시작 시)
`npm run type-check && npm run lint && npx vitest run && npm run docs:check` — 전부 그린 확인 후 착수(현재 그린). create-room Edge 변경 시 `deno check` 추가.
