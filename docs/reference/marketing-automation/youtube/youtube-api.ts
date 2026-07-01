/**
 * YouTube Data API v3 — 비공개 업로드 + brief 자동 연결.
 *
 * 흐름:
 *   1. OAuth2 refresh token → access token 갱신
 *   2. videos.insert (privacyStatus: "private") → videoId
 *   3. thumbnails.set (있으면) → 썸네일 업로드
 *   4. ChannelPublishResult 반환 (publishedUrl = youtube watch URL)
 *
 * 환경변수:
 *   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
 *
 * 할당량: 업로드 1건 = 1,600 유닛 (일일 10,000 기본)
 */

import fs from "fs/promises";
import path from "path";
import type { PublishPayload } from "../types";
import { BRAND_NAME, SITE_URL, THREADS_HANDLE, PODCAST_URL } from "../brand";
import type {
  ChannelPublisher,
  ChannelPublishResult,
} from "./channel-types";
import { fetchWithRetry } from "./fetch-with-retry";

const YOUTUBE_API_BASE = "https://www.googleapis.com";
const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface YouTubeApiOptions {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  /** 기본 privacyStatus (기본: "private") */
  privacyStatus?: "private" | "unlisted" | "public";
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface VideoInsertResponse {
  id: string;
  snippet: { title: string; publishedAt: string };
  status: { privacyStatus: string; uploadStatus: string };
}

/** OAuth2 refresh token으로 access token 갱신 */
async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const response = await fetchWithRetry(YOUTUBE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`YouTube token refresh failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as TokenResponse;
  return data.access_token;
}

/** YouTube 설명 텍스트 생성 (locale-aware) */
function buildDescription(payload: PublishPayload, briefUrl: string, locale?: string): string {
  const rawBody = payload.markdownBody ?? payload.htmlBody ?? "";
  const tags =
    payload.tags && payload.tags.length > 0
      ? "\n\n" + payload.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")
      : "";

  const isEs = locale === "es";
  const links = [
    `📄 ${isEs ? "Brief completo" : "Full Brief"}: ${briefUrl}`,
    `🧵 Threads: https://threads.net/@${THREADS_HANDLE}`,
    `🎙️ Podcast: ${PODCAST_URL}`,
    `🌐 ${isEs ? "Sitio web" : "Website"}: ${SITE_URL}`,
  ].join("\n");

  const tagline = isEs
    ? `Powered by ${BRAND_NAME} | Resúmenes diarios de IA y tecnología`
    : `Powered by ${BRAND_NAME} | AI-curated tech insights`;

  // YouTube description 한도: 5000자. 여유 있게 4800자로 하드캡.
  // suffix(links + tags + tagline)를 먼저 확보하고 body를 잘라낸다.
  const suffix = `\n\n${links}${tags}\n\n---\n${tagline}`;
  const MAX_TOTAL = 4800;
  const maxBodyLen = MAX_TOTAL - suffix.length;
  const body =
    rawBody.length > maxBodyLen
      ? rawBody.slice(0, maxBodyLen - 3) + "..."
      : rawBody;

  return `${body}${suffix}`;
}

/** 비디오 파일 업로드 (resumable upload) */
async function uploadVideo(
  accessToken: string,
  videoFilePath: string,
  metadata: {
    title: string;
    description: string;
    tags: string[];
    categoryId: string;
    privacyStatus: string;
    defaultLanguage: string;
  },
): Promise<VideoInsertResponse> {
  // Step 1: 업로드 세션 시작 (resumable)
  const initResponse = await fetchWithRetry(
    `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/*",
      },
      body: JSON.stringify({
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: metadata.categoryId,
          defaultLanguage: metadata.defaultLanguage,
        },
        status: {
          privacyStatus: metadata.privacyStatus,
          selfDeclaredMadeForKids: false,
        },
      }),
    },
  );

  if (!initResponse.ok) {
    const text = await initResponse.text();
    throw new Error(`YouTube upload init failed (${initResponse.status}): ${text}`);
  }

  const uploadUrl = initResponse.headers.get("location");
  if (!uploadUrl) {
    throw new Error("YouTube upload URL not returned in Location header");
  }

  // Step 2: 비디오 파일 업로드
  const videoBuffer = await fs.readFile(videoFilePath);
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "video/*",
      "Content-Length": String(videoBuffer.length),
    },
    body: videoBuffer,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`YouTube video upload failed (${uploadResponse.status}): ${text}`);
  }

  return (await uploadResponse.json()) as VideoInsertResponse;
}

/** 썸네일 업로드 */
async function uploadThumbnail(
  accessToken: string,
  videoId: string,
  thumbnailPath: string,
): Promise<void> {
  const thumbBuffer = await fs.readFile(thumbnailPath);
  const ext = path.extname(thumbnailPath).toLowerCase();
  const contentType =
    ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";

  const response = await fetchWithRetry(
    `${YOUTUBE_UPLOAD_URL.replace("/videos", "/thumbnails/set")}?videoId=${videoId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
        "Content-Length": String(thumbBuffer.length),
      },
      body: thumbBuffer,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    console.warn(`YouTube thumbnail upload failed (${response.status}): ${text}`);
    // 썸네일 실패는 치명적이지 않음 — 비디오 업로드 성공은 유지
  }
}

export interface YouTubeApiPublishContext {
  /** 비디오 파일 경로 */
  videoFilePath: string;
  /** 썸네일 파일 경로 (선택) */
  thumbnailFilePath?: string;
  /** brief slug (link-youtube 연동용) */
  briefSlug: string;
  /** brief URL */
  briefUrl?: string;
  /** 언어 */
  language?: string;
}

/**
 * YouTube API Publisher — 비공개 업로드 후 videoId 반환.
 * 운영자가 YouTube Studio에서 확인 후 공개 전환.
 */
export function createYouTubeApiPublisher(
  context: YouTubeApiPublishContext,
  options?: YouTubeApiOptions,
): ChannelPublisher {
  const clientId = options?.clientId ?? process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = options?.clientSecret ?? process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = options?.refreshToken ?? process.env.YOUTUBE_REFRESH_TOKEN;
  const privacyStatus = options?.privacyStatus ?? "private";

  function assertCredentials() {
    if (!clientId) throw new Error("YOUTUBE_CLIENT_ID not configured");
    if (!clientSecret) throw new Error("YOUTUBE_CLIENT_SECRET not configured");
    if (!refreshToken) throw new Error("YOUTUBE_REFRESH_TOKEN not configured");
    return { clientId, clientSecret, refreshToken };
  }

  async function publish(
    payload: PublishPayload,
    opts?: { dryRun?: boolean },
  ): Promise<ChannelPublishResult> {
    if (opts?.dryRun) {
      return {
        channel: "youtube",
        success: true,
        publishedUrl: `https://www.youtube.com/watch?v=DRY_RUN_ID`,
        publishedAt: new Date().toISOString(),
        error: `[DRY RUN] Would upload ${context.videoFilePath} as ${privacyStatus}`,
      };
    }

    try {
      const creds = assertCredentials();

      // 1. Access token 갱신
      console.log("  YouTube: refreshing access token...");
      const accessToken = await refreshAccessToken(
        creds.clientId,
        creds.clientSecret,
        creds.refreshToken,
      );

      // 2. 비디오 파일 존재 확인
      await fs.access(context.videoFilePath);
      const stat = await fs.stat(context.videoFilePath);
      console.log(`  YouTube: uploading ${path.basename(context.videoFilePath)} (${(stat.size / 1024 / 1024).toFixed(1)} MB)...`);

      // 3. 비디오 업로드
      const lang = context.language ?? "en";
      const briefUrl = context.briefUrl ?? `${SITE_URL}/${lang}/brief/${context.briefSlug}`;
      const result = await uploadVideo(accessToken, context.videoFilePath, {
        title: payload.title,
        description: buildDescription(payload, briefUrl, lang),
        tags: [...(payload.tags ?? []), BRAND_NAME, "AI", "Tech News"],
        categoryId: "28", // Science & Technology
        privacyStatus,
        defaultLanguage: lang,
      });

      const videoId = result.id;
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log(`  YouTube: uploaded → ${youtubeUrl} (${privacyStatus})`);

      // 4. 썸네일 업로드 (있으면)
      if (context.thumbnailFilePath) {
        try {
          await fs.access(context.thumbnailFilePath);
          console.log("  YouTube: uploading thumbnail...");
          await uploadThumbnail(accessToken, videoId, context.thumbnailFilePath);
        } catch {
          console.warn("  YouTube: thumbnail not found or upload failed, skipping");
        }
      }

      return {
        channel: "youtube",
        success: true,
        publishedUrl: youtubeUrl,
        publishedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        channel: "youtube",
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    name: "youtube",
    channel: "youtube",
    publish,
  };
}

/** YouTube API 환경변수가 설정되어 있는지 확인 */
export function isYouTubeApiConfigured(): boolean {
  return Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN,
  );
}
