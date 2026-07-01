---
tags: [spec]
---

# Feature Flag 시스템

> G-109 산출 문서. Supabase `app_config` 테이블 + Zustand + Realtime 채택.

## 채택 방식 결정

| 방식 | 배포 없이 변경 | 즉시성 | 추가 비용 | 진입장벽 |
|------|-------------|--------|---------|---------|
| **Supabase app_config + Realtime** | ✓ | 1~2초 | $0 | 낮음 |
| Vercel Edge Config | ✓ | 즉시 | $5/월 | 중간 |
| GrowthBook OSS | ✓ | 1~5초 | $0 | 중간 |
| Unleash OSS | ✓ | 1~5초 | $0 | 높음 |

**채택**: Supabase + Zustand + Realtime
- 이미 Supabase Pro 구독 중 → 추가 비용 0
- RLS로 플래그별 사용자 그룹 세분화 가능
- 기존 스택에서 벗어나지 않음

---

## app_config 테이블 스키마

```sql
CREATE TABLE app_config (
  id         BIGSERIAL PRIMARY KEY,
  key        TEXT        NOT NULL UNIQUE,
  value      JSONB       NOT NULL,
  description TEXT,
  enabled    BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- 관리자만 쓰기
CREATE POLICY "admin_write" ON app_config
  FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'));

-- 모두 읽기
CREATE POLICY "public_read" ON app_config
  FOR SELECT USING (true);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

---

## 현재 정의된 플래그

| 플래그 | 기본값(MVP) | 기본값(Staging) | 기본값(Prod) | 설명 | 비용 영향 |
|--------|-----------|---------------|-----------|------|---------|
| `VGEN_ENABLED` | false | false | false | VGEN 영상 생성 기능 (서버 승인 후 ON) | ✓ $0.24/초 |
| `DUB_ENABLED` | false | false | false | 음성 더빙 기능 (P1 비용 검토 후) | ✓ STT+생성 비용 |
| `DUB_YOUTUBE_ENABLED` | false | false | false | YouTube 더빙 import (P2 법무/SSRF 검토 후) | ✓ 추가 비용 |
| `ROOM_MAX_USERS` | 6 | 6 | 6 | 방당 최대 참가자 수 | × |
| `VGEN_DAILY_LIMIT` | 3 | 5 | 3 | 사용자당 일일 VGEN 생성 횟수 제한 | × (제어용) |
| `VGEN_MAX_SEC` | 10 | 10 | 10 | VGEN 생성 최대 길이(초) | × (제어용) |
| `LIVEKIT_ENABLED` | true | true | true | WebRTC 연결 활성화 (장애 시에만 OFF) | × |
| `MAINTENANCE_MODE` | false | false | false | 점검 모드 — true면 사용자 로그인 차단 | × |
| `NEW_ONBOARDING` | false | true | false | 신규 온보딩 UX (A/B 테스트용) | × |
| `VGEN_REFUND_MODERATION` | false | false | false | content_moderation 실패를 VGEN 환불 대상으로 포함 (정책 토글) | × |
| `VGEN_REFUND_USER_CANCEL` | false | false | false | 사용자 취소(user_cancel)를 VGEN 환불 대상으로 포함 (정책 토글) | × |
| `DUB_REFUND_USER_CANCEL` | false | false | false | 사용자 취소(user_cancel)를 DUB 환불 대상으로 포함 (정책 토글) | × |

**초기화 SQL:**
```sql
INSERT INTO app_config (key, value, description, enabled) VALUES
  ('VGEN_ENABLED',                '{"value": false}', 'VGEN 영상 생성 기능 활성화. 비용 발생 기능이므로 서버 승인 전 기본 OFF', true),
  ('DUB_ENABLED',                 '{"value": false}', '음성 더빙 기능 활성화. 업로드/STT 비용 기능이므로 서버 승인 전 기본 OFF', true),
  ('DUB_YOUTUBE_ENABLED',         '{"value": false}', 'YouTube DUB import. P2 법무/SSRF/비용 gate 승인 전 OFF', true),
  ('ROOM_MAX_USERS',              '{"value": 6}',     '방당 최대 참가자 수',                   true),
  ('VGEN_DAILY_LIMIT',            '{"value": 3}',     '사용자당 일일 VGEN 생성 횟수 제한',      true),
  ('VGEN_MAX_SEC',                '{"value": 10}',    'VGEN 생성 최대 길이(초)',               true),
  ('LIVEKIT_ENABLED',             '{"value": true}',  'WebRTC 연결 활성화',                   true),
  ('MAINTENANCE_MODE',            '{"value": false}', '점검 모드 — true면 로그인 차단',         false),
  ('NEW_ONBOARDING',              '{"value": false}', '신규 온보딩 UX (A/B 테스트용)',          false),
  ('VGEN_REFUND_MODERATION',      '{"value": false}', 'content_moderation 실패를 VGEN 환불 대상으로 포함',  true),
  ('VGEN_REFUND_USER_CANCEL',     '{"value": false}', '사용자 취소(user_cancel)를 VGEN 환불 대상으로 포함',  true),
  ('DUB_REFUND_USER_CANCEL',      '{"value": false}', '사용자 취소(user_cancel)를 DUB 환불 대상으로 포함',    true);
```

---

## Zustand 스토어

```typescript
// src/store/configStore.ts
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface AppConfig {
  VGEN_ENABLED: boolean;
  DUB_ENABLED: boolean;
  DUB_YOUTUBE_ENABLED: boolean;
  ROOM_MAX_USERS: number;
  VGEN_DAILY_LIMIT: number;
  VGEN_MAX_SEC: number;
  LIVEKIT_ENABLED: boolean;
  MAINTENANCE_MODE: boolean;
  NEW_ONBOARDING: boolean;
  VGEN_REFUND_MODERATION: boolean;
  VGEN_REFUND_USER_CANCEL: boolean;
  DUB_REFUND_USER_CANCEL: boolean;
  [key: string]: boolean | number | string;
}

const DEFAULT_CONFIG: AppConfig = {
  VGEN_ENABLED: false,
  DUB_ENABLED: false,
  DUB_YOUTUBE_ENABLED: false,
  ROOM_MAX_USERS: 6,
  VGEN_DAILY_LIMIT: 3,
  VGEN_MAX_SEC: 10,
  LIVEKIT_ENABLED: true,
  MAINTENANCE_MODE: false,
  NEW_ONBOARDING: false,
  VGEN_REFUND_MODERATION: false,
  VGEN_REFUND_USER_CANCEL: false,
  DUB_REFUND_USER_CANCEL: false,
};

interface ConfigStore {
  config: AppConfig;
  ready: boolean;
  loadConfig: () => Promise<void>;
  subscribeRealtime: () => () => void;
  getFlag: <K extends keyof AppConfig>(key: K) => AppConfig[K];
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: DEFAULT_CONFIG,
  ready: false,

  loadConfig: async () => {
    const { data } = await supabase
      .from('app_config')
      .select('key, value')
      .eq('enabled', true);

    if (!data) return;

    const config = { ...DEFAULT_CONFIG };
    data.forEach(row => { config[row.key] = row.value.value; });
    set({ config, ready: true });
  },

  subscribeRealtime: () => {
    const channel = supabase
      .channel('app_config_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_config' },
        ({ new: row, eventType }) => {
          if (eventType === 'DELETE') return;
          set(state => ({
            config: { ...state.config, [row.key]: row.value.value },
          }));
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  },

  getFlag: (key) => get().config[key] ?? DEFAULT_CONFIG[key],
}));
```

> ponytail: 비용 발생 기능은 설정 로드 실패 시 false로 닫는다. UI flag는 편의 장치이고, `trigger-vgen`, `create-dub-session`, `start-dub-compositing` 같은 Edge Function도 서버에서 같은 flag를 재검증해야 한다.

---

## App.tsx 초기화

```typescript
// src/App.tsx
import { useEffect } from 'react';
import { useConfigStore } from '@/store/configStore';

function AppInit() {
  const { loadConfig, subscribeRealtime } = useConfigStore();

  useEffect(() => {
    loadConfig();
    return subscribeRealtime();
  }, []);

  return null;
}

export default function App() {
  return (
    <>
      <AppInit />
      <Router>...</Router>
    </>
  );
}
```

---

## 컴포넌트에서 사용

```typescript
// 단일 플래그
const vgenEnabled = useConfigStore(s => s.getFlag('VGEN_ENABLED'));

// 여러 플래그
const { vgenEnabled, dailyLimit } = useConfigStore(s => ({
  vgenEnabled: s.getFlag('VGEN_ENABLED'),
  dailyLimit: s.getFlag('VGEN_DAILY_LIMIT'),
}));
```

---

## 플래그 변경 절차

### 1. 신규 플래그 추가

1. **DB 삽입** (Supabase SQL Editor)
```sql
INSERT INTO app_config (key, value, description, enabled)
VALUES ('MY_FLAG', '{"value": false}', '설명', false);
```

2. **타입 + 기본값 추가** (`configStore.ts`)
```typescript
interface AppConfig {
  // ...
  MY_FLAG: boolean;
}

const DEFAULT_CONFIG: AppConfig = {
  // ...
  MY_FLAG: false,  // MVP/Prod 기본값
};
```

3. **코드 적용**
```typescript
const myFlag = useConfigStore(s => s.getFlag('MY_FLAG'));
if (!myFlag) return null;
```

4. **배포 및 활성화**
```bash
# Step A: 코드 PR 병합 후 Vercel에 자동 배포
git push origin feature/my-flag

# Step B: 배포 완료 후 플래그 활성화 (Supabase SQL Editor)
UPDATE app_config SET enabled = true WHERE key = 'MY_FLAG';
-- → Realtime으로 1~2초 내 모든 클라이언트에 자동 반영
-- → 새로고침(F5) 불필요, 앱 재시작 불필요
```

### 2. 기존 플래그 값 변경 (즉시 반영)

**전체 사용자 ON/OFF** (비용 기능 또는 장애 대응):
```sql
-- VGEN 기능 긴급 비활성화 (비용 폭주 또는 외부 서비스 장애)
UPDATE app_config SET value = '{"value": false}' WHERE key = 'VGEN_ENABLED';
-- → Realtime 1~2초 내 자동 반영 (재배포 불필요)
```

**숫자 파라미터 조정** (캐시 재설정 불필요):
```sql
-- 일일 제한 임시 상향 (이벤트 기간)
UPDATE app_config SET value = '{"value": 10}' WHERE key = 'VGEN_DAILY_LIMIT';
```

**점검 모드 활성화** (P0 장애 대응):
```sql
-- 모든 사용자 로그인 차단
UPDATE app_config SET value = '{"value": true}' WHERE key = 'MAINTENANCE_MODE';
-- → 다음 접근 시 maintenanceMode 컴포넌트 표시
```

### 3. Edge Function에서 플래그 재검증 (필수)

비용 발생 기능(`VGEN_ENABLED`, `DUB_ENABLED`)은 클라이언트 플래그만으로 제어 불충분.  
반드시 Edge Function에서 서버측 재검증 필요:

```typescript
// supabase/functions/trigger-vgen/index.ts
export async function POST(req: Request) {
  const { userId, prompt } = await req.json();

  // 1. 클라이언트 검증 (네트워크 속도용)
  // const vgenEnabled = useConfigStore(...) — 클라이언트에서만

  // 2. 서버 재검증 (필수)
  const { data: config } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'VGEN_ENABLED')
    .single();

  if (!config?.value?.value) {
    return new Response(JSON.stringify({ error: 'VGEN disabled' }), { status: 403 });
  }

  // 3. 계속 진행
  return triggerVGENJob(userId, prompt);
}
```

### 4. 재배포 필요 여부 정리

| 플래그 유형 | 변경 | 배포 필요? | Realtime 반영 시간 |
|-----------|------|---------|-----------------|
| 부울값 온/오프 (VGEN_ENABLED 등) | false → true | ✓ 코드 변경 후만 필수 | 1~2초 (Realtime) |
| 숫자 파라미터 (DAILY_LIMIT 등) | 3 → 5 | × 불필요 | 1~2초 (Realtime) |
| 점검 모드 (MAINTENANCE_MODE) | false → true | × 불필요 | 1~2초 (Realtime) |

**정리**: SQL UPDATE만으로 배포 없이 변경 반영 → 네트워크 지연 최소 → 즉각적 장애 대응 가능

---

---

## 향후 확장: 퍼센트 롤아웃 (P2)

현재 구현은 **전체 ON/OFF**만 지원. 다음 단계에서는 카나리 배포를 지원할 수 있음:

```sql
-- 향후 확장: 사용자 해시 기반 롤아웃
CREATE TABLE feature_flags_rollout (
  key TEXT PRIMARY KEY,
  percentage_enabled INT DEFAULT 0,  -- 0~100
  user_segment TEXT DEFAULT 'all'    -- 'all', 'admin', 'beta_testers'
);

-- 클라이언트에서 해시 기반 결정
const shouldEnableFlag = hash(userId) % 100 < config.percentage_enabled;
```

**현재 상태**: MVP·P1에서는 필요 없음. DAU 5K 이상에서 A/B 테스트 필요 시 구현 예정.

---

## MUST NOT

- `app_config` 테이블에 민감한 시크릿(API 키, 비밀번호) 저장 금지 — RLS SELECT가 public이므로 클라이언트에 노출됨
- `enabled = false`인 플래그를 코드에서 사용 금지 (로드 시 DEFAULT_CONFIG 기본값으로 대체됨)
- Realtime 구독 없이 loadConfig만 호출하는 컴포넌트에서 실시간 반영 기대 금지
- 비용 발생 기능은 클라이언트 플래그만으로 제어하지 말 것 — Edge Function에서 서버측 재검증 필수
