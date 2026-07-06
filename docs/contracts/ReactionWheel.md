---
tags: [contract]
---

# ReactionWheel · ReactionOverlay

무대에서 참가자가 우클릭으로 여는 **라디얼 리액션 휠**(LoL 핑휠 방식)과, 발사된 이모지가 보낸 사람 좌석 위로 떠오르는 **오버레이**.

## 구성

| 파일 | 역할 |
|---|---|
| `src/features/reaction/reactionSlots.ts` | 순수 지오메트리(`slotAngle`·`slotOffset`·`nearestSlot`) — 링 위 균등배치·드래그 방향 최근접 슬롯. N 가변. |
| `src/stores/reactionStore.ts` | `slots`(커스터마이즈·localStorage 영속)·`floats`(휘발성). `DEFAULT_SLOTS` 8개(❓=핑 포함). |
| `src/features/reaction/ReactionWheel.tsx` | 휠 UI·상호작용(홀드-드래그-릴리즈 + sticky 폴백). |
| `src/features/reaction/ReactionOverlay.tsx` | `floats` → 좌석 위 부동 애니(rise+fade, 2.2s 자동제거). |

## Props

```typescript
interface ReactionWheelProps {
  origin: { x: number; y: number } // 무대 우클릭 위치(clientX/Y). RoomPage 가 열릴 때만 렌더 → 항상 유효
  onFire: (emoji: string) => void  // 슬롯 확정 → sendReaction
  onClose: () => void              // 취소/발사 후 닫기(origin=null)
}

interface ReactionOverlayProps {
  slotOf: (identity: string) => number | undefined // 좌석 앵커용(identity → slot_index)
}
```

## 상호작용 (트리거 = 우클릭)

- 무대 컨테이너 `onMouseDown` `button===2` → 커서 위치에 휠 마운트(`onContextMenu` preventDefault 로 네이티브 메뉴 억제).
- **홀드-드래그-릴리즈**: 누른 채 방향 드래그 → 조준 슬롯 하이라이트 → 떼면 발사. 중앙(데드존)서 떼면 **sticky**(열린 채 → 슬롯 클릭 선택). 바깥클릭·Esc = 취소.
- 열 때마다 새 마운트(RoomPage 조건부 렌더) → 상태 초기화. mouseup 은 이벤트 좌표로 직접 판정(ref 미러 불필요).

## 커스터마이징 (데이터 주도)

- 슬롯 = `ReactionSlot{ id, emoji, label }[]`. 휠은 store `slots` 를 읽어 렌더 — 개수·이모지 무관하게 각도=360/N 자동 배치.
- `setSlots(slots)` → localStorage(`chatterbox.reactionSlots`) 영속. 상한 `MAX_SLOTS=12`.
- **피커 UI 는 후속 슬라이스** — 현재는 기본 세트 + 아키텍처(데이터 주도·영속)만.

## DataChannel

| 토픽 | 방향 | 페이로드 | 신뢰성 | 용도 |
|---|---|---|---|---|
| `reaction` | publish(`sendReaction`) / subscribe(`RoomEvent.DataReceived`) | `{ emoji: string, rid: string }` | **reliable + rid 재전송** | 이모지 방송 → 수신측 `addFloat(senderIdentity, emoji)` |

- **첫 메시지 유실 대응(핵심)**: LiveKit 은 datachannel **개설 완료 전 publish 를 드롭**한다(reliable·warm-up 으로도 못 이김 — 2탭 E2E 로 첫 크로스-참가자 리액션 유실 실측). 그래서 같은 `rid` 로 `0·250·700·1500ms` 4회 재전송 → 최소 1발은 개설 후 도달. 수신측은 `rid` 를 256개 LRU 로 **dedupe** → float 은 1개(TCP-over-lossy).
- **reliable**: ≤5/s·소형이라 HOL 무해하고 핑은 유실되면 안 됨(blendshape 20Hz 만 lossy).
- sender identity 는 LiveKit participant 에서만 취득(payload 불신). 수신측 emoji 길이 방어(1~20), 표시는 React 이스케이프.
- 송신 5/s 쓰로틀(사용자 발사 기준, 재전송은 별개). `publishData` 는 자기 echo 없음 → 발신자는 로컬 `addFloat` 직접.

## 좌석 앵커

- 오버레이는 `slotOf(identity)` → `stageLayout.SLOTS[slot]{col,row}` 를 3×3 그리드 % 로 환산해 배치. slot 미상 → 하단중앙 폴백.
- ponytail: 측정 rect 기반 픽셀정밀 앵커는 후속(현재 셀 중심 근사).

## Supabase

**없음** — 히스토리 미영속(휘발성 리액션). DataChannel 만.

## 보안 / defer

- MVP: actor/host(`canPublishData=true`)는 클라 직접 publish(채팅 MVP 와 동형). 이모지는 고정 세트라 sanitize 불필요·rate-limit 만.
- **모바일 뷰어**(`canPublishData=false`)의 리액션은 `send-viewer-reaction` Edge 릴레이 경유(API-SURFACE) — **후속**.
- **알려진 한계(측정)**: 입장 직후(수초 내) 첫 리액션은 LiveKit datachannel 개설 지연으로 가끔 유실됨(prod 2탭 E2E ~30%). retry+dedupe 로 완화·self-echo 로 발신자 화면은 즉시 반영. **보장 전달이 필요하면** `send-viewer-reaction` 식 **서버 릴레이**로 승급(actor 리액션도 서버 broadcast) — 후속.
- ponytail: 모바일 롱프레스 트리거·키보드 핫키·2중링(12+)·전용 핑 사운드·화면끝 클램프.

## MUST NOT (금지 사항)

- payload 의 sender 를 신뢰하지 않는다 — sender identity 는 **LiveKit participant.identity 만** 사용.
- 모바일 뷰어(`canPublishData=false`)의 클라 직접 publish 금지 — `send-viewer-reaction` Edge 릴레이 경유(후속).
- `floats` 를 DB 에 영속하지 않는다(휘발성). 히스토리·집계가 필요하면 별도 설계.
- 송신 rate-limit(5/s 쓰로틀) 우회 금지. blendshape(20Hz)와 달리 reaction 은 저빈도라 reliable 이 정당(고빈도 토픽을 reliable 로 올리지 말 것).
- 이모지 문자열을 `dangerouslySetInnerHTML` 로 렌더 금지(React 이스케이프 유지).
