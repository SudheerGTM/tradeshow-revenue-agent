import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  jsonb,
  index,
  boolean,
  date,
  doublePrecision,
  numeric,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const tenantStatusEnum = pgEnum("tenant_status", ["active", "inactive"]);
export const userRoleEnum = pgEnum("user_role", [
  "platform_admin",
  "tenant_admin",
  "manager",
  "booth_user",
]);
export const userStatusEnum = pgEnum("user_status", ["active", "inactive"]);

// ─── Tenants ─────────────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  subdomain: varchar("subdomain", { length: 100 }).notNull().unique(),
  eventName: varchar("event_name", { length: 255 }),
  status: tenantStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("booth_user"),
    status: userStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_tenant_idx").on(t.tenantId)]
);

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }).notNull(),
    resourceId: varchar("resource_id", { length: 255 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_tenant_idx").on(t.tenantId),
    index("audit_created_idx").on(t.createdAt),
  ]
);

// ─── Events ───────────────────────────────────────────────────────────────────

export const eventStatusEnum = pgEnum("event_status", ["upcoming", "active", "completed", "cancelled"]);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    location: varchar("location", { length: 255 }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: eventStatusEnum("status").notNull().default("upcoming"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_tenant_idx").on(t.tenantId),
    index("events_slug_idx").on(t.tenantId, t.slug),
  ]
);

// ─── Leads ────────────────────────────────────────────────────────────────────

export const leadSourceEnum = pgEnum("lead_source", ["manual", "qr_form", "business_card"]);
export const leadStatusEnum = pgEnum("lead_status", ["new", "contacted", "qualified", "disqualified"]);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }),
    jobTitle: varchar("job_title", { length: 150 }),
    companyName: varchar("company_name", { length: 255 }).notNull(),

    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    country: varchar("country", { length: 100 }),

    source: leadSourceEnum("source").notNull().default("manual"),
    consentGiven: boolean("consent_given").notNull().default(false),
    consentTimestamp: timestamp("consent_timestamp", { withTimezone: true }),

    status: leadStatusEnum("status").notNull().default("new"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leads_tenant_idx").on(t.tenantId),
    index("leads_event_idx").on(t.eventId),
    index("leads_status_idx").on(t.tenantId, t.status),
    index("leads_created_by_idx").on(t.createdByUserId),
  ]
);

// ─── Voice Notes ──────────────────────────────────────────────────────────────

export const recordingStatusEnum = pgEnum("recording_status", [
  "pending_upload", "uploaded", "failed", "deleted",
]);

export const transcriptionStatusEnum = pgEnum("transcription_status", [
  "not_started", "pending", "completed", "failed",
]);

export const voiceNotes = pgTable(
  "voice_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    s3Bucket: varchar("s3_bucket", { length: 255 }).notNull(),
    s3Key: varchar("s3_key", { length: 1000 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileType: varchar("file_type", { length: 100 }).notNull(),
    fileSizeBytes: text("file_size_bytes"),        // stored as text to avoid bigint friction
    durationSeconds: text("duration_seconds"),

    recordingStatus: recordingStatusEnum("recording_status").notNull().default("pending_upload"),
    transcriptionStatus: transcriptionStatusEnum("transcription_status").notNull().default("not_started"),

    retentionDeleteAt: timestamp("retention_delete_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("vn_tenant_idx").on(t.tenantId),
    index("vn_lead_idx").on(t.leadId),
    index("vn_status_idx").on(t.tenantId, t.recordingStatus),
  ]
);

// ─── Transcripts ─────────────────────────────────────────────────────────────

export const transcribeStatusEnum = pgEnum("transcribe_status", [
  "not_started", "queued", "in_progress", "completed", "failed",
]);

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    voiceNoteId: uuid("voice_note_id").notNull().references(() => voiceNotes.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    transcribeJobName: varchar("transcribe_job_name", { length: 500 }).notNull().unique(),
    transcribeStatus: transcribeStatusEnum("transcribe_status").notNull().default("queued"),

    transcriptText: text("transcript_text"),
    transcriptJsonS3Key: varchar("transcript_json_s3_key", { length: 1000 }),
    languageCode: varchar("language_code", { length: 20 }).notNull().default("en-GB"),

    confidenceScore: doublePrecision("confidence_score"),
    failureReason: text("failure_reason"),

    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tx_tenant_idx").on(t.tenantId),
    index("tx_lead_idx").on(t.leadId),
    index("tx_voice_note_idx").on(t.voiceNoteId),
    index("tx_status_idx").on(t.tenantId, t.transcribeStatus),
  ]
);

// ─── Conversation Insights ───────────────────────────────────────────────────

export const insightInputSourceEnum = pgEnum("insight_input_source", [
  "manual_transcript", "transcript_table", "lead_notes",
]);

export const insightUrgencyEnum = pgEnum("insight_urgency", [
  "low", "medium", "high", "unknown",
]);

export const insightStatusEnum = pgEnum("insight_status", [
  "completed", "failed", "needs_review",
]);

export const conversationInsights = pgTable(
  "conversation_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    voiceNoteId: uuid("voice_note_id").references(() => voiceNotes.id, { onDelete: "set null" }),
    transcriptId: uuid("transcript_id").references(() => transcripts.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    inputSource: insightInputSourceEnum("input_source").notNull(),
    inputText: text("input_text").notNull(),

    painPoints: jsonb("pain_points"),
    productInterest: jsonb("product_interest"),
    businessNeed: text("business_need"),
    urgency: insightUrgencyEnum("urgency").notNull().default("unknown"),
    timeline: text("timeline"),
    budgetSignal: text("budget_signal"),
    decisionMakerSignal: text("decision_maker_signal"),
    competitorMentioned: text("competitor_mentioned"),
    nextBestAction: text("next_best_action"),

    summary: text("summary"),
    recommendedFollowUp: text("recommended_follow_up"),

    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
    aiModelUsed: varchar("ai_model_used", { length: 200 }),
    aiRawResponse: jsonb("ai_raw_response"),

    status: insightStatusEnum("status").notNull().default("completed"),
    failureReason: text("failure_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ci_tenant_idx").on(t.tenantId),
    index("ci_lead_idx").on(t.leadId),
    index("ci_status_idx").on(t.tenantId, t.status),
    index("ci_urgency_idx").on(t.tenantId, t.urgency),
  ]
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type UserRole = "platform_admin" | "tenant_admin" | "manager" | "booth_user";
export type LeadStatus = "new" | "contacted" | "qualified" | "disqualified";
export type LeadSource = "manual" | "qr_form" | "business_card";
export type VoiceNote = typeof voiceNotes.$inferSelect;
export type NewVoiceNote = typeof voiceNotes.$inferInsert;
export type RecordingStatus = "pending_upload" | "uploaded" | "failed" | "deleted";
export type TranscriptionStatus = "not_started" | "pending" | "completed" | "failed";
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
export type TranscribeStatus = "not_started" | "queued" | "in_progress" | "completed" | "failed";
export type ConversationInsight = typeof conversationInsights.$inferSelect;
export type NewConversationInsight = typeof conversationInsights.$inferInsert;
export type InsightInputSource = "manual_transcript" | "transcript_table" | "lead_notes";
export type InsightUrgency = "low" | "medium" | "high" | "unknown";
export type InsightStatus = "completed" | "failed" | "needs_review";
