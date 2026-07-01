# marketing-threads-token-refresh

> Cron: 매주 월 09:00 (Asia/Seoul) | Model: haiku
> 마스터 플랜: `/Users/family/.claude/plans/unified-finding-yao.md` §4

## 목적

Meta Graph API long-lived 토큰(60일 만료)을 만료 7일 전에 자동 갱신 알림.

## 흐름

1. Supabase env 또는 메타데이터에서 `META_GRAPH_TOKEN_EXPIRES_AT` 조회
2. `(expires_at - now())` 계산
3. 분기:
   - ≤ 7일: 텔레그램 긴급 알림 + 수동 갱신 가이드 링크
   - ≤ 14일: 텔레그램 사전 알림
   - > 14일: 정상 (조용히 종료)
4. 토큰 헬스 체크 — `GET https://graph.facebook.com/me?access_token=$TOKEN` 200 OK 확인
   - 200 외 응답 시 즉시 텔레그램 알림

## 갱신 절차 (사용자 수동 — 자동화 미지원)

```
1. https://developers.facebook.com → My Apps → TaillogToss Marketing
2. Tools → Graph API Explorer → User Token Refresh
3. Long-lived token (60일) 발급
4. curl GET .../oauth/access_token?grant_type=fb_exchange_token&...&fb_exchange_token={SHORT}
5. 응답 access_token을 Supabase env `META_GRAPH_TOKEN`에 갱신
6. expires_at 갱신 (60일 후 ISO)
```

## 환경변수

- `META_GRAPH_TOKEN`, `META_GRAPH_TOKEN_EXPIRES_AT`
- `MARKETING_TELEGRAM_BOT_TOKEN`, `MARKETING_TELEGRAM_CHAT_ID`

## 출력

- 텔레그램 메시지 (만료 임박 시) 또는 조용한 종료
