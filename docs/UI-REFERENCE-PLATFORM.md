---
tags: [guide]
---

<!--
  opencode: 2026-06-26 - 버튜버 연극 플랫폼 UI 레퍼런스 모음.
  Coded with OpenCode; high-cost model review recommended.
  스크린샷 원본은 design/reference-screenshots/platform/ 에 둔다.
-->

# UI-REFERENCE-PLATFORM — 플랫폼/룸 UI 레퍼런스

> 새 플랫폼(버튜버 연극: 웹캠 얼굴 추적 아바타 + 실시간 음성/채팅 + 가상 묵대/방)의 UI/UX 레퍼런스 모음.
> 용도: 룸 레이아웃, 참가자 HUD, 방장 콘솔, 대기실(Green Room), 채팅/반응 UI.
> Updated: 2026-06-26

---

## 1. 일본/아시아 메타버스 · 공연 플랫폼

Snack 플랫폼의 타겟 시장(일본 런칭)과 겹치는 서비스들.

| 사이트 | URL | 카테고리 | 특징 | 우리와의 차이 / 참고점 |
|---|---|---|---|---|
| **Cluster** | https://cluster.mu | 일본 메타버스 이벤트 | 가상 이벤트/공연/라이브. 아바타 + 음성 + 채팅. VR/PC/모바일 지원 | **가장 유사한 레퍼런스**. 이벤트 목록, 방 입장, 묵대/객석 배치, 아바타 커스터마이징 UI 참고. |
| **ZEPETO** | https://zepeto.me | 아바타 소셜 | 모바일 중심 아바타 + 방/월드 + 라이브. 한국/일본 인기 | 모바일 퍼스트. 우리는 데스크톱 웹캠 트래킹 기반 연극에 집중. |
| **REALITY** | https://reality.app | 모바일 VTuber 라이브 | 일본. 아바타 라이브 방송, 시청자 채팅/선물 | 1:N 방송. 우리는 N:N 연극/콜라보 방송. |
| **SHOWROOM** | https://www.showroom-live.com | 일본 라이브 스트리밍 | 실제 얼굴/아바타 라이브, 시청자 참여, 랭킹 | 1:N 아이돌/크리에이터 라이브. 객석 반응/선물 UI 참고. |

### 인사이트
- **Cluster**가 "가상 공간에서 공연한다"는 관점에서 Snack 플랫폼과 가장 가까움.
- 일본 사용자는 이미 REALITY/SHOWROOM을 통해 **아바타/가상 라이브**에 익숙. 연극이라는 새로운 용도를 부각해야 함.

---

## 2. 글로벌 다중 아바타 공간 · 이벤트 플랫폼

참가자들이 아바타로 모여 실시간 음성/채팅하는 공간들.

| 사이트 | URL | 카테고리 | 특징 | 우리와의 차이 / 참고점 |
|---|---|---|---|---|
| **VRChat** | https://vrchat.com | 소셜 VR | 월드 기반 다중 아바타 공간. 연극/공연 커뮤니티 많음 | VR/3D 중심. 우리는 웹 기반 2D 아바타. **묵대/연극 커뮤니티 문화**는 참고. |
| **Gather Town** | https://gather.town | 2D 픽셀 메타버스 | 방 기반 음성/채팅, 화상회의 대체. 교육/이벤트에 많이 쓰임 | **2D + 방 기반**이라 우리와 구조가 비슷. 룸 목록, 참가자 위치, 화면 공갈 UI 참고. |
| **Mozilla Hubs** | https://hubs.mozilla.com | 웹 기반 3D 공간 | WebRTC 음성/채팅, 아바타, 방 만들기. 별도 설치 불필요 | 웹 퍼스트. 우리는 2D 아바타 + 연극 특화. |
| **Spatial** | https://www.spatial.io | 3D 이벤트 공간 | 브랜드/공연/전시 활용. 웹/모바일 지원 | B2B 이벤트 중심. 룸 커스터마이징/브랜딩 UI 참고. |
| **Kumospace** | https://www.kumospace.com | 방 기반 비디오 채팅 | 2D 공간에서 가까이 있을 때 음성 연결. 교육/리허설 활용 | 연극 리허설/소규모 공연과 유사한 사용 시나리오. |

### 인사이트
- **Gather Town**의 "방 안에서 위치 기반 음성" 구조는 Snack의 묵대/객석 배치와 잘 결합할 수 있음.
- **VRChat**의 연극 커뮤니티 사례를 조사하면, 연극 플랫폼으로서의 기능 우선순위(역할 배정, 리허설 모드, 본공연 모드 등)를 더 정교하게 잡을 수 있음.

---

## 3. VTuber 방송 스튜디오 / 툴

Snack 룸 내 아바타 렌더링/방송 UI를 설계할 때 참고.

| 사이트 | URL | 카테고리 | 특징 | 우리와의 차이 / 참고점 |
|---|---|---|---|---|
| **VTube Studio** | https://denchisoft.com/vtubestudio | Live2D 방송 툴 | 핫키, 아이템, 트래킹 캘리브레이션 UI | **아바타 캘리브레이션 UI**의 기준. 우리는 웹에서 동일한 경험 제공. |
| **VSeeFace** | https://www.vseeface.net | 3D VTuber 프로그램 | VRM 기반, 핫키, 손 추적, OSC | **핫키/필살기 표정 UI** 참고. |
| **OBS Studio** | https://obsproject.com | 방송 소프트웨어 | 씬/소스/오디오 믹서, 크로마키, 가상캠 | Snack `StreamPanel` 목업의 레퍼런스. OBS 출력은 P2 방송 송출 옵션이며 구현 시 `obs_token` 필수. |

### 인사이트
- OBS의 **씬/소스/오디오 믹서** 레이아웃은 방장/스트리머 콘솔 UI의 기본 골격.
- VTube Studio의 **캘리브레이션 + 핫키** 흐름을 Green Room(MOD-05)에 녹여낼 것.

---

## 4. 기능별 UI 레퍼런스 매핑

| Snack 기능 | 참고 서비스 | 참고 UI |
|---|---|---|
| 룸 목록 / 로비 | Cluster, Gather Town | 이벤트 카드, 태그, 잠금 표시, 인원수 |
| Green Room (대기실) | VTube Studio, Zoom | 칵라/마이크 미리보기, 장치 선택, 입장 버튼 |
| 묵대 레이아웃 2·4·6인 | Cluster, VRChat | 슬롯 배치, 칵라 위치, 배경 선택 |
| 참가자 HUD | Zoom, Cluster | active speaker, 뮤트, 방장 왕관 |
| 채팅 / 반응 | Twitch, YouTube Live, Cluster | 채팅창, 이모트/리액션 버튼 |
| 방장 콘솔 | OBS, Twitch Moderator | 강퇴, 뮤트, 슬롯 교체, 배경 변경 |
| 대본 텔레프롬프터 | Teleprompter 앱, 스피커 노트 | 스크롤 속도, 역할 하이라이트, "내 차례" 표시 |
| OBS 출력 / 크로마키 | OBS Studio | 투명 출력, 그린백, 풀스크린 모드 |

---

## 5. 이미지 자산 보관

스크린샷/캡처는 아래 폴터에 저장:

```
design/reference-screenshots/platform/
  japan-metaverse/      # Cluster, ZEPETO, REALITY, SHOWROOM
  global-spaces/        # VRChat, Gather Town, Hubs, Spatial, Kumospace
  broadcast-tools/      # VTube Studio, VSeeFace, OBS
```

파일명 예시: `platform-cluster-room-list.png`, `platform-obs-mixer.png`

---

## 6. 다음 조사 방향

- **Cluster** 실제 이벤트 생성/입장 플로우 캡처.
- **Gather Town** 룸 에디터 UI 캡처(배경 업로드, 참가자 스폰 위치 등).
- **VRChat** 연극/공연 월드의 역할 배정/리허설 사례 조사.
- 각 서비스의 **모바일 뷰어/관전 모드** UI 수집 → Snack MOB-02 참고.
