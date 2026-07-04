---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- FEATURE-SPEC VGEN-12 "완성 쇼츠 다운로드 + SNS 공유 링크 발급" 계약 -->

# VgenExportPanel

완성된 AI 영상생성(VGEN) 쇼츠의 다운로드 + SNS 공유 링크 발급 UI. `VgenStatusTab` 내부에서 "완성" 상태 항목 클릭 시 오버레이로 나타난다.

---

## Props Interface

```typescript
interface VgenExportPanelProps {
  /**
   * vgen_jobs.id — 생성 잡 고유번호
   */
  jobId: string;

  /**
   * R2 서명 URL (생성된 영상)
   * 자동 만료: 7일
   */
  videoUrl: string;

  /**
   * 영상 포맷: 16:9 또는 9:16(세로형 쇼츠)
   * 9:16이 없을 경우 [세로형 변환] 버튼 표시
   */
  format: '16:9' | '9:16';

  /**
   * 현재 room_id (Edge Function 호출 시 컨텍스트)
   */
  roomId: string;

  /**
   * 오버레이 닫기 콜백
   * 다운로드 완료 후 또는 [닫기] 클릭 시 호출
   */
  onClose: () => void;
}
```

---

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|------|------|------|
| `vgenStore` | `exportState` | ✓ | ✓ | 'idle' \| 'generating_share_link' \| 'done' \| 'failed' |
| `vgenStore` | `shareUrl` | ✓ | ✓ | 공유 링크 (단기 서명 URL, 7일 만료) |
| `vgenStore` | `roomArtifacts` | ✓ | ✓ | 방/내 작품 갤러리 목록 (`room_artifacts`) |

**읽기 전용:** vgenStore.exportState, vgenStore.shareUrl  
**쓰기:** vgenStore.setExportState(), vgenStore.setShareUrl()

---

## 기능 명세

### 1. 미리보기 영상

```typescript
// 오버레이 상단에 video 엘리먼트
<video
  src={videoUrl}
  muted
  autoplay
  loop
  style={{
    width: '100%',
    height: 'auto',
    maxHeight: '200px',
    borderRadius: '8px',
    marginBottom: '16px',
  }}
/>
```

- **소스:** props.videoUrl (R2 서명 URL)
- **속성:** `muted`, `autoplay`, `loop`
- **동작:** 오버레이 진입 시 자동 재생

---

### 2. 다운로드 버튼

```typescript
async function downloadVideo() {
  try {
    const response = await fetch(videoUrl);
    const blob = await response.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chatterbox-${jobId}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch (error) {
    console.error('Download failed:', error);
    vgenStore.setExportState('failed');
  }
}
```

**파일명:** `chatterbox-{jobId}.mp4`

**다운로드 중 제약:**
- 오버레이 닫기 버튼 비활성화 (다운로드 완료 후 활성)
- 프로그레시브 로딩 표시 (선택사항: 작은 진행바)

---

### 3. 공유 링크 발급

Supabase Edge Function `generate-share-link` 호출:

```typescript
async function generateShareLink() {
  vgenStore.setExportState('generating_share_link');
  try {
    const response = await supabase.functions.invoke('generate-share-link', {
      body: {
        job_id: jobId,
        room_id: roomId,
        expires_in: 604800,  // 7일 (초 단위)
      },
    });
    const { share_url } = response.data;
    vgenStore.setShareUrl(share_url);
    await vgenStore.upsertRoomArtifact(jobId, roomId, share_url);
    vgenStore.setExportState('done');
  } catch (error) {
    console.error('Share link generation failed:', error);
    vgenStore.setExportState('failed');
  }
}
```

**Edge Function 명세:**
- **호출:** Supabase Functions (serverless)
- **입력:** `{ job_id, room_id, expires_in }`
- **출력:** `{ share_url: string }`
- **역할:** R2에서 생성된 영상의 단기 서명 URL 발급 (7일 만료)

**공유 링크 규칙:**
- 클라이언트에서 직접 생성 금지 ❌
- 서명(signature)은 서버(Edge Function)에서만 생성 ✓
- R2 공개 URL 노출 금지, 반드시 서명 URL ✓
- 공유/다운로드 가능한 결과는 `room_artifacts`에 남겨 방 갤러리와 내 작품함에서 재접근 가능해야 함 ✓

---

### 3.5 공개 범위 선택 (G-66)

내보내기 모달에서 생성물의 공개 범위를 설정:

```typescript
// RadioGroup 선택:
//   ○ 공개 — 로비 갤러리에 노출 (모든 사용자 접근)
//   ● 방 멤버만 (기본값) — 같은 방 참가자만 접근
//   ○ 비공개 — 나만 접근

async function setVgenVisibility() {
  const visibility = selectedRadio; // 'public' | 'members_only' | 'private'
  try {
    const { error } = await supabase
      .from('vgen_jobs')
      .update({ visibility })
      .eq('id', jobId);
    
    if (error) throw error;
    showToast('공개 범위가 저장되었습니다.');
  } catch (error) {
    console.error('Visibility update failed:', error);
    showToast('공개 범위 저장에 실패했습니다.', { type: 'error' });
  }
}
```

**UI 배치:**
```
┌─────────────────────────────────┐
│ 공개 범위 선택                      │
├─────────────────────────────────┤
│ ○ 공개 — 로비 갤러리에 노출         │
│ ● 방 멤버만 (기본값)               │
│ ○ 비공개 — 나만 접근              │
├─────────────────────────────────┤
│              [확인]                │
└─────────────────────────────────┘
```

**제약 및 규칙:**
- 호스트만 변경 가능 (host_id = auth.uid() 검증)
- 기본값: `members_only` (같은 방 참가자만)
- public: 모든 인증 사용자가 로비 갤러리에서 조회 가능
- private: 본인(triggered_by)만 "내 작품함"에서 접근

---

### 4. 클립보드 복사

```typescript
async function copyShareLink() {
  if (!vgenStore.shareUrl) return;
  try {
    await navigator.clipboard.writeText(vgenStore.shareUrl);
    // 복사 성공 토스트 표시 (1초 후 자동 사라짐)
    showToast('링크가 복사되었어요!', { duration: 1000 });
  } catch (error) {
    console.error('Clipboard copy failed:', error);
  }
}
```

**버튼 상태:**
- `exportState === 'done'` → [복사됨] 버튼 활성 (또는 토글 상태)
- 기타 상태 → 비활성 (로딩 스피너)

---

### 5. SNS 공유 버튼 3종

#### 5.1 Twitter/X Intent URL

```typescript
function shareToTwitter() {
  const text = `완성된 AI 영상을 생성했어요! #ChatterBox`;
  const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(vgenStore.shareUrl)}`;
  window.open(url, '_blank', 'width=600,height=400');
}
```

#### 5.2 YouTube 업로드 힌트

```typescript
function openYouTubeUpload() {
  // 외부 링크: YouTube Studio 대시보드로 이동
  window.open('https://studio.youtube.com/videos', '_blank');
  // 로컬 다운로드 후 수동 업로드 가이드 안내
}
```

#### 5.3 카카오 공유 + Web Share API 폴백

```typescript
async function shareToKakao() {
  // kakao.share.sendCustom (기존 카카오 SDK 구현)
  if (window.Kakao) {
    Kakao.Share.sendCustom({
      templateId: 12345,  // 카카오톡 공유 템플릿 ID (사전 등록 필요)
      templateArgs: {
        title: 'ChatterBox 영상',
        description: '완성된 AI 영상 쇼츠',
        image_url: 'https://...',  // 썸네일 (선택)
        share_url: vgenStore.shareUrl,
      },
    });
  } else if (navigator.share) {
    // Web Share API 폴백 (iOS Safari, Android Chrome)
    try {
      await navigator.share({
        title: 'ChatterBox 영상',
        text: '완성된 AI 영상을 생성했어요!',
        url: vgenStore.shareUrl,
      });
    } catch (error) {
      console.log('Web Share API failed (user cancelled or not supported)');
    }
  }
}
```

**버튼 배치:**
```
┌─────────────────────────────┐
│ [🐦 X에 공유]  [📺 유튜브]   [🟡 카카오] │
└─────────────────────────────┘
```

---

### 6. 세로형 변환 버튼 (VGEN-11 연동)

> **2026-07-04 정정 (slice1b)**: 신규 쇼츠는 생성 시 `aspect_ratio:"9:16"`로 처음부터 세로 출력하므로 이 변환 버튼이 필요 없다. 이 버튼은 **이미 만든 16:9 자산을 세로로 돌리는 폴백**으로만 유지한다. SSOT: VgenCostAnalysis §4.5 · state-machines/Vgen.md.

**조건:** `format === '16:9'` 일 때만 표시

```typescript
async function requestVerticalConversion() {
  // fal.ai 잡 트리거는 서버 전용. 클라이언트는 Edge Function만 호출한다.
  try {
    const { data, error } = await supabase.functions.invoke('vgen-format-convert', {
      body: {
        job_id: jobId,
        room_id: roomId,
        target_format: '9:16',
      },
    });
    if (error) throw error;
    return data; // Edge Function이 vgen_jobs.output_9x16_url 갱신
  } catch (error) {
    console.error('Vertical conversion failed:', error);
  }
}
```

MUST NOT:
- 클라이언트에서 `fal.subscribe()` 직접 호출 금지.
- `FAL_KEY`를 `VITE_*` 환경변수 또는 브라우저 번들에 포함 금지.

**UI 텍스트:**
```
[🎬 세로형 변환 요청]
(16:9 → 9:16, 1~2분 소요)
```

**동작:**
- 클릭 → 버튼 비활성화 + 로딩 스피너
- 완료 → 버튼 숨김 (이미 9:16으로 변환됨)
- 실패 → 에러 토스트 + 버튼 재활성화

### 6.1 세로형 변환 실패 처리

fal.ai 변환 작업이 실패할 수 있는 경우들:

```
타임아웃 (fal.ai job > 5분):
  → Edge Function timeout 또는 status='failed'
  → 클라이언트: toastError('세로형 변환이 시간을 초과했습니다')
  
용량 초과 (영상 > 500MB):
  → Edge Function: status='failed' (fal.ai API response)
  → 클라이언트: toastError('변환할 수 없는 크기의 영상입니다')
  
메모리 부족:
  → fal.ai endpoint error
  → 클라이언트: toastError('서버 리소스 부족. 나중에 다시 시도해주세요')
  
네트워크 오류:
  → supabase.functions.invoke 실패
  → 클라이언트: toastError('변환 요청 실패. 다시 시도해주세요')
```

**실패 시 UI:**
```typescript
async function requestVerticalConversion() {
  try {
    setConversionState('converting');
    
    const { data, error } = await supabase.functions.invoke('vgen-format-convert', {
      body: {
        job_id: jobId,
        room_id: roomId,
        target_format: '9:16',
      },
    });
    
    if (error || data?.status === 'failed') {
      throw new Error(data?.error_reason || 'Unknown error');
    }
    
    setConversionState('done');
  } catch (error) {
    console.error('Vertical conversion failed:', error);
    
    // 실패 토스트 + 재시도 버튼 활성화
    showToast(`세로형 변환 실패: ${error.message}`, { type: 'error' });
    setConversionState('idle'); // 버튼 재활성화
  }
}

// 렌더: 실패 시 버튼이 다시 활성화된 상태로 유지
<button
  onClick={requestVerticalConversion}
  disabled={conversionState !== 'idle'}
>
  {conversionState === 'converting' ? '변환 중...' : '🎬 세로형 변환 요청'}
</button>
```

**MUST NOT:**
- ❌ 변환 실패 후 버튼 영구 비활성화
- ❌ 재시도 옵션 없이 에러만 표시
- ❌ 부분 변환 결과를 9:16으로 저장 (전체 실패한 것으로 취급)

---

## 렌더 구조

```
┌─────────────────────────────────────────┐
│ VgenExportPanel (오버레이)                │
│                                         │
│ [✕ 닫기]                 (상단 우측)      │
├─────────────────────────────────────────┤
│                                         │
│ ┌─────────────────────────────────┐   │
│ │ [영상 미리보기]                   │   │ ← video element
│ │ (muted, autoplay, loop)         │   │
│ └─────────────────────────────────┘   │
│                                         │
│ [⬇️ 다운로드] [🔗 공유링크 복사]         │
│                                         │
│ 또는 (공유링크 생성 중)                  │
│ [⏳ 생성 중...]                          │
│                                         │
├─────────────────────────────────────────┤
│ 다른 곳에 공유:                          │
│ [🐦 X] [📺 유튜브] [🟡 카카오]         │
├─────────────────────────────────────────┤
│ (format=16:9일 때만)                   │
│ [🎬 세로형 변환 요청]                    │
└─────────────────────────────────────────┘
```

---

## vgenStore 슬라이스

```typescript
interface VgenExportState {
  exportState: 'idle' | 'generating_share_link' | 'done' | 'failed';
  shareUrl: string | null;
}

interface VgenStore {
  exportState: VgenExportState['exportState'];
  shareUrl: VgenExportState['shareUrl'] | null;
  
  // 액션
  setExportState(state: VgenExportState['exportState']): void;
  setShareUrl(url: string | null): void;
}
```

---

## Supabase 연동

### vgen_jobs 읽기

```typescript
// VgenStatusTab에서 jobId를 props로 받음
// vgen_jobs 테이블에서 jobId 행 조회 (이미 VgenStatusTab에서 로드됨)
const job = vgenStore.jobs.find(j => j.id === jobId);

// 필요한 컬럼:
// - id: jobId
// - status: 'done' (이미 확인됨)
// - result_url: videoUrl (props로 전달)
// - format: '16:9' | '9:16' (props로 전달)
```

### Edge Function: generate-share-link

**목적:** R2 서명 URL 발급 (7일 만료)

**입력:**
```typescript
{
  job_id: string;           // vgen_jobs.id
  room_id: string;          // vgen_jobs.room_id
  expires_in: number;       // 604800 (7일, 초 단위)
}
```

**출력:**
```typescript
{
  share_url: string;        // R2 서명 URL
  expires_at: string;       // ISO 8601 timestamp
}
```

**구현 참고:**
- AWS S3 (또는 R2) SDK로 signed URL 생성
- 권한: 선택 사용자만 다운로드 가능 (또는 공개)
- 자동 만료: 7일 후 접근 불가

---

## DataChannel

**구독:** 없음 (개인 내보내기, 방 전체 브로드캐스트 불필요)  
**발행:** 없음

---

## 화면 상태 다이어그램

```
[오버레이 열기]
    ↓
[영상 미리보기 + 다운로드 버튼]
    ↓
┌─ [다운로드 클릭]
│   → 파일 다운로드 시작
│   → 다운로드 중: [닫기] 비활성화
│   → 완료 후: [닫기] 활성화
│
└─ [공유링크 복사 클릭]
    → exportState: 'generating_share_link'
    → Edge Function 호출 (7일 서명 URL 발급)
    → 성공: shareUrl 설정, exportState: 'done'
    → [복사됨] 버튼 표시
    → SNS 버튼 활성화
    → (선택) [세로형 변환] 버튼 표시
    ↓
[SNS 공유 선택 또는 닫기]
```

---

## MUST NOT

- ❌ **클라이언트에서 R2 서명 URL 직접 생성** — 모든 서명은 Edge Function(`generate-share-link`)에서만 생성
- ❌ **R2 공개 URL 노출** — props.videoUrl와 shareUrl은 항상 서명 URL
- ❌ **다운로드 중 오버레이 강제 닫기** — 다운로드 완료 후에만 닫기 활성화
- ❌ **공유 링크를 localStorage에 저장** — 세션 내만 유지 (방장 권한 외 접근 차단)
- ❌ **SNS 공유 버튼 클릭 시 별도 인증** — Web Share API는 시스템 권한 사용, 카카오는 미리 SDK 초기화
- ❌ **세로형 변환 버튼을 format=9:16일 때 표시** — format=16:9일 때만 표시
- ❌ **다운로드·변환·공유 버튼 동시 클릭 허용** — UI에서 클릭 중 버튼 비활성화 (race condition 방지)

---

## VGEN-13 — 작품 라이브러리 검색·태그

VgenExportPanel은 개별 결과 내보내기 표면이고, 작품 라이브러리는 녹화/VGEN/DUB 산출물을 같은 규칙으로 색인한다. 별도 `/works` 페이지가 생기기 전까지는 ProfilePage 또는 VgenExport 진입점에서 "내 작품" 목록으로 연결한다.

```typescript
interface WorkLibraryItem {
  id: string;
  kind: 'recording' | 'vgen' | 'dub';
  title: string;
  roomId: string;
  createdAt: string;
  tags: string[];
  visibility: 'private' | 'room' | 'public';
  thumbnailUrl?: string; // signed URL only
}
```

**검색/필터**
- 키워드: title, room title, script title
- 필터: kind, tag, visibility, createdAt range
- 기본 정렬: createdAt desc
- 공개/비공개 변경은 owner만 가능하고 audit log를 남김

**MUST NOT**
- ❌ `recordings`, `vgen_jobs`, `dub_tracks`의 원본 R2 key를 클라이언트에 노출
- ❌ 공개 범위 변경을 공유 링크 만료와 섞어서 처리
- ❌ 태그 검색 때문에 임의 SQL text search를 클라이언트에서 조합

---

## 컴포넌트 관계

```
[VgenStatusTab] (우측 패널 탭 3)
  │
  ├─ [완성 영상 카드] (클릭)
  │   └─ [VgenExportPanel] (오버레이 마운트)
  │       │
  │       ├─ [VideoPreview] (muted, autoplay, loop)
  │       │
  │       ├─ [DownloadButton]
  │       │   └─ fetch videoUrl → Blob → a.download 트리거
  │       │
  │       ├─ [ShareLinkButton]
  │       │   └─ Edge Function 'generate-share-link' 호출
  │       │       → vgenStore.shareUrl 설정
  │       │       → [클립보드 복사] 활성화
  │       │
  │       ├─ [SnsButtons]
  │       │   ├─ [TwitterButton] → x.com/intent/tweet
  │       │   ├─ [YouTubeButton] → studio.youtube.com (외부 링크)
  │       │   └─ [KakaoButton] → Kakao SDK 또는 Web Share API
  │       │
  │       └─ [VerticalConvertButton] (format=16:9일 때만)
  │           └─ fal.ai crop/resize 잡 트리거 → VGEN-11
  │
  └─ vgenStore 구독
      ├─ exportState (로딩/완료/실패)
      └─ shareUrl (공유 링크 URL)
```

---

## 관련 문서

- `VgenPanel.md` — VgenStatusTab (진입점), VgenPromptPanel (프롬프트 편집)
- `STACK-COMPARE-VIDEOGEN.md` — fal.ai Seedance 2.0 포맷 스펙 (VGEN-09, VGEN-11)
- `DATA-SCHEMA.md §1.8` — vgen_jobs 테이블 (id, status, result_url, format)
- `FEATURE-SPEC.md VGEN-11, VGEN-12` — 세로형 쇼츠 + 다운로드·공유 명세
- `contracts/_INDEX.md` — DataChannel 레지스트리 (이 컴포넌트는 구독/발행 없음)

---

## 한줄정리

VgenExportPanel은 완성된 AI 영상 쇼츠를 미리보기·다운로드·공유하는 오버레이로, R2 서명 URL(7일)을 Edge Function에서만 발급하고, 세로형 변환(VGEN-11)은 format 조건에 따라 제공하며, SNS 공유는 Web Share API와 카카오 SDK를 폴백으로 지원한다.
