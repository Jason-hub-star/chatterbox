---
tags: [fsm]
---

<!-- state-machines/_INDEX.md 참조: 추가 절차 -->
<!-- opencode: 2026-06-29 - C6·G-15 DubSession 상태머신 신규 작성 (UPLOADING→TRANSCRIBING 실패 롤백 + consent 게이트). Coded with OpenCode; high-cost model review recommended. -->

# 4. DubSession State Machine

> **기능**: DUB-01~05 더빙 세션 생명주기 (업로드 → STT → 역할배정 → 녹음 → 합성)
> **스키마**: `DATA-SCHEMA.md §1.12 dub_sessions` · `§1.13 dub_tracks` · `§1.14 dub_outputs`
> **동의**: `DATA-SCHEMA.md §1.12 dub_sessions.consent_json` (녹화/DUB 동의, G-39·G-43) · `SecurityPolicies.md §2.2` (RLS 정책)

## State Diagram

```
                  ┌────────────────┐
                  │     IDLE       │
                  │ (mode!='dub')  │
                  └────────┬───────┘
                           │ 호스트: 영상 업로드 시작
                           │ stageStore.mode='dub'
                           ▼
                  ┌────────────────┐
                  │   UPLOADING    │
                  │ (MP4/R2 또는   │
                  │  YouTube URL)  │
                  └────────┬───────┘
                           │ 업로드 성공
                           ▼
                  ┌────────────────┐
       ┌──────────│   UPLOADED     │
       │          │ (source_video  │
       │          │  _url 확정)    │
       │          └────────┬───────┘
       │                   │ 호스트: [STT 시작]
       │                   ▼
       │          ┌────────────────┐
       │          │ TRANSCRIBING   │──fail──┐
       │          │ (Whisper API,  │        │
       │          │  diarization)  │        │
       │          └────────┬───────┘        │
       │                   │                ▼
       │     retry ≤2      │ pass     ┌──────────┐
       └────────────────────┤          │  FAILED  │
                            ▼          └──────────┘
                  ┌────────────────┐        ▲
                  │     READY      │        │
                  │ (diarization   │        │ 합성 실패
                  │  _result_json  │        │
                  │  확정, 역할    │        │
                  │  배정 가능)     │        │
                  └────────┬───────┘        │
                           │ consent 게이트 │
                           │ (§11)          │
                           ▼                │
                  ┌────────────────┐        │
                  │   RECORDING    │        │
                  │ (참가자별 더빙 │        │
                  │  녹음, R2 업로드)│       │
                  └────────┬───────┘        │
                           │ 모든 dub_tracks│
                           │ status='synced'│
                           ▼                │
                  ┌────────────────┐        │
                  │  COMPOSITING   │────────┘
                  │ (ffmpeg.wasm   │
                  │  또는 Egress)  │
                  └────────┬───────┘
                           │ 합성 성공
                           ▼
                  ┌────────────────┐
                  │   COMPLETED    │
                  │ (dub_outputs   │
                  │  .output_video │
                  │  _url 확정)    │
                  └────────────────┘
```

> **주의 (오푸스 2026-07-02, [[dub-stt-provider-decision]]):** `whisper-1` 은 화자분리(diarization)를 **하지 못한다** — 시간순 segments(텍스트+타임코드)만 낸다. `diarization_result_json` 은 이름과 달리 speaker 필드가 없고, **화자→참가자 배정은 DubRoleAssigner 에서 호스트가 수동으로** 한다. 자동 화자분리가 필요하면 diarization 지원 provider(`gpt-4o-transcribe-diarize`·AssemblyAI·Deepgram, G-269)로 승급한다. 또 우리 더빙은 사람이 재녹음하므로 **segment 단위 타임스탬프면 충분**(word-level 불필요).

## State Transitions

| From | To | Trigger | Source | Notes |
|------|-----|---------|--------|-------|
| IDLE | UPLOADING | 호스트가 영상 소스 선택 후 업로드 시작 | `dubStore.startUpload(source_type, url)` | MP4: R2 업로드, YouTube: yt-dlp 백엔드 (P2) |
| UPLOADING | UPLOADED | 업로드 성공 | `dubStore.onUploadSuccess(source_video_url)` | `dub_sessions.source_video_url` 확정, `status='uploaded'` |
| UPLOADING | FAILED | 업로드 실패 (네트워크, 파일 크기 초과) | `dubStore.onUploadError(reason)` | R2 고아 오브젝트 방지: 업로드 실패 시 R2 DELETE (Vgen.md C8 패턴 재사용) |
| UPLOADED | TRANSCRIBING | 호스트가 [STT 시작] 클릭 | `dubStore.startTranscription()` | Whisper API 호출, `status='transcribing'`, `whisper_job_id` 저장 |
| UPLOADED | READY | **무대사 소스** (자동감지 또는 호스트 [대사 없음]) | `dubStore.skipTranscription()` | STT/음원분리 스킵. `diarization_result_json={segments:[]}`, `status='ready'` (Edge case 9·G-282) |
| TRANSCRIBING | READY | Whisper STT 완료 (segments만, **화자분리 없음**) | `dubStore.onTranscriptionSuccess(diarization_result_json)` | `diarization_result_json` 저장(speaker 필드 없음), `status='ready'` |
| TRANSCRIBING | FAILED | Whisper API 에러/타임아웃 (>120s) | `dubStore.onTranscriptionError(reason)` | **롤백 정책 (C6)**: `status='failed'`, `error_message` 저장, `source_video_url`은 유지 (재시도 가능) |
| TRANSCRIBING | UPLOADED | 호스트가 [재시도] 클릭 (retry < 2) | `dubStore.retryTranscription()` | `status='uploaded'`로 복귀 후 다시 TRANSCRIBING 진입. 3회 초과 시 FAILED 고정 |
| READY | RECORDING | 모든 참가자 동의 + 호스트가 [녹음 시작] | `dubStore.startRecording()` | **consent 게이트 (§11)**: `consent_json.all_consented = true` 여야만 전이 가능. `roles_locked_at = now()`, `role_version += 1` |
| RECORDING | RECORDING | 참가자가 자신의 dub_track 녹음 완료 | `dubStore.onTrackSubmitted(track_id)` | `dub_tracks.status='submitted'` → 호스트 확인 후 `'synced'` |
| RECORDING | COMPOSITING | 모든 dub_tracks `status='synced'` + 호스트 [합성 시작] | `dubStore.startCompositing()` | ffmpeg.wasm (클라이언트) 또는 LiveKit Egress (서버) |
| COMPOSITING | COMPLETED | 합성 성공 | `dubStore.onCompositingSuccess(output_video_url)` | `dub_outputs.output_video_url` 확정, `status='completed'`, `completed_at=now()` |
| COMPOSITING | FAILED | 합성 실패 (ffmpeg 에러, Egress 타임아웃) | `dubStore.onCompositingError(reason)` | `status='failed'`, dub_tracks는 유지 (재시도 가능) |
| COMPOSITING | RECORDING | 호스트가 [재녹음] 클릭 | `dubStore.retryRecording()` | `roles_locked_at = NULL`, `role_version += 1`, 일부 dub_tracks `status='assigned'`로 리셋 |
| any | IDLE | 호스트가 DUB 모드 종료 / 방 종료 | `stageStore.mode='normal'` 또는 `rooms.status='ended'` | 진행 중인 세션은 `status='failed'`로 저장 (데이터 보존) |
| COMPLETED | IDLE | 호스트가 [DUB 종료] 또는 다운로드 완료 | `dubStore.closeSession()` | dub_sessions/dub_tracks/dub_outputs은 보존기간(retention_expires_at)까지 유지 (P2: consent_json 보존) |
| any (RECORDING/COMPOSITING/COMPLETED) | IDLE | 호스트가 DUB 모드 종료 (stageStore.mode='normal') | `stageStore.mode='normal'` 또는 `rooms.status='ended'` | 진행 중인 세션은 `status='failed'`로 저장; **consent_json과 dub_tracks는 보존됨** (재진입 시 이어서 사용 가능) |

## Edge Cases

### 1. 업로드 실패 시 R2 고아 오브젝트 방지 (C8 패턴 재사용)

```
1. MP4 업로드: 클라이언트 → R2 presigned URL → 업로드
2. 업로드 성공 + DB INSERT 실패 시:
   - Cloudflare Workflows 보상 스텝: R2 DELETE 자동 실행
   - step 순서: (1)R2 업로드 (2)dub_sessions INSERT
   - 역순 보상: (2) 실패 → (1) R2 DELETE
3. 업로드 실패 시:
   - R2 오브젝트 미생생 → 보상 불필요
   - 클라이언트에 에러 통지, UPLOADING → FAILED
```

### 2. Whisper API 타임아웃/실패 롤백 (C6 핵심)

```
1. TRANSCRIBING 상태에서 Whisper API 호출
2. 타임아웃 (>120s) 또는 API 에러 발생:
   - status='failed', error_message='whisper_timeout' 또는 'whisper_api_error'
   - source_video_url은 유지 (재시도 가능)
   - diarization_result_json은 NULL (미완성 결과 저장 금지)
3. 재시도 정책:
   - retry_count < 2: UPLOADED로 복귀 후 다시 TRANSCRIBING 진입
   - retry_count >= 2: FAILED 고정, "지원팀에 문의" 안내
4. 자동 타임아웃 (pg_cron, 5분 주기):
   - status='transcribing' AND updated_at < now() - 120s
   - → status='failed', error_message='auto_timeout'
   - source_video_url 유지
```

### 3. 동의 게이트 (consent gate, G-43)

```
1. READY 상태에서 호스트가 [녹음 시작] 클릭
2. consent_json.all_consented 검증:
   - false: "모든 참가자의 동의가 필요합니다" 토스트, RECORDING 진입 불가
   - true: RECORDING 전이, roles_locked_at = now()
3. 녹음 중 참가자 퇴장 시:
   - 해당 참가자의 dub_tracks는 status='assigned'로 리셋
   - 호스트에게 "참가자 X 이탈, 역할 재배정 필요" 알림
   - all_consented 자동 갱신 (퇴장자 제외)
```

### 4. 역할 잠금 (H12)

```
1. RECORDING 진입 시 roles_locked_at = now(), role_version += 1
2. 녹음 중 역할 수정 시도:
   - 호스트: "녹음 중 역할 변경 불가" 에러
   - 새 version 강제: 기존 녹음 무효, 일부 dub_tracks 'assigned'로 리셋
3. COMPOSITING 실패 후 재녹음:
   - roles_locked_at = NULL (잠금 해제)
   - role_version += 1 (새 버전)
   - 일부 dub_tracks status='assigned'로 리셋 (status IN ('assigned','submitted')만 대상, 'synced' 트랙은 보존 — 정확한 규칙은 Edge case 8 참조)
```

### 5. 합성 실패 시 복구

```
1. COMPOSITING 실패 (ffmpeg.wasm 에러, Egress 타임아웃)
2. status='failed', error_message 저장
3. dub_tracks는 유지 (재시도 가능)
4. 호스트 선택지:
   - [합성 재시도]: COMPOSITING 재진입 (dub_tracks 변경 없음)
   - [재녹음]: RECORDING으로 복귀, 일부 dub_tracks 리셋
   - [DUB 종료]: IDLE로 복귀, 데이터 보존
```

### 6. YouTube 소스 처리 (P2)

```
1. source_type='youtube', youtube_url 입력
2. 백엔드 (yt-dlp)에서 MP4 다운로드 → R2 업로드
3. source_video_url = R2 URL (YouTube URL 직접 사용 금지)
4. ⚠️ 법무 검토 필요 (ToS 위반 가능성, SCOUT.md 참조)
```

### 7. 동시 더빙 세션 충돌

```
1. 같은 방에서 2개 이상 dub_sessions 생성 시도
2. 호스트만 생성 가능 (RLS host_create_dub_session)
3. 동시 생성 시: UNIQUE 제약 없음 (여러 세션 허용)
4. 단, stageStore.mode='dub'는 1개 세션만 활성
   - 활성 세션 종료 후 다음 세션 진입
```

### 8. 참가자 퇴장(G-97) 시 dub_tracks 리셋 규칙 (P0 경쟁 조건)

```
상황: 녹음 중 참가자가 다중 기기 접속으로 인해 room_participants.state='left' 전환
→ DubSession이 해당 참가자의 dub_tracks를 리셋할 때, 이미 완료된 'synced' 상태 트랙까지 
  리셋될 위험 발생

규칙 (필수):
1. dub_tracks 리셋은 status='assigned' 이하인 트랙에만 적용
   - status='assigned' → 'assigned' (초기화, 다시 녹음 필요)
   - status='submitted' → 'assigned' (복구, 재녹음 필요)
   - status='synced' → (리셋하지 않음) ← **중요: 완료된 트랙은 보존**

2. 구현 시 dub_tracks UPDATE 쿼리:
   ```sql
   UPDATE dub_tracks 
   SET status='assigned' 
   WHERE dub_session_id=? 
     AND participant_id=? 
     AND status IN ('assigned', 'submitted')  -- 'synced' 제외
   ```

3. 컴포넌트 (DubRecorder): 
   - 참가자 LEFT 감지 시 `dubStore.resetTracksForParticipant(participantId, {
       excludeStatus: ['synced']
     })`
   - Supabase Realtime `room_participants` DELETE 이벤트 수신 후 처리
```

### 9. 무대사 소스 (STT/음원분리 스킵, [[dub-audio-separation-anime]])

```
1. 소스에 제거·추출할 대사가 없으면(무음·BGM만·무대사 클립) STT/음원분리 불필요.
2. 대사유무 판정 (택1, G-282 결정 대기):
   - 자동: Whisper no_speech_prob 또는 사전 VAD 로 "대사 없음" 감지
   - 수동: 호스트가 [대사 없음] 토글
3. 무대사면 UPLOADED → READY 직행 (TRANSCRIBING 스킵), diarization_result_json = {segments: []}.
   원본에 제거할 대사가 없으니 합성 시 음원분리(G-280)도 스킵 — 원본 오디오를 배경으로 그대로 사용.
4. 참가자는 자유 보이스오버(자동 구간배정 없음) 또는 호스트가 수동 구간 추가.
5. 효과: Whisper·분리 비용 0, 파이프라인 단축.

주의: VGEN 쇼츠(AI 생성·무대사)는 애초에 DUB 이 아니라 VGEN 기능 — 이 FSM 에 진입하지 않는다.
```

## Implementation Hints

- **Zustand store**: `dubStore` (sessions[], activeSession, recordingState, compositingState, roleVersion, consentStatus)
  - Actions: `startUpload()`, `onUploadSuccess()`, `startTranscription()`, `onTranscriptionSuccess()`, `retryTranscription()`, `startRecording()`, `onTrackSubmitted()`, `startCompositing()`, `onCompositingSuccess()`, `retryRecording()`, `closeSession()`

- **Event sources**:
  - `stageStore.mode`: 'normal' | 'vgen' | 'dub' (drives IDLE ↔ UPLOADING)
  - `room-authority` messages: `dub_mode_open`, `dub_mode_close` (VgenPanel.md 참조)
  - Supabase `dub_sessions` table: INSERT/UPDATE status
  - Supabase `dub_tracks` table: UPDATE recording_url, status
  - Supabase `dub_outputs` table: UPDATE output_video_url, status
  - Whisper API webhook or polling (TRANSCRIBING 상태)

- **Side effects**:
  - UPLOADING: R2 presigned URL 발급 (Edge Function), 업로드 진행률 표시
  - TRANSCRIBING: Whisper API 비동기 호출, 진행 배너 "대본 추출 중..."
  - READY: STT segments 미리보기, 역할 배정 UI 활성 (화자는 호스트 수동 배정)
  - RECORDING: roles_locked_at 설정, 참가자별 녹음 UI 활성, LiveKit 마이크 캡처
  - COMPOSITING: 진행바 표시, ffmpeg.wasm 또는 Egress 호출
  - COMPLETED: 다운로드 버튼 활성, 보존기간 안내

- **Consent 게이트 (SecurityPolicies §11)**:
  - READY → RECORDING 전이 전 `consent_json.all_consented` 검증
  - 동의 미완료 시 RECORDING 진입 차단 + 누락 참가자 목록 표시
  - 동의 수집 UI: 각 참가자에게 [동의] 버튼, 호스트는 진행 상황 모니터링

- **롤백 정책 (C6)**:
  - TRANSCRIBING 실패 시 `status='failed'` + `source_video_url` 유지
  - `diarization_result_json`은 성공 시에만 저장 (미완성 결과 금지)
  - 자동 타임아웃: pg_cron이 5분 주기로 `status='transcribing' AND updated_at < now()-120s` 스캔 → `status='failed'`

## Related Documents

- `DATA-SCHEMA.md §1.12~1.14` — dub_sessions, dub_tracks, dub_outputs 스키마
- `specs/SecurityPolicies.md §11` — 녹화/DUB 동의 정책 (G-39·G-43)
- `contracts/VgenPanel.md §3 DubbingRecorder` — 더빙 녹화 컴포넌트
- `contracts/RightPanel.md` — DUB 탭 진입점
- `RUNTIME-HARDENING-REVIEW.md H12` — 역할 잠금 정책
- `FEATURE-SPEC.md DUB-01~05` — 더빙 기능 명세

## 한줄정리

DubSession 상태머신은 IDLE→UPLOADING→UPLOADED→TRANSCRIBING→READY→RECORDING→COMPOSITING→COMPLETED의 8상태 생명주기를 정의하며, Whisper API 실패 시 source_video_url을 유지한 채 재시도 가능한 롤백(C6), 모든 참가자 동의 완료 시에만 녹음 시작하는 consent 게이트(G-43), 녹음 중 역할 변경 방지 잠금(H12)을 강제한다.
