---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->

# 10. TimedTurnsProgressBar

현재 큐의 예상 소요시간 진행바. stageStore.cue_index + ScriptPanel의 cues_json[i].duration_ms 기반.

## Props Interface

```typescript
interface TimedTurnsProgressBarProps {
  /**
   * 큐의 시작 timestamp (ms)
   */
  cueStartTime: number;

  /**
   * 큐의 예상 duration (ms)
   */
  duration?: number;

  /**
   * UI 색상 테마
   * (선택) 기본값 'default'
   */
  variant?: 'default' | 'warning' | 'danger';

  /**
   * 완료 콜백 (duration 경과 후)
   */
  onComplete?: () => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `stageStore` | `cueIndex` | ✓ | | 현재 큐 인덱스 |
| `stageStore` | `scriptData.cues` | ✓ | | cues_json 배열 (duration_ms 조회) |

## DataChannel 의존성

**구독:**

| Channel | 메시지 형식 | 용도 |
|---------|----------|------|
| `room-authority` (reliable) | `{type: 'cue_advance', payload: {cue_index}}` | cue 변경 시 타이머 리셋 |

## LiveKit 이벤트

**없음** — DataChannel room-authority만 사용.

## Supabase 접근

**없음** — stageStore.script_data에서 duration_ms 읽기만.

## 금지 사항 (MUST NOT)

- ❌ 독립적으로 cue를 advance (표시만, HostConsole이 발행)
- ❌ duration_ms를 무시하고 고정 시간 사용 (스크립트에서 읽기)
- ❌ cue_advance 수신 시 타이머 리셋 안 함 (동기화 필수)
- ❌ 오버플로우 시 다음 cue 자동 진행 (UI만, host 액션 대기)

## 컴포넌트 관계

```
[TimedTurnsProgressBar]
  ├─ read: stageStore.cue_index
  ├─ read: stageStore.script_data.cues[cue_index].duration_ms
  ├─ subscribe: room-authority cue_advance
  │
  ├─ on cue_advance:
  │  ├─ reset: cueStartTime = now()
  │  ├─ reset: progress = 0%
  │  └─ restart: requestAnimationFrame loop
  │
  ├─ [ProgressBar]
  │  ├─ width: (elapsed / duration) * 100%
  │  └─ color: default | warning (80%) | danger (95%)
  │
  └─ requestAnimationFrame loop
     └─ if elapsed >= duration: onComplete()
```
