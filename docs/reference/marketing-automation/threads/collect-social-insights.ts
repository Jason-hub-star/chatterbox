/**
 * collect-social-insights — 발행 후 24h 시점에 Instagram·Threads 인사이트 수집
 * 출처: mungmungfit/docs/manus-instagram-handoff.md:133-147, /Users/family/.claude/plans/unified-finding-yao.md §3.7 (C4.3)
 *
 * 흐름:
 *   1. published_at >= now() - 25h AND published_at < now() - 23h 인 queue 가져오기
 *   2. 각 instagram_post_id에 대해 Insights API 호출
 *   3. insights_log INSERT
 */

import { type EdgeContext, fail, ok, type EdgeResult } from '../_shared/contracts.ts';

export interface CollectInsightsRequest {
  platforms?: Array<'instagram' | 'threads'>;
}

export interface CollectInsightsResponse {
  instagramCollected: number;
  threadsCollected: number;
  errors: number;
}

interface InsightsClient {
  fetchInstagramPostInsights(postId: string): Promise<{
    views?: number;
    reach?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    raw: Record<string, unknown>;
  }>;
  fetchThreadsPostInsights(postId: string): Promise<{
    views?: number;
    likes?: number;
    replies?: number;
    raw: Record<string, unknown>;
  }>;
}

interface SupabaseClient {
  from(table: string): {
    select(cols: string): {
      gte(col: string, val: string): {
        lt(col: string, val: string): Promise<{
          data: Array<{ id: string; instagram_post_id?: string; threads_post_id?: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
    insert(values: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
}

export function createCollectInsightsHandler(deps: {
  supabase: SupabaseClient;
  insightsClient: InsightsClient;
}) {
  return async (
    request: CollectInsightsRequest,
    context: EdgeContext
  ): Promise<EdgeResult<CollectInsightsResponse>> => {
    if (context.role !== 'service_role') {
      return fail('AUTH_FORBIDDEN', 'Only service_role can collect insights', 403);
    }

    const platforms = request.platforms ?? ['instagram', 'threads'];
    const now = Date.now();
    const lower = new Date(now - 25 * 60 * 60 * 1000).toISOString();
    const upper = new Date(now - 23 * 60 * 60 * 1000).toISOString();

    let instagramCollected = 0;
    let threadsCollected = 0;
    let errors = 0;

    if (platforms.includes('instagram')) {
      const r = await deps.supabase
        .from('instagram_queue')
        .select('id,instagram_post_id')
        .gte('published_at', lower)
        .lt('published_at', upper);
      if (r.error) return fail('DB_ERROR', r.error.message, 502);
      for (const row of r.data ?? []) {
        if (!row.instagram_post_id) continue;
        try {
          const insights = await deps.insightsClient.fetchInstagramPostInsights(row.instagram_post_id);
          await deps.supabase.from('insights_log').insert({
            queue_id: row.id,
            platform: 'instagram',
            views: insights.views ?? null,
            reach: insights.reach ?? null,
            likes: insights.likes ?? null,
            comments: insights.comments ?? null,
            shares: insights.shares ?? null,
            saves: insights.saves ?? null,
            raw: insights.raw,
          });
          instagramCollected++;
        } catch {
          errors++;
        }
      }
    }

    if (platforms.includes('threads')) {
      const r = await deps.supabase
        .from('threads_queue')
        .select('id,threads_post_id')
        .gte('published_at', lower)
        .lt('published_at', upper);
      if (r.error) return fail('DB_ERROR', r.error.message, 502);
      for (const row of r.data ?? []) {
        if (!row.threads_post_id) continue;
        try {
          const insights = await deps.insightsClient.fetchThreadsPostInsights(row.threads_post_id);
          await deps.supabase.from('insights_log').insert({
            queue_id: row.id,
            platform: 'threads',
            views: insights.views ?? null,
            likes: insights.likes ?? null,
            comments: insights.replies ?? null,
            raw: insights.raw,
          });
          threadsCollected++;
        } catch {
          errors++;
        }
      }
    }

    return ok({ instagramCollected, threadsCollected, errors });
  };
}
