/**
 * publish-to-threads — Threads Graph API로 큐 1건 발행
 * 출처: mungmungfit/docs/manus-threads-handoff.md:52-92 (Threads Graph API 2단계 흐름)
 *       /Users/family/.claude/plans/unified-finding-yao.md §3.7 (C2.2)
 *
 * 흐름: threads_queue 큐 1건 가져오기 → POST /{user_id}/threads (media_type=TEXT)
 *       → creation_id 획득 → POST /{user_id}/threads_publish → 성공 시 status='published'
 */

import { type EdgeContext, fail, ok, type EdgeResult } from '../_shared/contracts.ts';
import { assertMarketingContentSafe } from '../_shared/marketingPiiGuard.ts';

export interface PublishToThreadsRequest {
  /** 큐 ID. 미지정 시 status='pending' AND scheduled_at <= now() 중 가장 오래된 1건 */
  queueId?: string;
}

export interface PublishToThreadsResponse {
  queueId: string;
  threadsPostId: string;
  publishedAt: string;
}

interface ThreadsQueueRow {
  id: string;
  text: string;
  link_url: string | null;
  status: 'pending' | 'published' | 'failed';
}

interface ThreadsClient {
  createCreation(text: string): Promise<{ creationId: string }>;
  publishCreation(creationId: string): Promise<{ postId: string }>;
}

interface SupabaseClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        single(): Promise<{ data: ThreadsQueueRow | null; error: { message: string } | null }>;
      };
      lte(col: string, val: string): {
        order(col: string, opts: { ascending: boolean }): {
          limit(n: number): {
            maybeSingle(): Promise<{
              data: ThreadsQueueRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    update(values: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{ error: { message: string } | null }>;
    };
  };
}

export function createPublishToThreadsHandler(deps: {
  supabase: SupabaseClient;
  threadsClient: ThreadsClient;
}) {
  return async (
    request: PublishToThreadsRequest,
    context: EdgeContext
  ): Promise<EdgeResult<PublishToThreadsResponse>> => {
    if (context.role !== 'service_role') {
      return fail('AUTH_FORBIDDEN', 'Only service_role can publish to threads', 403);
    }

    // 1. 큐에서 1건 가져오기
    let row: ThreadsQueueRow | null = null;
    if (request.queueId) {
      const r = await deps.supabase
        .from('threads_queue')
        .select('id,text,link_url,status')
        .eq('id', request.queueId)
        .single();
      if (r.error) return fail('DB_ERROR', r.error.message, 502);
      row = r.data;
    } else {
      const r = await deps.supabase
        .from('threads_queue')
        .select('id,text,link_url,status')
        .lte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (r.error) return fail('DB_ERROR', r.error.message, 502);
      row = r.data;
    }
    if (!row) return fail('NO_QUEUE_ITEM', 'No pending threads queue item', 404);
    if (row.status !== 'pending') {
      return fail('INVALID_STATUS', `Queue item is ${row.status}, expected pending`, 409);
    }

    // 2. L11 잠금: PII 검사기 통과 필수
    const fullText = row.link_url ? `${row.text}\n\n${row.link_url}` : row.text;
    assertMarketingContentSafe(fullText, `threads-queue-${row.id}`);

    // 500자 제한 (Threads)
    if (fullText.length > 500) {
      return fail('TEXT_TOO_LONG', `Text length ${fullText.length} > 500 (Threads limit)`, 400);
    }

    try {
      // 3. Threads Graph API: creation_id 생성
      const { creationId } = await deps.threadsClient.createCreation(fullText);

      // 4. Threads Graph API: 발행
      const { postId } = await deps.threadsClient.publishCreation(creationId);

      // 5. 큐 상태 업데이트
      const publishedAt = new Date().toISOString();
      const upd = await deps.supabase
        .from('threads_queue')
        .update({
          status: 'published',
          threads_post_id: postId,
          published_at: publishedAt,
        })
        .eq('id', row.id);
      if (upd.error) return fail('DB_ERROR', upd.error.message, 502);

      return ok({ queueId: row.id, threadsPostId: postId, publishedAt });
    } catch (err) {
      // 실패 시 큐 상태를 failed로
      await deps.supabase.from('threads_queue').update({ status: 'failed' }).eq('id', row.id);
      const message = err instanceof Error ? err.message : String(err);
      return fail('THREADS_API_ERROR', message, 502);
    }
  };
}
