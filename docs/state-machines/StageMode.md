---
tags: [fsm]
---

# Stage Mode State Machine

`stageStore.mode`의 단일 진실 원천. VGen과 DUB는 같은 메인뷰 레이어를 점유하므로 동시에 활성화될 수 없다.

> **as-built (2026-07-10, G-261):** 아래 forward 스펙과 편차 3. ①채널 타입은 `vgen_mode_*`/`dub_mode_*` 대신 **`mode_change` 단일 타입**(서버발 — `set-room-mode` Edge 가 호스트 검증→`rooms.current_mode` UPDATE→broadcast, 클라 직접 발행 없음=스푸핑 원천 차단). ②트리거 의미: VGEN = "프롬프트 패널 열림"이 아니라 **생성 진행 중**(시작→vgen·종료→normal, RoomPage 호스트 관찰자), DUB = 세션 개시→dub·합성 완료→normal(DubPanel). ③`canTransition` 가드(vgen↔dub 직접 전환 금지)는 서버 미적용 — as-built 의 모드는 레이어 점유가 아니라 패널 포커스+배너라 직접 전환이 무해(ponytail: 레이어 점유 모드가 생기면 Edge 에 가드 승급).

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
