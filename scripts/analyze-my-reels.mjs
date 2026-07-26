#!/usr/bin/env node
/**
 * Scrapes @diorin.official's last 10 reels, analyzes each with Gemini,
 * then asks Claude for a "what's working / what's not" report.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");

// Load .env manually
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!APIFY_API_TOKEN || !GEMINI_KEY || !ANTHROPIC_KEY) {
  console.error("Missing API keys in .env"); process.exit(1);
}

const USERNAME = "diorin.official";
const MAX_REELS = 10;

// ─── STEP 1: Scrape reels ─────────────────────────────────────────────────────
async function scrapeReels() {
  console.log(`\n📥 Scraping last ${MAX_REELS} reels from @${USERNAME}...`);

  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addParentData: false,
        directUrls: [`https://www.instagram.com/${USERNAME}/`],
        enhanceUserSearchWithFacebookPage: false,
        isUserReelFeedURL: false,
        isUserTaggedFeedURL: false,
        resultsLimit: MAX_REELS,
        resultsType: "stories",
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const reels = data.filter((r) => r.videoUrl);
  console.log(`✅ Got ${reels.length} reels`);
  return reels;
}

// ─── STEP 2: Gemini upload + analyze ─────────────────────────────────────────
async function uploadToGemini(buffer, mimeType) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Command": "start, upload, finalize",
        "X-Goog-Upload-Header-Content-Length": String(buffer.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": mimeType,
      },
      body: new Uint8Array(buffer),
    }
  );
  if (!res.ok) throw new Error(`Gemini upload error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { name: data.file.name, uri: data.file.uri, mimeType: data.file.mimeType };
}

async function waitForActive(fileName, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_KEY}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.state === "ACTIVE") return;
      if (data.state === "FAILED") throw new Error(`Gemini file ${fileName} FAILED`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Gemini file never became ACTIVE");
}

async function analyzeWithGemini(uri, mimeType, index, views) {
  const prompt = `You are analyzing an Instagram Reel from the account @diorin.official.

Please analyze this reel and provide:
1. **Hook** (first 3 seconds): What opens the video? Is it strong or weak?
2. **Content Type**: What kind of reel is this? (tutorial, lifestyle, entertainment, product, testimonial, etc.)
3. **Visual Quality**: Production quality, aesthetics, editing style
4. **Audio**: Music/voiceover choice and how it fits
5. **Retention Mechanisms**: What keeps viewers watching?
6. **Call to Action**: Does it have one? What is it?
7. **Engagement Drivers**: What would make people like, comment, or share?
8. **Weaknesses**: What could be improved?

Be specific and actionable.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { fileData: { fileUri: uri, mimeType } },
              { text: prompt },
            ],
          },
        ],
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini analyze error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── STEP 3: Gemini report ────────────────────────────────────────────────────
async function generateReport(reelAnalyses) {
  const analysisText = reelAnalyses
    .map(
      (r, i) =>
        `## Reel ${i + 1} — ${r.views.toLocaleString()} views | ${r.likes.toLocaleString()} likes | Posted: ${r.datePosted}\nURL: ${r.url}\n\n${r.analysis}`
    )
    .join("\n\n---\n\n");

  const prompt = `You are an Instagram Reels strategist analyzing the account @diorin.official.

Below are analyses of their last ${reelAnalyses.length} reels, each with view/like counts.

${analysisText}

---

Based on all ${reelAnalyses.length} reels above, write a comprehensive performance report with:

# @diorin.official — Reels Performance Report

## Overall Stats Summary
(views range, avg views, best/worst performers)

## What's Working ✅
(patterns across high-performing reels — hooks, formats, topics, styles that correlate with higher views)

## What's Not Working ❌
(patterns in lower-performing reels — what's falling flat)

## Missed Opportunities 💡
(content types or formats they haven't tried that would likely perform well)

## Top 3 Actionable Recommendations
(specific, concrete changes to make immediately)

Be direct, specific, and data-driven. Reference actual view counts when making points.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini report error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const reels = await scrapeReels();

  if (reels.length === 0) {
    console.error("No reels found. Check Apify token or account visibility.");
    process.exit(1);
  }

  const reelAnalyses = [];

  for (let i = 0; i < reels.length; i++) {
    const reel = reels[i];
    const views = reel.videoPlayCount || 0;
    const likes = reel.likesCount || 0;
    const datePosted = reel.timestamp?.slice(0, 10) || "unknown";
    console.log(`\n🎬 [${i + 1}/${reels.length}] @${reel.ownerUsername} — ${views.toLocaleString()} views`);

    try {
      // Download video
      console.log("  ⬇️  Downloading...");
      const videoRes = await fetch(reel.videoUrl);
      if (!videoRes.ok) throw new Error(`Download failed: ${videoRes.status}`);
      const buffer = Buffer.from(await videoRes.arrayBuffer());
      const mimeType = videoRes.headers.get("content-type") || "video/mp4";

      // Upload to Gemini
      console.log("  ☁️  Uploading to Gemini...");
      const file = await uploadToGemini(buffer, mimeType);
      await waitForActive(file.name);

      // Analyze
      console.log("  🔍 Analyzing...");
      const analysis = await analyzeWithGemini(file.uri, file.mimeType, i + 1, views);

      reelAnalyses.push({ views, likes, datePosted, url: reel.url, analysis });
      console.log("  ✅ Done");
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      reelAnalyses.push({
        views, likes, datePosted, url: reel.url,
        analysis: `[Analysis failed: ${err.message}]`,
      });
    }
  }

  console.log("\n\n📊 Generating report with Claude...");
  const report = await generateReport(reelAnalyses);

  console.log("\n" + "═".repeat(80));
  console.log(report);
  console.log("═".repeat(80));

  // Save report to file
  const outputPath = resolve(__dirname, "../data/diorin-reels-report.md");
  const { writeFileSync } = await import("fs");
  writeFileSync(outputPath, `# @diorin.official Reels Report\n*Generated: ${new Date().toISOString().slice(0, 10)}*\n\n${report}\n\n---\n\n## Individual Reel Analyses\n\n${reelAnalyses.map((r, i) => `### Reel ${i + 1} — ${r.views.toLocaleString()} views\n**URL:** ${r.url}\n**Posted:** ${r.datePosted}\n\n${r.analysis}`).join("\n\n---\n\n")}`);
  console.log(`\n💾 Report saved to data/diorin-reels-report.md`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
