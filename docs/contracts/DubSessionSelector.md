---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- opencode: 2026-06-29 - DUB-01/01b DubSessionSelector 계약서 신규 작성 (영상 업로드 UI, dubStore 신설). Coded with OpenCode; high-cost model review recommended. -->

# DubSessionSelector

더빙 세션 생성 UI. 영상 소스 선택(MP4 업로드 또는 YouTube URL) → R2 업로드 → Whisper API STT 자동 호출까지 담당. `DubStatusTab`(RightPanel DUB 탭) 내부에서 호스트가 [새 더빙 세션] 클릭 시 오버레이로 마운트.

> **상태머신**: `state-machines/DubSession.md` IDLE → UPLOADING → UPLOADED → TRANSCRIBING → READY 전이 담당.
> **스키마**: `DATA-SCHEMA.md §1.12 dub_sessions` (source_video_url, source_type, whisper_job_id, diarization_result_json, consent_json, retention_expires_at).

---

## Props Interface

```typescript
interface DubSessionSelectorProps {
  /**
   * 현재 room_id (dub_sessions.room_id)
   */
  roomId: string;

  /**
   * 세션 생성 완료 콜백
   * DubSession.md UPLOADED → TRANSCRIBING 진입 시 호출
   * 이후 DubRoleAssigner로 전환
   */
  onSessionCreated: (dubSessionId: string) => void;

  /**
   * 오버레이 닫기 콜백
   */
  onClose: () => void;

  /**
   * 에러 콜백
   */
  onError?: (error: Error) => void;
}
```

---

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `dubStore` | `uploadState` | ✓ | ✓ | 'idle' \| 'uploading' \| 'uploaded' \| 'failed' |
| `dubStore` | `transcriptionState` | ✓ | ✓ | 'idle' \| 'transcribing' \| 'ready' \| 'failed' |
| `dubStore` | `activeSession` | ✓ | ✓ | 현재 세션 (dub_sessions 행 미러) |
| `dubStore` | `uploadProgress` | ✓ | ✓ | 0~100 (R2 업로드 진행률) |
| `dubStore` | `startUpload()` | | ✓ | MP4 업로드 또는 YouTube 다운로드 시작 |
| `dubStore` | `startTranscription()` | | ✓ | Whisper API 호출 트리거 |
| `stageStore` | `mode` | ✓ | | 'dub' 여부 확인 |
| `userStore` | `isHost` | ✓ | | 호스트만 세션 생성 권한 |

**읽기 전용:** stageStore.mode, userStore.isHost
**쓰기:** dubStore.uploadState, dubStore.transcriptionState, dubStore.activeSession, dubStore.uploadProgress

---

## 기능 명세

### 1. 영상 소스 선택

```
┌─────────────────────────────────────┐
│ DubSessionSelector (오버레이)        │
│                                     │
│ [✕ 닫기]              (상단 우측)    │
├─────────────────────────────────────┤
│ 더빙할 영상 선택                     │
│                                     │
│ ┌─────────────┐  ┌─────────────┐    │
│ │ 📁 MP4 업로드│  │ 🎥 YouTube  │    │
│ │ (로컬 파일)  │  │  URL 입력   │    │
│ └─────────────┘  └─────────────┘    │
│                                     │
│ (선택 후)                           │
│ [파일 선택] 또는 [URL 입력 필드]     │
│                                     │
│ [다음 →]                            │
└─────────────────────────────────────┘
```

**MP4 업로드 플로우:**

```typescript
async function selectMp4(file: File) {
  // 파일 검증
  if (file.size > 100 * 1024 * 1024) {
    throw new Error('File exceeds 100MB limit');
  }
  if (!['video/mp4', 'video/webm'].includes(file.type)) {
    throw new Error('Only MP4 and WebM are supported');
  }

  dubStore.setUploadState('uploading');
  dubStore.setUploadProgress(0);

  // 업로드 intent 발급 (Edge Function). quota/flag/host/content-type/checksum gate 포함.
  const { upload_id, upload_url, max_chunk_bytes } = await supabase.functions.invoke('create-dub-upload', {
    body: { room_id: roomId, file_name: file.name, size_bytes: file.size, mime_type: file.type, checksum },
  });

  // R2 업로드 (진행률 추적)
  await uploadToR2(upload_url, file, (progress) => {
    dubStore.setUploadProgress(progress);
  });

  // dub_sessions INSERT
  const { data, error } = await supabase.functions.invoke('create-dub-session', {
    body: {
      room_id: roomId,
      source_type: 'mp4',
      source_object_key: upload_id,  // 서버가 검증한 upload intent/object key
      rights_attestation: true,
    },
  });

  if (error) {
    // C6 롤백: DB INSERT 실패 시 R2 DELETE (보상 트랜잭션)
    await supabase.functions.invoke('delete-r2-object', { body: { object_key } });
    throw error;
  }

  dubStore.setActiveSession(data);
  dubStore.setUploadState('uploaded');
  onSessionCreated(data.id);  // → DubRoleAssigner로 전환
}
```

**YouTube URL 플로우 (DUB-01b, P2 — 기본 비활성):**

```typescript
async function selectYoutube(url: string) {
  throw new Error('YouTube import is disabled until legal/SSRF/cost gates are approved');
}
```

### 1.5 Source Moderation (Sampled Frames + STT Text)

업로드 완료 후 `create-dub-session` Edge Function이 자동으로 source moderation을 수행한다.

**프레임 샘플링:**
- 영상 길이 기반 샘플링: 10초 간격으로 프레임 캡처
- 예: 60초 영상 → 6개 프레임 추출 (0s, 10s, 20s, ..., 50s)
- 각 프레임에 모더레이션 API (OpenAI Vision, Google SafeSearch) 적용

**STT 텍스트 모더레이션:**
- Whisper API 전사 완료 후 text moderation API 호출
- 금지 카테고리: violent, sexual, hate_speech, illegal, spam

**통과 기준:**
- 모든 샘플링 프레임이 "안전" 판정
- 전사 텍스트가 모든 금지 카테고리에서 "안전" 판정
- 둘 다 통과 시 → `source_moderation_status='approved'` → `dub_sessions` 상태 'READY'로 전이

**거절 시 사용자 알림 (§2.2):**

```
DubSessionSelector 오버레이에 거절 배너:

┌───────────────────────────────────────┐
│ ⚠️ 영상 심사 거절됨                    │
├───────────────────────────────────────┤
│ 카테고리: [VIOLENCE] (폭력적 표현)     │
│                                       │
│ 사유: "격렬한 동작이나 싸움 장면 감지" │
│ 가이드: 그러한 장면을 제외하고        │
│        새로운 영상을 업로드하세요     │
│                                       │
│ [다시 업로드] [이의 신청]            │
└───────────────────────────────────────┘
```

**이의 제기 (appeal):**
- `dub_session_appeals` 테이블 INSERT
- appeal 상태 → 수동 검토 (1~3일)
- 승인 시 `source_moderation_status='approved_on_appeal'`로 변경 후 자동 READY 진입

**MUST NOT:**
- ❌ moderation 결과를 클라이언트에서 직접 생성 — Edge Function에서만 검증
- ❌ 거절 원인 기술용어 노출 (API 응답 원문 사용 금지)
- ❌ 이의 신청 2회 이상 허용 (1차 appeal만)

### 2. Whisper API STT 자동 호출

업로드 완료(`uploadState='uploaded'`) 및 source moderation 승인 후 자동으로 Whisper API 호출:

```typescript
async function autoStartTranscription() {
  if (!dubStore.activeSession) return;
  
  dubStore.setTranscriptionState('transcribing');

  const { error } = await supabase.functions.invoke('start-dub-transcription', {
    body: { dub_session_id: dubStore.activeSession.id },
  });

  if (error) {
    dubStore.setTranscriptionState('failed');
    // C6 롤백: source_video_url은 유지, 재시도 가능
    showToast('대본 추출에 실패했습니다. 다시 시도해주세요.');
    return;
  }

  // Whisper API는 비동기: webhook 또는 polling으로 결과 대기
  // 결과 도착 시 dubStore.setTranscriptionState('ready') + diarization_result_json 저장
}

// DubSession.md UPLOADED → TRANSCRIBING 전이
useEffect(() => {
  if (dubStore.uploadState === 'uploaded' && dubStore.transcriptionState === 'idle') {
    autoStartTranscription();
  }
}, [dubStore.uploadState]);
```

**진행 상태 UI:**

```
업로드 완료 ✓
대본 추출 중... (Whisper API)
⏳ 3~5분 소요 예상
```

### 3. R2 고아 오브젝트 방지 (C6·C8 패턴 재사용)

```
업로드 실패 시:
  - R2 오브젝트 미생성 → 보상 불필요
  - 클라이언트에 에러 통지, uploadState='failed'

업로드 성공 + DB INSERT 실패 시:
  - Cloudflare Workflows 보상 스텝: R2 DELETE 자동 실행
  - step 순서: (1)R2 업로드 (2)dub_sessions INSERT
  - 역순 보상: (2) 실패 → (1) R2 DELETE

Whisper API 실패 시:
  - source_video_url 유지 (재시도 가능)
  - diarization_result_json은 NULL (미완성 결과 저장 금지)
```

---

## DataChannel 의존성

**구독:** 없음 (세션 생성 전, 개인 UI)
**발행:** 없음

> 세션 생성 완료 후 `dub_mode_open` broadcast는 RightPanel의 [DUB 모드 전환] 버튼 또는 DubRoleAssigner 진입 시 처리.

---

## Supabase 연동

| 엔드포인트 | 작업 | 시점 | RLS |
|---|---|---|---|
| `create-dub-upload` | 업로드 intent + short presigned URL 발급 | MP4 선택 시 | 호스트 검증 + quota/flag |
| `create-dub-session` | dub_sessions INSERT + source moderation 시작 | 업로드 완료 시 | 호스트만 (host_create_dub_session) |
| `start-dub-transcription` | STT/diarization 호출 | source moderation 통과 후 | 호스트 또는 system job |
| future YouTube import endpoint (P2 disabled) | YouTube → R2 다운로드 | 법무/SSRF gate 승인 전 호출 금지 | `DUB_YOUTUBE_ENABLED=false` |
| `delete-r2-object` | R2 오브젝트 삭제 (보상) | DB INSERT 실패 시 | service role only |
| Realtime: `dub_sessions` | UPDATE 구독 | whisper 결과 도착 감지 | room_id 필터 |

---

## 금지 사항 (MUST NOT)

- ❌ **비호스트의 세션 생성** — `userStore.isHost = true` 확인 필수 (RLS host_create_dub_session)
- ❌ **100MB 초과 파일 업로드** — 클라이언트 + Edge Function 이중 검증
- ❌ **MP4/WebM 외 파일 타입 허용** — `content_type` 화이트리스트
- ❌ **DB INSERT 실패 시 R2 오브젝트 방치** — 보상 트랜잭션으로 R2 DELETE 필수 (C6·C8)
- ❌ **Whisper API 실패 시 source_video_url 삭제** — 재시도를 위해 유지, `diarization_result_json`만 NULL
- ❌ **YouTube URL을 source_video_url에 직접 저장** — 반드시 R2 object_key 저장 (YouTube URL은 youtube_url 컬럼에만)
- ❌ **클라이언트에서 yt-dlp 직접 실행** — Edge Function/백엔드 전용 (법무·보안)
- ❌ **`DUB_YOUTUBE_ENABLED=false`에서 YouTube backend 호출** — P2 승인 전 API도 UI도 비활성
- ❌ **source moderation/rights_attestation 없이 READY 전이** — sampled frames + STT text moderation 통과 필요
- ❌ **동의 게이트 없이 세션 생성** — `consent_json.all_consented = true` 후에만 RECORDING 진입 (SecurityPolicies §11, DubRoleAssigner에서 처리)

---

## 컴포넌트 관계

```
[RightPanel] DUB 탭
  └─ [DubStatusTab]
      └─ [새 더빙 세션] 버튼 (HOST만)
          └─ [DubSessionSelector] (오버레이)
              │
              ├─ [SourceSelector]
              │  ├─ [MP4UploadButton]
              │  │  └─ file input → create-dub-upload → create-dub-session
              │  └─ [YouTubeUrlInput] (P2)
              │     └─ disabled until DUB_YOUTUBE_ENABLED + legal/SSRF gate
              │
              ├─ [UploadProgressBar]
              │  └─ dubStore.uploadProgress (0~100)
              │
              └─ [TranscriptionStatusBanner]
                 └─ "대본 추출 중..." → ready 시 onSessionCreated
                    → DubRoleAssigner로 전환
```

---

## 관련 문서

- `state-machines/DubSession.md` — IDLE → UPLOADING → UPLOADED → TRANSCRIBING → READY FSM
- `DATA-SCHEMA.md §1.12` — dub_sessions 테이블 (source_video_url, source_type, whisper_job_id, diarization_result_json)
- `specs/SecurityPolicies.md §11` — 녹화/DUB 동의 정책 (consent_json, G-39·G-43)
- `contracts/RightPanel.md` — DUB 탭 진입점 (DubStatusTab)
- `contracts/DubRoleAssigner.md` — 다음 단계 (역할 배정)
- `FEATURE-SPEC.md` — DUB-01 (MP4 업로드), DUB-01b (YouTube URL, P2), DUB-02 (STT + diarization)

---

## 한줄정리

DubSessionSelector는 더빙 세션 생성 UI로 MP4 업로드(R2 presigned URL) 또는 YouTube URL(P2, 법무 검토 필요)을 통해 영상 소스를 선택하고, 업로드 완료 후 Whisper API STT를 자동 호출하며, DB INSERT 실패 시 R2 DELETE 보상 트랜잭션으로 고아 오브젝트를 방지한다.
