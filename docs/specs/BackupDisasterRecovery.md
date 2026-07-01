---
tags: [spec]
---

# 백업 및 재해복구 전략 (G-120)

## §1 백업 전략

### Supabase PostgreSQL

- **자동 백업**: Supabase Pro 플랜 일일 백업, 7일 보존 (시점 복구 PITR 지원)
- **추가 백업**: pg_dump를 pg_cron 또는 외부 cron으로 주 1회 R2에 저장 (SQL 덤프 압축)
- **백업 보존**: DB 덤프 4주, Supabase PITR 7일

### Cloudflare R2

- **Object Versioning**: 모든 버킷에 활성화하여 실수 삭제된 객체 복원 지원
- **MFA Delete**: 프로덕션 R2 버킷에 필수 활성화 (root 계정에서만 설정)
  - MFA Delete를 활성화하면 버전 삭제 시 MFA 검증 필수
  - 설정: R2 Dashboard → Bucket Settings → MFA Delete 활성화
- **우선순위**: 사용자 생성 영상은 재생성 가능 (vgen_jobs 재실행), 녹화는 재생성 불가 → R2에 우선 보호 정책 적용
- **백업 자동화**: 별도 R2 격리 버킷으로 **매주 일요일 02:00 UTC** rclone 복사 실행 (pg_cron 스케줄)
  - 목적: 중요 녹화 파일(*.mp4, *.webm) 중심 백업, 비용 최소화
  - rclone 설정: Cloudflare R2 credentials (access_key_id, secret_access_key) → Supabase Edge Function Secrets 저장
  - Edge Function: `backup-r2-isolated` (또는 외부 cron 서비스에서 webhook 호출)
  
  ```bash
  # Edge Function 또는 외부 백업 스크립트에서 실행
  rclone copy chatterbox-prod: chatterbox-backup-isolated: \
    --include "*.mp4" --include "*.webm" \
    --exclude-if-modified-before "7d" \
    --config /path/to/.rclone.conf
  ```
  
  ```sql
  -- pg_cron 스케줄 (Supabase SQL Editor)
  select cron.schedule(
    'backup-r2-isolated',
    '0 2 * * 0',  -- 매주 일요일 02:00 UTC
    $$
    select http_post(
      'https://[project-id].functions.supabase.co/functions/v1/backup-r2-isolated',
      '{}',
      'application/json'
    )
    $$
  );
  ```

### Secrets & Configuration (.env)

- **방식**: `.env` 파일은 git에 커밋되지 않음 (`.gitignore` 포함)
- **백업**: Supabase Edge Function Secrets은 Supabase 대시보드 Settings → Secrets에서 자동 보존
- **로컬 .env 백업**: 
  - 비상 연락처: 로컬 개발자 머신에 `.env.backup.gpg` (암호화) 저장
  - 절차: `gpg --symmetric --cipher-algo AES256 .env` → 안전한 클라우드 스토리지에 저장
- **복구 절차**:
  1. Supabase Dashboard → Settings → Edge Functions → Secrets 확인
  2. 누락된 키가 있으면 암호화된 백업에서 복구: `gpg --decrypt .env.backup.gpg > .env`
  3. Edge Function 재배포

### Auth (Supabase)

- Supabase Auth는 PostgreSQL에 저장 → DB 백업에 포함됨

---

## §2 RTO / RPO 목표 (장애 유형별)

### 전체 서비스 SLA

| 구분 | RPO (데이터 손실 허용) | RTO (복구 목표 시간) |
|---|---|---|
| **DB (PostgreSQL) — 자체 복구** | 24시간 (일일 백업 기준) | **2시간 이내** (Supabase PITR 복구 + 검증, 앱 재배포 제외) |
| **DB + 전체 서비스 (앱 재배포 포함)** | 24시간 | **4시간 이내** (DB 복구 2시간 + 앱 재배포 10~15분 + 여유 45~105분) |
| R2 미디어 파일 | 7일 (버저닝 적용 시) | 8시간 |
| 앱 코드 (Vercel) | 0 (git 이력) | 30분 (Vercel 이전 배포 재활성화) |
| Edge Function 코드 | 0 (git 이력) | 30분 (Supabase 재배포) |
| 설정 시크릿 | 즉시 무효화 | 1시간 (신규 키 발급·배포) |

### 장애 시나리오별 상세 RTO/RPO

| 장애 유형 | 근본 원인 | RPO | RTO | 복구 담당자 | 수동 개입 필요 |
|---|---|---|---|---|---|
| **DB 연결 불가** | Supabase 네트워크 끊김 또는 연결 풀 고갈 | 데이터 손실 없음 | 5~15분 (Supabase 상태 복구 대기) | Supabase 지원팀 | 아니오 (자동 복구) |
| **DB 데이터 손상** | 파티션 손상, 인덱스 깨짐, 또는 잘못된 UPDATE 쿼리 | 24시간 (일일 백업 기준, 좀더 보수적으로 사용자 피해 최소화) | 2~4시간 (PITR 복구 후 검증) | 개발자 | **예** (PITR 지점 선택, 데이터 검증) |
| **R2 객체 삭제** (녹화 파일) | 사용자 실수 또는 시스템 버그로 인한 객체 삭제 | 7일 (Object Versioning) 또는 24시간 (격리 버킷 백업) | 1~2시간 (버저닝 복원) | 개발자 | 경미 (Cloudflare 콘솔에서 버전 선택) |
| **설정 시크릿 노출** (API 키, DB 비밀번호) | git 커밋 누출, 로그 노출, 또는 인가 실패 | 즉시 무효화 | 1시간 (신규 키 발급·Secrets 업데이트·재배포) | 개발자 + 보안팀 | **예** (새 키 생성, 구 키 revoke 확인) |
| **Vercel 배포 장애** | 빌드 실패 또는 배포 네트워크 에러 | 0 (git 이력) | 5~30분 (재배포 또는 rollback) | 개발자 | 아니오 (자동 선택 가능) |
| **Edge Function 손상** | 배포 중 코드 오류 또는 종속성 깨짐 | 0 (git 이력) | 15~30분 (재배포) | 개발자 | 아니오 (git에서 복원) |
| **Supabase 서비스 전체 장애** | 리전 다운, DDoS, 또는 Supabase 인프라 문제 | 데이터 손실 없음 | 1~4시간 (Supabase SLA 99.9% 보장) | Supabase 지원팀 | 아니오 (대기) |
| **R2 서비스 장애** | Cloudflare 리전 다운 | 데이터 손실 없음 | 30분~2시간 (Cloudflare SLA 99.9%) | Cloudflare 지원팀 | 아니오 (대기 + 상태 페이지 모니터링) |

---

## §3 복구 절차

### 3.1 Supabase DB 복구

- **PITR 복구**: Supabase Dashboard → PITR → 시점 선택 → 복구 시작
- **pg_dump 복구**: `psql -h {host} -U postgres < backup.sql`

### 3.2 R2 파일 복구

- **버저닝 활성화 시**: Cloudflare R2 콘솔에서 이전 버전 복원
- **rclone 백업 복사 시**: `rclone copy backup-bucket: primary-bucket:`

### 3.3 Vercel 앱 복구

- **이전 Deployment 재활성화**: Vercel Dashboard → Deployments → Rollback

### 3.4 Edge Function 복구

- Supabase Edge Functions는 소스코드가 git에 있으므로 재배포

---

## §4 재해 시나리오별 대응

| 시나리오 | 영향 범위 | 대응 |
|---|---|---|
| Supabase DB 단일 테이블 손상 | 해당 테이블 데이터 | PITR 복구 or 최근 덤프 복원 |
| Supabase 서비스 장애 (전체) | 앱 전체 다운 | 상태 페이지 모니터링, 복구 대기 (SLA 99.9%) |
| R2 파일 실수 삭제 | 미디어 파일 | 버저닝 복원 or 백업 복사에서 복구 |
| Vercel 배포 장애 | 앱 접근 불가 | 이전 Deployment rollback |
| fal.ai 서비스 장애 | VGEN 기능만 중단 | 앱 운영 계속, VGEN 에러 메시지 표시 |

---

## §5 모니터링 + 알림

- **Supabase 상태 모니터링**: status.supabase.com (이메일 구독)
- **Vercel 상태**: vercel.com/status
- **백업 성공/실패 알림**: pg_cron 실행 결과를 audit_logs에 기록 + 실패 시 이메일 알림

---

## §6 복구 훈련 (월 2회)

**목적**: 백업 전략의 실효성을 검증하고, 실제 재해 발생 시 빠른 대응을 위해 월 2회 복구 드릴 실행.

**실행 스케줄**:
- **매월 1주차 금요일 14:00~15:00**: Staging DB PITR 복구 드릴 (기존)
- **매월 3주차 금요일 14:00~15:00**: 프로덕션 read-only PITR 테스트 (신규 — 2시간 RTO 검증)

### 6.1 Supabase DB 복구 드릴 (Staging 환경)

```
1. Supabase Dashboard (Staging) → Database → PITR 선택
2. 어제 시점 선택 → 복구 시작
3. 복구 완료 후 스테이징 앱 접속 확인
4. 데이터 무결성 검증 쿼리 실행:
   SELECT COUNT(*) FROM rooms;
   SELECT COUNT(*) FROM room_participants;
   SELECT COUNT(*) FROM vgen_jobs WHERE status = 'done';
5. 검증 성공 → 드릴 로그 기록 (docs/status/DR-DRILLS.md)
```

**소요 시간**: 5~10분  
**담당**: 개발자 1인  
**실패 시**: Slack #security-alerts 에스컬레이션

### 6.2 프로덕션 DB Read-Only PITR 테스트 (2시간 RTO 검증)

**목적**: 프로덕션 데이터 규모에서 PITR 복구 시간을 실측해 2시간 RTO 목표 달성 가능 여부 확인.
**특징**: 쓰기 작업 없이 read-only로 진행. 장애 시 즉시 롤백 가능.

```
1. Supabase Dashboard (Production) → Database → PITR 설정 진입
2. 복구할 시점 선택:
   - 예: 30분 전 시점 또는 어제 같은 시간대
   - 선택 이유: 프로덕션 중단 최소화 + 유의미한 데이터 규모 확보
3. PITR 복구 시작 및 소요시간 기록:
   - 예: "복구 시작: 14:00, 복구 완료: 14:28 (28분)"
4. 복구된 DB 연결 가능 상태 확인 (데이터 손상 검사):
   - SELECT COUNT(*) FROM rooms;
   - SELECT COUNT(*) FROM room_participants;
   - SELECT COUNT(*) FROM vgen_jobs WHERE status = 'done';
   - SELECT COUNT(*) FROM refund_disputes;
   (모든 행 수 확인, 이전 백업과 비교)
5. 검증 성공 → 즉시 롤백 (또는 복구 DB 삭제)
6. 드릴 로그 기록:
   - 복구 소요시간 + 검증 소요시간 = 전체 RTO
   - RTO가 2시간 이내인지 확인
```

**소요 시간**: 40~60분 (PITR 복구 30분 + 검증 10분 + 롤백 5분)  
**담당**: 개발자 1인  
**실패 시**: Slack #security-alerts 에스컬레이션  
**중요**: 프로덕션 write lock 또는 downtime 없음 (read-only 모드로 진행)

### 6.3 R2 파일 복구 드릴 (선택 항목, 격월)

```
1. Staging R2 버킷에 테스트 파일 업로드
2. 의도적으로 삭제
3. R2 Dashboard → Versions → 이전 버전 복원 → 성공 확인
4. 복사 성공 확인
```

**소요 시간**: 3~5분  
**주기**: 2개월마다 (월 번갈아 실행)

### 6.4 Secrets 복구 드릴 (선택 항목, 분기별)

```
1. 테스트용 Edge Function 시크릿 추가
2. Supabase 콘솔에서 확인 후 삭제
3. 암호화 백업(.env.backup.gpg)에서 복구 재현
4. 수동 재설정 프로세스 검증
```

**소요 시간**: 10~15분  
**주기**: 분기별 (매 3개월)

### 6.5 드릴 로그 및 보고

매월 드릴 후 docs/status/DR-DRILLS.md에 결과 기록:

```
## 2026-07-04 월 1회 드릴

| 항목 | 상태 | 소요시간 | 비고 |
|------|------|--------|------|
| DB PITR 복구 | PASS | 8분 | 스테이징 완전 복구 |
| 데이터 검증 쿼리 | PASS | 2분 | 모든 테이블 행 수 확인 |
| 결론 | PASS | — | RTO 4시간 달성 가능 |
```

---

## §7 MUST NOT

- ❌ 프로덕션 DB에서 직접 복구 테스트 실행
- ❌ 백업 파일을 public R2 버킷에 저장
- ❌ 백업 성공 여부 미확인 (자동화 후 알림 필수)
