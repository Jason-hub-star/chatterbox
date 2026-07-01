# TaillogToss 마케팅 파이프라인 환경변수 정의서

> 모든 페이즈에서 사용되는 환경변수의 단일 정의 소스.
> 등록 위치는 Supabase Edge Function env (TaillogToss측 자동화 전용)와 mungmungfit Vercel env (사이트측)로 분리.

---

## 등록 위치 약어
- **🅰 Supabase Edge** (TaillogToss `supabase/functions/_shared/.env` 또는 Supabase 콘솔)
- **🅱 tailog.kr Vercel** (`tailog-marketing-site` 프로젝트 Vercel env)
- **🅲 로컬 개발자** (`.env.local`, git 제외)

## 등록 완료 사항 (2026-05-22 갱신)

- ✅ 인스타: `@tailog_official` — https://www.instagram.com/tailog_official/
- ✅ Threads: `@tailog_official@threads.net`
- ✅ 당근 비즈프로필 (mungmungfit과 공유): https://www.daangn.com/kr/local-profile/강아지-방문교육-홈스쿨링-8oywzkpoyrdb/
- ✅ 도메인: **tailog.kr** (가비아 구매 완료)
- ⏳ Meta Graph API 토큰 — 발급 대기 (M0.4)
- ✅ GA4 측정 ID: `G-6HJ47QL58R` (Stream ID `14925493675`, 스트림명 "테일로그", URL `https://tailog.kr`)
- ✅ Telegram 봇: `t.me/taillogtoss_marketingbot`
  - **⚠ 보안 — 첫 발급 토큰은 채팅에 노출되어 회전 권장.** 현재 사용 토큰 출처: @BotFather 1차 발급 또는 revoke 후 재발급
  - ✅ `MARKETING_TELEGRAM_CHAT_ID`: `8796384805` (2026-05-22 발급, 테스트 메시지 도달 확인)
- ⏳ Vercel 프로젝트 + tailog.kr DNS 연결 — 진행 중

---

## Meta Graph API (Phase 0, 2, 3)

| 키 | 위치 | 값 형식 | 만료 | 발급 위치 |
|---|---|---|---|---|
| `META_GRAPH_TOKEN` | 🅰🅱 | long-lived access token | **60일** | https://developers.facebook.com → 앱 생성 → Instagram Basic Display + Threads Display |
| `META_GRAPH_TOKEN_EXPIRES_AT` | 🅰 | ISO timestamp | — | 위 토큰 발급 시 자동 계산 |
| `INSTAGRAM_USER_ID` | 🅰🅱 | numeric ID (e.g., 17841...) | 영구 | 위 콘솔에서 비즈 계정 연결 후 조회 |
| `THREADS_USER_ID` | 🅰 | numeric ID | 영구 | 같은 콘솔, Threads 권한 |
| `META_GRAPH_REFRESH_URL` | 🅰 | refresh API URL | — | `https://graph.facebook.com/v18.0/oauth/access_token` |

**갱신 자동화**: `marketing-threads-token-refresh.prompt.md` (매주 월 09:00, 만료 7일 전 텔레그램 알림)

---

## Google Analytics 4 (Phase 0, 4)

| 키 | 위치 | 값 형식 | 발급 위치 |
|---|---|---|---|
| `GA4_MEASUREMENT_ID` | 🅱 | G-XXXXXXXXXX | GA4 콘솔 → 속성 → 데이터 스트림 |
| `GA4_API_SECRET` | 🅰 | string (Measurement Protocol) | GA4 콘솔 → 측정 ID → API secrets |
| `NEXT_PUBLIC_GA_ID` | 🅱 | = GA4_MEASUREMENT_ID | mungmungfit `app/layout.tsx` 마운트용 |

---

## Telegram (Phase 0-6 전반)

| 키 | 위치 | 값 형식 | 발급 위치 |
|---|---|---|---|
| `MARKETING_TELEGRAM_BOT_TOKEN` | 🅰 | `<bot_id>:<hash>` | @BotFather → /newbot |
| `MARKETING_TELEGRAM_CHAT_ID` | 🅰 | numeric | 봇과 채팅 시작 후 `getUpdates` 로 조회 |

**용도**: 사례연구 사용자 검수(L11), 토큰 만료 알림, 예산 초과 알림, 콘텐츠 발행 알림.

---

## 예산 가드레일 (Phase 4, 5)

| 키 | 위치 | 값 형식 | 기본값 |
|---|---|---|---|
| `MONTHLY_AD_BUDGET_KRW` | 🅰 | integer | `50000` (L3 잠금) |
| `MONTHLY_AD_BUDGET_WARN_THRESHOLD_KRW` | 🅰 | integer | `40000` (누적 80% 도달 시 텔레그램 알림) |
| `MONTHLY_POINT_BUDGET_KRW` | 🅰 | integer | `50000` (Phase 5 공유 리워드 별도 예산) |

---

## Supabase (전 페이즈 공통)

| 키 | 위치 | 비고 |
|---|---|---|
| `SUPABASE_URL` | 🅰🅱 | mungmungfit과 TaillogToss는 다른 Supabase 프로젝트일 수 있음 — 주의 |
| `SUPABASE_SERVICE_ROLE_KEY` | 🅰 | Edge Function 전용. FE에 노출 금지 |
| `SUPABASE_ANON_KEY` | 🅱 | mungmungfit 사이트에서 사례연구 데이터 조회용 |

> ⚠ mungmungfit 사이트에서 TaillogToss Supabase의 익명화 뷰만 조회. 원본 테이블 접근 금지 (L11).

---

## Phase 6 — Subscription 전용 (이미 TaillogToss 본체에 존재)

| 키 | 위치 | 비고 |
|---|---|---|
| `TOSS_CLIENT_CERT_BASE64` | 🅰 | mTLS — 이미 존재 (`supabase/functions/_shared/mTLSClient.ts:132`) |
| `TOSS_CLIENT_KEY_BASE64` | 🅰 | mTLS — 이미 존재 |
| `TOSS_API_BASE` | 🅰 | 기본값 `https://apps-in-toss-api.toss.im` |
| `TOSS_MTLS_MODE` | 🅰 | `real` 또는 미지정(자동감지) |

---

## 검증 명령어

### Phase 0 종료 시점 — 5개 채널 검증

```bash
# 1. Meta Graph 토큰
curl -X GET "https://graph.instagram.com/me?fields=id,username&access_token=$META_GRAPH_TOKEN"
# 예상: { "id": "17841...", "username": "taillog.toss" } + HTTP 200

# 2. Threads 권한 확인
curl -X GET "https://graph.threads.net/v1.0/me?access_token=$META_GRAPH_TOKEN"
# 예상: { "id": "..." } + HTTP 200

# 3. GA4 측정 ID 형식 검사
echo "$GA4_MEASUREMENT_ID" | grep -E '^G-[A-Z0-9]{10}$'
# 예상: 일치 줄 출력

# 4. Telegram 봇 테스트
curl -X POST "https://api.telegram.org/bot$MARKETING_TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$MARKETING_TELEGRAM_CHAT_ID" \
  -d "text=TaillogToss marketing pipeline Phase 0 setup OK"
# 예상: { "ok": true, ... }

# 5. 당근 비즈프로필 — API 부재, URL만 검증
echo "당근 비즈프로필 URL: $KARROT_PROFILE_URL (수동 확인)"
```

---

## 등록 체크리스트 (Phase 0 자기리뷰 통과 기준)

- [ ] 5개 채널 계정 모두 활성
- [ ] `META_GRAPH_TOKEN` 발급 + `curl` 200 OK
- [ ] `INSTAGRAM_USER_ID`, `THREADS_USER_ID` 조회
- [ ] `GA4_MEASUREMENT_ID` 발급 + 형식 검증
- [ ] `MARKETING_TELEGRAM_BOT_TOKEN` + `CHAT_ID` 발급 + 테스트 메시지 1건 도착
- [ ] 당근 비즈프로필 등록 완료 + URL 저장 (수동, API 부재)
- [ ] 위 키를 Supabase Edge env + mungmungfit Vercel env에 분리 등록
- [ ] `.env.local` `.gitignore` 확인 (절대 커밋 금지)
