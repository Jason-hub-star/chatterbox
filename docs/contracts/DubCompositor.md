---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- opencode: 2026-06-29 - DUB-05 DubCompositor 계약서 신규 작성 (최종 합성 + 다운로드). Coded with OpenCode; high-cost model review recommended. -->

# DubCompositor

더빙 완성본 합성 UI. 모든 dub_tracks가 녹음 완료(`synced`)되면 호스트가 합성을 시작하고, 진행바 표시 후 완성본을 다운로드할 수 있다. `DubRecorder` 완료 후 마운트.

> **상태머신**: `state-machines/DubSession.md` COMPOSITING → COMPLETED 전이 담당.
> **스키마**: `DATA-SCHEMA.md §1.14 dub_outputs` (output_object_key, output_video_url, status, file_size_bytes, duration_ms).
> **보존**: `specs/SecurityPolicies.md §11.4` — 보존기간 90일, pg_cron 자동 삭제.

> **스코프 확정 (2026-07-02, 주인님 결정):** DUB-05 코어 산출물은 **원본 영상 재더빙**(원본 비디오 유지 + 원본 대사 제거 stem + 더빙 오디오 mux)이다. **버튜버 아바타 오버레이 출력은 옵션/확장(P2)** — `dub_outputs`에 출력 종류를 열어두되(재더빙 vs 아바타 렌더) MVP는 재더빙만 구현한다. FEATURE-SPEC DUB-05의 "아바타 오버레이" 문구는 이 옵션을 가리킨다.

> **구현 상태 (2026-07-03, 슬라이스 3b — 음원분리 배경합류, 로컬 실증·배포 게이트):** G-280 구현 완료. Edge `separate-dub-audio`(호스트·소스 signed URL → fal.ai `fal-ai/demucs` → 비보컬 스템 5종[drums·bass·other·guitar·piano] URL 반환; **DB 무변경 순수 컴퓨트**·크레딧 보호 host gate·`FAL_KEY` 서버 시크릿). `DubCompositor.run()`은 합성 전 `separateDubAudio` 를 소스/녹음 URL 조회와 **병렬** 호출→비보컬 스템 다운로드→`mixAndMux(source, cues, background)` 로 amix(원본 vocals=원어 대사 드롭 → 이중음성 없음). **fal 실증**: mp4 직접 수용(status 200)·분리 품질 실측(원본 mix -19.5dB 음성이 vocals -19.6dB로, 톤이 other로 정확 분리)·$0.0007/초. **합성 실증**: 실 ffmpeg로 `mixAndMux` 배경필터(adelay+amix 비보컬 스템+더빙·`-map 0:v`) 재현 → 유효 mp4(h264 copy+aac). type-check·lint·build·docs:check·deno check PASS. **미완(배포 게이트)**: `supabase functions deploy separate-dub-audio` + `secrets set FAL_KEY` 후 라이브 브라우저 E2E. **defer(ponytail, G-284)**: 스템 Storage 캐시(재합성 재과금 방지)·2-stem/서버병합(대역폭 5×↓)·긴 클립 fal 큐/웹훅·노래 보컬 손실→AudioShake 승급.
>
> **구현 상태 (2026-07-02, 슬라이스 3a — 실 ffmpeg 브라우저 E2E 검증):** 무분리 재더빙 MVP 구현 완료. Edge 4: `create-dub-output-upload`(호스트·allSynced→dub_outputs compositing + 업로드 URL·세션 compositing 전이)·`submit-dub-output`(성공→ready+세션 completed / 실패(error_message)→failed+세션 recording 복귀)·`get-dub-output-url`(멤버 다운로드)·`get-dub-recordings`(합성용 녹음 일괄). `lib/ffmpeg.ts`(st 코어 CDN·`adelay`+`amix`·`-map 0:v` 원음 드롭·`-c:v copy`) + `DubCompositor.tsx`(게이트→합성→업로드→미리보기·다운로드). **dubStore 없이 로컬상태**(아래 Store 의존성 표는 향후 store 도입 시 참조 스펙). 서명 URL은 `get-dub-source-url` 패턴 재사용(범용 `create-signed-media-url` 대신 dub 전용 `get-dub-output-url` idiom). **COOP/COEP는 단일스레드 코어로 회피**(vite 변경 0). **헤드리스 Chrome E2E 10/10**(실 ffmpeg.wasm 믹스→완성본 mp4 ffprobe: h264 320x240 + aac·3.0s 원본길이 유지) + 통합테스트 20/20(403/409/실패복귀/completed/RLS/비멤버403). **defer(ponytail, G-284):** 3b 음원분리 stem 합류(G-280·FAL_KEY)·3c 아바타 오버레이·Realtime 진행구독(§4)·공유링크(§6)·오디오전용 소스·loudness 정규화·완료 후 새 더빙 리셋.

---

## Props Interface

```typescript
interface DubCompositorProps {
  /**
   * dub_sessions.id
   */
  dubSessionId: string;

  /**
   * 현재 room_id
   */
  roomId: string;

  /**
   * DUB 세션 종료 콜백
   * 다운로드 완료 또는 [DUB 종료] 클릭 시
   */
  onSessionClose: () => void;

  /**
   * 재녹음 콜백 (합성 실패 시)
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
| `dubStore` | `tracks` | ✓ | | dub_tracks 배열 (모든 synced 확인) |
| `dubStore` | `compositingState` | ✓ | ✓ | 'idle' \| 'compositing' \| 'completed' \| 'failed' |
| `dubStore` | `compositingProgress` | ✓ | ✓ | 0~100 (합성 진행률) |
| `dubStore` | `output` | ✓ | ✓ | dub_outputs 행 미러 (output_video_url) |
| `dubStore` | `startCompositing()` | | ✓ | 합성 시작 (Edge Function 호출) |
| `dubStore` | `closeSession()` | | ✓ | 세션 종료 (IDLE로 전이) |
| `stageStore` | `mode` | ✓ | ✓ | 'dub' → 'normal' 전환 (종료 시) |
| `userStore` | `isHost` | ✓ | | 호스트만 합성 시작·종료 권한 |

**읽기 전용:** dubStore.tracks, userStore.isHost
**쓰기:** dubStore.compositingState, dubStore.compositingProgress, dubStore.output, stageStore.mode

---

## 기능 명세

### 1. 합성 시작 게이트

모든 dub_tracks가 `synced` 상태여야 합성 시작 가능:

```typescript
const allSynced = dubStore.tracks.length > 0 &&
  dubStore.tracks.every(t => t.status === 'synced');

// [합성 시작] 버튼 활성화 조건
const canStartCompositing = allSynced && userStore.isHost && dubStore.compositingState === 'idle';
```

### 2. 합성 진행 UI

```
┌─────────────────────────────────────┐
│ DubCompositor                       │
│                                     │
│ [✕ 닫기]              (상단 우츠)    │
├─────────────────────────────────────┤
│ 🎬 최종 합성                         │
│                                     │
│ (대기 중)                            │
│ 모든 배우 녹음 완료 ✓                │
│ [합성 시작 ▶] (HOST만)              │
│                                     │
│ 또는 (합성 중)                       │
│ ⏳ 합성 진행 중...                   │
│ ▓▓▓▓▓▓▓▓░░░░░░ 55%                 │
│ 3~5분 소요 예상                     │
│                                     │
│ 또는 (완성)                          │
│ ✓ 합성 완료                          │
│ ┌────────────────────┐              │
│ │ [완성본 미리보기]    │              │
│ │ <video controls />  │              │
│ └────────────────────┘              │
│ [⬇ 다운로드] [🔗 공유 링크]          │
│                                     │
│ 보존기간: 90일 (2026-09-29 만료)    │
├─────────────────────────────────────┤
│ [재녹음] (HOST)  [DUB 종료] (HOST)  │
└─────────────────────────────────────┘
```

### 3. 합성 로직 (Edge Function)

```typescript
async function startCompositing() {
  dubStore.setCompositingState('compositing');
  dubStore.setCompositingProgress(0);

  // Edge Function 호출: 원본 영상(비디오) + 배경음/효과음 stem(원본 대사 제거) + 더빙 오디오 트랙 → 최종 영상
  const { data, error } = await supabase.functions.invoke('start-dub-compositing', {
    body: { dub_session_id: dubSessionId },
  });

  if (error) {
    dubStore.setCompositingState('failed');
    showToast('합성에 실패했습니다. 다시 시도해주세요.');
    return;
  }

  // 합성은 비동기: ffmpeg.wasm (클라이언트) 또는 LiveKit Egress (서버)
  // 진행률은 polling 또는 Realtime으로 추적
}
```

> **P0 (오푸스 2026-07-02, [[dub-audio-separation-anime]]):** 원본 오디오에는 원 대사(예: 애니 일본어)가 배경음·효과음과 **한 트랙에 섞여** 있다. 그대로 합성하면 원음과 더빙이 **이중음성**으로 들려 깨진다. 따라서 합성 전 **음원분리(원본 보컬 제거 → 배경음/효과음 stem 추출)** 단계가 필요하다(G-280). Supabase Edge 에선 못 돌리므로 fal.ai Demucs(시작·스택內)→AudioShake(대사특화 승급) 같은 외부 API로 처리. **최종 = 원본 비디오 + 분리한 배경음 stem + 더빙 오디오.** (STT 는 원본 믹스로 이미 완료 — 분리는 STT용이 아니라 이 출력용이다.)

**합성 방식 (PLATFORM-ARCHITECTURE.md §5.5):**

| 방식 | 지연 | 품질 | 비용 | 용도 |
|---|---|---|---|---|
| ffmpeg.wasm (클라이언트) | <1s | 중 (WebM VP9) | 무료 | 실시간 미리보기 |
| LiveKit Egress (서버) | 5~10s | 높음 (H.264) | 초당 비용 | 보관·재배포 |

> ponytail: P1은 ffmpeg.wasm 우선, 비용 절감. Egress는 P2.

### 4. 진행률 추적

```typescript
// Realtime: dub_outputs UPDATE 구독
useEffect(() => {
  const sub = supabase
    .channel(`dub-output:${dubSessionId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'dub_outputs', filter: `dub_session_id=eq.${dubSessionId}` },
      (payload) => {
        dubStore.setOutput(payload.new);
        if (payload.new.status === 'ready') {
          dubStore.setCompositingState('completed');
          dubStore.setCompositingProgress(100);
        } else if (payload.new.status === 'failed') {
          dubStore.setCompositingState('failed');
        }
      }
    )
    .subscribe();

  return () => sub.unsubscribe();
}, [dubSessionId]);
```

### 5. 완성본 다운로드

```typescript
async function downloadOutput() {
  if (!dubStore.output?.output_object_key) return;

  // R2 서명 URL 발급 (Edge Function)
  const { data, error } = await supabase.functions.invoke('create-signed-media-url', {
    body: { bucket: 'dub-assets', object_key: dubStore.output.output_object_key, expires_in: 3600 },
  });

  if (error) throw error;

  // 다운로드
  const a = document.createElement('a');
  a.href = data.signed_url;
  a.download = `dub-${dubSessionId}.mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
```

### 6. 공유 링크 발급

```typescript
async function generateShareLink() {
  // VgenExport.md §3 패턴 재사용
  const { data, error } = await supabase.functions.invoke('generate-share-link', {
    body: { dub_session_id: dubSessionId, expires_in: 604800 },  // 7일
  });

  if (error) throw error;

  await navigator.clipboard.writeText(data.share_url);
  showToast('공유 링크가 복사되었어요!');
}
```

### 7. 세션 종료

```typescript
async function closeSession() {
  // stageStore.mode = 'normal' 전환
  stageStore.setMode('normal');

  // LiveKit room-authority: dub_mode_close 발행
  // (RightPanel 또는 RoomView dispatcher 경유)

  // DubSession.md COMPLETED → IDLE 전이
  await dubStore.closeSession();

  // 보존기간 안내
  showToast(`더빙 완성본은 ${formatDate(retentionExpiresAt)}까지 보관됩니다`);

  onSessionClose();  // → RightPanel DUB 탭으로 복귀
}
```

---

## DataChannel 의존성

**구독 (수신):** 없음 (합성은 서버 작업, 결과는 Realtime으로 수신)

**발행 (송신):**

| Channel | 메시지 형식 | 용도 |
|---------|----------|------|
| `room-authority` (reliable) | `{ type: 'dub_mode_close' }` | 호스트가 세션 종료 시 모든 참가자에게 마이크 unmute 동기화 |

---

## Supabase 연동

| 엔드포인트/테이블 | 작업 | 시점 | RLS |
|---|---|---|---|
| `start-dub-compositing` (Edge Function) | 합성 시작 | [합성 시작] 클릭 시 | 호스트 검증 |
| `create-signed-media-url` (Edge Function) | R2 서명 URL 발급 | 미리보기/다운로드 시 | 참가자/호스트 visibility 검증 |
| `dub_outputs` | INSERT | 합성 시작 시 | host only |
| `dub_outputs` | UPDATE (status, output_video_url) | 합성 완료 시 | host only |
| `generate-share-link` (Edge Function, P2) | 공유 링크 발급 | 공유 시 | 호스트 + visibility/consent gate |
| Realtime: `dub_outputs` | UPDATE 구독 | 합성 진행·완료 감지 | dub_session_id 필터 |

---

## 금지 사항 (MUST NOT)

- ❌ **비호스트의 합성 시작** — `userStore.isHost = true` 확인 필수
- ❌ **모든 synced 아닌 상태에서 합성 시작** — `allSynced` 게이트 필수
- ❌ **Edge Function 밖에서 합성/공유 링크 생성** — quota/consent/visibility/audit gate 필수
- ❌ **dub_outputs.output_video_url에 공개 URL 저장** — R2 object_key만, signed URL은 재생 시 발급
- ❌ **보존기간 무제한** — `retention_expires_at = completed_at + 90일` 필수 (SecurityPolicies §11.4)
- ❌ **합성 실패 시 dub_tracks 삭제** — 재시도를 위해 유지, `onRerecord()`로 재녹음 가능
- ❌ **공유 링크를 localStorage에 저장** — 세션 내만, 7일 만료
- ❌ **클라이언트에서 R2 서명 URL 직접 생성** — Edge Function만 서명 발급 (VgenExport.md 패턴)

---

## 컴포넌트 관계

```
[DubRecorder] (모든 dub_tracks synced)
  └─ onCompositingStart()
     → [DubCompositor] 마운트
         │
         ├─ [CompositingGate]
         │  └─ allSynced && isHost → [합성 시작 ▶]
         │
         ├─ [CompositingProgressBar]
         │  └─ dubStore.compositingProgress (0~100)
         │     Realtime: dub_outputs.status 변경 감지
         │
         ├─ [OutputPreview] (완성 시)
         │  └─ <video src={signedUrl} controls />
         │
         ├─ [DownloadButton]
         │  └─ Edge Function create-signed-media-url → a.download
         │
         ├─ [ShareLinkButton]
         │  └─ Edge Function generate-share-link → clipboard
         │
         ├─ [RerecordButton] (HOST, 합성 실패 시)
         │  └─ onRerecord() → [DubRecorder]로 복귀
         │
         └─ [CloseSessionButton] (HOST)
            └─ dubStore.closeSession() + stageStore.mode='normal'
               + dub_mode_close 발행 → onSessionClose()
               → RightPanel DUB 탭으로 복귀
```

---

## 관련 문서

- `state-machines/DubSession.md` — COMPOSITING → COMPLETED 전이
- `DATA-SCHEMA.md §1.14` — dub_outputs 테이블 (output_object_key, output_video_url, status)
- `specs/SecurityPolicies.md §11.4` — 보존기간 90일, pg_cron 자동 삭제
- `contracts/DubRecorder.md` — 이전 단계 (녹음)
- `contracts/VgenExport.md` — 다운로드·공유 링크 패턴 (재사용)
- `FEATURE-SPEC.md` — DUB-05 (완성본 합성 — 원본 재더빙 코어 + 다운로드; 아바타 오버레이는 옵션)

---

## 한줄정리

DubCompositor는 모든 dub_tracks가 녹음 완료(synced)된 후 호스트가 합성을 시작하고, ffmpeg.wasm 또는 LiveKit Egress로 원본 비디오 + 배경음/효과음 stem(원본 대사 제거) + 더빙 오디오를 합성하여 진행바를 표시하며, 완성본을 R2 서명 URL로 다운로드·공유하고 90일 보존 후 자동 삭제되는 최종 합성 UI다.
