---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·타입 정의 -->
<!-- 데이터 스키마: DATA-SCHEMA.md §1.2/1.3, FEATURE-SPEC.md LOB-01/03/04/05 -->
<!-- opencode: 2026-06-29 - C3·G-38 초대링크 불일치 해소 (?invite={room_id} → ?invite={invite_code}, room_invites.invite_code_hash 연동). Coded with OpenCode; high-cost model review recommended. -->

# 2. LobbyPage

방(room) 탐색·생성 페이지 orchestrator. 방 목록 조회, 방 생성 폼, 페이셜 게이트(얼굴 인식 검증), 초대링크 생성·공유 담당.

> **구현 상태 (2026-07-05, LOB-01 로비 마감 MVP)** — 이 계약은 풀비전(초대링크·페이셜게이트·대기열·아카이브)이고 아래는 as-built:
> - **방 목록·생성**: `public_rooms` 뷰 조회 + `create-room` (제목만). 페이셜게이트·모드선택·설명·장르는 미배선(forward-spec 유지).
> - **검색(LOB-02)**: 클라이언트측 필터(제목·호스트명 `includes`). 서버 `.ilike`/다중필터(G-60)는 후속.
> - **비번방 입장(Phase 2 검증②)**: LobbyPage 클릭 → `join-public-room`이 잠금방에 403 `"Room is locked"` → RoomPage가 `password` 단계로 전환 → `join-room-with-password`(PBKDF2 상수시간). **이미 완결·보안검증됨**(`join-public-room/index.ts:35`).
> - **Realtime 자동갱신 — 계약 §실시간갱신방식(postgres_changes `rooms.on('*')`)에서 편차**: rooms RLS가 참가자 전용이라 비참가자(로비 사용자)에겐 postgres_changes 이벤트가 안 온다. RLS를 넓히면 뷰가 숨긴 내부 컬럼(`host_id`·`authority_state_json`·`background_key`)이 노출되므로 반려. 대신 **DB 트리거가 rooms 변경 시 민감정보 없는 nudge 를 public `lobby` 채널로 `realtime.send(private=false)` broadcast → 클라가 debounce(400ms) 후 뷰 재조회**. 마이그 `20260705130000_lobby_realtime_broadcast`. 감시컬럼=status·is_locked·current_participants·**max_participants**·title·genre·host_id(뷰 노출 + 로비 full 계산용). **fail-open**: 트리거는 `realtime.send` 를 BEGIN..EXCEPTION 으로 감싸 삼킨다 — 브로드캐스트 실패가 핵심 방 쓰기(생성/입장/퇴장)를 롤백시키면 안 됨(AFTER 트리거 미처리 예외=txn abort). 로컬 실측: 정상 delta=4 + anon 클라 수신 PASS + fail-open 양방향 증명(send raise 시 방 INSERT 커밋 유지 / 핸들러 없으면 롤백).

## Props Interface

```typescript
interface LobbyPageProps {
  /**
   * (선택) 초대링크로 진입 시 수신한 invite_code (room_id 아님)
   * URL: https://chatterbox.vercel.app/lobby?invite={invite_code}
   * 서버(Edge Function)에서 invite_code_hash 검증 후 room_id 반환
   */
  inviteCode?: string;

  /**
   * (선택) 오류 콜백
   */
  onError?: (error: Error) => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `userStore` | `userId` | ✓ | | 현재 로그인 사용자 ID |
| `userStore` | `selectedModelId` | ✓ | | 선택한 아바타 모델 ID |
| `roomStore` | `rooms` | ✓ | ✓ | 발견한 방 목록 (방 제목, 인원, 잠금 여부) |
| `roomStore` | `fetchRooms()` | | ✓ | Supabase rooms 테이블 조회 |
| `roomStore` | `createRoom(title, description, isPrivate, password?)` | | ✓ | 새 방 생성 |
| `roomStore` | `currentRoomId` | ✓ | ✓ | 입장할 room ID (선택 후) |
| `trackingStore` | `avatarState` | ✓ | | MediaPipe 얼굴 추적 상태 (IDLE/INITIALIZING/CALIBRATING/TRACKING) |
| `trackingStore` | `isFaceValid` | ✓ | ✓ | 페이셜 게이트 통과 여부 |
| `trackingStore` | `startTracking()` | | ✓ | MediaPipe 얼굴 추적 시작 |

**쓰기:** LobbyPage만 방 생성 및 생성 후 roomStore.currentRoomId 설정.

## 컴포넌트 구조

```
[LobbyPage]
  ├─ [OnboardingCompletionBanner] (G-267, 신규 사용자 전용)
  │  ├─ 조건: user.onboarding_completed_at 존재 && (now - onboarding_completed_at) < 7 days
  │  ├─ 콘텐츠: 5단계 짧은 가이드 배너
  │  │  ├─ Step 1: "프로필 완성하기" (avatar 선택/업로드)
  │  │  ├─ Step 2: "아바타 커스터마이징" (표정 조정, appearance)
  │  │  ├─ Step 3: "첫 방 만들기 또는 입장하기"
  │  │  ├─ Step 4: "친구 초대하기" (friend request/invite link)
  │  │  └─ Step 5: "공연 시작하기" (broadcast/go live)
  │  └─ 각 Step 완료 시 배너 프로그레스 갱신 (Step 1→2→3→4→5→배너 숨김)
  │
  ├─ [RoomListSection]
  │  ├─ useQuery: 방 목록 조회 (Supabase)
  │  │  └─ SELECT * FROM rooms WHERE status IN ('waiting', 'live')
  │  │
  │  └─ [RoomCard] x N (각 방마다) — G-61 언어 뱃지 추가
  │     ├─ 방 제목, 설명, 현재 인원/최대 인원
  │     ├─ 자물쇠 아이콘 (private 여부)
  │     ├─ 태그 (comedy, drama, etc.)
  │     ├─ 언어 뱃지 — 우상단에 국기 이모지 표시 (ko→🇰🇷, en→🇺🇸, ja→🇯🇵, zh→🇨🇳, default→🌐)
  │     │
  │     └─ "입장" 버튼
  │        └─ 클릭 → [FacialGateModal] 열기
  │
  ├─ [CreateRoomModal] / [CreateRoomButton]
  │  ├─ 방 제목 입력
  │  ├─ 설명 입력 (선택)
  │  ├─ 공개/비밀번호 토글
  │  ├─ 메인뷰 모드 선택
  │  │  ├─ "VOD 상영형" (VGEN-01/04와 다름)
  │  │  └─ "AI영상생성형" (VGEN 플로우)
  │  │
  │  └─ "방 만들기" 버튼
  │     └─ onSubmit → roomStore.createRoom()
  │        ├─ Supabase: INSERT INTO rooms
  │        ├─ 생성 성공 시:
  │        │  ├─ roomStore.currentRoomId = 새 room_id
  │        │  └─ useNavigate() → /rooms/{room_id}/ready (GreenRoom)
  │        └─ 생성 실패 → errorToast
  │
  ├─ [FacialGateModal]
  │  ├─ 웹캠 미리보기
  │  ├─ "얼굴 검증 시작" 버튼
  │  │  └─ trackingStore.startTracking() 호출
  │  │     ├─ MediaPipe 초기화
  │  │     ├─ trackingStore.avatar_state = CALIBRATING
  │  │     └─ 8개 동작 수행: 깜빡·윙크·입벌림·모음·볼·미소·슬픔·화남
  │  │
  │  ├─ 진행 상태 표시 (% 완료도)
  │  └─ "통과" / "다시하기" / "건너뛰기"
  │     ├─ "통과" → trackingStore.is_face_valid = true
  │     │  └─ navigate → /rooms/{room_id}/ready (GreenRoom)
  │     │
  │     ├─ "다시하기" → 재시도
  │     │
  │     └─ "건너뛰기" (P0에선 선택지 없으나, 진행 불가)
  │
  ├─ [DemoRoomSection]
  │  └─ 공개 Watch-only 데모 방 카드 → anonymous/viewer 입장
  │
  ├─ [ReservationSection]
  │  └─ 예약 공연 만들기 + 알림 대상 선택
  │
  ├─ [RecentPlaymatesSection]
  │  └─ 최근 함께한 사람/방 → 다시 초대
  │
  ├─ [PastRoomsSection] (G-67 방 아카이브/갤러리)
  │  ├─ 진입 조건: 로그인 사용자 (로그아웃 상태에서는 숨김)
  │  ├─ 탭/섹션 헤더: "지난 공연"
  │  │
  │  ├─ 데이터 쿼리:
  │  │  └─ SELECT r.*, recordings.thumbnail_url, recordings.id as recording_id
  │  │     FROM rooms r
  │  │     JOIN room_participants rp ON rp.room_id = r.id AND rp.user_id = auth.uid()
  │  │     LEFT JOIN recordings ON recordings.room_id = r.id
  │  │       AND recordings.visibility IN ('public', 'members_only')
  │  │     WHERE r.status = 'ended'
  │  │     ORDER BY r.ended_at DESC
  │  │     LIMIT 20
  │  │
  │  ├─ 각 항목 표시 (카드 또는 그리드):
  │  │  ├─ 방 제목 + 참가 날짜 (r.ended_at 포맷)
  │  │  ├─ 썸네일 (recordings.thumbnail_url 있으면 사용, 없으면 기본 이미지)
  │  │  ├─ 참가 인원 수 (COUNT(room_participants))
  │  │  └─ 액션 버튼 (G-267):
  │  │     ├─ [다시 감상] → VgenExport 또는 녹화물 재생
  │  │     ├─ [비슷한 공연 찾기]
  │  │     │  └─ 같은 장르(genre_tags)·같은 호스트(host_id) 방을 로비 필터에서 검색 후 표시
  │  │     └─ [함께한 배우 다시 초대]
  │  │        └─ room_participants 기반으로 같이 출연했던 사람들 목록 → 초대링크 일괄 생성 UI
  │  │
  │  ├─ 페이지네이션: 무한 스크롤 (cursor: r.ended_at)
  │  │
  │  └─ 빈 상태:
  │     └─ "아직 참가한 공연이 없어요. 첫 공연을 시작해보세요!"
  │
   └─ [InviteLinkSection] (로비 하단)
      ├─ 초대링크 입력/코드 입력
      │  (예: https://chatterbox.vercel.app/lobby?invite={invite_code})
      │  ※ invite_code는 room_invites 테이블의 암호화 코드, room_id(UUID) 노출 금지
      │
      └─ "초대 수락" 버튼 (또는 자동)
         └─ inviteCode 있으면 Edge Function으로 코드 검증 → room_id 획득 후 자동 입장 시도
```

## 인증 및 접근 흐름

### 방 목록 조회 (LOB-01) — 다중 필터 지원 (G-60)

```
1. LobbyPage mount
2. useQuery: SELECT * FROM rooms WHERE status IN ('waiting', 'live')
   (RLS: 인증된 사용자만, 모든 방 공개 조회)
   
   (G-60 다중 필터 적용)
   필터 조건:
   - .ilike('title', `%${searchQuery}%`)        (텍스트 검색, LOB-02)
   - .contains('genre_tags', selectedGenres)    (genres 선택 시)
   - .eq('language', selectedLanguage)          (언어 선택 시)
   - .gte('current_participants', minParticipants)
   - .lte('current_participants', maxParticipants)
   - .eq('status', 'active')
   
3. 응답: rooms[] 리스트 (필터 후)
   - room_id, title, description
   - current_participants, max_participants
   - host_id, status
   - is_locked (true이면 private 표시)
   - background_url, genre, language
   
4. (G-58) 사용자 선호 장르 필터 및 정렬
   - 로그인 사용자의 users.preferred_genres 배열 읽기
   - 결과 정렬: 방의 genre_tags ∩ preferred_genres가 많은 순서대로
   - preferred_genres 비어있으면 기본 정렬 유지
   
5. UI: [RoomCard] 컴포넌트 반복 렌더
   - 방 제목, 인원, 태그, 자물쇠 아이콘
   - (G-58) "당신의 장르" 배지 (장르 일치 시)
   - (G-59) "마감" 배지 및 "대기 신청" 버튼 (가득 찼을 시)
```

### 방 검색 다중 필터 (G-60, LOB-02)

```
RoomFilterPanel Props:
  genres: string[]          (체크박스 다중 선택; preferred_genres 기본 선택됨)
  language: string | null   (드롭다운; null=전체)
  minParticipants: number   (슬라이더 0~6; 0=전체)
  maxParticipants: number   (슬라이더; 6이 max)
  searchQuery: string       (텍스트 검색)

필터 UI 위치:
  - 로비 방 목록 상단 접이식 패널 (기본 닫힘)
  - "필터" 버튼 클릭 → 펼침
  
필터 초기화:
  - "필터 초기화" 버튼 → 모든 필터 기본값 복원
  
필터 적용 Supabase Query:
  supabase
    .from('rooms')
    .select('*')
    .ilike('title', `%${searchQuery}%`)
    .contains('genre_tags', genres.length > 0 ? genres : null)
    .eq('language', language)
    .gte('current_participants', minParticipants)
    .lte('current_participants', maxParticipants)
    .eq('status', 'active')
    .order('created_at', {ascending: false})
```

### 방 생성 (LOB-03)

```
1. "방 만들기" 버튼 클릭 → [CreateRoomModal] 열기
2. 사용자 입력:
   - title (필수, 최대 100자)
   - description (선택, 최대 500자)
   - isPrivate (공개/비밀번호)
   - password (비밀번호 모드일 시, 최소 4자)
   - mainViewMode ('vod' | 'vgen')
   - language (G-61) — 드롭다운 선택 (기본값 'ko': 한국어)
     값: 'ko' (한국어) | 'en' (English) | 'ja' (日本語) | 'zh' (中文) | ...
3. 폼 검증 + roomStore.createRoom(title, description, isPrivate, password?) 호출
4. Supabase Edge Function: create room + optional room_secrets.password_hash
   - host_id = userStore.userId
   - status = 'waiting'
   - background_url = NULL (기본값, 나중에 호스트가 설정)
   - password_hash: 서버에서 bcrypt 또는 argon2로 해시 후 room_secrets에만 저장
5. 성공 시:
   - roomStore.currentRoomId = response.room_id
   - useNavigate() → /rooms/{room_id}/ready (GreenRoom)
6. 실패 시 (권한 없음, 네트워크 에러):
   - errorToast 표시
   - 로비 그대로 유지
```

### 페이셜 게이트 (LOB-04, 입장 전 검증)

```
1. [RoomCard] "입장" 버튼 클릭
2. [FacialGateModal] 열기
3. 웹캠 권한 요청
   - 거절 시: "웹캠 접근을 허용하세요" 팝업 + 설정 가이드
   - 승인 시: 웹캠 미리보기 시작
4. "얼굴 검증 시작" 버튼 클릭
   → trackingStore.startTracking()
   → MediaPipe 초기화 + 8동작 수행
5. 검증 결과:
   - 성공 (trackingStore.avatar_state = TRACKING)
     → trackingStore.is_face_valid = true
     → "통과" 버튼 활성화
   - 실패 (얼굴 미인식 or 동작 미완)
     → "다시하기" 유도
6. "통과" 클릭
   → roomStore.currentRoomId = selected room_id
   → useNavigate() → /rooms/{room_id}/ready (GreenRoom)
```

### 방 가득 참 알림 및 대기열 (G-59)

```
1. [RoomCard] 상태 체크:
   - current_participants < max_participants: 일반 입장 버튼
   - current_participants = max_participants: 마감 상태
   
2. 마감 상태 시 UI:
   - 입장 버튼 → disabled (회색)
   - 버튼 텍스트: "🔴 마감 (대기 신청)"
   - 클릭 → 대기 신청 모달

3. 대기 신청 플로우:
   a. 사용자가 "🔴 마감 (대기 신청)" 클릭
   b. INSERT INTO room_waitlist (room_id, user_id, created_at)
   c. 성공 시:
      - 토스트: "자리가 나면 알려드릴게요"
      - 버튼 변경: "대기 중..." → "대기 취소" 버튼
   d. 실패 시:
      - 이미 대기 중이면: "이미 대기 중입니다" 메시지
      - 토스트 오류

4. 대기 취소:
   - DELETE FROM room_waitlist WHERE room_id = ? AND user_id = ?
   - 버튼 복원: "대기 취소" → "🔴 마감 (대기 신청)"

5. 자리 생겼을 때 알림:
   - Supabase Realtime room_participants DELETE (퇴장) 감지
   - current_participants < max_participants 확인
   - room_waitlist의 최초 1명 대상으로 알림 생성
   - Notification Center: "방 이름에 자리가 났습니다!" (클릭 → 방 입장 시도)
   - 알림 발송 후 room_waitlist.notified_at 갱신
```

### 초대링크 수락 (LOB-05)

```
1. 초대링크: https://chatterbox.vercel.app/lobby?invite={invite_code}
   ※ invite_code는 room_invites.invite_code_hash와 매칭되는 암호화 코드. room_id(UUID) 직접 노출 금지.
2. LobbyPage mount 시:
   - location.search 파싱: inviteCode = invite_code 값
   - props로 받거나 useSearchParams() 사용
3. inviteCode 있으면:
   - Supabase Edge Function: verify-invite-code({ invite_code }) 호출
   - 서버가 invite_code를 해시하여 room_invites.invite_code_hash와 매칭
   - 검증 항목: expires_at > now(), revoked_at IS NULL, used_count < max_uses
   - 성공 시: { room_id, role, role_source, requires_password } 반환
     - role: 'actor' | 'viewer'
     - 모바일/anonymous guest는 서버에서 viewer로 강제 다운그레이드
   - 실패 시: { error: 'invalid'|'expired'|'revoked'|'used_up' } 반환
4. 검증 성공 + 비밀번호 불필요:
   - [SECURITY] verify-invite-code는 read-only (참가자 생성·사용횟수 증가 없음).
     사용자가 입장 버튼을 클릭하는 시점에 accept-invite Edge Function을 별도 호출한다.
   - accept-invite 호출 시: { invite_code, room_id, requested_role?, device_type, idempotency_key }
     → 서버가 room_invites 검증 + used_count 증가 + room_participants insert/update 처리
     → 입장 성공 후 호스트에게 인앱 알림 생성 (G-266):
       * 알림 타입: `invite_accepted`
       * 본문: "OOO가 당신의 초대를 수락했습니다"
       * 저장 위치: `notifications` 테이블 (room_id, inviter_user_id 기반)
       * 클릭 시 동작: /rooms/{room_id}로 이동 (진행 중 방이면 실시간 화면, 종료되면 녹화물)
   - [InviteLinkSection]에서 역할 확인 UI 표시:
     - `role='actor'` + 데스크톱: [배우로 입장] 기본, [관전으로 입장] 다운그레이드 가능
     - `role='viewer'` 또는 모바일/guest: [관전으로 입장]만 표시
   - actor 클릭 시 → Quick Ready(15초 목표) → 통과 시 /rooms/{room_id}, 실패 시 /rooms/{room_id}/ready (GreenRoom)
   - viewer 클릭 시 → Viewer Gate → /rooms/{room_id} MobileViewer/read-only view
5. 검증 성공 + 비밀번호 필요:
   - 모달에서 비밀번호 입력 유도
   - Supabase Edge Function: verify-room-password(room_id, password_attempt)
   - 성공 시 → [FacialGateModal] 진행
6. 검증 실패:
   - errorToast: "초대 링크가 만료되었거나 이미 사용되었습니다"
   - 로비 그대로 유지
```

### 초대 메시지 템플릿 (G-166)

호스트가 초대 링크를 만든 직후 복사할 수 있는 안내 메시지를 함께 생성한다. 링크만 던져서 초대받은 사용자가 다음 행동을 모르는 상태를 막는 것이 목적이다.

```
InviteMessageTemplate
  입력: room.title, invite.role, invite.expires_at, max_uses, host display_name
  출력:
    - 짧은 메시지: "지금 ChatterBox에서 같이 연기할래?"
    - 역할 안내: actor면 "PC + Chrome + 웹캠/마이크 권장", viewer면 "모바일 관전 가능"
    - 준비물: 이어폰, 조용한 공간, Google 로그인, 카메라/마이크 권한 허용
    - 15초 입장 안내: "링크 클릭 → Google 로그인 → 역할 확인 → 바로 입장"
    - 모바일 안내: "iPhone/Android는 관전·채팅·리액션 모드로 열려요"
    - 링크 만료/재초대 안내
    - [복사] [카카오/Discord 공유] [QR 보기]
```

**템플릿 예시**

```text
{hostName}님이 "{roomTitle}" 방에 초대했어요.
역할: {actor|viewer}
배우로 참여하면 PC에서 웹캠과 마이크를 준비해주세요.
Chrome을 권장해요. 모바일에서는 관전/채팅/리액션으로 들어갈 수 있어요.
모바일이면 관전 모드로 바로 들어갈 수 있어요.
초대 링크: {inviteUrl}
```

**MUST NOT**
- ❌ actor 초대에 모바일 트래킹 가능하다고 안내
- ❌ invite_code 원문을 DB에 저장하거나 화면에 분리 표시
- ❌ 만료/취소된 링크에 공유 버튼 활성화

### 선호 장르 추천 배너 (G-58)

```
1. LobbyPage 마운트 시 userStore.preferred_genres 확인
2. preferred_genres가 비어있지 않으면 배너 표시:
   - "당신이 선택한 장르: 로맨스, 판타지 — 이 방들을 추천해요 👆"
   - 배너 위치: 방 목록 상단 (RoomCard 그리드 위)
   - 스타일: soft highlight 배경, 폐기 버튼 (×) 포함
   
3. preferred_genres 기반 정렬:
   - 방 목록을 재정렬: 장르 교집합이 많은 순서대로
   - 교집합 없는 방은 하단 배치
   
4. 선호 장르가 비어있으면 배너 미표시
   - 기본 방 목록 표시 (최신순)
```

### 공개 데모룸 / 예약 / 최근 재초대

**DemoRoomSection (LOB-07, P0):**
- `public_rooms`에서 `is_demo=true` 또는 system demo room을 조회한다.
- 비인증 사용자는 Supabase anonymous session을 만들고 `room_participants.role='viewer'`, `role_source='guest_demo'`로만 입장한다.
- demo viewer LiveKit 토큰은 `canPublish=false`, `canPublishData=false`; 채팅이 허용되면 `send-viewer-chat` Edge Function만 사용한다.

**AlwaysOnDemoRoom (LOB-09, P0):**
- 마케팅 랜딩(외부 snack-web) CTA "데모 보기"에서 1클릭으로 진입하는 30초 watch-only 룸.
- 구성: 사전 녹화된 아바타 루프, 모닥불/무대 배경, 시스템 채팅/리액션 루프, 참가자 목록 2~3명.
- 비로그인 사용자는 anonymous viewer로만 입장하고 30초 이후 [알림받기] 또는 [초대 링크 만들기 대기자 등록] CTA를 본다.
- 실제 LiveKit 연결이 준비되지 않은 피치 전에는 녹화 루프 + read-only room shell을 허용하되, UI에 "데모 루프" 배지를 표시한다.

**ReservationSection (LOB-06):**
- `room_reservations`에 `scheduled_at`, `title`, `invite_code_hash`를 저장한다.
- `notifications`에 `reservation_invite`/`reservation_reminder`를 생성한다. MVP는 in-app 알림 필수, email/push는 provider 설정 후 활성화한다.

**RecentPlaymatesSection (LOB-08):**
- `user_room_history`에서 최근 방/최근 함께한 사람을 표시한다.
- [다시 초대]는 새 `room_invites`를 발급하고 `notifications.type='re_invite'`를 생성한다.
- 전체 friend graph는 P2이며 MVP/P1에서는 최근 활동 기반 재초대만 구현한다.

**PastRoomsSection (G-67, 방 아카이브/갤러리):**
- `rooms` 테이블에서 `status = 'ended'` 필터링 (현재 사용자가 참가한 방만)
- `room_participants`와 JOIN하여 같은 방 참가자 확인
- LEFT JOIN `recordings`로 관련 녹화물 썸네일 조회 (visibility='public' 또는 'members_only'만)
- `ended_at` 기준 내림차순 정렬 + LIMIT 20
- 무한 스크롤 페이지네이션 (cursor: ended_at)
- 각 카드에 방 제목, 참가 날짜, 썸네일, 인원, "다시 감상" 버튼 표시

**Edge Function: verify-invite-code (신규)**

```typescript
// supabase/functions/verify-invite-code/index.ts
// 입력: { invite_code: string, expected_room_id?: string }
// 출력: { valid, room_id, role_hint, role_source, requires_password } | { valid: false, reason: string }
// 검증: invite_code_hash 매칭 + expires_at + revoked_at + used_count < max_uses
// 성공 시: read-only. used_count 증가와 room_participants 생성은 accept-invite에서만 수행.
// ponytail: brute-force 방어는 SecurityPolicies §0 SEC-P0-04 + rate limit (IP당 분당 5회)로 처리.
```

## Supabase 접근

| 테이블/엔드포인트 | 작업 | 시점 | RLS |
|---|---|---|---|
| `rooms` | SELECT (모든 방 조회) | 페이지 load | 인증된 사용자만 |
| `rooms` | INSERT (방 생성) | 방 만들기 제출 | user_id = host_id 검증 |
| `rooms` | SELECT WHERE id = ? (단일 방 조회) | 초대링크 수락 | 공개 조회 |
| (Edge Function) | `verify-invite-code(invite_code, expected_room_id?)` | 초대코드 검증 | 서버 측 invite_code_hash 비교, room_invites 테이블. read-only |
| (Edge Function) | `verify-room-password(room_id, pwd_attempt)` | 비밀번호 검증 | 서버 측 hash 비교 |

**LobbyPage 책임:** 폼 → roomStore 액션 → 네비게이션.

## DataChannel 의존성

**없음** — 로비는 LiveKit Room 연결 전 단계다. 방 목록/생성/초대 검증은 Supabase와 Edge Function만 사용한다.

## 금지 사항 (MUST NOT)

- ❌ **페이셜 게이트 미통과 시 방 입장 허용** — trackingStore.is_face_valid = true 확인 후만 /rooms/{id}/ready 진입
- ❌ **viewer/mobile/guest에게 페이셜 게이트 강제** — Viewer Gate만 통과
- ❌ **모바일 actor 강제** — 모바일은 viewer로 서버 다운그레이드
- ❌ **역할 선택 UI 없이 초대 수락 즉시 actor 입장** — 초대받은 사용자가 배우/관전 차이를 이해해야 함
- ❌ **room_id 직접 URL 변조로 입장** — react-router Protected route 없음 (LOB-04 게이트 필수)
- ❌ **비밀번호 평문으로 Supabase 전송** — HTTPS only, 클라이언트 hash 후 전송 (또는 Edge Function으로 위임)
- ❌ **초대링크에 room_id(UUID) 직접 노출** — `?invite={room_id}` 추측 가능. 반드시 `?invite={invite_code}` 사용 (room_invites.invite_code_hash 매칭, DATA-SCHEMA §1.2.2)
- ❌ **클라이언트에서 invite_code를 직접 DB 조회** — Edge Function `verify-invite-code` 경유만. invite_code_hash는 서버에서만 비교
- ❌ **방 생성 후 호스트 권한 검증 생략** — Supabase RLS: `rooms.host_id = current_app_user_id()` 필수 (`current_app_user_id()`는 `users.auth_id = auth.uid()`로 찾은 `users.id`)
- ❌ **MediaPipe 초기화 전 얼굴 미인식으로 진행** — trackingStore.avatar_state = TRACKING 상태 확인 필수
- ❌ **로비 페이지에서 직접 LiveKit 연결** — 입장 전 (GreenRoom) 미리보기만, 실제 연결은 RoomView에서
- ❌ **방 목록 페이지네이션 없이 전체 로드** — 수백 개 방 로딩 시 성능 저하. useInfiniteQuery 또는 Pagination 구현

## 컴포넌트 관계

```
[LobbyPage]
  ├─ 페이지 로드
  │  └─ useQuery: fetchRooms()
  │     └─ rooms[] 리스트 render
  │
  ├─ [RoomCard] x N
  │  └─ "입장" 버튼
  │     └─ onClick → setSelectedRoom(room_id)
  │        └─ [FacialGateModal] 열기
  │
  ├─ [CreateRoomButton]
  │  └─ onClick → [CreateRoomModal] 열기
  │     ├─ 폼 입력
  │     └─ "방 만들기"
  │        └─ roomStore.createRoom() → /rooms/{id}/ready
  │
  ├─ [FacialGateModal]
  │  ├─ 웹캠 미리보기
  │  ├─ MediaPipe 8동작 검증
  │  ├─ "통과" → /rooms/{room_id}/ready
  │  ├─ "다시하기"
  │  └─ "건너뛰기" (비활성화 또는 불가)
  │
   └─ [InviteLinkSection]
      ├─ 초대링크 입력 필드
     └─ "초대 수락" → verify-invite-code(read-only) → accept-invite → /rooms/{room_id}/ready
```

## 검증 체크리스트

### 구현 체크

- [ ] Supabase RLS: rooms 테이블 SELECT 권한 (인증 사용자만)
- [ ] Supabase RLS: rooms INSERT 시 `host_id = current_app_user_id()` 검증
- [ ] 방 생성 폼: title 최소 1자, 최대 100자 검증
- [ ] 비밀번호 모드: 입력된 비밀번호 최소 4자 검증
- [ ] 페이셜 게이트: trackingStore.avatar_state = TRACKING 상태만 진행 허용
- [ ] 초대링크: `?invite={invite_code}` 파싱, `?room_id=` 직접 노출 금지 (SecurityPolicies SEC-P0-04)
- [ ] 초대코드 검증: Edge Function `verify-invite-code` 호출, 클라이언트 직접 DB 조회 금지
- [ ] 웹캠 권한 거절 시 오류 메시지 + 설정 가이드 제공
- [ ] 방 목록 조회 실패 시 retry 로직 (useQuery enabled 옵션)

### 리뷰 체크

- [ ] Props interface가 완전한가?
- [ ] Store 읽기/쓰기 구분이 정확한가? (LobbyPage만 createRoom 호출)
- [ ] Supabase RLS 정책과 쿼리가 일치하는가?
- [ ] 페이셜 게이트 검증이 필수인가? (trackingStore.is_face_valid 확인)
- [ ] 금지 사항 위반이 없는가?
- [ ] 접근성(웹캠 권한 거절 UI 등)을 만족하는가?
- [ ] 초대링크 처리가 안전한가? (CSRF, 토큰 만료 등)

## § RoomCard 실시간 표시 스펙

각 RoomCard는 다음 항목을 rooms 테이블의 컬럼 값으로부터 표시한다.

### 표시 항목 명세

| UI 요소 | 테이블 컬럼 | 표시 규칙 | 비고 |
|---------|-----------|---------|------|
| 상태 인디케이터 | `status` | `'live'` → ● (filled circle), `'waiting'` → ○ (empty circle) | 색상: live=주황, waiting=회색 |
| 점유율 | `current_participants`, `max_participants` | `{current}/{max}` (예: 4/6) | 폰트 크기: 본문보다 작게 |
| 현재 씬명 | `background_url` | URL에서 slug 파싱 (예: `scenes/dramatic/url` → "Dramatic") 또는 사용자 정의 씬명 | 씬명 DB 조인 미정 시 placeholder "Untitled" |
| 아바타 도트 | `room_participants` (JOIN) | 현재 참여자 최대 4명의 `avatar_color` 시각화 (4×4px 원형 도트) | 0명: 도트 미표시, 1~3명: 참여자 수만큼, 4명 이상: 4개 도트만 + "+N" 텍스트 |
| 방 제목 | `title` | 최대 1줄, 초과 시 말줄임 (ellipsis) | 폰트 크기: 16px |
| 장르 태그 | `genre` | 컬러 배지 (예: `comedy`→노란색, `drama`→파란색) | 최대 2개 표시 |
| 자물쇠 아이콘 | `is_locked` | true이면 🔒 아이콘 표시 | 우상단 고정 위치 |
| 사용자 장르 배지 (G-58) | `genre_tags` ∩ `users.preferred_genres` | 사용자의 preferred_genres와 방의 genre_tags가 교집합 있을 때 "당신의 장르" 배지 표시 | G-58: preferred_genres 필터 및 배지 표시 |
| 방 가득 참 표시 (G-59) | `current_participants` = `max_participants` | 현재 인원 = 최대 인원일 때 "마감" 배지 + 입장 버튼 → "대기 신청" 버튼 | G-59: room_waitlist 대기열 기능 |

### 실시간 갱신 방식

**Supabase Realtime 구독 선택 (Polling 제외)**

- **사유**: LobbyPage 방 목록은 여러 사용자가 동시에 참여/퇴장하는 이벤트 기반이므로 폴링(주기적 조회)은 지연이 크고 서버 부하도 높음. Realtime PostgreSQL 변경감지(INSERT/UPDATE/DELETE)로 <100ms 지연 달성 가능.
- **구독 구조**: 
  ```
  supabase.from('rooms').on('*', payload => updateRoomCard(payload)).subscribe()
  supabase.from('room_participants').on('*', payload => updateAvatarDots(payload)).subscribe()
  ```
- **갱신 조건**: 
  - `rooms` 테이블: `current_participants`, `status`, `background_url` 변경 시
  - `room_participants` 테이블: INSERT (입장), DELETE (퇴장) 시
- **초기 로드**: useQuery로 첫 목록 조회 후, 이후 Realtime 변경만 반영 (불필요한 재조회 제외)

### 빈 방 처리

| 상황 | 표시 규칙 |
|------|---------|
| `current_participants = 0` | 점유율: "0/8" 표시, 아바타 도트: 미표시 (또는 회색 placeholder 1개) |
| `status = 'waiting'` (시작 전) | 상태 인디케이터: ○ (회색), 씬명: "Waiting..." 또는 호스트 설정값 |
| `max_participants = 0` (설정 오류) | UI: 경고 배지 "⚠️ Invalid" (Supabase 제약 조건으로 방지 권장) |

### MUST NOT

- ❌ **RoomCard 전체 재렌더 폴링** — Supabase Realtime 미사용으로 불필요한 리플로우 발생. 초 단위 폴링 금지.
- ❌ **현재 씬명 조회 without JOIN** — background_url 파싱만으로는 씬명 불명확. scenes 테이블 조인 또는 매핑 필수. (현재 정책 정해질 때까지 placeholder 사용)
- ❌ **아바타 도트 무한 렌더** — room_participants 스트림을 unsubscribe하지 않으면 메모리 누수. useEffect cleanup에서 반드시 subscription.unsubscribe() 호출.

---

## 관련 문서

- `../DATA-SCHEMA.md §1.2` — rooms 테이블 스키마
- `../DATA-SCHEMA.md §1.3` — room_participants 테이블
- `../FEATURE-SPEC.md` — LOB-01, LOB-03, LOB-04, LOB-05 기능 명세
- `./CalibrationWizard.md` — 페이셜 게이트 자세한 구현 (8동작 검증)
- `./GreenRoom.md` — 입장 후 미리보기 (아바타, 소리, 배경)

---

## 한줄정리

snack-web의 LobbyPage는 방 목록 조회, 방 생성(VOD/AI영상생성 모드), 페이셜 게이트(8동작 검증), 초대링크 수락을 총괄하며, 모든 입장 전에 trackingStore.is_face_valid 검증을 거쳐 GreenRoom으로 리다이렉트한다.
