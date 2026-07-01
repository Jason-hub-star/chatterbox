---
tags: [contract]
---

# AgeGate

방 입장, 데모 관전, 녹화, DUB, VGEN, OBS 전에 `users.age_band`와 `users.age_attested_at`을 확정하는 P0 게이트.

## Props Interface

```typescript
interface AgeGateProps {
  redirectTo?: string;
  mode: 'signup' | 'room_entry' | 'demo_entry' | 'safety_recheck';
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|---|---|---|---|---|
| `userStore` | `id`, `ageBand`, `ageAttestedAt` | ✓ | ✓ | 연령 확인 결과 저장 |
| `routeStore` | `redirectTo` | ✓ | | 완료 후 복귀 경로 |

## 데이터 규칙

- 저장 값은 `age_band='14_17'|'18_plus'`와 `age_attested_at`뿐이다.
- 생년월일 원문은 저장하지 않는다.
- 만 14세 미만은 가입, 방 입장, 익명 viewer 입장 모두 차단한다.
- `age_band='14_17'`는 보호자 동의 플로우 전까지 녹화, DUB, OBS, public demo room 노출, VGEN trigger, gift/tip을 차단한다.
- 서버 재검증 SSOT는 `specs/SecurityPolicies.md §1.5`와 `API-SURFACE.md`다. 클라이언트 AgeGate 통과는 UX 편의일 뿐 권한 증거가 아니다.

## DataChannel

없음. AgeGate는 인증/프로필 DB 업데이트만 수행하며 LiveKit 연결 전 단계다.

## 이벤트 흐름

```
[Auth/OAuth 완료 또는 ViewerGate age-gate]
  ↓
[AgeGate 표시]
  ↓
사용자 선택:
  - 만 14세 미만 → blocked_minor 화면 + 고객지원 링크
  - 14~17 → users.age_band='14_17', restricted copy 표시
  - 18+ → users.age_band='18_plus'
  ↓
users.age_attested_at=now()
  ↓
redirectTo 복귀 또는 /lobby 이동
```

## MUST NOT

- ❌ 생년월일, 주민등록번호, 신분증 이미지를 MVP에서 저장
- ❌ AgeGate 클라이언트 상태만 믿고 `livekit-token`, `accept-invite`, `join-public-room`, `trigger-vgen`, `start-recording` 실행
- ❌ `14_17` 사용자를 녹화/DUB/VGEN/public demo/OBS/gift에 포함
- ❌ 익명 viewer에게 age gate 없이 demo room LiveKit 토큰 발급

## 관련 문서

- `../specs/SecurityPolicies.md` — SEC-AGE 서버 재검증
- `../API-SURFACE.md` — age gate 대상 Edge Functions
- `ViewerGate.md` — `/rooms/:id` 진입 시 `age-gate` redirect
- `AuthPage.md` — 회원가입/OAuth 이후 `/onboarding/age`
