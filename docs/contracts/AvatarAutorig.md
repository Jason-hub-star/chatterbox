---
tags: [contract]
---

<!-- G-89 산출 문서: 아바타 업로드·프리셋·모델 선택 UI 계약 -->
<!-- 참조: ModelSelector.md(선택 패턴), AvatarCanvas.md(렌더 계약), state-machines/_INDEX.md -->

# AvatarAutorig

ChatterBox 아바타 업로드 → 자동 리깅 파이프라인 UI 계약서 (MOD-01, MOD-02 담당)

---

## 1. Props Interface

```typescript
interface AvatarAutorigProps {
  mode: 'upload' | 'preset' | 'select';  // 세 가지 탭
  onComplete: (rigJson: RigData) => void; // 리깅 완료 시 호출
  onError: (error: Error) => void;        // 에러 시 호출
}

// RigData는 rig-format.md 참조
interface RigData {
  version: string;
  avatarName: string;
  parts: Array<{ id: string; url: string; }>;
  blendshapes: Record<string, number>;
  [key: string]: any;
}
```

---

## 2. 탭 1 — 업로드 (`mode: 'upload'`)

### 기능 설명

PNG 파츠 파일 업로드 → Vtube 파이프라인으로 자동 리깅

- **최대 43개 파트** (ARKit 52 blendshapes 기반)
- **ZIP 허용**: 여러 파일을 한 번에 업로드
- **최대 파일 크기**: 50MB
- **비동기 처리**: 최대 3분 소요

### UI 구조

```
┌─────────────────────────────────┐
│  📤 아바타 파일 업로드            │
├─────────────────────────────────┤
│                                 │
│  [파일 선택]  또는  [ZIP 드래그]  │
│                                 │
│  지원: PNG 파일, ZIP 아카이브   │
│  최대: 50MB, 43개 파트까지    │
│                                 │
├─────────────────────────────────┤
│  진행 상태:                      │
│  ████░░░░  업로드 중 (25%)      │
│  (상태 텍스트: 업로드 → 분석 → 리깅 → 완료)
│                                 │
│  [취소]  [일시정지]              │
└─────────────────────────────────┘
```

### 진행 상태 (Progress States)

| 상태 | 설명 | 시간 | UI |
|------|------|------|-----|
| `uploading` | 파일 업로드 중 | 1~30초 | "업로드 중..." 진행바 |
| `analyzing` | Vtube 파이프라인 분석 (PNG 레이어 추출) | 30~60초 | "분석 중..." 스피너 |
| `rigging` | 자동 리깅 생성 (rig.json 렌더링) | 60~180초 | "리깅 중..." 프로그레스 |
| `complete` | 완료 | — | "✓ 완료" + [계속] 버튼 |

### 에러 처리

실패 시: 빨간색 배너 + 에러 메시지 + [재시도] 버튼

```
┌─────────────────────────────────┐
│ ⚠️  업로드 실패                  │
│파일이 손상되었거나 형식이 맞지   │
│않습니다. 다시 시도해주세요.       │
│                                 │
│ [재시도]  [취소]                 │
└─────────────────────────────────┘
```

**에러 사유 매핑**:
- `INVALID_FORMAT`: "PNG 또는 ZIP 파일만 지원합니다"
- `FILE_TOO_LARGE`: "파일이 50MB를 초과합니다"
- `PART_LIMIT_EXCEEDED`: "43개 이상의 파트는 지원하지 않습니다"
- `RIGGING_FAILED`: "리깅 생성에 실패했습니다. 고객 지원에 문의하세요"
- `TIMEOUT`: "요청이 시간초과되었습니다 (최대 3분)"

### Store 의존

```typescript
// 읽기
modelStore.uploadProgress    // 0~100 진행도
modelStore.uploadStatus      // 'uploading' | 'analyzing' | 'rigging' | 'complete' | 'error'
modelStore.uploadError       // Error | null

// 쓰기
modelStore.startUpload(files: File[])
modelStore.cancelUpload()
modelStore.retryUpload()
modelStore.completeUpload(rigJson: RigData)
```

### DataChannel 의존성

없음. AvatarAutorig는 룸 입장 전/모델 관리 화면에서 Supabase/R2/Vtube 파이프라인만 사용하며 LiveKit DataChannel을 열지 않는다.

### MUST NOT

- ❌ 리깅 완료 전 아바타 렌더러 실행 금지
- ❌ 50MB 초과 파일 업로드 허용 금지
- ❌ 43개 초과 파트 지원 금지 (메모리·성능 제약)
- ❌ 비인증 사용자 업로드 허용 금지 (users 테이블 auth_id 필수)

---

## 3. 탭 2 — 프리셋 (`mode: 'preset'`)

### 기능 설명

기본 제공 아바타 목록 (3~5개 무료 프리셋)

- **즉시 사용**: 프리셋 선택 시 rig.json 자동 로드
- **미리보기**: 썸네일 + 아바타 이름 표시
- **추후 확장**: 마켓플레이스 (모델 판매·공유) — P2

### UI 구조

```
┌──────────────────────────────────┐
│  ⭐ 무료 프리셋 아바타             │
├──────────────────────────────────┤
│                                  │
│  ┌────┐  ┌────┐  ┌────┐        │
│  │🧑  │  │👩  │  │🤖  │        │
│  └────┘  └────┘  └────┘        │
│   기본남 기본여  로봇           │
│                                  │
│  ┌────┐  ┌────┐                │
│  │👽  │  │🧛  │                │
│  └────┘  └────┘                │
│   외계인  뱀파이어              │
│                                  │
│  [선택된 아바타]                 │
│  ┌─────────────────────┐        │
│  │  기본남 (Default)   │        │
│  │ 기본 제공 아바타    │        │
│  │ [선택 완료]         │        │
│  └─────────────────────┘        │
└──────────────────────────────────┘
```

### 프리셋 데이터 (하드코딩 또는 DB)

```typescript
const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 'preset_default_male',
    name: '기본남',
    description: '기본 제공 아바타',
    thumbnail: '/avatars/presets/male.png',
    rigJsonUrl: '/avatars/presets/male.json',
  },
  {
    id: 'preset_default_female',
    name: '기본여',
    description: '기본 제공 아바타',
    thumbnail: '/avatars/presets/female.png',
    rigJsonUrl: '/avatars/presets/female.json',
  },
  // ... 3~5개 추가
]
```

### Store 의존

```typescript
// 읽기
modelStore.presets  // AvatarPreset[]
modelStore.selectedPresetId  // string | null

// 쓰기
modelStore.loadPreset(presetId: string): Promise<RigData>
```

### MUST NOT

- ❌ 프리셋 로드 전 아바타 렌더러 실행
- ❌ 프리셋 URL을 클라이언트 편집 허용 금지
- ❌ 미검증 JSON 파일 로드

---

## 4. 탭 3 — 내 모델 선택 (`mode: 'select'`)

### 기능 설명

`models` 테이블에서 현재 사용자의 업로드된 모델 목록

- **이전 업로드 목록**: 사용자가 이전에 업로드한 모델 표시
- **즉시 선택**: 클릭 시 해당 모델의 rig.json 로드
- **정렬**: 최근 업로드순 (created_at DESC)

### UI 구조

```
┌────────────────────────────┐
│  📚 내 모델 목록            │
├────────────────────────────┤
│  검색: [_______]           │
│  필터: [모두▼]  [2026-06]  │
├────────────────────────────┤
│                            │
│  ┌──────────────────┐    │
│  │ 내 아바타 #1     │    │
│  │ 2026-06-29 업로드│    │
│  │ 43개 파트       │    │
│  │ [선택]           │    │
│  └──────────────────┘    │
│                            │
│  ┌──────────────────┐    │
│  │ 내 아바타 #2     │    │
│  │ 2026-06-28 업로드│    │
│  │ 28개 파트       │    │
│  │ [선택]           │    │
│  └──────────────────┘    │
│                            │
│  (무한 스크롤 또는 페이징)  │
└────────────────────────────┘
```

### 모델 카드 정보

```typescript
interface ModelCard {
  id: string;              // models.id
  name: string;            // models.display_name
  uploadedAt: string;      // models.created_at
  partCount: number;       // rig.json의 parts[] 길이
  thumbnail?: string;      // 선택적: 썸네일 URL
}
```

### 쿼리 (Supabase)

```sql
SELECT id, display_name, created_at, rig_json
FROM models
WHERE user_id = current_app_user_id()
ORDER BY created_at DESC
LIMIT 20 OFFSET {page * 20}
```

### Store 의존

```typescript
// 읽기
modelStore.userModels      // ModelCard[]
modelStore.isLoadingModels // boolean
modelStore.modelsError     // Error | null

// 쓰기
modelStore.loadUserModels(page: number)
modelStore.selectModel(modelId: string): Promise<RigData>
```

### MUST NOT

- ❌ 다른 사용자의 모델 표시 금지
- ❌ 검증 없이 rig.json 직렬화 금지

---

## 5. 통합 흐름

### 컴포넌트 라이프사이클

```
┌─ AvatarAutorig 마운트
├─ modelStore 초기화 (업로드/프리셋 데이터 로드)
├─ 3개 탭 UI 렌더 (탭 전환)
│
├─ [업로드] 탭 선택
│  ├─ startUpload() → Vtube 파이프라인 호출
│  └─ onComplete(rigJson) → 완료
│
├─ [프리셋] 탭 선택
│  ├─ 프리셋 목록 렌더
│  └─ loadPreset() → onComplete(rigJson)
│
└─ [선택] 탭 선택
   ├─ loadUserModels() → 목록 렌더
   └─ selectModel() → onComplete(rigJson)

onComplete(rigJson)
  → GreenRoom 또는 모델 선택 모달이 rigData 저장
  → AvatarCanvas 마운트 (렌더링)
  → 모달 닫기
```

### Edge Function: upload-to-vtube

```typescript
// POST /functions/v1/upload-to-vtube
// 요청: { files: File[], userId: string }
// 응답: { jobId: string, status: 'pending' }

// 폴링 (2초마다):
// GET /functions/v1/vtube-job-status?jobId={jobId}
// 응답: { status: 'rigging' | 'complete', rigJson?: RigData, error?: string }
```

---

## 6. MUST NOT

- ❌ 리깅 완료 전 onComplete 호출 금지
- ❌ 비인증 사용자 업로드 허용
- ❌ 50MB 초과 파일
- ❌ 43개 초과 파트
- ❌ 검증 없이 JSON 로드
- ❌ 다른 사용자 모델 접근

---

## 관련 문서

- `FEATURE-SPEC.md` — MOD-01, MOD-02
- `rig-format.md` — rig JSON 스키마
- `ModelSelector.md` — 유사 선택 패턴 참조
- `AvatarCanvas.md` — 렌더 계약서

---

## 한줄정리

AvatarAutorig는 3탭(업로드·프리셋·선택)으로 아바타 획득 경로를 제공하며, 업로드는 Vtube 파이프라인에 위임하고 완료 시 onComplete로 rig.json을 전달한다.
