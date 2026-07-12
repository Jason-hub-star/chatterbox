---
tags: [guide]
---

<!--
  2026-06-27 - 새 플랫폼 비주얼 컨셉 + 씬 시스템 설계.
  설계 (구현 입력). ../design/DESIGN-TOKENS §8 · DATA-SCHEMA PENDING · contracts/_INDEX.md §14 연동.
-->

# DESIGN-DIRECTION — 비주얼 컨셉 & 씬 시스템

> snack-web 새 플랫폼(버튜버 연극)의 디자인 방향과 배경 씬 시스템 설계.
> Updated: 2026-07-01 (무채색 팔레트 + 원형 룸 레이아웃 개정 — §1·§2·§6·§8)

---

## 1. 핵심 컨셉 — "마비노기 모닥불"

> **2026-07-01 개정**: 감정적 컨셉(따뜻한 구심점)은 그대로 유지하되, 시각적 표현은 배경 전체를
> 앰버로 물들이던 방식에서 **무채색(디스코드풍 그레이/블랙) 베이스 + 앰버 절제된 액센트**로
> 전환. "모닥불"은 이제 배경 톤이 아니라 스테이지 중앙에 모인 아바타들을 잇는 구심점 은유로만
> 남는다. §2 팔레트·§6 레이아웃 참조.

**컨셉 한 줄:** 어둠 속 따뜻한 빛이 모르는 사람들을 자연스럽게 끌어당기는 구심점.

마비노기에서 누군가 모닥불을 피우면 채널의 모르는 플레이어들이 자연스럽게 몰려들었다.
snack-web 룸이 바로 그 모닥불이다.

| 마비노기 모닥불 | snack-web 룸 |
|---|---|
| 불 주위에 앉는다 | 무대 슬롯에 앉는다 |
| 바드가 연주한다 | 배우가 연기한다 |
| 모르는 사람도 합류 | 공개 룸 자유 참가 |
| 불꽃 = 구심점 | 스테이지 = 구심점 |
| 불 꺼지면 흩어짐 | 세션 종료 후 퇴장 |

---

## 2. 시각 언어

### 팔레트 (→ ../design/DESIGN-TOKENS.md §8 플랫폼 토큰)

> ⚠️ **2026-07-01 무채색 개정 — 아래가 현행 SSOT.** 구버전(앰버 다크나이트 배경) 표는
> `DESIGN-TOKENS.md §8` 하단에 참조용으로 보존.

| 역할 | 토큰 | Hex |
|---|---|---|
| 기본 배경 | `stage-base` | `#0B0B0D` |
| 카드/사이드바 배경 | `stage-panel` | `#18181C` |
| 모달·호버·플로팅 | `stage-elevated` | `#222227` |
| 경계선 | `stage-border` | `#2E2E35` |
| 텍스트 | `stage-text` | `#F5F5F2` |
| 보조 텍스트 | `stage-text-muted` | `#9C9CA3` |
| 액센트 (버튼·호스트·CTA 전용, 배경 워시 금지) | `fire-amber` | `#FF8C2A` |
| 녹음/라이브 상태 | `fire-hot` | `#FF4500` |
| 트래킹/성공 상태 | `spring-green` | `#56F09F` |
| 씬 어댑트 (동적) | `scene-accent` | CSS 변수 `--scene-accent`로 주입 (구매 가능 씬 팩과 연동 예정, PENDING) |

### AI 슬롭 회피 원칙

**금지:** 보라→파랑 그라디언트 히어로, Heroicons 기본 세트 그대로, shadcn 무보정 테마, scroll-reveal 단일 패턴 애니메이션(AI 기본값)
**사용:** GPT Image 2 페인팅 배경, diffusionstudio/lottie 커스텀 아이콘, `--scene-accent` 어댑테이션, motion 12.4 spring transition 우선(룸 UI) — 스크롤 스토리텔링은 외부 snack-web 랜딩 몫(인앱 랜딩 폐지 2026-07-08)
**레퍼런스:** cluster.mu (게임 UI 에너지), 마비노기 모닥불 (따뜻한 커뮤니티 구심점)

---

## 3. 레이어 구조 (렌더 순서)

> ⚠️ **이 섹션은 §6.7로 대체됨.** VGen/DUB 오버레이 추가로 z-index 체계가 전면 재편되었다.  
> **SSOT → §6.7 메인뷰 레이어 스택** 참조.

```
[구버전 — 참조 금지]
z-index: 0  배경 씬 이미지
z-index: 1  PixiJS 파티클
z-index: 2  ParticipantSlot   ← §6.7에서 z-1로 통합됨
z-index: 3  ChatOverlay        ← §6.7에서 z-4로 변경됨
z-index: 4  UI 크롬            ← §6.7에서 z-5로 변경됨
z-index: 5  모달·토스트
```

**현행 SSOT:** `§6.7 메인뷰 레이어 스택 (z-0~z-5)` — ParticipantSlot은 PixiJS 캔버스(z-1)에 통합, DUB(z-2)/VGen(z-3) 오버레이 추가.

---

## 4. 씬 시스템

### 4.1 Storage 구조

```
Supabase Storage
  scenes/system/                ← GPT Image 2 사전 생성
    campfire-forest.jpg
    cyber-rooftop.jpg
    fantasy-stage.jpg
  scenes/rooms/{room_id}/       ← 호스트 커스텀 업로드
    custom-bg.jpg
  scenes/system/thumbs/         ← 300px 썸네일
    campfire-forest-thumb.jpg
```

### 4.2 scenes 테이블 (→ DATA-SCHEMA.md §1.7)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID | PK |
| `name` | TEXT | "모닥불 숲" |
| `category` | TEXT | `fantasy` \| `sci-fi` \| `modern` \| `custom` |
| `image_url` | TEXT | Supabase Storage URL |
| `thumbnail_url` | TEXT | 300px 미리보기 |
| `palette_mood` | TEXT | `warm` \| `cool` \| `dark` \| `bright` |
| `accent_color` | TEXT | `#FF8C2A` — UI 크롬이 이 값을 따라감 |
| `is_system` | BOOLEAN | TRUE = 기본 제공 |
| `created_by` | UUID FK | NULL = 시스템 씬 |

### 4.3 accent_color 어댑테이션 룰

씬 전환 시 `accent_color` → CSS 변수 `--scene-accent` 주입.
슬롯 테두리 glow, 버튼 hover, 스포트라이트가 자동으로 씬 분위기를 따라간다.

```
모닥불 씬  → --scene-accent: #FF8C2A  (amber)
사이버 씬  → --scene-accent: #00FFCC  (cyan)
판타지 씬  → --scene-accent: #C084FC  (purple)
```

→ 컴포넌트 구현: `contracts/_INDEX.md §14 SceneBackground`

---

## 5. GPT Image 2 에셋 파이프라인

### 5.1 프롬프트 스타일 가이드

배경 씬 공통 지침:
```
[장소·시간 묘사], digital painting style, cinematic lighting,
warm ambient glow from center, studio ghibli + nier automata middle ground,
2D painterly illustration, no text, no UI elements,
16:9 horizontal composition, high detail
```

예시 프롬프트 (campfire-forest):
```
Outdoor fantasy theater at night, campfire in the center casting
warm amber glow, ancient stone seats surrounding, starlit sky with
faint aurora, digital painting style, cinematic lighting,
studio ghibli + nier automata middle ground, 2D painterly, no text, 16:9
```

### 5.2 저장 절차 (레이어 분리 구조로 확정)

> 씬은 단일 JPG가 아니라 **레이어별 PNG**로 분리 저장. `design/scene-prompts.md` 참조.

1. 레이어별 PNG 생성 (투명 배경, alpha channel) → `scenes/system/{slug}/layers/{layer_id}.png`
2. 썸네일 생성 (합성 이미지) → `scenes/system/{slug}/thumbs/{slug}-thumb.jpg`
3. `scenes` 테이블 INSERT (`is_system = true`, `layers_json` 배열 포함) — `DATA-SCHEMA.md §1.7`
4. 프롬프트 원본은 `design/scene-prompts.md`에 레이어별로 보관 (재생성 가능하도록)
5. 인터랙션 스펙: `contracts/SceneBackground.md` 참조 (click/hover/idle 이벤트)

### 5.3 API 키

`/Users/family/jason/Vtube` 프로젝트 내 `.env` 참조.

---

## 6. 룸 레이아웃 — 원형 (확정, 2026-07-01 개정)

> ⚠️ **E형(3+3 좌우 컬럼) 레이아웃은 원형 배치로 대체됨.** 계기: VoiceStage 레퍼런스 목업
> 검토 + 무채색 팔레트 전환. 시각 참조: `design/stitch-mockups/room-view-desktop/`
> (`index.html` 갤러리) — Stitch AI 목업이라 **정확한 %/px 값은 미확정**. 기존 E형이 받았던
> `room-layout-picker.html` 수준의 정밀 와이어프레임 패스가 원형 배치에는 아직 없음 — 구현
> 착수 전 한 번 더 필요 (PENDING).
> 구버전 E형 전체 스펙은 본 섹션 하단 "[구버전 — 참조용]"에 보존.

### 6.1 존 구성 (16:9 기준, 원형 배치 — 개략 비율, 정밀화 PENDING)

```
┌─────────────────────── 상단 바 (~7%) ───────────────────────────┐
│  ChatterBox  [방 이름 ✏] #태그  [● 라이브 00:42:17]  초대  링크  6/6  ⋮ │
├──────────┬────────────────────────────────────────┬──────────┤
│          │   (아바타1)              (아바타2)      │          │
│  좌측    │              ╲            ╱             │  우측    │
│  패널    │  (아바타3)──  [ 센터 비디오 프레임 ]  ──(아바타4)  │  패널    │
│  ~14%    │              ╱            ╲             │  ~14%    │
│          │   (아바타5)              (아바타6)      │          │
├──────────┴────────────────────────────────────────┴──────────┤
│              하단 컨트롤 바 (~7%)                              │
│  🎙마이크▾  🎧헤드폰  ⏺녹음  아바타ON  대본  리액션  →나가기   │
└──────────────────────────────────────────────────────────────┘
```

6개 아바타는 센터 비디오 프레임을 중심으로 3쌍(상단 좌/우, **중단 좌/우 — 누락 금지**, 하단
좌/우)으로 배치되며, 각 아바타에서 센터 프레임으로 얇은 glow 연결선이 이어진다(별자리 패턴).
좌/우 패널 내용(§6.2·§6.3)은 E형에서 그대로 유지 — 바뀐 건 중앙 아바타 배치 방식뿐이다.

### 6.2 좌측 패널 (width: 13%, top 9% ~ bottom 9%)

콘텐츠 (위 → 아래, flex-column):
1. **대본/장면** — Scene N ▼ 드롭다운 + 텔레프롬프터(역할·대사·효과음) + `+ 장면 추가`
2. **역할 배정** — 캐릭터명 → 배우명 매핑 목록 (ROOM-14)
3. **모드 토글** — `리허설` / `본공연` 양자택일 버튼 (ROOM-14)
4. **언어 선택** — `한` / `日` / `EN` 3-버튼 토글 (ROOM-06)
5. **다음 순서(큐)** — `margin-top:auto` 로 하단 고정, 순번·배우 목록
6. **세션 정보** — 장르·러닝타임·언어·녹음 포맷

### 6.3 우측 패널 (width: 14%, top 9% ~ bottom 9%)

> **탭 구조 확정** — 상단 4탭으로 전환. 탭 없이 목록 나열하던 기존 방식 폐기.

```
[ 채팅 ] [ 대본 ] [ 🎬 VGen ] [ 🎙 DUB ]
────────────────────────────────────────
탭별 콘텐츠 영역 (flex: 1, overflow-y: auto)
────────────────────────────────────────
하단 고정: 사운드보드 (margin-top: auto)
```

**탭 1 — 채팅**
- 메시지 목록 + 입력창
- 룸 분위기 단문 피드백 + 도트 평점
- 객석 리액션 이모트 피드 (ROOM-12)
- 녹화 상태 `● 녹화 중 HH:MM:SS` (ROOM-13)

**탭 2 — 대본**
- 이 탭은 좌측 패널 대본과 동일 내용을 우측에서도 볼 수 있는 미러 뷰
- 모바일/좁은 화면에서 좌측 패널 대신 사용

**탭 3 — 🎬 VGen (상태 표시)**
- 현재 잡 상태: `생성 중... 42%` / `완료` / `대기`
- 프롬프트 히스토리 (최근 5개)
- 크레딧 잔액 표시
- **프롬프트 편집은 이 탭이 아닌 메인뷰 하단 패널에서** (§6.8 참조)
- `[프롬프트 열기]` 버튼 → 메인뷰 하단 패널 슬라이드 인

**탭 4 — 🎙 DUB (상태 표시)**
- 현재 더빙 세션 상태 + 역할 배정 목록
- 내 파트 타이밍 (`01:23 ~ 01:45`)
- `[DUB 모드 전환]` 버튼 → 메인뷰 DUB 오버레이 활성화 (§6.9 참조)

**하단 고정 (모든 탭 공통)**
- 사운드보드 2열 효과음 버튼 grid

### 6.4 ParticipantSlot 배치 (6슬롯 MVP 기준, 원형)

> ⚠️ **좌/우 컬럼(3+3) 배치는 원형 3쌍 배치로 대체됨.** 정확한 좌표는 PENDING — 아래는 개략
> 방향성만. 구버전 좌표는 본 섹션 하단 참조.

```
    [상단좌]                    [상단우]
              ╲                ╱
    [중단좌]──  [센터 비디오]  ──[중단우]     ← 이 쌍을 누락하기 쉬움, 반드시 렌더
              ╱                ╲
    [하단좌]                    [하단우]
```

- 6개 아바타를 센터 비디오 프레임 둘레에 3쌍(상/중/하 × 좌/우)으로 배치, 각 아바타→센터
  연결선(glow) 표시
- **빈 슬롯:** `stage-panel` (#18181C), 무채색 다크그레이
- **채워진 슬롯:** `--scene-accent` glow 활성 (기본값 fire-amber)
- **호스트 슬롯:** fire-amber 링 + 작은 crown 배지
- **연기 중 슬롯:** glow 최대 + 미세 scale-up
- **트래킹 활성:** spring-green 도트
- **트래킹 실패:** dashed 테두리(`rgba(255,100,100,.4)`) + 👤 아이콘 + "인식 중..." 텍스트 (ROOM-11)

ponytail: 하단 2슬롯이 들어간 8인 배치는 보류한다. FEATURE-SPEC ROOM-02와 DB 기본값이 6인이므로 구현자는 6슬롯만 렌더한다.

---
[구버전 — 참조용, E형(3+3 좌우 컬럼) 정밀 스펙. 원형으로 대체됨]

```
┌─────────────────────── 상단 바 (top 0 ~ 9%) ───────────────────────────┐
│  snack Beta  [방 이름 ✏] 🔒 #태그  [● 세션 00:35:28]  초대  링크  🎭7/👁12  📶12ms  ⋮ │
├──────────┬────────┬──────────────────────┬────────┬──────────┤
│          │ 좌측   │                      │ 우측   │          │
│  좌측    │ 아바타 │      메인 뷰          │ 아바타 │  우측    │
│  패널    │  컬럼  │  (left22%~right22%)  │  컬럼  │  패널    │
│  0~13%   │ 13~22% │                      │ 78~87% │  86~100% │
│          │ 3슬롯  │                      │ 3슬롯  │          │
│          │        │  하단 2슬롯           │        │          │
│          │        │ (top72%, l35%/l52%)  │        │          │
├──────────┴────────┴──────────────────────┴────────┴──────────┤
│                  하단 컨트롤 바 (bottom 0 ~ 9%)                          │
│  🎙마이크▾  🎧믹서▾  ⏺녹음  👤아바타/카메라  📖대본  😊리액션  →나가기  │
└──────────────────────────────────────────────────────────────────────┘

              [좌1] [좌2] [좌3]        [우1] [우2] [우3]
                       [메인 뷰 영역]
```

좌컬럼 3슬롯: `left:13.5%;width:7.5%;top:13%/40%/62%` · 우컬럼 3슬롯: `right:13%;width:7.5%;top:13%/40%/62%`
빈 슬롯: `night-blue` (#1A1A3E). 시각 워이어프레임: `docs/meeting/room-layout-picker.html` (E 선택).

### 6.5 메인 뷰 (left:22%;right:22%;top:9%;bottom:9%)

- **소스 토글** (우상단): `VOD` / `🤖 AI생성` 버튼 — HOST-04, ROOM-01
- **채팅 오버레이**: 불씨처럼 위로 사라지는 메시지 — §7 규칙, §6.7 z-index 참조
- **컨트롤 바** (하단 20%): ▶ / ⏭ / 스크러버 / 시간 / 배속(1.25x) / ⚙ / ⛶
- **VGen 프롬프트 패널** (활성 시 하단 25% 점령) — §6.8 참조
- **DUB 비디오 오버레이** (활성 시 메인뷰 전체 점령) — §6.9 참조

---

### 6.7 메인뷰 레이어 스택 (z-index 전체 명세)

```
z-0  배경 씬       CSS background-image (GPT Image 2 정적 에셋)
                   pointer-events: none
z-1  PixiJS 캔버스  파티클 + AvatarCanvas Container
                   pointer-events: none (파티클)
                   pointer-events: auto (슬롯 클릭 이벤트)
z-2  DUB 비디오    <video> — DUB 모드 활성 시만 display:block
                   메인뷰 left:22%~right:22% 영역만 점령
                   pointer-events: auto
z-3  VGen 프롬프트  협업 textarea 패널 — VGen 모드 활성 시만
                   메인뷰 하단 25% (top:auto;height:25%)
                   pointer-events: auto (텍스트 편집 가능)
z-4  채팅 오버레이  bubble 스트림 — 항상 표시
                   VGen 활성 시 y-범위 0~73% (프롬프트 영역 침범 금지)
                   DUB 활성 시 y-범위 0~95% (전체)
                   pointer-events: none (필수)
z-5  UI 크롬       소스 토글 버튼, 컨트롤 바 등 최소 UI
                   pointer-events: auto
```

**모드 상태**: `stageStore.mode: 'normal' | 'vgen' | 'dub'`
- `normal` → z-2, z-3 숨김
- `vgen`   → z-3 표시, z-4 y-범위 제한
- `dub`    → z-2 표시, z-3 숨김

---

### 6.8 VGen 협업 프롬프트 패널 (z-3)

> 짝 계약서: `contracts/VgenPanel.md`

```
┌─────────────────────────────── 메인뷰 하단 25% ──────────────────────────────┐
│  🔴 Alice▌ 판타지 전장, 새벽 안개가 자욱한 숲 속,                              │
│  기사 두 명이 🔵 Bob▌마주치며 검을 빼든다. 달빛 아래 긴장감.                    │
│  배경: #1a1a1a 반투명 · 씬이 살짝 비침(opacity .85)                            │
│                                                          크레딧 240  [생성 ▶] │
└──────────────────────────────────────────────────────────────────────────────┘
```

**커서 표시 규칙**
- 참가자마다 고유 색 (participant_id → hsl 해시)
- 커서 위 이름 라벨 (8px, 해당 색)
- 동시 편집 허용 — 섹션별 LWW(Last-Writer-Wins) 병합
- 커서가 3개 초과 시 화면 밖 커서는 `+N명 편집 중` 뱃지로 축약

**동기화 기술 스택**
```
Prompt sections (scene/action/characters/tone)
  └─ section patch: { section, content, updated_at, author_id }
  └─ LiveKit room-authority (reliable, ordered)
       type: 'vgen_prompt_patch'
       debounce: 300ms
```

ponytail: LWW는 같은 섹션을 동시에 오래 편집하면 마지막 저장자가 이긴다. 충돌이 실제 사용에서 자주 보이면 그때 Yjs CRDT로 승격한다.

**패널 열기/닫기**
- 호스트만 열기 가능 (HOST-07 거버넌스)
- 열기: 우측 탭 VGen [프롬프트 열기] 버튼 → `stageStore.mode = 'vgen'` broadcast
- 닫기: 패널 우상단 ✕ 또는 생성 완료 후 자동
- 모든 참가자 화면에 동시 반영 (LiveKit room-authority 메시지)

**생성 완료 시퀀스**
```
[생성 ▶] 클릭
  → 패널 닫힘 (mode = 'normal')
  → 메인뷰: vgen_loading.json (불씨 스피너)
  → 완료: 비디오 교체 + ember_success.json
  → 우측 탭 VGen: 히스토리에 결과 추가
```

---

### 6.9 DUB 비디오 오버레이 (z-2)

> 짝 계약서: G-18 — `contracts/DubSessionSelector.md` 외 3개 (미작성, LATER). 임시 구현 참조: `contracts/VgenPanel.md §5 MUST NOT`.

```
[DUB 모드 활성]
메인뷰 영역(left:22%~right:22%) ← <video> 점령
아바타 슬롯 컬럼 ← 그대로 유지 (아바타+더빙 표정 연동)
우측 탭 → DUB 탭 자동 활성 (역할·타이밍·녹음 버튼)
하단 바 → ● 녹음 버튼 앰버 하이라이트
채팅 오버레이 → 그대로 유지 (DUB 중 실시간 소통)
```

**전환 트리거** (HOST만)
- 우측 탭 DUB → `[DUB 모드 전환]` 버튼
- `stageStore.mode = 'dub'` → LiveKit room-authority broadcast
- 모든 참가자: 메인뷰에 `<video src={dub_session.source_url}>` 마운트

**DUB + VGen 동시 활성 금지**
```typescript
// stageStore
if (newMode === 'dub') assert(current !== 'vgen')
if (newMode === 'vgen') assert(current !== 'dub')
```

### 6.10 상단 바 ⋮ 드롭다운 (HOST 전용)

| 항목 | 연결 기능 |
|---|---|
| 🎬 배경 선택 | ROOM-09 |
| 🔒 방 잠금 설정 | HOST-03 |
| 👁 뷰어 모드 전환 | ROOM-15 |
| 🤖 AI 영상 생성 | VGEN |
| 🚫 참가자 강퇴 | HOST-01 |

---

## 7. ChatOverlay 애니메이션

메시지가 불씨처럼 아래에서 위로 떠오르다 사라진다.

```
진입: translateY(0)    opacity(1)   — 화면 하단 진입
체류: 3~5초
퇴장: translateY(-40px) opacity(0) — 위로 흩어짐
```

`pointer-events: none` 필수 (contracts/_INDEX.md §7 규칙 동일).

---

## 8. 참고 레퍼런스

| 레퍼런스 | 적용 포인트 |
|---|---|
| 마비노기 모닥불 | 따뜻한 구심점 은유 (2026-07-01부터 배경 톤이 아닌 액센트로만 반영) |
| VoiceStage | 원형 아바타 배치 + 센터 비디오 프레임, 무채색 다크 베이스 (§6 원형 레이아웃의 직접 레퍼런스, 2026-07-01) |
| cluster.mu | 게임 UI 에너지, 카드 배치, 배지 스타일 |
| itch.io | 반코퍼레이트 미니멀, 크리에이터 중심 |
| booth.pm | VTuber 자산 문화 |
| VRChat | 다크 베이스 + 형광 액센트 |

---

## 9. 배경 인터랙션 & 모션

> §9.2 레이어 인터랙티브 씬은 **확정**. §9.1 Seedance 루프 영상은 실험 예정.

### 9.1 Seedance 2.0 루프 영상 배경

정적 `background-image` 대신 Seedance 2.0(fal.ai)으로 생성한 영상을 z0에 배치.

```
Seedance 2.0 생성 영상 (mp4)
  → ffmpeg WebM/VP9 압축 (10s 루프, ≤15MB)
  → <video autoplay muted loop playsinline>
  → CSS: position:fixed; z-index:0; object-fit:cover
  → 루프 끊김 → 끝 0.5s opacity 페이드 후 재시작
```

- 성능: 하드웨어 디코딩, z0 단독 레이어 → PixiJS 파티클(z1)과 충돌 없음
- 적용 위치: **플랫폼 룸 배경(`/rooms/:roomId`) 우선** + 로그인 입장 영상(아트 피벗 Phase 3) — 인앱 랜딩은 폐지됨(snack-web 담당)
- 제약: 영상 용량 관리(씬별 1파일), Seedance 저작권 리스크(→ `STACK-COMPARE-VIDEOGEN.md §6 L12`)
- Seedance 공급사 API·비용: `STACK-COMPARE-VIDEOGEN.md §2` 참조

### 9.2 레이어 분리 인터랙티브 씬 ✅ 확정

정적 배경 이미지를 레이어별 투명 PNG로 분리해 PixiJS 스프라이트로 올리고, 각 레이어가 독립적으로 애니메이션·인터랙션에 반응. 하스스톤 게임 맵과 같은 생동감.

```
씬 레이어 PNG (transparent, alpha) × N개
  → PixiJS Sprite × N (z_order 순)
  → idle_animation: sway / flicker / float / pulse (레이어별)
  → click_event: scale_bounce / shake / glow + sound_trigger
  → hover_event: sway_amplify / brightness_up / glow
  → DataChannel room-authority: sound_trigger (호스트 → 전체 동기화)
```

- 스펙: `contracts/SceneBackground.md` (SceneLayer 타입, PixiJS 구조, 이벤트 흐름)
- 프롬프트: `design/scene-prompts.md` (씬 5종 × 레이어 25개 + 공용 파티클 1 — 2026-07-07 개편: cyber-rooftop·fantasy-stage 폐기, landing-meadow·ocean-cove·pirate-ship·twilight-castle 신규. z≥1만 투명 배경)
- DB: `DATA-SCHEMA.md §1.7` (scenes.layers_json JSONB)

구현 옵션:
- **CSS-only**: `transform: translate3d` per layer — 간단, 영상 배경과 호환
- **Three.js plane**: displacement map 적용 → 씬 3D 카메라 미세 이동

적용 위치: `/rooms/:roomId` 대기 화면. (인앱 랜딩은 폐지 — snack-web 담당, 2026-07-08)

---

## 관련 문서

- `design/DESIGN-TOKENS.md §8` — 플랫폼 전용 색 토큰
- `DATA-SCHEMA.md PENDING` — scenes 테이블 스키마
- `contracts/_INDEX.md §14` — SceneBackground 계약
- `UI-REFERENCE-PLATFORM.md` — 플랫폼 UI 레퍼런스
- `STACK-COMPARE-VIDEOGEN.md` — Seedance 2.0 API·비용·리스크 상세
