---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- 좌측 패널 콘텐츠 순서(대본→역할배정→모드→언어→큐→세션정보): DESIGN-DIRECTION.md §6.2 -->

# 3. ScriptPanel

호스트가 대사를 진행하고, 모든 참가자가 보는 스크립트 UI.

> **구현 상태 (2026-07-03, 기능 MVP — 2탭 실 LiveKit E2E 12/12):** 텔레프롬프터 코어 루프 구현. `features/script/{cues.ts(시드 대본),ScriptPanel.tsx}`·`useLiveKitRoom` `'script-cue'` **reliable DataChannel**(sendCue/onCue)·`RoomPage` 배선(cueIndex/myRole 로컬상태·`advanceCue`). 호스트가 cue 진행 → 전 참가자 동기·순서보존, **"내 차례"**=현재 cue 역할==내가 고른 역할. **as-built 차이(계약=forward 스펙):** DataChannel 토픽 `'script-cue'`(SSOT 정렬)·상태는 **로컬 state**(stageStore 아님)·호스트 판정 **클라 게이트 `mySlotIndex===0`**(서버 권한·`authority_epoch`/seq 순서 미적용)·cue 는 **코드 seed**(DB `scripts.cues_json`·`current_cue_index` 미저장)·단일 씬. **검증이 잡은 버그·수정:** reliable 채널 첫 publishData 유실(모든 세션 첫 진행 유실)→ 호스트가 연결/참가자입장 시 현재 cue **재브로드캐스트**(warm-up + 부분 sync-on-join). 수신측 방어: 다른 sceneId 무시 + cueIndex 범위 클램프. **(2026-07-06 SEC-5) 서버 릴레이 전환:** cue 진행은 이제 `advance-script-cue` Edge(host 서버검증 → LiveKit broadcast) 경유 — 클라 직접 `script-cue` publishData 폐기, 수신측은 **서버발(participant undefined)만 수락**(클라 직접발=진행권한 스푸핑 → 드롭). 호스트는 로컬 갱신 후 서버 echo 를 `handleCue`(`mySlotIndex===0`)로 무시. send-reaction 과 동형. G-286의 **'서버 권한'은 해소**. **여전히 defer(G-286):** DB 저장(seq/epoch)·대본 업로드/라이브러리(CNT-02/09)·씬 선택·역할 브로드캐스트·완전 sync-on-join. 아래 계약(stageStore·authority DataChannel·scripts 테이블·VersionHistory)은 Phase 2 forward 스펙.

## Props Interface

```typescript
interface ScriptPanelProps {
  /**
   * 현재 room의 ID (scripts 테이블 외키)
   */
  roomId: string;

  /**
   * 사용할 script의 ID (scripts 테이블 primary key)
   * 변경 시 Realtime 재구독
   */
  scriptId: string;

  /**
   * 호스트가 ScriptPanel을 열었는지 (UI 표시)
   */
  isOpen: boolean;

  /**
   * 닫기 콜백
   */
  onClose?: () => void;

  /**
   * 에러 콜백
   */
  onError?: (error: Error) => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `stageStore` | `scriptData` | ✓ | ✓ | scripts 테이블의 cues_json (파싱됨) |
| `stageStore` | `cueIndex` | ✓ | ✓ | 현재 cue 인덱스 (호스트만 쓰기) |
| `stageStore` | `cueState` | ✓ | | cue 상태 (active, paused, etc.) |
| `stageStore` | `language` | ✓ | | 표시 언어 (ko, ja, en) |
| `roomStore` | `hostId` | ✓ | | 호스트 ID (권한 검증) |
| `roomStore` | `connectionState` | ✓ | | 연결 상태 (room-authority 발행 가능 여부) |
| `participantStore` | 현재 사용자 role | ✓ | | 호스트=발행권, 배우=보기만 |

**읽기 전용:** 대부분
**쓰기:** stageStore.cue_index (호스트만), script_data (Realtime이 쓰됨)

## DataChannel 의존성

**구독 (수신):**

| Channel | 메시지 형식 | 용도 |
|---------|----------|------|
| `script-cue` (reliable, ordered) | `{cue_index, timestamp_ms}` | 모든 participant cue 동기화 |
| `room-authority` (reliable, ordered) | cue_advance type 메시지 | 호스트→호스트 자신 확인용 |

**script-cue 메시지:**
```json
{
  "cue_index": 5,
  "timestamp_ms": 1624561200000
}
```

**발행 (송신):**
- **호스트만:** "prev/next cue" 버튼 클릭 → script-cue (reliable) 발행
- 비호스트: 발행 불가 (RLS + 컴포넌트 검증)

## LiveKit 이벤트

| 이벤트 | 핸들러 | 작업 |
|--------|--------|------|
| `room.onDataChannelMessage()` | script-cue topic | cue_index 업데이트 (모든 참가자) |
| `participant.onConnectionStateChange()` | CONNECTED | 호스트 확인, room-authority 리스너 등록 |

## Supabase 접근

| 테이블/Storage | 작업 | RLS 정책 |
|---|---|---|
| `scripts` | cues_json, current_cue_index 조회 | 같은 room 사용자 읽기 |
| `scripts` (UPDATE) | 호스트만 current_cue_index, is_active 업데이트 | 호스트 확인 후 RLS 통과 |
| `Realtime: scripts` | UPDATE 구독 (cue_index 변경) | room_id + script_id 필터 |
| `Storage: /rooms/{room_id}/script.json` | 대본 초기 로드 | 서명된 URL (Realtime 백업) |

**쓰기 정책:**
- 호스트만: current_cue_index, is_active 업데이트
- cues_json은 업로드 이후 변경 불가 (history 관리는 별도 테이블)

## 금지 사항 (MUST NOT)

- ❌ 비호스트가 **cue_index 직접 업데이트** (조회만 가능)
- ❌ 클라가 `script-cue` 를 **직접 publishData** — 반드시 `advance-script-cue` Edge 경유(서버가 host 확정). 수신측은 **participant 가 존재하는(클라 직접발) script-cue 를 신뢰하지 않는다**(서버발=participant undefined 만 수락). *(SEC-5)*
- ❌ **unreliable 채널(blendshape)로 script-cue 발행** (순서 보장 필수, reliable만 허용)
- ❌ 개인 **스크롤 위치를 다른 참가자에게 강제** (각자 독립적 스크롤)
- ❌ scripts 테이블 **직접 수정** 없이 UI만 조작 (모든 쓰기는 호스트 권한 검증 필요)
- ❌ localStorage에 script 상태 캐싱 (source of truth는 Supabase + Realtime)
- ❌ cue 진행 중 **언어 변경** (cue_index 초기화 위험)

---

## G-63 — 조건부 렌더링 (스크립트 vs 즉흥 모드)

**조건:**
- **script_id ≠ null:** ScriptPanel 렌더 (본 명세)
- **script_id === null:** ImpromptuModePanel 렌더 (RoomView.md §G-63 참조)

**배경:** ROOM-06 대본은 P1 기능이므로 MVP에서 script_id가 없을 수 있음. 왼쪽 패널을 비워두지 않기 위해 즉흥 모드 대체 UI 제공.

```typescript
if (script_id && script_id !== null) {
  return <ScriptPanel script_id={script_id} ... />;
} else {
  return <ImpromptuModePanel />;
}
```

---

## 컴포넌트 관계

```
[RoomView]
  ├─ if (script_id ≠ null)
  │  └─ [ScriptPanel] (호스트만 열기 가능)
  │      ├─ subscribe script-cue (DataChannel)
  │      ├─ subscribe scripts (Realtime, UPDATE)
  │      ├─ read stageStore.cue_index
  │      ├─ write stageStore.cue_index (호스트 버튼 클릭)
  │      └─ render cues + highlight character_role
  │          └─ [ParticipantSlot] 대사 하이라이트 (character_role 매칭)
  │
  └─ else (if script_id === null) — G-63
     └─ [ImpromptuModePanel]
         ├─ display "🎭 대본 없이 즉흥 연기 중"
         ├─ quick reaction buttons (박수, 웃음, 놀람, 슬픔, 분노)
         └─ "오늘의 즉흥 주제 카드" (새로고침 가능)

---

## G-104 — 버전 히스토리 (Version History)

호스트가 대본의 과거 버전을 열람하고 원하는 버전으로 롤백할 수 있는 기능.

### VersionHistoryPanel 컴포넌트

**Props Interface:**
```typescript
interface VersionHistoryPanelProps {
  /**
   * 현재 script의 ID
   */
  scriptId: string;

  /**
   * 버전 목록 조회 후 클라이언트 렌더
   */
  versions: Array<{
    id: string;          // script_versions.id
    version_num: number; // 1, 2, 3, ...
    created_by: string;  // user.display_name
    created_at: string;  // ISO 8601
    cue_count: number;   // 해당 버전의 대사 라인 수
  }>;

  /**
   * 버전 선택 시 콜백 (미리보기 로드)
   */
  onSelectVersion?: (versionId: string) => void;

  /**
   * 롤백 요청 콜백 (확인 다이얼로그 후 호출)
   */
  onRollback?: (versionId: string) => void;

  isLoading?: boolean;
  error?: Error;
}
```

**UI 레이아웃:**
```
┌─────────────────────────────────┐
│ 버전 히스토리                      │ [✕ 닫기]
├─────────────────────────────────┤
│ 1. 현재 버전 (최신)               │
│    ○ 작성자: Jason               │
│    ○ 작성일: 2026-06-30 10:00   │
│    ○ 대사: 5줄                   │
│    [미리보기] [롤백] (비활성)     │
├─────────────────────────────────┤
│ 2. 이전 버전                      │
│    ○ 작성자: Alice               │
│    ○ 작성일: 2026-06-30 08:30   │
│    ○ 대사: 4줄                   │
│    [미리보기] [롤백]              │
├─────────────────────────────────┤
│ 3. 더 이전 버전                   │
│    ○ 작성자: Jason               │
│    ○ 작성일: 2026-06-29 15:00   │
│    ○ 대사: 3줄                   │
│    [미리보기] [롤백]              │
└─────────────────────────────────┘
```

**동작:**

1. **버전 선택 (미리보기):**
   - [미리보기] 클릭 → `onSelectVersion(versionId)` 호출
   - 모달 우측에 대사 내용 미리보기 (스크롤 가능, 읽기만)
   - 추가 정보: "이 버전으로 변경하시겠습니까?" 메시지

2. **롤백 확인:**
   - [롤백] 클릭 → 확인 다이얼로그 표시:
     ```
     "버전 2 (2026-06-30 08:30)로 되돌리시겠습니까?
      현재 대본이 덮어씌워집니다."
     [취소] [롤백 확인]
     ```
   - 롤백 확인 → `onRollback(versionId)` 호출
   - 백엔드: scripts.cues_json UPDATE (새 version_num 생성, script_versions에 새 행 INSERT)
   - UI: "버전 2로 롤백되었습니다" 토스트 + 버전 히스토리 패널 자동 닫기

3. **현재 버전:**
   - 가장 위에 "현재 버전 (최신)" 배지 표시
   - [미리보기] 버튼만 활성 (롤백 버튼 비활성)

**Supabase 접근:**

| 테이블 | 작업 | RLS 정책 |
|--------|------|---------|
| `script_versions` | SELECT 전체 버전 목록 | 같은 room 사용자 읽기 (room_id 검증) |
| `scripts` | current_cue_index, cues_json 업데이트 (롤백) | 호스트만 쓰기 |

**쿼리 예시:**
```typescript
// 버전 목록 조회
const { data: versions } = await supabase
  .from('script_versions')
  .select(`
    id, version_num, created_at, cue_count,
    users!created_by(display_name)
  `)
  .eq('script_id', scriptId)
  .order('version_num', { ascending: false })
  .limit(20);

// 롤백
const { error } = await supabase.rpc(
  'rollback_script_version',
  { script_id: scriptId, target_version_id: versionId }
);
```
```
