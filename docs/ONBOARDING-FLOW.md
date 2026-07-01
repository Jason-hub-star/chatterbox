---
tags: [guide]
---

<!--
  2026-06-29 — 온보딩 플로우 확정
  ⑭ 시네마틱 + ⑨ 초대장 + ⑩ 장르선택 + ④ 매칭 + ⑥ 백스테이지 + ⑮ Progressive 조합
  짝 문서: FEATURE-SPEC.md, contracts/AuthPage.md, contracts/LobbyPage.md, contracts/GreenRoom.md
-->

# ONBOARDING-FLOW — ChatterBox 통합 온보딩 시스템

> **확정 방식**: 6개 패턴 조합 (시네마틱 + 초대장 + 장르선택 + 매칭 + 백스테이지 + Progressive)
> 진입 경로에 따라 **트랙 A(초대)** · **트랙 B(직접)** · **재방문** 3가지로 분기.

---

## 1. 전체 플로우

```
┌──────────────────────────────────────────────────────────┐
│                      진입 경로 분기                        │
├────────────────────────┬─────────────────────────────────┤
│  트랙 A — 초대 링크     │  트랙 B — 직접 가입              │
│  (⑨ 초대장형)          │                                  │
└──────────┬─────────────┘                                  │
           │                                                │
           ▼                                                ▼
  [소셜 1클릭 가입]                              [이메일·소셜 가입]
  AUTH-01 / AUTH-02                              AUTH-01 / AUTH-02
           │                                                │
           │                               ┌───────────────▼──────────────┐
           │                               │  [① 시네마틱 인트로]           │
           │                               │  15~20초 컨셉 영상             │
           │                               │  스킵 가능 · 첫 방문 1회만    │
           │                               └───────────────┬──────────────┘
           │                                               │
           │                               ┌───────────────▼──────────────┐
           │                               │  [② 장르 취향 선택]            │
           │                               │  판타지 · 로맨스 · SF          │
           │                               │  코미디 · 공포 · 일상 (택1~3) │
           │                               │  → 로비 방 추천에 반영         │
           │                               └───────────────┬──────────────┘
           │                                               │
           │                               ┌───────────────▼──────────────┐
           │                               │  [③ 로비 — 방 탐색 또는 매칭] │
           │                               │  혼자 → [파티 매칭] ④        │
           │                               │  팀 → 방 직접 선택            │
           │                               └───────────────┬──────────────┘
           │                                               │
           └────────────────────┬──────────────────────────┘
                                │
                                ▼
              ┌─────────────────────────────────────┐
              │  [④ 분장실 (Green Room)]              │
              │  ① 아바타 선택 + 웹캠 연결           │
              │  ② 마이크 테스트                     │
              │  ③ 스피커 테스트                     │
              │  ④ 배경 선택 (선택사항)              │
              │  → 통과 시 "무대로 나가기" 활성화    │
              └─────────────────┬───────────────────┘
                                │
                                ▼
                         🎭 룸(무대) 입장
```

---

## 2. 트랙별 상세

### 트랙 A — 초대 링크 진입 (⑨ 초대장형)

**대상**: 친구 초대 링크 / QR코드로 처음 방문한 사용자

```
초대 링크 클릭
  → 랜딩 or 로그인 페이지 (redirectTo 보존)
  → 소셜 1클릭 가입 (Google OAuth)
  → 미니 인트로 생략 (초대장은 이미 맥락 제공)
  → 역할 확인: [배우로 입장] / [관전으로 입장]
     - invite.role='viewer' 또는 모바일/익명 게스트 → viewer 고정
     - invite.role='actor' + 데스크톱 → actor 기본, 사용자가 viewer로 낮출 수 있음
  → actor/host: 15초 Quick Ready = GreenRoom compact mode (권한 허용 + 프리셋 아바타 + 마이크 선택)
     - 재방문 또는 초대 trusted device: GreenRoom 전체 생략 가능
     - 첫 배우 참여/권한 실패: 축약 GreenRoom으로 폴백
  → viewer/mobile: Viewer Gate (인증/초대/채팅 권한만 확인, GreenRoom 생략)
  → anonymous guest/demo: Viewer Gate read-only 30초 체험 (채팅·반응·투표 없음)
  → 초대된 해당 룸 직행
```

**생략 단계**: 시네마틱 인트로(풀) · 장르 선택 · 로비 탐색 · 매칭

**구현 포인트**:
- 초대 링크 형식: `/lobby?invite={invite_code}`. `room_id`는 Edge Function 검증 결과로만 받으며 URL에 직접 노출하지 않는다.
- `verify-invite-code` 입력은 `{ invite_code, expected_room_id? }`다. `/lobby?invite=...`에서는 `expected_room_id` 없이 호출하고, `/rooms/:id?invite=...`처럼 대상 방이 이미 URL에 있으면 cross-room 방지를 위해 `expected_room_id`를 함께 보낸다. 응답은 `{ room_id, role_hint, role_source, requires_password }`를 반환한다.
- 모바일 UA 또는 anonymous guest는 서버에서 `role='viewer'`, `role_source='mobile_downgrade'|'guest_demo'`로 강제한다.
- 로그인 전 방문 시 `redirectTo`를 세션에 저장, 가입 완료 후 복원
- 15초 목표: 초대 링크 클릭 → OAuth → 역할 확인 → Viewer Gate 또는 GreenRoom compact mode → 해당 룸 입장
- 인증 완료 후 actor는 `/rooms/{id}/ready?mode=compact` 또는 `/rooms/{id}/ready`, viewer는 `/rooms/{id}`로 이동
- Quick Ready 실패 사유는 `permission_denied`, `no_mic`, `no_camera`, `unsupported_device`로만 축약해 보여준다.

---

### 트랙 B — 직접 가입 (첫 방문)

**대상**: 랜딩에서 CTA 클릭 또는 직접 URL 입력한 신규 사용자

#### Step 1. 시네마틱 인트로 (⑭)

```
조건: onboarding_step IS NULL (완전 첫 방문)
소요: 15~20초 (스킵 가능)
내용: 플랫폼 컨셉 영상 — 아바타가 무대에서 연기하는 분위기
     "그림 한 장으로 함께 연기하는 무대" 텍스트 오버레이
종료: 영상 끝 or 스킵 → Step 2 자동 진행
```

| 필드 | 값 |
|---|---|
| 컴포넌트 | `CinematicIntro` |
| 트리거 | `users.onboarding_step = null` |
| 영상 경로 | `public/onboarding/intro.mp4` (15~20초) |
| 스킵 | 3초 후 우하단 버튼 노출 |
| 완료 후 | `onboarding_step = 'intro'` 기록 |

#### Step 2. 장르 취향 선택 (⑩)

```
"어떤 이야기를 하고 싶나요?"
[ 판타지 ] [ 로맨스 ] [ SF ] [ 코미디 ] [ 공포 ] [ 일상 ]
최대 3개 선택 → "다음" 버튼

→ users.preferred_genres 저장
→ 로비에서 해당 장르 방 우선 노출
```

| 필드 | 값 |
|---|---|
| 컴포넌트 | `GenreSelector` |
| 최소 선택 | 1개 |
| 스킵 가능 | O ("나중에 선택") |
| 완료 후 | `onboarding_step = 'lobby'` 기록 |

#### Step 3. 로비 — 방 탐색 또는 매칭 (④)

```
장르 필터 적용된 방 목록 표시 (LOB-01)
  ├─ 방 있음 → 방 카드 클릭 → 분장실
  └─ 혼자이거나 마땅한 방 없음
       → [지금 같이 할 사람 찾기] 버튼
         → 온라인 사용자 매칭 대기 (최대 30초) (G-265)
            ├─ 표시 문구: "매칭 중... (XX초 남음)" 카운트다운 표시
            ├─ "[취소]" 버튼 → 로비로 돌아가기
            │
            ├─ 매칭 성공 (timeout 전)
            │  → 새 방 자동 생성 (rooms.status = 'waiting')
            │  → 방 입장 → 분장실(GreenRoom)
            │
            ├─ 타임아웃 (30초 경과) (G-265)
            │  → UI: "30초 내에 함께할 사람을 찾지 못했습니다"
            │  → [빈 방 생성하기] 버튼 or [로비로 돌아가기]
            │
            └─ 에러 발생 (G-265)
               ├─ SERVER_ERROR: "서버 오류가 발생했습니다"
               │  → [다시 시도] 버튼 (max 2회)
               │  → [빈 방 생성하기] 버튼
               │  → [로비로 돌아가기] 버튼
               │
               └─ NETWORK_ERROR: "네트워크 연결이 끊겼습니다"
                  → [다시 시도] 버튼 (max 2회)
                  → [로비로 돌아가기] 버튼
```

---

### 재방문 (⑮ Progressive)

**대상**: 로그인한 기존 사용자 (`onboarding_step = 'done'`)

```
로그인 → 로비 직행 (인트로·장르 스킵)
기능은 처음 쓸 때 안내:
  - 마이크 버튼 첫 클릭 → "마이크 설정이 필요해요" 툴팁
  - 대본 첫 접근 → 대본 사용법 1줄 안내
  - 필살기 핫키 첫 사용 → 단축키 힌트 노출
```

---

## 3. 공통 게이트 — 분장실 (⑥ 백스테이지형)

**actor/host로 룸에 들어가는 모든 트랙이 룸 입장 직전 반드시 통과.** 다만 카메라 실패는 전체 입장 실패가 아니라 명시적 다운그레이드 경로를 제공한다. mobile viewer는 트래킹을 지원하지 않으므로 `Viewer Gate`(인증/초대/채팅 권한만 확인)를 통과하고 `MobileViewer` 또는 읽기 전용 room view로 간다. anonymous guest/demo viewer는 MVP에서 read-only 30초 체험만 허용하며 채팅·반응·투표 API를 호출하지 않는다.

| 단계 | 내용 | 통과 조건 |
|---|---|---|
| ① 아바타 | 모델 선택 + 웹캠 연결 + 얼굴 인식 확인 | `trackingStore.is_face_valid = true` 또는 사용자가 `voice-only actor` 폴백 승인 |
| ② 마이크 | 입력 레벨 시각화 + 볼륨 확인 | 레벨 > 임계값 or 사용자 "확인" |
| ③ 스피커 | 테스트 음원 재생 | 사용자 "들려요" 확인 |
| ④ 배경 | 씬 선택 (선택사항) | 언제나 통과 가능 |

**예외**: 웹캠 거절/미지원 시 OS별 트러블슈팅 가이드와 함께 `[정적 아바타+음성으로 입장]`, `[관전으로 입장]`을 제시한다. 마이크까지 거절되면 actor는 차단하고 viewer로만 입장 가능하다.
**Viewer 예외**: `role='viewer'` 또는 모바일 viewer는 얼굴 인식·마이크 테스트를 요구하지 않는다. LiveKit 권한은 `canPublish=false`, `canPublishData=false`이고 채팅은 서버/Edge 검증 경유만 허용한다.
**Viewer Gate 정의**: invite/password 검증을 수행하고, 필요한 경우 `accept-invite`/`join-public-room` Edge Function을 통해 `room_participants role='viewer'` 생성을 오케스트레이션한다. 서버 채팅 토큰/CSRF 검증 준비만 수행하며 LiveKit DataChannel publish 권한을 절대 넓히지 않는다.

---

## 4. onboarding_step 상태 흐름

```
NULL → 'intro' → 'genre' → 'lobby' → 'done'
```

```sql
-- users 테이블에 컬럼 추가 (DATA-SCHEMA.md 반영 필요)
ALTER TABLE users ADD COLUMN onboarding_step TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN preferred_genres TEXT[] DEFAULT '{}';
-- onboarding_step: NULL | 'intro' | 'genre' | 'lobby' | 'done'
```

---

## 5. 라우트 맵

| 경로 | 컴포넌트 | 조건 |
|---|---|---|
| `/login` | `LoginPage` | 비인증 |
| `/register` | `RegisterPage` | 비인증 |
| `/onboarding/intro` | `CinematicIntro` | 첫 방문 트랙 B |
| `/onboarding/genre` | `GenreSelector` | 트랙 B |
| `/onboarding/age` | `AgeGate` | 인증 후 `users.age_band` 없음 |
| `/lobby` | `LobbyPage` | 인증 필수 |
| `/rooms/:id/ready` | `GreenRoom` | 인증 필수. `?mode=compact`는 Quick Ready |
| `/rooms/:id` | `RoomView` | actor/host는 Green Room 통과 필수, viewer는 Viewer Gate 통과 |
| `/lobby?invite=:inviteCode` | `LobbyPage` | 인증 여부 무관. Edge Function이 invite_code를 검증하고 room_id를 반환 |

---

## 6. 컨셉 영상 기획 (트랙 B Step 1)

| 항목 | 내용 |
|---|---|
| 길이 | 15~20초 |
| 분위기 | 따뜻한 모닥불 무대 (campfire-forest) + 아바타들이 연기하는 장면 |
| 텍스트 | "그림 한 장으로 함께 연기하는 무대" |
| 제작 방법 | fal.ai Seedance 2.0 + CapCut 편집 or 직접 화면 녹화 (아바타 데모 룸) |
| 파일 경로 | `public/onboarding/intro.mp4` |
| 백업 | 영상 로드 실패 시 정지 이미지(`campfire-forest-v2.jpg`) + 텍스트로 대체 |

---

## 7. 관련 문서

- `contracts/AuthPage.md` — 로그인·회원가입 컴포넌트 계약
- `contracts/LobbyPage.md` — 로비 컴포넌트 계약 (LOB-01·03·04·05)
- `contracts/GreenRoom.md` — 분장실 컴포넌트 계약 (MOD-05·06)
- `FEATURE-SPEC.md` — LOB-05(초대링크), AUTH-01~03, MOD-05~06
- `DATA-SCHEMA.md` — users.onboarding_step, users.preferred_genres 추가 필요
- `docs/assets/scenes/campfire-forest-v2.jpg` — 인트로 백업 이미지

---

## 한줄정리

초대 링크(빠른 트랙)·직접 가입(풀 온보딩)·재방문(Progressive 스킵) 3경로로 분기하며,
actor/host 경로는 분장실(Green Room)을 공통 게이트로 거치고, viewer/mobile 경로는 별도 Viewer Gate로 트래킹 없이 입장한다.
