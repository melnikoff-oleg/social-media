import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Always stored lowercase (enforced by the application layer).
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<"admin" | "user">().notNull(),
  active: boolean("active").notNull().default(true),
  dailyRunsLimit: integer("daily_runs_limit").notNull().default(5),
  dailyVideosLimit: integer("daily_videos_limit").notNull().default(100),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: tz("expires_at").notNull(),
});

export const configs = pgTable(
  "configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    configName: text("config_name").notNull(),
    creatorsCategory: text("creators_category"),
    analysisInstruction: text("analysis_instruction"),
    newConceptsInstruction: text("new_concepts_instruction"),
  },
  (t) => [unique("configs_user_id_config_name_unique").on(t.userId, t.configName)]
);

export const creators = pgTable(
  "creators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    category: text("category"),
    profilePicUrl: text("profile_pic_url"),
    followers: integer("followers").default(0),
    reelsCount30d: integer("reels_count_30d").default(0),
    avgViews30d: integer("avg_views_30d").default(0),
    lastScrapedAt: tz("last_scraped_at"),
  },
  (t) => [unique("creators_user_id_username_unique").on(t.userId, t.username)]
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id").references(() => creators.id, { onDelete: "set null" }),
    configId: uuid("config_id").references(() => configs.id, { onDelete: "set null" }),
    creatorUsername: text("creator_username"),
    configName: text("config_name"),
    link: text("link"),
    thumbnail: text("thumbnail"),
    views: integer("views"),
    likes: integer("likes"),
    comments: integer("comments"),
    analysis: text("analysis"),
    newConcepts: text("new_concepts"),
    datePosted: tz("date_posted"),
    dateAdded: tz("date_added").notNull().defaultNow(),
    starred: boolean("starred").default(false),
  },
  (t) => [index("videos_user_id_idx").on(t.userId)]
);

export const pipelineRuns = pgTable("pipeline_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").$type<"running" | "done" | "failed" | "timed_out">().notNull(),
  params: jsonb("params"),
  startedAt: tz("started_at").notNull().defaultNow(),
  finishedAt: tz("finished_at"),
  log: jsonb("log").default([]),
});

export const usageDaily = pgTable(
  "usage_daily",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    runs: integer("runs").notNull().default(0),
    videos: integer("videos").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })]
);

export const adminAudit = pgTable("admin_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => users.id),
  targetUserId: uuid("target_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  detail: jsonb("detail"),
  createdAt: tz("created_at").notNull().defaultNow(),
});
