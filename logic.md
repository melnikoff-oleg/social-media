# Social Media AI — Complete System Logic & Data Flow Documentation

> **Last Updated:** April 2026  
> **Version:** Next.js App (post n8n migration)  
> **Purpose:** End-to-end technical reference for all data fetching, field mappings, business logic, pipeline flow, content-mix feature, and storage.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack & Environment](#2-tech-stack--environment)
3. [File & Directory Structure](#3-file--directory-structure)
4. [Data Storage — CSV Files](#4-data-storage--csv-files)
   - 4.1 [configs.csv — Field Mapping](#41-configscsv--field-mapping)
   - 4.2 [creators.csv — Field Mapping](#42-creatorscsv--field-mapping)
   - 4.3 [videos.csv — Field Mapping](#43-videoscsv--field-mapping)
5. [TypeScript Interfaces (types.ts)](#5-typescript-interfaces-typests)
6. [CSV Read/Write Logic (csv.ts)](#6-csv-readwrite-logic-csvts)
   - 6.1 [Reading Logic (with null-safety & case-insensitive keys)](#61-reading-logic)
   - 6.2 [Writing Logic](#62-writing-logic)
7. [Apify Scraper (apify.ts)](#7-apify-scraper-apifyts)
   - 7.1 [scrapeReels — How It Works](#71-scrapereels--how-it-works)
   - 7.2 [ApifyReel — Raw Response Field Mapping](#72-apifyreel--raw-response-field-mapping)
   - 7.3 [scrapeCreatorStats — How It Works](#73-scrapecreatorstats--how-it-works)
8. [Pipeline Orchestration (pipeline.ts)](#8-pipeline-orchestration-pipelinets)
   - 8.1 [Phase 1 — Scraping](#81-phase-1--scraping)
   - 8.2 [Phase 2 — Analysis](#82-phase-2--analysis)
   - 8.3 [Concurrency Model](#83-concurrency-model)
   - 8.4 [PipelineProgress Object](#84-pipelineprogress-object)
   - 8.5 [ScrapedVideo → Video Field Mapping](#85-scrapedvideo--video-field-mapping)
9. [Gemini Video Analysis (gemini.ts)](#9-gemini-video-analysis-geminits)
   - 9.1 [uploadVideo — How It Works](#91-uploadvideo--how-it-works)
   - 9.2 [analyzeVideo — How It Works](#92-analyzevideo--how-it-works)
   - 9.3 [Analysis Output Format](#93-analysis-output-format)
10. [Claude Concept Generation (claude.ts)](#10-claude-concept-generation-claudets)
    - 10.1 [generateNewConcepts — How It Works](#101-generatenewconcepts--how-it-works)
    - 10.2 [Prompt Structure](#102-prompt-structure)
    - 10.3 [Output Format](#103-output-format)
11. [Content Mix Feature (mix-concepts.ts)](#11-content-mix-feature-mix-conceptsts)
    - 11.1 [mixVideoConcepts — How It Works](#111-mixvideoconcepts--how-it-works)
    - 11.2 [Prompt Structure](#112-prompt-structure)
    - 11.3 [Output Format](#113-output-format)
12. [API Routes](#12-api-routes)
    - 12.1 [POST /api/pipeline — Pipeline Trigger](#121-post-apipipeline--pipeline-trigger)
    - 12.2 [GET/POST/PUT/DELETE /api/configs — Config CRUD](#122-getpostputdelete-apiconfigs--config-crud)
    - 12.3 [GET/POST/PUT/DELETE /api/creators — Creator CRUD](#123-getpostputdelete-apicreators--creator-crud)
    - 12.4 [POST /api/creators/refresh — Creator Stats Refresh](#124-post-apicreatorssrefresh--creator-stats-refresh)
    - 12.5 [GET/PATCH /api/videos — Video Read & Star](#125-getpatch-apivideos--video-read--star)
    - 12.6 [POST /api/content-mix — Concept Synthesis](#126-post-apicontent-mix--concept-synthesis)
    - 12.7 [GET /api/proxy-image — Image Proxy](#127-get-apiproxy-image--image-proxy)
13. [Frontend Pages & How They Consume Data](#13-frontend-pages--how-they-consume-data)
    - 13.1 [/ Dashboard](#131--dashboard)
    - 13.2 [/run — Pipeline Runner (3-Step Flow)](#132-run--pipeline-runner-3-step-flow)
    - 13.3 [/videos — Videos Browser](#133-videos--videos-browser)
    - 13.4 [/configs — Config Management](#134-configs--config-management)
    - 13.5 [/creators — Creator Management](#135-creators--creator-management)
    - 13.6 [/content-mix — Content Mix](#136-content-mix--content-mix)
14. [Config Field Deep Dive](#14-config-field-deep-dive)
    - 14.1 [analysisInstruction — What Gemini Sees](#141-analysisinstruction--what-gemini-sees)
    - 14.2 [newConceptsInstruction — What Gemini (concepts) Sees](#142-newconceptsinstruction--what-gemini-concepts-sees)
    - 14.3 [creatorsCategory — How It Links Configs to Creators](#143-creatorscategory--how-it-links-configs-to-creators)
15. [End-to-End Data Flow Diagram](#15-end-to-end-data-flow-diagram)
16. [Known Issues & Notes](#16-known-issues--notes)

---

## 1. System Overview

**Social Media AI** is a local Next.js web application that automates competitive Instagram Reel analysis and content ideation for brands.

### Purpose
Given a set of competitor Instagram accounts (creators) and a configuration (prompts + category), the system:
1. **Scrapes** recent Instagram Reels for each competitor using the Apify `apify~instagram-scraper` actor
2. **Filters & Ranks** by date and view count
3. **Analyzes** top videos by uploading them to Google Gemini 2.5 Flash (multimodal video understanding)
4. **Generates** new adapted video concepts for the target brand using Google Gemini 2.5 Pro
5. **Stores** all results in local CSV files for browsing and mixing

### Key Design Decisions
- **CSV-based storage** (no database) — fast, inspectable, portable
- **Two-phase pipeline** — Phase 1 (scraping) fetches candidates, user picks which ones to analyze; Phase 2 (analysis) runs AI on selected videos only
- **Server-Sent Events (SSE)** — both pipeline and creator-refresh stream live progress to the frontend
- **3 concurrent workers** for video analysis to balance speed vs. API rate limits

---

## 2. Tech Stack & Environment

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 App Router + TypeScript |
| Styling | Tailwind CSS + shadcn/ui components |
| Storage | CSV files (csv-parse, csv-stringify) |
| Scraping | Apify `apify~instagram-scraper` |
| Video Analysis | Google Gemini 2.5 Flash (multimodal upload) |
| Concept Generation | Google Gemini 2.5 Pro (text generation) |
| Content Mix | Google Gemini 2.5 Pro (concept synthesis) |
| IDs | uuid v4 |

### Environment Variables (`.env` at project root)
| Variable | Used In | Purpose |
|----------|---------|---------|
| `APIFY_API_TOKEN` | `lib/apify.ts` | Authenticate all Apify REST API calls |
| `GEMINI_API_KEY` | `lib/gemini.ts`, `lib/claude.ts`, `lib/mix-concepts.ts` | Google Gemini API (video upload, analysis, concept generation, synthesis) |
| `ANTHROPIC_API_KEY` | `.env` only (not currently used in code) | Originally planned for Claude SDK; Gemini Pro is used instead |

> **Note:** `claude.ts` and `mix-concepts.ts` both use `GEMINI_API_KEY` (not Anthropic), despite the filenames suggesting otherwise. The system migrated from Claude to Gemini Pro for concept generation.

---

## 3. File & Directory Structure

```
social-media-reel/
├── .env                                    # API keys (not committed)
├── CLAUDE.md                               # Project overview for Claude Code
├── logic.md                                # This documentation file
│
├── data/                                   # CSV data storage (persistent)
│   ├── configs.csv                         # Pipeline configurations
│   ├── creators.csv                        # Instagram competitor accounts
│   └── videos.csv                          # Analyzed video results + AI output
│
├── context/                                # Background context files
│   ├── business-info.md                    # Business description & use cases
│   ├── strategy.md                         # Current status & next steps
│   ├── current-data.md                     # Data file summary
│   └── personal-info.md                    # Personal brand context
│
├── plans/                                  # Implementation plans (historical)
│   └── 2026-03-06-n8n-to-nextjs-migration.md
│
├── scripts/                                # Standalone analysis scripts
│   ├── analyze-my-reels.mjs                # Analyze own reels (standalone)
│   ├── tiktok-ai-trends.mjs               # TikTok trend analysis (standalone)
│   ├── build-presentation.py              # Generate markdown presentations
│   └── build-html-presentation.py         # Generate HTML presentations
│
└── app/                                    # Next.js application
    └── src/
        ├── app/                            # Pages & API routes
        │   ├── page.tsx                    # Dashboard (redirect to /videos)
        │   ├── layout.tsx                  # Root layout with sidebar
        │   ├── globals.css                 # Global styles
        │   ├── run/page.tsx                # Pipeline runner (3-step UI)
        │   ├── videos/page.tsx             # Videos browser with thumbnails
        │   ├── configs/page.tsx            # Config management CRUD
        │   ├── creators/page.tsx           # Creator management CRUD
        │   ├── content-mix/page.tsx        # Content mix feature
        │   └── api/
        │       ├── pipeline/route.ts       # POST — run pipeline (SSE)
        │       ├── configs/route.ts        # GET/POST/PUT/DELETE
        │       ├── creators/
        │       │   ├── route.ts            # GET/POST/PUT/DELETE
        │       │   └── refresh/route.ts    # POST — refresh stats (SSE)
        │       ├── videos/route.ts         # GET/PATCH
        │       ├── content-mix/route.ts    # POST — synthesize concepts
        │       └── proxy-image/route.ts    # GET — proxy Instagram images
        │
        ├── lib/                            # Core business logic
        │   ├── types.ts                    # TypeScript interfaces
        │   ├── csv.ts                      # CSV read/write utilities
        │   ├── apify.ts                    # Apify Instagram scraper client
        │   ├── gemini.ts                   # Gemini video upload & analysis
        │   ├── claude.ts                   # Concept generation (Gemini Pro)
        │   ├── mix-concepts.ts             # Content mix synthesis (Gemini Pro)
        │   └── utils.ts                    # Minor utilities (cn)
        │
        ├── components/                     # UI components
        │   ├── app-sidebar.tsx             # Navigation sidebar
        │   ├── top-bar.tsx                 # Top nav bar
        │   ├── markdown-content.tsx        # Markdown renderer component
        │   └── ui/                         # shadcn/ui base components
        │
        ├── context/
        │   └── pipeline-context.tsx        # React context for pipeline state
        │
        └── hooks/                          # Custom React hooks
```

---

## 4. Data Storage — CSV Files

All data is stored as flat CSV files in the `data/` directory. The `DATA_DIR` is resolved relative to the Next.js app's working directory (`process.cwd()/../data` → `social-media-reel/data/`).

---

### 4.1 configs.csv — Field Mapping

**File path:** `data/configs.csv`  
**Written columns (order matters for CSV serialization):**

| Column | Type | Description |
|--------|------|-------------|
| `id` | string (UUID v4) | Unique identifier, generated on creation |
| `configName` | string | Human-readable name, used to link pipeline runs |
| `creatorsCategory` | string | Category slug that matches `creators.csv` → `category` field |
| `analysisInstruction` | string (long text) | Markdown prompt sent to Gemini for video analysis |
| `newConceptsInstruction` | string (long text) | Markdown prompt sent to Gemini (concept gen) for concept adaptation |

**Example row (simplified):**
```
id,configName,creatorsCategory,analysisInstruction,newConceptsInstruction
4bfa69dd-...,AI Blog Content,ai-creators,"# CONCEPT ...","Adapt this for Oleg..."
```

**How `creatorsCategory` links to `creators.csv`:**
- `configs.creatorsCategory` must exactly match `creators.category` (case-sensitive in CSV, case-insensitive in `readCreators()` helper)
- When a pipeline run is triggered with config `AI Blog Content`, only creators with `category = ai-creators` are scraped

**Current configs in the system:**
| configName | creatorsCategory |
|-----------|-----------------|
| AI Blog Content | ai-creators |
| Real Estate Videos Fabo | dubai-real-estate |
| D2C Shoes India | d2c-footwear |
| Demi-Fine Jewellery India | Demi-fine jewellery |
| Artist-Inspired Jewelry Strategy | citizen_theartist |

---

### 4.2 creators.csv — Field Mapping

**File path:** `data/creators.csv`  
**Written columns (order matters):**

| Column | Type | Description |
|--------|------|-------------|
| `id` | string (UUID v4) | Unique identifier |
| `username` | string | Instagram handle (no @) |
| `category` | string | Must match a `creatorsCategory` in configs |
| `profilePicUrl` | string (URL) | Instagram CDN URL to profile picture |
| `followers` | number (int) | Total follower count (scraped from Apify) |
| `reelsCount30d` | number (int) | Number of Reels posted in last 30 days |
| `avgViews30d` | number (int) | Average views per Reel in last 30 days |
| `lastScrapedAt` | string (ISO 8601) | Timestamp of last Apify stats refresh |

**Special notes on reading:**
- `readCreators()` uses a **case-insensitive key lookup** with BOM stripping (`\uFEFF`) to handle headers that may have invisible characters or different casing from manual CSV edits
- Numeric fields (`followers`, `reelsCount30d`, `avgViews30d`) are parsed with `parseInt(..., 10) || 0` — defaults to 0 if missing/NaN

**Current creators in the system:**
| username | category |
|---------|---------|
| gullylabs | d2c-footwear |
| palmonas_official | Demi-fine jewellery |
| citizen_theartist | citizen_theartist |

---

### 4.3 videos.csv — Field Mapping

**File path:** `data/videos.csv`  
**Written columns (order matters):**

| Column | Type | Description |
|--------|------|-------------|
| `id` | string (UUID v4) | Unique identifier, generated at analysis time |
| `link` | string (URL) | Instagram post URL (e.g., `https://www.instagram.com/p/ABC123/`) |
| `thumbnail` | string (URL) | Instagram CDN thumbnail image URL |
| `creator` | string | Instagram username (no @) |
| `views` | number (int) | Total video play count |
| `likes` | number (int) | Total likes count |
| `comments` | number (int) | Total comments count |
| `analysis` | string (long markdown) | Full Gemini video analysis output (CONCEPT / HOOK / RETENTION / REWARD / SCRIPT) |
| `newConcepts` | string (long markdown) | Full Gemini concept generation output (3× CONCEPT / HOOK / SCRIPT) |
| `datePosted` | string (YYYY-MM-DD) | Date the original Instagram Reel was posted |
| `dateAdded` | string (YYYY-MM-DD) | Date the video was processed by this system |
| `configName` | string | Name of the config used to analyze this video |
| `starred` | string (`"true"` / `""`) | Whether the user has starred/bookmarked this video |

**Reading fallback aliases (for backward compatibility):**

| Canonical Field | Also Reads From |
|----------------|----------------|
| `link` | `r.link` OR `r.Link` |
| `thumbnail` | `r.thumbnail` OR `r.Thumbnail` |
| `creator` | `r.creator` OR `r.Creator` |
| `views` | `r.views` OR `r.Views` |
| `likes` | `r.likes` OR `r.Likes` |
| `comments` | `r.comments` OR `r.Comments` |
| `analysis` | `r.analysis` OR `r.Analysis` |
| `newConcepts` | `r.newConcepts` OR `r["New Concepts"]` |
| `datePosted` | `r.datePosted` OR `r["Date Posted"]` |
| `dateAdded` | `r.dateAdded` OR `r["Date Added"]` |
| `configName` | `r.configName` OR `r["Config Name"]` |
| `starred` | `r.starred === "true"` (boolean parse) |

> These aliases exist because older versions (and manual CSV edits) used different column names or capitalization.

---

## 5. TypeScript Interfaces (types.ts)

Located: `app/src/lib/types.ts`

```typescript
// Config — one pipeline configuration
interface Config {
  id: string;
  configName: string;
  creatorsCategory: string;
  analysisInstruction: string;
  newConceptsInstruction: string;
}

// Creator — one competitor Instagram account
interface Creator {
  id: string;
  username: string;
  category: string;
  profilePicUrl: string;
  followers: number;
  reelsCount30d: number;
  avgViews30d: number;
  lastScrapedAt: string;
}

// Video — one analyzed reel stored in videos.csv
interface Video {
  id: string;
  link: string;
  thumbnail: string;
  creator: string;
  views: number;
  likes: number;
  comments: number;
  analysis: string;
  newConcepts: string;
  datePosted: string;
  dateAdded: string;
  configName: string;
  starred: boolean;
}

// ScrapedVideo — intermediate type from Apify, before AI analysis
interface ScrapedVideo {
  videoUrl: string;
  postUrl: string;
  views: number;
  likes: number;
  comments: number;
  username: string;
  thumbnail: string;
  datePosted: string;
}

// PipelineParams — sent from frontend to /api/pipeline
interface PipelineParams {
  configName: string;
  maxVideos: number;
  topK: number;
  nDays: number;
  selectedVideos?: ScrapedVideo[];  // Only set in Phase 2 (analysis)
}

// ActiveTask — one in-progress video being processed (for live UI)
interface ActiveTask {
  id: string;
  creator: string;
  step: string;
  views?: number;
}

// PipelineProgress — streamed via SSE to the frontend
interface PipelineProgress {
  status: "idle" | "running" | "completed" | "error";
  phase: "scraping" | "analyzing" | "done";
  activeTasks: ActiveTask[];
  creatorsCompleted: number;
  creatorsTotal: number;
  creatorsScraped: number;
  videosAnalyzed: number;
  videosTotal: number;
  errors: string[];
  log: string[];
  candidates?: ScrapedVideo[];  // Set after Phase 1 completes
}

// ApifyReel — raw item returned by Apify Instagram scraper
interface ApifyReel {
  videoUrl: string;
  url: string;
  videoPlayCount: number;
  likesCount: number;
  commentsCount: number;
  ownerUsername: string;
  images: string[];
  timestamp: string;
}

// CreatorStats — returned by scrapeCreatorStats()
interface CreatorStats {
  profilePicUrl: string;
  followers: number;
  reelsCount30d: number;
  avgViews30d: number;
}
```

---

## 6. CSV Read/Write Logic (csv.ts)

Located: `app/src/lib/csv.ts`

### 6.1 Reading Logic

```
readCsv<T>(filename) →
  1. Build path: DATA_DIR / filename
  2. If file doesn't exist → return []
  3. If file is empty/whitespace → return []
  4. Parse with csv-parse/sync options:
     - columns: true          (first row as header)
     - skip_empty_lines: true
     - relax_column_count: true  (handle rows with extra/missing columns)
  5. Return typed array T[]
```

**Special handling per entity:**

**`readConfigs()`:** Direct pass-through — no transformation. Returns `Config[]`.

**`readCreators()`:**
- Additional step: for each row, use a `getVal(key)` helper that:
  - Strips BOM (`\uFEFF`) from key names
  - Trims whitespace
  - Case-insensitively matches against all actual keys
  - Returns `""` if not found (never throws)
- Parses `followers`, `reelsCount30d`, `avgViews30d` as integers with `|| 0` fallback

**`readVideos()`:**
- Maps each raw row with dual-key fallback (lowercase and capitalized versions)
- Maps `r.starred === "true"` to boolean (false if absent or any other value)
- Defaults all numeric fields to `0`
- Defaults all string fields to `""`

### 6.2 Writing Logic

```
writeCsv(filename, data[], columns[]) →
  1. ensureDataDir() — create data/ if missing
  2. Build path: DATA_DIR / filename
  3. Serialize with csv-stringify/sync:
     - header: true
     - columns: explicit column array (enforces column order)
  4. writeFileSync(path, output, "utf-8") — overwrites entire file
```

**Column orders (frozen):**
- `configs.csv`: `["id", "configName", "creatorsCategory", "analysisInstruction", "newConceptsInstruction"]`
- `creators.csv`: `["id", "username", "category", "profilePicUrl", "followers", "reelsCount30d", "avgViews30d", "lastScrapedAt"]`
- `videos.csv`: `["id", "link", "thumbnail", "creator", "views", "likes", "comments", "analysis", "newConcepts", "datePosted", "dateAdded", "configName", "starred"]`

**`appendVideo(video)`:** Reads existing videos → pushes new one → rewrites entire file.

> ⚠️ All writes are **full file rewrites**. There is no partial update or append-only mode (except via `appendVideo` which still rewrites the full file).

---

## 7. Apify Scraper (apify.ts)

Located: `app/src/lib/apify.ts`

**Apify Actor used:** `apify~instagram-scraper`  
**API Base:** `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token={APIFY_API_TOKEN}`

---

### 7.1 scrapeReels — How It Works

```
scrapeReels(username, maxVideos, nDays) →
  1. Compute sinceDate = today minus nDays (ISO date string YYYY-MM-DD)
  2. POST to Apify run-sync endpoint
  3. Body:
     {
       addParentData: false,
       directUrls: ["https://www.instagram.com/{username}/"],
       enhanceUserSearchWithFacebookPage: false,
       isUserReelFeedURL: false,
       isUserTaggedFeedURL: false,
       onlyPostsNewerThan: sinceDate,
       resultsLimit: maxVideos,
       resultsType: "stories"     ← NOTE: configured as "stories" not "reels"
     }
  4. Returns raw ApifyReel[] array
  5. On non-OK response: throws error with status + body
```

> ⚠️ **Known Issue:** `resultsType` is set to `"stories"` instead of `"reels"`. This may affect which content is returned. The correct value for Instagram Reels would be `"reels"` (or `"posts"` for all media).

---

### 7.2 ApifyReel — Raw Response Field Mapping

How Apify fields map to internal `ScrapedVideo` fields (transformation happens in `pipeline.ts`):

| ApifyReel Field | ScrapedVideo Field | Notes |
|----------------|--------------------|-------|
| `r.videoUrl` | `videoUrl` | Direct URL to the video MP4 |
| `r.url` | `postUrl` | Instagram post page URL |
| `r.videoPlayCount` | `views` | `|| 0` fallback |
| `r.likesCount` | `likes` | `|| 0` fallback |
| `r.commentsCount` | `comments` | `|| 0` fallback |
| `r.ownerUsername` | `username` | Falls back to `creator.username` if missing |
| `r.images[0]` | `thumbnail` | First image URL from Apify, `|| ""` |
| `r.timestamp.split("T")[0]` | `datePosted` | Converts ISO datetime to YYYY-MM-DD date |

**Filtering applied before mapping:**
- `r.videoUrl` must be truthy (filter out non-video posts)
- `r.timestamp` must be truthy (filter out items without timestamp)

**Sorting:** Videos sorted descending by `views` before `topK` is applied.

---

### 7.3 scrapeCreatorStats — How It Works

This is a two-request sequence:

**Request 1 — Profile Details:**
```
POST Apify with:
  { directUrls: ["https://www.instagram.com/{username}/"],
    resultsType: "details",
    resultsLimit: 1 }

Reads from response[0]:
  profilePicUrl = data.profilePicUrl || ""
  followers     = data.followersCount || 0
```

**Request 2 — Recent Posts for Activity Metrics:**
```
POST Apify with:
  { directUrls: ["https://www.instagram.com/{username}/"],
    resultsType: "stories",    ← Same issue as scrapeReels
    resultsLimit: 100,
    onlyPostsNewerThan: sinceDate (30 days ago),
    addParentData: false }

Then filters:
  recentReels = posts where (p.videoUrl && p.timestamp && new Date(p.timestamp) >= cutoff)

Computes:
  reelsCount30d = recentReels.length
  avgViews30d   = round(sum(r.videoPlayCount || 0) / reelsCount30d)  or 0 if none
```

**Returns `CreatorStats`:**
```typescript
{ profilePicUrl, followers, reelsCount30d, avgViews30d }
```

---

## 8. Pipeline Orchestration (pipeline.ts)

Located: `app/src/lib/pipeline.ts`

The pipeline is designed as a **two-phase, two-call system**:
- **Call 1** (Phase 1): No `selectedVideos` in params → scrapes and returns candidates
- **Call 2** (Phase 2): `selectedVideos` is populated → analyzes and saves results

---

### 8.1 Phase 1 — Scraping

```
runPipeline({ configName, maxVideos, topK, nDays }) →

1. readConfigs() → find config by configName
2. readCreators() → filter by config.creatorsCategory
3. If no matching creators → throw error
4. For each creator (in PARALLEL via Promise.allSettled):
   a. scrapeReels(creator.username, maxVideos, nDays)
   b. Filter results: keep only items with videoUrl AND timestamp
   c. Map ApifyReel → ScrapedVideo (see §7.2 field mapping)
   d. Apply date filter: timestamp >= cutoffDate (today minus nDays)
   e. Sort by views DESC
   f. Take top topK videos
5. Aggregate all topVideos from all creators → allTopVideos
6. Emit progress with candidates = allTopVideos
7. RETURN — pipeline stops here and waits for user selection
```

**Progress fields emitted during Phase 1:**
- `phase = "scraping"`
- `creatorsTotal = creators.length`
- `creatorsScraped++` per creator finished
- `creatorsCompleted++` per creator (including errored ones)
- `candidates = allTopVideos` at the end
- `status = "completed"` + `phase = "done"` at the end

---

### 8.2 Phase 2 — Analysis

```
runPipeline({ configName, maxVideos, topK, nDays, selectedVideos }) →

1. readConfigs() → find config by configName (same as Phase 1)
2. videosToAnalyze = selectedVideos (skip scraping entirely)
3. Process videos with concurrency=3 (runWithConcurrency):
   For each ScrapedVideo:
   a. fetch(video.videoUrl) → download MP4 as ArrayBuffer
   b. uploadVideo(buffer, contentType) → Gemini Files API
   c. waitForFileActive() → poll until file.state === "ACTIVE"
   d. analyzeVideo(fileUri, mimeType, config.analysisInstruction)
   e. generateNewConcepts(analysis, config.newConceptsInstruction)
   f. Build Video record (see §8.5 field mapping)
   g. Push to newVideos[]
4. writeVideos([...existing, ...newVideos]) → save all at once
5. Emit status = "completed", phase = "done"
```

**Progress fields emitted during Phase 2:**
- `phase = "analyzing"`
- `videosTotal = selectedVideos.length`
- `videosAnalyzed++` per video completed
- `activeTasks` updated per video step: "Downloading" → "Uploading to Gemini" → "Gemini analyzing" → "Generating concepts"
- `errors[]` updated per failed video (does not abort other videos)

---

### 8.3 Concurrency Model

```typescript
const VIDEO_CONCURRENCY = 3;

runWithConcurrency(items, 3, async (item) => { ... })
// Creates min(3, items.length) worker coroutines
// Each worker loops through items using a shared index counter
// Workers run concurrently via Promise.all
```

This means up to 3 videos are downloaded, uploaded, and analyzed simultaneously. Workers pick up the next video as soon as they finish one.

---

### 8.4 PipelineProgress Object

The full progress object streamed via SSE:

```typescript
{
  status: "running" | "completed" | "error",
  phase: "scraping" | "analyzing" | "done",
  activeTasks: [{ id, creator, step, views }],
  creatorsCompleted: number,   // Phase 1 only
  creatorsTotal: number,       // Phase 1 only
  creatorsScraped: number,     // Phase 1 only
  videosAnalyzed: number,      // Phase 2 only
  videosTotal: number,         // Phase 2 only
  errors: string[],
  log: string[],               // Timestamped log lines
  candidates?: ScrapedVideo[]  // Phase 1 result only
}
```

---

### 8.5 ScrapedVideo → Video Field Mapping

How a `ScrapedVideo` (from Phase 1) becomes a `Video` (stored in videos.csv) after Phase 2:

| Video Field | Source | Notes |
|------------|--------|-------|
| `id` | `uuid()` | New UUID generated at analysis time |
| `link` | `video.postUrl` | Instagram post URL from Apify |
| `thumbnail` | `video.thumbnail` | CDN URL from Apify `images[0]` |
| `creator` | `video.username` | Instagram handle |
| `views` | `video.views` | `videoPlayCount` from Apify |
| `likes` | `video.likes` | `likesCount` from Apify |
| `comments` | `video.comments` | `commentsCount` from Apify |
| `analysis` | `analyzeVideo(...)` | Gemini Flash output (markdown) |
| `newConcepts` | `generateNewConcepts(...)` | Gemini Pro output (markdown) |
| `datePosted` | `video.datePosted` | YYYY-MM-DD from Apify timestamp |
| `dateAdded` | `new Date().toISOString().slice(0, 10)` | Today's date when processed |
| `configName` | `params.configName` | From pipeline call parameters |
| `starred` | `false` | Always starts unstarred |

---

## 9. Gemini Video Analysis (gemini.ts)

Located: `app/src/lib/gemini.ts`

**Model for analysis:** `gemini-2.5-flash` (previously `gemini-2.0-flash`)  
**API Base:** `https://generativelanguage.googleapis.com`

---

### 9.1 uploadVideo — How It Works

```
uploadVideo(videoBuffer: Buffer, mimeType: string) →

1. POST https://generativelanguage.googleapis.com/upload/v1beta/files?key={KEY}
   Headers:
     X-Goog-Upload-Command: "start, upload, finalize"
     X-Goog-Upload-Header-Content-Length: <buffer.length>
     X-Goog-Upload-Header-Content-Type: <mimeType>
     Content-Type: <mimeType>
   Body: Uint8Array(videoBuffer)

2. Response contains:
   data.file.name    → fileName (e.g., "files/abc123")
   data.file.uri     → fileUri (used in analyzeVideo)
   data.file.mimeType → fileMimeType

3. waitForFileActive(fileName):
   Poll: GET https://generativelanguage.googleapis.com/v1beta/{fileName}?key={KEY}
   Until data.state === "ACTIVE"
   Retry every 3 seconds, up to 120 seconds
   Throws if state === "FAILED" or timeout exceeded

4. Returns { uri: fileUri, mimeType: fileMimeType }
```

---

### 9.2 analyzeVideo — How It Works

```
analyzeVideo(fileUri, mimeType, analysisPrompt, maxRetries=3) →

POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={KEY}
Body:
  {
    contents: [{
      role: "user",
      parts: [
        { fileData: { fileUri, mimeType } },   ← The uploaded video
        { text: analysisPrompt }                ← From config.analysisInstruction
      ]
    }]
  }

Response: data.candidates[0].content.parts[0].text

Post-processing:
  hashIndex = text.indexOf("#")
  return hashIndex >= 0 ? text.substring(hashIndex) : text
  → Strips any preamble before the first markdown heading

Retry logic:
  Up to 3 attempts
  5-second wait between retries
  On final failure: throw
```

---

### 9.3 Analysis Output Format

The `analysisInstruction` prompt tells Gemini to structure its output in markdown sections. The standard analysis output has 5 sections:

```markdown
# CONCEPT
[1-3 sentences: core idea, tension, promise]

# HOOK
[First 5 seconds breakdown]
- VISUAL: [what is seen in first 1-2 seconds]
- TEXT: [on-screen text]
- AUDIO: [first spoken words or music]

# RETENTION MECHANISMS
[How the creator keeps viewers watching]
- Open loops
- Delayed payoff
- Micro-escalations
- Pattern interrupts

# REWARD
[What the viewer gets by finishing the video]
- Type: Education / Entertainment / Inspiration

# SCRIPT
[Full reconstructed script, scene by scene]
1. [Immediate hook]
2. [Problem framing]
3. [Stakes]
4. [Main insight]
5. [Close]
```

---

## 10. Claude Concept Generation (claude.ts)

Located: `app/src/lib/claude.ts`

> ⚠️ **Note:** Despite the filename `claude.ts`, this module uses **Google Gemini 2.5 Pro**, not Anthropic Claude. The function name `generateNewConcepts` is correct.

**Model:** `gemini-2.5-pro`  
**API:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={GEMINI_API_KEY}`

---

### 10.1 generateNewConcepts — How It Works

```
generateNewConcepts(videoAnalysis: string, newConceptsPrompt: string) →

1. Build composed prompt (see §10.2)
2. POST to Gemini Pro generateContent
   generationConfig:
     temperature: 0.7
     maxOutputTokens: 4096
3. Return data.candidates[0].content.parts[0].text || ""
```

---

### 10.2 Prompt Structure

The full prompt sent to Gemini Pro is a composed multi-section prompt:

```
# ROLE
You're an expert in creating viral Reels on Instagram.

# OBJECTIVE
Take as input viral video from my competitor and based on it generate new concepts for me. Adapt this reference for me.

# REFERENCE VIDEO DESCRIPTION
------
{videoAnalysis}       ← Full Gemini Flash analysis output (markdown)
------

# MY INSTRUCTIONS FOR NEW CONCEPTS
------
{newConceptsPrompt}   ← From config.newConceptsInstruction
------

# BEGIN YOUR WORK
```

The `newConceptsPrompt` (from configs.csv `newConceptsInstruction`) contains:
- Brand context (who the content is for, their audience)
- Task (generate 3 new concepts)
- Focus guidelines (hook priorities, tone, taboos)
- Output format specification (CONCEPT / HOOK / SCRIPT for each)

---

### 10.3 Output Format

Standard concept generation output (3 concepts per video):

```markdown
# CONCEPT 1
[1-3 sentence description of the concept]

## HOOK
[What is seen in first 2 seconds]
[What is said in first line]
[Why this hook works for this audience]

## SCRIPT
[Scene-by-scene script]
[Voiceover / on-screen text]
[Practical or emotional payoff]

# CONCEPT 2
...

# CONCEPT 3
...
```

---

## 11. Content Mix Feature (mix-concepts.ts)

Located: `app/src/lib/mix-concepts.ts`

**Model:** `gemini-2.5-pro`  
**API:** Same as concept generation

This feature is separate from the pipeline — it's a creative synthesis tool that combines 2 or 3 already-analyzed videos from videos.csv into a single new "Hybrid Viral Concept."

---

### 11.1 mixVideoConcepts — How It Works

```
mixVideoConcepts(videos: Video[]) →

Accepts 2 or 3 Video objects (enforced at API level)

1. Build videoContexts string from videos:
   For each video:
     "### VIDEO {i+1} (@{creator})\n---\n# ANALYSIS\n{analysis}\n\n# CONCEPTS\n{newConcepts}\n---"

2. Build synthesis prompt (see §11.2)

3. POST to Gemini Pro generateContent
   generationConfig:
     temperature: 0.8    (slightly higher than concept gen)
     maxOutputTokens: 4096

4. Return data.candidates[0].content.parts[0].text || ""
```

---

### 11.2 Prompt Structure

```
# ROLE
You're a Creative Director for a high-end Instagram Reels agency. 
You specialize in "Concept Synthesis" – merging successful viral patterns into new, hybrid strategies.

# OBJECTIVE
You are given {N} successful video analyses and their associated concepts.
Your goal is to "Mix" these concepts to create ONE superior "Hybrid Viral Concept".

# RULES FOR MIXING
1. HOOK FUSION: Combine the most disruptive hook element from the videos
2. RETENTION BLEND: Use the best management of flow/pacing from the source videos
3. STRATEGY SYNERGY: Create a concept that feels like a natural evolution of all input styles
4. BRAND ALIGNMENT: Keep the focus on high-end, premium aesthetics (Diorin/Palmonas context)

# INPUT VIDEOS
{videoContexts}    ← All selected videos' analysis + concepts

# OUTPUT FORMAT
Generate a single, detailed concept following this structure:
# HYBRID CONCEPT: [Catchy Title]
## HOOK
## STRUCTURE & RETENTION
## THE PAYOFF (REWARD)
## SCRIPT

# BEGIN SYNTHESIS
```

---

### 11.3 Output Format

```markdown
# HYBRID CONCEPT: [Title]
[Why this specific mix works]

## HOOK
- **VISUAL**: [First 2 seconds visual]
- **TEXT**: [On-screen hook text]
- **AUDIO**: [Music/SFX choice]
- **RATIONALE**: [Why this fused hook is superior]

## STRUCTURE & RETENTION
[Step-by-step flow mixing strategies from input videos]

## THE PAYOFF (REWARD)
[What the viewer gets at the end]

## SCRIPT
[Detailed, cinematic script for this hybrid reel]
```

---

## 12. API Routes

### 12.1 POST /api/pipeline — Pipeline Trigger

**File:** `app/src/app/api/pipeline/route.ts`  
**maxDuration:** 300 seconds (Vercel serverless limit)

**Request body:** `PipelineParams`
```json
{
  "configName": "D2C Shoes India",
  "maxVideos": 20,
  "topK": 3,
  "nDays": 30,
  "selectedVideos": null | ScrapedVideo[]
}
```

**Response:** SSE stream (`text/event-stream`)
```
data: {"status":"running","phase":"scraping",...}\n\n
data: {"status":"running","phase":"scraping",...}\n\n
...
data: {"status":"completed","phase":"done","candidates":[...]}\n\n
```
Or for Phase 2:
```
data: {"status":"completed","phase":"done","videosAnalyzed":N}\n\n
```

**How the frontend consumes it:**
- `pipeline-context.tsx` manages the EventSource/ReadableStream
- Progress updates are emitted on every state change inside `runPipeline()`
- Frontend renders active tasks, progress bars, and logs from the SSE data

---

### 12.2 GET/POST/PUT/DELETE /api/configs — Config CRUD

**File:** `app/src/app/api/configs/route.ts`

| Method | Request | Response | Action |
|--------|---------|----------|--------|
| GET | — | `Config[]` | Read all configs from configs.csv |
| POST | `{ configName, creatorsCategory, analysisInstruction, newConceptsInstruction }` | `Config` (201) | Creates new config with uuid(), saves |
| PUT | `{ id, ...fields }` | `Config` | Finds by id, merges, saves |
| DELETE | `?id={uuid}` | `{ success: true }` | Filters out by id, saves |

---

### 12.3 GET/POST/PUT/DELETE /api/creators — Creator CRUD

**File:** `app/src/app/api/creators/route.ts`

| Method | Request | Response | Action |
|--------|---------|----------|--------|
| GET | `?category=X` (optional) | `Creator[]` | Read creators, optionally filter by category |
| POST | `{ username, category }` | `Creator` (201) | Creates with empty stats, immediately calls `scrapeCreatorStats()` to populate, saves updated stats |
| PUT | `{ id, ...fields }` | `Creator` | Updates creator by id |
| DELETE | `?id={uuid}` | `{ success: true }` | Removes creator by id |

**POST flow (non-blocking stat scraping):**
1. Create creator with empty stats → save to CSV → return initial record
2. Call `scrapeCreatorStats(username)` (awaited, but response already sent)
3. Update creator record with real stats → re-save CSV
4. Return updated creator in response (201)

> Note: The current implementation actually awaits `scrapeCreatorStats` before responding, which means POST can take 30-60 seconds.

---

### 12.4 POST /api/creators/refresh — Creator Stats Refresh

**File:** `app/src/app/api/creators/refresh/route.ts`  
**maxDuration:** 300 seconds

**Request body:**
```json
{ "ids": ["uuid1", "uuid2"] }  // Empty array = refresh all
```

**Response:** SSE stream
```
data: {"type":"progress","username":"gullylabs","status":"scraping"}\n\n
data: {"type":"progress","username":"gullylabs","status":"done","stats":{...}}\n\n
data: {"type":"complete"}\n\n
```

**Flow:**
- Filters creators by provided IDs (or all if empty)
- For each creator: calls `scrapeCreatorStats()` → updates CSV → emits progress

---

### 12.5 GET/PATCH /api/videos — Video Read & Star

**File:** `app/src/app/api/videos/route.ts`

| Method | Request | Response | Action |
|--------|---------|----------|--------|
| GET | `?configName=X&creator=Y` (both optional) | `Video[]` | Read all videos, filter, sort by `dateAdded DESC` then `views DESC` |
| PATCH | `{ id, starred: boolean }` | `Video` | Update starred status by id |

**Sorting logic:**
```typescript
videos.sort((a, b) => {
  const dateDiff = (b.dateAdded || "").localeCompare(a.dateAdded || "");
  if (dateDiff !== 0) return dateDiff;
  return b.views - a.views;
});
```

---

### 12.6 POST /api/content-mix — Concept Synthesis

**File:** `app/src/app/api/content-mix/route.ts`

**Request body:**
```json
{ "videos": [Video, Video] }  // 2 or 3 videos only
```

**Validation:** Rejects if `videos.length < 2` or `videos.length > 3`

**Response:**
```json
{ "mixedConcept": "# HYBRID CONCEPT: ..." }
```

**Error response:**
```json
{ "error": "Please select between 2 and 3 videos to mix." }
```

---

### 12.7 GET /api/proxy-image — Image Proxy

**File:** `app/src/app/api/proxy-image/route.ts`

**Request:** `?url={encodedInstagramCdnUrl}`

**Purpose:** Instagram CDN URLs include authentication parameters and CORS restrictions. The frontend cannot directly load them via `<img src>`. This proxy route fetches the image server-side and streams it back without CORS issues.

---

## 13. Frontend Pages & How They Consume Data

### 13.1 / Dashboard

- `page.tsx` is a simple redirect/entry component
- Renders the layout with sidebar; content is in child pages

---

### 13.2 /run — Pipeline Runner (3-Step Flow)

**Step 1 — Setup:**
- `GET /api/configs` → populate config dropdown
- User sets: config, maxVideos (default 20), topK (default 3), nDays (default 30)
- Click "Fetch Candidate Reels" → `POST /api/pipeline` (Phase 1)

**Step 2 — Video Picker:**
- Displayed when `candidates` array arrives from SSE
- Shows thumbnail grid (via `/api/proxy-image?url=...`)
- User selects/deselects videos (all selected by default)
- Click "Run AI Analysis" → `POST /api/pipeline` (Phase 2) with `selectedVideos`

**Step 3 — Analysis Progress:**
- Shows active tasks, progress bar, log
- On completion: link to `/videos` to see results

**State management:** via `pipeline-context.tsx` React context (wraps the app)
- `running`: boolean
- `progress`: PipelineProgress | null
- `candidates`: ScrapedVideo[] | null
- `runPipeline(params)`: starts SSE stream
- `resetPipeline()`: clears all state

---

### 13.3 /videos — Videos Browser

- `GET /api/videos` → fetch all videos
- Renders thumbnail grid with creator, views, date, config name
- Expandable: click video → show full `analysis` and `newConcepts` (markdown rendered)
- Star button → `PATCH /api/videos` to toggle `starred`
- Filters: by configName, by creator, by starred
- Thumbnails loaded via `/api/proxy-image?url=...`

---

### 13.4 /configs — Config Management

- `GET /api/configs` → load all configs
- Create: form → `POST /api/configs`
- Edit: inline → `PUT /api/configs`
- Delete: `DELETE /api/configs?id=...`

---

### 13.5 /creators — Creator Management

- `GET /api/creators` → load all creators
- Create: username + category → `POST /api/creators` (triggers auto stat scraping)
- Edit: `PUT /api/creators`
- Delete: `DELETE /api/creators?id=...`
- Refresh Stats: `POST /api/creators/refresh` with `{ ids: [...] }` → SSE stream of per-creator progress

---

### 13.6 /content-mix — Content Mix

- `GET /api/videos` → load all analyzed videos
- Step 1: User selects 2 or 3 videos (selection capped at `mixCount`)
- Step 2: User clicks "Merge Concepts" → `POST /api/content-mix` with selected videos
- Step 3: Displays `mixedConcept` markdown result

**Selection logic:**
```typescript
toggleVideo(id) → {
  if already selected: remove
  if not selected AND selectedIds.length >= mixCount: ignore (cap)
  else: add
}
```

---

## 14. Config Field Deep Dive

### 14.1 analysisInstruction — What Gemini Sees

This field is the entire prompt that Gemini Flash receives alongside the uploaded video. It defines exactly what sections to extract.

**Standard template sections (used across all configs):**
- `# CONCEPT` — core idea, tension, promise (1-3 sentences max)
- `# HOOK` — first 5 seconds breakdown: VISUAL / TEXT / AUDIO
- `# RETENTION MECHANISMS` — open loops, micro-escalations, pattern interrupts
- `# REWARD` — viewer value: Education / Entertainment / Inspiration
- `# SCRIPT` — full reconstructed script (numbered scenes)

**End-of-prompt guiding rule** (used in all configs):
```
OVERALL RULE:
THE SHORTER THE ANALYSIS - THE BETTER.
If it can be said in fewer words, it should be.
Clarity > cleverness.
Retention > information.
```

**Variant (Artist-Inspired Jewelry config):**
Replaces "RETENTION MECHANISMS" focus with rhythm, lighting, camera work — more aesthetic/cinematic framing.

---

### 14.2 newConceptsInstruction — What Gemini (concepts) Sees

This field is injected into the `generateNewConcepts` prompt as `{newConceptsPrompt}`. It overrides the generic task with brand-specific context.

**Template structure:**
```
Adapt this video for [BRAND DESCRIPTION + AUDIENCE DESCRIPTION].

Task:
Give us 3 NEW video concepts inspired by the ORIGINAL reference.
Do not copy the original.
[Brand-specific translation instruction]
MAINLY iterate and sharpen the HOOKS.

Focus:
- [Hook priority 1]
- [Hook priority 2]
- [Tone guideline]
- [Visual guideline]
- [Taboo]

The output should have this format:
# CONCEPT 1
## HOOK
## SCRIPT
# CONCEPT 2
...
# CONCEPT 3
...
```

---

### 14.3 creatorsCategory — How It Links Configs to Creators

This is the **join key** between configs and creators:
- `configs.creatorsCategory` is set when creating a config (e.g., `"d2c-footwear"`)
- `creators.category` is set when creating a creator (e.g., `"d2c-footwear"`)
- The pipeline filters: `allCreators.filter(c => c.category === config.creatorsCategory)`
- This is a **case-sensitive string match** in the filter, but `readCreators()` normalizes keys (not values)

**Current category → creator mapping:**
| Category | Creators |
|----------|---------|
| `d2c-footwear` | gullylabs |
| `Demi-fine jewellery` | palmonas_official |
| `citizen_theartist` | citizen_theartist |
| `ai-creators` | *(none added yet)* |
| `dubai-real-estate` | *(none added yet)* |

---

## 15. End-to-End Data Flow Diagram

```
USER ACTION: Selects config + params → clicks "Fetch Candidate Reels"
     ↓
POST /api/pipeline { configName, maxVideos, topK, nDays }
     ↓
pipeline.ts::runPipeline() — Phase 1
     ↓
  readConfigs() → configs.csv ──────────────────────┐
  readCreators() → creators.csv                      │ matches creatorsCategory
  filter creators by config.creatorsCategory ←───────┘
     ↓
  For each creator (PARALLEL):
    scrapeReels(username, maxVideos, nDays)
         ↓
    POST apify~instagram-scraper
         ↓
    ApifyReel[] → filter by videoUrl + timestamp
                → map to ScrapedVideo
                → filter by cutoffDate
                → sort by views DESC
                → slice top K
     ↓
  Aggregate all top videos → candidates[]
     ↓
SSE: { status: "completed", phase: "done", candidates: [...] }
     ↓
FRONTEND: Shows video thumbnail picker (proxy images via /api/proxy-image)
     ↓
USER ACTION: Selects videos → clicks "Run AI Analysis"
     ↓
POST /api/pipeline { ..., selectedVideos: ScrapedVideo[] }
     ↓
pipeline.ts::runPipeline() — Phase 2
     ↓
  (3 concurrent workers)
  For each ScrapedVideo:
    fetch(videoUrl) → download MP4
         ↓
    uploadVideo(buffer, mimeType) → Gemini Files API
    waitForFileActive() → poll until ACTIVE
         ↓
    analyzeVideo(fileUri, mimeType, config.analysisInstruction)
    → POST gemini-2.5-flash:generateContent [video + prompt]
    → returns markdown analysis (CONCEPT/HOOK/RETENTION/REWARD/SCRIPT)
         ↓
    generateNewConcepts(analysis, config.newConceptsInstruction)
    → POST gemini-2.5-pro:generateContent [analysis + brand prompt]
    → returns markdown concepts (CONCEPT 1,2,3 / HOOK / SCRIPT)
         ↓
    Build Video record → push to newVideos[]
     ↓
  writeVideos([...existing, ...newVideos]) → data/videos.csv
     ↓
SSE: { status: "completed", phase: "done", videosAnalyzed: N }
     ↓
FRONTEND: Link to /videos page
     ↓
GET /api/videos → read videos.csv → sorted by dateAdded DESC, views DESC
     ↓
DISPLAY: Thumbnail grid with expandable analysis + concepts

OPTIONAL — CONTENT MIX:
USER ACTION: Goes to /content-mix, selects 2-3 videos
     ↓
POST /api/content-mix { videos: Video[] }
     ↓
mixVideoConcepts(videos) → POST gemini-2.5-pro:generateContent
     ↓
Returns { mixedConcept: "# HYBRID CONCEPT: ..." }
     ↓
DISPLAY: Markdown rendered hybrid concept
```

---

## 16. Known Issues & Notes

### ⚠️ Apify `resultsType: "stories"` Bug
In both `scrapeReels()` and `scrapeCreatorStats()`, the Apify request uses `resultsType: "stories"` instead of `"reels"`. This means:
- The scraper may return **Stories** not **Reels**
- Stories typically don't have `videoPlayCount` or reliable video metrics
- This should be changed to `resultsType: "reels"` for proper Reel scraping
- Historical context: the migration config from n8n used "stories" and was carried over

### ⚠️ `claude.ts` Uses Gemini, Not Claude
Despite the filename and function name, `generateNewConcepts()` in `claude.ts` uses the Gemini 2.5 Pro API. The `ANTHROPIC_API_KEY` in `.env` is currently unused. This is a naming artifact from initial design.

### ⚠️ Full File Rewrite on Every Write
All CSV writes completely replace the file. For `videos.csv` this means:
- Every `appendVideo()` reads all existing videos + writes all of them back
- At scale this could be slow, but for current data size (<= ~1,300 rows) it's fine

### ⚠️ No Authentication
The app has no authentication. All API routes are open. This is intentional for local use.

### ⚠️ `maxDuration: 300`
The pipeline and creator-refresh routes have a 300-second max duration. For very large creator lists or high video counts, this limit may be hit.

### ✅ Proxy Image Requirement
Instagram CDN images require the `/api/proxy-image` proxy for all `<img>` tags in the frontend. Direct CDN URL loading fails due to CORS and authentication headers.

### ✅ SSE Pattern
Both `/api/pipeline` and `/api/creators/refresh` use the same SSE pattern: `ReadableStream` → `text/event-stream` response with `data: {JSON}\n\n` messages. The frontend uses `fetch()` + `response.body.pipeThrough(TextDecoderStream())` to consume these streams.

---

*End of documentation*
