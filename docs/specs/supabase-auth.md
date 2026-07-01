---
tags: [spec]
---

<!--
  Haiku 공식문서 조사 완료
  Updated: 2026-06-29 · GAP-MATRIX G-02, G-13
  Sources: supabase.com/docs
-->

# Supabase Auth + models 테이블 스펙

---

## 1. Auth 패키지

> **주의**: `@supabase/auth-ui-react`는 2025-10-23 아카이브(유지보수 종료).
> ChatterBox는 **직접 구현** 또는 shadcn/ui Form + `@supabase/supabase-js` 조합 사용.

```bash
npm install @supabase/supabase-js
# auth-ui-react는 사용 안 함 — 유지보수 종료
```

---

## 2. 이메일 + Google OAuth 로그인 구현

```typescript
// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// 이메일 로그인
export const signInWithEmail = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });

// 이메일 회원가입
export const signUpWithEmail = (email: string, password: string) =>
  supabase.auth.signUp({ email, password });

// Google OAuth
export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });

// 로그아웃
export const signOut = () => supabase.auth.signOut();
```

---

## 3. 세션 관리 (onAuthStateChange)

```typescript
// src/stores/userStore.ts (Zustand)
import { supabase } from "@/lib/supabase";

supabase.auth.onAuthStateChange((event, session) => {
  // INITIAL_SESSION · SIGNED_IN · SIGNED_OUT · TOKEN_REFRESHED
  useUserStore.setState({ session, user: session?.user ?? null });
});
```

---

## 4. Protected Route (react-router 8)

```typescript
// src/app/routes.tsx
import { Navigate, Outlet } from "react-router";
import { useUserStore } from "@/stores/userStore";

export function ProtectedRoute() {
  const user = useUserStore((s) => s.user);
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
```

---

## 5. Google OAuth 설정 단계

1. Google Cloud Console → OAuth 클라이언트 생성 (웹 애플리케이션)
2. Authorized redirect URIs: `https://owfcrolbvikkqrotmleq.supabase.co/auth/v1/callback`
3. Supabase 대시보드 → Authentication → Providers → Google → Client ID/Secret 입력
4. Site URL: `https://chatterbox.vercel.app` (prod), `http://localhost:5173` (dev)

---

## 6. models 테이블 스키마

```sql
-- models 테이블
CREATE TABLE models (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  preview_url   TEXT,        -- Storage 공개 URL (썸네일)
  rig_json_url  TEXT,        -- Storage URL (rig.json)
  parts_prefix  TEXT,        -- Storage 경로 prefix (parts/ 폴더)
  is_public     BOOLEAN DEFAULT false, -- true = 시스템 샘플
  model_type    TEXT DEFAULT 'user',   -- 'system' | 'user'
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_models_user_id  ON models(user_id);
CREATE INDEX idx_models_is_public ON models(is_public);
```

---

## 7. Storage Bucket + RLS

**Bucket**: `models` (Private)

**폴더 구조:**
```
models/
  system/{model_id}/preview.png, rig.json, parts/...
  {user_id}/{model_id}/preview.png, rig.json, parts/...
```

**RLS 정책:**
```sql
-- models 테이블
CREATE POLICY "view_models" ON models FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "insert_model" ON models FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_public = false);

CREATE POLICY "update_model" ON models FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "delete_model" ON models FOR DELETE
  USING (auth.uid() = user_id);

-- Storage objects
CREATE POLICY "view_system_models" ON storage.objects FOR SELECT
  USING (bucket_id = 'models' AND (storage.foldername(name))[1] = 'system');

CREATE POLICY "view_own_models" ON storage.objects FOR SELECT
  USING (bucket_id = 'models' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "upload_own_models" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'models' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "delete_own_models" ON storage.objects FOR DELETE
  USING (bucket_id = 'models' AND (storage.foldername(name))[1] = auth.uid()::text);
```

---

---

## 8. 이메일 인증 설정 (G-55)

> Supabase 대시보드 → Authentication → Providers → Email

**기본 설정 (필수):**
- Enable email confirmations: `ON`
- Email confirmation link validity: `7 days` (기본값)
- Redirect URL for email confirmations: `https://yoursite.com/auth?type=signup`

**이메일 템플릿:**
- Supabase는 기본 템플릿 제공
- 커스터마이징: Supabase 대시보드 → Email Templates → Confirm signup
- 동적 변수: `{{ .ConfirmationURL }}`(확인 링크), `{{ .TokenHash }}` 등

**가입 흐름:**
```typescript
// 회원가입 시 자동으로 확인 이메일 발송
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password'
});

// data.user.email_confirmed_at === null (미인증 상태)
// 사용자가 이메일 링크 클릭 시 자동으로 confirmed 상태 변환
```

---

## 9. 비밀번호 재설정 설정 (G-54)

> Supabase 대시보드 → Authentication → Providers → Email

**기본 설정:**
- Recovery link validity: `1 hour` (기본값, Supabase 최대 1시간)
- Redirect URL for password recovery: `https://yoursite.com/auth?type=recovery`

**비밀번호 재설정 플로우:**
```typescript
// 1. 비밀번호 재설정 요청
const { error } = await supabase.auth.resetPasswordForEmail(
  'user@example.com',
  {
    redirectTo: `${import.meta.env.VITE_SITE_URL}/auth?type=recovery`
  }
);

// 2. 사용자가 이메일 링크 클릭 → /auth?type=recovery#{access_token}...
// 3. Supabase SDK onAuthStateChange에서 자동으로 세션 복원
// 4. auth_state = 'RESET_NEW_PW'로 전이
// 5. 새 비밀번호 설정
const { error: pwError } = await supabase.auth.updateUser({
  password: 'newPassword'
});
```

**이메일 템플릿:**
- 기본 템플릿 사용 또는 커스터마이징
- 동적 변수: `{{ .PasswordRecoveryLink }}` (재설정 링크)

---

## 10. Site URL 및 Redirect URL 설정

> Supabase 대시보드 → Authentication → URL Configuration

**프로덕션:**
```
Site URL: https://yoursite.vercel.app
Allowed Redirect URLs:
  - https://yoursite.vercel.app/auth/callback (OAuth)
  - https://yoursite.vercel.app/auth?type=signup (이메일 확인)
  - https://yoursite.vercel.app/auth?type=recovery (비밀번호 재설정)
```

**개발 (localhost):**
```
Site URL: http://localhost:5173
Allowed Redirect URLs:
  - http://localhost:5173/auth/callback (OAuth)
  - http://localhost:5173/auth?type=signup (이메일 확인)
  - http://localhost:5173/auth?type=recovery (비밀번호 재설정)
```

**주의:**
- Redirect URL은 정확히 일치해야 함 (경로, 프로토콜 포함)
- OAuth 콜백과 이메일 링크는 다른 redirectTo 경로 사용 가능

---

## 참고

- [Supabase Auth with React](https://supabase.com/docs/guides/auth/quickstarts/react)
- [Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Email Auth](https://supabase.com/docs/guides/auth/auth-email)
- [Password Recovery](https://supabase.com/docs/guides/auth/auth-email#password-recovery)
- [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
