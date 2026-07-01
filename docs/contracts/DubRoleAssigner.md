---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- opencode: 2026-06-29 - DUB-03 DubRoleAssigner 계약서 신규 작성 (화자별 역할 배정 + H12 잠금). Coded with OpenCode; high-cost model review recommended. -->

# DubRoleAssigner

Whisper API diarization 결과를 바탕으로 화자별 역할을 참가자에게 배정하는 UI. 호스트가 수동 조정 가능하며, 녹음 시작 시 역할 잠금(H12)이 적용된다. `DubSessionSelector` 완료 후 마운트.

> **상태머신**: `state-machines/DubSession.md` READY 상태 담당 (역할 배정 → consent 게이트 → RECORDING 전이).
> **스키마**: `DATA-SCHEMA.md §1.12 dub_sessions` (role_version, roles_locked_at, roles_locked_by, consent_json) · `§1.13 dub_tracks` (speaker_name, participant_id, status).
> **H12 연동**: `RUNTIME-HARDENING-REVIEW.md H12` — 녹음 중 역할 수정 lock 전략.

---

## Props Interface

```typescript
interface DubRoleAssignerProps {
  /**
   * dub_sessions.id
   */
  dubSessionId: string;

  /**
   * 현재 room_id (참가자 목록 조회용)
   */
  roomId: string;

  /**
   * 역할 배정 완료 + 녹음 시작 콜백
   * consent_json.all_consented = true 후 DubRecorder로 전환
   */
  onRecordingStart: () => void;

  /**
   * 이전 단계로 돌아가기 콜백 (세션 재생성)
   */
  onBack?: () => void;

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
| `dubStore` | `activeSession` | ✓ | | 현재 세션 (diarization_result_json 포함) |
| `dubStore` | `tracks` | ✓ | ✓ | dub_tracks 배열 (speaker_name, participant_id, status) |
| `dubStore` | `roleVersion` | ✓ | ✓ | 역할 잠금 버전 (H12) |
| `dubStore` | `rolesLockedAt` | ✓ | ✓ | 잠금 시각 (null = 잠금 해제) |
| `dubStore` | `consentStatus` | ✓ | ✓ | { participants, allConsented } (SecurityPolicies §11) |
| `dubStore` | `assignRole()` | | ✓ | 화자 → 참가자 배정 |
| `dubStore` | `lockRoles()` | | ✓ | 역할 잠금 (녹음 시작 시) |
| `dubStore` | `requestConsent()` | | ✓ | 각 참가자에게 동의 요청 |
| `roomStore` | `participants` | ✓ | | 방 참가자 목록 (역할 배정 대상) |
| `userStore` | `isHost` | ✓ | | 호스트만 역할 배정·잠금 권한 |

**읽기 전용:** roomStore.participants, userStore.isHost
**쓰기:** dubStore.tracks, dubStore.roleVersion, dubStore.rolesLockedAt, dubStore.consentStatus

---

## 기능 명세

### 1. diarization 결과 미리보기

Whisper API 완료 후 `dubStore.activeSession.diarization_result_json`을 화자별 구간으로 표시:

```
┌─────────────────────────────────────┐
│ DubRoleAssigner                     │
│                                     │
│ [← 이전] [✕ 닫기]                   │
├─────────────────────────────────────┤
│ 📋 대본 분석 결과                   │
│                                     │
│ Speaker 1: 12개 구간, 2분 30초      │
│ "안녕하세요, 오늘은..."              │
│                                     │
│ Speaker 2: 8개 구간, 1분 45초       │
│ "그래요, 정말 흥미롭네요"            │
│                                     │
│ Speaker 3: 5개 구간, 55초           │
│ "동의합니다. 그런데..."              │
│                                     │
├─────────────────────────────────────┤
│ 🎭 역할 배정                         │
│                                     │
│ Speaker 1 → [참가자 선택 드롭다운]   │
│ Speaker 2 → [참가자 선택 드롭다운]   │
│ Speaker 3 → [참가자 선택 드롭다운]   │
│                                     │
├─────────────────────────────────────┤
│ 동의 수집 (consent 게이트)           │
│                                     │
│ ✓ 홍길동 (동의함)                    │
│ ⏳ 김영희 (대기 중)                  │
│ ✗ 박철수 (거절)                     │
│                                     │
│ [녹음 시작 ▶] (모두 동의 시 활성)    │
└─────────────────────────────────────┘
```

### 2. 역할 배정 로직

```typescript
async function assignRole(speakerName: string, participantId: string) {
  // H12: 녹음 중 역할 변경 금지
  if (dubStore.rolesLockedAt !== null) {
    throw new Error('녹음 중에는 역할을 변경할 수 없습니다');
  }

  // dub_tracks INSERT 또는 UPDATE
  const { error } = await supabase
    .from('dub_tracks')
    .upsert({
      dub_session_id: dubSessionId,
      speaker_name: speakerName,
      participant_id: participantId,
      status: 'assigned',
    }, { onConflict: 'dub_session_id,participant_id,speaker_name' });

  if (error) throw error;

  // dubStore 갱신
  dubStore.assignRole(speakerName, participantId);
}
```

**자동 추천 (초기 배정):**

```typescript
// diarization 결과를 바탕으로 화자 수만큼 참가자 자동 배정
function autoAssignRoles(speakers: string[], participants: Participant[]) {
  speakers.forEach((speaker, i) => {
    if (participants[i]) {
      assignRole(speaker, participants[i].user_id);
    }
  });
  // 호스트가 수동으로 조정 가능
}
```

### 3. 동의 수집 (consent 게이트, SecurityPolicies §11)

```typescript
async function requestConsent(participantId: string) {
  // 각 참가자에게 동의 요청 UI 표시 (DataChannel 또는 Realtime)
  const { error } = await supabase.functions.invoke('record-consent', {
    body: {
      dub_session_id: dubSessionId,
      user_id: participantId,
      consented: true,  // 클라이언트에서 동의 버튼 클릭 시
      consent_type: 'pre',
    },
  });

  if (error) throw error;

  // dubStore.consentStatus 갱신
  dubStore.requestConsent(participantId, true);
}

// 모든 참가자 동의 완료 시 [녹음 시작] 버튼 활성화
const allConsented = dubStore.consentStatus.allConsented;
```

### 4. 역할 잠금 (H12)

녹음 시작 시 역할 잠금:

```typescript
async function startRecording() {
  // consent 게이트 검증
  if (!dubStore.consentStatus.allConsented) {
    showToast('모든 참가자의 동의가 필요합니다');
    return;
  }

  // 역할 잠금
  await dubStore.lockRoles();  // role_version += 1, roles_locked_at = now()

  // DubSession.md READY → RECORDING 전이
  onRecordingStart();  // → DubRecorder로 전환
}
```

**H12 잠금 규칙 (P2: Script 수정 범위 명시):**

| 상황 | 동작 |
|---|---|
| 녹음 전 (rolesLockedAt = null) | 자유롭게 역할 배정·변경 가능; Script도 수정 가능 |
| 녹음 중 (rolesLockedAt ≠ null) | 역할 변경 금지, 에러 토스트; **Script 자체는 수정 가능하나, dub_tracks.speaker_name은 잠금 시점의 스냅샷을 사용하며 이후 Script 변경에 영향받지 않음** (예: 녹음 시작 시 "리온"으로 잠금된 화자는 Script에서 "리온"→"선우"로 수정해도 dub_track은 "리온"으로 유지 — `state-machines/Script.md §더빙(DUB) 중 Script 수정 정책` 참조) |
| 합성 실패 후 재녹음 | rolesLockedAt = null, role_version += 1, 실패한 dub_tracks만 'assigned'로 리셋 |
| 새 버전 강제 | 기존 녹음 무효, 일부 dub_tracks 'assigned'로 리셋 |

---

## DataChannel 의존성

**구독 (수신):**

| Channel | 메시지 형식 | 용도 |
|---------|----------|------|
| `room-authority` (reliable) | `{ type: 'dub_mode_open' }` | DUB 모드 진입 알림 (모든 참가자) |

**발행 (송신):**

| Channel | 메시지 형식 | 용도 |
|---------|----------|------|
| `room-authority` (reliable) | `{ type: 'dub_mode_open', action: 'start', dub_session_id }` | 호스트가 녹음 시작 시 모든 참가자에게 마이크 mute 동기화 |

---

## Supabase 연동

| 테이블/엔드포인트 | 작업 | 시점 | RLS |
|---|---|---|---|
| `dub_sessions` | SELECT (diarization_result_json) | 마운트 시 | same-room users |
| `dub_sessions` | UPDATE (role_version, roles_locked_at) | 녹음 시작 시 | creator or host (WITH CHECK, C10) |
| `dub_tracks` | UPSERT (participant_id, status) | 역할 배정 시 | host only |
| `record-consent` (Edge Function) | consent_json 갱신 | 동의 수집 시 | 본인만 |
| Realtime: `dub_tracks` | UPDATE 구독 | 역할 배정 변경 감지 | dub_session_id 필터 |
| Realtime: `dub_sessions` | UPDATE 구독 | consent_json 갱신 감지 | room_id 필터 |

---

## 금지 사항 (MUST NOT)

- ❌ **비호스트의 역할 배정** — `userStore.isHost = true` 확인 필수
- ❌ **녹음 중 역할 변경** — `rolesLockedAt ≠ null` 시 에러 (H12)
- ❌ **동의 없이 녹음 시작** — `consentStatus.allConsented = true` 게이트 필수 (SecurityPolicies §11)
- ❌ **dub_sessions.room_id 변조** — RLS WITH CHECK 절이 차단 (C10)
- ❌ **dub_tracks에 존재하지 않는 participant_id 배정** — FK 제약 + room 참가자 검증
- ❌ **자동 배정 후 수동 조정 생략** — 자동 배정은 초기값, 호스트 확인 후 잠금 권장

---

## 컴포넌트 관계

```
[DubSessionSelector] (업로드 + STT 완료)
  └─ onSessionCreated(dubSessionId)
     → [DubRoleAssigner] 마운트
         │
         ├─ [DiarizationPreview]
         │  └─ dubStore.activeSession.diarization_result_json
         │     → 화자별 구간 + 대사 미리보기
         │
         ├─ [RoleAssignmentList]
         │  ├─ Speaker 1 → [ParticipantDropdown]
         │  ├─ Speaker 2 → [ParticipantDropdown]
         │  └─ Speaker 3 → [ParticipantDropdown]
         │     └─ onChange: dubStore.assignRole()
         │
         ├─ [ConsentCollector]
         │  ├─ ✓ 홍길동 (동의함)
         │  ├─ ⏳ 김영희 (대기 중)
         │  └─ ✗ 박철수 (거절)
         │     └─ [동의] 버튼: dubStore.requestConsent()
         │
         └─ [StartRecordingButton]
            └─ enabled: allConsented
               └─ onClick: dubStore.lockRoles() → onRecordingStart()
                  → [DubRecorder]로 전환
```

---

## 관련 문서

- `state-machines/DubSession.md` — READY 상태 (역할 배정 + consent 게이트 + RECORDING 전이)
- `DATA-SCHEMA.md §1.12·§1.13` — dub_sessions (role_version, roles_locked_at, consent_json) · dub_tracks (speaker_name, participant_id)
- `specs/SecurityPolicies.md §11` — 동의 수집 프로토콜 (consent_json, all_consented 게이트)
- `RUNTIME-HARDENING-REVIEW.md H12` — 역할 잠금 정책
- `contracts/DubSessionSelector.md` — 이전 단계 (세션 생성)
- `contracts/DubRecorder.md` — 다음 단계 (녹음)
- `FEATURE-SPEC.md` — DUB-03 (역할별 대사 자동 분배 + 수동 조정)

---

## 한줄정리

DubRoleAssigner는 Whisper API diarization 결과를 화자별 구간으로 미리보기하고 호스트가 참가자에게 역할을 배정하며, 모든 참가자의 동의(consent_json.all_consented)를 게이트로 통과한 후 역할 잠금(H12, role_version 증가)과 함께 녹음을 시작하는 UI다.
