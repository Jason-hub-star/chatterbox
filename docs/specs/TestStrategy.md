---
tags: [spec]
---

# 테스트 전략 (TestStrategy)

## §1 테스트 전략 개요

### 목표
- **3층 테스트**: 단위(Unit) + 통합(Integration) + E2E
- **Coverage 목표**: 전체 70% 이상
  - 단위 테스트: 80% (순수 로직, 유틸, 상태 관리)
  - 통합 테스트: 60% (RLS, Edge Function, 동시성)
  - E2E 테스트: Critical path only (회원가입, 방 생성/입장, VGEN 생성, safety gate)

### 핵심 원칙
- **테스트가 구현보다 먼저 깨져야 한다**: False positive를 방지하기 위해, 테스트는 실제 버그를 감지해야지 거짓 경보를 내면 안 됨
- **프로덕션 서비스 사용 금지**: test project와 mock으로만 검증
- **모바일 고려**: Playwright는 모바일 viewport도 포함

---

## §2 도구 선택

| 계층 | 도구 | 이유 |
|------|------|------|
| **단위/통합** | Vitest | Vite 네이티브, Jest 호환, 빠른 속도, 번들 검사 불필요 |
| **E2E** | Playwright | 멀티 브라우저, WebRTC 지원, fake webcam/mic |
| **Supabase Mock** | @supabase/supabase-js mock + test project | 통합 테스트는 실제 test DB (RLS 검증), 단위 테스트는 in-memory mock |
| **LiveKit Mock** | jest.mock() 또는 @livekit/components-react mock provider | 실 WebRTC 불필요, token 생성만 검증 |
| **PixiJS Mock** | canvas mock (jest-canvas-mock 또는 jsdom) | WebGL 없으므로 가벼운 mock으로 충분 |
| **외부 API Mock** | MSW (Mock Service Worker) | fal.ai, 네트워크 요청 일관성 있게 처리 |

---

## §3 단위 테스트 범위 및 예시

### 범위
- **Zustand 스토어**: 상태 액션, 계산 로직 (stageStore, vgenStore, roomStore)
- **유틸 함수**: 크레딧 계산, 날짜 포맷, 텍스트 sanitize, URL validation
- **React 컴포넌트** (렌더링만): ChatMessage, RoomCard, CreditDisplay
- **상태머신**: 전이 규칙 (if implemented as pure functions)

### 코드 예시: Zustand 스토어 테스트

```typescript
// vgenStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useVgenStore } from '@/stores/vgenStore'

describe('vgenStore', () => {
  beforeEach(() => {
    const { resetStore } = useVgenStore.getState()
    resetStore()
  })

  it('should deduct credits on VGEN request', () => {
    const store = useVgenStore.getState()
    store.setUserCredits(100)
    
    store.requestVgen({ prompt: 'test prompt' })
    
    expect(store.userCredits).toBe(100 - 5) // 5 credits per VGEN
    expect(store.vgenJobs[0].status).toBe('queued')
  })

  it('should prevent VGEN request when credits are 0', () => {
    const store = useVgenStore.getState()
    store.setUserCredits(0)
    
    const result = store.requestVgen({ prompt: 'test' })
    
    expect(result).toEqual({ error: 'Insufficient credits' })
    expect(store.vgenJobs).toHaveLength(0)
  })
})
```

### 코드 예시: 유틸 함수 테스트

```typescript
// utils/credit.test.ts
import { describe, it, expect } from 'vitest'
import { calculateCreditCost, isCreditsEnough } from '@/utils/credit'

describe('creditUtils', () => {
  it('should calculate VGEN cost as 5 credits', () => {
    expect(calculateCreditCost('vgen')).toBe(5)
  })

  it('should return true when user has enough credits', () => {
    expect(isCreditsEnough(100, 'vgen')).toBe(true)
    expect(isCreditsEnough(5, 'vgen')).toBe(true)
    expect(isCreditsEnough(4, 'vgen')).toBe(false)
  })
})
```

---

## §4 통합 테스트 범위 및 예시

### 범위
- **Supabase RLS 정책**: 방 접근 권한, 크레딧 읽기/쓰기, 채팅 메시지 필터링
- **Edge Function 단독**: `livekit-token`, `verify-invite-code`, `accept-invite`, `send-chat`, `create-report`, `data-export-request`
- **크레딧 차감 동시성**: `FOR UPDATE` 잠금이 실제로 동작하는지
- **인증 플로우**: 비인증 사용자의 서비스 제한 확인

### 코드 예시: Supabase RLS 통합 테스트

```typescript
// supabase-rls.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const testProjectUrl = process.env.SUPABASE_TEST_URL!
const testServiceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!
const testAnonKey = process.env.SUPABASE_TEST_ANON_KEY!

describe('Supabase RLS', () => {
  let testUserId: string
  let appUserId: string
  let testRoomId: string

  beforeAll(async () => {
    // test user 생성 (service role로만 가능)
    const supabase = createClient(testProjectUrl, testServiceKey)
    const { data: user } = await supabase.auth.admin.createUser({
      email: 'test-rls@example.com',
      password: 'TestPass123!',
      email_confirmed: true,
    })
    testUserId = user!.id

    const { data: appUser } = await supabase
      .from('users')
      .insert([{ auth_id: testUserId, email: 'test-rls@example.com', display_name: 'RLS Tester' }])
      .select('id')
      .single()
    appUserId = appUser!.id

    // test room 생성
    const { data: room } = await supabase
      .from('rooms')
      .insert([{ host_id: appUserId, title: 'RLS Test Room', max_participants: 5 }])
      .select()
      .single()
    testRoomId = room!.id
  })

  it('should allow room owner to read own room', async () => {
    const anonClient = createClient(testProjectUrl, testAnonKey, {
      global: { headers: { Authorization: `Bearer ${await getTestToken(testUserId)}` } },
    })

    const { data, error } = await anonClient
      .from('rooms')
      .select('*')
      .eq('id', testRoomId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('should prevent non-owner from deleting room', async () => {
    const otherUserId = 'other-user-id'
    const anonClient = createClient(testProjectUrl, testAnonKey, {
      global: { headers: { Authorization: `Bearer ${await getTestToken(otherUserId)}` } },
    })

    const { error } = await anonClient
      .from('rooms')
      .delete()
      .eq('id', testRoomId)

    expect(error?.code).toBe('42501') // PostgreSQL permission denied
  })
})
```

### 코드 예시: Edge Function 테스트

```typescript
// edge-functions/livekit-token.test.ts
import { describe, it, expect } from 'vitest'
import { generateLiveKitToken } from '@/api/livekit-token'

describe('livekit-token Edge Function', () => {
  it('should generate valid token for authenticated user', async () => {
    const token = await generateLiveKitToken({
      userId: 'user-123',
      roomName: 'test-room',
    })

    expect(token).toBeTruthy()
    expect(token).toMatch(/^ey/) // JWT format
  })

  it('should reject request without user ID', async () => {
    const result = await generateLiveKitToken({
      userId: '',
      roomName: 'test-room',
    })

    expect(result).toEqual({ error: 'Missing userId' })
  })
})
```

---

## §5 E2E 테스트 범위 (Critical path only)

### Critical User Journeys
1. **AUTH-01~03**: 회원가입 → 이메일 인증 → 로그인
2. **ROOM-01**: 방 생성 → 입장 → 퇴장
3. **VGEN-01**: VGEN 생성 요청 → 상태 폴링 → 완료 확인
4. **CREDIT-01**: 크레딧 0일 때 VGEN 차단
5. **CHAT-01**: 채팅 송수신 (WebRTC 연결 후)
6. **SAFETY-01**: 신고 생성 → evidence snapshot → 처리 상태 조회
7. **SAFETY-02**: 차단 사용자와 같은 방 입장/토큰 발급 차단
8. **AGE-01**: age gate 미완료 사용자의 방·데모·녹화·DUB 진입 차단
9. **CONSENT-01**: 녹화/DUB 동의 미완료 시 start-recording/start-dub-compositing 차단
10. **ACCOUNT-01**: data export 요청 single-use 링크 + soft delete 30일 유예 표시

### Playwright 설정

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // WebRTC는 시리얼 필요
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // 가짜 카메라/마이크 활성화
    launchArgs: ['--use-fake-device-for-media-stream'],
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

### 코드 예시: 로그인 E2E 테스트

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('AUTH: Sign up → Verify Email → Login', () => {
  test('AUTH-01: Sign up with valid email', async ({ page }) => {
    await page.goto('/')
    await page.click('text=Sign Up')
    
    await page.fill('input[type="email"]', 'e2e-test@example.com')
    await page.fill('input[type="password"]', 'TestPass123!')
    await page.click('button:has-text("Create Account")')

    await expect(page).toHaveURL(/verify-email/)
  })

  test('AUTH-02 & AUTH-03: Verify email and login', async ({ page }) => {
    // (이전 회원가입 후)
    // 실제 테스트 환경에서는 Supabase 이메일 확인 메일을 가로채거나
    // test token으로 직접 검증 상태 표시
    await page.goto('/verify-email?token=fake-token')
    
    // 또는 API로 directly confirm
    await page.request.post('/api/verify-email', {
      data: { token: 'test-token-from-db' },
    })

    await page.goto('/login')
    await page.fill('input[type="email"]', 'e2e-test@example.com')
    await page.fill('input[type="password"]', 'TestPass123!')
    await page.click('button:has-text("Login")')

    await expect(page).toHaveURL('/dashboard')
  })
})
```

### 코드 예시: VGEN 생성 E2E 테스트

```typescript
// tests/e2e/vgen.spec.ts
import { test, expect } from '@playwright/test'

test.describe('VGEN-01: Create VGEN and poll status', () => {
  test('should request VGEN and show loading state', async ({ page }) => {
    await page.goto('/create-vgen')
    
    await page.fill('textarea[name="prompt"]', 'Create a video of a person dancing')
    await page.click('button:has-text("Generate")')

    // 요청 직후 로딩 상태 확인
    await expect(page.locator('text=Generating...')).toBeVisible()
  })

  test('should show completion when VGEN finishes', async ({ page }) => {
    // fal.ai mock 설정 (test 환경)
    await page.route('**/api/fal/proxy', route => {
      route.abort('blockedbyresponse')
    })

    await page.goto('/create-vgen')
    await page.fill('textarea[name="prompt"]', 'Test prompt')
    await page.click('button:has-text("Generate")')

    // 폴링 시뮬레이션: status가 'completed'로 변할 때까지 대기
    await expect(page.locator('[data-test="vgen-status"]')).toHaveText('completed', {
      timeout: 10000,
    })
    
    await expect(page.locator('video')).toBeVisible()
  })

  test('CREDIT-01: should block VGEN when credits are 0', async ({ page }) => {
    // 크레딧을 0으로 세팅 (direct API call)
    await page.request.post('/api/set-user-credits', {
      data: { credits: 0 },
    })

    await page.goto('/create-vgen')
    await page.fill('textarea[name="prompt"]', 'Test')
    await page.click('button:has-text("Generate")')

    await expect(page.locator('text=Insufficient credits')).toBeVisible()
  })
})
```

---

## §6 Mock 전략

### fal.ai Mock (MSW)

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.post('*/api/fal/proxy', async ({ request }) => {
    const body = await request.json()
    
    if (body.action === 'generate') {
      return HttpResponse.json({
        request_id: 'fake-request-' + Date.now(),
        status: 'IN_QUEUE',
      })
    }

    // 상태 폴링
    if (body.action === 'status') {
      return HttpResponse.json({
        status: 'COMPLETED',
        output: {
          video_url: 'https://fake-cdn.example.com/video.mp4',
        },
      })
    }

    return HttpResponse.json({ error: 'Unknown action' }, { status: 400 })
  }),
]
```

### LiveKit Mock

```typescript
// tests/setup/livekit-mock.ts
import { vi } from 'vitest'

export const mockLiveKitToken = vi.fn().mockResolvedValue('fake.jwt.token')

// Room context 모킹
export const mockLiveKitRoom = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  participants: new Map(),
  localParticipant: { identity: 'test-user' },
}
```

### Supabase Mock (단위 테스트)

```typescript
// tests/setup/supabase-mock.ts
import { vi } from 'vitest'

export const mockSupabase = {
  from: vi.fn((table: string) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
  })),
  auth: {
    signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
}
```

### PixiJS Mock (Canvas)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import 'jest-canvas-mock'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup/canvas-mock.ts'],
    globals: true,
  },
})
```

---

## §7 테스트 데이터 관리

### Seed 데이터 (test project)

```sql
-- supabase/fixtures/test-users.sql
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES
  ('test-user-1', 'test1@example.com', NOW()),
  ('test-user-2', 'test2@example.com', NOW());

INSERT INTO public.users (id, auth_id, email, display_name)
VALUES
  ('app-user-1', 'test-user-1', 'test1@example.com', 'Test User 1'),
  ('app-user-2', 'test-user-2', 'test2@example.com', 'Test User 2');

INSERT INTO public.credits (user_id, balance)
VALUES
  ('app-user-1', 100),
  ('app-user-2', 50);

INSERT INTO public.rooms (id, host_id, title, max_participants)
VALUES
  ('test-room-1', 'app-user-1', 'Test Room 1', 5),
  ('test-room-2', 'app-user-2', 'Test Room 2', 3);
```

### Cleanup (afterEach)

```typescript
// tests/setup/db-cleanup.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_TEST_URL!,
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!
)

export async function cleanupTestData() {
  // RLS가 격리하면 불필요할 수 있지만, 명시적 정리 권장
  await supabase.from('chat_messages').delete().neq('id', '')
  await supabase.from('vgen_jobs').delete().neq('id', '')
  await supabase.from('room_guests').delete().neq('id', '')
  // rooms·profiles는 test 종료 후 한 번에 삭제 (또는 별도 테스트 계정 사용)
}
```

### 환경 변수

```bash
# .env.test
VITE_SUPABASE_URL=https://test-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyXxx...
SUPABASE_TEST_URL=https://test-project.supabase.co
SUPABASE_TEST_SERVICE_ROLE_KEY=eyXxx...
SUPABASE_TEST_ANON_KEY=eyXxx...
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=test-key
LIVEKIT_API_SECRET=test-secret
```

---

## §8 CI 게이트 및 E2E 실행 전략

### E2E 테스트 실행 타이밍

**이 프로젝트의 E2E 테스트는 2단계로 나뉨:**

| 단계 | 시점 | 환경 | 범위 | 목적 |
|------|------|------|------|------|
| **Stage 1** | PR → Preview Deploy | Vercel Preview | 핵심 사용자 여정 (AUTH, ROOM, VGEN, CREDIT) | 배포 전 긴급 버그 포착 |
| **Stage 2** | main 병합 후 | Production | 전체 E2E 케이스 (§5 참조) | 최종 배포 검증 |

**§5에서 정의한 E2E 범위 (10개 Critical Journey):**
- AUTH-01~03, ROOM-01, VGEN-01, CREDIT-01, CHAT-01, SAFETY-01~02, AGE-01, CONSENT-01, ACCOUNT-01

**실행 흐름:**

```
PR 생성
  ↓
[Preview Deploy] → [Stage 1 E2E: 핵심 경로만] → 실패 시 PR 코멘트 + 차단
  ↓ (통과)
PR 승인 → main 병합
  ↓
[Production Deploy] → [Stage 2 E2E: 전체 시나리오] → 실패 시 Slack alert + 필요시 롤백 (DEPLOY.md §배포 롤백 절차 참조)
  ↓ (통과)
배포 완료
```

### GitHub Actions 워크플로우

```yaml
# .github/workflows/test.yml
name: Test & Coverage

on: [push, pull_request]

jobs:
  unit-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: pnpm

      - run: pnpm install
      - run: pnpm test:unit
      - run: pnpm test:integration

      # Coverage 게이트
      - name: Check coverage
        run: |
          coverage=$(cat coverage/coverage-final.json | jq '.total.lines.pct')
          if (( $(echo "$coverage < 70" | bc -l) )); then
            echo "Coverage $coverage% is below 70% threshold"
            exit 1
          fi

      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

  # PR → Preview 배포 후 Stage 1 E2E (핵심 경로)
  e2e-preview:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: pnpm

      - run: pnpm install
      
      # Stage 1: 핵심 경로만 (3~5분)
      - name: Run Stage 1 E2E (Critical paths)
        run: pnpm test:e2e --grep "AUTH-01|AUTH-02|AUTH-03|ROOM-01|VGEN-01|CREDIT-01"
        env:
          PLAYWRIGHT_TEST_BASE_URL: ${{ github.event.pull_request.head.repo.homepage }}/preview
      
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: e2e-preview-report
          path: playwright-report/

  # main 병합 후 Stage 2 E2E (전체)
  e2e-production:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: pnpm

      - run: pnpm install
      
      # Stage 2: 전체 E2E (15~20분)
      - name: Run Stage 2 E2E (All scenarios)
        run: pnpm test:e2e
        env:
          PLAYWRIGHT_TEST_BASE_URL: https://snack-web-prod.pages.dev
      
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: e2e-prod-report
          path: playwright-report/
      
      # E2E 실패 시 Slack alert
      - name: Notify Slack on E2E failure
        if: failure()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK_URL }} \
            -d '{"text":"❌ E2E test failed on main branch. Investigate: https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}"}'
```

### PR 병합 조건
- ✅ `unit-integration` job 통과
- ✅ Coverage >= 70%
- ✅ `e2e-preview` (Stage 1) 통과 (PR일 때)
- ✅ 코드 리뷰 승인

### Stage 2 E2E 실패 시 대응

1. 실패 후 자동으로 Slack #alerts 알림 수신
2. 로그 확인: GitHub Actions 탭 → playwright-report
3. 원인 파악:
   - **프로덕션 데이터 오염**: DB 백업에서 복구
   - **인프라 이슈**: Supabase/LiveKit 상태 확인
   - **코드 버그**: 긴급 핫픽스 → revert commit 또는 롤백 (DEPLOY.md 참조)

4. 필요 시 `wrangler pages rollback` 실행 (위 DEPLOY.md §배포 롤백 절차 참조)

---

## §9 MUST NOT

- ❌ **프로덕션 Supabase에서 테스트 실행**: 항상 test project 또는 로컬 mock 사용
- ❌ **fal.ai 실 API 호출**: 비용 발생, 반드시 MSW mock 사용
- ❌ **console.log mock 없이 민감 데이터 로깅**: 채팅 콘텐츠, 사용자 토큰, API 키 절대 프린트 금지
- ❌ **테스트 DB 정리 건너뛰기**: 각 테스트 후 상태 초기화 또는 격리된 테스트 계정 사용
- ❌ **E2E에서 실시간 WebRTC 연결 기대**: fake device 사용, 신호 전달만 테스트
- ❌ **타임아웃 값 무한정 늘리기**: 폴링 timeout은 최대 10초, 그 이상이면 아키텍처 재검토

---

## 실행 명령어

```bash
# 단위 테스트만
pnpm test:unit

# 통합 테스트 (test DB 필요)
pnpm test:integration

# 전체 테스트 (단위 + 통합)
pnpm test

# E2E 테스트 (Playwright)
pnpm test:e2e

# Coverage 리포트 생성
pnpm test --coverage

# CI 환경 시뮬레이션
pnpm test:ci
```

---

---

## §10 크로스컴포넌트 통합 시나리오 (G-143)

단일 컴포넌트가 아닌 **여러 레이어를 가로지르는** 시나리오. `tests/integration/` 폴더에 위치.

### 시나리오 1: ChatPanel → Edge Function → Supabase Realtime/server relay

```typescript
// tests/integration/chat-flow.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStageStore } from '@/stores/stageStore'

// 실제 Supabase test DB 사용 (RLS 검증)
describe('ChatPanel → Edge Function → Realtime 통합', () => {
  it('채팅 메시지가 send-chat Edge Function → messages → 다른 탭에 수신된다', async () => {
    // Setup: 2개의 독립 Supabase 클라이언트 (사용자 A, B)
    const [clientA, clientB] = await setupTwoClients()
    const roomId = await createTestRoom(clientA)

    const messagesB: string[] = []
    const channel = clientB.channel(`messages:${roomId}`)
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (payload) => {
      messagesB.push(payload.new.text)
    }).subscribe()

    // Act: A가 채팅 메시지 전송. 클라이언트 DataChannel 직접 publish 금지.
    await clientA.functions.invoke('send-chat', {
      body: { room_id: roomId, text: 'hello', idempotency_key: 'chat-flow-hello-1' }
    })

    // Assert: B가 100ms 내 수신
    await vi.waitFor(() => expect(messagesB).toContain('hello'), { timeout: 2000 })
  })
})
```

### 시나리오 1-1: Invite 검증은 read-only

```typescript
describe('verify-invite-code read-only', () => {
  it('verify는 used_count 증가나 participant 생성을 하지 않는다', async () => {
    const { roomId, inviteCode, inviteId } = await setupInvite()

    await publicClient.functions.invoke('verify-invite-code', {
      body: { invite_code: inviteCode, room_id: roomId }
    })

    const invite = await admin.from('room_invites').select('used_count').eq('id', inviteId).single()
    const participants = await admin.from('room_participants').select('id').eq('room_id', roomId)

    expect(invite.data!.used_count).toBe(0)
    expect(participants.data).toHaveLength(0)
  })
})
```

### 시나리오 1-2: Viewer 권한은 쓰기 불가

```typescript
describe('viewer LiveKit grants', () => {
  it('mobile/viewer token은 canPublishData=false이고 chat은 Edge Function만 통과한다', async () => {
    const { tokenClaims } = await issueViewerToken({ deviceType: 'mobile' })
    expect(tokenClaims.video.canPublish).toBe(false)
    expect(tokenClaims.video.canPublishData).toBe(false)

    await expect(clientPublishDataAsViewer()).rejects.toThrow()
    await expect(sendViewerChatViaEdge()).resolves.toMatchObject({ data: { ok: true } })
  })
})
```

### 시나리오 2: VGEN 요청 → fal.ai Mock → 상태 폴링 → 완료

```typescript
// tests/integration/vgen-flow.test.ts
import { setupServer } from 'msw/node'
import { handlers } from '../mocks/handlers'

const server = setupServer(...handlers)
beforeAll(() => server.listen())
afterAll(() => server.close())

describe('VGEN 요청 → 폴링 → 완료 통합', () => {
  it('요청 → queued → processing → completed 상태 전이', async () => {
    const { result } = renderHook(() => useVgenStore())

    await act(async () => {
      await result.current.requestVgen({ prompt: 'test', durationSec: 5 })
    })

    expect(result.current.jobs[0].status).toBe('queued')

    // MSW가 status 폴링 응답을 completed로 변경
    server.use(
      http.post('*/api/fal/status', () =>
        HttpResponse.json({ status: 'COMPLETED', output: { video_url: 'https://cdn.example.com/v.mp4' } })
      )
    )

    await act(async () => {
      await result.current.pollJobStatus(result.current.jobs[0].id)
    })

    expect(result.current.jobs[0].status).toBe('completed')
    expect(result.current.jobs[0].videoUrl).toBe('https://cdn.example.com/v.mp4')
  })
})
```

### 시나리오 3: 크레딧 차감 동시성 (Supabase FOR UPDATE)

```typescript
// tests/integration/credit-concurrency.test.ts
describe('크레딧 차감 동시성', () => {
  it('동시 2개 VGEN 요청 시 크레딧이 1회만 차감된다', async () => {
    const supabase = createTestClient()
    const userId = await createTestUser(supabase, { credits: 5 })

    // 동시 요청
    const [result1, result2] = await Promise.allSettled([
      supabase.rpc('deduct_vgen_credits', { user_id: userId, amount: 5 }),
      supabase.rpc('deduct_vgen_credits', { user_id: userId, amount: 5 }),
    ])

    const { data: credit } = await supabase
      .from('credits').select('balance').eq('user_id', userId).single()

    // FOR UPDATE 잠금으로 하나만 성공해야 함
    const succeeded = [result1, result2].filter(r => r.status === 'fulfilled').length
    expect(succeeded).toBe(1)
    expect(credit!.balance).toBe(0) // 5 - 5 = 0, 두 번 차감되면 -5가 됨
  })

  it('FOR UPDATE lock timeout 발생 시 자동 재시도가 작동한다', async () => {
    const supabase = createTestClient()
    const userId = await createTestUser(supabase, { credits: 100 })

    // 시뮬레이션: 의도적 락 타임아웃 유발 (3개 동시 요청)
    const requests = Array.from({ length: 3 }).map(() =>
      supabase.rpc('deduct_vgen_credits', {
        user_id: userId,
        amount: 10,
        timeout_ms: 100, // 짧은 타임아웃
      })
    )

    const results = await Promise.allSettled(requests)

    // 일부는 timeout error, 일부는 재시도 후 성공
    const successCount = results.filter(r => r.status === 'fulfilled').length
    const timeoutCount = results.filter(
      r => r.status === 'rejected' && r.reason?.code === 'PGRST116' // lock timeout
    ).length

    console.log(`Success: ${successCount}, Timeout: ${timeoutCount}`)
    expect(successCount + timeoutCount).toBe(3)

    // 최종 크레딧: 100 - (10 * successCount) > 0 이어야 함
    const { data: credit } = await supabase
      .from('credits').select('balance').eq('user_id', userId).single()
    expect(credit!.balance).toBeLessThan(100)
  })

  it('Deadlock 발생 시 클라이언트가 재시도한다', async () => {
    const supabase = createTestClient()
    const userId1 = await createTestUser(supabase, { credits: 50 })
    const userId2 = await createTestUser(supabase, { credits: 50 })

    // 시뮬레이션: 두 사용자 간 교차 업데이트로 deadlock 유발
    const request1 = supabase.rpc('transfer_credits', {
      from_user_id: userId1,
      to_user_id: userId2,
      amount: 10,
    })

    const request2 = supabase.rpc('transfer_credits', {
      from_user_id: userId2,
      to_user_id: userId1,
      amount: 10,
    })

    // 하나는 deadlock error, 하나는 성공할 수 있음
    const [result1, result2] = await Promise.allSettled([request1, request2])

    // 클라이언트 재시도 로직 검증
    if (result1.status === 'rejected') {
      // 첫 번째가 deadlock → 지수 백오프 재시도
      const retryResult = await supabase.rpc('transfer_credits', {
        from_user_id: userId1,
        to_user_id: userId2,
        amount: 10,
      })
      expect(retryResult.data || retryResult.error).toBeDefined()
    }
  })
})
```

**Edge Function에서의 재시도 로직 (권장):**

```typescript
// supabase/functions/deduct-vgen-credits/index.ts
async function deductCreditsWithRetry(
  userId: string,
  amount: number,
  maxRetries: number = 3
): Promise<{ success: boolean; error?: string }> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.rpc('deduct_vgen_credits', {
        user_id: userId,
        amount: amount,
      })

      if (error) throw new Error(error.message)
      return { success: true }
    } catch (err) {
      lastError = err as Error

      // 40P01 = deadlock, 55P03 = lock timeout
      const isRetryable = ['40P01', '55P03'].some(code => lastError?.message.includes(code))

      if (!isRetryable || attempt === maxRetries) {
        break
      }

      // 지수 백오프: 100ms, 200ms, 400ms
      const backoffMs = 100 * Math.pow(2, attempt - 1)
      await new Promise(resolve => setTimeout(resolve, backoffMs))
    }
  }

  return { success: false, error: lastError?.message || 'Unknown error' }
}
```

### 시나리오 4: Feature Flag → 실시간 반영

```typescript
// tests/integration/feature-flag-realtime.test.ts
describe('Feature Flag → Realtime 반영', () => {
  it('VGEN_ENABLED false 업데이트 시 2초 내 ConfigStore에 반영된다', async () => {
    const supabase = createTestClient()
    const { result } = renderHook(() => useConfigStore())

    // subscribeRealtime 시작
    act(() => { result.current.subscribeRealtime() })

    // DB에서 플래그 변경
    await supabase.from('app_config')
      .update({ value: { value: false } })
      .eq('key', 'VGEN_ENABLED')

    // 2초 내 반영
    await vi.waitFor(
      () => expect(result.current.getFlag('VGEN_ENABLED')).toBe(false),
      { timeout: 2000 }
    )
  })
})
```

### 시나리오 5: 방장 위임 → LiveKit DataChannel → HostAuthority FSM

```typescript
// tests/integration/host-authority.test.ts
describe('방장 위임 → DataChannel → FSM 상태 전이', () => {
  it('방장이 권한 위임 시 신규 방장 FSM이 HOSTING으로 전이한다', async () => {
    const dispatcher = createMockDispatcher()
    const { result } = renderHook(() => useRoomStore())

    // 현재 방장: userA
    act(() => { result.current.setHost('userA') })
    expect(result.current.hostId).toBe('userA')

    // DataChannel: host_transfer 메시지 수신
    act(() => {
      dispatcher.dispatch({
        type: 'host_transfer',
        payload: { newHostId: 'userB' },
      }, 'userA')
    })

    expect(result.current.hostId).toBe('userB')
  })
})
```

---

**마지막 업데이트**: 2026-06-30
**상태**: 활성 (G-111, G-143)
