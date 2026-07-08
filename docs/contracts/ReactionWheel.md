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

## DataChannel + 서버 릴레이

리액션은 **클라가 직접 방송하지 않는다.** `send-reaction` Edge Function 이 멤버십 검증 후 LiveKit `RoomServiceClient.sendData` 로 방 전체에 broadcast 한다.

| 경로 | 내용 |
|---|---|
| 송신 | `sendReaction`(hook) → `sendReactionRelay`(lib) → `POST /functions/v1/send-reaction` `{room_id, emoji, idempotency_key(=rid)}`. 5/s 쓰로틀·즉시 로컬 self-echo |
| broadcast | Edge → `broadcastData(room_id, {emoji, rid, sender}, 'reaction')` = `sendData(reliable, topic:'reaction')`. **sender=서버가 auth 로 확정** |
| 수신 | `RoomEvent.DataReceived` topic=`reaction` → **participant=undefined(서버발)만 수락** → `addFloat(data.sender, emoji)`, rid 256-LRU dedupe |

- **왜 서버 경유**: LiveKit datachannel **개설지연으로 클라 직접 첫 방송은 유실**(2탭 prod E2E ~30% 실측). 서버는 이미 안정연결이라 유실0(직접 publish + rid 재전송/warm-up 은 개설레이스를 못 이겨 폐기).
- **스푸핑 방어**: 클라가 `reaction` 을 직접 publish 하면(participant 존재) 수신측이 **드롭** — sender 를 auth 로 확정하는 건 서버뿐. payload sender 는 **서버발일 때만** 신뢰.
- **self-echo**: 발신자도 서버 broadcast 를 되받음 → 로컬 즉시 `addFloat` + `rid` dedupe 로 중복 방지. emoji 길이 방어(1~20), 표시는 React 이스케이프.
- **비용/한계**: 왕복 1홉 추가(수십 ms·cold start 시 더). 뷰어(`canPublishData=false`)도 이 경로면 리액션 가능(멤버십만 통과하면 됨).

## 좌석 앵커

- 오버레이는 `slotOf(identity)` → `stageLayout.SLOTS[slot]{col,row}` 를 3×3 그리드 % 로 환산해 배치. slot 미상 → 하단중앙 폴백.
- ponytail: 측정 rect 기반 픽셀정밀 앵커는 후속(현재 셀 중심 근사).

## Supabase

**없음** — 히스토리 미영속(휘발성 리액션). DataChannel 만.

## 보안 / defer

- MVP: actor/host(`canPublishData=true`)는 클라 직접 publish(채팅 MVP 와 동형). 이모지는 고정 세트라 sanitize 불필요·rate-limit 만.
- **첫 리액션 유실 해소(prod E2E 실증)**: 예전 클라 직접 방송의 **송신측** datachannel 개설레이스 유실(~30%)은 **서버 릴레이(`send-reaction`)로 제거** — 배포 후 2탭 prod E2E 로 A→B(과거 취약 방향) **3/3 PASS**·양방향 확인. **잔여**는 *수신측* 신규참가자 datachannel 개설지연(입장 직후 수초간 broadcast 를 놓칠 수 있음) — 3.5s 후 발사 시 관측, **9s 후엔 안정**. 실유저는 입장 직후 몇 초 안에 리액션 안 쏘므로 무영향. cold start 시 원격 왕복 지연은 유실 아님(self-echo 로 발신자는 즉시).
- **모바일 뷰어**(`canPublishData=false`) 리액션: 서버 릴레이가 actor/host 와 동일 경로라 멤버십만 통과하면 뷰어도 가능 — 뷰어 role 게이트·전용 UI 만 **후속**.
- **서버 rate-limit**(토큰버킷/KV)·검열 allowlist 는 후속(현재 클라 5/s 쓰로틀).
- ~~모바일 롱프레스 트리거·키보드 핫키~~ **구현됨(P-5, 2026-07-08)**: 무대 터치 롱프레스 ≥500ms → 휠 `initialSticky` 개화(탭 선택; 개화 직후 touchend `preventDefault` 로 합성 mousedown 의 백드롭 닫힘 차단, 10px 이동=스크롤 의도로 취소) · 숫자키 1~N 즉발(입력 필드 포커스·수식키 조합 제외). 트리거는 RoomPage, 휠은 `initialSticky` prop 만 추가. 헤드리스 실측 9/9(touch dispatch→개화→sticky→탭 발사·핫키 발사·입력중 미발사).
- ponytail: 2중링(12+)·전용 핑 사운드·화면끝 클램프.

## MUST NOT (금지 사항)

- 클라가 `reaction` 토픽을 **직접 publishData 하지 않는다** — 반드시 `send-reaction` Edge 경유(sender auth 확정·유실0).
- 수신측은 **participant 가 존재하는(=클라 직접발) reaction 을 신뢰하지 않는다** — 서버발(participant undefined)만 수락. payload sender 는 서버발일 때만 신뢰.
- `floats` 를 DB 에 영속하지 않는다(휘발성). 히스토리·집계가 필요하면 별도 설계.
- 서버 rate-limit(토큰버킷) 후속 — 현재 클라 5/s 쓰로틀. 클라 쓰로틀 우회 금지.
- 이모지 문자열을 `dangerouslySetInnerHTML` 로 렌더 금지(React 이스케이프 유지).
