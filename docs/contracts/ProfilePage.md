---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·StandardLoadingErrorProps·타입 정의 -->
<!-- 스택: Supabase users 테이블, R2 (프로필 사진 업로드), Zustand userStore -->

# 33. ProfilePage

`/profile` 라우트. 로그인 사용자 본인의 닉네임·자기소개·프로필 사진을 편집한다 (PROFILE-01).
프로필 공개 범위(PROFILE-02)와 알림 센터(PROFILE-03)는 이 페이지 또는 SettingsPage Tab 8 중 한 곳에서 접근 가능.

## Props Interface

```typescript
interface ProfilePageProps {
  /** 없음 — 현재 로그인 사용자를 userStore에서 자동 읽음 */
}
```

## Store 의존성

### `userStore` 필드

| 필드 | 타입 | 읽기 | 쓰기 | 용도 |
|---|---|---|---|---|
| `id` | UUID | ✓ | | Supabase UPDATE WHERE |
| `display_name` | string | ✓ | ✓ | 닉네임 편집 |
| `bio` | string \| null | ✓ | ✓ | 자기소개 편집 |
| `avatar_url` | string \| null | ✓ | ✓ | 프로필 사진 URL |
| `profile_visibility` | 'public' \| 'connected' \| 'private' | ✓ | ✓ | 공개 범위 (PROFILE-02) |
| `notification_prefs` | NotificationPrefs | ✓ | ✓ | 알림 설정 (PROFILE-03, SET-14 공유) |

```typescript
interface NotificationPrefs {
  room_invite: boolean;
  room_scheduled: boolean;
  room_full: boolean;
  credit_low: boolean;
}
```

## DataChannel 의존성

없음. ProfilePage는 룸 밖 계정 화면이며 Supabase users 업데이트와 R2 프로필 이미지 업로드만 수행한다.

## 레이아웃

```
/profile
┌─────────────────────────────────────────┐
│ ← 뒤로  |  프로필 편집                   │  ← 헤더
├─────────────────────────────────────────┤
│                                         │
│        ┌──────────┐                     │
│        │  [사진]  │  [사진 변경]         │  ← 프로필 사진 (PROFILE-01)
│        └──────────┘                     │
│                                         │
│  닉네임  [──────────────────────────]   │  ← display_name (최대 20자)
│  자기소개 [──────────────────────────]  │  ← bio (최대 120자)
│           [──────────────────────────]  │
│           [──────────────────────────]  │
│                                         │
│  프로필 공개 범위 (PROFILE-02)           │
│  ( ) 전체 공개                           │
│  ( ) 연결된 사용자만                     │
│  ( ) 비공개                              │
│                                         │
├─────────────────────────────────────────┤
│  알림 설정 (PROFILE-03)                  │
│  [✓] 방 초대 알림                        │
│  [✓] 예약 방 리마인더                    │
│  [ ] 대기 방 자리 생겼을 때              │
│  [✓] 크레딧 잔량 부족 경고              │
├─────────────────────────────────────────┤
│          [취소]  [저장]                  │
└─────────────────────────────────────────┘
```

## 컴포넌트 구조

```
[ProfilePage]
  ├─ useEffect: mount 시
  │  └─ fetchProfile() → Supabase SELECT users WHERE id = auth.user.id
  │
  ├─ [ProfileAvatarSection] (PROFILE-01)
  │  ├─ <img src={avatar_url || defaultAvatar} />
  │  └─ [Button: 사진 변경]
  │     └─ onClick → <input type="file" accept="image/*"> → handleAvatarUpload()
  │        ├─ 파일 검증: max 5MB, image/jpeg|png|webp
  │        ├─ R2 업로드: PUT /avatars/{user_id}/{timestamp}.{ext}
  │        │  (서버측 presigned URL via Supabase Edge Function)
  │        ├─ Supabase UPDATE users SET avatar_url = r2Url
  │        └─ userStore.setAvatarUrl(r2Url) → 즉시 미리보기
  │
  ├─ [ProfileNameInput] (PROFILE-01)
  │  ├─ value: userStore.display_name
  │  ├─ maxLength: 20
  │  ├─ validation: 최소 1자, 앞뒤 공백 trim
  │  └─ onChange → setLocalName(v)
  │
  ├─ [ProfileBioTextarea] (PROFILE-01)
  │  ├─ value: userStore.bio
  │  ├─ maxLength: 120
  │  ├─ rows: 3
  │  └─ onChange → setLocalBio(v)
  │
  ├─ [ProfileVisibilitySelector] (PROFILE-02)
  │  ├─ Radio: public | connected | private
  │  └─ onChange → setLocalVisibility(v)
  │
  ├─ [ActivitySummarySection] (G-267, 기존 G-79 해소)
  │  ├─ 섹션 제목: "🎬 활동 요약 (G-267, 기존 G-79 해소)"
  │  ├─ 데이터 소스:
  │  │  ├─ 공연 주최 횟수: COUNT(rooms WHERE host_id = current_user_id AND status = 'ended')
  │  │  ├─ 공연 참가 횟수: COUNT(room_participants WHERE user_id = current_user_id)
  │  │  ├─ 생성 영상 수: COUNT(vgen_exports WHERE creator_user_id = current_user_id)
  │  │  └─ 총 시청 시간: SUM(room_participants.duration_seconds) / 3600 (시간)
  │  └─ 시각화: 4개 카드 박스 또는 요약 통계 표시
  │     ├─ [🎙️ 주최: N회]
  │     ├─ [🎭 참가: N회]
  │     ├─ [🎬 생성 영상: N개]
  │     └─ [⏱️ 총 시청: Nh Nm]
  │
  ├─ [NotificationPrefsSection] (PROFILE-03 / SET-14)
  │  ├─ [Toggle: room_invite]
  │  ├─ [Toggle: room_scheduled]
  │  ├─ [Toggle: room_full]
  │  └─ [Toggle: credit_low]
  │     → onChange → setLocalNotifPrefs(prev => ({ ...prev, [key]: v }))
  │
  └─ [Footer]
     ├─ [Button: 취소] → navigate(-1) 또는 resetToSaved()
     └─ [Button: 저장] (enabled: isDirty)
        └─ onClick → handleSave()
           ├─ Supabase UPDATE users SET display_name, bio, profile_visibility, notification_prefs
           ├─ userStore.patch({ display_name, bio, ... })
           ├─ toast("프로필이 저장되었습니다")
           └─ isDirty = false
```

## Supabase 접근

```sql
-- 프로필 조회
SELECT id, display_name, bio, avatar_url, profile_visibility, notification_prefs
FROM users
WHERE id = auth.uid();

-- 프로필 저장 (트랜잭션 불필요 — 단일 행)
UPDATE users
SET
  display_name      = $1,
  bio               = $2,
  profile_visibility = $3,        -- 'public' | 'connected' | 'private'
  notification_prefs = $4::jsonb,
  updated_at        = now()
WHERE id = auth.uid();

-- DATA-SCHEMA 추가 필요:
-- users.profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public','connected','private'))
-- users.notification_prefs JSONB DEFAULT '{"room_invite":true,"room_scheduled":true,"room_full":false,"credit_low":true}'
-- users.bio TEXT (최대 120자 CHECK 또는 앱 레벨 제한)
```

### 프로필 사진 업로드 (R2)

```typescript
// Step 1: Supabase Edge Function에서 presigned URL 발급
const { data: { uploadUrl, r2Key } } = await supabase.functions.invoke('get-avatar-upload-url', {
  body: { content_type: file.type, ext: file.name.split('.').pop() }
})

// Step 2: 클라이언트에서 R2에 직접 PUT
await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })

// Step 3: DB 업데이트
const publicUrl = `${R2_PUBLIC_BASE}/avatars/${userId}/${r2Key}`
await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', userId)
```

**MUST NOT**: 클라이언트에서 R2 Access Key 직접 사용 금지 — Edge Function presigned URL 경유만 허용.

## 입력 검증

| 필드 | 규칙 |
|---|---|
| `display_name` | 1~20자, trim 후 빈 값 금지, SQL injection은 Supabase parameterized query로 방어 |
| `bio` | 0~120자, null 허용 |
| `avatar_url` | max 5MB, MIME: image/jpeg·png·webp, 서버측 MIME 재검증 (Edge Function) |
| `profile_visibility` | 'public' \| 'connected' \| 'private' 외 거부 |

## 금지 사항 (MUST NOT)

- ❌ **다른 사용자 프로필 편집** — WHERE id = auth.uid() 강제 (RLS)
- ❌ **클라이언트에서 R2 직접 업로드** — presigned URL via Edge Function만
- ❌ **avatar_url을 임의 외부 URL로 설정** — R2 도메인 접두사 검증 필수
- ❌ **display_name을 빈 문자열로 저장** — trim 후 최소 1자 검증
- ❌ **저장 없이 userStore 즉시 업데이트** — 저장 성공 후에만 store 반영 (낙관적 UI 제외)
- ❌ **알림 설정을 SettingsPage와 이중 저장** — `users.notification_prefs`가 SSOT, 두 UI는 같은 컬럼을 읽고 씀

## 검증 체크리스트

- [ ] Supabase RLS: SELECT/UPDATE WHERE id = auth.uid() 확인
- [ ] display_name 1~20자 trim 검증
- [ ] bio null 허용, 120자 초과 거부
- [ ] 사진 업로드: Edge Function presigned URL → R2 PUT → DB UPDATE 순서
- [ ] 파일 크기·MIME 클라이언트 + 서버 양측 검증
- [ ] 저장 실패 시 userStore 롤백
- [ ] `profile_visibility` RLS 반영 여부 확인 (public이면 다른 사용자가 프로필 SELECT 가능)
- [ ] `notification_prefs` SettingsPage Tab 8과 동일 컬럼 공유 확인
- [ ] DATA-SCHEMA: `profile_visibility`, `notification_prefs`, `bio` 컬럼 추가 여부

## 관련 문서

- `../DATA-SCHEMA.md §1.1` — users 테이블 (profile_visibility·notification_prefs·bio 컬럼 추가 필요)
- `./SettingsPage.md §탭 8` — 알림 설정 공유 UI (같은 `notification_prefs` SSOT)
- `./AuthPage.md` — 회원가입 시 display_name 초기 설정
- `../legal/PRIVACY-POLICY.md` — 프로필 공개 범위 법적 근거
- `../GAP-MATRIX.md` G-150·G-151·G-152·G-156
