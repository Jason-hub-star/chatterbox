---
tags: [fsm]
---

# Stage Mode State Machine

`stageStore.mode`의 단일 진실 원천. VGen과 DUB는 같은 메인뷰 레이어를 점유하므로 동시에 활성화될 수 없다.

## States

```text
NORMAL
  ├─ host opens VGen prompt ─▶ VGEN
  └─ host opens DUB overlay ─▶ DUB

VGEN
  ├─ host closes prompt / generation starts ─▶ NORMAL
  └─ room ended / host leaves ─▶ NORMAL

DUB
  ├─ host closes DUB overlay ─▶ NORMAL
  └─ room ended / host leaves ─▶ NORMAL
```

## Transitions

| From | To | Trigger | Authority | DataChannel |
|---|---|---|---|---|
| NORMAL | VGEN | `[프롬프트 열기]` | Host only | `room-authority: vgen_mode_open` |
| VGEN | NORMAL | close/generate/room end | Host or room lifecycle | `room-authority: vgen_mode_close` |
| NORMAL | DUB | `[DUB 모드 전환]` | Host only | `room-authority: dub_mode_open` |
| DUB | NORMAL | close/room end | Host or room lifecycle | `room-authority: dub_mode_close` |
| VGEN | NORMAL | room ended / host disconnected / LiveKit fail-close | Automatic cleanup | Auto-transition, no explicit trigger |
| DUB | NORMAL | room ended / host disconnected / LiveKit fail-close | Automatic cleanup | Auto-transition, no explicit trigger |

## Guards

```typescript
type StageMode = 'normal' | 'vgen' | 'dub';

function canTransition(current: StageMode, next: StageMode): boolean {
  if (current === next) return true;
  if (next === 'normal') return true;
  return current === 'normal';
}
```

- `vgen -> dub` 직접 전환 금지. 반드시 `vgen -> normal -> dub`.
- `dub -> vgen` 직접 전환 금지. 반드시 `dub -> normal -> vgen`.
- 비호스트가 `vgen_mode_*` 또는 `dub_mode_*`를 발행하면 dispatcher에서 폐기한다.
- room end, host leave, LiveKit disconnect fail-close 시 `normal`로 되돌린다.

ponytail: 3상태 FSM이면 충분하다. 예약 모드, 화면공유, 관객 투표처럼 메인뷰를 점유하는 새 모드가 생기면 이 파일에 상태와 직접 전환 금지 규칙을 추가한다.
