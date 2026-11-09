export interface Config {
  id: string;
  configName: string;
  creatorsCategory: string;
  analysisInstruction: string;
  newConceptsInstruction: string;
}

export interface Creator {
  id: string;
  username: string;
  category: string;
  profilePicUrl: string;
  followers: number;
  reelsCount30d: number;
  avgViews30d: number;
  lastScrapedAt: string;
}

export interface Video {
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

/** Which model generates the new concepts. */
export const CONCEPT_PROVIDERS = ["claude", "deepseek"] as const;
export type ConceptProvider = (typeof CONCEPT_PROVIDERS)[number];
export const DEFAULT_CONCEPT_PROVIDER: ConceptProvider = "claude";

export interface PipelineParams {
  configName: string;
  maxVideos: number;
  topK: number;
  nDays: number;
  /** Concept-generation model; "claude" when missing. */
  provider?: ConceptProvider;
}

export interface ActiveTask {
  id: string;
  creator: string;
  step: string;
  views?: number;
}

export interface PipelineProgress {
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
  /** Set when today's video quota cut the selection short (see PipelineEvent). */
  limitedTo?: number;
}
