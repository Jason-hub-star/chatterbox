---
tags: [guide]
---

# 간편인증(카카오·구글) 설정 가이드 — ChatterBox

> 로그인/회원가입에 카카오·Google 간편인증을 **실제로 켜는** 설정 절차.
> 코드는 이미 완료(소셜 우선·이메일 강등, `OAuthButtons`·`loginWithOAuth`). 남은 건 **외부 콘솔 3곳 설정 + `.env` 플래그**뿐이다.
> Updated: 2026-07-08 · 근거: Supabase Docs(2026-05 갱신) · 계약: `docs/contracts/AuthPage.md`, 정책: `docs/specs/security/auth-and-rls.md §1.1`

## 0. 준비물 · 핵심 값

| 항목 | 값 |
|---|---|
| Supabase 프로젝트 ref | `owfcrolbvikkqrotmleq` |
| **Supabase 콜백 URL**(구글·카카오 양쪽에 등록) | `https://owfcrolbvikkqrotmleq.supabase.co/auth/v1/callback` |
| 앱 로그인 후 복귀 URL(코드가 사용) | `{origin}/lobby`, 비번재설정 `{origin}/reset` |
| 노출 플래그 | `.env` 의 `VITE_OAUTH_PROVIDERS="kakao,google"` |
| 로컬 개발 origin | `http://localhost:5173` |

> ⚠️ "콜백 URL"(공급사→Supabase)과 "리다이렉트 URL"(Supabase→우리 앱)은 다르다. 콜백은 항상 위의 `/auth/v1/callback` 고정, 리다이렉트는 §4에서 허용목록에 등록한다.

전체 흐름: 사용자가 버튼 클릭 → 카카오/구글 로그인 → **Supabase 콜백**(`/auth/v1/callback`)으로 복귀 → Supabase가 세션 발급 후 **우리 앱**(`/lobby`)으로 리다이렉트.

---

## 1. Supabase 콜백 URL 확인

1. [Supabase 대시보드](https://supabase.com/dashboard) → 프로젝트 선택.
2. 좌측 **Authentication → Sign In / Providers**.
3. 목록에서 **Google** 또는 **Kakao**를 펼치면 **Callback URL**이 보인다 — `https://owfcrolbvikkqrotmleq.supabase.co/auth/v1/callback`. 이 값을 아래 구글·카카오 콘솔에 그대로 붙여넣는다.

---

## 2. Google 설정

### 2-1. Google Cloud Console에서 OAuth 클라이언트 생성
1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 생성/선택.
2. **APIs & Services → OAuth consent screen**: User Type = External, 앱 이름·지원 이메일·스코프(`email`, `profile`, `openid`) 설정. 테스트 단계면 **Test users**에 본인 계정 추가(게시 전엔 테스트 유저만 로그인 가능).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**
   - **Authorized JavaScript origins**: `http://localhost:5173`, 그리고 배포 도메인(예: `https://app.chatterbox.example`)
   - **Authorized redirect URIs**: **§1의 Supabase 콜백 URL** (`https://owfcrolbvikkqrotmleq.supabase.co/auth/v1/callback`)
4. **Create** → **Client ID**와 **Client Secret**을 복사.

### 2-2. Supabase에 등록
1. 대시보드 **Authentication → Sign In / Providers → Google**.
2. **Google Enabled** ON → Client ID·Client Secret 붙여넣기 → **Save**.

---

## 3. Kakao 설정

### 3-1. Kakao Developers 앱 생성
1. [Kakao Developers](https://developers.kakao.com/) 로그인 → **내 애플리케이션 → 애플리케이션 추가하기**. 앱 아이콘·이름·회사명·카테고리·기본 도메인 입력 후 저장.

### 3-2. 키 확보
1. **앱 설정 → 앱 → 플랫폼 키(App Settings → App → Platform Key)**의 **REST API key** = Supabase의 **Client ID**.
2. 같은 화면에서 해당 REST API key를 클릭 → **Kakao Login Client Secret code** = Supabase의 **Client Secret**. **Client Secret 활성화(ON)** 필수.

### 3-3. 카카오에 콜백 URL 등록
1. **앱 설정 → 앱 → 플랫폼 키**에서 REST API key 편집 → **Kakao Login Redirect URI** 필드에 **§1의 Supabase 콜백 URL** 입력 → 저장.
2. **제품 설정 → 카카오 로그인 → 일반**: **활성화 상태 ON**.

### 3-4. ★ 이메일 동의항목 (계정 분열 방지의 핵심)
1. **제품 설정 → 카카오 로그인 → 동의항목(Consent Items)**에서 스코프 설정:
   - `account_email`
   - `profile_nickname`
   - `profile_image`
2. **`account_email`은 "비즈니스 앱(Biz App)"에서만 제공된다.** 비즈앱 전환: **앱 설정 → 앱 → 일반 → 비즈니스 정보(Business Information)** 필드를 채워 검수 진행(리드타임 2~3주). ChatterBox는 이메일 가입 계정과 **동일인 자동 연결**이 필요하므로 `account_email` **필수동의**로 받는 것을 권장.
3. (임시 우회) 비즈앱 검수 전이라면 Supabase Kakao 프로바이더에서 **"Allow users without an email"**을 켜서 이메일 없이도 로그인은 가능하다. **단** 이 경우 카카오 계정이 이메일 가입 계정과 자동 연결되지 않아 **동일인 계정 분열** 위험 — 정식 오픈 전 비즈앱 검수로 전환할 것.

### 3-5. Supabase에 등록
1. 대시보드 **Authentication → Sign In / Providers → Kakao**.
2. **Kakao Enabled** ON → Client ID(REST API key)·Client Secret 붙여넣기 → **Save**.
3. `account_email`을 요청하지 않았다면 **Allow users without an email** ON(위 임시 우회 시).

---

## 4. Supabase 리다이렉트 허용목록

우리 코드는 로그인 성공 후 `{origin}/lobby`, 비번 재설정 시 `{origin}/reset`으로 돌아온다. 이 경로가 허용목록에 없으면 리다이렉트가 차단된다.

1. 대시보드 **Authentication → URL Configuration**.
2. **Site URL**: 배포 기본 도메인(예: `https://app.chatterbox.example`). 로컬 테스트만이면 `http://localhost:5173`.
3. **Redirect URLs**에 추가(와일드카드 허용):
   - `http://localhost:5173/**`
   - `https://<배포도메인>/**`

---

## 5. 앱에서 버튼 켜기

`.env`(또는 배포 환경변수)에서 플래그 주석 해제:

```bash
VITE_OAUTH_PROVIDERS="kakao,google"
```

- 설정 시 로그인/회원가입 상단에 **카카오(주버튼)→Google** 노출 + 이메일은 "이메일로 로그인" 토글 뒤로 강등.
- 비우면(기본) 기존처럼 이메일 폼만 노출.
- Vite 환경변수라 **재빌드/재기동 필요**(`npm run dev` 또는 재배포). `google`만/`kakao`만도 가능.

---

## 6. 테스트 체크리스트

- [ ] `.env`에 `VITE_OAUTH_PROVIDERS` 설정 후 `npm run dev` → `/login`에 카카오·Google 버튼 노출
- [ ] "Google로 계속하기" → 구글 동의화면 → `/lobby` 복귀 + 세션 생성
- [ ] "카카오로 계속하기" → 카카오 동의화면(이메일 동의 포함) → `/lobby` 복귀
- [ ] 동일 이메일의 기존 이메일가입 계정과 소셜 계정이 **한 사용자로 연결**되는지(계정 분열 없음)
- [ ] "이메일로 로그인" 토글 → 기존 이메일 로그인 정상 동작(강등돼도 살아있음)
- [ ] 반응형: `ROUTES=/login,/register BASE=http://localhost:5173 node scripts/check-responsive.mjs` (360/768/1440 오버플로 없음)

---

## 7. 자주 나는 오류

| 증상 | 원인 · 해결 |
|---|---|
| `redirect_uri_mismatch`(구글) | Google 콘솔의 Authorized redirect URIs가 **Supabase 콜백 URL**과 정확히 일치해야 함(끝 슬래시·http/https 포함). |
| 카카오 로그인 후 이메일이 안 옴 | 비즈앱 미전환 또는 `account_email` 동의항목 미설정. §3-4 참조. |
| 로그인 후 앱으로 안 돌아옴/차단 | §4 Redirect URLs 허용목록 누락. `{origin}/lobby` 매칭 확인. |
| 구글에서 "앱이 확인되지 않음" | OAuth consent screen이 Testing 상태 + 테스트 유저 미등록. 테스트 유저 추가 또는 앱 게시. |
| 버튼이 안 보임 | `VITE_OAUTH_PROVIDERS` 미설정 또는 값 오타(`kakao,google`), 재빌드 안 함. |

---

## 참고 자료

- [Supabase — Login with Kakao](https://supabase.com/docs/guides/auth/social-login/auth-kakao)
- [Supabase — Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase — Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Kakao Developers](https://developers.kakao.com/)
- [Google Cloud Console](https://console.cloud.google.com/)
