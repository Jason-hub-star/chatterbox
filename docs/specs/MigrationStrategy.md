---
tags: [spec]
---

> G-135 산출 문서. Supabase 마이그레이션 워크플로 및 제로다운타임 패턴.

# Supabase 마이그레이션 전략

## 개요

Supabase는 PostgreSQL 기반이므로 표준 마이그레이션 도구(`supabase migration`)를 사용합니다.  
본 문서는 로컬 개발 → staging → 프로덕션 배포 시 마이그레이션 관리 방법과 **제로다운타임** 패턴을 정의합니다.

---

## 1. 마이그레이션 기본 워크플로

### 1.1 마이그레이션 파일 생성

```bash
# 새 마이그레이션 파일 생성
supabase migration new add_users_table

# 생성 결과: supabase/migrations/{timestamp}_add_users_table.sql
```

생성된 파일:
```sql
-- supabase/migrations/20260630_093000_add_users_table.sql

-- 마이그레이션 UP (적용)
-- 스키마 변경, 테이블 생성, 인덱스 추가 등

CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON public.users(email);
```

### 1.2 로컬 개발에서 적용

```bash
# 로컬 Supabase 인스턴스에 적용
supabase db push

# 결과: 마이그레이션 적용 완료, supabase/migrations 디렉토리 추적
```

### 1.3 staging/production 배포

```bash
# Linked 프로젝트(staging/production)에 적용
supabase db push --linked

# 프롬프트: "Are you sure you want to push to {PROJECT_ID}?"
# → "y" 입력하여 확인
```

---

## 2. 롤백 전략 (DOWN 마이그레이션)

Supabase는 **자동 DOWN 마이그레이션을 지원하지 않습니다.**  
대신 수동 롤백 SQL 파일을 작성하고, **PR 리뷰 시 필수 확인 항목**으로 추가합니다.

### 2.1 수동 롤백 파일 작성 및 PR 리뷰 체크리스트

**PR에 마이그레이션 파일이 포함되면, 리뷰어는 다음을 반드시 확인:**

- [ ] UP 마이그레이션 파일 (`*_add_users_table.sql`) 존재
- [ ] **대응하는 DOWN 마이그레이션 파일 (`*_add_users_table_down.sql`) 존재**
- [ ] DOWN 파일에서 UP의 모든 변경이 역순으로 롤백되는지 확인
- [ ] DOWN 파일에서 CASCADE 삭제로 인한 데이터 손실이 의도인지 확인
- [ ] 배치 UPDATE 포함 시, 실패 복구 로그 테이블도 함께 생성되는지 확인

**리뷰자 코멘트 예시:**
```
❌ DOWN 마이그레이션 파일이 없습니다.
`20260630_093000_add_users_table_down.sql` 파일 추가 후 승인 가능합니다.
```

### 2.2 수동 롤백 파일 작성

```bash
# UP 마이그레이션이 있으면
# supabase/migrations/20260630_093000_add_users_table.sql

# 이와 동일 디렉토리에 DOWN 파일 생성
# supabase/migrations/20260630_093000_add_users_table_down.sql
```

```sql
-- supabase/migrations/20260630_093000_add_users_table_down.sql

-- 마이그레이션 롤백 (UP의 역순)
DROP INDEX IF EXISTS idx_users_email;
DROP TABLE IF EXISTS public.users;
```

### 2.2 롤백 실행 (긴급)

```bash
# 프로덕션에서 롤백 필요 시
# 1) SQL 에디터에서 _down.sql 내용 복붙 실행 (Supabase 대시보드)
# 또는
# 2) psql로 직접 실행
psql $SUPABASE_PROD_URI -f supabase/migrations/20260630_093000_add_users_table_down.sql
```

**주의:** 자동 롤백 불가능 → 수동 검토 필수 → staging에서 미리 테스트.

---

## 3. 드리프트 감지 (Schema Drift)

프로덕션 DB에서 마이그레이션 파일과 실제 스키마가 불일치할 수 있습니다.

### 3.1 드리프트 확인

```bash
# 마이그레이션 파일과 실제 스키마 비교
supabase db diff --linked

# 출력 예:
# CREATE TABLE ... (마이그레이션에 없음)
# ALTER TABLE ... (마이그레이션과 다름)
```

### 3.2 드리프트 해소

**옵션 A: 드리프트 포함 마이그레이션 생성**
```bash
# 현재 상태를 기준으로 새 마이그레이션 생성
supabase db diff --linked > supabase/migrations/20260630_fix_drift.sql

# 검토 후 push
supabase db push --linked
```

**옵션 B: 수동 SQL 작성**
```bash
supabase migration new fix_schema_drift

# supabase/migrations/20260630_fix_schema_drift.sql 편집
# → CREATE TABLE, ALTER TABLE 등 직접 작성
```

---

## 4. 제로다운타임 컬럼 추가 (Zero-Downtime Pattern)

프로덕션에서 NOT NULL 컬럼을 추가하는 경우, 다음 3단계로 진행합니다.

### 4.1 패턴: 3단계 마이그레이션

#### 단계 1: NULL을 허용하는 컬럼 추가

```sql
-- supabase/migrations/20260630_100000_add_user_subscription_step1.sql

ALTER TABLE public.users
ADD COLUMN subscription_plan TEXT DEFAULT 'free';
-- 기본값이 있으므로 INSERT 시 자동 채워짐
```

적용 후:
- 기존 행: `subscription_plan = 'free'` (자동 채워짐)
- 신규 행: `subscription_plan = 'free'` (기본값)
- **다운타임 없음**

#### 단계 2: 배치 UPDATE (대용량 테이블)

큰 테이블일 경우, 1000행씩 배치 업데이트:

```sql
-- supabase/migrations/20260630_101000_add_user_subscription_step2.sql

-- 배치 크기 1000행
DO $$
DECLARE
  batch_size INT := 1000;
  total_rows INT;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM public.users WHERE subscription_plan IS NULL;
  
  WHILE total_rows > 0 LOOP
    UPDATE public.users
    SET subscription_plan = 'free'
    WHERE id IN (
      SELECT id FROM public.users 
      WHERE subscription_plan IS NULL 
      LIMIT batch_size
    );
    
    GET DIAGNOSTICS total_rows = ROW_COUNT;
  END LOOP;
END $$;
```

**이점:**
- 한 번에 모든 행을 잠글 필요 없음
- 동시 요청 가능
- 큰 테이블도 안전하게 업데이트

### 배치 UPDATE 실패 시 대응

배치 실행 중 타임아웃, 디스크 풀, 또는 권한 오류로 실패할 수 있습니다.

**자동 로그 + alert 절차:**

```sql
-- supabase/migrations/20260630_101500_add_migration_log_table.sql
-- (선택) 마이그레이션 상태 추적 테이블

CREATE TABLE IF NOT EXISTS public.migration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_name TEXT NOT NULL,
  status TEXT DEFAULT 'started', -- 'started', 'failed', 'completed'
  error_message TEXT,
  rows_processed INT DEFAULT 0,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  UNIQUE(migration_name)
);

-- 마이그레이션에서 상태 기록
DO $$
DECLARE
  batch_size INT := 1000;
  total_rows INT;
  processed INT := 0;
BEGIN
  INSERT INTO migration_logs (migration_name, status)
  VALUES ('add_user_subscription_step2', 'started')
  ON CONFLICT (migration_name) DO UPDATE SET started_at = NOW();
  
  BEGIN
    SELECT COUNT(*) INTO total_rows FROM public.users WHERE subscription_plan IS NULL;
    
    WHILE total_rows > 0 LOOP
      UPDATE public.users
      SET subscription_plan = 'free'
      WHERE id IN (
        SELECT id FROM public.users 
        WHERE subscription_plan IS NULL 
        LIMIT batch_size
      );
      
      processed := processed + FOUND::int;
      GET DIAGNOSTICS total_rows = ROW_COUNT;
    END LOOP;
    
    UPDATE migration_logs
    SET status = 'completed', rows_processed = processed, completed_at = NOW()
    WHERE migration_name = 'add_user_subscription_step2';
    
  EXCEPTION WHEN OTHERS THEN
    UPDATE migration_logs
    SET status = 'failed', error_message = SQLERRM
    WHERE migration_name = 'add_user_subscription_step2';
    
    -- 재발생하여 배포 중단
    RAISE;
  END;
END $$;
```

**실패 감지 + 수동 대응:**

1. 배포 스크립트에서 `migration_logs` 조회:
   ```bash
   # 배포 후 스크립트
   STATUS=$(psql $SUPABASE_PROD_URI -t -c "SELECT status FROM migration_logs WHERE migration_name='add_user_subscription_step2'")
   if [ "$STATUS" == "failed" ]; then
     # Slack 알림
     curl -X POST $SLACK_WEBHOOK -d '{"text": "Migration failed: add_user_subscription_step2"}'
     exit 1
   fi
   ```

2. 실패 확인 후 수동 조사:
   ```bash
   psql $SUPABASE_PROD_URI -c "SELECT * FROM migration_logs WHERE migration_name='add_user_subscription_step2'"
   ```

3. 원인 파악 후 재실행 또는 롤백 결정

#### 단계 3: NOT NULL 제약 추가

```sql
-- supabase/migrations/20260630_102000_add_user_subscription_step3.sql

ALTER TABLE public.users
ALTER COLUMN subscription_plan SET NOT NULL;

-- 필요시 기본값 제거
ALTER TABLE public.users
ALTER COLUMN subscription_plan DROP DEFAULT;
```

이 시점에는 모든 행이 NOT NULL 값을 가지므로 실패하지 않음.

### 4.2 적용 타이밍

| 단계 | 적용 환경 | 타이밍 |
|---|---|---|
| 1 | dev → staging | 릴리스 전 일주일 (배치 UPDATE 확인) |
| 2 | staging | 실제 배치 크기 검증 (최대 30분 예상) |
| 3 | staging | 배치 완료 후 즉시 |
| 1-3 | production | 프로덕션 배포 시간대(트래픽 적은 시간) |

---

## 5. 마이그레이션 파일 네이밍 컨벤션

### 5.1 파일명 형식

```
supabase/migrations/{timestamp}_{description}.sql
```

**타임스탬프:** `YYYYMMDDHHmmss` (Supabase 자동 생성)

**설명(description):**
- snake_case 사용
- 영어만 (한글 금지)
- 동사 + 대상: `add_users_table`, `drop_old_sessions`, `alter_room_schema`

### 5.2 파일명 예시

```
supabase/migrations/20260630_093000_add_users_table.sql
supabase/migrations/20260630_093100_create_rooms_table.sql
supabase/migrations/20260630_093200_add_subscription_plan_to_users_step1.sql
supabase/migrations/20260630_093300_add_subscription_plan_to_users_step2.sql
supabase/migrations/20260630_093400_add_subscription_plan_to_users_step3.sql
supabase/migrations/20260630_093500_add_room_participants_table.sql
supabase/migrations/20260630_093600_add_dub_sessions_table.sql
```

---

## 6. 실제 마이그레이션 예시

### 6.1 rooms 테이블 생성

```sql
-- supabase/migrations/20260630_093100_create_rooms_table.sql

CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  password TEXT,
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rooms_host_id ON public.rooms(host_id);
CREATE INDEX idx_rooms_created_at ON public.rooms(created_at DESC);

-- 업데이트 시간 자동 갱신
CREATE OR REPLACE FUNCTION update_rooms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rooms_updated_at_trigger
BEFORE UPDATE ON public.rooms
FOR EACH ROW
EXECUTE FUNCTION update_rooms_updated_at();
```

### 6.2 room_participants 테이블 생성

```sql
-- supabase/migrations/20260630_093500_add_room_participants_table.sql

CREATE TABLE IF NOT EXISTS public.room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'actor', -- 'actor', 'viewer', 'guest'
  slot_index INT,
  is_muted BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  UNIQUE(room_id, user_id)
);

CREATE INDEX idx_room_participants_room_id ON public.room_participants(room_id);
CREATE INDEX idx_room_participants_user_id ON public.room_participants(user_id);
```

### 6.3 제로다운타임: 컬럼 추가

```sql
-- Step 1: STEP 추가 (기본값 포함)
-- supabase/migrations/20260630_104000_add_subscription_status_step1.sql
ALTER TABLE public.users
ADD COLUMN subscription_status TEXT DEFAULT 'inactive';

-- Step 2: 배치 업데이트 (필요시)
-- supabase/migrations/20260630_104100_add_subscription_status_step2.sql
DO $$
DECLARE
  batch_size INT := 1000;
BEGIN
  UPDATE public.users
  SET subscription_status = 'active'
  WHERE created_at > NOW() - INTERVAL '7 days'
  AND subscription_status IS NULL
  LIMIT batch_size;
END $$;

-- Step 3: NOT NULL 제약 추가
-- supabase/migrations/20260630_104200_add_subscription_status_step3.sql
ALTER TABLE public.users
ALTER COLUMN subscription_status SET NOT NULL;
```

---

## 7. 마이그레이션 배포 체크리스트

| 항목 | 설명 |
|---|---|
| **로컬 테스트** | `supabase db push` → 로컬 성공 확인 |
| **git 커밋** | migrations 디렉토리 포함 → git add & commit |
| **staging 배포** | `supabase db push --linked` (staging 프로젝트) |
| **staging 검증** | staging 앱에서 기능 동작 확인 |
| **롤백 테스트** | _down.sql 또는 수동 SQL로 롤백 가능 확인 |
| **production 배포** | `supabase db push --linked` (prod 프로젝트) → 트래픽 저시간 선택 |
| **모니터링** | 배포 후 1시간 에러율, 성능 모니터링 |

---

## 8. MUST NOT

- ❌ **프로덕션에서 직접 ALTER TABLE ... NOT NULL** — 제로다운타임 3단계 패턴 필수
- ❌ **마이그레이션 파일 편집 후 재적용** — 한번 적용된 마이그레이션은 수정하지 않음. 새 마이그레이션 생성
- ❌ **DOWN 마이그레이션 없이 배포** — 최소한 수동 롤백 SQL 준비
- ❌ **대용량 테이블 한 번에 UPDATE** — 배치 크기 1000행 이하로 분할
- ❌ **Supabase 대시보시 SQL 에디터에서 직접 변경** — 항상 마이그레이션 파일로 관리
- ❌ **마이그레이션 타임스탬프 수동 변경** — Supabase 자동 생성 타임스탬프 유지

---

## 9. 고급: 마이그레이션 순서 관리

여러 마이그레이션이 동시 커밋된 경우, 실행 순서 확인:

```bash
# 마이그레이션 실행 히스토리 확인
supabase migration list

# 출력:
# Migration ID          | Name                          | Status
# 20260630093000        | add_users_table               | Applied
# 20260630093100        | create_rooms_table            | Applied
# 20260630093500        | add_room_participants_table   | Applied
```

순서는 **타임스탬프 기준**으로 자동 정렬됨.

---

## 10. 참고 문서

- [Supabase CLI 문서](https://supabase.com/docs/guides/cli/managing-databases)
- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
- `PLATFORM-ARCHITECTURE.md §2.4` (환경 분리 설정)
