---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->
<!-- 스택: LiveKit 디바이스 API, Zustand settingsStore, Supabase expression_presets, krisp 노이즈 억제 -->

# 20. SettingsPage

모달 또는 GreenRoom 내 설정 패널. 오디오/웹캠 디바이스 선택(SET-01·02), 단축키 설정(SET-03), 언어 선택(SET-04), 품질 자동/수동 조절(SET-05), 노이즈 억제 ON/OFF(SET-06), 개인 차단/뮤트/PTT(SET-07), 크레딧 잔액·생성 품질·예산 설정(SET-08)을 통합 관리.

## Props Interface

```typescript
interface SettingsPageProps {
  /**
   * 모달 열기 상태
   */
  isOpen: boolean;

  /**
   * 모달 닫기 콜백
   * 저장되지 않은 변경사항이 있으면 경고 후 진행 (onClose 실행)
   * signature: () => void
   */
  onClose: () => void;

  /**
   * (선택) 초기 활성 섹션 (탭명)
   * 기본값: "device"
   * 가능한 값: "device" | "accessibility" | "performance" | "privacy" | "credits" | "security" | "account" | "notifications"
   */
  defaultSection?: 'device' | 'accessibility' | 'performance' | 'privacy' | 'credits' | 'security' | 'account' | 'notifications';

  /**
   * (선택) 호스트 모드 여부
   * true면 "개인 차단(SET-07)" 섹션에서 다른 참가자 차단 UI 표시
   * (호스트 콘솔에서 사용될 경우)
   */
  isHost?: boolean;

  /**
   * (선택) 현재 room_id
   * SET-05 품질 레벨 → expression_presets 저장 시 사용
   * 없으면 로컬 저장소(localStorage)만 사용
   */
  roomId?: string;

  /**
   * (선택) 저장 후 콜백
   * signature: (changes: SettingsChanges) => void
   */
  onSave?: (changes: SettingsChanges) => void;
}

/**
 * 설정 변경 요약 (onSave 콜백 페이로드)
 */
interface SettingsChanges {
  audio?: { inputDeviceId?: string; outputDeviceId?: string };
  video?: { deviceId?: string };
  keyboard?: { hotkeys?: Record<string, string> };  // keybind: action
  language?: 'ko' | 'ja' | 'en';
  quality?: { mode: 'auto' | 'manual'; level?: 'low' | 'medium' | 'high' };
  audio_filter?: { krisp_enabled?: boolean };
  privacy?: { muted?: boolean; camera_off?: boolean; ptt_enabled?: boolean };
  accessibility?: {
    captions_enabled?: boolean;
    captions_language?: 'ko' | 'ja' | 'en';
    captions_size?: 'small' | 'medium' | 'large';
    reduce_motion?: boolean;
    high_contrast?: boolean;
    font_size_percent?: number;  // 75, 100, 125, 150
    photosensitive_mode?: boolean;
  };
  credits?: { quality_preset?: 'draft' | 'standard' | 'premium'; monthly_budget?: number };
  security?: { email?: string; passwordChanged?: boolean };  // AUTH-04
  notifications?: {                                           // SET-14 / PROFILE-03
    room_invite?: boolean;
    room_scheduled?: boolean;
    room_full?: boolean;
    credit_low?: boolean;
  };
}
```

## Store 의존성

### `settingsStore` (신규 Slice)

```typescript
interface SettingsState {
  // SET-01: 오디오 입력
  audioInput: {
    deviceId: string;
    devices: MediaDeviceInfo[];
    isLoading: boolean;
    error?: Error;
  };

  // SET-02: 웹캠
  videoInput: {
    deviceId: string;
    devices: MediaDeviceInfo[];
    isLoading: boolean;
    error?: Error;
  };

  // SET-03: 단축키 (핫키)
  hotkeys: {
    // 예시: { 'Shift+K': 'ability_ultimate', 'Space': 'ptt_toggle' }
    keyBinds: Record<string, string>;
    isListening: boolean;
    recordingKey?: string;
  };

  // SET-04: UI 언어
  language: 'ko' | 'ja' | 'en';

  // SET-05: 품질 조절
  quality: {
    mode: 'auto' | 'manual';
    currentLevel: 'low' | 'medium' | 'high';
    // auto 모드: 네트워크·CPU 자동 감지
    // manual 모드: 사용자가 직접 선택
    // low: 해상도↓, 인원 제한↓, 렌더 품질↓
    // high: 해상도↑, 인원 증가, 렌더 품질↑
    presetName?: string;  // 저장된 프리셋명 (expression_presets)
  };

  // SET-06: 노이즈 억제
  audioFilter: {
    krispEnabled: boolean;
    krispLevel?: 'light' | 'standard' | 'aggressive';
  };

  // SET-07: 개인 차단·뮤트·PTT
  privacy: {
    isMuted: boolean;
    cameraOff: boolean;
    pttMode: boolean;  // Push-To-Talk (스페이스바 누르면 음성)
    pttKey: string;    // 기본: 'Space'
  };

  // SET-09~13: 접근성 (WCAG 2.1 AA 준수)
  accessibility: {
    // SET-09: 자막/CC
    captions_enabled: boolean;
    captions_language: 'ko' | 'ja' | 'en';
    captions_size: 'small' | 'medium' | 'large';
    captions_background_opacity: number;  // 0~100%
    
    // SET-10: 모션감소 (prefers-reduced-motion)
    reduce_motion: boolean;
    
    // SET-11: 고대비 (WCAG AA 대비 4.5:1)
    high_contrast: boolean;
    
    // SET-12: 폰트크기 (percentage)
    font_size_percent: number;  // 75, 100, 125, 150
    
    // SET-13: 깜빡임경고 (광감성 간질 방지)
    photosensitive_mode: boolean;  // 깜빡임 > 3Hz 제거
  };

  // SET-08: 크레딧·예산
  credits: {
    balance: number;
    totalSpent: number;
    generationQuality: 'draft' | 'standard' | 'premium';
    monthlyBudget?: number;
  };

  // AUTH-04: 이메일/비밀번호 변경 (G-151)
  security: {
    emailChangeRequested: boolean;
    emailChangePending: boolean;  // 인증 이메일 발송 후 대기 중
    passwordChangeLoading: boolean;
    lastEmailChangedAt?: number;
  };

  // SET-14 / PROFILE-03: 알림 설정 (G-156, G-266)
  notifications: {
    room_invite: boolean;                      // 방 초대 알림
    room_scheduled: boolean;                   // 예약 방 리마인더
    room_full: boolean;                        // 대기 방 자리 생김 알림 (G-59 wait-list)
    credit_low: boolean;                       // 크레딧 잔량 부족 알림
    friend_joined: boolean;                    // 아는 사람 접속 알림 (G-266)
    followed_creator_stream_start: boolean;    // 팔로우한 크리에이터 공연 시작 알림 (G-266)
  };

  // 공통
  unsavedChanges: boolean;
  isDirty: Record<string, boolean>;  // 각 섹션별 변경 추적
  lastSavedAt?: number;
}

/**
 * settingsStore 액션
 */
interface SettingsActions {
  // SET-01·02: 디바이스
  setAudioInputDevice(deviceId: string): void;
  setVideoInputDevice(deviceId: string): void;
  enumerateAudioDevices(): Promise<void>;
  enumerateVideoDevices(): Promise<void>;

  // SET-03: 단축키
  recordHotkey(action: string): Promise<string>;  // 사용자가 키 누르기 대기
  setHotkey(action: string, key: string): void;
  clearHotkey(action: string): void;

  // SET-04: 언어
  setLanguage(lang: 'ko' | 'ja' | 'en'): void;

  // SET-05: 품질
  setQualityMode(mode: 'auto' | 'manual'): void;
  setQualityLevel(level: 'low' | 'medium' | 'high'): void;
  saveQualityPreset(presetName: string, sensitivityJson: JSONB): void;
  loadQualityPreset(presetName: string): void;

  // SET-06: 노이즈
  setKrispEnabled(enabled: boolean): void;
  setKrispLevel(level: 'light' | 'standard' | 'aggressive'): void;

  // SET-07: 개인 설정
  setMuted(muted: boolean): void;
  setCameraOff(off: boolean): void;
  setPTTMode(enabled: boolean): void;
  setPTTKey(key: string): void;

  // SET-09~13: 접근성
  setCaptions(enabled: boolean): void;
  setCaptionsLanguage(lang: 'ko' | 'ja' | 'en'): void;
  setCaptionsSize(size: 'small' | 'medium' | 'large'): void;
  setCaptionsBackgroundOpacity(opacity: number): void;
  setReduceMotion(enabled: boolean): void;
  setHighContrast(enabled: boolean): void;
  setFontSizePercent(percent: number): void;
  setPhotosensitiveMode(enabled: boolean): void;

  // SET-08: 크레딧
  setGenerationQuality(quality: 'draft' | 'standard' | 'premium'): void;
  setMonthlyBudget(budget: number): void;
  updateCreditsBalance(balance: number): void;

  // AUTH-04: 이메일/비밀번호 변경
  requestEmailChange(newEmail: string): Promise<void>;     // Supabase updateUser({ email }) → 인증 이메일 발송
  changePassword(currentPw: string, newPw: string): Promise<void>;  // re-auth → updateUser({ password })

  // SET-14: 알림 설정
  setNotification(key: keyof SettingsState['notifications'], enabled: boolean): void;
  saveNotifications(): Promise<void>;  // Supabase users.notification_prefs JSONB UPDATE

  // 공통
  markDirty(section: string): void;
  clearDirty(section: string): void;
  saveAll(): Promise<void>;
  resetToSaved(): void;
}
```

**Store 출처:** `src/stores/settingsStore.ts` (신규 파일)

### 기존 Store와의 상호작용

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `userStore` | `userId` | ✓ | | 현재 사용자 ID (크레딧 조회용) |
| `settingsStore` | 위 interface 전체 | ✓ | ✓ | 설정 상태 관리 (SettingsPage 전용) |
| `audioStore` | `selectedInputDeviceId` | ✓ | ✓ | 마이크 디바이스 동기화 (GreenRoom과 공유) |
| `audioStore` | `selectedOutputDeviceId` | ✓ | ✓ | 스피커 디바이스 동기화 |
| `trackingStore` | (읽기만) | ✓ | | 현재 추적 상태 (SET-05 auto mode 판단용) |

**쓰기:** SettingsPage만 settingsStore 업데이트 및 Supabase 저장.

## 섹션 구성 (탭)

```
┌──────────────────────────────┐
│ ⚙️ Settings                   │
├──────────────────────────────┤
│ [Device] [접근성] [성능] [개인] [크레딧] [보안] [계정] [알림]  ← 탭 헤더
├──────────────────────────────┤
│                              │
│  [탭 콘텐츠 영역]            │
│                              │
├──────────────────────────────┤
│         [취소]  [저장]       │
└──────────────────────────────┘
```

### 탭 1: Device (SET-01, SET-02)

**오디오 입력 (SET-01)**
```
📻 마이크 선택
┌──────────────────────────────┐
│ [Device Dropdown ▼]          │
│ 현재: Built-in Microphone    │
└──────────────────────────────┘

🔊 테스트 (선택사항)
┌──────────────────────────────┐
│ [테스트 시작] ← GreenRoom 통합 │
│ VU 미터: ▌▌▌ 75dB           │
└──────────────────────────────┘

(또는) 📻 오디오 출력
┌──────────────────────────────┐
│ [Device Dropdown ▼]          │
│ 현재: Speakers               │
└──────────────────────────────┘
```

**웹캠 (SET-02)**
```
📷 웹캠 선택
┌──────────────────────────────┐
│ [Device Dropdown ▼]          │
│ 현재: Front Camera           │
└──────────────────────────────┘

✓ 현재 추적 상태: TRACKING (녹색)
또는
⚠️ 현재 추적 상태: IDLE (회색)
  → "[웹캠 테스트]" 버튼
```

### 탭 2: Accessibility (SET-03, SET-04, SET-09~13, G-57)

**단축키 (SET-03) — 필살기 핫키**
```
⌨️ 핫키 설정 (필살기)

[ ] 필살기 (Shift + K)
    ┌─────────────┐
    │ [변경] [초기화]│
    └─────────────┘

[ ] Push-To-Talk (Space)
    ┌─────────────┐
    │ [변경] [초기화]│
    └─────────────┘

💡 팁: [변경]을 클릭하고 원하는 키를 누르세요.
```

**언어 (SET-04)**
```
🌐 UI 언어
┌──────────────────────────────┐
│ ( ) 한국어 (ko)              │
│ ( ) 日本語 (ja)              │
│ ( ) English (en)             │
└──────────────────────────────┘

⚠️ 재시작 필요 (다음 모달 오픈 시 적용)
```

**자막 & 자동 캡션 (SET-09)**
```
📺 자막 (CC)

[ ] 자막 활성화 (현재 비활성)
    ┌──────────────────────────┐
    │ 자막 언어: [한국어 ▼]    │
    │ 자막 크기: [중간 ▼]      │
    │ 배경 불투명도: 80% ◀─── │
    └──────────────────────────┘

💡 ROOM-05 채팅 메시지 + 직접 입력 발언이 실시간 자막으로 표시됩니다.
```

**모션감소 (SET-10)**
```
✨ 모션 안내

[ ] 모션감소 활성화 (prefers-reduced-motion 반영)
    → 애니메이션 중지
    → 깜빡이는 효과 제거
    → 전환 최소화
    → 아바타 표정 애니메이션 유지 (성능)

💡 개인정보보호법 제30조의2 관련 접근성 정책입니다.
```

**고대비 (SET-11)**
```
🎨 고대비 모드

[ ] 고대비 활성화 (현재 OFF)
    → 색상 대비 WCAG 2.1 AA 등급 (4.5:1)
    → 버튼/텍스트 경계 강화
    → UI 배경 대비 증가

💡 화면 가시성이 낮은 환경(밝은 햇빛)에서 추천합니다.
```

**폰트 크기 (SET-12)**
```
🔤 텍스트 크기

기본값: 100%
┌──────────────────────────────┐
│ 75% ──●──── 100% ──── 150% ──│
│ (작음)     (기본)     (크게)   │
│           현재: 100%          │
└──────────────────────────────┘

미리보기: [샘플 텍스트는 이렇게 보입니다]

💡 [ 저장 ]하면 다음 새로고침 시 적용됩니다.
```

**깜빡임 경고 (SET-13)**
```
⚠️ 광감성 간질 경고 (Photosensitive Epilepsy)

[ ] 깜빡이는 효과 차단 (현재 OFF)
    → 깜빡임 > 3Hz 제거
    → VGen 영상 안내 활성화
    → 섬광 패턴 감지 알림

💡 광감성 간질(PWE) 또는 시각 민감성이 있으신 경우 활성화하세요.
   의료·법적 권장사항입니다.
```

**온보딩 다시보기 (G-57)**
```
🎬 앱 설정

[ 첫 방문 가이드 다시 보기 ]
   ↓ 클릭 시:
   1. userStore.onboarding_restart_requested = true 설정
   2. 설정 모달 닫기
   3. /onboarding/intro로 네비게이션
   4. Onboarding.md INTRO 상태 진입 (restart_requested = true 조건)

💡 이 기능은 처음 본 인트로 영상을 다시 보고 싶을 때 사용합니다.
```

### 탭 3: Performance (SET-05, SET-06)

**품질 조절 (SET-05)**
```
⚡ 품질 모드
┌──────────────────────────────┐
│ ( ) 자동 (Auto)              │
│   → CPU/네트워크 자동 감지  │
│                              │
│ ( ) 수동 (Manual)            │
│   ┌──────────────────────────┐
│   │ 품질 레벨:               │
│   │ ( ) 저사양 (Low)          │
│   │ ( ) 표준 (Medium)         │
│   │ ( ) 고사양 (High)         │
│   └──────────────────────────┘
└──────────────────────────────┘

📊 표정 프리셋
┌──────────────────────────────┐
│ 저장된 프리셋:               │
│ [preset_1] [preset_2] [+새로]│
└──────────────────────────────┘

📝 현재 프리셋: <preset_name>
```

**노이즈 억제 (SET-06) — Krisp**
```
🔇 노이즈 억제 (Krisp)
┌──────────────────────────────┐
│ [OFF]  [Light]  [Standard]   │
│        [Aggressive] (선택)   │
└──────────────────────────────┘

💡 Aggressive: 더 깨끗하지만 음성 손실 가능
```

### 탭 4: Privacy (SET-07)

**개인 차단·뮤트·카메라·PTT (SET-07)**
```
🔒 개인 설정

마이크:
[ ] 뮤트 (현재 미취용)
    → 음성 OFF, 다른 사람이 들을 수 없음

카메라:
[ ] 카메라 끄기 (현재 정상)
    → 웹캠 OFF, 아바타만 기본 표정 표시

Push-To-Talk (PTT):
[ ] 활성화 (현재 OFF)
    → Space 누르고 있을 때만 음성 송신
    키 변경: [Space ▼]

(호스트인 경우)
────────────────────────────────
🛡️ 다른 참가자 차단 (호스트 권한)
[개인 탭 하단에 "차단된 참가자 목록" 팝업 또는 별도 UI]
- 참가자 ID, 차단 사유, 차단 해제 버튼
```

### 탭 5: Credits (SET-08)

**크레딧 & 생성 설정 (SET-08, G-266)**
```
💳 크레딧 잔액
┌──────────────────────────────┐
│ 보유 크레딧: 2,450 Credits   │
│ 이번 달 사용: 550 / 1,000    │
│                              │
│ [추가 구매] [사용 내역]      │
│                              │
│ 💡 [추가 구매]는 /payments/  │
│    credits 페이지로 연결      │
│    무료 크레딧:              │
│    - 친구 초대 완료 시       │
│      초대자·초대받은자 각    │
│      100 Credits 지급        │
│    - 프로필 완성 시 50점     │
└──────────────────────────────┘

🎬 영상 생성 설정 (VGen)
┌──────────────────────────────┐
│ 품질:                        │
│ ( ) Draft (낮음, 100 cr)      │
│ ( ) Standard (중간, 200 cr)   │
│ ( ) Premium (높음, 500 cr)    │
└──────────────────────────────┘

📅 월간 예산
┌──────────────────────────────┐
│ 월간 한도: 1,000 Credits     │
│ [사용량 그래프]               │
│ 경고: 80% 초과 시 알림       │
└──────────────────────────────┘
```

### 탭 6: Security — AUTH-04 (G-151)

**이메일 변경**
```
📧 이메일 변경

현재 이메일: jason@example.com

새 이메일:  [──────────────────]
           [이메일 변경 요청]

⚠️ 새 이메일로 인증 링크가 발송됩니다.
   링크 클릭 후 변경이 완료됩니다.
```

**비밀번호 변경**
```
🔑 비밀번호 변경

현재 비밀번호: [──────────────]  (표시 토글)
새 비밀번호:   [──────────────]
새 비밀번호 확인: [───────────]

강도: ███░░ 중간
      ↑ 8자 이상·특수문자·숫자 포함 시 강함

[비밀번호 변경]

💡 소셜 로그인(Google·Discord) 계정은 비밀번호 항목이 비활성화됩니다.
```

- `Supabase.auth.updateUser({ email: newEmail })` → 인증 이메일 자동 발송
- `Supabase.auth.updateUser({ password: newPw })` — 현재 비밀번호 재인증 먼저 (`signInWithPassword`)
- OAuth 계정은 `identities` 배열 확인 후 password 항목 숨김

### 탭 7: Account — AUTH-05/06 (G-152)

**데이터 내보내기 (AUTH-06)**
```
📦 내 데이터 내보내기

[내 데이터 내보내기 요청]

내보내기 항목:
  ✓ 프로필 정보 (닉네임·이메일·자기소개)
  ✓ 방 참가 기록
  ✓ 생성한 영상 목록 (R2 링크)
  ✓ 크레딧 사용 내역
  ✓ 녹화 파일 목록

처리 방법: 요청 후 영업일 기준 3일 이내 이메일(gmdqn2tp@gmail.com)로 전송.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 관련 정책: 개인정보 처리방침 · 데이터 반출 정책
```

**계정 삭제 (AUTH-05)**
```
⚠️ 계정 삭제

[계정 삭제 요청]  ← 빨간 버튼, 클릭 시 확인 모달 열림

━━━ 확인 모달 (2단계) ━━━━━━━━━━━━━━━━━━━
단계 1:
  "계정을 삭제하면 다음 항목이 영구 삭제됩니다:"
  ✗ 프로필·이메일·비밀번호
  ✗ 크레딧 잔액 (환불 없음)
  ✗ 생성한 영상 및 녹화 파일
  ✗ 방 참가 기록
  ✗ 구독 및 결제 내역

  "삭제 후 30일 이내에는 복구 가능합니다."
  "30일 경과 후 영구 삭제되어 복구할 수 없습니다."

  [취소]  [다음 →]

단계 2:
  "계정 삭제를 확인하려면 현재 비밀번호를 입력하세요:"
  [────────────────────]
  또는 소셜 계정: [Google로 재인증]

  [취소]  [계정 삭제 확인]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- 삭제 Flow: `Supabase.auth.signInWithPassword(reauth)` → `Supabase.rpc('soft_delete_user')` → `Supabase.auth.signOut()`
- `users.deleted_at = now()` 설정 (소프트 삭제) — 30일 후 pg_cron이 영구 삭제
- 삭제 완료 후 랜딩 페이지 리다이렉트 + "계정이 삭제 예약되었습니다" 토스트
- **DATA-SCHEMA**: `users.deleted_at TIMESTAMPTZ` 반영됨. RLS는 `deleted_at IS NULL` 조건 필수.

### 탭 8: Notifications — SET-14 / PROFILE-03 (G-156, G-266)

```
🔔 알림 설정

방 관련:
  [✓] 방 초대 수신 시 알림       (기본: ON)
  [✓] 예약 방 리마인더 (30분 전) (기본: ON)
  [ ] 대기 중인 방에 자리 생겼을 때 (기본: OFF)

친구/팔로우:
  [ ] 아는 사람 접속 알림 (friend_joined) (기본: OFF) (G-266)
  [ ] 팔로우한 크리에이터 공연 시작 (followed_creator_stream_start) (기본: ON) (G-266)
     → "OOO가 지금 공연을 시작했습니다!" 알림

크레딧:
  [✓] 크레딧 잔량 100 이하 경고  (기본: ON)

알림 수신 방법:
  ( ) 앱 내 토스트만
  ( ) 이메일 + 앱 내 토스트
```

- Supabase `users.notification_prefs JSONB` 컬럼에 저장 (DATA-SCHEMA 반영됨)
- 예약 방 알림은 `pg_cron` 또는 Supabase Edge Function scheduled trigger 연계 (G-59 wait-list)
- 이메일 알림은 Supabase Auth Hook + Resend 연동 (P1 구현 시)

## Supabase 접근

### expression_presets 테이블 (PENDING)

```sql
-- SET-05: 품질 레벨별 표정 프리셋 (민감도 저장)
CREATE TABLE expression_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preset_name TEXT NOT NULL,
  -- sensitivity_json: 표정 채널별 민감도 범위 (min/max)
  -- 예: {"eyeLOpen": [0.3, 0.95], "mouthOpen": [0.1, 0.8], ...}
  sensitivity_json JSONB NOT NULL,
  quality_level TEXT NOT NULL,  -- 'low' | 'medium' | 'high'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, preset_name)
);

-- RLS Policy: users can read only their own presets
-- RLS Policy: users can create/update/delete only their own presets
```

### 조회·저장 작업

| 테이블 | 작업 | 시점 | 용도 |
|---|---|---|---|
| `expression_presets` | SELECT * WHERE user_id = $1 | SettingsPage mount (SET-05) | 저장된 프리셋 목록 조회 |
| `expression_presets` | INSERT | "프리셋 저장" 클릭 (SET-05) | 현재 품질 설정 저장 |
| `expression_presets` | UPDATE | "프리셋 업데이트" 클릭 (SET-05) | 기존 프리셋 수정 |
| `expression_presets` | DELETE | "프리셋 삭제" 클릭 (SET-05) | 프리셋 제거 |
| `users` | UPDATE `language` | 언어 변경 저장 (SET-04) | 사용자 기본 언어 업데이트 |
| `credits` | SELECT * WHERE user_id = $1 | SettingsPage mount (SET-08) | 크레딧 잔액 조회 |
| `credits` | (읽기만, Edge Function으로 UPDATE) | — | 크레딧 잔액은 서버 사이드만 쓰기 |
| `auth.updateUser` | `{ email }` | 이메일 변경 요청 클릭 (AUTH-04) | 인증 이메일 발송 |
| `auth.updateUser` | `{ password }` | 비밀번호 변경 클릭 후 재인증 (AUTH-04) | 비밀번호 서버 업데이트 |
| `users` | UPDATE `notification_prefs` JSONB | 알림 설정 저장 (SET-14) | 알림 ON/OFF 저장 |
| `rpc('soft_delete_user')` | `{}` | 계정 삭제 2단계 확인 후 (AUTH-05) | 서버가 `current_app_user_id()`로 대상 결정. 소프트 삭제 + 30일 유예 |

**DATA-SCHEMA 반영됨** (G-151·G-152·G-156 연계):
- `users.notification_prefs JSONB DEFAULT '{...}'` — 알림 설정 저장
- `users.deleted_at TIMESTAMPTZ` — 소프트 삭제 타임스탬프
- RLS: `users` SELECT/UPDATE에 `deleted_at IS NULL` 조건 필수
- `pg_cron`: `deleted_at < now() - interval '30 days'` 인 users 영구 삭제 스케줄

## LiveKit 디바이스 API

### 디바이스 열거 (SET-01, SET-02)

```typescript
// SettingsPage mount 시 호출
async function enumerateAudioDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter(d => d.kind === 'audioinput');
  const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
  
  settingsStore.audioInput.devices = audioInputs;
  audioStore.selected_input_device_id = audioInputs[0]?.deviceId || '';
}

async function enumerateVideoDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter(d => d.kind === 'videoinput');
  
  settingsStore.videoInput.devices = videoInputs;
  audioStore.selected_video_device_id = videoInputs[0]?.deviceId || '';
}
```

### 디바이스 변경 적용 (SET-01, SET-02)

```typescript
// 유효성 검증
// - SettingsPage에서는 "변경 저장" 버튼이 activeSession(RoomView)과 동기화
// - GreenRoom에서는 선택 즉시 적용
```

## Krisp 통합 (SET-06)

```typescript
// 가정: krisp npm package 이미 설치
import krisp from 'krisp-ai';

async function enableKrisp(level: 'light' | 'standard' | 'aggressive') {
  const processor = await krisp.createNoiseSuppressionProcessor(level);
  // localTrack에 processor 추가
  settingsStore.audioFilter.krispEnabled = true;
}

function disableKrisp() {
  // processor 제거
  settingsStore.audioFilter.krispEnabled = false;
}
```

## DataChannel 의존성

**없음** — SettingsPage는 디바이스/설정 store와 Supabase 설정 저장만 담당한다. 룸 내 실시간 반영이 필요한 설정은 해당 feature 컴포넌트가 기존 채널 타입을 발행한다.

## 금지 사항 (MUST NOT)

- ❌ **설정 저장 없이 페이지 닫기** — unsavedChanges = true일 때 "변경사항이 저장되지 않았습니다" 경고 필수
- ❌ **룸 이탈 후 SettingsPage 열기** — GreenRoom 또는 RoomView 내 모달로만 접근 (별도 라우트 금지)
- ❌ **다른 참가자 설정 보기·수정** — 본인 설정만 조회 가능 (RLS 정책으로 강제)
- ❌ **디바이스 변경 즉시 적용 (RoomView 중)** — preview는 가능하지만, 실제 적용은 "저장" 후 또는 다음 room 진입 시
- ❌ **크레딧 직접 업데이트** — Edge Function 호출만 허용 (클라이언트 쓰기 금지)
- ❌ **표정 프리셋 센시티비티 수동 편집** — 프리셋 로드/삭제만 가능, 세부 수정은 CalibrationWizard에서
- ❌ **Krisp 외 노이즈 필터 중복 활성화** — Krisp ON이면 다른 필터 비활성화
- ❌ **언어 변경 즉시 렌더링** — localStorage에만 저장하고, 다음 모달/페이지 오픈 시 적용 (i18n framework 위임)
- ❌ **단축키 충돌 미감지** — 이미 사용 중인 키 바인드 경고 필수 (브라우저 기본 단축키 제외: Ctrl+C 등)
- ❌ **GreenRoom에서 룸 설정(SET-07·08) 변경** — GreenRoom은 디바이스(SET-01·02) + 미리보기만 (풀 SettingsPage는 RoomView에서)
- ❌ **계정 삭제를 재인증 없이 실행** — 2단계 확인 + 현재 비밀번호/OAuth 재인증 필수 (AUTH-05)
- ❌ **소프트 삭제 후 즉시 데이터 삭제** — `deleted_at` 설정만 하고 30일 pg_cron 대기 (복구 기간 보장)
- ❌ **이메일 변경 즉시 반영** — 신규 이메일 인증 완료 전까지 기존 이메일 유지
- ❌ **비밀번호를 클라이언트에서 해싱 후 저장** — Supabase `updateUser()` API만 사용 (서버가 bcrypt 처리)

## 컴포넌트 관계

```
[SettingsPage] (Modal)
  ├─ useEffect: mount 시
  │  ├─ enumerateAudioDevices()
  │  ├─ enumerateVideoDevices()
  │  ├─ loadExpressionPresets() [SET-05]
  │  ├─ fetchCredits() [SET-08]
  │  └─ settingsStore.resetToSaved()
  │
  ├─ [TabHeader]
  │  ├─ [Tab: Device] [Tab: Accessibility] ...
  │  └─ onClick → setActiveTab()
  │
  ├─ Conditional Render (activeTab 기반)
  │  │
  │  ├─ Tab 1: Device
  │  │  ├─ [AudioInputSelector] (SET-01)
  │  │  │  └─ onChange → settingsStore.setAudioInputDevice(deviceId)
  │  │  ├─ [AudioOutputSelector] (SET-01)
  │  │  └─ [VideoInputSelector] (SET-02)
  │  │     └─ onChange → settingsStore.setVideoInputDevice(deviceId)
  │  │
  │  ├─ Tab 2: Accessibility
  │  │  ├─ [HotkeyRecorder] (SET-03)
  │  │  │  └─ onClick [변경] → recordHotkey() → settingsStore.setHotkey()
  │  │  ├─ [LanguageSelector] (SET-04)
  │  │  │  └─ onChange → settingsStore.setLanguage()
  │  │  ├─ [CaptionsToggle] (SET-09)
  │  │  │  ├─ onChange → settingsStore.setCaptions()
  │  │  │  ├─ [CaptionsLanguageSelector]
  │  │  │  └─ [CaptionsSizeSlider]
  │  │  ├─ [ReduceMotionToggle] (SET-10)
  │  │  │  └─ onChange → settingsStore.setReduceMotion()
  │  │  ├─ [HighContrastToggle] (SET-11)
  │  │  │  └─ onChange → settingsStore.setHighContrast()
  │  │  ├─ [FontSizeSlider] (SET-12)
  │  │  │  └─ onChange → settingsStore.setFontSizePercent(percent)
  │  │  ├─ [PhotosensitiveModeToggle] (SET-13)
  │  │  │  └─ onChange → settingsStore.setPhotosensitiveMode()
  │  │  │
  │  │  └─ [OnboardingRestartButton] (G-57)
  │  │     └─ onClick → userStore.setRestartRequested(true) → navigate('/onboarding/intro')
  │  │
  │  ├─ Tab 3: Performance
  │  │  ├─ [QualityModeSelector] (SET-05)
  │  │  │  ├─ Radio: auto | manual
  │  │  │  └─ if manual → [QualityLevelSlider]
  │  │  │     └─ onChange → settingsStore.setQualityLevel()
  │  │  ├─ [ExpressionPresetManager] (SET-05)
  │  │  │  ├─ [Dropdown: 저장된 프리셋]
  │  │  │  │  └─ onChange → settingsStore.loadQualityPreset()
  │  │  │  ├─ [Button: +새로 저장]
  │  │  │  │  └─ onClick → Dialog(preset_name) → settingsStore.saveQualityPreset()
  │  │  │  └─ [Button: 삭제]
  │  │  │     └─ onClick → Supabase DELETE
  │  │  └─ [KrispSelector] (SET-06)
  │  │     ├─ Radio: OFF | Light | Standard | Aggressive
  │  │     └─ onChange → settingsStore.setKrispLevel() → enableKrisp()
  │  │
  │  ├─ Tab 4: Privacy
  │  │  ├─ [MuteToggle] (SET-07)
  │  │  │  └─ onChange → settingsStore.setMuted()
  │  │  ├─ [CameraToggle] (SET-07)
  │  │  │  └─ onChange → settingsStore.setCameraOff()
  │  │  ├─ [PTTToggle] (SET-07)
  │  │  │  └─ onChange → settingsStore.setPTTMode()
  │  │  ├─ [PTTKeySelector] (SET-07)
  │  │  │  └─ onChange → settingsStore.setPTTKey()
  │  │  │
  │  │  └─ (isHost only)
  │  │     [BlockedParticipantsList] (SET-07 호스트용)
  │  │       └─ read: roomStore.blocked_participants[]
  │  │
  │  └─ Tab 5: Credits
  │     ├─ [CreditsDisplay] (SET-08)
  │     │  └─ read: settingsStore.credits.balance
  │     ├─ [GenerationQualitySelector] (SET-08)
  │     │  ├─ Radio: draft | standard | premium
  │     │  └─ onChange → settingsStore.setGenerationQuality()
  │     └─ [MonthlyBudgetInput] (SET-08)
  │        └─ onChange → settingsStore.setMonthlyBudget()
  │
  │  ├─ Tab 6: Security (AUTH-04) (G-151)
  │  │  ├─ [EmailChangeForm]
  │  │  │  ├─ Input: newEmail
  │  │  │  └─ onClick [이메일 변경 요청] → settingsStore.requestEmailChange(newEmail)
  │  │  │     → Supabase.auth.updateUser({ email }) → toast "인증 이메일 발송됨"
  │  │  └─ [PasswordChangeForm]
  │  │     ├─ Input: currentPw (hidden if OAuth-only account)
  │  │     ├─ Input: newPw
  │  │     ├─ Input: confirmPw
  │  │     └─ onClick [비밀번호 변경] → re-auth → settingsStore.changePassword()
  │  │
  │  ├─ Tab 7: Account (AUTH-05/06) (G-152)
  │  │  ├─ [DataExportSection]
  │  │  │  └─ onClick [데이터 내보내기 요청] → recent reauth → POST /functions/v1/data-export-request → toast
  │  │  └─ [AccountDeleteSection]
  │  │     └─ onClick [계정 삭제] → [DeleteAccountModal]
  │  │        ├─ Step 1: 삭제 항목 미리보기 + 30일 유예 안내
  │  │        └─ Step 2: 재인증 (password or OAuth) → rpc('soft_delete_user') with no user_id argument
  │  │           → signOut() → navigate('/')
  │  │
  │  └─ Tab 8: Notifications (SET-14) (G-156)
  │     ├─ [NotificationToggle: room_invite]
  │     ├─ [NotificationToggle: room_scheduled]
  │     ├─ [NotificationToggle: room_full]
  │     └─ [NotificationToggle: credit_low]
  │        → onChange → settingsStore.setNotification(key, enabled)
  │        → [저장] 시 settingsStore.saveNotifications()
  │           → Supabase users UPDATE notification_prefs
  │
  └─ [Footer]
     ├─ [Button: 취소]
     │  └─ onClick → (unsavedChanges ? confirm warning) → onClose()
     │
     └─ [Button: 저장] (enabled: isDirty any section)
        └─ onClick → saveAll()
           ├─ Supabase: expression_presets INSERT/UPDATE/DELETE
           ├─ Supabase: users UPDATE language (선택)
           ├─ localStorage: hotkeys, quality_level, language, etc.
           ├─ settingsStore.markSaved()
           ├─ onSave(changes) 콜백
           └─ 성공/실패 toast
```

## 모달 레이아웃 및 UX

### 열기 방식

- **GreenRoom 내:** 모달 또는 floating panel (SET-01·02 디바이스 검증)
- **RoomView 내:** ⚙️ 아이콘(헤더) 또는 ⌘K Command Palette → "Settings" 검색
- **별도 라우트 금지** (무대에 올라가면 절대 내려오지 않음)

### 모달 오버레이

```
┌─────────────────────────────────────┐
│ 무대 배경 (흐릿하게 → pointer-events: none)  │
│                                     │
│     ┌──────────────────────────┐   │
│     │ ⚙️ Settings [×]          │   │  ← 모달
│     ├──────────────────────────┤   │
│     │ [Device] [접근성] ...    │   │
│     │ [탭 콘텐츠]              │   │
│     │                          │   │
│     │      [취소]  [저장]      │   │
│     └──────────────────────────┘   │
└─────────────────────────────────────┘
```

### 저장 및 종료

1. **변경사항 없음**: [저장] 버튼 비활성화, [취소]만 활성
2. **변경 감지** (SET-01·02·03·04·05·06·07·08 중 하나): 
   - [저장] 활성화
   - 페이지 닫기 시 "변경사항을 저장하시겠습니까?" 확인 대화
3. **저장 중**: 로딩 스피너 표시, 버튼 비활성화
4. **저장 완료**: toast 메시지 + 모달 자동 닫기 (또는 [완료] 버튼)

## Krisp 선택사항 구현 (P1)

```typescript
// krisp 라이브러리 미설치 시 fallback
if (window.krisp) {
  // Krisp 활성화
} else {
  // UI 비활성화 + 안내: "Krisp 플러그인 설치 필요"
}
```

## 검증 체크리스트

### 구현 체크

- [ ] LiveKit enumerateDevices API로 오디오/웹캠 목록 로드 (SET-01·02)
- [ ] 단축키 녹음 (keydown 리스너) + 충돌 감지 (SET-03)
- [ ] 언어 변경 시 localStorage 저장 (SET-04)
- [ ] 품질 모드 선택 (auto/manual) + 레벨 슬라이더 (SET-05)
- [ ] expression_presets 테이블 INSERT/UPDATE/DELETE (SET-05)
- [ ] Krisp 노이즈 억제 활성화 (SET-06, 라이브러리 설치 확인)
- [ ] 뮤트/카메라/PTT 토글 (SET-07)
- [ ] 크레딧 잔액 조회 + 월간 예산 설정 (SET-08)
- [ ] unsavedChanges 추적 및 경고
- [ ] 페이지 떠날 때 cleanup (디바이스 리스너 제거)
- [ ] 이메일 변경: `updateUser({ email })` 호출 → "인증 이메일 발송됨" toast (AUTH-04)
- [ ] 비밀번호 변경: 재인증 → `updateUser({ password })` → 성공 toast (AUTH-04)
- [ ] OAuth 전용 계정 감지: `identities` 배열 확인 → 비밀번호 항목 숨김 (AUTH-04)
- [ ] 계정 삭제 2단계 확인 모달 + 재인증 + `soft_delete_user` RPC (AUTH-05)
- [ ] 데이터 내보내기 요청 API 호출 + "3일 내 이메일 발송" 안내 (AUTH-06)
- [ ] 알림 설정 토글 → `users.notification_prefs JSONB` Supabase UPDATE (SET-14)
- [ ] `users.deleted_at`, `users.notification_prefs` 컬럼 DATA-SCHEMA 추가 (G-152·G-156)

### 리뷰 체크

- [ ] Props interface가 완전한가?
- [ ] settingsStore 신규 슬라이스가 설계되어 있는가?
- [ ] Supabase expression_presets RLS 정책이 정의되어 있는가? (DATA-SCHEMA.md 업데이트)
- [ ] 금지 사항 위반이 없는가?
- [ ] 모달 오버레이로 룸 이탈 없음?
- [ ] 크레딧 직접 쓰기 금지 (읽기만)?
- [ ] 다국어(ko/ja/en) 문자열이 i18n 파일로 추상화되어 있는가?

---

## 관련 문서

- `../DATA-SCHEMA.md §1.11` — expression_presets 테이블 (PENDING 추가 필요)
- `../state-machines/` — settingsStore 상태 머신 (향후 정의)
- `../FEATURE-SPEC.md §MOD-09` — 설정 페이지 기능 명세 (SET-01~08)
- `./GreenRoom.md` — GreenRoom에서 디바이스 선택 (SET-01·02 공유)
- `./RoomView.md` — 룸 컨텍스트 (SettingsPage 모달은 RoomView 자식)
- `./HostConsole.md` — 호스트 전용 기능 (SET-07 차단 기능)
- `./VgenPanel.md` — VGen 크레딧 연동 (SET-08)

---

## 한줄정리

snack-web의 SettingsPage는 모달 형태로 GreenRoom/RoomView 내에서 오디오·웹캠·단축키·언어·품질·노이즈·개인차단·크레딧을 5개 탭(Device·Accessibility·Performance·Privacy·Credits)으로 관리하며, 표정 프리셋(expression_presets)을 저장하고 Krisp 노이즈 억제를 제어하고 unsavedChanges 경고로 설정 손실을 방지한다.
