# marketing-threads-publish

> Cron: 화·금 19:00 (Asia/Seoul) | Model: sonnet
> 마스터 플랜: `/Users/family/.claude/plans/unified-finding-yao.md` §4

## 목적

Threads 자동 발행 — `threads_queue` 에서 발행 시각이 도래한 1건을 Threads Graph API로 발행.

## 흐름

1. **시드 단계** (매주 화 09:00 한정) — `seed-threads-from-blog` Edge Function 호출
   - tailog.kr/feed.xml 조회 → 신규 글 검출 → 500자 요약 + 링크 + 해시태그 → `threads_queue` INSERT
2. **발행 단계** (화·금 19:00) — `publish-to-threads` Edge Function 호출
   - `threads_queue WHERE status='pending' AND scheduled_at <= now()` 가장 오래된 1건
   - Threads Graph API 2단계 (creation_id → publish)
   - `marketingPiiGuard` 통과 필수 (L11)
   - 성공 시 status='published' + threads_post_id 저장
3. **결과 보고** — 텔레그램으로 발행된 post_id + URL 전송

## 통과 기준

- [ ] 큐에서 1건 자동 발행 성공
- [ ] PII 검사 통과 (L11)
- [ ] threads_post_id 저장 확인
- [ ] 발행 24h 후 인사이트 수집 자동화 트리거 등록

## 환경변수

- `META_GRAPH_TOKEN` (60일 만료)
- `THREADS_USER_ID`
- `MARKETING_TELEGRAM_BOT_TOKEN`, `MARKETING_TELEGRAM_CHAT_ID`

## 실패 시

- API 401/403: 토큰 만료 가능성 → `marketing-threads-token-refresh` 즉시 트리거
- 500자 초과: 큐 상태 'failed' + 텔레그램 알림
- PII 위반: 즉시 중단 + 텔레그램 위반 내용 보고
