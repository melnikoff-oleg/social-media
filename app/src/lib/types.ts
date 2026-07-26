export interface PromptTemplate {
  id: string;
  templateName: string;
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
  templateName: string;
  starred: boolean;
}

export interface ScrapedVideo {
  id?: string;
  postId?: string;
  videoUrl: string;
  postUrl: string;
  views: number;
  likes: number;
  comments: number;
  username: string;
  thumbnail: string;
  datePosted: string;
}

export interface PipelineParams {
  templateName: string;
  maxVideos: number;
  topK: number;
  nDays: number;
  selectedVideos?: ScrapedVideo[];
  usernames?: string[];
  customInstructions?: string;
}

export interface ActiveTask {
  id: string;
  creator: string;
  step: string;
  views?: number;
}

export interface PipelineProgress {
  status: "idle" | "running" | "completed" | "error";
  phase: "scraping" | "picking" | "analyzing" | "done";
  activeTasks: ActiveTask[];
  creatorsCompleted: number;
  creatorsTotal: number;
  creatorsScraped: number;
  videosAnalyzed: number;
  videosTotal: number;
  errors: string[];
  log: string[];
  candidates?: ScrapedVideo[];
}

export interface ReelAnalysisResult {
  metadata: {
    creator: string;
    caption: string;
    views: number;
    likes: number;
    comments: number;
    duration: string;
    thumbnail: string;
    reelUrl: string;
  };
  analysis?: string;
  newConcepts?: string;
  directorMode?: {
    shotTypes: string;
    cameraAngles: string;
    cameraMovement: string;
    sceneComposition: string;
    lightingStyle: string;
    shootingGuide: string;
  };
  editorMode?: {
    cutStyle: string;
    timingPacing: string;
    effectsUsed: string;
    motionGraphics: string;
    textAnimation: string;
    soundDesign: string;
    suggestedTools: string;
    pluginsPresets: string;
  };
  recreationGuide?: {
    beginnerVersion: string;
    advancedVersion: string;
    adaptToYourBrand: string;
  };
}
