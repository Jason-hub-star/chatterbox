---
tags: [contract]
---

<!-- contracts/_INDEX.md 참조: 공유 절차·타입 정의 -->
<!-- 상태머신: state-machines/Auth.md, 데이터 스키마: DATA-SCHEMA.md §1.1, 스펙: supabase-auth.md -->

# 1. AuthPage

로그인/회원가입 페이지 orchestrator. 이메일·OAuth(Google·Kakao) 인증 플로우, 세션 토큰 관리, 로그인 실패 처리, 페이지 리다이렉트 담당.

> **2026-07-08 구현 현황**: ① 인앱 랜딩 폐지 — `/` 는 `HomeRedirect`(ready 게이트 후 세션 있으면 `/lobby`, 없으면 `/login`), 마케팅 랜딩은 외부 snack-web. ② Login/Register/Reset 은 **LoL식 `AuthShell`**(좌 400px 패널 + 우 스플래시 **별도 컬럼** — 겹침 배치는 16:9 에서 인물이 패널에 가려 폐기) 공유. ③ **소셜 우선 패턴**(`OAuthButtons`: 카카오 주버튼→Google→"또는"→이메일 보조 — 이메일은 폐기하지 않음: 자동화 검증·복구 경로). ④ OAuth 연결 타이밍 결정: 외부 초대 시작 2~3주 전(카카오 이메일 필수동의=비즈앱 검수 리드타임·도메인 확정 선행), 그때까지 `VITE_OAUTH_PROVIDERS` 미설정으로 버튼 숨김.

## Props Interface

```typescript
interface LoginPageProps {
  /**
   * 로그인 성공 후 리다이렉트할 경로
   * 기본값: '/lobby'
   * (선택) 이전 location.state.from 있으면 그곳으로
   */
  redirectPath?: string;

  /**
   * 로그인 폼 제출 콜백 (에러 처리용, 선택)
   */
  onError?: (error: Error) => void;
}

interface RegisterPageProps {
  /**
   * 회원가입 성공 후 리다이렉트할 경로
   * 기본값: '/models' (아바타 선택)
   */
  redirectPath?: string;

  /**
   * 회원가입 폼 제출 콜백 (에러 처리용, 선택)
   */
  onError?: (error: Error) => void;
}

interface ForgotPasswordFormProps {
  /**
   * 뒤로가기 클릭 시 콜백 (LOGIN 상태로 복귀)
   */
  onBack: () => void;

  /**
   * 비밀번호 재설정 요청 결과 콜백 (선택)
   */
  onSubmit?: (email: string) => void;
}

interface ResetPasswordFormProps {
  /**
   * URL ?type=recovery 파라미터에서 자동 추출됨
   * 명시적 props 없음 (Supabase SDK가 session 관리)
   */
  redirectPath?: string;

  /**
   * 재설정 실패 시 콜백 (선택, 토큰 만료 등)
   */
  onError?: (error: Error) => void;
}

interface EmailVerificationPendingProps {
  /**
   * 마스킹할 이메일 주소
   * 예: "gmdq***@gmail.com"
   */
  email: string;

  /**
   * 이메일 변경 링크 클릭 시 콜백
   * 사용자가 /register로 돌아가서 새 이메일로 가입
   */
  onChangeEmail?: () => void;
}
```

## Store 의존성

| Store | 필드 | 읽기 | 쓰기 | 설명 |
|-------|-----|-----|------|------|
| `userStore` | `session` | ✓ | ✓ | Supabase Auth session (JWT token + expiry) |
| `userStore` | `user` | ✓ | ✓ | 로그인 사용자 정보 (id, email, user_metadata) |
| `userStore` | `authState` | ✓ | ✓ | 'UNAUTHENTICATED'\|'AUTHENTICATING'\|'AUTHENTICATED' |
| `userStore` | `login(email, password)` | | ✓ | 이메일 로그인 (비동기) |
| `userStore` | `signUpWithEmail(email, password)` | | ✓ | 이메일 회원가입 (비동기) |
| `userStore` | `loginWithOAuth(provider: 'google'\|'kakao')` | | ✓ | 간편인증 OAuth 로그인 (비동기, 소셜 우선) |
| `userStore` | `logout()` | | ✓ | 로그아웃 (세션 종료) |
| `userStore` | `error` | ✓ | ✓ | 인증 에러 메시지 (optional) |

**쓰기:** AuthPage만 userStore의 인증 상태를 변경. 다른 컴포넌트는 읽기만.

## 인증 흐름

### 로그인 흐름 (LoginPage)

```
1. 사용자 이메일·비밀번호 입력 → 폼 제출
2. userStore.login(email, password) 호출
3. Supabase Auth API: signInWithPassword()
4. 성공 시:
   - userStore.session 갱신 (JWT token + expiry)
   - userStore.user 갱신 (user ID, email, metadata)
   - userStore.auth_state = 'AUTHENTICATED'
   - useNavigate().push(redirectPath || '/lobby')
5. 실패 시:
   - userStore.auth_state = 'UNAUTHENTICATED'
   - userStore.error = error message
   - UI에 Toast/Alert로 표시
```

### 회원가입 흐름 (RegisterPage)

```
1. 사용자 이메일·비밀번호 입력 (확인 포함) → 폼 제출
2. 검증:
   - 이메일 형식 (RFC 5322)
   - 비밀번호 강도 (최소 8자, 대문자 1개, 숫자 1개)
   - 두 비밀번호 일치 확인
   - 연령 확인은 회원가입 폼이 아니라 공통 `AgeGate`에서 처리
3. userStore.signUpWithEmail(email, password) 호출
4. Supabase Auth API: signUp() + users row 생성
5. 성공 시:
   - userStore.session 갱신
   - userStore.user 갱신
   - userStore.auth_state = 'AUTHENTICATED'
   - users.age_band이 없으면 `/onboarding/age?redirect=/models`로 이동
   - age gate 완료 후 useNavigate().push(redirectPath || '/models')
6. 실패 시:
   - 이미 존재 계정 → "이미 가입된 이메일입니다" 메시지
   - 기타 에러 → userStore.error 설정 + UI 표시
```

### OAuth 흐름 (Google·Kakao — `OAuthButtons`, 로그인·가입 공용)

```
1. 사용자 "카카오로 계속하기" / "Google로 계속하기" 클릭 (VITE_OAUTH_PROVIDERS 로 노출 게이트)
2. userStore.loginWithOAuth(provider) 호출
3. Supabase Auth API: signInWithOAuth({ provider, options: { redirectTo: origin + '/lobby' } })
4. 프로바이더 인증 후 앱으로 복귀(전체 페이지 로드) → 전용 /auth/callback 페이지 없음:
   - supabase-js detectSessionInUrl 이 URL 토큰을 자동 파싱해 세션 확립
   - userStore.init() 의 getSession/onAuthStateChange 가 세션 흡수 → AUTHENTICATED
   - /lobby 는 ProtectedRoute — ready 게이트가 파싱 완료까지 리다이렉트 판단을 보류
5. 실패 시: loginWithOAuth 가 false 반환 + userStore.error 설정(시작 실패 안내)
6. ⚠️ 카카오는 이메일 동의항목을 "필수"로(비즈앱 검수 필요) — 아니면 이메일 가입 계정과
   자동 연결이 안 돼 동일인 계정 분열. Google 은 검수 불요.
```

### 비밀번호 재설정 흐름 (G-54 ForgotPasswordForm → ResetPasswordForm)

```
RESET_REQUEST 상태 (ForgotPasswordForm):
1. 사용자 LoginPage에서 "비밀번호를 잊으셨나요?" 클릭
2. ForgotPasswordForm 마운트 (RESET_REQUEST 상태로 전이)
3. 사용자 이메일 입력 → "이메일로 재설정 링크 전송" 버튼 클릭
4. supabase.auth.resetPasswordForEmail(email, {
     redirectTo: `${VITE_SITE_URL}/auth?type=recovery`
   })
5. 성공 시:
   - Toast: "비밀번호 재설정 링크가 발송되었습니다"
   - 버튼 비활성화 + 30초 카운트다운 시작 (cooldown)
   - 사용자 이메일 클라이언트 열기 권유 (선택)
6. 실패 시:
   - 존재하지 않는 이메일 → 여전히 성공 메시지 표시 (enumeration 방지)
   - 기타 에러 → userStore.error 설정 + 에러 토스트

RESET_NEW_PW 상태 (ResetPasswordForm):
1. 사용자 이메일 받은 링크 클릭 → /auth?type=recovery#access_token...
2. Supabase SDK onAuthStateChange 감지 → auth_state = 'RESET_NEW_PW'
3. ResetPasswordForm 마운트
   - URL fragment에서 session 자동 추출 (Supabase 처리)
   - 사용자 인증 상태 미리 설정 (로그인 필요 X)
4. 사용자 새 비밀번호 입력
   - 최소 8자 강제
   - 강도 표시기 (약/중/강)
   - 비밀번호 확인 필드와 일치 검증
5. "비밀번호 재설정" 버튼 클릭
6. supabase.auth.updateUser({ password: newPassword })
7. 성공 시:
   - session.user.updated_at 갱신
   - 기존 로그인 유지 (즉시 인증됨)
   - Toast: "비밀번호가 변경되었습니다"
   - 5초 후 자동으로 /lobby로 리다이렉트
8. 실패 시 (token 만료 등):
   - Error toast: "링크가 만료되었습니다. 다시 시도해주세요"
   - RESET_REQUEST로 복귀 (다시 요청 가능)
```

### 이메일 인증 흐름 (G-55 EmailVerificationPending)

```
PENDING_VERIFICATION 상태 (EmailVerificationPending):
1. 사용자 회원가입 성공
   - userStore.signUpWithEmail(email, password) → 성공
   - user.email_confirmed_at === null (미인증)
   - auth_state = 'PENDING_VERIFICATION'
2. EmailVerificationPending 마운트
   - 이메일 마스킹 표시 ("gmdq***@gmail.com")
   - 60초 카운트다운 시작 ("다시 보내기" 버튼 비활성화)
   - 선택: "메일 클라이언트 열기" 버튼 (mailto: 링크)
3. 사용자 이메일 인증 링크 클릭
   - /auth?type=signup#access_token...
   - Supabase onAuthStateChange 감지
   - user.email_confirmed_at 채워짐
   - 자동으로 AUTHENTICATED 상태로 전이
   - 5초 후 /lobby로 리다이렉트
4. 또는 "다시 보내기" 클릭 (60초 경과 후)
   - supabase.auth.resend({type: 'signup', email})
   - 새 검증 이메일 발송
   - 카운트다운 초기화 (60초 재시작)
   - Toast: "확인 메일을 다시 보냈습니다"
5. 또는 "이메일 변경" 클릭
   - /register로 네비게이션
   - 사용자가 새 이메일로 다시 가입 가능
   - 기존 미인증 계정은 나중에 정리 (Supabase 자동 또는 수동)

오류 처리:
- 이메일 링크 만료 (7일) → PENDING_VERIFICATION 유지, 재전송 버튼으로 해결
- 페이지 새로고침 중 인증 완료 → getSession() 자동 호출, user.email_confirmed_at 확인 → AUTHENTICATED로 전이
- 비활성 상태 (1시간+) → 링크 재전송하면 여전히 유효 (7일 이내)
```

## Supabase 접근

| 엔드포인트 | 작업 | 시점 | 컴포넌트 |
|---|---|---|---|
| `auth.signInWithPassword()` | 이메일 로그인 | 로그인 폼 제출 | LoginPage |
| `auth.signUp()` | 이메일 회원가입 | 회원가입 폼 제출 | RegisterPage |
| `auth.signInWithOAuth({provider: 'google'})` | Google OAuth | OAuth 버튼 클릭 | LoginPage |
| `auth.resetPasswordForEmail(email, {redirectTo})` | 비밀번호 재설정 이메일 발송 | ForgotPasswordForm 제출 | ForgotPasswordForm (G-54) |
| `auth.updateUser({password})` | 새 비밀번호 저장 | ResetPasswordForm 제출 | ResetPasswordForm (G-54) |
| `auth.resend({type: 'signup', email})` | 검증 이메일 재전송 | EmailVerificationPending 재전송 버튼 | EmailVerificationPending (G-55) |
| `auth.signOut()` | 로그아웃 | 로그아웃 버튼 클릭 | (Lobby/Settings) |
| `auth.getSession()` | 현재 세션 조회 | 페이지 로드 시 (onAuthStateChange) | App.tsx |
| `auth.onAuthStateChange()` | 세션 변경 리스너 | 페이지 마운트 (App.tsx 레벨) | App.tsx |

**AuthPage 책임:** 
- 폼 입력 → userStore 액션 → 네비게이션 (기본 로그인/가입)
- userStore를 경유하여 Supabase 호출 (userStore의 액션 함수 사용)
- G-54, G-55 컴포넌트는 직접 Supabase 호출 가능 (폼 검증 후)

## DataChannel 의존성

**없음** — 인증 화면은 LiveKit Room 입장 전 단계이며 DataChannel을 열거나 구독하지 않는다.

## 금지 사항 (MUST NOT)

- ❌ **Supabase secret 키 클라이언트 노출** — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY만 사용 (environment 제한)
- ❌ **세션/토큰을 localStorage 직접 저장** — Supabase SDK가 자동 관리. userStore는 메모리만 (새로고침 시 onAuthStateChange로 복원)
- ❌ **비밀번호 평문 저장 or 로깅** — 폼에서 즉시 제거, 네트워크 요청은 HTTPS only
- ❌ **인증 없이 /lobby, /models, /rooms/:id 접근 허용** — ProtectedRoute로 가드 (routes.tsx)
- ❌ **로그인 실패 시 이메일 열거 공격(enumeration) 응답** — "이메일 또는 비밀번호가 틀렸습니다" (구체화 금지)
- ❌ **회원가입 중복 확인 API 노출** — 폼 제출 시만 검증 (enumeration 방지)
- ❌ **Google OAuth callback 핸들링 미흡** — URL fragment (#) 파싱 정확히 + state 검증 (CSRF 방지)
- ❌ **세션 만료 시 자동 로그아웃 미처리** — useEffect + onAuthStateChange에서 UNAUTHENTICATED 감지 시 /login 리다이렉트

## 컴포넌트 관계

```
[LoginPage]
  ├─ 이메일/비밀번호 입력 폼
  │  └─ onSubmit → userStore.login()
  │     ├─ Supabase API call (AUTHENTICATING state)
  │     └─ 성공 → navigate('/lobby')
  │     └─ 실패 → errorToast + userStore.error 표시
  │
  ├─ "비밀번호를 잊으셨나요?" 링크 (G-54)
  │  └─ onClick → navigate('/auth/forgot-password')
  │     └─ [ForgotPasswordForm 마운트]
  │
  └─ "Google로 계속하기" 버튼
     └─ onClick → userStore.signInWithGoogle()
        └─ Supabase OAuth flow → /auth/callback
           └─ redirect to /lobby

[ForgotPasswordForm] (G-54)
  ├─ 이메일 입력 폼 (RESET_REQUEST)
  ├─ 30초 cooldown 타이머
  │
  ├─ "이메일로 링크 전송" 버튼
  │  └─ onClick → supabase.auth.resetPasswordForEmail(email, {redirectTo})
  │     ├─ 성공 → Toast "발송됨" + 카운트다운 시작
  │     └─ 실패 → errorToast 표시
  │
  └─ "뒤로가기" 버튼
     └─ onClick → onBack() → LoginPage로 복귀

[ResetPasswordForm] (G-54)
  ├─ 새 비밀번호 입력 (RESET_NEW_PW)
  ├─ 비밀번호 강도 표시기 (약/중/강)
  ├─ 비밀번호 확인 필드
  │
  └─ "비밀번호 변경" 버튼
     └─ onClick → supabase.auth.updateUser({password})
        ├─ 성공 → Toast "변경됨" + 5초 후 navigate('/lobby')
        └─ 실패 (token 만료) → error toast + ForgotPasswordForm으로 복귀

[RegisterPage]
  ├─ 이메일 입력
  ├─ 비밀번호 입력
  ├─ 비밀번호 재입력 (confirm)
  │  └─ client-side validation (강도 체크, 일치 확인)
  │
  └─ "회원가입" 버튼
     └─ onSubmit → userStore.signUpWithEmail()
        ├─ Supabase API call (AUTHENTICATING state)
        ├─ 성공:
        │  ├─ email_confirmed_at === null?
        │  │  └─ YES → [EmailVerificationPending 마운트] (G-55)
        │  └─ NO → navigate('/models')
        └─ 실패 (예: 이미 존재 계정)
           └─ errorToast + UI 표시

[EmailVerificationPending] (G-55)
  ├─ 마스킹 이메일 표시 ("gmdq***@gmail.com")
  ├─ "메일 클라이언트 열기" 버튼 (선택)
  ├─ 60초 타이머 (PENDING_VERIFICATION)
  │
  ├─ "다시 보내기" 버튼 (60초 경과 후)
  │  └─ onClick → supabase.auth.resend({type: 'signup', email})
  │     ├─ 성공 → Toast "다시 보냈습니다" + 타이머 초기화
  │     └─ 실패 → errorToast
  │
  └─ "이메일 변경" 링크
     └─ onClick → onChangeEmail() → navigate('/register')
        └─ 새 이메일로 재가입 가능

[인증 메일 링크 처리] (G-54, G-55)
  ├─ /auth?type=recovery#{access_token}... (G-54 비번재설정)
  │  └─ Supabase onAuthStateChange 감지
  │  └─ auth_state = 'RESET_NEW_PW'
  │  └─ [ResetPasswordForm 마운트]
  │
  └─ /auth?type=signup#{access_token}... (G-55 이메일인증)
     └─ Supabase onAuthStateChange 감지
     └─ user.email_confirmed_at 채워짐
     └─ auth_state = 'AUTHENTICATED'
     └─ 5초 후 navigate('/lobby')

[App.tsx 최상위]
  ├─ useEffect + supabase.auth.onAuthStateChange()
  │  └─ userStore.session + user 갱신
  │  └─ 세션 복원 (새로고침 시)
  │  └─ auth_state 감지: RESET_NEW_PW | PENDING_VERIFICATION | AUTHENTICATED 분기
  │
  └─ Routes
     ├─ <Route path="/login" element={<LoginPage />} />
     ├─ <Route path="/register" element={<RegisterPage />} />
     ├─ <Route path="/auth/forgot-password" element={<ForgotPasswordForm />} /> (G-54)
     ├─ <Route path="/auth" element={<AuthCallback />} />
     │  └─ ?type=recovery → ResetPasswordForm (G-54)
     │  └─ ?type=signup → EmailVerificationPending 또는 자동 AUTHENTICATED (G-55)
     │
     └─ <ProtectedRoute>
        ├─ <Route path="/onboarding/age" element={<AgeGate />} />
        ├─ <Route path="/lobby" element={<LobbyPage />} />
        ├─ <Route path="/models" element={<ModelSelector />} />
        └─ <Route path="/rooms/:id" element={<RoomView />} />
```

## 검증 체크리스트

### 구현 체크 (기본)

- [ ] 이메일 정규식 또는 라이브러리로 유효성 검증 (RFC 5322)
- [ ] 회원가입 비밀번호 강도 체크 (최소 8자, 대문자, 숫자, 특수문자 선택)
- [ ] 로그인 실패 시 generic 에러 메시지 ("이메일 또는 비밀번호 오류")
- [ ] Google OAuth state/PKCE 매개변수 Supabase에 위임 (SDK 자동 처리)
- [ ] /auth/callback 페이지에서 URL fragment 안전하게 파싱 (쿼리스트링 아님)
- [ ] 로그아웃 시 모든 store 초기화 (userStore, roomStore, stageStore, etc.)
- [ ] 새로고침 후 세션 복원 (onAuthStateChange 리스너)
- [ ] HTTPS only, secure 쿠키 설정 (Supabase 자동)

### 구현 체크 (G-54 비밀번호 재설정)

- [ ] ForgotPasswordForm: 이메일 입력 폼 + 30초 cooldown 타이머
- [ ] resetPasswordForEmail() 호출 후 "발송됨" toast 표시 (enumeration 방지: 존재 안 함도 성공 메시지)
- [ ] ResetPasswordForm: 새 비밀번호 입력 + 강도 표시기 (약/중/강)
- [ ] ResetPasswordForm: 최소 8자 강제, 비밀번호 확인 필드 일치 검증
- [ ] URL ?type=recovery 감지 시 ResetPasswordForm 마운트 (auth_state = 'RESET_NEW_PW')
- [ ] updateUser({password}) 호출 후 성공 시 /lobby로 자동 리다이렉트 (5초)
- [ ] 토큰 만료 (1시간) 시 "링크 만료" 에러 + ForgotPasswordForm으로 복귀
- [ ] 페이지 새로고침 중에도 ?type=recovery URL fragment 유지 가능
- [ ] ForgotPasswordForm onBack() 콜백: LoginPage로 복귀

### 구현 체크 (G-55 이메일 인증)

- [ ] RegisterPage signup 후 email_confirmed_at === null이면 EmailVerificationPending으로 전이
- [ ] EmailVerificationPending: 마스킹 이메일 표시 (gmdq***@gmail.com 형식)
- [ ] 초기 60초 cooldown 타이머 시작, 이후 매번 60초 리셋
- [ ] "다시 보내기" 버튼: 60초 경과 후만 활성화, resend({type: 'signup'}) 호출
- [ ] "메일 클라이언트 열기" 버튼: mailto: 링크 (선택사항)
- [ ] "이메일 변경" 링크: /register로 네비게이션
- [ ] URL ?type=signup 감지 시 자동으로 email_confirmed_at 확인
- [ ] email_confirmed_at 확인 후 자동으로 AUTHENTICATED 상태로 전이 + /lobby 리다이렉트
- [ ] 링크 유효 기간: 7일 (Supabase 기본값)
- [ ] 페이지 새로고침 중에도 onAuthStateChange 리스너에서 인증 상태 감지

### 리뷰 체크 (기본)

- [ ] Props interface가 완전한가?
- [ ] Store 읽기/쓰기 구분이 정확한가? (AuthPage만 쓰기)
- [ ] Supabase Auth API 호출이 API 스펙과 일치하는가?
- [ ] 비밀번호/토큰이 로그/DevTools에 노출되지 않는가?
- [ ] 금지 사항 위반이 없는가?
- [ ] react-router 8 navigate 사용이 정확한가? (useNavigate hook)
- [ ] 에러 UI (Toast/Modal) 접근성을 만족하는가?

### 리뷰 체크 (G-54, G-55)

- [ ] ForgotPasswordForm, ResetPasswordForm, EmailVerificationPending이 각각 올바른 상태에 마운트되는가?
- [ ] 30초 / 60초 cooldown 타이머 구현이 정확한가? (clearTimeout 정리 포함)
- [ ] 비밀번호 강도 표시기가 실시간 업데이트되는가?
- [ ] ?type=recovery 와 ?type=signup URL 파라미터 감지가 정확한가?
- [ ] Supabase onAuthStateChange에서 auth_state 상태 전이가 올바른가?
- [ ] 토큰 만료 시 에러 메시지가 사용자 친화적인가?
- [ ] 마스킹 이메일 로직이 정확한가? (조건: @ 이전 일부만 *, 또는 Supabase 문서 스펙 준수)
- [ ] 페이지 새로고침, 탭 전환 등 edge case에서 상태 보존이 되는가?
- [ ] 접근성: 타이머 카운트다운을 aria-live로 공지하는가?
- [ ] 모바일: ForgotPasswordForm, ResetPasswordForm, EmailVerificationPending이 모바일 화면에서 제대로 렌더링되는가?

---

## 관련 문서

- `../state-machines/Auth.md` — 인증 상태 머신 (UNAUTHENTICATED → AUTHENTICATING → AUTHENTICATED)
- `../specs/supabase-auth.md` — Supabase Auth 구현 가이드 + Google OAuth 설정
- `../DATA-SCHEMA.md §1.1` — users 테이블 스키마 (auth_id, email, display_name)
- `../FEATURE-SPEC.md` — AUTH-01, AUTH-02, AUTH-03 기능 명세
- `../PLATFORM-ARCHITECTURE.md` — Zustand userStore 구조

---

## 한줄정리

snack-web의 LoginPage/RegisterPage는 이메일·Google OAuth 인증을 userStore 경유로 처리하고, 세션 토큰 관리·리다이렉트·에러 처리를 담당하는 인증 게이트웨이로, ProtectedRoute와 함께 AUTH-01/02/03을 구현한다.
