# marketing-instagram-publish

> Cron: 매주 수 20:00 (Asia/Seoul) | Model: sonnet
> 마스터 플랜: `/Users/family/.claude/plans/unified-finding-yao.md` §4

## 목적

Instagram 자동 발행 — `instagram_queue` 에서 1건을 Graph API로 발행 (text/image/carousel).

## 흐름

1. **준비 단계** (수 18:00) — 사용자가 Canva에서 만든 캐러셀 이미지 5장을 Supabase Storage `marketing/instagram/` 에 업로드 + `instagram_queue` INSERT (수동, L8와 동일 — 이미지 자동 생성 미지원)
2. **발행 단계** (수 20:00) — `publish-to-instagram` Edge Function 호출
   - `instagram_queue WHERE status='pending' AND scheduled_at <= now()` 1건
   - content_type 별 분기: text/image(단일) / carousel(2~10장) / reel(향후)
   - 캐러셀: 각 미디어 컨테이너 → carousel 컨테이너 → publish
   - `marketingPiiGuard` 통과 필수 (L11)
3. **광고 부스트 안내** (월 1회) — 발행 후 24h 인사이트 수집 → 도달률 TOP 1건 텔레그램으로 알림 → 사용자가 Meta Ads 콘솔에서 수동 부스트 (₩20,000 한도, L3 가드레일)
4. **결과 보고** — 텔레그램으로 발행된 post_id + 인사이트 수집 예정 시각

## 통과 기준

- [ ] 큐 1건 발행 성공
- [ ] PII 검사 통과
- [ ] instagram_post_id 저장
- [ ] 24h 후 `collect-social-insights` 자동 트리거

## 환경변수

- `META_GRAPH_TOKEN`
- `INSTAGRAM_USER_ID`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MARKETING_TELEGRAM_BOT_TOKEN`, `MARKETING_TELEGRAM_CHAT_ID`

## 실패 시

- 미디어 URL 무효: failed + 텔레그램 알림
- 캐러셀 < 2장: 입력 검증 실패
- PII 위반: 즉시 중단
- 광고 부스트 누적 ≥ 40,000원: 알림, 50,000원 ≥ 정지 (L3)
