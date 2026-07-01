---
tags: [fsm]
---

<!-- state-machines/_INDEX.md 참조: 추가 절차 -->

# 5. Authentication State Machine

## State Diagram

```
┌───────────────────┐
│ UNAUTHENTICATED   │ (no user session)
└────┬──────────┬───┘
     │          │
     │ [forgot pw click]
     │          ▼
     │ ┌──────────────────┐
     │ │ RESET_REQUEST    │ (email input for password reset)
     │ │  (30s cooldown)  │
     │ └────┬──────┬──────┘
     │      │      └─→ [back]→ UNAUTHENTICATED
     │      └─[email sent]→ RESET_REQUEST (toast: "메일 발송됨")
     │
     │ [login/register form submit]
     ▼
┌──────────────────┐
│ AUTHENTICATING   │ (API call pending)
└────┬─────────────┘
     │ success: token received
     ▼
┌──────────────────────────────┐
│ AUTHENTICATED or PENDING_     │ (if email not confirmed → PENDING_VERIFICATION)
│ VERIFICATION                 │
└────┬──────────────────────────┘
     │
     ├─→ PENDING_VERIFICATION (signup 경우, email not confirmed)
     │   ┌──────────────────────────────────────┐
     │   │ PENDING_VERIFICATION                 │
     │   │ (email verification waiting, 60s    │
     │   │  cooldown for resend)                │
     │   └────┬──────────┬──────────┬──────────┘
     │        │          │          └─→ [edit email]→ UNAUTHENTICATED
     │        │          └─→ [resend (60s)]→ PENDING_VERIFICATION
     │        └─[?type=signup clicked]→ AUTHENTICATED
     │
     └─→ AUTHENTICATED (if email already confirmed)
        └────┬──────────────────────────────────────────┐
             │ (transparent auto-refresh 5 min before)  │
             │ token valid for 1 hour                   │
             │                                          │
             └─── token approaching expiry ──→ (refresh)
                                               ▼
                                      ┌──────────────────┐
                                      │ REAUTHENTICATING │
                                      └────┬─────────────┘
                                           │ refresh success
                                           │
                                           └──────┬──────────────┐
                                                  │ token updated│
                                                  │              ▼
                                                  │      AUTHENTICATED
                                                  │      (new token)
                                                  │
URL ?type=recovery ──────────────────────────────┘
[page load with valid token]
     ▼
┌──────────────────────┐
│ RESET_NEW_PW         │ (new password input form)
│ (1h token valid)     │
└────┬──────┬──────────┘
     │      └─→ [invalid/expired token]→ RESET_REQUEST (error)
     └─[new password saved]→ AUTHENTICATED

     user clicks logout ───────────────────┬
     or auth token revoked (server-side)   │
     ▼                                       ▼
┌─────────────────────────────────────────────────┐
│       UNAUTHENTICATED                           │
│ (session cleared, user navigated to /login)     │
└──────────────────────────────────────────────────┘
```

## State Transitions

| From | To | Trigger | Source | Notes |
|------|-----|---------|--------|-------|
| UNAUTHENTICATED | AUTHENTICATING | User submits login form | `userStore.login(email, password)` | Zustand action |
| UNAUTHENTICATED | AUTHENTICATING | User clicks OAuth button | `userStore.oauthSignup(provider)` | Discord, Twitter, Google |
| UNAUTHENTICATED | RESET_REQUEST | User clicks "forgot password" | AuthPage ForgotPasswordForm mount | Navigate to forgot-pw route |
| AUTHENTICATING | AUTHENTICATED | Supabase auth success (email already confirmed) | `userStore.onAuthSuccess(token, user)` | Session stored; token valid 1h |
| AUTHENTICATING | PENDING_VERIFICATION | Supabase signup success (email not confirmed) | `userStore.onAuthSuccess()` with `user.email_confirmed_at === null` | User created; verification email sent |
| AUTHENTICATING | UNAUTHENTICATED | Login failed (wrong password) | `userStore.onAuthError()` | Show error toast; remain on login page |
| RESET_REQUEST | RESET_REQUEST | User submits email (30s cooldown active) | `resetPasswordForEmail(email)` | Toast: "이메일이 발송됐습니다"; no duplicate sends within 30s |
| RESET_REQUEST | UNAUTHENTICATED | User clicks "Back" / navigates away | Navigation click | Return to login page |
| RESET_REQUEST | RESET_NEW_PW | Email link clicked (?type=recovery in URL) | Browser opens recovery link from email | User session auto-populated from URL fragment (Supabase SDK) |
| PENDING_VERIFICATION | AUTHENTICATED | Email verification link clicked (?type=signup) | Link in verification email | User email_confirmed_at populated; auto-login |
| PENDING_VERIFICATION | PENDING_VERIFICATION | User clicks "Resend" (60s cooldown) | `supabase.auth.resend({type: 'signup'})` | Resend verification email; cooldown resets to 60s |
| PENDING_VERIFICATION | UNAUTHENTICATED | User clicks "Change Email" | AuthPage navigate to /register | Allow email re-entry and new signup |
| RESET_NEW_PW | AUTHENTICATED | User submits new password | `supabase.auth.updateUser({password})` | Password updated; session valid; redirect to /lobby |
| RESET_NEW_PW | RESET_REQUEST | Token expired or invalid | Supabase error (401/403) | Show error; direct user back to forgot-pw form |
| AUTHENTICATED | REAUTHENTICATING | Token refresh timer fires (5 min before expiry) | `useEffect` in hook | Called automatically, no user interaction |
| REAUTHENTICATING | AUTHENTICATED | Refresh token success | Supabase refresh endpoint | New token stored; next refresh in 55 min |
| REAUTHENTICATING | UNAUTHENTICATED | Refresh fails (token truly expired) | Supabase error | User logged out; redirect to /login |
| AUTHENTICATED | UNAUTHENTICATED | User clicks "Log Out" | `userStore.logout()` | Clear session; cleanup stores |
| AUTHENTICATED | UNAUTHENTICATED | Supabase revokes session (server-side) | Auth listener | Auto-logout; show "Session expired" toast |

## Edge Cases

1. **Token Approaching Expiry During Room**
   - Refresh triggered silently 5 min before expiry (no UI interruption)
   - If refresh succeeds: new token stored, user continues normally
   - If refresh fails (network down): user stays connected until next activity that requires token (e.g., upload, fetch)
   - Then shown "Re-authenticate" dialog (not kicked immediately)

2. **Simultaneous Requests After Token Refresh**
   - Multiple API calls in-flight when refresh completes
   - Old requests use old token (may be rejected with 401)
   - Zustand `userStore.token` updated atomically; new requests use new token
   - Failed requests with 401 trigger auto-retry with new token (fetch wrapper logic)

3. **OAuth Account Already Linked**
   - User tries OAuth with email already in DB but different provider
   - Supabase returns "account already exists" error
   - Show "Sign in to existing account first, then link provider" message

4. **Mobile Background Timeout**
   - User switches away from app for 1+ hours
   - On return: if token expired, show re-login dialog
   - Preserve navigation state: after re-auth, jump back to previous room/page (if valid)

5. **Guest Viewer Mode** (optional future feature)
   - User can watch room without authenticating (anonymous session)
   - State remains UNAUTHENTICATED; still in "viewer" role
   - No token refresh needed (Supabase anonymous auth handles separately)

6. **Password Reset Token Expiry** (G-54)
   - Recovery link valid for 1 hour (Supabase default)
   - User clicks recovery link after 1 hour → invalid token error
   - Show "Link expired; restart password reset" + redirect to RESET_REQUEST
   - User re-requests reset email from RESET_REQUEST state

7. **Email Verification Link Expiry** (G-55)
   - Verification email link valid for 7 days (Supabase default)
   - User remains in PENDING_VERIFICATION if link expires
   - Resend button always available (no re-entry to REGISTER needed)
   - Each resend extends validity window another 7 days

8. **Password Reset Duplicate Prevention** (G-54)
   - 30-second cooldown on RESET_REQUEST state prevents rapid resends
   - User sees "요청을 다시 보내실 수 있습니다" + countdown timer
   - Timer resets to 30s on each successful send
   - Prevents email server overload + enumeration attacks

9. **Email Verification Resend Cooldown** (G-55)
   - 60-second initial cooldown on PENDING_VERIFICATION state
   - Cooldown resets to 60s after each resend (infinite)
   - Prevents delivery loop + mail system abuse
   - User sees "다시 보내기" button disabled with countdown

10. **Non-existent Email in Password Reset** (G-54, security)
    - User enters non-existent email in RESET_REQUEST
    - Supabase still returns success (no error message)
    - Shows generic "메일이 발송됐습니다" to prevent user enumeration
    - Prevents attackers from determining valid user emails

11. **Token Refresh 중 room-authority 메시지 검증 (P2, HostAuthority 연동)**
    - 상황: REAUTHENTICATING 중 새 토큰 갱신 완료 전, 다른 클라이언트의 room-authority 메시지가 도착, 또는 동시에 host transfer 발생
    - 문제: 이전 토큰 기반 메시지인지 새 토큰 기반인지, host transfer로 인해 seq가 리셋되었는지 구분 필요
      ```
      예시: 이전 호스트 토큰 기반 메시지 (epoch=42, seq=900) vs 신규 host transfer 후 새 토큰 (epoch=43, seq=1)
      ```
    - **핵심 규칙**: room-authority 메시지 판정은 **토큰 갱신 여부와 무관하게 (epoch, seq) 사전식(lexicographic) 비교만 사용**. host transfer로 인한 seq 리셋과 토큰 갱신 타이밍이 겹쳐도 안전함.
      ```
      1. LiveKit token identity의 host_id와 (authority_epoch, seq) 조합으로만 메시지 순서 판정
      2. 토큰 자체의 신선도(exp)는 room-authority 메시지 검증에서 무시
      3. authority_epoch 기반 순서 보장(HostAuthority.md §Message 순서 판정 참조)으로 충분 → (43, 1) > (42, 900)
      4. 토큰 갱신 중 이전 토큰 기반 메시지는 (authority_epoch, seq)가 낮으면 자동 무시됨
      ```
    - 구현:
      ```typescript
      // room-authority 메시지 수신 시 — 토큰 갱신 상태와 무관하게 동일 로직
      if (msg.authority_epoch > currentEpoch || 
          (msg.authority_epoch === currentEpoch && msg.seq > currentSeq)) {
        applyMessage(msg);  // 최신 메시지만 적용
      }
      // 토큰 exp 검증은 별도의 API 호출 시점(upload 등)에서만 수행
      // REAUTHENTICATING 진행 중이어도 위 판정 로직은 불변
      ```
    - **동시성 보장**: REAUTHENTICATING 완료 후 새 토큰이 저장되지만, 이미 수신한 메시지들은 (authority_epoch, seq)로 순서가 보장되므로, host transfer 및 토큰 갱신이 교차해도 메시지 일관성 유지

11. **Page Refresh in RESET_NEW_PW or PENDING_VERIFICATION**
    - RESET_NEW_PW: URL still contains ?type=recovery fragment + token
    - Page refresh retrieves session from URL fragment (Supabase onAuthStateChange)
    - State remains RESET_NEW_PW; form continues normally
    - PENDING_VERIFICATION: on refresh, check `user.email_confirmed_at`
    - If confirmed: auto-transition to AUTHENTICATED; if not: stay in PENDING_VERIFICATION

## Implementation Hints

- **Zustand store**: `userStore` (session, token, user_id, token_expiry_ms, auth_state)
- **Event sources**:
  - Supabase Auth SDK: `onAuthStateChange` listener
  - Supabase Edge function: `POST /functions/v1/refresh-livekit-token` (refresh token independently)
  - `useEffect` timer: `setTimeout(() => refreshToken(), token_expiry - 5min)`
- **Side effects**:
  - AUTHENTICATED: fetch user profile + load user's avatars from Supabase Storage
  - REAUTHENTICATING: trigger token refresh; show spinner only if UI activity (network request) requires it
  - UNAUTHENTICATED: clear all stores (userStore, roomStore, stageStore); redirect to /login
  - PENDING_VERIFICATION: fetch email_confirmed_at on mount; poll `getSession()` every 10s or wait for email link click
  - RESET_REQUEST: initialize 30s cooldown timer; disable resend button until timer expires
  - RESET_NEW_PW: display password strength indicator (약/중/강); enforce minimum 8 characters
  - Auto-retry on 401: wrap API calls with retry logic that checks `userStore.token_expiry`
- **Supabase Auth Integration**:
  ```typescript
  // Login
  const { data, error } = await supabase.auth.signInWithPassword({
    email, password
  });
  
  // Signup (may enter PENDING_VERIFICATION if email unconfirmed)
  const { data, error } = await supabase.auth.signUp({
    email, password
  });
  
  // OAuth
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord' | 'google' | 'twitter'
  });
  
  // Password Reset (G-54)
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${import.meta.env.VITE_SITE_URL}/auth?type=recovery`
  });
  
  // Update Password (in RESET_NEW_PW state)
  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });
  
  // Resend Verification Email (G-55)
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: userEmail
  });
  
  // Refresh token
  const { data, error } = await supabase.auth.refreshSession();
  
  // Check session after page load or email link click
  const { data: { session }, error } = await supabase.auth.getSession();
  ```

- **G-54 Password Reset Flow** (Supabase recovery type):
  - RESET_REQUEST: call `resetPasswordForEmail(email)` → user receives email with recovery link
  - Recovery link format: `https://yoursite.com/auth?type=recovery#{access_token}&type=recovery`
  - RESET_NEW_PW: Supabase SDK auto-populates session from URL fragment on page mount
  - Update password via `updateUser({password: newPassword})`
  - Token validity: 1 hour (Supabase default)

- **G-55 Email Verification Flow**:
  - After signup: `signUp({email, password})` → Supabase sends verification email if `Confirm email` enabled
  - PENDING_VERIFICATION: check `user.email_confirmed_at === null` on login success
  - Verification link format: `https://yoursite.com/auth?type=signup#{access_token}&type=signup`
  - Clicking link auto-logs user in (Supabase SDK retrieves session from fragment)
  - Resend via `resend({type: 'signup', email})` → 60s cooldown between resends
  - Token validity: 7 days (Supabase default)
