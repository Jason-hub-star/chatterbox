---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- opencode: 2026-06-29 - DUB-04 DubRecorder 계약서 신규 작성 (더빙 녹음 + 타임라인 동기). Coded with OpenCode; high-cost model review recommended. -->

# DubRecorder

더빙 녹음 세션 UI. 원본 영상 재생과 참가자별 녹음을 동기화하고, 각 배우가 자신의 차례에 맞춰 녹음한다. `DubRoleAssigner` 완료 후 마운트.

> **상태머신**: `state-machines/DubSession.md` RECORDING 상태 담당.
> **스키마**: `DATA-SCHEMA.md §1.13 dub_tracks` (recording_url, recording_duration_ms, calibration_offset_ms, status).
> **참조**: `contracts/VgenPanel.md §3 DubbingRecorder` — 기존 더빙 녹화 컴포넌트. 본 계약서는 DUB-04 전용 명세를 확정하며 VgenPanel.md §3와 스펙을 일치시킨다.

---

## Props Interface

```typescript
interface DubRecorderProps {
  /**
   * dub_sessions.id
   */
  dubSessionId: string;

  /**
   * 현재 room_id
   */
  roomId: string;

  /**
   * 합성 시작 콜백
   * 모든 dub_tracks status='synced' 후 DubCompositor로 전환
   */
  onCompositingStart: () => void;

  /**
   * 이전 단계 (역할 재배정) 콜백
   */
  onRerecord?: () => void;

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
| `dubStore` | `activeSession` | ✓ | | 현재 세션 (source_video_url 포함) |
| `dubStore` | `tracks` | ✓ | ✓ | dub_tracks 배열 (status, recording_url) |
| `dubStore` | `recordingState` | ✓ | ✓ | 'idle' \| 'recording' \| 'submitted' \| 'synced' \| 'failed' |
| `dubStore` | `currentTrackId` | ✓ | ✓ | 현재 녹음 중인 dub_track ID |
| `dubStore` | `currentTimeMs` | ✓ | ✓ | 원본 영상 재생 위치 (ms) |
| `dubStore` | `startRecording()` | | ✓ | 내 트랙 녹음 시작 |
| `dubStore` | `stopRecording()` | | ✓ | 녹음 중지 + R2 업로드 |
| `dubStore` | `submitTrack()` | | ✓ | 녹음 완료 → status='submitted' |
| `stageStore` | `mode` | ✓ | | 'dub' 여부 확인 |
| `userStore` | `userId` | ✓ | | 본인에게 배정된 트랙 확인 |

**읽기 전용:** stageStore.mode, userStore.userId
**쓰기:** dubStore.recordingState, dubStore.currentTrackId, dubStore.currentTimeMs, dubStore.tracks

---

## 기능 명세

### 1. 메인뷰 레이아웃 (PLATFORM-ARCHITECTURE.md §4.5 `/dub/:dubSessionId`)

```
┌─────────────────────────────────────────────────────┐
│ DubRecorder (메인뷰 + 우패널)                       │
├──────────────────────┬──────────────────────────────┤
│ 좌패널: 역할 + 대본    │ 메인뷰: 원본 영상 + 타임라인  │
│                      │                              │
│ Speaker 1: 홍길동 ✓   │  ┌────────────────────┐      │
│ Speaker 2: 김영희 ⏳   │  │ [원본 영상 재생]    │      │
│ Speaker 3: 박철수 대기 │  │ (음성 음소거, 자막)  │      │
│                      │  └────────────────────┘      │
│ Speaker 1 대사:       │                              │
│ "안녕하세요, 오늘은..." │  [타임라인 진행바]           │
│                      │  ▓▓▓▓▓░░░░░░░░░░ 35%        │
│ Speaker 2 대사:       │                              │
│ "그래요, 정말..."     │  "내 차례입니다" 배너        │
│                      │  + 비프음 큐                 │
├──────────────────────┴──────────────────────────────┤
│ 우패널: 내 녹음                                      │
│                                                     │
│ 상태: "대기 중" / "녹음 중" / "완료 ✓"              │
│                                                     │
│ [● 녹음 시작]  [■ 중지]                              │
│                                                     │
│ [재생 프리뷰] (내가 녹음한 오디오)                   │
│ [타임셋 미세조정 슬라이더 ±200ms]                    │
├─────────────────────────────────────────────────────┤
│ 하단 바:                                             │
│ 2/3 명 완료 · [전체 재촬영] (HOST) · [합성 시작 ▶]   │
└─────────────────────────────────────────────────────┘
```

### 2. 원본 영상 재생 + 타임라인 동기

```typescript
// 원본 영상 재생 (음성 음소거, 자막으로만 표시)
function DubVideoPlayer({ sourceVideoUrl }: { sourceVideoUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;  // 원본 음성 음소거 (더빙으로 대체)
    video.play();

    // 타임라인 동기: currentTimeMs 갱신
    const interval = setInterval(() => {
      dubStore.setCurrentTimeMs(video.currentTime * 1000);
    }, 100);

    return () => clearInterval(interval);
  }, [sourceVideoUrl]);

  return <video ref={videoRef} src={sourceVideoUrl} muted loop />;
}
```

### 3. 내 차례 감지 + 녹음 자동 시작

```typescript
// 본인에게 배정된 dub_tracks 중 현재 시간에 해당하는 트랙 감지
function useMyActiveTrack(userId: string) {
  const currentTimeMs = useDubStore(s => s.currentTimeMs);
  const tracks = useDubStore(s => s.tracks);

  return tracks.find(t =>
    t.participant_id === userId &&
    t.start_time_ms <= currentTimeMs &&
    currentTimeMs <= t.end_time_ms
  );
}

// "내 차례입니다" 배너 + 비프음
function MyTurnBanner({ activeTrack }: { activeTrack?: DubTrack }) {
  if (!activeTrack) return null;
  
  useEffect(() => {
    // 비프음 재생 (내 차례 시작 알림)
    playBeep(880, 200);  // 880Hz, 200ms
  }, [activeTrack.id]);

  return <div className="my-turn-banner">📢 내 차례입니다</div>;
}
```

### 4. 녹음 로직 (VgenPanel.md §3 DubbingRecorder와 스펙 일치)

```typescript
async function startMyRecording(trackId: string) {
  dubStore.setRecordingState('recording');
  dubStore.setCurrentTrackId(trackId);

  // 배정된 참가자 본인의 마이크만 캡처 (다른 참가자 제외)
  const audioStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    },
  });

  // MediaRecorder (WebM)
  const mediaRecorder = new MediaRecorder(audioStream, {
    mimeType: 'video/webm;codecs=vp9,opus',
  });

  const chunks: Blob[] = [];
  mediaRecorder.addEventListener('dataavailable', async (e) => {
    chunks.push(e.data);
    await localBackupStore.persistChunk({
      dubSessionId,
      trackId,
      sequence: chunks.length,
      blob: e.data,
    });
  });

  mediaRecorder.addEventListener('stop', async () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    await uploadRecording(trackId, blob);
  });

  mediaRecorder.start(3000); // 3s chunks for local backup recovery
}

async function stopMyRecording() {
  // MediaRecorder 중지 + R2 업로드
  mediaRecorder.stop();
  dubStore.setRecordingState('submitted');
  await dubStore.submitTrack(dubStore.currentTrackId);
}
```

### 4.1 로컬 백업 녹화 (ROOM-23)

Riverside식 신뢰를 위해 네트워크 업로드와 별개로 참가자 로컬에 chunk를 임시 저장한다.

| 항목 | 규칙 |
|---|---|
| 저장소 | IndexedDB 또는 File System Access API (지원 시) |
| chunk 간격 | 3초 기본, 최대 10초 |
| 보관 | 업로드 성공 후 즉시 삭제, 실패 시 24시간 보관 |
| 복구 UI | 재입장 시 "미업로드 녹음 3개가 있어요" 배너 |
| 업로드 | `upload-recording-chunk` → `complete-recording-upload` Edge Function |

**MUST NOT**
- ❌ localStorage에 Blob 저장
- ❌ 사용자 동의 없는 로컬 백업 활성화
- ❌ 업로드 완료 후 로컬 chunk 무기한 보관

### 5. R2 업로드 + dub_tracks 갱신

```typescript
async function uploadRecording(trackId: string, blob: Blob) {
  const chunks = splitBlob(blob, 3 * 1024 * 1024);
  let resumeToken: string | undefined;
  for (const [sequence, chunk] of chunks.entries()) {
    const checksum = await sha256(chunk);
    const result = await supabase.functions.invoke('upload-recording-chunk', {
      body: { dub_track_id: trackId, sequence, checksum, chunk, resume_token: resumeToken },
    });
    resumeToken = result.data.resume_token;
  }

  await supabase.functions.invoke('complete-recording-upload', {
    body: { dub_track_id: trackId, chunk_count: chunks.length, final_checksum: await sha256(blob), idempotency_key },
  });

  // 호스트 확인 후 status='synced'로 승격 (별도 UI)
}
```

Direct `supabase.storage.upload()` is forbidden for DUB tracks. The Edge upload path enforces assigned participant, consent, chunk checksum, resume token, quota, and object prefix.

### 6. 타임셋 미세조정 (calibration_offset_ms)

```typescript
function TimingSlider({ track }: { track: DubTrack }) {
  const [offset, setOffset] = useState(track.calibration_offset_ms ?? 0);

  async function commitOffset() {
    await supabase
      .from('dub_tracks')
      .update({ calibration_offset_ms: offset })
      .eq('id', track.id);
    
    dubStore.updateTrack(track.id, { calibration_offset_ms: offset });
  }

  return (
    <div>
      <input
        type="range"
        min={-200}
        max={200}
        value={offset}
        onChange={(e) => setOffset(Number(e.target.value))}
        onMouseUp={commitOffset}
      />
      <span>{offset}ms</span>
    </div>
  );
}
```

---

## DataChannel 의존성

**구독 (수신):**

| Channel | 메시지 형식 | 용도 |
|---------|----------|------|
| `room-authority` (reliable) | `{ type: 'dub_mode_close' }` | DUB 모드 종료 알림 |

**발행 (송신):** 없음 (녹음은 개인 로컬 작업)

> 호스트가 [합성 시작] 클릭 시 `dub_mode_close` 발행 → 모든 참가자 마이크 unmute → DubCompositor로 전환.

---

## Supabase 연동

| 테이블/Storage | 작업 | 시점 | RLS |
|---|---|---|---|
| `dub_tracks` | SELECT (내 트랙 조회) | 마운트 시 | same-room users |
| `dub_tracks` | UPDATE (recording_url, status) | 녹음 완료 시 | assigned participant |
| `dub_tracks` | UPDATE (calibration_offset_ms) | 타임셋 조정 시 | host only |
| Storage: `dub-assets` | UPLOAD (WebM) | 녹음 완료 시 | assigned participant |
| Realtime: `dub_tracks` | UPDATE 구독 | 다른 참가자 완료 감지 | dub_session_id 필터 |

---

## 금지 사항 (MUST NOT)

- ❌ **다른 참가자의 마이크 믹싱** — `getUserMedia(audio)`는 본인 마이크만, DataChannel 원격 음성 제외
- ❌ **동시 다중 녹음** — 각 참가자는 자신의 트랙만, 다른 트랙 녹음 버튼 비활성화
- ❌ **미리보기 없이 저장** — [저장] 전 항상 audio element로 재생 확인 강제
- ❌ **원본 영상 음성 재생** — `video.muted = true` 필수 (더빙으로 대체)
- ❌ **녹음 중 브라우저 탭 전환** — 성능 저하로 오디오 끊김 (안내 문구 필수)
- ❌ **calibration_offset_ms ±200ms 범위 초과** — 슬라이더 min/max 제한
- ❌ **dub_tracks.recording_url에 공개 URL 저장** — R2 object key만, signed URL은 재생 시 발급
- ❌ **역할 잠금 상태에서 녹음** — `roles_locked_at ≠ null`은 정상 (녹음 중), 역할 변경만 금지

---

### onRerecord() — 전체 재촬영 플로우

호스트가 [전체 재촬영] 버튼을 클릭하면, 해당 세션의 모든 dub_tracks를 초기화한다.

```typescript
async function onRerecord() {
  // Step 1: 호스트 확인 모달
  const confirmed = await showConfirmDialog({
    title: '전체 재촬영',
    message: '모든 참가자의 녹음이 초기화됩니다. 계속하시겠습니까?',
    buttons: ['취소', '재촬영'],
  });
  
  if (!confirmed) return;
  
  // Step 2: 서버 API 호출
  const { error } = await supabase.functions.invoke('reset-dub-session', {
    body: { dub_session_id: dubSessionId },
  });
  
  if (error) {
    showToast('전체 재촬영 초기화에 실패했습니다', { type: 'error' });
    return;
  }
  
  // Step 3: 로컬 스토어 업데이트
  // 서버가 다음을 수행:
  // - 해당 dub_session의 모든 dub_tracks.status = 'assigned' 업데이트
  // - 모든 dub_tracks.recording_url = NULL 처리
  // - 모든 dub_tracks.recording_duration_ms = NULL 처리
  dubStore.resetSession(dubSessionId);
  
  // Step 4: 참가자 리셋 신호 브로드캐스트
  room.localParticipant.publishData(
    new TextEncoder().encode(JSON.stringify({
      type: 'dub_session_reset',
      dub_session_id: dubSessionId,
    })),
    { reliable: true },
    'room-authority'
  );
  
  // Step 5: UI 갱신
  // RoleListPanel: 모든 참가자 상태 → '대기' (assigned)
  // CompositingBar: [합성 시작] 버튼 비활성화 (synced 없음)
  showToast('모든 참가자의 녹음이 초기화되었습니다', { type: 'info' });
}
```

**MUST NOT**
- ❌ 부분 리셋 (일부만 상태 초기화) — 혼란 방지, 항상 전체 초기화
- ❌ 호스트 확인 모달 생략 — 실수 방지

## 컴포넌트 관계

```
[DubRoleAssigner] (역할 배정 + 동의 완료)
  └─ onRecordingStart()
     → [DubRecorder] 마운트
         │
         ├─ [DubVideoPlayer] (메인뷰)
         │  ├─ 원본 영상 재생 (muted, 자막)
         │  └─ dubStore.currentTimeMs 갱신 (100ms 간격)
         │
         ├─ [RoleListPanel] (좌패널)
         │  ├─ Speaker 1: 홍길동 ✓ (synced)
         │  ├─ Speaker 2: 김영희 ⏳ (recording)
         │  └─ Speaker 3: 박철수 대기 (assigned)
         │     └─ Realtime: dub_tracks.status 변경 감지
         │
         ├─ [MyTurnBanner]
         │  └─ 현재 시간이 내 트랙 구간 내 시 표시 + 비프음
         │
         ├─ [MyRecordingPanel] (우패널)
         │  ├─ [녹음 시작 ●] → getUserMedia + MediaRecorder
         │  ├─ [중지 ■] → R2 업로드 + dub_tracks UPDATE
         │  ├─ [재생 프리뷰] (내 녹음 오디오)
         │  └─ [TimingSlider] (±200ms 미세조정)
         │
         └─ [CompositingBar] (하단)
            ├─ 2/3 명 완료
            ├─ [전체 재촬영] (HOST) → onRerecord() 호스트 확인 모달
            │  → 모든 dub_tracks.status='assigned' UPDATE
            │  → recording_url/duration NULL 처리
            │  → room-authority 브로드캐스트
            │  → RoleListPanel 전원 '대기'로 갱신
            └─ [합성 시작 ▶] (HOST, 모든 synced 시 활성)
               → onCompositingStart() → [DubCompositor]로 전환
```

---

## 관련 문서

- `state-machines/DubSession.md` — RECORDING 상태 (dub_tracks.status: assigned → recording → submitted → synced)
- `DATA-SCHEMA.md §1.13` — dub_tracks 테이블 (recording_url, recording_duration_ms, calibration_offset_ms, status)
- `contracts/VgenPanel.md §3 DubbingRecorder` — 기존 더빙 녹화 컴포넌트 (스펙 일치)
- `contracts/DubRoleAssigner.md` — 이전 단계 (역할 배정)
- `contracts/DubCompositor.md` — 다음 단계 (합성)
- `FEATURE-SPEC.md` — DUB-04 (더빙 녹음 세션, 영상 재생 ↔ 내 파트 녹음 동기화)

---

## 한줄정리

DubRecorder는 원본 영상을 음소거 재생하면서 타임라인에 맞춰 각 배우가 자신의 차례에 녹음하고, MediaRecorder로 캡처한 WebM을 R2에 업로드하며, ±200ms 타임셋 미세조정과 호스트의 전체 재촬영·합성 시작 권한을 제공하는 더빙 녹음 UI다.
