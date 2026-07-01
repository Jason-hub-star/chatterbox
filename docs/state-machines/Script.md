---
tags: [fsm]
---

<!-- state-machines/_INDEX.md 참조: 추가 절차 -->

# 4. Script Cue State Machine

## State Diagram

```
┌──────┐
│ IDLE │ (no script uploaded)
└───┬──┘
    │ host uploads script file (JSON)
    ▼
┌────────┐
│ LOADED │ (cues array in memory, ready to display in UI)
└───┬────┘
    │ host clicks "cue 1" / navigates to first cue
    ▼
┌────────────┐     (particular scene/line highlighted)
│ CUE_ACTIVE │     (on all clients' UI via Realtime sync)
└────┬───────┘
     │ host clicks "next cue" or ▼ arrow
     │ → broadcast via DataChannel (reliable)
     │ → all clients jump to cue_index += 1
     ▼
┌──────────┐
│ SYNCING  │ (brief transitional state)
└────┬─────┘
     │ local cue_index updated
     ▼
┌────────────┐
│ CUE_ACTIVE │ (new cue displayed)
└────┬───────┘
     │
     └─── (repeat until last cue) ───┐
                                      ▼
                                   ┌───────┐
                                   │ ENDED │
                                   └───────┘
```

## State Transitions

| From | To | Trigger | Source | Notes |
|------|-----|---------|--------|-------|
| IDLE | LOADED | Host selects script file in settings | `stageStore.uploadScript(file)` | Saved to Supabase Storage; cues indexed |
| LOADED | CUE_ACTIVE | Host clicks "cue 1" or "play" | `stageStore.setCueIndex(0)` | UI updates; cue text displayed |
| CUE_ACTIVE | SYNCING | Host clicks "next cue" → button broadcast | `stageStore.nextCue()` → DataChannel send | Reliable, ordered channel |
| SYNCING | CUE_ACTIVE | All clients receive cue_index update | DataChannel `on('script-cue-update')` | ~20ms latency |
| CUE_ACTIVE | SYNCING | Host clicks "prev cue" | `stageStore.prevCue()` | Same DataChannel path |
| CUE_ACTIVE | ENDED | Host clicks "next cue" on last cue | `stageStore.nextCue()` at `cue_index == length - 1` | Script cycle complete |
| ENDED | CUE_ACTIVE | Host clicks "restart script" | `stageStore.setCueIndex(0)` | Reset to start |
| CUE_ACTIVE | IDLE | Host unloads script | `stageStore.clearScript()` | UI clears; memory freed |

## Role-Based Behavior

| Role | Permissions |
|------|-------------|
| **Host** | Create/delete cues; trigger next/prev cue for all; mute any participant; change language |
| **Actor** | Scroll script independently; can request "sync to host" (future); highlight own lines |
| **Viewer** | Read-only; see current cue but cannot interact |

## Participant Script Experience

- **Actors** see cue text for their role(s) highlighted
- When host advances cue: toast notification "Scene changed" + auto-scroll if user was reading ahead
  - cue_advance 메시지는 room-authority DataChannel을 통해 전송되며, `(authority_epoch, seq)` 사전식 순서 기준으로 **최신 메시지만 적용** (HostAuthority.md § Message 순서 판정 참조)
  - 수신측: `authority_epoch`가 더 크거나, 같으면 `seq`가 더 큰 메시지만 처리하고 그 이하의 메시지는 폐기
- **Manual sync**: Actor can click "sync to host cue" if they scrolled away
- Language switch: all clients immediately see translated cues (no reload)

## Edge Cases

1. **Network Lag During Cue Transition**
   - Host clicks next cue; DataChannel sends immediately
   - If packet loss: LiveKit retransmits (reliable channel)
   - Actor see brief "loading cue..." spinner; tolerates up to 5s before giving up

2. **Actor Scrolls While Host Advances**
   - Host's cue broadcast received
   - If actor is reading > 1 cue ahead: banner "Host moved to Cue 5. Sync?" with [Yes] button
   - If actor clicks [Yes]: scroll jumps + `CUE_ACTIVE` state updates
   - If actor ignores: actor stays on their cue until manually syncing

3. **Multi-Language Fallback**
   - Script JSON: `{ ja: [...], ko: [...], en: [...] }`
   - User selects language in settings
   - If language missing: fallback to ja (default)
   - Change language anytime; cue_index preserved

4. **Cue Duration Tracking** (future feature)
   - Each cue can have optional `duration_ms` field
   - Host can enable auto-advance after duration (no manual next button)
   - Synced via DataChannel; countdown timer on all clients

5. **Large Script** (1000+ cues)
   - Don't load all cues into DOM at once; virtual scroll
   - Load current + neighbors (±50 cues)
   - Memory: ~10KB per cue average, so 1000 cues = ~10MB ✓

6. **스크립트 동시 편집 충돌 (G-102)**
   - 상황: 두 명 이상의 참가자(주로 호스트)가 동시에 같은 대사 라인을 수정
   - 예시:
     - 11:00:00 호스트가 "리온: 안녕하세요" → "리온: 반갑습니다" 수정 (updated_at = 11:00:00.123)
     - 11:00:00.150 다른 호스트(권한 양도됨)가 같은 대사를 "리온: 환영합니다"로 수정 (updated_at = 11:00:00.500)
   - 감지 및 충돌 해소:
     - 프로토콜: Last-Write-Wins (LWW) — 더 최신 타임스탬프가 승리
     - Supabase Realtime scripts UPDATE 이벤트 수신 시 `updated_at` 비교
     - 로컬 변경사항 `updated_at` < 수신한 변경사항 `updated_at` → 원격이 덮어씀
   - 충돌 감지 로직:
     1. 로컬 수정 중: stageStore.cues_json_draft (임시 저장)
     2. Realtime 이벤트 수신: `incoming.updated_at > local.updated_at`
     3. 대사 라인별 비교: `cues[index].text` 다르면 LWW 적용
   - UX:
     1. 덮어씌워진 참가자에게 배너 표시: "다른 참가자가 수정했습니다" (노란색, 3초 표시)
     2. 해당 라인 UI 즉시 갱신 (Realtime 이벤트 기반)
     3. 참가자의 임시 입력 폼은 초기화 (stageStore.cues_json_draft 리셋)
   - 권장사항:
     - 호스트 권한 명확화: 동시 위임 상황 회피 (HostAuthority.md G-101 참조)
     - 동시 편집 방지: 방 내 1명의 호스트만 스크립트 수정 권한 보유
   - MUST NOT: 동시 편집에서 "병합(merge)" 알고리즘 구현 금지 (LWW가 충분, 복잡도 제외)

7. **스크립트 삭제 중 사용 (G-103)**
   - 상황: 방에서 현재 활성 사용 중인 대본을 방장이 삭제하려고 시도
   - 감지: 호스트가 ScriptPanel의 [삭제] 버튼 클릭 또는 scripts 테이블 DELETE 요청
   - 활성 상태 확인:
     - scripts.is_active = true AND scripts.id = stageStore.script_id (현재 진행 중)
   - 처리:
     1. 삭제 전 경고 다이얼로그 표시:
        ```
        "현재 방에서 이 대본이 사용 중입니다. 삭제하시겠습니까?
         삭제 시 모든 참가자의 대본이 사라집니다."
        [취소] [삭제 확인]
        ```
     2. 취소 클릭: 아무 작업 없음 (대본 유지)
     3. 삭제 확인 클릭:
        - DB: scripts DELETE (ON CASCADE로 script_versions도 삭제)
        - Realtime 이벤트: room의 모든 클라이언트에 scripts DELETE 알림
        - 활성 세션 처리:
          * ScriptPanel → "대본이 삭제되었습니다" 알림 표시 (빨간색)
          * cue_index 하이라이트 제거 (StageStore.cue_index 초기화)
          * 3초 후 자동으로 ScriptPanel 닫기 (onClose 호출)
     4. 다른 참가자: 토스트 알림 "대본이 삭제되었습니다" → 스크립트 패널 닫히고 ImpromptuModePanel로 전환 (G-63)
   - 영향:
     - 진행 중인 대사 라인 스크롤 중단
     - 배우들은 즉흥 모드로 자동 전환
   - MUST NOT:
     - 대본 사용 중 경고 없이 즉시 삭제 금지
     - 부분 삭제 상태 유지 금지 (전체 DELETE만 허용)
     - 삭제 후 undo 기능 미제공 (version_history 테이블로 향후 구현 가능, G-104)

## 더빙(DUB) 중 Script 수정 정책 (H12 연동, P2)

DubSession 녹음 중 Script를 수정할 수 있으나, 각 `dub_tracks.speaker_name`은 `roles_locked_at` 시점의 스냅샷을 사용하며, 이후 Script 변경에 영향받지 않는다. 예: 녹음 시작 시 "리온"으로 잠금된 화자는 Script에서 "리온"→"선우"로 수정해도 dub_track은 "리온"으로 유지. 자세한 규칙은 `contracts/DubRoleAssigner.md H12 잠금 규칙` 참조.

## Implementation Hints

- **Zustand store**: `stageStore` (script_data, cue_index, cue_state, language)
- **Event sources**:
  - Supabase Storage: upload script JSON
  - Supabase Realtime `stage_state` channel: host language change
  - LiveKit DataChannel `reliable`: cue_index broadcast
- **Side effects**:
  - LOADED state: parse cues; build actor-to-lines map
  - CUE_ACTIVE: highlight relevant actor lines in UI; announce to screen reader
  - ENDED state: show "Script complete!" modal; optionally save recording timestamp
