---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·타입 정의 -->
<!-- 상태머신: trackingStore 기본, 스펙: FEATURE-SPEC.md MOD-05/MOD-06, 데이터 스키마: DATA-SCHEMA.md -->

# 3. GreenRoom

입장 전 아바타·소리·배경 미리보기 및 디바이스 트러블슈팅 페이지. 웹캠(MediaPipe 추적), 마이크(LiveKit 테스트), 배경 선택 시뮬레이션을 순차적으로 검증한 후 방 입장을 허용.

> **구현 상태 (2026-07-08, MOD-05/06 MVP = `src/pages/GreenRoomPage.tsx`, 라우트 `/rooms/:roomId/ready`)** — 이 계약은 풀비전이고 as-built 는:
> - 아바타 프리뷰 = `SelfAvatar` 재사용(무대와 동일 파이프라인, 송신 no-op) · 마이크 = getUserMedia+AnalyserNode 피크 미터(100ms, `ProgressBar` 재사용) · 배경 선택은 v1 제외(방 배경은 호스트 영역).
> - **소프트 게이트(주인님 콜)**: 트래킹/권한 실패여도 [무대로 입장] 가능 — 8동작 필수 검증(CalibrationWizard)·"검증 후 입장 허용"은 외부 공개 직전에 조이는 후속(플래그 1개). CALIBRATING 상태는 trackingStore 에 없음(INITIALIZING→TRACKING).
> - `cb.greenroomSkip`(localStorage) 체크 시 이후 입장은 분장실을 스치지 않고 직행. 로비의 입장·생성·초대 수락 전부 `/ready` 경유.
> - 분장실은 순수 로컬 단계 — 조인·비번·정원 게이트는 RoomPage 가 담당(순서: 로비 → ready → 조인).
> - **UIUX 리디자인(2026-07-10, 주인님 콜 "작고 통일감 없음")**: 대극장 내부 원화 디밍+블러 백드롭(`.scene-veil` — 대극장→분장실→조인 대기가 한 시퀀스) + 아치 금장 거울(`mirror-frame--arch`, 데스크탑 뷰포트 높이 62%·최대 560px "거울이 많이 커야해") + 점검 패널 `interior-panel`(목조 문법). 데스크탑 2열(거울|패널)·모바일 1열. 웹캠 pip 은 전 화면 숨김(SelfAvatar — video 는 MediaPipe 입력 소스라 시각만 숨김). 로직 무변경.

## Props Interface

```typescript
interface GreenRoomProps {
  /**
   * 입장할 room의 ID
   */
  roomId: string;

  /**
   * "방 입장" 버튼 클릭 시 콜백
   * 이 시점에서 실제 LiveKit 연결 시작
   * onEnter() → RoomView로 네비게이션
   */
  onEnter: () => void;

  /**
   * "취소" 또는 "돌아가기" 버튼 클릭 콜백
   * onCancel() → /lobby로 네비게이션
   */
  onCancel: () => void;

  /**
   * (선택) LiveKit 토큰
   * onEnter 호출 전에 서버에서 가져와 전달
   * 또는 onEnter 내부에서 가져옴
   */
  livekitToken?: string;

  /**
   * (선택) LiveKit 서버 URL
   * 기본값: environment variable VITE_LIVEKIT_URL
   */
  livekitUrl?: string;

  /**
   * GreenRoom은 host/actor 전용. viewer/mobile은 Viewer Gate로 분기한다.
   */
  role?: 'host' | 'actor';

  /**
   * 카메라 실패 시 정적 아바타+음성으로 배우 입장
   */
  onEnterVoiceOnly?: () => void;

  /**
   * 카메라/마이크 실패 시 관전자로 다운그레이드
   */
  onEnterAsViewer?: () => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `userStore` | `userId` | ✓ | | 현재 사용자 ID |
| `userStore` | `selectedModelId` | ✓ | | 선택한 아바타 모델 ID |
| `trackingStore` | `avatarState` | ✓ | ✓ | 추적 상태 ('IDLE'\|'INITIALIZING'\|'CALIBRATING'\|'TRACKING') |
| `trackingStore` | `blendshapes` | ✓ | ✓ | 현재 blendshape 값 (52ch Float32Array) |
| `trackingStore` | `calibrationVersion` | ✓ | ✓ | 캘리브레이션 버전 (추적 신뢰도) |
| `trackingStore` | `startTracking()` | | ✓ | MediaPipe 초기화 + 웹캠 시작 |
| `trackingStore` | `stopTracking()` | | ✓ | MediaPipe 정리 (페이지 떠날 시) |
| `audioStore` | `selectedInputDeviceId` | ✓ | ✓ | 선택한 마이크 디바이스 ID |
| `audioStore` | `selectedOutputDeviceId` | ✓ | ✓ | 선택한 스피커 디바이스 ID |
| `audioStore` | `testInputLevel` | ✓ | ✓ | 마이크 입력 레벨 (0-100) |
| `audioStore` | `testOutputLevel` | ✓ | ✓ | 스피커 출력 레벨 (0-100) |
| `stageStore` | `backgroundUrl` | ✓ | ✓ | 현재 배경 URL (미리보기) |

**쓰기:** GreenRoom만 trackingStore 시작/정지, audioStore 디바이스 선택 업데이트.

## 상태 머신: GreenRoom Avatar & Device Flow

```
┌──────────────────┐
│ IDLE             │ (처음 진입)
└────┬─────────────┘
     │ user clicks "추적 시작"
     ▼
┌──────────────────────┐
│ INITIALIZING         │ (웹캠 권한 요청 + MediaPipe load)
└────┬─────────────────┘
     │ success: 웹캠 허용
     │ failure: 웹캠 거절 → "권한을 허용하세요" 팝업
     ▼
┌──────────────────────┐
│ CALIBRATING          │ (얼굴 인식 + 추적 시작, 실시간 업데이트)
│                      │ • blendshape 30Hz 갱신
│                      │ • 아바타 캔버스 실시간 렌더
└────┬─────────────────┘
     │ 얼굴 감지 성공 + calibration_version 갱신
     ▼
┌──────────────────────┐
│ TRACKING             │ (정상 추적 중)
│                      │ • blendshape 30Hz continuous
│                      │ • 아바타 애니메이션 정상 작동
└────────────────────┘
     
     (GreenRoom 페이지 내 다른 검증)
     │ 마이크 테스트 + 배경 선택 + 모든 체크 완료
     ▼
┌──────────────────────────┐
│ READY (GreenRoom 관점)   │
│ avatar_state = TRACKING  │
│ + 마이크 OK              │
│ + 배경 선택 OK           │
└─────┬────────────────────┘
      │ user clicks "방 입장"
      ▼
   onEnter() → RoomView
```

## 검증 단계 (4-Step Flow)

### Step 1: 아바타 추적 검증 (Avatar Tracking)

```
1. GreenRoom mount
   - trackingStore.avatar_state = IDLE
   - `userStore.selectedModelId`를 이용해 AvatarCanvas load

2. "아바타 추적 시작" 버튼 클릭
   → trackingStore.startTracking() 호출
   → trackingStore.avatar_state = INITIALIZING

3. MediaPipe 초기화
   - 웹캠 권한 요청 (browser permission)
   - 거절 시: "설정 > 카메라 > snack-web 허용 하세요" 가이드 + IDLE로 복귀
   - 승인 시: CALIBRATING 진입

4. CALIBRATING 상태
   - MediaPipe facemesh + 추적 시작
   - 얼굴 감지 대기 (최대 3초)
   - 얼굴 감지 성공 시:
     ✓ calibration_version 증가
     ✓ avatar_state = TRACKING
     ✓ "✓ 추적 성공" 메시지 + 녹색 체크
   - 얼굴 감지 실패 시:
     ✗ "얼굴을 인식하지 못했습니다. 다시 시도하세요."
     ✗ avatar_state = IDLE로 복귀
     ✗ "다시 시작" 버튼 활성화
     ✗ 마이크가 정상일 때 [정적 아바타+음성으로 입장] 버튼 표시
     ✗ 모바일/게스트/카메라 없음이면 [관전으로 입장] 버튼 표시

5. TRACKING 상태 (실시간)
   - AvatarCanvas가 blendshape 30Hz 수신 + 렌더
   - 사용자가 표정 변경 시 실시간 반영
   - 얼굴 미인식 시 (ROOM-11 fallback):
     - trackingStore.is_tracking_failed = true
     - "추적 손실, 기본 표정으로 전환" 안내
     - (진행 방지 아님, 경고만)
```

### Step 2: 마이크 테스트 (Audio Input)

```
1. "마이크 테스트" 섹션
   - 마이크 디바이스 드롭다운 (userGetDisplayMedia → enumerateDevices)
   - "테스트 시작" 버튼

2. "테스트 시작" 클릭
   → audioStore.startInputLevelTest()
   → LiveKit local participant에 audio track 추가
   → 실시간 입력 레벨 표시 (VU 미터)

3. 사용자 마이크에 대고 말하기
   - 레벨이 0이면: "마이크를 감지하지 못했습니다"
     (거절됨, OS별 설정 가이드 표시 - G-265)
     └─ [TroubleshootingPanel]
        ├─ "⚠️ 마이크 접근 권한이 필요합니다" 또는 "마이크를 감지하지 못했습니다"
        ├─ 단계별 설정 가이드 (OS 자동 감지):
        │  ├─ macOS: "시스템 설정 > 보안 및 개인정보 보호 > 마이크 > snack-web 허용 확인"
        │  ├─ Windows: "설정 > 개인정보 보호 및 보안 > 마이크 > snack-web 허용 확인"
        │  └─ 공통: "다른 앱에서 마이크를 사용 중인지 확인 (Zoom, Teams 등)"
        ├─ "[다시 시도]" 버튼 → audioStore.startInputLevelTest() retry
        └─ "[관전으로 입장]" 버튼 → onEnterAsViewer() (voice-only actor 폴백 불가 시)
   - 레벨 > 0이면: ✓ "마이크 정상" 표시

4. "테스트 완료" 또는 5초 타임아웃
   → audioStore.stopInputLevelTest()
   → track cleanup
   → 다음 단계로
```

### Step 3: 스피커 테스트 (Audio Output)

```
1. "스피커 테스트" 섹션
   - 스피커 디바이스 드롭다운
   - "테스트 음 재생" 버튼

2. "테스트 음 재생" 클릭
   → audioStore.playTestTone()
   → 3초 테스트 음성 재생 (440Hz sine wave)

3. 사용자가 스피커에서 음성 들음
   - 들으면: ✓ "스피커 정상" 표시
   - 안 들리면: 스피커 선택 다시 확인

4. 테스트 음성 자동 종료 (또는 "완료" 클릭)
   → 다음 단계로
```

### Step 4: 배경 미리보기 (Scene Preview)

```
1. "배경 선택" 섹션 (G-265)
   - scenes 테이블에서 목록 조회
   - 썸네일 grid 또는 carousel 표시
   - 선택 안내: "배경은 방장이 언제든 바꿀 수 있으니 나중에 선택해도 됩니다"

2. 배경 선택 (클릭)
   → stageStore.backgroundUrl = selected_scene.image_url
   → MainViewComponent 시뮬레이션으로 배경 표시
   → 아바타 뒤에 배경이 보임 (미리보기)

3. "좋아요" 또는 다음 배경 선택 가능, 또는 선택 건너뛰기 (G-265)
   → 배경 미선택 시 기본값: 'studio-white' (투명 배경 또는 흰색 스튜디오)
   → stageStore.backgroundUrl이 NULL이어도 "방 입장" 버튼 활성화 (나중 변경 가능)
   → 최종 확정 (또는 방에서 호스트가 바꿀 수 있음을 안내)
```

### Step 5: 대기실 참가자 상태 표시 (G-62)

```
1. ParticipantReadyList (새 섹션)
   - 위치: GreenRoom 우측 패널 또는 하단 바
   
2. 참가자 목록 표시:
   - Supabase Realtime room_participants 구독 (state = 'waiting')
   - 각 참가자 행:
     a. avatar_thumbnail (50x50px, users.avatar_url)
     b. display_name (users.display_name)
     c. role 배지 ("배우" / "관전자")
     d. is_ready 상태 (✓ = 준비됨, ⏳ = 준비 중)
   
3. 자신 강조 표시:
   - 현재 로그인 사용자는 특별 강조 (border, bg color)
   
4. "준비 완료" 버튼:
   - GreenRoom 우측/하단 상단에 배치
   - 클릭 → UPDATE room_participants SET is_ready = true WHERE user_id = ? AND room_id = ?
   - 자신의 is_ready 토글 가능
   
5. "모두 준비됨" 신호:
   - room_participants의 모든 is_ready = true 확인
   - 호스트에게만: "모두 준비됐습니다. 무대로 나갈 준비가 되셨나요?" 알림
   - 호스트 "무대로 나가기" 버튼 활성화
```

### Step 6: 최종 미리보기 카드 (G-165)

```
1. 표시 조건:
   - Step 1~4 통과 후, "방 입장" 버튼 바로 위에 FinalPreviewCard 표시
   - 늦참으로 GreenRoom을 건너뛰는 경우에도 3초 compact preview만 표시 가능

2. 카드 내용:
   - 3초 라이브 아바타 미리보기: 현재 blendshape, 선택 배경, 닉네임/역할 배지
   - 오디오 요약: 선택된 마이크 이름 + 최근 3초 입력 레벨 peak
   - 입장 모드: actor / voice-only actor / viewer downgrade
   - "친구에게 이렇게 보여요" 확인 문구

3. 액션:
   - [괜찮아요, 입장] → onEnter()
   - [다시 조정] → 마지막 실패 또는 사용자가 선택한 단계로 스크롤
   - [관전으로 입장] → onEnterAsViewer()

4. 상태 저장:
   - FinalPreviewCard는 별도 DB 저장 없음. GreenRoom local state + tracking/audio store snapshot만 사용
```

**MUST NOT**
- ❌ FinalPreviewCard 확인 없이 actor 기본 입장 버튼 활성화
- ❌ voice-only actor를 일반 actor처럼 표시 (입장 모드를 명시)
- ❌ viewer/mobile에게 카메라 미리보기를 요구

## 최종 진입 조건

```
✓ trackingStore.avatar_state = TRACKING 또는 사용자가 명시적으로 voice-only actor 폴백 승인
✓ audioStore.test_input_level > 0 (마이크 검출)
✓ audioStore.test_output_level > 0 또는 스피커 테스트 완료
✓ stageStore.backgroundUrl 선택 (기본값 있어도 OK)
✓ FinalPreviewCard에서 사용자가 최종 확인

→ "방 입장" 버튼 활성화
→ onEnter() 콜백 호출
  ├─ LiveKit 토큰 요청 (아직 없으면)
  ├─ RoomView로 네비게이션
  └─ roomStore 초기화 + LiveKit 연결 시작
```

## 늦참 입장 시 GreenRoom 건너뜀 + 준비 상태 동기화 (G-65)

**진입 조건:** 공연이 이미 시작된 경우 (rooms.status = 'live')

```
1. 사용자가 로비에서 진행 중인 방 클릭
   → FacialGateModal 표시 (얼굴 검증)
   
2. 얼굴 검증 통과 후
   → room.status 확인
   
3. room.status = 'live'일 경우 (G-65 늦참 입장 프로토콜):
   ├─ GreenRoom 건너뜀 (아바타 추적 테스트 스킵)
   ├─ 바로 RoomView로 진입
   ├─ room_participants INSERT (is_ready=false 기본값)
   ├─ rooms.playback_position_ms로 영상 동기화
   ├─ character_slot 배정 시도:
   │  ├─ 슬롯 있음: role='actor' (호스트 배정 대기)
   │  └─ 슬롯 없음: role='viewer' 자동 전환
   └─ 토스트 "공연이 이미 시작됐어요. 현재 위치부터 참가합니다." (3초)

4. room.status = 'waiting'일 경우:
   └─ GreenRoom 정상 진입 (기존 흐름)
```

### 준비 상태 동기화 (G-65 늦참 진입 후)

늦참으로 GreenRoom을 건너뛴 참가자도 이미 방에 있는 참가자들의 준비 상태를 실시간 동기화해야 한다.

**방법: Realtime 구독**

```typescript
// RoomView 마운트 시, 모든 참가자는 room_participants.is_ready 변화 감지
useEffect(() => {
  const sub = supabase
    .channel(`room:${roomId}`)
    .on('postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'room_participants',
        filter: `room_id=eq.${roomId}`
      },
      (payload) => {
        // 각 참가자의 is_ready 상태 업데이트
        roomStore.updateParticipantReadyState(payload.new.user_id, payload.new.is_ready);
      }
    )
    .subscribe();
  
  return () => sub.unsubscribe();
}, [roomId]);

// ParticipantReadyList 재렌더
// 늦참자가 방에 들어올 때:
// - 상단: "모든 준비 완료" 신호가 아직 있으면 유지
// - 늦참자는 is_ready=false로 시작
// - 호스트가 "모두 준비됨" 브로드캐스트 시, 늦참자도 다른 참가자들의 상태를 수신
```

**호스트의 "모두 준비됨" 신호 전파:**

```typescript
// 호스트만 수행
function broadcastAllReady() {
  room.localParticipant.publishData(
    new TextEncoder().encode(JSON.stringify({
      type: 'all_participants_ready',
      timestamp: Date.now(),
    })),
    { reliable: true },
    'room-authority'
  );
  // 모든 참가자에게 "무대로 나갈 준비" 신호 전달
}
```

**MUST NOT:**
- 늦참이어도 얼굴 검증 요구 (G-65 별도 스킵)
- 실패 시 무한 로딩 (타임아웃 설정 필수)
- 늦참자를 준비 상태 확인 UI에서 숨김 (모든 참가자 표시)

## voice-only / viewer 폴백 정책

- 카메라 거절·미지원·얼굴 미인식이 반복되어도 마이크가 정상이라면 actor를 완전히 막지 않는다.
- 사용자가 `[정적 아바타+음성으로 입장]`을 누르면 `room_participants.role='actor'`, `is_tracking_failed=true`, `role_source='fallback_no_camera'`로 입장한다.
- 마이크도 실패하면 actor 입장은 막고 `[관전으로 입장]`만 허용한다. 이때 `role='viewer'`, LiveKit `canPublish=false`, `canPublishData=false`로 발급한다.
- 모바일은 GreenRoom을 마운트하지 않고 MobileViewer/Viewer Gate로 바로 분기한다.

## 트러블슈팅 UI 패턴 (MOD-06)

```typescript
interface TroubleshootingGuide {
  issue: 'NO_WEBCAM' | 'NO_MICROPHONE' | 'NO_SPEAKER' | 'TRACKING_FAILED';
  message: string;
  solutionSteps: string[];
  osSpecificGuide?: {
    darwin | windows | linux: string;
  };
}

// 예시:
const TROUBLESHOOTING = {
  NO_WEBCAM: {
    issue: 'NO_WEBCAM',
    message: '웹캠을 감지하지 못했습니다.',
    solutionSteps: [
      '1. 웹캠이 물리적으로 연결되어 있는지 확인하세요.',
      '2. 다른 앱에서 웹캠을 사용 중인지 확인 (Zoom, Teams 등).',
      '3. 브라우저 설정 > 프라이버시 > 카메라 > snack-web 허용 확인.',
      '4. 브라우저 재시작 후 다시 시도하세요.'
    ],
    osSpecificGuide: {
      darwin: 'macOS: 시스템 설정 > 보안 및 개인정보 보호 > 카메라',
      windows: 'Windows: 설정 > 개인정보 보호 및 보안 > 카메라'
    }
  },
  // ... NO_MICROPHONE, NO_SPEAKER, TRACKING_FAILED
};
```

### 웹캠 권한 거절 시 흐름

```
1. trackingStore.startTracking() 호출
   → navigator.mediaDevices.getUserMedia({video: true})
   → 권한 거절

2. GreenRoom UI:
   └─ [TroubleshootingPanel]
      ├─ "⚠️ 웹캠 접근 권한이 필요합니다"
      ├─ 단계별 설정 가이드 (OS 자동 감지)
      ├─ 스크린샷/비디오 가이드 (선택)
      └─ "권한 허용 후 다시 시도" 버튼
         └─ onClick → trackingStore.startTracking() retry
```

### 얼굴 미인식 시 폴백 (ROOM-11)

```
1. CALIBRATING 상태에서 3초 이상 얼굴 감지 안 됨
   → trackingStore.is_tracking_failed = true
   → UI: "얼굴을 인식하지 못했습니다."

2. 경고: "조명·거리·각도를 조정 후 다시 시도하세요."
   → "다시 시작" 버튼 활성화
   → retry 허용 (최대 3회)

3. 3회 실패 후:
   → "트래킹 건너뛰기" 옵션 (P0에선 비활성, 나중 추가)
   → 또는 "지원팀에 문의" 버튼
```

## Supabase 접근

| 테이블 | 작업 | 시점 | 용도 |
|---|---|---|---|
| `scenes` | SELECT * | GreenRoom mount | 배경 목록 조회 |
| `room_participants` | UPDATE is_ready | "준비 완료" 버튼 클릭 (Step 5) | 준비 상태 토글 (actor·host만) |
| (없음) | — | — | 웹캠/마이크는 browser API (getUserMedia) |

> DB 쓰기: scenes SELECT + is_ready UPDATE 포함. 상태는 trackingStore/audioStore, DB 쓰기는 is_ready 토글에 한정.

## DataChannel 의존성

**없음** — GreenRoom은 입장 전 로컬 검증 단계다. 실제 LiveKit 연결과 DataChannel 생성은 RoomView 진입 후 시작한다.

## 금지 사항 (MUST NOT)

- ❌ **트래킹 초기화 전 무조건 방 입장 허용** — TRACKING 또는 사용자의 voice-only actor 폴백 승인이 필요
- ❌ **카메라 실패를 전체 입장 실패로 처리** — 마이크 정상 시 정적 아바타+음성, 마이크 실패 시 viewer 다운그레이드 제공
- ❌ **viewer/mobile에 GreenRoom 강제** — Viewer Gate만 통과
- ❌ **마이크 권한 없이 진행** — audio input test 통과 또는 "스킵(나중에 설정)" 선택지 필수
- ❌ **MediaPipe 초기화 생략** — actor 기본 경로는 반드시 한 번은 웹캠 권한 요청 및 추적 시작. 단, viewer/mobile/voice-only actor 폴백은 예외로 문서화한다
- ❌ **동시에 여러 웹캠 stream 활성화** — trackingStore.startTracking() 중복 호출 금지 (cleanup 생략 → 메모리 누수)
- ❌ **배경 선택 강제** — stageStore.backgroundUrl 미선택 시 기본값(NULL) 허용, 나중에 호스트가 변경 가능
- ❌ **트러블슈팅 UI 생략** — NO_WEBCAM/NO_MICROPHONE 시 설정 가이드 필수 (사용자 편의성)
- ❌ **onEnter 전에 LiveKit 연결** — GreenRoom은 미리보기만. 실제 RoomView에서 연결.
- ❌ **페이지 떠날 때 MediaPipe/audio cleanup 생략** — useEffect cleanup에서 trackingStore.stopTracking() + stopInputLevelTest() 필수 (GPU/메모리 누수 방지)

## 컴포넌트 관계

```
[GreenRoom]
  ├─ useEffect (cleanup)
  │  └─ return () => trackingStore.stopTracking()
  │
  ├─ [AvatarPreviewSection]
  │  ├─ [AvatarCanvas] (PixiJS)
  │  │  └─ subscribe trackingStore.blendshapes (30Hz)
  │  │
  │  └─ "아바타 추적 시작" 버튼
  │     └─ trackingStore.startTracking()
  │        → avatar_state: IDLE → INITIALIZING → CALIBRATING → TRACKING
  │
  ├─ [AudioTestSection]
  │  ├─ 마이크 디바이스 선택 드롭다운
  │  │  └─ audioStore.selected_input_device_id = device_id
  │  │
  │  ├─ "마이크 테스트" 버튼
  │  │  └─ audioStore.startInputLevelTest()
  │  │     ├─ getUserMedia({audio: {deviceId: selected}})
  │  │     ├─ 실시간 레벨 표시 (VU 미터)
  │  │     └─ "✓ 마이크 정상" 또는 "⚠️ 신호 없음"
  │  │
  │  ├─ 스피커 디바이스 선택 드롭다운
  │  │
  │  └─ "스피커 테스트" 버튼
  │     └─ audioStore.playTestTone()
  │        └─ 3초 테스트 음성 재생
  │
  ├─ [BackgroundPreviewSection]
  │  ├─ Carousel/Grid: scenes[] 표시
  │  │  └─ onClick → stageStore.backgroundUrl = scene.image_url
  │  │
  │  └─ [MainViewComponent] (미리보기)
  │     └─ stageStore.backgroundUrl 렌더
  │
  ├─ [ParticipantReadyList] (우측 패널, G-62)
  │  ├─ Supabase Realtime room_participants 구독
  │  ├─ 각 참가자:
  │  │  ├─ avatar_thumbnail (50x50)
  │  │  ├─ display_name
  │  │  ├─ role (배우/관전자)
  │  │  └─ is_ready (✓/⏳)
  │  └─ "준비 완료" 버튼
  │     └─ UPDATE room_participants SET is_ready = true
  │
  ├─ [TroubleshootingPanel] (조건부)
  │  ├─ (avatar_state = IDLE이고 실패했을 시)
  │  │  └─ NO_WEBCAM 안내
  │  │
  │  ├─ (test_input_level = 0일 시)
  │  │  └─ NO_MICROPHONE 안내
  │  │
  │  └─ (is_tracking_failed = true)
  │     └─ TRACKING_FAILED 안내 + 다시 시작
  │
  └─ [ActionButtonsSection]
     ├─ "돌아가기" 버튼
     │  └─ onClick → onCancel() → /lobby
     │
     └─ "방 입장" 버튼 (조건부 활성화)
        ├─ enabled: avatar_state = TRACKING && test_input_level > 0
        └─ onClick → onEnter()
           └─ RoomView로 네비게이션 (LiveKit 연결 시작)
```

## 검증 체크리스트

### 구현 체크

- [ ] MediaPipe 초기화 + 웹캠 권한 요청 (getUserMedia)
- [ ] trackingStore.avatar_state 상태 전환 정확함 (IDLE→INITIALIZING→CALIBRATING→TRACKING)
- [ ] 얼굴 감지 실패 시 3초 타임아웃 + retry UI
- [ ] 마이크 입력 레벨 테스트 (webkitAudioContext 또는 analyzer)
- [ ] 스피커 테스트 음성 재생 (OscillatorNode 또는 audio file)
- [ ] scenes 테이블 조회 + 배경 미리보기 동기
- [ ] 페이지 떠날 때 cleanup (MediaPipe stop, audio track stop)
- [ ] 에러 UI + 트러블슈팅 가이드 (OS 자동 감지)

### 리뷰 체크

- [ ] Props interface가 완전한가?
- [ ] Store 읽기/쓰기 구분이 정확한가? (GreenRoom만 start/stop)
- [ ] 상태 머신이 정확한가? (avatar_state 전환)
- [ ] 금지 사항 위반이 없는가?
- [ ] MediaPipe/WebRTC 리소스 cleanup이 충분한가?
- [ ] 접근성(음성 안내, 키보드 네비 등)을 만족하는가?
- [ ] 모바일(iOS/Android) 대응이 필요한가? (웹캠 권한 등)

---

## 관련 문서

- `../state-machines/` — trackingStore, audioStore 상태 머신 (향후 정의)
- `../FEATURE-SPEC.md` — MOD-05 (Green Room), MOD-06 (디바이스 트러블슈팅)
- `../DATA-SCHEMA.md §1.7` — scenes 테이블
- `./AvatarCanvas.md` — 아바타 캔버스 렌더링
- `./CalibrationWizard.md` — 상세 얼굴 추적 마법사 (선택적 추가)

---

## 한줄정리

snack-web의 GreenRoom은 입장 전 아바타 추적(MediaPipe 초기화 및 TRACKING 상태 확인), 마이크/스피커 테스트, 배경 미리보기를 순차 검증한 후 모든 조건 충족 시 "방 입장" 버튼을 활성화하여 RoomView로 진입하며, 트러블슈팅 가이드(웹캠/마이크 거절 시)로 사용자 편의성을 제공한다.
