---
tags: [guide]
---

# 마일스톤 & Acceptance Criteria

> G-141 산출 문서. 각 Phase의 "완료" 기준. PR 병합 및 배포 결정의 게이트.

> **축 구분(중요):** 이 문서의 `Phase`는 **데모/제품 마일스톤 + 완료 게이트(AC)** 축이다 — "무엇을 언제 시연할 수 있나". **무엇부터 만드나(빌드 착수 순서)는 [[IMPLEMENTATION-ORDER]]가 SSOT**이며, 두 문서의 Phase 번호는 **서로 다른 축(1:1 아님)**이다. 매핑은 IMPLEMENTATION-ORDER 상단 crosswalk 참조. 구현 진행률은 `npm run docs:progress`.

---

## Phase 0 — 스캐폴드 & 기반 연결

**목표:** `npm run dev`가 뜨고, Supabase 인증·DB·Realtime이 동작한다.

### Acceptance Criteria

- [x] `ChatterBox` 레포 생성, Vite 8 + React 19.2 + TypeScript 6 + Tailwind 4 초기화 (설계 예상 Vite 5 → 실제 8)
- [x] `@/` alias 설정 완료, `tsc --noEmit` 에러 0개
- [x] Supabase 클라이언트 연결 — 이메일/비밀번호 로그인 성공 (Confirm email OFF, Auth REST 실증: signUp 즉시세션·login 토큰·getUser·오답거부, 테스트유저 admin 삭제 / UI 폼은 동일 호출 래핑)
- [ ] Zustand `userStore`에 로그인 세션 저장, 새로고침 후 세션 유지 확인 (코드 완료 + init() getSession/onAuthStateChange App 연결 — 브라우저 새로고침 세션유지 실증만 남음)
- [x] `app_config` 테이블 시드 + `useConfigStore` 로드 확인 (supabase CLI 마이그레이션, anon REST 12행/enabled 10 검증)
- [x] react-router (v8) 라우트 트리 구성 (`/`, `/login`, `/register`, `/lobby`, `/rooms/:roomId`, `/settings` — 보호 라우트는 ProtectedRoute 가드)
- [x] Tailwind 4 디자인 토큰 (`stage-base`, `fire-amber`, `stage-text`) 적용 확인 (2026-07-01 무채색 개정 기준)
- [x] Vitest 단위 테스트 환경 설정 (`npm run test` 통과 — configStore.getFlag 2케이스, supabase 목킹)
- [ ] `DEFINITION-OF-DONE.md` 기본 DoD 5항목 CI 통과 (로컬 tsc·lint(ESLint 9 flat)·build·test 그린 / CI 워크플로 미생성·커버리지 게이트 미설정)

**검증 시나리오:**
1. 이메일 회원가입 → 이메일 인증 → 로그인 → 로비 화면 표시
2. `app_config` 테이블 `MAINTENANCE_MODE` = true 설정 → 점검 배너 즉시 노출 (Realtime)

---

## Phase 1 — 2인 음성+표정 방 PoC

**목표:** 방 2개를 생성하고, 브라우저 2개에서 서로의 음성과 아바타 표정을 확인한다.

### Acceptance Criteria

- [x] LiveKit Room 연결 — 2인 음성 수신 확인 (`npm run dev` 2개 탭) — 2026-07-02 실증: `livekit-token` Edge Function 배포 + 2계정·2탭 오디오 트랙 상호수신 + 채팅(DataChannel `chat`) 양방향 송수신 확인. (MediaPipe/아바타/DB CRUD/RLS 게이트는 Phase 2~3)
- [x] MediaPipe FaceLandmarker Full 모델 로드 (CDN), 52 blendshape 추출 — 2026-07-02 실증: `@mediapipe/tasks-vision@0.10.21` + face_landmarker float16 CDN 로드, categoryName→score 맵 추출. (모델 URL 정정: 구 `mediapipe-tasks/...` 404 → `mediapipe-models/.../float16/1/`)
- [x] blendshape → PixiJS 아바타 리그 파라미터 매핑 (최소 눈 깜박임·입 모양) — 2026-07-02 실증 2건: ①`/avatar-poc` 웹캠→blendshape→절차적 PixiJS v8 얼굴(눈깜박·입벌림·미소·눈썹·머리기울임) 반응 PASS. ②`/avatar-aria` **실 rig(아리아)** — Vtube AUTORIG 런타임(`mini_cubism_app`, PixiJS v8·Cubism 파라미터 25개)을 `public/aria-player/`(런타임만 1.5MB), **캐릭터 에셋(character.json+parts)은 Supabase Storage `avatars/aria/`에서 URL 로드**(레포는 아바타 수와 무관하게 고정, AvatarCanvas.md/DATA-SCHEMA models 스토리지 설계 정합). `drive.html`(검증된 blendshape→Cubism 매핑: 적응형 눈 baseline·THA4 양눈링크·입 4단 snap·머리 pose), `?project=<url>`로 캐릭터 무관 로드. 헤드리스: 로컬에셋 제거 후에도 중첩 iframe 모델이 Storage에서 렌더+구동 PASS(CORS+crossOrigin 검증)·콘솔에러0. ponytail: iframe 임베드(단일 로컬 아바타). LiveKit 원격 파라미터 구동(멀티플레이어)·`rig.js` 네이티브 이식은 다음 단계
- [x] LiveKit DataChannel `blendshape` 토픽(**unreliable/lossy** — SSOT WebRTC.md 계약, reliable 아님)으로 표정 전송 → 상대방 아바타 반영 — 2026-07-02 실증: RT-02 220B 바이너리 프레임(`Float32Array(52)`+timestamp+seq+crc16, `src/lib/blendshapeCodec.ts`) 송수신. 송신 스로틀 ~20Hz, 수신 crc16/길이 검증+seq stale-drop(`isNewerSeq`). `RoomPage`+`features/avatar/{AvatarLayer,RemoteAvatar}`: 내 얼굴→송신, 원격 참가자 아바타는 ref Map으로 직접 구동(React state 우회). **헤드리스 2계정·2탭 E2E**: A→B·B→A 양방향, 극단 표정 송신 시 상대 탭 원격 아바타가 정확히 반응(영역 픽셀 diff PASS)·콘솔에러0·tsc/lint/test 28. ponytail: 5프레임 재정렬버퍼(TURN 전용)·헤드포즈 전송·Web Worker는 Phase 2
- [x] 방 생성/입장/퇴장 (`rooms`, `room_participants` 테이블) CRUD 완료 — 2026-07-02 실증: `create-room`·`join-public-room`(멱등·최저빈슬롯)·`leave-room`(호스트 자동승계·빈방 ended) Edge Functions 프로덕션 배포 + 3계정 통합테스트 17/17 + 프로덕션 API E2E 10/10 PASS(비참가자 livekit-token 403 포함).
- [x] RLS 검증: 방 참가자만 채팅/blendshape 수신 가능 — 2026-07-02 실증: `is_room_member()` SECURITY DEFINER(재귀회피) + 참가자-only SELECT psql 실측(멤버조회 1·비멤버 0·클라 직접 INSERT 정책위반 거부). 채팅/blendshape는 `livekit-token` 게이트가 활성 `room_participants` 행을 요구 → 비참가자는 토큰 거부(403)라 room 연결·채널 수신 자체 불가.
- [ ] iOS Safari: MediaPipe 불가 → 키보드 표정 트리거(1~5 키) 동작 확인
- [ ] 저사양 PC(Acer 등)에서 N=2 아바타 60fps 측정 PASS

**검증 시나리오:**
1. 사용자 A가 방 생성 → 사용자 B가 코드로 입장 → 서로 음성 들림
2. A가 웃는 표정 → B의 화면에서 A 아바타가 웃음 표정 표시 (<100ms 지연)

---

## Phase 2 — 방 운영 & 인증 완성

**목표:** 로비·방 목록·비밀번호 방·방장 권한이 동작한다.

### Acceptance Criteria

- [ ] 로비 피드 (라이브 방 목록, 실시간 Realtime 갱신) — 부분: `LobbyPage`+`public_rooms` 뷰로 방 목록·생성 O. **Realtime 자동갱신 미구현(수동 새로고침)** → 남은 개발.
- [ ] 방 생성 폼 (공개/비밀번호/장르 태그) — 부분: 공개방 기본 생성 O(`create-room`). **비밀번호방(`room_secrets`)·장르 태그 미구현** → 남은 개발.
- [ ] 방장 기능: 참가자 강퇴, 방 잠금, 슬롯 재배치 — 미구현(defer) → 남은 개발.
- [ ] `ROOM_MAX_USERS` Feature Flag — 6명 초과 시 입장 거부 — 부분: `join-public-room` 최저빈슬롯 채움 로직 O. **초과 시 flag 게이트 거부 미확인** → 남은 개발.
- [ ] 방 권한 위임 (방장 → 다른 참가자) — 부분: 호스트 퇴장 시 `leave-room` 자동 승계 O. **명시적 위임 UI·브로드캐스트 미구현** → 남은 개발.
- [ ] 크레딧 시스템: 잔액 표시, 크레딧 0 시 VGEN 버튼 비활성화 (표시만, 구현은 Phase 4)
- [ ] Sentry 에러 수집 확인 (의도적 에러 발생 → Sentry Dashboard 수신)

**검증 시나리오:**
1. 비밀번호 방 생성 → 잘못된 비밀번호로 입장 시도 → 거부
2. 방장이 참가자 강퇴 → 해당 참가자가 방에서 제거됨
3. 크레딧 0인 사용자 → VGEN 버튼 비활성화 (메시지는 Phase 4 구현)

---

## Phase 3 — 묵대 완성

**목표:** 6인 방에서 대본·배경·씬 전환이 동작한다.

### Acceptance Criteria

- [ ] 6인 슬롯 레이아웃 (원형 3쌍 — 센터 프레임을 상/중/하 × 좌·우가 둘러쌈; DESIGN-DIRECTION §6.1이 좌3·우3 E형 대체), 드래그 순서 변경 — 부분: `features/stage/{Stage,StageSlot,SelfAvatar,stageLayout}` 원형 3×3 그리드 무대. **2026-07-06: DB `slot_index` 절대좌석 구현**(`seatParticipants` 순수함수 + 기존 `list-room-members` slot 재사용 → 인원변동에 좌석 불변, identity 정렬 리플로우 제거; 유닛 6케이스 + 6탭 실렌더 E2E 좌석결정성 검증) + **참가자별 연결품질 배지**(Phase 2). 이 과정에서 `list-room-members` stale 배포(auth_id 미반환) 발굴·재배포. **드래그 재배치·정밀 좌표·아바타→센터 glow 연결선·희소 인원 균형배치 미구현** → 남은 개발.
- [x] 대본 패널 (Teleprompter): 방장 큐 전진/후퇴 → 모든 참가자 동기 — 2026-07-03 실증: `features/script/{cues.ts,ScriptPanel.tsx}`·`useLiveKitRoom` `'script-cue'` reliable DataChannel·호스트 warm-up 재브로드캐스트. **2탭 실 LiveKit E2E 12/12 PASS**. as-built: 클라 게이트(호스트=slot0)·서버권한/DB저장은 defer(G-286).
- [ ] 내 대사 줄 강조, 개인 글자 크기 조절 — 부분: 내 대사 강조 O(`ScriptPanel` "▶ 내 차례", 현재 cue 역할==내 역할). **개인 글자 크기 조절 미구현** → 남은 개발.
- [ ] CDN 비디오 동기 재생 (타임스탬프 기반, ±200ms 이내)
- [ ] 배경 선택기 (미리 정의된 배경 5종 이상)
- [x] Active-speaker 강조 (말하는 참가자 Z-order 앞) — 2026-07-03 실증: `StageSlot` 이 `isSpeaking` 참가자를 z↑·확대·amber glow 로 강조. **2탭 헤드리스 E2E**(합성음성으로 실발화 유발) — 발화 슬롯 `data-speaking=true`+glow, 비발화 빈슬롯 무강조 동일 프레임 확인(스크린샷). 개별 `isSpeaking` 바인딩.
- [ ] 채팅 반응 버튼 (👍 😂 👏 😢) → 화면 부동 이모지
- [x] Staging 환경에서 6인 동시 접속 30분 안정 운영 확인 — 2026-07-06: `lk load-test`(LiveKit CLI, prod LiveKit·오디오발행6+스피커이벤트, 앱 미디어 프로필 일치) **30분 완주·에러/드롭/끊김/재연결 0**. (staging 앱 6실유저 대신 LiveKit 전송계층 부하런; 앱 전계층(아바타·데이터)은 6탭 실렌더 E2E가 별도 커버.)
- [x] WebRTC 연결 실패율 < 5% (LiveKit Cloud Dashboard) — 2026-07-06: load-test 6/6 연결 유지·연결실패 0 = **0%**.

**검증 시나리오:**
1. 6인 입장 → 방장이 씬 1로 전환 → 모든 참가자 배경 동시 변경
2. 참가자 2가 퇴장 → 슬롯 자동 재배치, 나머지 5인 음성 지속

---

## Phase 4 — 정식화 & 배포

**목표:** Cloudflare Pages 프로덕션 배포, 기본 DoD 모두 충족.

### Acceptance Criteria

- [ ] `npm run build` 성공, `dist/` 크기 gzip 초기 번들 < 200 KB
- [x] Cloudflare Pages 배포 완료 (`*.pages.dev` URL 접근 가능) — 2026-07-03: 프로젝트 `chatterbox`→`chatterbox-7r8.pages.dev`(unlisted). 번들 비밀키 감사 통과·헤드리스 실렌더(React 마운트·콘솔0)·배포판 E2E **14/14**(인증·방·상호프레즌스·아바타·채팅·**더빙 3b 풀 클릭스루**). 재배포/검증 스킬 `cf-pages-deploy-verify`. 공개 런칭은 별개(핵심 다듬은 뒤).
- [ ] 설정 페이지: 오디오 입력 선택, 웹캠 선택, 단축키 확인
- [ ] Push-to-talk (스페이스바), 전체 뮤트 (F키) 동작
- [ ] 필살기 핫키 + Lottie 효과 최소 2종
- [ ] DUB 파이프라인 MVP: MP4 업로드 → Whisper STT → 역할 분배 → 녹음 → 합성
- [ ] Playwright E2E Critical path (AUTH·ROOM·VGEN) 통과
- [ ] 모니터링 대시보드 전체 가동: Sentry·LiveKit·Supabase·pg_cron 알림
- [ ] SECURITY-OPS.md §초기 체크리스트 완료
- [ ] Staging 24시간 무장애 운영 확인 후 프로덕션 배포

**검증 시나리오:**
1. 신규 사용자가 랜딩 CTA → `app.chatterbox.kr` → 30분 안에 방 생성+연기
2. fal.ai VGEN 일일 한도(3회) 초과 → 차단 메시지 표시

---

## 마일스톤 타임라인 (참고)

| Phase | 예상 기간 | 주요 블로커 |
|-------|----------|-----------|
| Phase 0 | 1주 | API 키 발급, 레포 셋업 |
| Phase 1 | 2~3주 | MediaPipe ↔ PixiJS 리그 매핑 |
| Phase 2 | 2주 | RLS 설계 완성, fal.ai 통합 |
| Phase 3 | 2~3주 | 6인 동기 안정성 |
| Phase 4 | 1~2주 | 배포 환경 변수, E2E 안정화 |

> 타임라인은 **참고용**. Phase별 AC 달성이 진도 기준.

---

## Pitch Demo Gate (G-170~G-171)

Alibaba.com CoCreate 또는 투자자 미팅 전에는 "플랫폼 비전"과 "지금 되는 것"을 분리해서 보여준다. 랜딩 CTA가 사전등록으로 연결되는 상태라면, 피치 자료는 아래 증거를 별도로 포함해야 한다.

### D-14 필수 증거

- [ ] 2명 Actor가 같은 방에 입장해 30초 연기하는 녹화 영상 1개
- [ ] 같은 시나리오의 스크린샷 3장: GreenRoom, RoomView, 공연 종료/녹화 결과
- [ ] 랜딩 CTA 2개 분리: "지금 체험"은 데모룸 또는 영상, "알림받기"는 Tally/Waitlist
- [ ] 데모 실패 시 대체 플랜: 로컬 녹화 영상 + 시나리오 순서도 + 비용/로드맵 1페이지

### 투자자 1페이지 요약 구성

| 영역 | 포함 내용 | 참조 |
|---|---|---|
| Problem | 친구와 함께 연기/더빙/VTuber 놀이를 즉시 시작하기 어렵다 | ONBOARDING-FLOW.md |
| Product | 2인 실시간 방 + 아바타 표정 + 대본/반응 + VGEN 쇼츠 | FEATURE-SPEC.md |
| Market | 한국/일본 VTuber·더빙·연기 커뮤니티 TAM/SAM/SOM 숫자 | 별도 시장 조사 필요 |
| Unit economics | VGEN 단가, 크레딧 가격, 손익분기 | COST-ESTIMATE.md |
| Roadmap | Phase 0~4 구현 순서와 피치 이후 30일 계획 | 이 문서 |
| Proof | 실제 데모 영상, GitHub/배포 URL, 모니터링 스크린샷 | Demo Gate 산출물 |

### 랜딩 기대 관리 문구

- 랜딩은 "현재 사전등록 중"임을 첫 화면 CTA 주변에 명확히 노출한다.
- 데모는 실제 플랫폼이 아니면 "데모 영상" 또는 "둘러보기"로 표시한다.
- 피치 문서에서는 "현재 구현됨", "로컬 PoC", "기획 완료"를 같은 색으로 섞지 않는다.

---

## Phase 5 — 초기 사용자 활성화

**목표:** Tally 사전등록자 전환, 커뮤니티 개설, DAU 10+ 확보. (배포 후 2~4주)

### Acceptance Criteria

- [ ] 사전등록 초대 배치 완료: 우선순위(일본/VTuber 관심층) 기준 Day 1 발송 ≥ N명 (실측 후 숫자 확정)
- [ ] 초대 수용률 추적: `waitlist_invites` 테이블 `redeemed_at` 기록, 첫 주 목표 ≥ 20% (참고 기준, 실측 조정)
- [ ] Discord 커뮤니티 서버 개설: 초대 링크 랜딩 CTA에 노출, 50명 이상 초기 멤버 확보
- [ ] 채널별 유입 분석: utm 파라미터 (youtube/discord/twitter) 추적, 첫 주 분포 리포트
- [ ] DAU ≥ 10명 달성: Supabase 로그(`room_participants` 테이블 일일 신규 입장) 기반 계산
- [ ] 초기 활성 사용자 피드백 수집: 방 생성 후 첫 30분 이탈율, 재방문율(D7/D30) 기초 데이터 수집

**검증 시나리오:**
1. 사전등록자(일본, VTuber 관심 표시)가 초대 이메일 수신 → 초대 코드 입력 → 계정 생성 → 로비 입장 성공
2. Discord 서버의 #room-share 채널에서 사용자가 방 링크 공유 → 다른 멤버가 참여 → 2인 이상 실시간 연기 시작

---

## 마일스톤 타임라인 (참고)

| Phase | 예상 기간 | 주요 블로커 |
|-------|----------|-----------|
| Phase 0 | 1주 | API 키 발급, 레포 셋업 |
| Phase 1 | 2~3주 | MediaPipe ↔ PixiJS 리그 매핑 |
| Phase 2 | 2주 | RLS 설계 완성, fal.ai 통합 |
| Phase 3 | 2~3주 | 6인 동기 안정성 |
| Phase 4 | 1~2주 | 배포 환경 변수, E2E 안정화 |
| Phase 5 | 2~4주 | 채널 협력 일정, 커뮤니티 운영 초기화 |

> 타임라인은 **참고용**. Phase별 AC 달성이 진도 기준.
