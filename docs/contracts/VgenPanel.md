---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- DESIGN-DIRECTION §6.7~6.9 가 비주얼 SSOT. 이 파일은 컴포넌트 계약 SSOT. -->
<!-- opencode: 2026-06-29 - C12 triggerGenerate 원자성 수정 (실패 시 setMode('normal') 금지). Coded with OpenCode; high-cost model review recommended. -->

# VgenPanel

AI 영상생성(VGEN) 기능의 두 파트를 담당하는 컴포넌트 쌍.

- **`VgenPromptPanel`** — 메인뷰 z-3에 마운트되는 협업 프롬프트 편집 패널
- **`VgenStatusTab`** — 우측 패널 탭 3번 콘텐츠 (상태·히스토리·크레딧)

두 컴포넌트는 `vgenStore`를 공유하고 독립 마운트된다.

---

## 1. VgenPromptPanel

### 위치

```
메인뷰 (left:22% ~ right:22%) 하단 25%
position: absolute; bottom: 9%; left: 22%; right: 22%; height: 25%;
z-index: 3;
```

`stageStore.mode === 'vgen'` 일 때만 `display:flex`, 아니면 `display:none`.

### Props Interface

```typescript
interface VgenPromptPanelProps {
  roomId: string;
}
// 내부적으로 vgenStore, stageStore, userStore 구독
// 외부 Props 최소화 — room 컨텍스트는 store에서
```

### Store 의존

```typescript
// 읽기
vgenStore.promptSections  // 섹션별 LWW 텍스트 { scene, action, characters, tone }
vgenStore.editors         // 커서 위치 맵 { participantId → { section, index, color, name } }
vgenStore.isGenerating    // boolean
vgenStore.creditBalance   // number
vgenStore.duration        // 선택된 영상 길이 (초, 기본 5)
stageStore.mode           // 'vgen' 여부 확인
userStore.isHost          // 생성 버튼 활성화 조건

// 쓰기 (HOST만)
stageStore.setMode('normal')        // 패널 닫기
vgenStore.setDuration(seconds)      // 영상 길이 설정
vgenStore.triggerGenerate()         // 생성 요청
```

### §영상 길이 설정 (VGEN_MODEL_ID 에 따라 동적)

```typescript
// 환경 변수: VGEN_MODEL_ID (기본값: bytedance/seedance-2.0/fast/text-to-video)
// 따라 최대 길이 결정

interface DurationOption {
  value: number          // 초
  label: string
  credit: number         // 소비 크레딧
  locked?: boolean       // 잠금 여부
  lockedReason?: string  // 잠금 사유
}

// 모델별 길이 옵션 (클라이언트)
const DURATION_OPTIONS: Record<string, DurationOption[]> = {
  // Seedance 2.0 Fast/Standard (max 15초)
  "bytedance/seedance-2.0/fast/text-to-video": [
    { value: 5, label: "5초 쇼츠", credit: 5 },
    { value: 10, label: "10초 클립", credit: 10 },
    { value: 15, label: "15초 씬", credit: 15 },
  ],
  "bytedance/seedance-2.0/text-to-video": [
    { value: 5, label: "5초 쇼츠", credit: 5 },
    { value: 10, label: "10초 클립", credit: 10 },
    { value: 15, label: "15초 씬", credit: 15 },
  ],
  // Seedance 2.5 (max 30초, 2026-07 예정)
  "bytedance/seedance-2.5/text-to-video": [
    { value: 5, label: "5초 쇼츠", credit: 5 },
    { value: 10, label: "10초 클립", credit: 10 },
    { value: 15, label: "15초 씬", credit: 15 },
    { value: 30, label: "30초 풀씬", credit: 30 },  // 2.5 전용
  ],
}

// 기본 모델 (서버 VGEN_MODEL_ID 환경변수와 동기 필수)
const CURRENT_MODEL = process.env.REACT_APP_VGEN_MODEL ?? 
  "bytedance/seedance-2.0/fast/text-to-video"

const availableOptions = DURATION_OPTIONS[CURRENT_MODEL] ?? 
  DURATION_OPTIONS["bytedance/seedance-2.0/fast/text-to-video"]
```

#### UI: 길이 선택 버튼 그룹

```
┌──────────────────────────────────────────────────┐
│ 영상 길이                                        │
│ [5초]  [10초]  [15초]  [30초]                   │
│                        ▲              ▲         │
│                    선택   잠금됨(2.5 준비중)      │
│                                                  │
│ 크레딧: 15 / 240                               │
│ 선택된 길이: 15초  |  필요 크레딧: 15            │
└──────────────────────────────────────────────────┘
```

#### 렌더 규칙

```typescript
// 길이 버튼 렌더
availableOptions.map(opt => (
  <button
    key={opt.value}
    onClick={() => vgenStore.setDuration(opt.value)}
    disabled={opt.locked || creditBalance < opt.credit}
    className={cn(
      'duration-btn',
      duration === opt.value && 'selected',
      opt.locked && 'locked'
    )}
    title={opt.lockedReason}
  >
    {opt.label}
  </button>
))

// 30초 잠금 (Seedance 2.5 미출시 시)
if (CURRENT_MODEL !== "bytedance/seedance-2.5/text-to-video") {
  const thirtySecOption = availableOptions.find(o => o.value === 30)
  if (thirtySecOption) {
    thirtySecOption.locked = true
    thirtySecOption.lockedReason = "Seedance 2.5 출시 예정 (2026-07)"
  }
}

// 크레딧 부족 시 비활성화
if (creditBalance < selectedOption.credit) {
  return "크레딧이 부족합니다"
}
```

#### MUST NOT

- ❌ 하드코딩된 모델명 (예: 'seedance-2.0') — `REACT_APP_VGEN_MODEL` 환경 변수만 사용
- ❌ 30초 옵션을 2.5 전까지 활성화 — `CURRENT_MODEL` 조건부 잠금 필수
- ❌ 슬라이더로 미세 조정 허용 — 5/10/15/30초 정해진 버튼만
- ❌ 선택 후 생성 전 길이 변경 허용 — `isGenerating=true` 시 버튼 비활성화

### § 구도·작화 프리셋 선택 (slice1b — 사용자 친화 UI)

프롬프트를 백지에서 쓰게 하지 않는다. 사용자가 **칩/드롭다운으로 골라** 프롬프트를 조합한다. 선택값은 `prompt_sections`에 합류하고, 자유 입력도 병행 가능. (SSOT 결정: VgenCostAnalysis §4.5)

| 그룹 | 선택지(예) | 프롬프트 매핑(예) |
|---|---|---|
| **구도(카메라 앵글)** | 하이앵글 롱샷 · 아이레벨 · 클로즈업 · 측면 · 버즈아이 | "high angle wide shot" |
| **카메라 무빙** | 고정 · 슬로우 줌인 · 트래킹 · 돌리인 · 오빗 | "slow dolly in" |
| **작화 스타일** | 애니 일러스트 · 수채화풍 · 신카이풍 · 지브리풍 · 3D | "painterly anime style" |
| **분위기** | 따뜻한 · 청량한 · 몽환적 · 시네마틱 · 동화풍 | "dreamy fairy tale" |
| **길이** | 5초 · 10초 (§영상 길이 설정) | duration_sec |

- 각 그룹은 **단일 선택 칩**(라디오). 고른 값이 미리보기 프롬프트 문자열로 실시간 합성돼 사용자가 확인한다.
- **카메라 시트 프리셋**: 구도+무빙+분위기를 묶은 템플릿(예: "하이앵글→트래킹→클로즈업")을 원클릭 적용하고 세부만 조정. 정교한 컷 전환(5~10컷)은 단일 생성으로 정확히 제어되지 않으므로(Seedance는 연속 한 샷) 프리셋은 "하나의 자연스러운 클립" 지향임을 안내한다.
- ponytail: 프리셋 목록은 상수 테이블로 시작. 인기 프리셋 학습·개인화는 후속.

### § 참조 이미지 (캐릭터 고정, slice1b)

reference-to-video용 캐릭터 참조. **최대 9장**(fal `image_urls`).

- 업로드 → R2 → presign(`create-vgen-reference-upload`) → `reference_asset_ids`로 trigger-vgen 전달 → Edge가 presign GET URL을 fal `image_urls`로 매핑.
- 다각도(정면·측면·전신)일수록 캐릭터 일관성↑. 텍스트가 섞이거나 지나치게 저해상한 조각은 경고(디테일 손실 → 컷마다 얼굴 흔들림). 참조는 픽셀 복제가 아니라 "캐릭터 유지 + 프롬프트대로 새 장면"임을 안내 문구로.

**MUST NOT:**
- ❌ 클라이언트가 R2 presign 직접 생성 → Edge Function 경유 (SecurityPolicies §4)
- ❌ 10장 이상 업로드 허용 → 9장 상한 클라 검증

### § 해상도·화면비 선택 (slice1b)

- **화면비**: 9:16(쇼츠·기본) · 16:9 · 1:1. 생성 시 `aspect_ratio` 네이티브 → 사후 변환 불필요. (기존 [세로형 변환]은 이미 만든 16:9 자산용 폴백으로만 유지 — VgenExport.md §6)
- **해상도**: 720p(빠름·저가) · 1080p(고화질). 선택에 따라 **크레딧이 해상도 가중**(720p 1 · 1080p 3 credit/s, VgenCostAnalysis §2). 필요 크레딧이 실시간 갱신된다.

**MUST NOT:** 해상도 선택을 크레딧 표시에 반영하지 않고 초=크레딧 고정 표기 (1080p 적자).

### 프롬프트 텍스트 제한 (G-03 입력 검증)

**최대 글자수: 2,000자 (전체 프롬프트 합산)**

```typescript
// VgenPromptPanel에서 각 섹션의 textarea
const MAX_PROMPT_LENGTH = 2000;

function handlePromptInput(section: string, text: string) {
  // 실시간 글자수 확인
  const totalLength = Object.values(promptSections)
    .reduce((sum, s) => sum + (s.content?.length || 0), 0);
  
  if (totalLength > MAX_PROMPT_LENGTH) {
    showToast(`프롬프트가 최대 ${MAX_PROMPT_LENGTH}자를 초과했습니다`, { type: 'warning' });
    return; // 입력 거부
  }
  
  // 업데이트 허용
  vgenStore.updatePromptSection(section, text);
}

function renderCharacterCounter() {
  const total = Object.values(promptSections)
    .reduce((sum, s) => sum + (s.content?.length || 0), 0);
  
  return (
    <div className="character-counter">
      {total} / {MAX_PROMPT_LENGTH} 자
      {total > MAX_PROMPT_LENGTH - 100 && (
        <span className="warning-text"> (거의 다 찼어요!)</span>
      )}
    </div>
  );
}
```

**UI 규칙:**
- 실시간 글자수 카운터 표시 (우하단)
- 2,000자 도달 시 [생성 ▶] 버튼 비활성화 + 에러 메시지
- 1,900자 이상 시 경고 색상 (주황색)

**MUST NOT:**
- ❌ 클라이언트 제한 없이 서버에서만 검증
- ❌ 글자수 세기에서 공백/줄바꿈 제외

### 협업 편집 기술 스택

```typescript
// src/lib/vgenCollab.ts
// ponytail: 섹션별 LWW로 간다. 같은 섹션 충돌이 실제로 잦아지면 Yjs 도입을 재검토한다.
type VgenPromptPatch = {
  type: 'vgen_prompt_patch'
  section: 'scene' | 'action' | 'characters' | 'tone'
  content: string
  updated_at: string
  author_id: string
}

// LiveKit transport
// 채널명: 'room-authority' (reliable, ordered)
// 메시지 타입: VgenPromptPatch
// 전송: 키 입력마다 보내지 않고 300ms debounce 후 섹션 단위 발행
```

### 커서 렌더링 규칙

```typescript
// 참가자 색상: participant_id → hsl 해시 (고정 매핑)
function idToColor(id: string): string {
  const h = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return `hsl(${h}, 80%, 65%)`
}

// 커서 표시
// - 동시 편집자 ≤ 3명: 각 커서 + 이름 라벨 모두 표시
// - 동시 편집자 > 3명: 화면 내 커서만 표시, 나머지는 "+N명 편집 중" 뱃지
```

### 시각 명세

```
배경: rgba(13,13,20,.85)  ← 씬이 살짝 비침
border-top: 1px solid rgba(255,140,42,.2)
padding: 12px 16px
display: flex; flex-direction: column; gap: 8px;

textarea:
  flex: 1
  background: transparent
  color: #F5F5F2  /* stage-text, 2026-07-01 무채색 개정 (구 warm-white #FFF8F0) */
  font-size: 14px; line-height: 1.6
  resize: none; outline: none; border: none
  caret-color: var(--amber)

하단 row (justify: space-between):
  좌: "크레딧 {n}" — 11px, muted
  우: [생성 ▶] — amber gradient, 호스트만 활성
```

### 이벤트 흐름

```
[패널 열기] (HOST)
  stageStore.setMode('vgen')
  → LiveKit room-authority broadcast: { type: 'vgen_mode_open' }
  → 모든 참가자: VgenPromptPanel 표시
  → ChatOverlay: maxY = '73%' 로 제한

[텍스트 입력]
  section content update  ← 로컬 적용
  → room-authority { type: 'vgen_prompt_patch', section, content, updated_at, author_id }
  → 수신 측: updated_at이 더 최신이면 해당 section 교체

[커서 이동]
  editors[participantId] = { section, index, name, color, updated_at }
  → 300ms debounce 후 room-authority patch에 포함
  → 수신 측: editors 맵 갱신 → 커서 위치 재렌더

[생성 ▶] (HOST만)
  CostActionConfirmDialog(action='vgen_generate')
  → 확인 후 vgenStore.triggerGenerate(promptSections, roomId)
  → 성공 시에만 stageStore.setMode('normal') 호출 (C12 원자성: 실패 시 'vgen' 유지)
  → LiveKit room-authority: { type: 'vgen_mode_close' }  (성공 시에만 발행)
  → 메인뷰: vgen_loading.json 스피너 표시
  → Edge Function → fal.ai Seedance 2.0
  → 완료: room-authority { type: 'vgen_result', url }
  → 메인뷰 비디오 교체 + ember_success.json
  
  ※ C12 해소: triggerGenerate() 실패 시 (모더레이션 거부, 크레딧 부족, 서버 에러):
    - stageStore.mode = 'vgen' 유지 (패널 닫지 않음)
    - vgen_mode_close 발행하지 않음
    - **에러코드별 사용자 친화 토스트 표시 (G-263)**
    - 사용자가 프롬프트 수정 후 재시도 가능
```

### § CostActionConfirmDialog (G-169)

크레딧 또는 녹화 파일이 걸린 액션은 최종 확인 다이얼로그를 거친다. 같은 패턴을 VGEN 생성, 9:16 변환, 생성영상 보이스오버 녹화 시작에 재사용한다.

```typescript
interface CostActionConfirmDialogProps {
  action: 'vgen_generate' | 'format_9x16' | 'voiceover_record';
  creditCost?: number;
  storageImpact?: string;
  canUndoUntil?: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```

### VGEN 생성 확인

- 표시: 선택 길이, 필요 크레딧, 현재 잔액, dedup cache hit 가능성
- [생성 시작] 전 `creditBalance >= creditCost` 재검증
- confirm 이후 5초 grace window 동안 아직 fal.ai job 미전송이면 [취소] 가능
- grace 이후 취소는 "생성 중단 요청"으로 표시하되 크레딧 환불은 서버 보상 트랜잭션 결과에 따른다

### 녹화/보이스오버 확인

- 표시: 녹화 대상, 참여자 동의 상태, 저장 위치, 보존 기간
- 녹화 시작 직후 3초 카운트다운. 카운트다운 중 [취소]는 파일 생성 없이 idle 복귀
- 녹화 완료 후 [폐기]는 R2 object 삭제 + DB status='discarded' 처리

**MUST NOT**
- ❌ creditCost가 0보다 큰 액션을 확인 없이 실행
- ❌ confirm 전 크레딧 차감
- ❌ 사용자가 취소한 녹화의 R2 오브젝트를 고아 파일로 방치
- ❌ 동의가 부족한 녹화를 "일단 시작" 처리

### § Awareness UI — 공동 편집자 표시

#### Awareness 상태 필드 정의

```typescript
type AwarenessState = {
  cursor: { 
    index: number;           // textarea 내 커서 위치
    name: string;            // 참가자 이름
    color: string;           // 할당 색상 (hex 또는 hsl)
  } | null;
  isEditing: boolean;        // 타이핑 중 여부 (debounce 5000ms)
}

// awareness 초기화 (룸 입장 시)
awareness.setLocalStateField('cursor', { index: 0, name: user.name, color: assignedColor })
awareness.setLocalStateField('isEditing', false)
```

#### 편집자 뱃지 표시 규칙

```
textarea 상단 우측:
┌──────────────────────┐
│ 편집 중: 홍길동(amber) │  ← 현재 편집자 1~3명
│        김영희(green)  │
│        박철수(purple) │
└──────────────────────┘

또는 (4명 이상)

┌──────────────────────┐
│ 편집 중: 홍길동(amber) │
│        +2 명         │  ← 4명 이상일 때 축약
└──────────────────────┘
```

표시 규칙:
- 본인 제외
- `isEditing === true` 인 참가자만 표시
- 최대 3명 표시 (4명 이상이면 "+N 명" 축약)
- 5초간 타이핑 없으면 `isEditing` → `false`, 뱃지 사라짐 (debounce 5000ms)

#### 색상 할당

```typescript
// 참가자 slot_index 기반 사전 팔레트 (충돌 없음)
const colorPalette = [
  '#F59E0B',  // amber
  '#10B981',  // green
  '#A855F7',  // purple
  '#3B82F6',  // blue
  '#EF4444',  // red
  '#14B8A6',  // teal
]

// awareness 초기화
const slotIndex = /* room의 participant slot_index */
const color = colorPalette[slotIndex % colorPalette.length]
awareness.setLocalStateField('cursor', { index: 0, name, color })
```

색상은 **룸 입장 시 고정** — 재할당 금지.

#### 커서 표시 (Figures)

```
textarea 내부 텍스트 렌더링:

[안녕|하세요] ← 로컬 커서 (amber caret-color)
     │
     └─ 다른 참가자 커서: 세로선 2px, 해당 color
        (예: green 커서가 "세"와 "요" 사이)

스타일:
  position: absolute
  width: 2px
  height: 1.4em  ← line-height 1.6과 동일 높이
  background: <color>
  opacity: 0.8
  animation: pulse 800ms ease-in-out infinite  ← 깜빡임 (선택)
```

#### MUST NOT

- Awareness 상태를 로컬 컴포넌트 state로 관리 → vgenStore의 awareness 맵만 참조
- `isEditing` 플래그를 따로 persist → debounce 타이머만 local, 상태는 awareness 필드에 의존
- 색상을 런타임에 재할당 → slot_index 고정 팔레트만 사용, 룸 입장 후 변경 금지

---

## 1.2 FLAGGED 생성물 통보 + appeal UI (G-92)

### 사용자 통보 방식

FLAGGED 상태 감지 → Supabase Realtime 이벤트 수신 → 토스트 알림

```typescript
// Realtime subscription: vgen_jobs
supabase.channel('vgen_jobs_updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'vgen_jobs',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    if (payload.new.status === 'flagged') {
      // 토스트 알림
      toast("⚠️  생성된 영상이 커뮤니티 가이드라인 검토 중입니다.")
      
      // VgenStatusTab에 FLAGGED 뱃지 표시
      vgenStore.updateJobStatus(payload.new.id, 'flagged')
    }
  })
```

### VgenStatusTab FLAGGED 카드 렌더

```
┌─────────────────────────────────┐
│ 최근 생성 (최대 5개)              │
│                                 │
│ ┌──────────────────────────┐   │
│ │ 썸네일 · "프롬프트 일부" │   │
│ │ 3분 전 · ⚠️ FLAGGED       │   │ (노란 경고 뱃지)
│ │                          │   │
│ │ [이의 신청] [자세히]     │   │ (버튼 추가)
│ └──────────────────────────┘   │
│                                 │
│ 설명: "커뮤니티 가이드라인 검토  │
│       중입니다. 최대 72시간 소요" │
└─────────────────────────────────┘
```

### appeal 플로우

**Step 1: [이의 신청] 클릭**

```
VgenStatusTab의 FLAGGED 카드
  └─ [이의 신청] 버튼
    └─ appeal 모달 열기
```

**Step 2: 사유 입력 및 제출**

```
┌────────────────────────────┐
│ 이의 신청                  │
├────────────────────────────┤
│                            │
│ 이의 사유를 작성해주세요   │
│ (최소 20자)                │
│                            │
│ ┌──────────────────────┐  │
│ │ 이 영상은 실제 ...  │  │
│ │                      │  │
│ │                      │  │
│ └──────────────────────┘  │
│                            │
│ 글자 수: 42 / 1000        │
│                            │
│ [제출]  [취소]            │
└────────────────────────────┘
```

**Step 3: 제출 완료**

```typescript
vgenStore.submitAppeal(jobId, reason)
  → vgen_appeals 테이블 INSERT
  → vgen_jobs.status = 'flagged' 유지
  → vgen_jobs.appeal_status = 'pending'
  → 토스트: "✓ 이의 신청이 접수되었습니다."
  → 이메일 발송: "appeal_receipt@{platform}"
```

**Step 4: 검토 대기 상태 표시**

```
VgenStatusTab의 카드:
┌──────────────────────────────┐
│ 썸네일 · "프롬프트 일부"      │
│ 3분 전 · 🔄 검토 중 (⏱ 최대 72h) │
│                              │
│ [취소하기]                   │
└──────────────────────────────┘
```

### appeal 테이블 스키마

SSOT: [[DATA-SCHEMA]] `vgen_appeals` + `vgen_jobs.appeal_status`.

### MUST NOT

- ❌ appeal 미제출 상태에서 FLAGGED 영상을 방에 공개 사용 허용
- ❌ appeal 제출 시 사유 검증 없이 DB 저장 (최소 20자)
- ❌ 관리자 결정 이전에 사용자가 appeal 재제출 허용

---

## 2. VgenStatusTab

우측 패널 탭 3번 콘텐츠. 프롬프트 편집이 아닌 **상태 확인 + 진입점** 역할.

### Props Interface

```typescript
interface VgenStatusTabProps {
  roomId: string;
}
```

### Store 의존

```typescript
// 읽기
vgenStore.jobs           // VgenJob[] — 히스토리
vgenStore.isGenerating   // boolean
vgenStore.progress       // 0~100
vgenStore.creditBalance  // number
stageStore.mode          // 현재 모드

// 쓰기 (HOST만)
stageStore.setMode('vgen')   // [프롬프트 열기] 버튼
```

### 렌더 구조

```
┌─────────────────────────────┐
│  🎬 AI 영상생성              │  ← 탭 헤더 (VgenStatusTab 루트)
├─────────────────────────────┤
│  크레딧 240                  │  ← creditBalance
│  [프롬프트 열기]             │  ← HOST만 표시. 클릭 → mode='vgen'
├─────────────────────────────┤
│  현재 상태                   │
│  ████████░░░░ 생성 중... 64%│  ← isGenerating=true
│  (또는) 준비됨               │  ← isGenerating=false
├─────────────────────────────┤
│  최근 생성 (최대 5개)         │
│  ┌──────────────────────┐   │
│  │ 썸네일 · 프롬프트 일부 │   │  ← VgenJob card
│  │ 3분 전 · 크레딧 40    │   │
│  └──────────────────────┘   │
│  ...                         │
└─────────────────────────────┘
```

### VgenJob 카드 클릭 → 메인뷰 재생

```typescript
onClick={() => {
  stageStore.setMainViewSource(job.result_url)  // 이전 결과 다시 재생
}}
```

---

## 3. GeneratedVideoVoiceover (VGEN-07)

생성된 영상 위에 빠르게 1인 보이스오버를 얹는 기능.
영상은 PixiJS 캔버스에서 재생되고, 녹음은 현재 조작자의 로컬 마이크트랙(본인 마이크만)으로 실시간 캡처된다. 참가자별 역할 녹음은 `DubRecorder.md`(DUB-04)가 담당하며, 이 섹션의 store/API를 재사용하지 않는다.

### 트리거 및 진입점

```
VgenStatusTab → [최근 생성 카드] (VgenJob)
  └─ onClick() 해당 job.result_url로 메인뷰 재생
    └─ 우측 패널의 [보이스오버 녹화 시작] 버튼 활성화
      └─ stageStore.setMode('dub')
        └─ 메인뷰에 <DubbingRecorder /> 오버레이 마운트 (하단 녹화 컨트롤 바)
```

### Props Interface

```typescript
interface DubbingRecorderProps {
  videoUrl: string;       // R2 서명 URL (생성된 영상, job.result_url)
  roomId: string;
  jobId: string;          // vgen_jobs.id (결과 저장 시 참조)
  onComplete: (blobUrl: string) => void;  // 녹화 완료 → 미리보기 표시
  onError: (error: Error) => void;
}
```

### Store 의존

```typescript
// 읽기
vgenStore.dubbingState    // 'idle' | 'dubbing' | 'capturing' | 'done' | 'failed'
vgenStore.recordingTime   // 초 단위 (타이머용)
stageStore.mode           // 'dub' 여부 확인

// 쓰기 (HOST만)
vgenStore.setDubbingState(state)
vgenStore.setRecordingTime(seconds)
vgenStore.saveRecording(jobId, blobUrl)  // 녹화 완료 → Supabase 저장
stageStore.setMode('normal')  // 녹화 종료 시
```

### 상태 머신

```
idle
  ├─ [더빙 녹화 시작] 클릭
  └─ → dubbing
      ├─ PixiJS 캔버스 위 영상 재생 (loop=false, end 시 자동 정지)
      ├─ 호스트의 마이크트랙 캡처 시작 (LiveKit mic track)
      ├─ [중지 + 미리보기] 버튼 표시
      └─ → capturing (중지 버튼 클릭)
          ├─ 녹음 정지
          ├─ WebM blob 생성 (canvas + audio 합성)
          └─ → done (저장 성공)
              └─ Supabase Storage 업로드 완료
                 또는
          └─ → failed (업로드 실패)
              └─ [다시 녹화] 재시도 → idle로 복귀
```

### 녹화 컨트롤 바 (하단 오버레이)

```
위치: position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      z-index: 100; width: 320px;

배경: rgba(13,13,20,.95)
border: 1px solid rgba(255,140,42,.3)
border-radius: 8px
padding: 12px 16px

레이아웃:
┌──────────────────────────────────┐
│ ● 0:45  [■ 중지]  [▶ 미리보기]   │  ← dubbing 상태
├──────────────────────────────────┤
│ 녹화 완료                         │
│ <video src={blobUrl} controls /> │  ← done 상태
│ [다시 녹화]  [저장]              │
└──────────────────────────────────┘

스타일:
  타이머: #F5F5F2 (stage-text), 14px bold, monospace
  ● 지시등: #EF4444, animation: pulse 800ms
  버튼: 12px, amber gradient, 호스트만 활성
```

### 녹화 모드 선택 (v1: 기본값 클라이언트 캡처)

**버전 1 (현재)**: 클라이언트 캡처만 지원
- PixiJS canvas → OffscreenCanvas 렌더링
- 호스트 마이크트랙 → MediaRecorder (WebM)
- 합성: `canvas.captureStream()` + `getUserMedia(audio)` → MediaRecorder
- 저장: WebM blob → Supabase Storage `vgen_dubs/{roomId}/{jobId}_{timestamp}.webm`

**버전 2 (선택사항)**: LiveKit Egress (별도 비용)
- Egress API로 서버사이드 합성
- 고품질, 복수 codec 지원
- Config로 선택 가능 (미구현)

| 모드 | 지연 | 품질 | 비용 | 용도 |
|---|---|---|---|---|
| 클라이언트 캡처 | <1s | 중 (WebM VP9) | 무료 | 실시간 미리보기 |
| Egress | 5~10s | 높음 (H.264 등) | 초당 비용 | 보관·재배포 |

### PixiJS 영상 재생 로직

```typescript
// DubbingRecorder 내부
const videoElement = useRef<HTMLVideoElement>(null)
const pixiApp = useRef<PIXI.Application>(null)

useEffect(() => {
  const app = pixiApp.current
  const video = videoElement.current
  
  // video element → PixiJS Sprite
  const texture = PIXI.Texture.from(video)
  const sprite = new PIXI.Sprite(texture)
  app.stage.addChild(sprite)
  
  // 루프: fps 유지, 영상 재생 계속
  app.ticker.add(() => {
    texture.update()  // video frame 업데이트
  })
}, [])

// 더빙 중 PixiJS 캔버스 일시정지 금지 ← MUST NOT
// ticker.speed = 0 절대 금지 (영상 끊김 현상 발생)
```

### MediaRecorder 설정

```typescript
// 호스트 마이크만 캡처 (다른 참가자 제외)
const audioStream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,  // 호스트가 직접 조절
  }
})

// canvas + audio 합성
const canvasStream = pixiCanvasRef.current!.captureStream(30)
const audioTrack = audioStream.getAudioTracks()[0]
canvasStream.addTrack(audioTrack)

// WebM 녹화
const mediaRecorder = new MediaRecorder(canvasStream, {
  mimeType: 'video/webm;codecs=vp9,opus'
})

mediaRecorder.addEventListener('dataavailable', (e) => {
  const blob = new Blob([e.data], { type: 'video/webm' })
  onComplete(URL.createObjectURL(blob))
  saveToSupabase(blob)
})
```

### Supabase 저장

```typescript
// src/lib/supabaseClient.ts
async function saveDubbing(
  roomId: string,
  jobId: string,
  blob: Blob
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const path = `vgen_dubs/${roomId}/${jobId}_${timestamp}.webm`
  
  const { data, error } = await supabase
    .storage
    .from('generations')
    .upload(path, blob, {
      cacheControl: '3600',
      upsert: false,
    })
  
  if (error) throw error
  
  // durable DB에는 object key만 저장. 재생 URL은 Edge Function이 signed URL로 발급한다.
  await supabase.functions.invoke('create-signed-media-url', {
    body: { bucket: 'generations', object_key: path, expires_in: 3600 },
  })

  return path
}
```

### DataChannel 브로드캐스트

호스트가 더빙 모드로 진입 시, 모든 참가자에게 통지:

```typescript
// HOST만 송신
const data = {
  type: 'dub_mode_open',
  action: 'start',  // 'start' | 'stop'
  jobId: string,
  timestamp: number,
}

room.localParticipant.publishData(
  new TextEncoder().encode(JSON.stringify(data)),
  { reliable: true },
  'room-authority'
)

// 수신 측 (모든 참가자)
room.onDataReceived = (payload, from) => {
  const msg = JSON.parse(new TextDecoder().decode(payload.data))
  if (msg.type === 'dub_mode_open' || msg.type === 'dub_mode_close') {
    // 더빙 모드 UI 진입 (자동으로 마이크 mute)
    if (msg.action === 'start') {
      localParticipant.setMicrophoneEnabled(false)
      uiStore.setDubbingMode(true)
    } else {
      localParticipant.setMicrophoneEnabled(true)
      uiStore.setDubbingMode(false)
    }
  }
}
```

### MUST NOT

- **PixiJS 캔버스 일시정지 금지** — 더빙 중 `ticker.speed = 0` 사용 금지, 영상 프레임 끊김 발생
- **Egress 자동 선택 금지** — 기본값은 클라이언트 캡처만, 비용 절감
- **다른 참가자 마이크 믹싱** — VGEN-07은 현재 조작자 1인 로컬 마이크만 캡처한다. 참가자별 멀티트랙 녹음은 DUB-04 `DubRecorder.md`를 사용
- **녹화 중 브라우저 탭 전환 금지** — 성능 저하로 영상 뚝뚝 끊김 (안내 문구 필수)
- **동시 다중 녹화** — 호스트 1인만, 다른 참가자 녹화 버튼 비활성화
- **미리보기 없이 저장 금지** — [저장] 전 항상 video element로 재생 확인 강제

---

## 3.1 프롬프트 거절 시 수정 가이드 UX (G-91)

거절 발생 시: `MODERATING` → `REJECTED` 상태에서 표시.

### 거절 이유 카테고리

| 코드 | 표시 메시지 | 수정 가이드 |
|------|-----------|-----------|
| `VIOLENCE` | 폭력적 표현이 감지되었습니다 | 격렬한 동작이나 충돌 장면을 제외하세요 |
| `EXPLICIT` | 성인 콘텐츠가 감지되었습니다 | 모든 연령이 볼 수 있는 내용으로 수정하세요 |
| `HATE` | 혐오 표현이 감지되었습니다 | 특정 집단에 대한 묘사를 제외하세요 |
| `COPYRIGHT` | 저작권 보호 캐릭터가 감지되었습니다 | 오리지널 캐릭터로 설명하세요 |
| `UNCLEAR` | 프롬프트가 너무 불명확합니다 | 더 구체적인 장면을 묘사하세요 |

### 거절 UI 구성

```
┌────────────────────────────────┐
│ ⚠️  프롬프트가 거절되었습니다    │
├────────────────────────────────┤
│                                │
│ [VIOLENCE] 폭력적 표현           │
│                                │
│ 프롬프트 입력:                  │
│ ┌────────────────────────────┐ │
│ │ 사람들이 싸우고 있습니다.  │ │ (빨간 테두리)
│ └────────────────────────────┘ │
│                                │
│ 수정 가이드:                    │
│ 격렬한 동작이나 충돌 장면을   │
│ 제외하세요                      │
│                                │
│ [프롬프트 수정]  [다른 방법시도] │
└────────────────────────────────┘
```

### 거절 상태 Props + 렌더 규칙

```typescript
interface VgenRejectionState {
  isRejected: boolean
  reason: 'VIOLENCE' | 'EXPLICIT' | 'HATE' | 'COPYRIGHT' | 'UNCLEAR'
  message: string          // 사용자 친화 메시지
  guidance: string         // 수정 가이드
}

// VgenPromptPanel 렌더
if (vgenStore.isRejected) {
  return (
    <div className="rejection-banner">
      <div className="rejection-header">
        <AlertCircle /> 프롬프트가 거절되었습니다
      </div>
      
      <div className="reason-badge">[{reason}]</div>
      <div className="message">{message}</div>
      
      <div className="textarea-wrapper rejected">
        <textarea
          value={promptSections.scene}
          onChange={handleEdit}
          style={{ borderColor: '#ef4444' }}  // 빨간색 테두리
        />
      </div>
      
      <div className="guidance-box">
        <span>수정 가이드:</span>
        <p>{guidance}</p>
      </div>
      
      <div className="action-buttons">
        <button onClick={handleRetry}>프롬프트 수정</button>
        <button onClick={handleReset}>다른 방법 시도</button>
      </div>
    </div>
  )
}
```

### 액션 흐름

```
[프롬프트 수정]
  → promptSections 텍스트 수정
  → textarea 테두리 색상 정상 복구
  → "다시 생성해보세요" 토스트 표시
  → vgenStore.resetRejection()
  → [생성 ▶] 버튼 재활성화

[다른 방법 시도]
  → promptSections 모두 초기화 (빈 문자열)
  → isRejected = false
  → PROMPT_EDITING 상태로 복귀
```

### MUST NOT

- ❌ 거절 이유의 원본 모더레이션 API 응답 텍스트를 사용자에게 그대로 노출 (기술적 용어·점수 숨김)
- ❌ 거절 후 자동 이전 입력값 복구 (사용자가 명시적으로 수정하도록)

---

## 3.2 생성 오류 토스트 — 에러코드별 문구 (G-263)

triggerGenerate() 실패 시 표시할 사용자 친화 토스트. 기술 용어 제거, 행동 지침 포함.

| 에러코드 | 사용자 메시지 | 권장 액션 |
|---|---|---|
| `FAL_TIMEOUT` | 생성 서버에 접속할 수 없습니다. 1분 후 다시 시도해주세요. | [재시도] / [나중에] |
| `RATE_LIMIT` | 생성 요청이 많습니다. 잠시 후 다시 시도해주세요. | [30초 후 재시도] |
| `CREDIT_INSUFFICIENT` | 크레딧이 부족합니다. 크레딧을 충전하고 다시 시도해주세요. | [크레딧 충전] |
| `MODERATION_REJECTED` | (거절 이유 카테고리 별) — 3.1 섹션 참조 | [프롬프트 수정] / [다른 방법 시도] |
| `TOKEN_INVALID` | 세션이 만료됐습니다. 다시 입장해주세요. | [재입장] |
| `INTERNAL_ERROR` | 서버에 일시적 문제가 발생했습니다. 잠시 후 다시 시도해주세요. | [재시도] |

**구현**:
```typescript
// src/utils/vgenErrorMessages.ts
const VGEN_ERROR_MAP: Record<string, { message: string; action: string }> = {
  FAL_TIMEOUT: {
    message: '생성 서버에 접속할 수 없습니다. 1분 후 다시 시도해주세요.',
    action: 'retry_later'
  },
  RATE_LIMIT: {
    message: '생성 요청이 많습니다. 잠시 후 다시 시도해주세요.',
    action: 'retry_after_delay'
  },
  CREDIT_INSUFFICIENT: {
    message: '크레딧이 부족합니다. 크레딧을 충전하고 다시 시도해주세요.',
    action: 'purchase_credit'
  },
  MODERATION_REJECTED: {
    message: '프롬프트가 거절되었습니다. 가이드를 확인하고 수정해주세요.',
    action: 'edit_prompt'
  },
  TOKEN_INVALID: {
    message: '세션이 만료됐습니다. 다시 입장해주세요.',
    action: 'rejoin'
  },
  INTERNAL_ERROR: {
    message: '서버에 일시적 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
    action: 'retry'
  }
};

export function getVgenErrorMessage(errorCode: string): string {
  return VGEN_ERROR_MAP[errorCode]?.message ?? '생성에 실패했습니다. 다시 시도해주세요.';
}
```

---

## 3.3 연속 거절 경고 배너 (G-263)

**상황**: 같은 프롬프트가 3회 이상 연속으로 거절될 때.

**감지 로직**:
```typescript
// vgenStore에 추가
interface VgenRejectionState {
  isRejected: boolean
  reason: string | null
  consecutiveRejectionCount: number  // ← 추가
  lastRejectedPrompt: string | null
}

// triggerGenerate() 실패 처리
if (error.code === 'MODERATION_REJECTED') {
  const currentPrompt = JSON.stringify(promptSections);
  
  if (vgenStore.lastRejectedPrompt === currentPrompt) {
    // 같은 프롬프트 반복
    vgenStore.incrementConsecutiveRejectionCount();
  } else {
    // 다른 프롬프트
    vgenStore.resetConsecutiveRejectionCount();
    vgenStore.setLastRejectedPrompt(currentPrompt);
  }
  
  // 3회 이상 반복 → 경고 배너
  if (vgenStore.consecutiveRejectionCount >= 3) {
    vgenStore.showRejectionWarning(true);
  }
}
```

**경고 배너 UI**:
```
┌────────────────────────────────────────────────────┐
│ ⚠️  경고                                            │
├────────────────────────────────────────────────────┤
│                                                    │
│ 같은 프롬프트가 3회 이상 거절되었습니다.          │
│ 프롬프트를 완전히 다시 작성해주세요.             │
│                                                    │
│ • 다른 장면 또는 캐릭터 설정 시도                 │
│ • 모더레이션 이유 가이드 재확인 (§3.1)           │
│ • 더 구체적이고 명확한 표현 사용                  │
│                                                    │
│ [경고 닫기]                                        │
└────────────────────────────────────────────────────┘
```

**렌더 규칙**:
```typescript
// VgenPromptPanel 상단에 렌더 (textarea 위)
if (vgenStore.consecutiveRejectionCount >= 3) {
  return (
    <div className="rejection-warning-banner">
      <div className="warning-header">
        <AlertTriangle /> 경고
      </div>
      <div className="warning-message">
        같은 프롬프트가 {vgenStore.consecutiveRejectionCount}회 이상 거절되었습니다.
        <strong>프롬프트를 완전히 다시 작성해주세요.</strong>
      </div>
      <ul className="warning-tips">
        <li>다른 장면 또는 캐릭터 설정 시도</li>
        <li>모더레이션 이유 가이드 재확인</li>
        <li>더 구체적이고 명확한 표현 사용</li>
      </ul>
      <button onClick={() => vgenStore.dismissRejectionWarning()}>경고 닫기</button>
    </div>
  );
}
```

**경고 해제 조건**:
- 사용자가 경고 닫기 버튼 클릭 → 일단 숨김
- 프롬프트 내용이 변경되면 consecutiveRejectionCount 초기화 → 경고 자동 해제
- 생성 성공 시 → 카운트 리셋

**MUST NOT**:
- ❌ 3회 거절 시 [생성 ▶] 버튼 자동 비활성화 (사용자 판단 존중)
- ❌ 경고를 강제 modal로 표시 (배너로 충분, 닫기 버튼 필수)

---

## 4. vgenStore 슬라이스

```typescript
// src/stores/vgenStore.ts
interface VgenState {
  jobs: VgenJob[]          // DB vgen_jobs 테이블 구독
  isGenerating: boolean
  progress: number          // 0~100, Edge Fn polling
  creditBalance: number     // DB credits 테이블
  promptSections: Record<string, { content: string; updated_at: string; author_id: string }>
  editors: Record<string, { section: string; index: number; color: string; name: string; updated_at: string }>
  dubbingState: 'idle' | 'dubbing' | 'capturing' | 'done' | 'failed'
  recordingTime: number     // 초 단위
  isRejected?: boolean      // G-91 거절 상태
  rejectionReason?: string  // G-91 거절 이유
}

interface VgenJob {
  id: string
  prompt_text: string
  prompt_snapshot: string | null
  result_url: string | null
  status: 'pending' | 'generating' | 'done' | 'failed'
  credit_cost: number
  created_at: string
}

// 액션
triggerGenerate(prompt: string, roomId: string): Promise<void>
initCollab(livekitRoom: Room): void   // room-authority vgen_prompt_patch 연결
destroyCollab(): void                  // 룸 퇴장 시 정리
setDubbingState(state: DubbingState): void
setRecordingTime(seconds: number): void
saveRecording(jobId: string, blobUrl: string): Promise<void>
```

---

## 4.1 동시 트리거 방지 (C6)

**문제**: VGEN-02 크레딧 차감과 VGEN-03 비동기 잡 상태 브로드캐스트 사이 윈도우에서 두 참가자가 동시에 "생성" 트리거하면 중복 잡 생성 및 이중 크레딧 차감 발생.

**해결 흐름**:

1. 참가자A·B 동시 클릭 → 로컬 debounce 500ms 적용
2. 호스트만 vgen_mode_open 발행 권한 (DataChannel dispatcher 검증)
3. 서버에서 idempotency_key UNIQUE 충돌 → 먼저 도착한 요청의 job_id 반환
4. 뒤늦은 요청 클라이언트: "생성 중인 요청이 있습니다" 토스트 표시
5. VGEN-03 브로드캐스트(job_id 포함) 수신 시 모든 클라이언트 동일 job 구독

**클라이언트 가드**:
- `vgenStore.status` 상태 확인 (GENERATING·MODERATING·FORMAT_CONVERTING 중 재트리거 금지)
- 응답 대기 중 버튼 비활성화 및 debounce 500ms 적용
- `vgen_trigger_ack` 메시지 수신 후 최종 상태 확정

---

## 5. DataChannel 명세

| 채널명 | 방향 | 타입 | 내용 |
|---|---|---|---|
| `room-authority` | HOST→ALL + 프롬프트 patch | reliable, ordered | `vgen_mode_open` / `vgen_mode_close` / `vgen_prompt_patch` / `vgen_result` / `dub_mode_*` |

`vgen_prompt_patch`는 섹션별 LWW payload만 허용한다. 키 입력마다 전송하지 말고 300ms debounce 후 섹션 단위로 보낸다.

`dub_mode_open`/`dub_mode_close`는 더빙 모드 진입/종료 신호용. 모든 참가자에게 마이크 mute 상태를 동기화한다.

`vgen_trigger_ack` (HOST→ALL, reliable): payload `{ job_id, status: 'accepted'|'duplicate' }` — duplicate 수신 시 진행 중 job 구독 전환.

---

## 6. MUST NOT

- 호스트가 아닌 참가자가 `triggerGenerate()` 직접 호출 → HOST-07 거버넌스 위반
- `stageStore.mode = 'dub'` 상태에서 VgenPromptPanel 표시 → 동시 활성 금지
- 크레딧 부족 시 [생성 ▶] 활성화 → 무결성 위반 (서버 게이트에서도 차단하지만 UI에서 먼저 막음)
- 프롬프트 patch를 키 입력마다 발행 → 300ms debounce 없이 고빈도 전송 금지
- 새 DataChannel(`vgen-collab`, `vgen-dubbing`) 생성 → DataChannel SSOT 위반
- ❌ **클라이언트가 Storage signed URL 직접 생성** (`supabase.storage.from(...).createSignedUrl()`) → secret key 노출 위험. 반드시 `get-signed-media-url` Edge Function 또는 RPC 경유 (SecurityPolicies §4)
- **생성 버튼 클릭 후 서버 응답 전까지 재클릭 허용 금지** → debounce 500ms 필수 (C6 트리거 중복 방지)
- **vgenStore.status가 MODERATING·GENERATING·FORMAT_CONVERTING 중 생성 트리거 금지** → 상태 머신 검증 필수
- **호스트가 아닌 참가자가 직접 vgen_mode_open DataChannel 발행 금지** → dispatcher 검증으로 호스트만 허용

---

## 7. 관련 문서

- `DESIGN-DIRECTION.md §6.7~6.9` — 레이어 스택·비주얼 SSOT
- `FEATURE-SPEC.md` — VGEN-01~12
- `DATA-SCHEMA.md §1.8` — vgen_jobs 테이블
- `specs/livekit-edge-fn.md` — Edge Function (LiveKit 토큰 패턴 참조)
- `state-machines/` — Vgen.md (G-09, 미작성)
- `contracts/_INDEX.md` — DataChannel 레지스트리

---

## 한줄정리

VgenPromptPanel은 메인뷰 z-3에서 섹션별 LWW 협업 프롬프트 편집을 제공하고, VgenStatusTab은 우측 탭에서 상태·히스토리를 보여주며 [프롬프트 열기] 진입점 역할만 한다.
