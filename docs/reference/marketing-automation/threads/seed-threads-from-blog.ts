/**
 * seed-threads-from-blog — 신규 블로그 글 → Threads 시드 자동 생성
 * 출처: /Users/family/.claude/plans/unified-finding-yao.md §3.7 (C2.3)
 *
 * 흐름: 블로그 RSS 피드(tailog.kr/feed.xml) 조회 → 신규 글 검출 → 500자 요약 +
 *       링크 + 해시태그 → threads_queue INSERT (status='pending', scheduled_at=다음 발행 슬롯)
 *
 * 호출: 매주 화·금 09:00 자동화 `marketing-threads-publish.prompt.md` 에서 시드 단계로 invoke
 */

import { type EdgeContext, fail, ok, type EdgeResult } from '../_shared/contracts.ts';
import { assertMarketingContentSafe } from '../_shared/marketingPiiGuard.ts';

export interface SeedThreadsRequest {
  feedUrl?: string;
  scheduledAt?: string;
}

export interface SeedThreadsResponse {
  newQueueItems: number;
  skipped: number;
  errors: number;
}

interface FetchClient {
  fetchText(url: string): Promise<string>;
}

interface SupabaseClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
    insert(values: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
}

interface RssItem {
  title: string;
  link: string;
  description: string;
  category: string;
}

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const m of itemMatches) {
    const block = m[1];
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '';
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? '';
    const description = block.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.trim() ?? '';
    const category = block.match(/<category>([\s\S]*?)<\/category>/)?.[1]?.trim() ?? '';
    items.push({ title, link, description, category });
  }
  return items;
}

function categoryToHashtags(category: string): string {
  const map: Record<string, string> = {
    'Tailog 소개': '#반려견행동 #토스앱 #강아지코칭',
    'AI 코칭': '#AI코칭 #강아지행동분석 #반려견',
    '사용 가이드': '#강아지훈련 #반려견기록 #토스미니앱',
    '사례연구': '#반려견사례 #행동변화 #강아지',
  };
  return map[category] ?? '#반려견 #강아지 #Tailog';
}

function buildThreadsText(item: RssItem): string {
  const hashtags = categoryToHashtags(item.category);
  const lead = item.description.length > 280 ? `${item.description.slice(0, 280)}…` : item.description;
  return `${item.title}\n\n${lead}\n\n${hashtags}`;
}

export function createSeedThreadsHandler(deps: {
  supabase: SupabaseClient;
  fetchClient: FetchClient;
}) {
  return async (
    request: SeedThreadsRequest,
    context: EdgeContext
  ): Promise<EdgeResult<SeedThreadsResponse>> => {
    if (context.role !== 'service_role') {
      return fail('AUTH_FORBIDDEN', 'Only service_role can seed threads', 403);
    }

    const feedUrl = request.feedUrl ?? 'https://tailog.kr/feed.xml';
    const scheduledAt = request.scheduledAt ?? new Date().toISOString();

    let xml: string;
    try {
      xml = await deps.fetchClient.fetchText(feedUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return fail('FETCH_ERROR', `Failed to fetch RSS: ${message}`, 502);
    }

    const items = parseRss(xml);
    let newCount = 0;
    let skipped = 0;
    let errors = 0;

    for (const item of items) {
      // 멱등 — 같은 link_url 이미 있으면 skip
      const existing = await deps.supabase
        .from('threads_queue')
        .select('id')
        .eq('link_url', item.link)
        .maybeSingle();
      if (existing.error) {
        errors++;
        continue;
      }
      if (existing.data) {
        skipped++;
        continue;
      }

      const text = buildThreadsText(item);
      try {
        assertMarketingContentSafe(text, `threads-seed-${item.link}`);
      } catch {
        errors++;
        continue;
      }

      const ins = await deps.supabase.from('threads_queue').insert({
        text,
        link_url: item.link,
        status: 'pending',
        scheduled_at: scheduledAt,
        source: 'blog-rss',
      });
      if (ins.error) {
        errors++;
        continue;
      }
      newCount++;
    }

    return ok({ newQueueItems: newCount, skipped, errors });
  };
}
