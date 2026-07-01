/**
 * publish-to-instagram — Instagram Graph API로 큐 1건 발행 (text/image/carousel 3종)
 * 출처: mungmungfit/docs/manus-instagram-handoff.md:56-91, /Users/family/.claude/plans/unified-finding-yao.md §3.7 (C3.2)
 *
 * 흐름:
 *   1. instagram_queue 큐 1건 가져오기
 *   2. content_type 별 API 호출
 *      - text: 단일 컨테이너 생성 → publish
 *      - image: media_urls[0] 컨테이너 → publish
 *      - carousel: 각 media_url 컨테이너 → carousel 컨테이너 → publish
 *   3. status='published' + instagram_post_id 저장
 */

import { type EdgeContext, fail, ok, type EdgeResult } from '../_shared/contracts.ts';
import { assertMarketingContentSafe } from '../_shared/marketingPiiGuard.ts';

export interface PublishToInstagramRequest {
  queueId?: string;
}

export interface PublishToInstagramResponse {
  queueId: string;
  instagramPostId: string;
  publishedAt: string;
  contentType: 'text' | 'image' | 'carousel' | 'reel';
}

interface InstagramQueueRow {
  id: string;
  content_type: 'text' | 'image' | 'carousel' | 'reel';
  media_urls: string[];
  caption: string;
  hashtags: string | null;
  link_url: string | null;
  status: 'pending' | 'published' | 'failed' | 'skipped';
}

interface InstagramClient {
  createImageContainer(mediaUrl: string, caption: string): Promise<{ containerId: string }>;
  createCarouselItemContainer(mediaUrl: string): Promise<{ containerId: string }>;
  createCarouselContainer(childContainerIds: string[], caption: string): Promise<{ containerId: string }>;
  publishContainer(containerId: string): Promise<{ postId: string }>;
}

interface SupabaseClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        single(): Promise<{ data: InstagramQueueRow | null; error: { message: string } | null }>;
      };
      lte(col: string, val: string): {
        order(col: string, opts: { ascending: boolean }): {
          limit(n: number): {
            maybeSingle(): Promise<{
              data: InstagramQueueRow | null;
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

export function createPublishToInstagramHandler(deps: {
  supabase: SupabaseClient;
  instagramClient: InstagramClient;
}) {
  return async (
    request: PublishToInstagramRequest,
    context: EdgeContext
  ): Promise<EdgeResult<PublishToInstagramResponse>> => {
    if (context.role !== 'service_role') {
      return fail('AUTH_FORBIDDEN', 'Only service_role can publish to instagram', 403);
    }

    let row: InstagramQueueRow | null = null;
    if (request.queueId) {
      const r = await deps.supabase
        .from('instagram_queue')
        .select('id,content_type,media_urls,caption,hashtags,link_url,status')
        .eq('id', request.queueId)
        .single();
      if (r.error) return fail('DB_ERROR', r.error.message, 502);
      row = r.data;
    } else {
      const r = await deps.supabase
        .from('instagram_queue')
        .select('id,content_type,media_urls,caption,hashtags,link_url,status')
        .lte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (r.error) return fail('DB_ERROR', r.error.message, 502);
      row = r.data;
    }
    if (!row) return fail('NO_QUEUE_ITEM', 'No pending instagram queue item', 404);
    if (row.status !== 'pending') {
      return fail('INVALID_STATUS', `Queue item is ${row.status}, expected pending`, 409);
    }

    // L11 PII 검사
    const fullCaption = row.hashtags ? `${row.caption}\n\n${row.hashtags}` : row.caption;
    assertMarketingContentSafe(fullCaption, `instagram-queue-${row.id}`);

    try {
      let containerId: string;
      if (row.content_type === 'image' || row.content_type === 'text') {
        // 단일 이미지 발행 (Graph API는 text-only 미지원 → image 필수)
        if (row.media_urls.length === 0) {
          return fail('NO_MEDIA', 'Instagram requires at least 1 media URL', 400);
        }
        const r = await deps.instagramClient.createImageContainer(row.media_urls[0], fullCaption);
        containerId = r.containerId;
      } else if (row.content_type === 'carousel') {
        if (row.media_urls.length < 2) {
          return fail('CAROUSEL_TOO_FEW', 'Carousel requires 2+ media URLs', 400);
        }
        // 각 미디어를 캐러셀 아이템 컨테이너로 만든 다음 carousel 컨테이너 생성
        const childContainerIds: string[] = [];
        for (const url of row.media_urls) {
          const r = await deps.instagramClient.createCarouselItemContainer(url);
          childContainerIds.push(r.containerId);
        }
        const r = await deps.instagramClient.createCarouselContainer(childContainerIds, fullCaption);
        containerId = r.containerId;
      } else {
        return fail('UNSUPPORTED_TYPE', `Content type ${row.content_type} not yet supported`, 400);
      }

      const { postId } = await deps.instagramClient.publishContainer(containerId);

      const publishedAt = new Date().toISOString();
      const upd = await deps.supabase
        .from('instagram_queue')
        .update({
          status: 'published',
          instagram_post_id: postId,
          published_at: publishedAt,
        })
        .eq('id', row.id);
      if (upd.error) return fail('DB_ERROR', upd.error.message, 502);

      return ok({
        queueId: row.id,
        instagramPostId: postId,
        publishedAt,
        contentType: row.content_type,
      });
    } catch (err) {
      await deps.supabase.from('instagram_queue').update({ status: 'failed' }).eq('id', row.id);
      const message = err instanceof Error ? err.message : String(err);
      return fail('INSTAGRAM_API_ERROR', message, 502);
    }
  };
}
