---
tags: [fsm]
---

<!-- state-machines/_INDEX.md 참조: 추가 절차 -->
<!-- opencode: 2026-06-29 - C14/G-48: FLAGGED/ADMIN_REVIEW 상태 추가, C15: output_9x16_url pg_cron 정리 추가. Coded with OpenCode; high-cost model review recommended. -->

# 2. Vgen Job State Machine

## State Diagram

```
                  ┌────────────────┐
                  │     IDLE       │
                  │ (mode!='vgen') │
                  └────────┬───────┘
                           │ stageStore.mode='vgen'
                           ▼
                  ┌────────────────┐
                  │PROMPT_EDITING  │
                  │(section LWW collab)
                  │ HOST authz      │
                  └────────┬───────┘
                           │ host: triggerGenerate()
                           ▼
                  ┌────────────────┐
      ┌──────────→│  MODERATING    │──fail──┐
      │           │ (OpenAI check  │        │
      │           │  + dedup cache)│        │
      │           └────────┬───────┘        │
      │                    │                │
      │  cache hit         │ pass           ▼
      │  (0 credit)        │          ┌──────────┐
      └────────────────────┤          │  FAILED  │
                           ▼          └──────────┘
                  ┌────────────────┐
                  │  GENERATING    │
                  │ (fal.ai API,   │
                  │  polling/watch)│
                  └────────┬───────┘
                           │
                    ┌──────┴──────┐
                    │ timeout/err │
                    ▼             ▼
              ┌─────────┐   ┌──────────┐
               │ FAILED  │   │   DONE   │
               └─────────┘   │(result   │
                             │ ready)   │
                             └────┬─────┘
                                  │ format='9:16' 요청
                                  ▼
                         ┌─────────────────┐
                         │FORMAT_CONVERTING │
                         │(fal.ai crop/    │
                         │ resize job)     │
                         └────┬────────┬────┘
                              │        │
                        success│        │fail
                              ▼        ▼
                         ┌──────────┐  DONE
                         │DONE(9:16)│  (16:9, 원본유지)
                         └──────────┘

Post-moderation (비동기, DONE 이후):
                    ┌──────────┐
                    │   DONE   │
                    └────┬─────┘
                         │ post-moderation frame check
                         │ (3 frames @ t=0.25/0.5/0.75)
                         ▼
               ┌─────────────────┐
               │   FLAGGED       │ (C14·G-48·G-92: 사후 모더레이션)
               │ (status=        │
               │  'flagged')     │
               └────┬───────┬────┘
                    │       │
              사용자│       │ admin
             appeal │       │ (no appeal)
              제출  │       │
                    ▼       ▼
              ┌──────────────────┐
              │ APPEAL_PENDING   │ (G-92: 사용자 이의 신청)
              │ (status='flagged'│
              │ appeal_status=   │
              │ 'pending')       │
              └────┬────────┬────┘
                   │        │
            admin  │        │ admin
            approve │        │ reject
	                   ▼        ▼
	              ┌────────┐ ┌──────────────┐
	              │ DONE   │ │FLAGGED_FINAL │
	              │(복구)  │ │(비공개 확정) │
	              └────────┘ └──────────────┘
	              DB: status='flagged', appeal_status='rejected'
              
              또는 (appeal 제출 없이)
              
              admin reject without appeal
                    ▼
              ┌──────────────┐
              │FLAGGED_FINAL │
              │(비공개 확정) │
              └──────────────┘
```

## State Transitions

| From | To | Trigger | Source | Notes |
|------|-----|---------|--------|-------|
| IDLE | PROMPT_EDITING | User/Host opens Vgen panel | `vgenStore.openPanel()` → `stageStore.mode='vgen'` | section LWW prompt sync initialized |
| PROMPT_EDITING | IDLE | Close panel / mode reset | `stageStore.mode='normal'` or `'dub'` | ydoc/awareness retain for quick reopen |
| PROMPT_EDITING | MODERATING | Host clicks [생성 ▶] | `vgenStore.triggerGenerate(prompt)` | HOST-only; multi-user debounce applied |
| MODERATING | DONE | Dedup cache hit (same prompt hash) | SHA-256(prompt) → Supabase `vgen_jobs` lookup | Result reused; credit cost = 0; status='done' |
| MODERATING | FAILED | OpenAI Moderation API rejects prompt | `vgenStore.onModerationRejected(reason)` | Toast + reason logged; stageStore.mode stays 'vgen' |
| MODERATING | FAILED | Credit insufficient | `vgenStore.onInsufficientCredit()` | Check `creditBalance < job.credit_cost`; user shown balance & cost |
| MODERATING | GENERATING | Moderation pass + credit deducted | `vgenStore.startGenerating(jobId, prompt)` | `jobs[i].status='generating'`, `isGenerating=true` |
| GENERATING | DONE | fal.ai job completes (webhook or poll) | `vgenStore.onGenerationSuccess(jobId, result_url)` | `progress=100`, `result_url` set; sync via `room-authority` 'vgen_result' |
| GENERATING | FAILED | fal.ai API error / timeout (>120s) | `vgenStore.onGenerationError(jobId, reason)` | Retry logic: retry count ≤2; manual retry via UI |
| DONE | PROMPT_EDITING | User edits prompt again (multi-shot) | `vgenStore.editPrompt(newPrompt)` | Append new job to `jobs[]`; return to PROMPT_EDITING for refinement |
| DONE | FORMAT_CONVERTING | User clicks [세로형 변환 9:16] | `vgenStore.startFormatConversion(jobId, '9:16')` | Trigger fal.ai crop/resize job; `outputFormat='9:16'`, `output9x16Url=null` |
| FORMAT_CONVERTING | DONE | Conversion success (9:16 ready) | `vgenStore.onFormatConversionSuccess(jobId, output_9x16_url)` | Update `output9x16Url` with new 9:16 video; `outputFormat='9:16'` |
| FORMAT_CONVERTING | DONE | Conversion failed (fallback to 16:9) | `vgenStore.onFormatConversionError(jobId, reason)` | Retain original 16:9 URL; show toast "세로형 변환 실패. 원본 영상으로 진행합니다"; `outputFormat='16:9'` |
| FAILED | PROMPT_EDITING | User clicks "Retry" | `vgenStore.retryGeneration(jobId)` | If retry < 2, return to MODERATING; else show "Contact support" |
| DONE | FLAGGED | Post-moderation frame check flags content (C14·G-48) | `vgenStore.onPostModerationFlagged(jobId, categories)` | `status='flagged'` (not FAILED); async, non-blocking; admin review needed |
| FLAGGED | APPEAL_PENDING | User submits appeal (G-92) | `vgenStore.submitAppeal(jobId, reason)` | Insert `vgen_appeals` row with `status='pending'`; keep `vgen_jobs.status='flagged'`; set `vgen_jobs.appeal_status='pending'`; admin review pending, max 72h |
| FLAGGED | DONE | Admin approves content or appeal (Admin Review Console, G-47·G-92) | `adminStore.approveFlaggedJob(jobId)` | `status='done'` restored; credit refund NOT reversed (already deducted) |
| FLAGGED | FLAGGED_FINAL | Admin rejects content without appeal (Admin Review Console, G-47) | `adminStore.rejectFlaggedJob(jobId)` | Keep `status='flagged'`, set `appeal_status='rejected'`; refund only via explicit `refund-credit` policy decision |
| FLAGGED_FINAL | DONE | (N/A — permanent state, manual admin override only) | (Admin direct DB edit) | Conceptual final state; DB remains `status='flagged'` until rare recovery; require audit trail |
| APPEAL_PENDING | DONE | Admin approves appeal (Admin Review Console, G-92) | `adminStore.approveAppeal(appealId, jobId)` | Restore `status='done'`, set `appeal_status='approved'`, notify user via email "이의가 인용되었습니다" |
| APPEAL_PENDING | FLAGGED_FINAL | Admin rejects appeal (Admin Review Console, G-92) | `adminStore.rejectAppeal(appealId, jobId)` | Keep `status='flagged'`, set `appeal_status='rejected'`, user cannot access video |
| any | IDLE | Host leaves room / room ends | Supabase `room:host_left` or `room:ended` | Abort all active jobs; cleanup ydoc/awareness; notify other participants |

## FLAGGED 상태 정의 (G-92)

### 진입 조건
- 생성 완료 후 사후 모더레이션에서 기준 위반 감지 (3 frames @ t=0.25/0.5/0.75 검사)
- 또는 관리자가 수동으로 DONE → FLAGGED 전이

### FLAGGED 상태에서 사용자 액션

**Appeal 제출 불가능한 경우:**
- FLAGGED_FINAL 상태 (관리자가 appeal 거절)
- FLAGGED 상태이지만 appeal deadline 지남 (7일)

**Appeal 제출 가능:**
- FLAGGED 상태, 생성 후 7일 이내
- 사용자가 [이의 신청] 버튼 클릭
- 최소 20자 이상 사유 입력
- `vgen_appeals` 테이블 INSERT
- 상태 전이: FLAGGED → APPEAL_PENDING (`vgen_jobs.status='flagged'`, `appeal_status='pending'`)
- 관리자 검토 대기 (최대 72시간)

### APPEAL_PENDING 상태
- `vgen_jobs.status = 'flagged'`
- `vgen_jobs.appeal_status = 'pending'`
- `vgen_appeals.status = 'pending'`
- UI: "검토 중입니다. 최대 72시간 소요됩니다."
- 사용자에게 이메일 발송: "이의 신청이 접수되었습니다."

### 관리자 결정
- **Approve**: `vgen_jobs.status='done'`, 비공개 영상 공개 복구
- **Reject**: `vgen_jobs.status='flagged'`, `appeal_status='rejected'`, 영구 비공개 (개념상 FLAGGED_FINAL)

### FLAGGED 엣지케이스
- FLAGGED 상태에서 appeal 제출 없이 동영상 삭제 요청 → DELETED 상태로 전이
- FLAGGED 상태에서 방 공개 시도 → 403 에러 (공개 불가)
- FLAGGED_FINAL 상태에서 appeal 제출 시도 → 403 에러 + "더 이상 이의를 제기할 수 없습니다"

---

## Edge Cases

1. **Insufficient Credit**
   - User hits [생성 ▶] but `creditBalance < credit_cost` (e.g., cost=100, balance=50)
   - State: MODERATING → FAILED (reason: 'insufficient_credit')
   - UI shows "충전이 필요해요 (필요: 100, 보유: 50)" with credit store link
   - Job record saved with `status='failed'` for audit trail

2. **Moderation Rejection**
   - OpenAI Moderation API flags prompt (e.g., violence, hate speech)
   - State: MODERATING → FAILED (reason: 'moderation_rejected', flagged_categories: [...])
   - User sees: "이 프롬프트는 정책상 생성할 수 없어요" + flagged categories
   - Prompt NOT sent to fal.ai; credit NOT deducted

3. **Generation Timeout (fal.ai >120s)**
   - fal.ai polling/webhook silent >120s (API unreachable or hung job)
   - State: GENERATING → FAILED (reason: 'generation_timeout')
   - UI shows retry button; if user retries, new job ID issued (don't re-poll old job)
   - Old job marked `status='failed'` in DB; new job queued

4. **Host Leaves During Generation**
   - Host disconnects while `vgenStore.isGenerating=true`
   - State: GENERATING → FAILED (reason: 'host_disconnect')
   - Supabase `room:host_left` triggers `vgenStore.abortGeneration()`
   - Other participants notified via `room-authority` message
   - Job record kept; guest can NOT resume (Host-only trigger)

5. **Dedup Cache Hit (Zero-Credit Reuse)**
   - User submits identical prompt to one just completed
   - SHA-256(prompt) matches existing `vgen_jobs.prompt_hash`
   - State: MODERATING → DONE (skips fal.ai API call)
   - Result copied from cache record; `credit_cost=0` for this job
   - `progress=100` set immediately; no latency

6. **Concurrent Generation Requests (Multi-Host / Jitter)**
   - Two users rapid-click [생성 ▶] in same room (or same user double-click)
   - Debounce: `vgenStore.triggerGenerate()` ignores 2nd call if `isGenerating=true`
   - Only 1st request proceeds to MODERATING
   - 2nd call returns early (silent/toast: "이미 생성 중입니다")

7. **Prompt Edit During Generation**
   - User edits PROMPT_EDITING while sibling job still GENERATING
   - Zustand allows parallel editing (new prompt ≠ active job prompt)
   - New prompt queued as separate job (multi-shot workflow)
   - No state conflict; each job tracks independently by `jobId`

8. **Retry Limit Exceeded**
   - Job fails, user clicks "다시 시도" → retryCount increments
   - After 2nd retry failure, retryCount=3
   - State: FAILED (reason: 'max_retries_exceeded')
   - UI shows "생성에 실패했습니다. 고객지원에 문의하세요" + support link

9. **60초 쇼츠 4클립 순차 합성**
   - User selects `duration=60s` (or similar long-form) → backend detects `clip_count=4`
   - 각 클립 15초씩, 순차 생성: generate clip 1 → complete → append result → generate clip 2 → ...
   - State: GENERATING (4개 job 병렬 또는 순차; 진행도 = 완료_클립_수 / 4 × 100)
   - UI shows progress: "생성 중 (1/4 완료)" → "생성 중 (2/4 완료)" ... → "생성 중 (4/4 완료)"
   - 모든 클립 완료 후 합성: server-side concat (fal.ai concat API) 또는 메타데이터 저장 후 클라이언트 순차 재생
   - Final state: DONE with `clip_count=4`, `output_url` (concat 영상 또는 클립 배열)

10. **세로형 변환 실패 Fallback (9:16 → 16:9)**
    - User at DONE (16:9 original) clicks [세로형 변환]
    - State: DONE → FORMAT_CONVERTING → (fal.ai crop API call fails)
    - fal.ai API 에러 (e.g., invalid aspect_ratio, service unavailable)
    - Fallback: 원본 16:9 URL 유지, `outputFormat='16:9'`, `output9x16Url=null`
    - Toast: "세로형 변환 실패. 원본 영상으로 진행합니다"
    - State: FORMAT_CONVERTING → DONE (원본 유지, 사용자 재시도 가능)

11. **Offline Client Returns After FORMAT_CONVERTING**
    - Client may hold stale `outputFormat`/`generation_id`.
    - On reconnect, fetch `vgen_jobs` by `job_id` and compare `updated_at`, `status`, `output_format`, `output_9x16_url`.
    - DB snapshot always wins; local FORMAT_CONVERTING state is discarded if server is `done` or `failed`.
    - Emit toast only if visible result changed while offline.

12. **동시 생성 트리거 (2인 이상 동시 GENERATING 요청) — Race Condition C3**
    - 네트워크 지연 또는 double-click으로 같은 유저가 동시 요청: `triggerGenerate(prompt)` 2회
    - 또는 같은 방의 2명 호스트가 동시 요청 (권한 검증 후 1명만 호스트 유지)
    - **멱등성 키 (P2: 타임스탬프 단위 명시)**: 
      ```
      idempotency_key = SHA256(prompt_hash || user_id || room_id || floor(timestamp/10000)*10000)
      
      여기서:
      - timestamp: 밀리초(ms) 단위의 Date.now() 값 (예: 1719748000000)
      - 버킷 크기: 10000ms = 10초
      - floor(timestamp/10000)*10000: 타임스탬프를 10초 단위로 내림
        예) 1719748000000 → floor(171974800) * 10000 = 171974800 * 10000 = 1719748000000
        예) 1719748005000 → floor(171974800.5) * 10000 = 171974800 * 10000 = 1719748000000 (같은 버킷)
      ```
    - 10초 버킷 내 동일 프롬프트 요청:
      - 1차 요청 → idempotency_key INSERT + `credit_deducted_at = NOW()` + job_id_A 반환
      - 2차 요청 → idempotency_key UNIQUE 충돌 → 기존 job_id_A 반환 (ON CONFLICT DO NOTHING)
    - **결과**: 크레딧 1회만 차감, 생성 job은 1개 (shared result)
    - 클라이언트 store: 두 요청 모두 같은 job ID로 진행도 공유

13. **LiveKit Egress 중 방장 이탈 → 녹화 파일 불완전 (C5)**
    - 방장이 GENERATING 중 방을 나감 → LiveKit Egress 녹화 중단 → MP4 부분적 완성
    - fal.ai 생성은 완료했지만 egress 파일 손상 → 재생 불가 또는 프레임 누락
    - **해결책**:
      - Egress webhook `egress.ended` 수신 시 `validation_status='pending'` 상태로 저장
      - Edge Function: ffprobe 또는 MediaInfo로 moov atom·duration 검증
      - 검증 통과 → `validation_status='passed'` → DONE 진입 허용
      - 검증 실패 → `validation_status='failed'` → FAILED 전이 + 크레딧 환불 (보상 트랜잭션)
    - **DB 항목**: vgen_jobs.validation_status, vgen_jobs.egress_id

14. **R2 영상 저장 성공 + DB INSERT 실패 → 고아(orphan) R2 오브젝트 (C8)**
    - 3단계 업로드 흐름 중 R2 업로드는 성공했지만 `vgen_jobs` INSERT 실패
    - 결과 R2에는 고아 오브젝트 발생 (DB에 참조 없음, 스토리지만 차감)
    - **해결책**:
      - Cloudflare Workflows 보상 스텝: DB INSERT 실패 시 R2 DELETE 자동 실행
      - Step 순서: (1)credit 차감 (2)fal.ai 호출 (3)R2 업로드 (4)DB INSERT
      - 역순 보상: R2 DELETE 실패 → credit 환불, credit 차감 실패 → 이전 상태 복구
      - dedup 캐시(VGEN-05): `vgen_jobs.validation_status='passed'` 확정 후에만 `prompt_hash` 캐시 등록
      - 자동 정리 (pg_cron, 5분 간격): `status='FAILED'` 중 `result_url IS NOT NULL` → R2 DELETE 실행 후 `result_url=NULL` 업데이트
    - **DB 항목**: vgen_jobs.validation_status

## Admin Review Console (G-47)

FLAGGED 상태의 vgen_jobs를 관리자가 검토·승인·거절하는 콘솔 명세.

### 관리자 권한
- Supabase Auth + `is_admin = true` 플래그 (users 테이블에 P1에서 추가, 초기는 service role key로 수동)
- ponytail: 관리자 UI는 별도 라우트 `/admin/review`로 단순 테이블 형태. 복잡한 대시보드는 P2.

### 검토 항목
| 항목 | 표시 내용 |
|---|---|
| job_id | UUID |
| room_id | 방 ID |
| triggered_by | 요청자 display_name |
| prompt_snapshot | 모더레이션 검사 대상 프롬프트 |
| result_url | R2 서명 URL (관리자만 접근) |
| flagged_categories | OpenAI Vision 감지 카테고리 |
| flagged_frames | 3프레임 썸네일 (t=0.25/0.5/0.75) |
| created_at | 생성 시각 |

### 관리자 액션
- **승인**: `status='done'` 복원, 크레딧 환불 없음 (이미 차감됨)
- **거절**: `status='flagged'` 유지 + `appeal_status='rejected'`; 환불은 운영 정책에 따라 `refund-credit`로 명시 기록
- **보류**: `status='flagged'` 유지, 24시간 후 자동 거절 (pg_cron)

### RLS
```sql
-- vgen_jobs SELECT: is_admin=true 사용자만 FLAGGED 행 조회 가능
CREATE POLICY "admin_read_flagged" ON vgen_jobs FOR SELECT
  USING (
    status <> 'flagged'
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = true)
  );
```

### MUST NOT
- ❌ 관리자 아닌 사용자가 FLAGGED 행 조회 (RLS로 차단)
- ❌ 승인 시 크레딧 재차감 (이미 차감됨, 환불 역취소 금지)
- ❌ 거절을 `status='failed'`로 저장 (`failed`는 provider/validation/system 실패 전용)
- ❌ 환불 여부를 `refund-credit` 감사 기록 없이 잔액만 직접 수정

---

## Implementation Hints

- **Zustand store**: `vgenStore` (jobs[], isGenerating, progress, creditBalance, ydoc, awareness, outputFormat, output9x16Url, clipCount) ⊂ `useStageStore`
  - Action: `triggerGenerate(prompt)`, `startGenerating(jobId)`, `onGenerationSuccess(jobId, result_url)`, `onGenerationError(jobId, reason)`, `editPrompt(newPrompt)`, `retryGeneration(jobId)`, `abortGeneration()`, `openPanel()`, `closePanel()`, `startFormatConversion(jobId, format)`, `onFormatConversionSuccess(jobId, output_url)`, `onFormatConversionError(jobId, reason)`
  - New state: `outputFormat: '16:9' | '9:16'` (current output aspect ratio), `output9x16Url: string | null` (9:16 variant URL), `clipCount: number` (# of clips for 60s+)
  
- **Event source**:
  - `stageStore.mode`: 'normal' | 'vgen' | 'dub' (drives IDLE ↔ PROMPT_EDITING)
  - `room-authority` messages: `vgen_mode_open`, `vgen_mode_close`, `vgen_result` (multi-user sync)
  - Supabase `vgen_jobs` table: INSERT job record, UPDATE status/'generating'→'done'/'failed', SELECT for dedup cache
  - Supabase `room:host_left` / `room:ended` events (abort on host disconnect)

- **Moderation (VGEN-06)**:
  - **Prompt moderation**: OpenAI Moderation API (`openai.moderations.create({ input: prompt })`)
    - Flags: `'hate'`, `'hate/threatening'`, `'harassment'`, `'violence'`, `'violence/graphic'`, `'sexual'`, `'sexual/minors'`, `'self-harm'`, `'self-harm/intent'`, `'self-harm/instructions'`, `'illegal'`
    - If any flag=true, reject with reason; credit untouched
  - **Frame moderation** (VGEN-06, post-generation sample check):
    - Sample 3 frames at t=[0.25s, 0.5s, 0.75s] × total_duration from result video
    - Optional: Run frame through OpenAI Vision (`gpt-4-vision`) for safety re-check
    - If flagged, mark job as `status='flagged'` (not failed; admin review needed)
    - Implementation: async job (not blocking DONE state)

- **크레딧 차감 (PROMPT_EDITING → MODERATING → GENERATING) — Race Condition C3**:
  - **차감 타이밍**: MODERATING 통과 직후, GENERATING 진입 전 (모더레이션 실패 시 미차감)
  - **비관적 잠금**: Edge Function에서 `SELECT balance FROM credits WHERE user_id=? FOR UPDATE;` 실행
  - **멱등성 보장**:
    - `idempotency_key = SHA256(prompt_hash || user_id || room_id || floor(timestamp/10000)*10000)`
    - 10초 버킷 내 동일 요청은 기존 job 반환 (UNIQUE 충돌 시 `ON CONFLICT DO NOTHING`)
    - 크레딧 중복 차감 방지
  - **원자성**:
    - `BEGIN; INSERT INTO vgen_jobs (..., idempotency_key, credit_deducted_at=NOW()) VALUES (...) ON CONFLICT(idempotency_key) DO NOTHING; SELECT id INTO job_id FROM vgen_jobs WHERE idempotency_key = ? LIMIT 1; UPDATE credits SET balance -= cost WHERE user_id = ?; COMMIT;`
    - DO NOTHING으로 중복 INSERT 무시, 별도 SELECT로 기존 job_id 조회 (PK 갱신 회피)
    - 트랜잭션 실패 시 ROLLBACK (balance 자동 복구)
  - **보상 트랜잭션**:
    - fal.ai 호출 실패 → `credit_refunded_at = NOW()` + `balance += cost` 실행
    - `credit_transactions` 로그: `amount=+cost, reason='refund'`
  - **자동 환불** (pg_cron, 5분 주기):
    - `WHERE credit_deducted_at IS NOT NULL AND credit_refunded_at IS NULL AND credit_deducted_at < NOW()-120s AND status NOT IN ('done', 'failed', 'flagged')`
    - 120초 내 완료 없고 관리자 검토 상태도 아니면 자동 환불

- **DONE 진입 게이트 (C5·C8)**:
  DONE 상태 진입은 3가지 조건을 모두 만족할 때만 허용:
  1. `validation_status = 'passed'` (MP4 무결성 검증 통과)
  2. `result_url IS NOT NULL` (R2 오브젝트 확인)
  3. `credit_deducted_at IS NOT NULL` (크레딧 차감 완료)
  세 조건 모두 만족 시 `status='done'` 전이 가능. 하나라도 미충족 시 `status='failed'` + 크레딧 환불.

- **고아 R2 오브젝트 방지 (C8)**:
  - Cloudflare Workflows 스텝 순서 강제: (1)credits.balance 차감 (2)fal.ai 생성 호출 (3)R2 업로드 (4)DB vgen_jobs INSERT
  - 각 스텝 실패 시 역순 보상:
    - Step 4(INSERT) 실패 → Step 3(R2 DELETE) 실행 → Step 1(credit 환불)
    - Step 3(R2) 실패 → Step 1(credit 환불)
    - Step 1(credit) 실패 → 402 Payment Required 반환 (이전 상태 ROLLBACK)
  - dedup 캐시(VGEN-05) 연동:
    - `prompt_hash` 캐시 등록은 `validation_status='passed'` 확정 후에만 수행
    - 검증 대기(pending) 또는 실패(failed) 상태의 job은 캐시 대상 제외
    - 이를 통해 불완전한 영상이 캐시에서 재사용되는 것 방지
  - 자동 정리 (pg_cron, 5분 주기):
    - Query: `WHERE status='failed' AND result_url IS NOT NULL AND updated_at < NOW()-1hour`
    - Action: R2 DELETE → `result_url=NULL` UPDATE → audit log 기록
    - C15 해소: `output_9x16_url`도 동일 정리 대상에 포함
    - Query 확장: `WHERE status='failed' AND (result_url IS NOT NULL OR output_9x16_url IS NOT NULL) AND updated_at < NOW()-1hour`
    - Action: R2 DELETE (result_url + output_9x16_url 모두) → NULL UPDATE → audit log

- **Dedup Cache (VGEN-05)**:
  - Compute: `prompt_hash = SHA-256(prompt.trim().toLowerCase())`
  - Query: `SELECT result_url, credit_cost FROM vgen_jobs WHERE prompt_hash=? AND validation_status='passed' AND status='done' AND created_at > NOW()-7days LIMIT 1`
  - Cache TTL: 7 days (configurable)
  - On hit: copy result_url; set new job `credit_cost=0`, `status='done'`, `validation_status='passed'` (캐시된 결과는 이미 검증 완료)
  - On miss: proceed to fal.ai generation

- **Generation Polling vs Webhook** (VGEN-09):
  - **Webhook** (recommended):
    - fal.ai calls `POST /api/vgen/webhook` with `{ job_id, status, result_url, error }`
    - Requires public endpoint; ingest to Supabase `vgen_jobs` + emit LiveKit DataChannel 'vgen-result' message
    - Latency: <1s (real-time)
  - **Polling** (fallback):
    - `setInterval(() => fal.queue.status(jobId))` every 2s
    - Check `status` field; on completion, call `vgenStore.onGenerationSuccess()`
    - Latency: up to 2s jitter; recommend abort if >120s cumulative
  - **Hybrid**: Start webhook listener; if no callback in 60s, fall back to polling (resilience)

- **Side effects**:
  - PROMPT_EDITING: Initialize section LWW prompt state, attach `room-authority` `vgen_prompt_patch` handler
  - MODERATING: Deduct `credit_cost` from `creditBalance` after moderation pass (before API call, pessimistic lock)
  - GENERATING: Set `isGenerating=true`, reset `progress=0`; emit `room-authority` 'vgen_result' message on completion
  - GENERATING (60s+ multi-clip): For each clip i in 0..clipCount-1: `progress = i / clipCount * 100`; queue fal.ai job; await; aggregate results; final concat
  - DONE: `progress=100`, emit 'vgen_result' with `result_url`; trigger result playback (VGEN-04: replace mainView source)
  - FORMAT_CONVERTING: `isConverting=true`, show spinner; call Supabase Edge Function `vgen-format-convert` (server owns FAL_KEY). Note: temporary in-memory `output_url` (fal.ai 변환 결과) ≠ persistent DB `result_url` (R2 signed URL)
  - FORMAT_CONVERTING → DONE (success): Update DB `result_url` with converted video URL (또는 별도 `output_9x16_url` 컬럼), `outputFormat='9:16'`; emit 'format_converted' event; show result preview
  - FORMAT_CONVERTING → DONE (fail): Retain `output9x16Url=null`, `outputFormat='16:9'` (fallback); show toast; `isConverting=false`
  - FAILED: `isGenerating=false`, append error reason to job record; notify user via toast + retry UI
  - IDLE (cleanup): Clear prompt editors/patch timers and abort any pending fal.ai polling timers

## VGEN-11 세로형 쇼츠 포맷 명세

- **출력 해상도**: 9:16 portrait format (예: 1080×1920, 1080px 기준)
  - Primary format: 16:9 landscape (original fal.ai output) → DB `result_url`
  - Secondary format: 9:16 portrait (on-demand crop/resize via fal.ai) → DB `output_9x16_url` (nullable, generated on-demand)
  - Multi-variant: DB `result_url` (16:9 primary) + `output_9x16_url` (9:16 secondary, optional). Note: 임시 `output_url` 변수는 FORMAT_CONVERTING 중 메모리에만 존재하며, 최종 저장은 위 두 컬럼으로 이루어짐

- **클립 제한**: 최대 15초/클립
  - Single clip: ≤15s → 1개 output (16:9 primary ± 9:16 secondary)
  - 60초 쇼츠: 4개 클립 × 15초 = 총 60초 (각 클립 독립 생성)
  - Extensible: `clipCount = ceil(duration_ms / 15000)`

  - **60초 쇼츠 합성 전략**:
    - **Server-side concat** (권장):
    - 4개 클립 순차 생성: Edge Function/Workflow 내부에서 provider adapter 호출 → append result_url
    - 진행도 tracking: `progress = (i+1) / 4 * 100` (1→25%, 2→50%, 3→75%, 4→100%)
    - Concat job: Edge Function/Workflow 내부 provider adapter concat → final `output_url`
  - **Client-side sequential playback** (lite):
    - Store 4개 `clip_url[]` in metadata
    - Player: loop playback clip 0 → 1 → 2 → 3 (no server concat, UX 약간 끊김)

- **포맷 변환 (DONE → FORMAT_CONVERTING)**:
  - User clicks [세로형 변환 9:16] → `vgenStore.startFormatConversion(jobId, '9:16')`
  - Call: Supabase Edge Function `vgen-format-convert` (server owns provider key)
  - Success: `output_9x16_url = result.url`, `outputFormat = '9:16'`
  - Failure: fallback `outputFormat = '16:9'`, toast "세로형 변환 실패. 원본 영상으로 진행합니다"
  - Idempotent: if `output_9x16_url` already set, skip API call; return cached result

- **DB 스키마** (`vgen_jobs` table extensions):
  - `output_9x16_url: text | null` — 9:16 variant video URL (nullable; generated on-demand)
  - `output_format: enum('16:9', '9:16')` — current output aspect ratio
  - `clip_count: integer` — # of clips for multi-clip shōrtsu (default 1)
  - `clip_urls: json | null` — array of individual clip URLs (for client-side playback fallback)
  - `format_conversion_status: enum('pending', 'done', 'failed') | null` — tracks FORMAT_CONVERTING state

- **UI/UX**:
  - Result preview: Primary display = 16:9 landscape
  - [세로형 변환] button (visible on DONE state): triggers FORMAT_CONVERTING → show spinner
  - On success: toggle to 9:16 preview; option to switch aspect ratio
  - On failure: show toast + remain on 16:9
  - Progress display (multi-clip): "생성 중 (2/4 완료)" during GENERATING phase
