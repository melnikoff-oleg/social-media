export interface ApifyReel {
  videoUrl: string;
  url: string;
  videoPlayCount: number;
  likesCount: number;
  commentsCount: number;
  ownerUsername: string;
  images: string[];
  timestamp: string;
}

interface ApifyProfileResult {
  profilePicUrl: string;
  followersCount: number;
}

export interface CreatorStats {
  profilePicUrl: string;
  followers: number;
  reelsCount30d: number;
  avgViews30d: number;
}

/** Per-request timeout for Apify calls. */
const APIFY_TIMEOUT_MS = 300_000;

function getToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not set");
  return token;
}

export async function scrapeReels(
  username: string,
  maxVideos: number,
  nDays: number
): Promise<ApifyReel[]> {
  const token = getToken();

  const sinceDate = new Date(Date.now() - nDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const response = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
      body: JSON.stringify({
        addParentData: false,
        directUrls: [`https://www.instagram.com/${username}/`],
        enhanceUserSearchWithFacebookPage: false,
        isUserReelFeedURL: false,
        isUserTaggedFeedURL: false,
        onlyPostsNewerThan: sinceDate,
        resultsLimit: maxVideos,
        resultsType: "stories",
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apify error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data as ApifyReel[];
}

export async function scrapeCreatorStats(username: string): Promise<CreatorStats> {
  const token = getToken();

  // 1. Get profile info (details mode)
  const profileRes = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsType: "details",
        resultsLimit: 1,
      }),
    }
  );

  if (!profileRes.ok) {
    const text = await profileRes.text();
    throw new Error(`Apify profile error ${profileRes.status}: ${text}`);
  }

  const profileData = await profileRes.json() as ApifyProfileResult[];
  const profile = profileData[0] || {};
  const profilePicUrl = profile.profilePicUrl || "";
  const followers = profile.followersCount || 0;

  // 2. Get recent posts (last 30 days) to compute activity metrics
  const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const postsRes = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsType: "stories",
        resultsLimit: 100,
        onlyPostsNewerThan: sinceDate,
        addParentData: false,
      }),
    }
  );

  if (!postsRes.ok) {
    const text = await postsRes.text();
    throw new Error(`Apify posts error ${postsRes.status}: ${text}`);
  }

  const posts = await postsRes.json() as ApifyReel[];

  // Filter to only video posts within 30 days
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentReels = posts.filter(
    (p) => p.videoUrl && p.timestamp && new Date(p.timestamp) >= cutoff
  );

  const reelsCount30d = recentReels.length;
  const avgViews30d = reelsCount30d > 0
    ? Math.round(recentReels.reduce((sum, r) => sum + (r.videoPlayCount || 0), 0) / reelsCount30d)
    : 0;

  return { profilePicUrl, followers, reelsCount30d, avgViews30d };
}
