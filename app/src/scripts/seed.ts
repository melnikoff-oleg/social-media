/**
 * OBSOLETE: the app now stores data in PostgreSQL. This script still writes the old CSV files
 * under data/ and does not touch the database. Do not run it. To import existing CSV data,
 * use `npm run migrate:csv` instead. Kept only for reference.
 *
 * Seed script to create initial data files.
 * Run with: npx tsx src/scripts/seed.ts
 */
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { stringify } from "csv-stringify/sync";
import { v4 as uuid } from "uuid";
import path from "path";

const DATA_DIR = path.join(__dirname, "..", "..", "..", "data");

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Configs
const configs = [
  {
    id: uuid(),
    configName: "FABODXB",
    creatorsCategory: "dubai-real-estate",
    analysisInstruction: `# CONCEPT
Overall description of the concept of this video, and what makes it valuable and interesting (1-3 sentences).
-> Clarify the core tension: what belief is challenged, what mistake is exposed, or what outcome is promised.
-> One clear idea only. No subtopics.

# HOOK
Detailed description of the first 5 seconds of the video, what makes it scroll-stopping and attention-grabbing, why a viewer needs to stop to watch it (1-3 sentences).
-> Break it down into:
- VISUAL (what is seen in the first 1-2 seconds: movement, facial expression, contrast, pattern break)
- TEXT (short on-screen statement: danger, promise, or contradiction, max 6-8 words)
- AUDIO (first spoken words: confident, direct, no intro, no context)
-> The hook must create either fear of loss, strong curiosity, or identity relevance.

# RETENTION MECHANISMS
Detailed description of how the creator manages to retain viewers throughout the video (1-7 sentences).
-> Open loops ("in a second I'll show you why...", "most people miss this part...")
-> Delayed payoff (main insight is intentionally held back)
-> Micro-escalations every 3-5 seconds (new angle, sharper wording, visual or tonal shift)
-> Pattern interrupts (pauses, emphasis, cut, zoom, gesture)
-> Clear forward momentum: the viewer feels the video is going somewhere.

# REWARD
Describe the ultimate value that the viewer gets by watching this video (1-3 sentences).
-> Be explicit: what does the viewer now understand, feel, or see differently?
-> Define whether the reward is Education (clarity), Entertainment (emotional release), or Inspiration (self-belief / action).
-> The reward should feel proportional to the time invested.

# SCRIPT
Describe the full script of the video (1-20 sentences, as many as needed).
-> Structure:
1. Immediate hook (no greeting)
2. Problem framing / tension escalation
3. Why this matters (stakes)
4. Main insight or shift in perspective (this comes AFTER retention is established)
5. Clean close (no rambling; optional CTA only if natural)
-> Include: scenes, actions, voiceover, exact wording if possible.
-> Keep sentences short. Spoken language only.

OVERALL RULE:
THE SHORTER THE ANALYSIS - THE BETTER.
If it can be said in fewer words, it should be.
Clarity > cleverness.
Retention > information.`,
    newConceptsInstruction: `Adapt this video for FABO, he is a Real Estate Agent in Dubai and has Premium and Luxus Real Estate working with Celebrities and Influencers. He combines knowledge and lifestyle. Like Selling-Sunset he has a group of beautiful real estate agents working for him, he is an Owner of Real Estate Agency.

Task:
Give us 3 NEW video concepts inspired by the ORIGINAL reference.
Do not copy the original.
Translate the core idea into the real estate / investor context.
MAINLY iterate and sharpen the HOOKS.

Focus:
- First 3 seconds must stop an investor from scrolling
- Hooks should challenge a belief, fear, or misconception investors have
- Calm authority > hype
- Emotional credibility > performance
- No shouting, no buzzwords, no exaggeration

The output should have this format:

# CONCEPT 1
Text description (1-3 sentences)

## HOOK
Detailed hook description (1-3 sentences)
Describe:
- What is seen in the first 2 seconds
- What is said in the first line
- Why this hook works specifically for investors 35+

## SCRIPT
Detailed script description (1-20 sentences, as many as needed)
Include:
- Scene flow
- Spoken text / voiceover
- Clear but understated payoff
- Subtle authority, not selling

# CONCEPT 2
...

# CONCEPT 3
...`,
  },
];

const configsCsv = stringify(configs, {
  header: true,
  columns: ["id", "configName", "creatorsCategory", "analysisInstruction", "newConceptsInstruction"],
});
writeFileSync(path.join(DATA_DIR, "configs.csv"), configsCsv);
console.log("Created configs.csv");

// Creators
const creators = [
  { id: uuid(), username: "marcel.remus", category: "dubai-real-estate" },
  { id: uuid(), username: "urban.dxb_", category: "dubai-real-estate" },
  { id: uuid(), username: "danieldalen", category: "dubai-real-estate" },
];

const creatorsCsv = stringify(creators, {
  header: true,
  columns: ["id", "username", "category"],
});
writeFileSync(path.join(DATA_DIR, "creators.csv"), creatorsCsv);
console.log("Created creators.csv");

// Videos - create empty with headers
const videosCsv = stringify([], {
  header: true,
  columns: ["id", "link", "thumbnail", "creator", "views", "likes", "comments", "analysis", "newConcepts", "datePosted", "dateAdded", "configName"],
});
writeFileSync(path.join(DATA_DIR, "videos.csv"), videosCsv);
console.log("Created videos.csv (empty)");

console.log("Seed complete!");
