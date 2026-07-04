---
tags: [reference, pattern]
status: complete
created: 2026-07-02
---

<!-- reference/patterns: fal.ai VGEN 요청·폴링·동기화 패턴. 
     기반: @fal-ai/client@1.10.1, Seedance 2.0 Fast, fal.ai 공식 문서 (조회일 2026-07-02).
     구조: 클라 → Supabase Edge Function → Cloudflare Workflows → fal.ai queue → webhook/polling → vgen_jobs 동기화.
     설치버전·공식문서·모델ID·비용 재확인 필수. -->

# fal.ai VGEN 요청·폴링·동기화 패턴

> **⚠️ 버전 민감**: 아래는 `@fal-ai/client@1.10.1`·Seedance 2.0 Fast·fal.ai 공식 문서(2026-07-02) 기준.  
> 설치 후 `npm list @fal-ai/client` 확인 · [fal.ai 공식 프라이싱](https://fal.ai/models/bytedance/seedance-2.0/fast/text-to-video) 재확인 필수.
>
> **검수 노트(Opus, 2026-07-02) — 구현 전 반드시 확인:**
> - ①**§1.2 크레딧 차감이 원자적이지 않다.** 주석은 "비관적 잠금"이나 코드는 read-then-update → 동시요청 이중차감 위험(우리 [[FORWARD-REVIEW-2026-07]] G-271/G-272 정면). 구현 시 `rpc('deduct_credit', …)` 또는 `SELECT … FOR UPDATE` 트랜잭션으로 대체 필수.
> - ②**§7.1 `supabase.sql\`balance + n\``는 supabase-js v2에 없는 API.** 크레딧 증감은 RPC(서버 함수)로 원자 처리.
> - ③모델 ID가 `bytedance/seedance-2.0/…`와 `fal-ai/bytedance-seedance-2.0-…`로 혼재 + §6.3 가격공식($4.23)이 §6.3 표($3.63)와 불일치 → 실제 model ID·엔드포인트·단가는 fal 공식문서로 확정하고 `app_config`로 외부화(G-268).
> - ④webhook 지원·재시도(15초·10회/2시간)는 공식 확인됨 → Fable-C "webhook 미확인" 미결 해소.

---

## 0. 버전·출처·모델 ID

### SDK 버전
| 라이브러리 | 버전 | 설치 명령 | 용도 |
|---|---|---|---|
| `@fal-ai/client` | **1.10.1** (최신) | `npm install @fal-ai/client` | JavaScript queue submit/polling |
| Seedance 2.0 Fast | (fal.ai 호스팅) | 모델 ID: `bytedance/seedance-2.0/fast/text-to-video` | T2V, 15초 max, 720p, $0.2419/초 |

**출처**: [npm @fal-ai/client](https://www.npmjs.com/package/@fal-ai/client) | [fal.ai 클라이언트 설명서](https://fal.ai/docs/clients/javascript) | [Seedance 2.0 Fast API](https://fal.ai/models/bytedance/seedance-2.0/fast/text-to-video)

### 환경 변수 (app_config 외부화 = G-268)

```bash
# .env.local (서버·Edge Function)
FAL_KEY=sk_xxx...  # fal.ai API 키 (서비스 계정)

# .env.local (클라이언트, 필요시)
REACT_APP_VGEN_MODEL=bytedance/seedance-2.0/fast/text-to-video
REACT_APP_VGEN_PROVIDER=fal-ai
```

**MUST NOT**: 클라이언트에서 `FAL_KEY` 노출 → 반드시 서버 프록시 또는 Edge Function 경유.

---

## 1. Edge Function에서 fal 제출 (queue submit) — Deno + Supabase

### 1.1 기본 흐름

```
클라 → POST /api/trigger-vgen
      ↓
Edge Function (Deno):
  1. 입력 검증 (프롬프트, 길이)
  2. 모더레이션 (OpenAI)
  3. 크레딧 게이트 (비관적 잠금)
  4. vgen_jobs INSERT (idempotency_key, status='pending')
  5. Cloudflare Workflows 트리거 또는 fal.ai 직접 제출
  ↓
return { job_id, status: 'queued' }
```

### 1.2 Edge Function (Deno) 구현 스켈레톤

```typescript
// supabase/functions/trigger-vgen/index.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface TriggerVgenRequest {
  room_id: string;
  user_id: string;
  prompt_text: string;
  duration_seconds: number;  // 5, 10, 15
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = (await req.json()) as TriggerVgenRequest;
    const { room_id, user_id, prompt_text, duration_seconds } = body;

    // 1. 입력 검증
    if (!prompt_text || prompt_text.length === 0 || prompt_text.length > 2000) {
      return new Response(
        JSON.stringify({ error: "INVALID_PROMPT" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (![5, 10, 15].includes(duration_seconds)) {
      return new Response(
        JSON.stringify({ error: "INVALID_DURATION" }),
        { status: 400 }
      );
    }

    // 2. 모더레이션 (OpenAI)
    const moderationResult = await fetch(
      "https://api.openai.com/v1/moderations",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: prompt_text }),
      }
    ).then(r => r.json());

    if (moderationResult.results?.[0]?.flagged) {
      const categories = Object.entries(moderationResult.results[0].categories)
        .filter(([, flagged]) => flagged)
        .map(([cat]) => cat);
      
      return new Response(
        JSON.stringify({
          error: "MODERATION_REJECTED",
          flagged_categories: categories,
        }),
        { status: 400 }
      );
    }

    // 3. 크레딧 게이트 (비관적 잠금)
    const creditCost = duration_seconds;  // 단순화: 초당 1크레딧
    const { data: credits } = await supabase
      .from("credits")
      .select("balance")
      .eq("user_id", user_id)
      .single();

    if (!credits || credits.balance < creditCost) {
      return new Response(
        JSON.stringify({ error: "CREDIT_INSUFFICIENT" }),
        { status: 402 }
      );
    }

    // 4. 멱등성 키 생성 (10초 버킷, P2 정의)
    const timestamp = Math.floor(Date.now() / 10000) * 10000;
    const idempotencyKey = btoa(
      `${prompt_text}|${user_id}|${room_id}|${timestamp}`
    ).substring(0, 64);

    // 5. vgen_jobs INSERT (크레딧 차감 함께)
    const { data: job, error: jobError } = await supabase
      .from("vgen_jobs")
      .insert({
        id: crypto.randomUUID(),
        room_id,
        user_id,
        prompt_text,
        prompt_hash: await hashSha256(prompt_text),
        duration_seconds,
        credit_cost: creditCost,
        status: "pending",
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      if (jobError.code === "23505") {
        // UNIQUE 충돌 → 기존 job 조회
        const { data: existing } = await supabase
          .from("vgen_jobs")
          .select("id, status")
          .eq("idempotency_key", idempotencyKey)
          .single();
        
        if (existing) {
          return new Response(
            JSON.stringify({
              job_id: existing.id,
              status: existing.status,
              message: "duplicate_request",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      throw jobError;
    }

    // 6. 크레딧 차감 (원자적 업데이트)
    const { error: creditError } = await supabase
      .from("credits")
      .update({
        balance: credits.balance - creditCost,
      })
      .eq("user_id", user_id);

    if (creditError) {
      // 롤백: job 상태를 failed로
      await supabase
        .from("vgen_jobs")
        .update({ status: "failed", failure_reason: "credit_update_failed" })
        .eq("id", job.id);
      
      throw creditError;
    }

    // 7. Cloudflare Workflows 트리거 또는 직접 fal.ai 제출
    // (§2 참조: workflow 권장, Edge Function 직접 제출은 120s CPU 초과 위험)
    
    // 8. 상태 업데이트 (generating)
    await supabase
      .from("vgen_jobs")
      .update({
        status: "generating",
        credit_deducted_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return new Response(
      JSON.stringify({
        job_id: job.id,
        status: "generating",
        progress: 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("trigger-vgen error:", error);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR" }),
      { status: 500 }
    );
  }
});

async function hashSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
```

**MUST NOT**:
- ❌ Edge Function에서 `fal.queue.subscribe()` (자동 폴링, 완료까지 블로킹) → 120s CPU 제한 초과
- ❌ 크레딧 차감 전 모더레이션 → 거절 시에도 차감됨
- ❌ 멱등성 키 없이 중복 요청 처리

---

## 2. Cloudflare Workflows에서 fal 제출 + 폴링/webhook

> ⚠️ **2026-07-04 SUPERSEDED (slice1):** 이 §2 CF Workflows 경로는 **채택하지 않는다**. fal webhook 이 확정(§2.1·:270)이라 durable 실행기가 불필요 — slice1 은 **Edge(`trigger-vgen`) 제출 + `vgen-webhook`(JWT-public·ED25519) 수신 + pg_cron 재조정**(STACK-COMPARE §3.1 정정)으로 구현했다. 아래 Workflows 스켈레톤은 폴링 폴백 참고용 이력.

### 2.1 폴링 vs Webhook (fal.ai 2026 지원 현황)

| 방식 | 지원 여부 | 지연 | 비용 | 적합성 |
|---|---|---|---|---|
| **Polling** | ✅ 완전 지원 (`fal.queue.status()`) | 5~10초 간격 | 무료 | **현재 권장** |
| **Webhook** | ✅ 완전 지원 (`webhook_url` 파라미터) | <1초 (콜백) | 무료 | 즉시성 필요 시 |

**우리 선택**: **Hybrid (webhook 우선, 60초 타임아웃 후 폴링 폴백)**
- Workflow가 webhook 대기 가능 (sleep 중 비용 미차감)
- 혹시 webhook 놓쳐도 폴링으로 복구

**출처**: [fal.ai 큐 문서](https://fal.ai/docs/model-apis/model-endpoints/queue) | [fal.ai 웹훅 문서](https://fal.ai/docs/model-apis/model-endpoints/webhooks)

### 2.2 Cloudflare Workflows 스켈레톤 (권장)

```typescript
// wrangler.toml에 workflows 설정 추가
// 또는 cf 콘솔에서 Workflows 생성

import { Workflow, WorkflowStep, WorkflowEvent } from "cloudflare:workers";

const workflow = new Workflow();

workflow.onFailure((error) => {
  console.error("Workflow failed:", error);
});

/**
 * Step 1: fal.ai에 요청 제출 (queue.submit)
 */
workflow.step("submit-to-fal", async (step: WorkflowStep) => {
  const { job_id, prompt_text, duration_seconds } = step.inputs as {
    job_id: string;
    prompt_text: string;
    duration_seconds: number;
  };

  const falApiKey = step.env.FAL_KEY;
  const webhookUrl = `https://your-domain.com/api/vgen/webhook`;

  const response = await fetch("https://queue.fal.ai/run/async", {
    method: "POST",
    headers: {
      "Authorization": `Key ${falApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "bytedance/seedance-2.0/fast/text-to-video",
      input: {
        prompt: prompt_text,
        duration: duration_seconds,
        resolution: "720p",
        generate_audio: true,
      },
      webhook_url: webhookUrl,  // ← webhook 등록
      headers: {
        "X-Request-ID": job_id,  // 추적용
      },
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`fal submit failed: ${JSON.stringify(data)}`);
  }

  return {
    request_id: data.request_id,  // fal.ai가 반환한 ID
    status: data.status,  // "IN_QUEUE"
  };
});

/**
 * Step 2: webhook 또는 폴링으로 완료 대기 (최대 120초)
 */
workflow.step("wait-for-completion", async (step: WorkflowStep) => {
  const { request_id, job_id } = step.inputs as {
    request_id: string;
    job_id: string;
  };

  const falApiKey = step.env.FAL_KEY;
  const maxAttempts = 24;  // 5초 × 24 = 120초
  let attempt = 0;
  let result = null;

  // Webhook 대기 (Workflow가 자동 sleep, 비용 미차감)
  // → Webhook이 도착하면 step.waitForWebhook() 완료
  // 그 전까지는 포기하고 polling 폴백
  
  while (attempt < maxAttempts) {
    attempt++;

    const statusResponse = await fetch(
      `https://queue.fal.ai/requests/${request_id}`,
      {
        headers: {
          "Authorization": `Key ${falApiKey}`,
        },
      }
    );

    const status = await statusResponse.json();
    
    if (status.status === "COMPLETED") {
      result = status;
      break;
    }

    if (status.status === "FAILED") {
      throw new Error(
        `fal generation failed: ${status.error || "unknown error"}`
      );
    }

    // 다음 폴링까지 5초 대기
    await step.sleep("wait-5s", 5);
  }

  if (!result || result.status !== "COMPLETED") {
    throw new Error(`fal timeout after ${maxAttempts * 5}s`);
  }

  return {
    video_url: result.output.video.url,
    seed: result.output.seed,
  };
});

/**
 * Step 3: R2 업로드 + DB 동기화
 */
workflow.step("finalize", async (step: WorkflowStep) => {
  const { job_id, video_url } = step.inputs as {
    job_id: string;
    video_url: string;
  };

  // R2 업로드 (video_url → promptHash 키)
  // vgen_jobs 업데이트 (status='done', result_url, validation_status='passed')
  
  return {
    job_id,
    status: "done",
  };
});

export default workflow;
```

### 2.3 Edge Function 직접 제출 (간단한 경우, CPU 초과 주의)

```typescript
// supabase/functions/submit-to-fal/index.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import * as fal from "npm:@fal-ai/client";

serve(async (req: Request) => {
  const { prompt_text, duration_seconds, job_id } = await req.json();

  // fal.ai 키 설정
  fal.config({
    credentials: Deno.env.get("FAL_KEY"),
  });

  try {
    // queue.submit() → 즉시 반환 (polling 없음)
    const result = await fal.queue.submit(
      "fal-ai/bytedance-seedance-2.0-fast-text-to-video",
      {
        input: {
          prompt: prompt_text,
          duration: duration_seconds,
          resolution: "720p",
          generate_audio: true,
        },
        webhookUrl: `https://your-domain.com/api/vgen/webhook?job_id=${job_id}`,
      }
    );

    return new Response(
      JSON.stringify({
        request_id: result.request_id,
        status: "queued",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("submit-to-fal error:", error);
    return new Response(
      JSON.stringify({ error: "FAL_SUBMIT_FAILED" }),
      { status: 500 }
    );
  }
});
```

**MUST NOT**:
- ❌ `fal.queue.subscribe()` Edge Function에서 → 블로킹, CPU 초과
- ❌ webhook_url 없이 폴링만 → latency 5~10초
- ❌ 폴링 간격 <2초 → fal.ai 레이트 제한 위험

---

## 3. Webhook 핸들러 (선택사항, webhook 방식 사용 시)

### 3.1 Supabase Edge Function webhook 수신

```typescript
// supabase/functions/vgen-webhook/index.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import * as crypto from "node:crypto";  // Deno std

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const signature = req.headers.get("x-fal-webhook-signature");
    const timestamp = req.headers.get("x-fal-request-timestamp");

    // 1. Webhook 서명 검증 (선택사항, 보안 권장)
    // → fal.ai JWKS 공개키로 ED25519 검증
    // 출처: https://rest.fal.ai/.well-known/jwks.json

    // 2. Payload 파싱
    const { request_id, status, payload, error } = body;
    const jobId = req.url.split("job_id=")[1];

    if (status === "OK") {
      // 성공 → vgen_jobs 업데이트
      const videoUrl = payload.video.url;
      
      const { error: updateError } = await supabase
        .from("vgen_jobs")
        .update({
          status: "done",
          result_url: videoUrl,
          validation_status: "passed",
          fal_request_id: request_id,
        })
        .eq("id", jobId);

      if (updateError) throw updateError;

      // 3. Realtime 브로드캐스트 (클라이언트 UI 업데이트)
      await supabase.channel("vgen_updates").send("broadcast", {
        event: "generation_complete",
        data: { job_id: jobId, status: "done", result_url: videoUrl },
      });

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    } else if (status === "ERROR") {
      // 실패 → credit 환불 + failure_reason 저장
      const { error: updateError } = await supabase
        .from("vgen_jobs")
        .update({
          status: "failed",
          failure_reason: error || "unknown_error",
          credit_refunded_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  } catch (error) {
    console.error("webhook error:", error);
    return new Response(
      JSON.stringify({ error: "WEBHOOK_PROCESSING_FAILED" }),
      { status: 500 }
    );
  }
});
```

**Webhook 재시도 정책** (fal.ai 자동 관리):
- 초기 타임아웃: 15초
- 재시도: 최대 10회, 2시간 내
- 귀사 엔드포인트는 **멱등성** 필수 (같은 `request_id` 중복 수신 가능)

---

## 4. 클라이언트 폴링 (대체: Realtime 구독 권장)

### 4.1 Supabase Realtime로 상태 변화 구독

```typescript
// src/hooks/useVgenJob.ts
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useVgenJob(jobId: string) {
  const [job, setJob] = useState<VgenJob | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // 1. 초기 로드
    supabase
      .from("vgen_jobs")
      .select("*")
      .eq("id", jobId)
      .single()
      .then(({ data }) => setJob(data));

    // 2. Realtime 구독 (UPDATE 이벤트)
    const subscription = supabase
      .channel(`vgen_jobs:${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "vgen_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const updated = payload.new as VgenJob;
          setJob(updated);

          // 진행도 계산 (GENERATING 상태일 때만)
          if (updated.status === "generating") {
            // Edge Function 또는 Workflow에서 progress를 별도 컬럼에 저장 시
            setProgress(updated.progress ?? 0);
          } else if (updated.status === "done") {
            setProgress(100);
          } else if (updated.status === "failed") {
            setProgress(0);
          }
        }
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [jobId]);

  return { job, progress };
}
```

### 4.2 수동 폴링 (대체, 600ms 간격)

```typescript
// src/stores/vgenStore.ts (Zustand)
import { create } from "zustand";
import { supabase } from "@/lib/supabaseClient";

interface VgenStore {
  jobs: VgenJob[];
  isGenerating: boolean;
  progress: number;
  pollJob: (jobId: string) => Promise<void>;
  startPolling: (jobId: string, intervalMs?: number) => void;
  stopPolling: () => void;
}

let pollInterval: NodeJS.Timeout | null = null;

export const useVgenStore = create<VgenStore>((set) => ({
  jobs: [],
  isGenerating: false,
  progress: 0,

  pollJob: async (jobId: string) => {
    const { data } = await supabase
      .from("vgen_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (data) {
      set((state) => ({
        jobs: state.jobs.map((j) => (j.id === jobId ? data : j)) || [data],
        progress: data.status === "done" ? 100 : data.progress ?? 0,
        isGenerating: data.status === "generating",
      }));
    }
  },

  startPolling: (jobId: string, intervalMs = 600) => {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
      const store = useVgenStore.getState();
      await store.pollJob(jobId);
    }, intervalMs);
  },

  stopPolling: () => {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = null;
  },
}));
```

**권장**: Realtime > 수동 폴링 (레이턴시 <100ms, 비용 효율)

---

## 5. 상태 동기화 (vgen_jobs.status + 3-way DONE 게이트)

### 5.1 상태 머신 (Vgen.md 참조)

```
PENDING → GENERATING → DONE
                    ↘ FAILED

3-way DONE 게이트:
  status = 'done'은 다음 3가지 모두 충족할 때만:
  1. validation_status = 'passed' (MP4 무결성)
  2. result_url IS NOT NULL (R2 서명 URL)
  3. credit_deducted_at IS NOT NULL (크레딧 차감 완료)
```

### 5.2 DB 스키마 (vgen_jobs)

```sql
CREATE TABLE vgen_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id),
  user_id UUID NOT NULL REFERENCES users(id),
  prompt_text TEXT NOT NULL,
  prompt_hash BYTEA NOT NULL,  -- SHA256
  duration_seconds INT NOT NULL CHECK (duration_seconds IN (5, 10, 15)),
  
  -- fal.ai 연동
  fal_request_id TEXT UNIQUE,
  fal_model TEXT DEFAULT 'bytedance/seedance-2.0/fast/text-to-video',
  
  -- 상태
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'done', 'failed', 'flagged')),
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  
  -- 크레딧
  credit_cost INT NOT NULL,
  credit_deducted_at TIMESTAMPTZ,
  credit_refunded_at TIMESTAMPTZ,
  
  -- 결과
  result_url TEXT,
  output_9x16_url TEXT,
  validation_status TEXT CHECK (validation_status IN ('pending', 'passed', 'failed')),
  
  -- 에러·모더레이션
  failure_reason TEXT,
  flagged_categories TEXT[],
  appeal_status TEXT,
  
  -- 멱등성
  idempotency_key TEXT UNIQUE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vgen_jobs_user_created ON vgen_jobs(user_id, created_at DESC);
CREATE INDEX idx_vgen_jobs_fal_request ON vgen_jobs(fal_request_id);
CREATE INDEX idx_vgen_jobs_status ON vgen_jobs(status);
```

### 5.3 상태 업데이트 흐름 (Workflow 예시)

```typescript
// Step A: fal.ai 제출 직후
await supabase.from("vgen_jobs").update({
  status: "generating",
  fal_request_id: falRequestId,
  progress: 0,
  credit_deducted_at: new Date().toISOString(),
}).eq("id", jobId);

// Step B: fal.ai 완료, 결과 수신
const result = { video_url: "https://...", seed: 123 };
await supabase.from("vgen_jobs").update({
  status: "done",  // ← 잠시: 3-way 게이트 앞
  result_url: result.video_url,
  validation_status: "passed",  // ← 모두 충족 후
  progress: 100,
}).eq("id", jobId);

// Step C: 실패 시, credit 환불
await supabase.from("vgen_jobs").update({
  status: "failed",
  failure_reason: errorMessage,
  credit_refunded_at: new Date().toISOString(),
}).eq("id", jobId);

// Step D: 사후 모더레이션 플래그
await supabase.from("vgen_jobs").update({
  status: "flagged",
  flagged_categories: ["violence"],
  validation_status: "passed",  // ← 영상은 유효, 콘텐츠만 거절
}).eq("id", jobId);
```

---

## 6. Seedance 2.0 입력·출력 명세

### 6.1 입력 포맷 (fal.ai queue.submit)

```typescript
interface SeedanceInput {
  prompt: string;                    // 필수, ≤2000자
  duration?: 4 | 5 | 10 | 15;       // 초, 기본 4
  resolution?: "480p" | "720p";      // 기본 480p
  aspect_ratio?: "16:9" | "9:16" | "1:1" | "21:9";  // 기본 16:9
  generate_audio?: boolean;          // 기본 true
  seed?: number;                     // 재현성, 선택사항
}

// 우리 호출
const input: SeedanceInput = {
  prompt: "A virtual tuber singing on stage, anime style, 4K",
  duration: 15,
  resolution: "720p",
  generate_audio: true,
  seed: Math.floor(Math.random() * 1e9),
};
```

### 6.2 출력 포맷

```typescript
interface SeedanceOutput {
  video: {
    url: string;           // 임시 CDN URL (7일 유효)
    content_type: string;  // "video/mp4"
    file_name: string;
    file_size: number;     // 바이트
  };
  seed: number;
}

// 예
{
  "video": {
    "url": "https://v3-prod-us-central1-e.s3.us-central1.amazonaws.com/...",
    "content_type": "video/mp4",
    "file_name": "seedance_15s_720p.mp4",
    "file_size": 5242880
  },
  "seed": 123456789
}
```

### 6.3 가격 계산

| 해상도 | 비용/초 | 5초 | 10초 | 15초 |
|---|---|---|---|---|
| **480p** (Token: $0.008/1K) | ~$0.12 | ~$0.60 | ~$1.20 | ~$1.80 |
| **720p** (Token: $0.014/1K) | $0.2419 | $1.21 | $2.42 | $3.63 |

**계산 공식** (토큰 기준):
```
tokens = (height × width × duration × 24fps) / 1024
cost = tokens × rate_per_1k_tokens

예: 720p (1280×720) × 15s
tokens = (720 × 1280 × 15 × 24) / 1024 = 302,400
cost_fast = 302,400 × 0.014 / 1000 = $4.23
```

**출처**: [Seedance 2.0 Fast 가격](https://fal.ai/models/bytedance/seedance-2.0/fast/text-to-video)

---

## 7. 에러·모더레이션·환불 훅

### 7.1 에러 처리 (fal.ai + Workflow)

```typescript
// Workflow step error handling
workflow.onFailure(async (event) => {
  const { job_id, error } = event.payload;

  // 1. vgen_jobs 업데이트 (failed)
  await supabase
    .from("vgen_jobs")
    .update({
      status: "failed",
      failure_reason: error.message,
      credit_refunded_at: new Date().toISOString(),
    })
    .eq("id", job_id);

  // 2. credit 환불 (보상 트랜잭션)
  const { data: job } = await supabase
    .from("vgen_jobs")
    .select("credit_cost, user_id")
    .eq("id", job_id)
    .single();

  if (job) {
    await supabase
      .from("credits")
      .update({
        balance: supabase.sql`balance + ${job.credit_cost}`,
      })
      .eq("user_id", job.user_id);
  }

  // 3. audit log
  await supabase.from("credit_transactions").insert({
    user_id: job.user_id,
    amount: job.credit_cost,
    reason: "refund_generation_failed",
    job_id,
  });

  console.log(`[refund] job ${job_id} credited ${job.credit_cost}`);
});
```

### 7.2 모더레이션 (사전 + 사후)

```typescript
// Edge Function: 사전 모더레이션 (프롬프트)
const moderationResponse = await fetch(
  "https://api.openai.com/v1/moderations",
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: prompt_text }),
  }
);

const moderation = await moderationResponse.json();
if (moderation.results[0].flagged) {
  // REJECTED 상태로 반환
  return new Response(
    JSON.stringify({
      error: "MODERATION_REJECTED",
      categories: Object.keys(moderation.results[0].categories)
        .filter(k => moderation.results[0].categories[k]),
    }),
    { status: 400 }
  );
}

// Workflow: 사후 모더레이션 (프레임)
// Step: 결과 영상 다운로드 → 3프레임 샘플 (t=0.25s, 0.5s, 0.75s)
// → OpenAI Vision API로 안전성 재검사
// → flagged=true면 status='flagged'으로 저장 (DONE 아님, 관리자 검토 대기)
```

---

## 8. 자주 틀리는 지점

| 실수 | 영향 | 해결 |
|---|---|---|
| **webhook_url 없이 폴링만** | 5~10초 지연 | webhook 등록하되, Workflow sleep 중 비용 미차감 이용 |
| **Edge Function에서 subscribe()** | 120s CPU 초과 + timeout | Workflow로 오케스트레이션 위임 |
| **크레딧 사전 차감** | 거절 후에도 차감됨 | 모더레이션 통과 → 크레딧 차감 순서 변경 |
| **result_url 임시 URL** | 7일 후 404 | R2로 다운로드 후 permanent signed URL 생성 |
| **멱등성 키 없음** | 중복 제출 시 중복 차감 | 10초 버킷 idempotency_key로 UNIQUE 제약 |
| **webhook 서명 미검증** | 위변조 요청 수락 | ED25519 검증 (fal.ai JWKS) |
| **모든 에러에 credit 환불** | 무분별 크레딧 증가 | 서버 에러만 환불, moderation 거절은 환불 안 함 |

---

## 9. 공식 링크 (조회일 2026-07-02)

- [fal.ai 클라이언트 문서](https://fal.ai/docs/clients/javascript)
- [@fal-ai/client npm](https://www.npmjs.com/package/@fal-ai/client)
- [fal.ai 큐 (폴링/webhook)](https://fal.ai/docs/model-apis/model-endpoints/queue)
- [fal.ai 웹훅](https://fal.ai/docs/model-apis/model-endpoints/webhooks)
- [Seedance 2.0 Fast T2V API](https://fal.ai/models/bytedance/seedance-2.0/fast/text-to-video)
- [fal.ai 가격](https://fal.ai/models/bytedance/seedance-2.0/fast/text-to-video) → 비용 최종 확인

---

## 한줄정리

fal.ai는 queue.submit(즉시반환) → webhook(콜백) 또는 queue.status(폴링, 5~10초) → vgen_jobs 동기화(3-way DONE 게이트). 크레딧 차감은 moderation 통과 후 이뤄지고, 실패 시 보상 트랜잭션으로 환불한다. Cloudflare Workflows 권장(Edge Function은 120s CPU 제한).

