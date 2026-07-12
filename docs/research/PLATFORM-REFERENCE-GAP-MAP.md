---
tags: [research]
---

<!--
  2026-06-30 - 주인님 레퍼런스 메모를 ChatterBox 기능/문서망에 매핑.
  분류: 조사. FEATURE-SPEC을 바로 증식하지 않고, 기존 Feature ID로 흡수 가능한지 먼저 확인하는 갭 맵.
-->

# PLATFORM-REFERENCE-GAP-MAP — 레퍼런스별 제품 갭

> 목적: VRChat, Gather Town, Jackbox, Twitch, YouTube Live, Discord, Figma, Frame.io, Nico Nico, itch.io/Booth, Roblox/Fortnite Creative, Rec Room, REALITY, Stage TEN, VTube Studio, Animaze, Loom/CapCut, Zoom에서 배울 점을 ChatterBox 기능망에 연결한다.
> 운영 원칙: 기존 Feature ID와 계약서로 커버되는 항목은 새 ID를 만들지 않는다. 실제 구현 직전 빈 구멍만 `FEATURE-SPEC.md`에 승격한다.

## 결론

ChatterBox의 핵심 방향은 "화상통화"가 아니라 **공간 안에서 함께 연기하고, 관객이 공연을 바꾸고, 결과물이 다음 콘텐츠가 되는 버추얼 무대**다.

가장 가까운 P1 후보는 4개다.

| 후보 | 왜 먼저인가 | 기존 연결 |
|---|---|---|
| 씬 이벤트/앰비언트 | 모닥불 컨셉을 실제 공간감으로 바꿈 | `SceneBackground.md`, `DESIGN-DIRECTION.md §9`, ROOM-09 |
| 관객 투표/큐 카드 | 관객을 구경꾼에서 공동 연출자로 바꿈 | ROOM-22, ROOM-20 |
| 순간 클립/자동 하이라이트 | 공연 후 공유 루프를 만듦 | ROOM-13, ROOM-24, VGEN-12 |
| Presence/준비 상태 | 리허설 UX와 협업 신뢰도를 높임 | `PresenceAvatarStack.md`, GreenRoom, VGEN-01 |

P2 이후로 미뤄도 되는 후보는 근접 음성, UGC 월드, 마켓, 비동기 오디션, 시간 기반 리뷰, 크리에이터 정산, 외부 방송 트리거다. 모두 좋지만 MVP 이후 네트워크/권한/경제 시스템 부하가 크다.

## 레퍼런스 매핑

| 레퍼런스 | 배울 점 | ChatterBox 갭 | 흡수 위치 | 우선 |
|---|---|---|---|---|
| VRChat / Cluster | 공간이 사람을 모은다 | 씬이 아직 배경 이미지 중심으로 보일 위험 | `SceneBackground.md` 레이어 클릭, `sound_trigger`, `DESIGN-DIRECTION.md §9` | P1 |
| Gather Town / Kumospace | 거리 기반 소그룹 대화 | 고정 슬롯은 연극에는 좋지만 자유 대화가 약함 | ROOM-15 이후 audience mode 확장 후보 | P2 |
| Jackbox Games | 관객도 플레이어 | 투표는 있으나 공연 내용에 미치는 구조가 약함 | ROOM-22 관객 투표, HOST-12 stage manager | P1 |
| Twitch / YouTube Live | 클립이 성장 루프 | 녹화는 있으나 공연 중 순간 클립/자동 추천이 약함 | ROOM-13, ROOM-24, VGEN-12 | P1 |
| Discord | 템플릿, 역할, 봇 | 방 규칙/역할/대본/씬을 한 번에 불러오는 흐름이 약함 | ROOM-14, CNT-08, CNT-09, CNT-06 | P1/P2 |
| Figma | 누가 뭘 하는지 보인다 | 룸 전체 presence가 약함 | `PresenceAvatarStack.md`, GreenRoom ready ring, VGEN-01 cursor | P1 |
| Descript / Frame.io | 영상 특정 시점에 피드백 | 녹화본 시간 기반 댓글이 없음 | ROOM-24 이후 rehearsal review 후보 | P2 |
| Nico Nico Douga | 댓글이 같이 보는 감각을 만든다 | ChatOverlay가 단순 floating message에 머묾 | `ChatOverlay.md` comment lane/emotion wave 후보 | P1/P2 |
| itch.io / Booth.pm | 창작자가 자산을 판다 | 마켓은 정의됐지만 경제 구조가 약함 | CNT-06, INF-08, COST-ESTIMATE | P2 |
| REALITY | 관객 선물/후원이 방송 경험의 일부 | 크레딧 구매는 있으나 배우/방/극단에게 보내는 gift/tip 루프가 없음 | ECON-01~03 | P2 |
| VRChat Creator Economy | 스토어, listing, subscription, payout | 모델마켓 LATER 외 creator payout ledger와 멤버십 표면이 없음 | ECON-02~03, CNT-06 | P2 |
| Rec Room Creative | creator clubs/events로 창작자 커뮤니티를 묶음 | 방 단위 활동은 있으나 극단/크루/공식 컨테스트 표면이 없음 | COM-01~02 | P2 |
| Stage TEN | live/replay analytics가 운영·성장 루프가 됨 | 운영 모니터링은 있으나 방장/극단용 관객·리액션·클립 성과 분석이 없음 | ANA-01, ROOM-13/24 | P1 |
| VTube Studio / Animaze | Twitch/외부 이벤트가 avatar hotkey/action을 발동 | 내부 채팅/리액션만 있고 외부 subscribe/chat/redeem/raid 트리거가 없음 | EXT-01, HOST-12 | P2 |
| Roblox / Fortnite Creative | 방 방문 자체가 콘텐츠 | 공개 데모룸은 있으나 개인 월드/방 꾸미기는 약함 | LOB-07 이후 public room profile 후보 | P2 |
| Loom / CapCut | 비동기 연습과 모바일 편집 | 실시간 동기 흐름에 치우침 | LOB-10, ROOM-24, VGEN-11/12 | P2 |
| Zoom | 대기실/브레이크아웃/발언 큐 | GreenRoom 호스트 통제판과 소그룹 연습이 약함 | GreenRoom, ROOM-20, ROOM-15 | P1/P2 |

## 기능 후보 세부

### 1. 씬 이벤트와 씬 상태

이미 `contracts/SceneBackground.md`가 레이어 클릭, hover, idle animation, `sound_trigger`를 갖고 있다. 새 시스템을 만들 필요는 없고, 데이터 예시와 UI 노출만 보강하면 된다.

- 모닥불: `fire_layer` 클릭 → scale bounce, 불꽃 파티클, `fire_crackle`
- 사이버 옥상: `billboard_layer` 클릭 → 방 이름/대사 한 줄 표시, 전광판 glow
- 극장: `spotlight_layer` 클릭 → stage state를 `rehearsal | live | break`로 바꾸는 호스트 전용 affordance
- 앰비언트: 숲, 비, 도시 소음은 호스트 ON/OFF. 기본값 OFF 또는 낮은 볼륨

ponytail: 앰비언트 사운드는 처음엔 씬당 `ambient_sound_id` 하나만 둔다. 레이어별 믹싱은 실제 방에서 필요성이 보이면 올린다.

### 2. 관객 참여

`ROOM-22`가 이미 관객 투표/폴을 가진다. 여기에 "스토리 선택"뿐 아니라 "다음 씬/조명/효과음 선택"을 연결하면 Jackbox식 영향력이 생긴다.

- 다음 배경 투표: 숲/도시/우주
- 큐 카드: 관객 제안 → 호스트 수락/거절 → 대본 패널에 1회성 cue 표시
- 공연 후 반응: 별점/짧은 코멘트 → 작품함 artifact metadata로 기록

### 3. 클립과 하이라이트

`ROOM-13` 녹화와 작품함이 이미 있으므로, 새 녹화 시스템이 아니라 marker를 추가하는 방향이 작다.

- "이 순간" 버튼: 전후 10초 marker 저장
- 자동 추천: reaction burst, 채팅 급증, host curtain-call marker를 근거로 후보 구간만 표시
- 공유 보상: 조회수 기반 크레딧은 부정 사용 위험이 있어 P2 경제 설계 후 검토

ponytail: 자동 하이라이트는 처음엔 AI 없이 룰 기반 marker로 충분하다. 추천 품질이 낮다는 증거가 쌓이면 STT/LLM 요약을 붙인다.

### 4. Presence와 준비 상태

Figma식 cursor는 VGEN 프롬프트 패널에 이미 있다. 룸/GreenRoom 전체에는 상태 배지와 ready ring이 더 싸다.

- 아바타 위 상태: `script_reading | typing_chat | editing_prompt | muted | away`
- GreenRoom ready ring: 장치/캘리브레이션/역할 확인 완료 시 녹색 링
- 대본 live cursor: P1.5 후보. 초기에는 "현재 줄"만 공유

### 5. 템플릿/크루/봇

`CNT-08` 첫 방 템플릿과 `CNT-09` 시드 대본 팩이 이미 있다. Discord식 "서버 템플릿"은 이 둘을 묶어 방 생성 flow에 노출하면 된다.

- 템플릿 구성: 대본, 역할, 씬, 효과음, 권장 정원, 난이도, 예상 시간
- 크루/극단: 자주 함께하는 팀, 로고, 아바타, 대본 묶음. P2
- AI 엑스트라: 빈 역할 TTS 낭독. 안전/품질 이슈 때문에 P2

### 6. 관객석/거리 기반 음성

근접 음성은 매력적이지만 슬롯 기반 연극 UX와 충돌한다. MVP에서는 `ROOM-15` 무대/객석 분리와 `ROOM-20` 발언 큐가 먼저다.

- 배우 음성: 항상 전체 송출
- 관객 속닥임: P2. 관객끼리 2~3명 whisper 그룹
- 자리 이동: 리허설 모드에서만 드래그 허용 후보
- 무대 입장 애니메이션: GreenRoom → RoomView 전환 2초 연출. P1 polish

### 7. 크리에이터 경제

`INF-08` 결제·크레딧 구매는 사용자가 플랫폼에 돈을 내는 입구다. 경쟁사식 creator economy는 돈이 다시 배우·방·극단으로 돌아가는 루프라 별도 Feature ID가 필요하다.

- `ECON-01`: 관객 gift/tip. 공연 중 짧은 시각 효과, ChatOverlay 감사 메시지, 수신 대상(actor|room|crew) 선택.
- `ECON-02`: creator payout ledger. 지급 가능 잔액, 보류 잔액, platform fee, refund/chargeback hold를 분리.
- `ECON-03`: 멤버십/구독 패스. supporter tier, 멤버 전용 리플레이/대본/방 접근.

ponytail: P2 전에는 실제 정산 테이블을 만들지 않는다. 결제·KYC·세금·환불 정책이 확정되기 전 DB를 만들면 나중에 마이그레이션 비용이 크다. 지금은 Feature ID와 위험 경계만 고정한다.

### 8. 극단/이벤트/컨테스트

Rec Room식 creator club/event는 "사람들이 다시 모일 이유"를 만든다. ChatterBox에서는 일반 소셜 그래프보다 극단/크루 단위가 먼저다.

- `COM-01`: 극단/크루 프로필, 멤버 역할, 공유 대본·씬·템플릿.
- `COM-02`: 공식 이벤트/컨테스트, 제출 기간, 주제, 심사 기준, 수상작 갤러리.
- 초기 구현은 운영자 수동 선별 + 작품함 링크 제출로 충분하다. 자동 랭킹/상금 지급은 경제 시스템 이후.

### 9. 창작자용 공연 분석

운영 대시보드는 이미 `MonitoringDashboard.md`가 다룬다. `ANA-01`은 방장·극단이 보는 제품 대시보드다.

- 관객 수: live peak, unique viewers, 평균 시청 시간.
- 참여: reaction burst, poll 참여율, chat density.
- 콘텐츠 성과: clip 생성, share link, replay view, VGEN 결과 공유.
- 리허설 개선: 대사 겹침, turn timing miss, 10초 replay marker.

ponytail: 처음엔 `analytics_events.properties` JSONB 집계로 충분하다. 별도 OLAP/warehouse는 DAU와 쿼리 비용이 실제로 문제가 될 때 올린다.

### 10. 외부 방송 트리거

VTube Studio/Animaze식 외부 이벤트 트리거는 스트리머에게 매력적이지만 권한 경계가 크다.

- `EXT-01`: Twitch/YouTube subscribe, chat command, redeem, raid 등을 allowlist action으로 변환.
- 허용 액션 예: `sound_trigger`, `reaction_burst`, `avatar_emote`, `scene_effect`.
- 금지: 외부 payload를 그대로 DataChannel/DB action으로 실행, 방장 확인 없이 비용 발생 액션(VGEN/결제) 실행, OAuth token을 클라이언트에 노출.

ponytail: MVP/P1에서는 외부 트리거 대신 내부 `send-viewer-reaction`/`ROOM-22` poll을 먼저 튼튼하게 만든다. EXT-01은 OBS/방송용 클린 모드가 실제로 쓰인 뒤에 올린다.

## 다음 승격 기준

아래 조건 중 하나를 만족하면 `FEATURE-SPEC.md`에 새 ID로 승격한다.

| 조건 | 승격 대상 |
|---|---|
| 기존 계약서로 구현 지시가 애매함 | 새 ROOM/CNT/HOST ID |
| DB/API 필드가 새로 필요함 | `DATA-SCHEMA.md`, `API-SURFACE.md` |
| 권한/보안 경계가 바뀜 | `SecurityPolicies.md`, 관련 계약서 |
| UI 컴포넌트가 독립 표면이 됨 | `contracts/*.md` |

당장 승격하지 않는 이유: 기능명은 많지만, 절반 이상은 기존 ROOM-13/20/22, CNT-08/09, SceneBackground 계약으로 흡수 가능하다. 먼저 매핑 문서로 보관하고, 구현 직전 필요한 최소 Feature ID만 만든다.
