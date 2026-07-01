---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·DataChannel 레지스트리·타입 정의 -->

# 13. CalibrationWizard

MediaPipe 얼굴 추적 초기 설정 3단계 [개발 예정]. trackingStore 상태 전환 관리.

## Props Interface

```typescript
interface CalibrationWizardProps {
  /**
   * 완료 콜백
   * signature: () => void
   */
  onComplete?: () => void;

  /**
   * 스킵 콜백 (나중에 하기)
   */
  onSkip?: () => void;

  /**
   * 에러 콜백
   */
  onError?: (error: Error) => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `trackingStore` | `avatarState` | ✓ | | 추적 상태 (IDLE → INITIALIZING → CALIBRATING → TRACKING) |
| `trackingStore` | `calibrationVersion` | ✓ | ✓ | 보정 버전 (완료 시 기록) |
| `trackingStore` | `calibrationError` | ✓ | ✓ | 에러 로그 |

## DataChannel 의존성

**없음** — 로컬 MediaPipe 초기화만.

## LiveKit 이벤트

**없음** — room 진입 전 실행 (onboarding).

## Supabase 접근

| 테이블 | 작업 | RLS 정책 |
|---|---|---|
| `users` | calibration_version 업데이트 | 자신의 레코드만 |

## 금지 사항 (MUST NOT)

- ❌ 룸 입장 전 완료 강제 (onboarding에서만, skipable)
- ❌ 보정 중 얼굴 감지 실패해도 강제 진행 (재시도 안내)
- ❌ calibration_version을 건너뛰고 TRACKING 상태로 (version이 진실)

## 컴포넌트 관계

```
[CalibrationWizard]
  ├─ trackingStore.avatar_state: IDLE → INITIALIZING → CALIBRATING → TRACKING
  │
  ├─ [Step 1: 초기화]
  │  ├─ MediaPipe FaceMesh 로드
  │  └─ on complete: INITIALIZING → CALIBRATING
  │
  ├─ [Step 2: 얼굴 정렬]
  │  ├─ 카메라 스트림 캡처
  │  ├─ 얼굴 감지 시도
  │  ├─ 얼굴 보이기 안내
  │  └─ 감지 성공 시 3초 확인 후: CALIBRATING → TRACKING
  │
  ├─ [Step 3: 완료]
  │  ├─ trackingStore.calibration_version = 1
  │  ├─ users.calibration_version UPDATE
  │  └─ onComplete()
  │
  └─ [Skip button]
     └─ 나중에 하기 (onboarding 스킵)
```
