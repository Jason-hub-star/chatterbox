---
tags: [guide]
---

# 인시던트 플레이북

> G-145 산출 문서. 서비스 장애 발생 시 대응 절차.

---

## 심각도 정의 (P0~P3)

| 등급 | 정의 | 예시 | 초기 대응 SLA |
|------|------|------|-------------|
| **P0** | 전체 서비스 다운 또는 데이터 손실 위험 | DB 연결 불가, 인증 전면 실패, 크레딧 이중 차감 | 15분 내 대응 시작 |
| **P1** | 핵심 기능 장애 (VGEN/방 생성/WebRTC 불가) | fal.ai 연결 실패, LiveKit 방 생성 500 에러 | 30분 내 대응 시작 |
| **P2** | 부분 기능 저하 (특정 사용자군만 영향) | iOS Safari 접속 오류, 모바일 레이아웃 깨짐 | 2시간 내 대응 시작 |
| **P3** | 미관/UX 이슈 (서비스 사용 가능) | 번역 오류, 색상 불일치, 비활성화 버튼 | 다음 스프린트 |

---

## 인시던트 탐지 채널

1. **Sentry Alert** → Slack `#ops-alerts` 자동 전송
2. **pg_cron 비용 알림** (MonitoringDashboard.md §알림규칙) → Slack `#ops-alerts`
3. **LiveKit Dashboard** 패킷 손실 > 5% 수동 확인
4. **사용자 신고** → Discord `#버그리포트` 채널

---

## 대응 절차

### Step 1 — 인지 & 심각도 판정 (5분 이내)

```
1. Sentry/Slack 알림 확인
2. 영향 범위 추정 (전체? 특정 기능? 특정 사용자?)
3. P0/P1/P2/P3 판정
4. Slack #ops 채널에 인시던트 선언 메시지 작성
```

**선언 메시지 템플릿:**
```
[P1 인시던트] VGEN 생성 실패
- 탐지: 2026-06-30 14:32 KST (Sentry #12345)
- 영향: VGEN 기능 전체 (fal.ai 응답 없음)
- 담당: @username
- 상태: 조사 중
```

### Step 2 — 즉시 완화 (P0/P1: 15분 이내)

```
P0 DB 연결 불가:
  1. Supabase Dashboard → Project Status 확인
  2. Status 페이지 확인 (status.supabase.com)
  3. 서비스 점검 모드 활성화: app_config에서 MAINTENANCE_MODE = true

P1 fal.ai 연결 실패 (MonitoringDashboard.md §알림규칙 참조):
  1. Sentry에서 확인
     - Alerts → 해당 fal.ai 401 Alert 클릭
     - 또는 Issues 검색: error.message contains "401" AND transaction contains "fal"
     - 5분 내 3회 이상 발생 여부 확인
  2. MonitoringDashboard.md 라인 417 알림 규칙이 Slack #ops-alerts에 도착했는지 5분 이내 확인
     - Slack 검색: "fal.ai 401 에러율"
  3. fal.ai Status 페이지 동시 확인
     - status.fal.ai → 서비스 상태 확인 (Incident 여부)
  4. 위 3가지 확인 결과 fal.ai 장애 또는 API 키 만료 확정 시:
     - Feature Flag VGEN_ENABLED = false → VGEN 기능 즉시 비활성화 (FeatureFlags.md 참조)
     - 사용자 공지 (Discord #공지)
  5. 에러가 설정 문제(API 키 만료/잘못된 키)로 판명되면:
     - SECURITY-OPS.md §키 로테이션 절차로 전환
     - fal.ai 신규 키 발급 및 Secrets 업데이트
     - Edge Function 재배포

P1 LiveKit 방 생성 실패:
  1. LiveKit Cloud Dashboard 확인
  2. Edge Function livekit-token 최근 에러 로그 확인
  3. Feature Flag LIVEKIT_ENABLED = false → 에러 페이지로 리다이렉트
```

### Step 3 — 근본 원인 파악 (P0: 30분, P1: 1시간)

```bash
# Supabase 에러 로그
# Supabase Dashboard → Logs → Edge Functions

# Sentry 에러 스택트레이스 확인
# sentry.io → Issues → 해당 에러 클릭 → Stack Trace

# LiveKit 로그
# dashboard.livekit.cloud → Logs

# 최근 배포 확인
# Cloudflare Pages → Deployments → 최근 배포 시점과 인시던트 시점 비교
```

### Step 4 — 수정 & 배포

- 핫픽스 브랜치 `hotfix/[issue-slug]` 생성
- 코드 리뷰 1인 필수 (긴급 배포여도 최소 유지)
- Staging 배포 → 검증 → Production 배포
- Feature Flag로 단계적 릴리스 가능 시 활용

### Step 5 — 공지

**P0/P1 사용자 공지 템플릿 (Discord #공지):**
```
[서비스 점검] VGEN 기능 일시 중단

안녕하세요. 현재 영상 생성(VGEN) 기능이 일시적으로 중단되었습니다.

원인을 파악하고 있으며, 복구 예상 시간은 [시간]입니다.
크레딧은 차감되지 않으며, 이용에 불편을 드려 죄송합니다.

업데이트는 이 채널에서 공유됩니다.
```

### Step 6 — 해결 선언 & 복구

```
1. Feature Flag 원복 (VGEN_ENABLED = true)
2. MAINTENANCE_MODE = false
3. Sentry에서 해당 이슈 Resolved 처리
4. Slack #ops에 해결 선언 메시지 작성

해결 메시지 템플릿:
[P1 해결] VGEN 생성 복구 완료
- 해결 시각: 2026-06-30 16:15 KST
- 원인: fal.ai API 키 만료
- 조치: 키 갱신 + SECURITY-OPS.md §키 로테이션 절차에 90일 알림 추가
- 영향 시간: 1시간 43분
```

---

## 런북 — 일반 장애 유형

### API 키 만료

```
탐지: Sentry 401 에러 급증
조치:
  1. .env 또는 Supabase Secrets에서 해당 키 확인
  2. 서비스 대시보드에서 신규 키 발급
  3. Supabase Edge Function → Settings → Secrets 업데이트
  4. Edge Function 재배포 (코드 변경 없이도 재배포 필요)
예방: SECURITY-OPS.md §키 로테이션 90일 캘린더 알림 설정
```

### Supabase DB 연결 풀 소진

```
탐지: Supabase Dashboard Connection Count > 20
조치:
  1. 비정상 오래된 연결 확인
     SELECT * FROM pg_stat_activity WHERE state = 'idle' AND state_change < now() - interval '5 min';
  2. 유휴 연결 강제 종료
     SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < now() - interval '10 min';
  3. 연결 풀링 설정 확인 (pgbouncer 모드)
예방: 클라이언트 연결 시 항상 supabase 싱글톤 인스턴스 사용 (lib/supabase.ts)
```

### Cloudflare Pages 배포 실패

```
탐지: 빌드 로그에서 에러 확인
조치:
  1. Cloudflare Pages → Deployments → 최근 배포 → Build Logs
  2. tsc 에러 또는 vite build 에러 확인
  3. 이전 배포 버전으로 롤백 (Deployments → 이전 배포 → "Promote to Production")
예방: CI에서 tsc + build 게이트 강제 (DEFINITION-OF-DONE.md)
```

---

## 포스트모템 템플릿

P0/P1 인시던트 해결 후 48시간 이내 작성.

```markdown
# 포스트모템: [인시던트 제목]

**날짜:** 2026-06-30
**심각도:** P1
**영향 시간:** 1시간 43분
**담당:** @username

## 타임라인

| 시각 | 사건 |
|------|------|
| 14:32 | Sentry Alert 수신 |
| 14:37 | P1 선언, VGEN_ENABLED = false |
| 14:50 | 원인 파악 (fal.ai 키 만료) |
| 16:15 | 키 갱신 및 기능 복구 |

## 근본 원인

fal.ai API 키가 90일 후 자동 만료됨. 갱신 알림이 없었음.

## 영향

- VGEN 기능 1시간 43분 중단
- 해당 시간 내 VGEN 시도 사용자: 약 12명 (Supabase 로그 기준)
- 크레딧 차감 없음 (Feature Flag으로 차단 상태)

## 조치 사항 (Action Items)

- [ ] SECURITY-OPS.md §키 로테이션 — fal.ai 키 90일 캘린더 알림 추가 (@username, 2026-07-05)
- [ ] MonitoringDashboard.md — fal.ai 401 에러 Sentry Alert 임계값 강화 (@username, 2026-07-07)

## 잘된 점 / 개선점

- 잘된 점: Feature Flag으로 15분 내 빠른 완화
- 개선점: API 키 만료 전 사전 알림 체계 없었음
```

---

## 온콜 연락처

| 역할 | 이름 | Discord |
|------|------|---------|
| 개발 담당 | (주인님) | @username |
| 비상 에스컬레이션 | - | - |

> MVP 단계는 단독 운영. 팀 확장 시 이 표 업데이트.
