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
  integer,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const tenantStatusEnum = pgEnum("tenant_status", ["active", "inactive"]);
export const userRoleEnum = pgEnum("user_role", [
  "platform_admin",
  "tenant_admin",
  "manager",
  "booth_user",
]);
export const userStatusEnum = pgEnum("user_status", [
  "active",
  "inactive",
  "invited",
  "suspended",
  "locked",
]);
export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "cancelled",
]);

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

    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    sessionCount: integer("session_count").notNull().default(0),
    avatarUrl: text("avatar_url"),
    allEvents: boolean("all_events").notNull().default(true),
    onboardingStep: integer("onboarding_step").notNull().default(0),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_tenant_idx").on(t.tenantId)]
);

// ─── Password History ──────────────────────────────────────────────────────────

export const passwordHistory = pgTable(
  "password_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ph_user_idx").on(t.userId)]
);

// ─── User Invitations ───────────────────────────────────────────────────────────

export const userInvitations = pgTable(
  "user_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }),
    role: userRoleEnum("role").notNull().default("booth_user"),
    eventAccess: jsonb("event_access"), // "all" | string[] of event ids
    message: text("message"),
    invitationToken: varchar("invitation_token", { length: 128 }).notNull().unique(),
    status: invitationStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ui_tenant_idx").on(t.tenantId),
    index("ui_email_idx").on(t.email),
    index("ui_status_idx").on(t.tenantId, t.status),
  ]
);

// ─── User Event Access ──────────────────────────────────────────────────────────

export const userEventAccess = pgTable(
  "user_event_access",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("uea_user_idx").on(t.userId)]
);

// ─── Password Reset Tokens ──────────────────────────────────────────────────────

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prt_user_idx").on(t.userId)]
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
    ipAddress: varchar("ip_address", { length: 64 }),
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

export const leadSourceEnum = pgEnum("lead_source", ["manual", "qr_form", "business_card", "qr_badge_scan"]);
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

    qrRawText: text("qr_raw_text"),
    qrScannedAt: timestamp("qr_scanned_at", { withTimezone: true }),
    captureDurationSeconds: integer("capture_duration_seconds"),

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

// ─── Business Card Images ───────────────────────────────────────────────────────

export const ocrStatusEnum = pgEnum("ocr_status", [
  "not_started", "pending", "completed", "failed",
]);

export const ocrReviewStatusEnum = pgEnum("ocr_review_status", [
  "pending_review", "reviewed", "rejected",
]);

export const businessCardImages = pgTable(
  "business_card_images",
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
    fileSizeBytes: text("file_size_bytes"),

    uploadStatus: recordingStatusEnum("upload_status").notNull().default("pending_upload"),
    ocrStatus: ocrStatusEnum("ocr_status").notNull().default("not_started"),
    ocrReviewStatus: ocrReviewStatusEnum("ocr_review_status").notNull().default("pending_review"),
    ocrRawText: text("ocr_raw_text"),
    extractedFieldsJson: text("extracted_fields_json"),

    cardConsentConfirmed: boolean("card_consent_confirmed").notNull().default(false),
    cardConsentTimestamp: timestamp("card_consent_timestamp", { withTimezone: true }),

    retentionDeleteAt: timestamp("retention_delete_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bci_tenant_idx").on(t.tenantId),
    index("bci_lead_idx").on(t.leadId),
    index("bci_status_idx").on(t.tenantId, t.uploadStatus),
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

// ─── Enrichment ──────────────────────────────────────────────────────────────

export const enrichmentStatusEnum = pgEnum("enrichment_status", [
  "not_enriched", "enriched", "partially_enriched", "failed", "needs_review",
]);

export const companyEnrichment = pgTable(
  "company_enrichment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),

    companyName: varchar("company_name", { length: 255 }),
    website: varchar("website", { length: 500 }),
    linkedinUrl: varchar("linkedin_url", { length: 500 }),

    industry: varchar("industry", { length: 200 }),
    subIndustry: varchar("sub_industry", { length: 200 }),

    employeeCount: varchar("employee_count", { length: 50 }),
    employeeRange: varchar("employee_range", { length: 100 }),

    annualRevenue: varchar("annual_revenue", { length: 100 }),
    revenueRange: varchar("revenue_range", { length: 100 }),

    headquarters: varchar("headquarters", { length: 255 }),
    foundedYear: varchar("founded_year", { length: 10 }),
    companyDescription: text("company_description"),

    apolloCompanyId: varchar("apollo_company_id", { length: 255 }),
    enrichmentStatus: enrichmentStatusEnum("enrichment_status").notNull().default("not_enriched"),
    needsReview: boolean("needs_review").notNull().default(false),
    failureReason: text("failure_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ce_tenant_idx").on(t.tenantId),
    index("ce_lead_idx").on(t.leadId),
    index("ce_status_idx").on(t.tenantId, t.enrichmentStatus),
  ]
);

export const contactEnrichment = pgTable(
  "contact_enrichment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),

    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    linkedinUrl: varchar("linkedin_url", { length: 500 }),

    seniority: varchar("seniority", { length: 100 }),
    department: varchar("department", { length: 200 }),
    jobFunction: varchar("job_function", { length: 200 }),

    apolloContactId: varchar("apollo_contact_id", { length: 255 }),
    enrichmentStatus: enrichmentStatusEnum("enrichment_status").notNull().default("not_enriched"),
    needsReview: boolean("needs_review").notNull().default(false),
    failureReason: text("failure_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cne_tenant_idx").on(t.tenantId),
    index("cne_lead_idx").on(t.leadId),
  ]
);

// ─── Lead Scores ─────────────────────────────────────────────────────────────

export const scoreClassificationEnum = pgEnum("score_classification", [
  "hot", "warm", "cold", "needs_review",
]);

export const scoreStatusEnum = pgEnum("score_status", [
  "completed", "failed", "needs_review",
]);

export const leadScores = pgTable(
  "lead_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    score: numeric("score", { precision: 5, scale: 2 }).notNull().default("0"),
    classification: scoreClassificationEnum("classification").notNull().default("cold"),

    companyFitScore:   numeric("company_fit_score",   { precision: 5, scale: 2 }).notNull().default("0"),
    authorityScore:    numeric("authority_score",      { precision: 5, scale: 2 }).notNull().default("0"),
    needScore:         numeric("need_score",           { precision: 5, scale: 2 }).notNull().default("0"),
    urgencyScore:      numeric("urgency_score",        { precision: 5, scale: 2 }).notNull().default("0"),
    engagementScore:   numeric("engagement_score",     { precision: 5, scale: 2 }).notNull().default("0"),
    dataQualityScore:  numeric("data_quality_score",   { precision: 5, scale: 2 }).notNull().default("0"),

    estimatedOpportunityValue: numeric("estimated_opportunity_value", { precision: 12, scale: 2 }),
    estimatedCloseProbability:  numeric("estimated_close_probability",  { precision: 5, scale: 4 }),
    expectedRevenue:            numeric("expected_revenue",             { precision: 12, scale: 2 }),

    scoreExplanation:     text("score_explanation"),
    scoreDrivers:         jsonb("score_drivers"),
    risks:                jsonb("risks"),
    recommendedNextAction: text("recommended_next_action"),

    confidenceScore:   numeric("confidence_score", { precision: 5, scale: 2 }),
    needsHumanReview:  boolean("needs_human_review").notNull().default(false),

    modelUsed:       varchar("model_used", { length: 200 }),
    rawAiResponse:   jsonb("raw_ai_response"),

    status:        scoreStatusEnum("status").notNull().default("completed"),
    failureReason: text("failure_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ls_tenant_idx").on(t.tenantId),
    index("ls_lead_idx").on(t.leadId),
    index("ls_classification_idx").on(t.tenantId, t.classification),
    index("ls_score_idx").on(t.tenantId, t.score),
    index("ls_created_idx").on(t.tenantId, t.createdAt),
  ]
);

// ─── Follow-Up Recommendations ──────────────────────────────────────────────

export const followupTypeEnum = pgEnum("followup_type", [
  "email", "linkedin", "meeting_request", "phone_call",
]);

export const followupPriorityEnum = pgEnum("followup_priority", [
  "high", "medium", "low",
]);

export const followupTimingEnum = pgEnum("followup_timing", [
  "immediate", "24_hours", "3_days", "1_week", "2_weeks",
]);

export const followupStatusEnum = pgEnum("followup_status", [
  "draft", "approved", "rejected",
]);

export const followupRecommendations = pgTable(
  "followup_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    leadScoreId: uuid("lead_score_id").references(() => leadScores.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    followupType: followupTypeEnum("followup_type").notNull(),
    priority: followupPriorityEnum("priority").notNull().default("medium"),
    recommendedTiming: followupTimingEnum("recommended_timing").notNull().default("1_week"),

    subjectLine: text("subject_line"),
    messageContent: text("message_content"),
    callToAction: text("call_to_action"),
    reasoning: text("reasoning"),
    personalizationPoints: jsonb("personalization_points"),

    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
    needsHumanReview: boolean("needs_human_review").notNull().default(false),

    status: followupStatusEnum("status").notNull().default("draft"),

    modelUsed: varchar("model_used", { length: 200 }),
    rawAiResponse: jsonb("raw_ai_response"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fr_tenant_idx").on(t.tenantId),
    index("fr_lead_idx").on(t.leadId),
    index("fr_status_idx").on(t.tenantId, t.status),
    index("fr_priority_idx").on(t.tenantId, t.priority),
    index("fr_created_idx").on(t.tenantId, t.createdAt),
  ]
);

// ─── CRM Sync Jobs ───────────────────────────────────────────────────────────

export const crmSyncTypeEnum = pgEnum("crm_sync_type", [
  "contact", "company", "deal", "task", "full_sync",
]);

export const crmSyncStatusEnum = pgEnum("crm_sync_status", [
  "pending_approval", "approved", "queued", "processing", "completed", "failed",
]);

export const crmSyncJobs = pgTable(
  "crm_sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    syncType: crmSyncTypeEnum("sync_type").notNull().default("full_sync"),
    syncStatus: crmSyncStatusEnum("sync_status").notNull().default("pending_approval"),

    hubspotContactId: varchar("hubspot_contact_id", { length: 255 }),
    hubspotCompanyId: varchar("hubspot_company_id", { length: 255 }),
    hubspotDealId: varchar("hubspot_deal_id", { length: 255 }),
    hubspotTaskId: varchar("hubspot_task_id", { length: 255 }),

    syncPayload: jsonb("sync_payload"),
    syncResponse: jsonb("sync_response"),

    failureReason: text("failure_reason"),

    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("csj_tenant_idx").on(t.tenantId),
    index("csj_lead_idx").on(t.leadId),
    index("csj_status_idx").on(t.tenantId, t.syncStatus),
    index("csj_created_idx").on(t.tenantId, t.createdAt),
  ]
);

// ─── Opportunities ───────────────────────────────────────────────────────────

export const opportunityStageEnum = pgEnum("opportunity_stage", [
  "identified", "qualified", "meeting_scheduled", "proposal_requested",
  "proposal_sent", "negotiation", "won", "lost",
]);

export const opportunityPriorityEnum = pgEnum("opportunity_priority", [
  "high", "medium", "low",
]);

export const opportunitySourceEnum = pgEnum("opportunity_source", [
  "trade_show", "manual", "crm_sync",
]);

export const opportunityStatusEnum = pgEnum("opportunity_status", [
  "active", "won", "lost", "archived",
]);

export const opportunityActivityTypeEnum = pgEnum("opportunity_activity_type", [
  "note", "call", "email", "meeting", "task", "stage_change", "crm_sync", "follow_up",
]);

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    leadScoreId: uuid("lead_score_id").references(() => leadScores.id, { onDelete: "set null" }),
    crmSyncJobId: uuid("crm_sync_job_id").references(() => crmSyncJobs.id, { onDelete: "set null" }),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),

    opportunityName: varchar("opportunity_name", { length: 500 }).notNull(),
    companyName: varchar("company_name", { length: 255 }).notNull(),
    contactName: varchar("contact_name", { length: 255 }),

    stage: opportunityStageEnum("stage").notNull().default("identified"),
    priority: opportunityPriorityEnum("priority").notNull().default("medium"),

    amount: numeric("amount", { precision: 12, scale: 2 }),
    probability: numeric("probability", { precision: 5, scale: 4 }),
    expectedRevenue: numeric("expected_revenue", { precision: 12, scale: 2 }),

    expectedCloseDate: date("expected_close_date"),

    source: opportunitySourceEnum("source").notNull().default("trade_show"),

    nextStep: text("next_step"),
    riskNotes: text("risk_notes"),
    aiRecommendation: text("ai_recommendation"),

    status: opportunityStatusEnum("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("opp_tenant_idx").on(t.tenantId),
    index("opp_lead_idx").on(t.leadId),
    index("opp_stage_idx").on(t.tenantId, t.stage),
    index("opp_status_idx").on(t.tenantId, t.status),
    index("opp_owner_idx").on(t.tenantId, t.ownerUserId),
    index("opp_created_idx").on(t.tenantId, t.createdAt),
  ]
);

export const opportunityActivities = pgTable(
  "opportunity_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    activityType: opportunityActivityTypeEnum("activity_type").notNull(),
    description: text("description").notNull(),
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("oa_tenant_idx").on(t.tenantId),
    index("oa_opportunity_idx").on(t.opportunityId),
    index("oa_created_idx").on(t.opportunityId, t.createdAt),
  ]
);

// ─── Event Cost Tracking & ROI Analytics ───────────────────────────────────

export const eventCostCategoryEnum = pgEnum("event_cost_category", [
  "booth", "travel", "hotel", "marketing", "sponsorship", "staff", "collateral", "other",
]);

export const eventCosts = pgTable(
  "event_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),

    costCategory: eventCostCategoryEnum("cost_category").notNull().default("other"),
    description: text("description"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ec_tenant_idx").on(t.tenantId),
    index("ec_event_idx").on(t.eventId),
  ]
);

export const eventRoiMetrics = pgTable(
  "event_roi_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),

    totalEventCost: numeric("total_event_cost", { precision: 12, scale: 2 }).notNull().default("0"),
    totalLeads: integer("total_leads").notNull().default(0),
    qualifiedLeads: integer("qualified_leads").notNull().default(0),
    hotLeads: integer("hot_leads").notNull().default(0),
    opportunitiesCreated: integer("opportunities_created").notNull().default(0),

    pipelineGenerated: numeric("pipeline_generated", { precision: 12, scale: 2 }).notNull().default("0"),
    expectedRevenue: numeric("expected_revenue", { precision: 12, scale: 2 }).notNull().default("0"),
    wonRevenue: numeric("won_revenue", { precision: 12, scale: 2 }).notNull().default("0"),
    lostRevenue: numeric("lost_revenue", { precision: 12, scale: 2 }).notNull().default("0"),

    roiPercentage: numeric("roi_percentage", { precision: 8, scale: 2 }),
    costPerLead: numeric("cost_per_lead", { precision: 12, scale: 2 }),
    costPerQualifiedLead: numeric("cost_per_qualified_lead", { precision: 12, scale: 2 }),
    costPerOpportunity: numeric("cost_per_opportunity", { precision: 12, scale: 2 }),

    executiveSummary: text("executive_summary"),
    summaryGeneratedAt: timestamp("summary_generated_at", { withTimezone: true }),
    summaryConfidenceScore: numeric("summary_confidence_score", { precision: 5, scale: 2 }),
    summaryModelUsed: varchar("summary_model_used", { length: 200 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("erm_tenant_idx").on(t.tenantId),
    index("erm_event_idx").on(t.eventId),
  ]
);

// ─── Agent Orchestrator & Workflow Engine ──────────────────────────────────

export const agentStatusEnum = pgEnum("agent_status", ["active", "inactive", "maintenance"]);

export const agentExecutionStatusEnum = pgEnum("agent_execution_status", [
  "queued", "running", "completed", "failed", "cancelled", "skipped",
]);

export const workflowStatusEnum = pgEnum("workflow_status", [
  "queued", "running", "completed", "failed", "cancelled",
]);

export const agentRegistry = pgTable(
  "agent_registry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentName: varchar("agent_name", { length: 100 }).notNull().unique(),
    agentType: varchar("agent_type", { length: 100 }).notNull(),
    description: text("description"),
    version: varchar("version", { length: 20 }).notNull().default("1.0.0"),
    status: agentStatusEnum("status").notNull().default("active"),
    supportsRetry: boolean("supports_retry").notNull().default(true),
    maxRetries: integer("max_retries").notNull().default(3),
    executionTimeoutSeconds: integer("execution_timeout_seconds").notNull().default(60),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    workflowName: varchar("workflow_name", { length: 100 }).notNull().default("lead_qualification"),
    status: workflowStatusEnum("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    currentStep: integer("current_step").notNull().default(0),
    totalSteps: integer("total_steps").notNull().default(6),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("wr_tenant_idx").on(t.tenantId),
    index("wr_lead_idx").on(t.leadId),
    index("wr_status_idx").on(t.tenantId, t.status),
    index("wr_created_idx").on(t.tenantId, t.createdAt),
  ]
);

export const agentExecutions = pgTable(
  "agent_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    workflowId: uuid("workflow_id").references(() => workflowRuns.id, { onDelete: "cascade" }),
    agentName: varchar("agent_name", { length: 100 }).notNull(),
    stepOrder: integer("step_order").notNull().default(0),
    status: agentExecutionStatusEnum("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    retryCount: integer("retry_count").notNull().default(0),
    inputPayload: jsonb("input_payload"),
    outputPayload: jsonb("output_payload"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ae_tenant_idx").on(t.tenantId),
    index("ae_lead_idx").on(t.leadId),
    index("ae_workflow_idx").on(t.workflowId),
    index("ae_agent_idx").on(t.tenantId, t.agentName),
    index("ae_status_idx").on(t.tenantId, t.status),
    index("ae_created_idx").on(t.tenantId, t.createdAt),
  ]
);

export const agentPolicies = pgTable(
  "agent_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentName: varchar("agent_name", { length: 100 }).notNull(),
    policyName: varchar("policy_name", { length: 150 }).notNull(),
    policyType: varchar("policy_type", { length: 50 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    configuration: jsonb("configuration"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ap_agent_idx").on(t.agentName)]
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserStatus = "active" | "inactive" | "invited" | "suspended" | "locked";
export type PasswordHistoryRow = typeof passwordHistory.$inferSelect;
export type UserInvitation = typeof userInvitations.$inferSelect;
export type NewUserInvitation = typeof userInvitations.$inferInsert;
export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";
export type UserEventAccessRow = typeof userEventAccess.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type UserRole = "platform_admin" | "tenant_admin" | "manager" | "booth_user";
export type LeadStatus = "new" | "contacted" | "qualified" | "disqualified";
export type LeadSource = "manual" | "qr_form" | "business_card" | "qr_badge_scan";
export type VoiceNote = typeof voiceNotes.$inferSelect;
export type NewVoiceNote = typeof voiceNotes.$inferInsert;
export type RecordingStatus = "pending_upload" | "uploaded" | "failed" | "deleted";
export type BusinessCardImage = typeof businessCardImages.$inferSelect;
export type NewBusinessCardImage = typeof businessCardImages.$inferInsert;
export type OcrStatus = "not_started" | "pending" | "completed" | "failed";
export type OcrReviewStatus = "pending_review" | "reviewed" | "rejected";
export type TranscriptionStatus = "not_started" | "pending" | "completed" | "failed";
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
export type TranscribeStatus = "not_started" | "queued" | "in_progress" | "completed" | "failed";
export type ConversationInsight = typeof conversationInsights.$inferSelect;
export type NewConversationInsight = typeof conversationInsights.$inferInsert;
export type InsightInputSource = "manual_transcript" | "transcript_table" | "lead_notes";
export type InsightUrgency = "low" | "medium" | "high" | "unknown";
export type InsightStatus = "completed" | "failed" | "needs_review";
export type CompanyEnrichment = typeof companyEnrichment.$inferSelect;
export type ContactEnrichment = typeof contactEnrichment.$inferSelect;
export type EnrichmentStatus = "not_enriched" | "enriched" | "partially_enriched" | "failed" | "needs_review";
export type LeadScore = typeof leadScores.$inferSelect;
export type NewLeadScore = typeof leadScores.$inferInsert;
export type ScoreClassification = "hot" | "warm" | "cold" | "needs_review";
export type ScoreStatus = "completed" | "failed" | "needs_review";
export type FollowupRecommendation = typeof followupRecommendations.$inferSelect;
export type NewFollowupRecommendation = typeof followupRecommendations.$inferInsert;
export type FollowupType = "email" | "linkedin" | "meeting_request" | "phone_call";
export type FollowupPriority = "high" | "medium" | "low";
export type FollowupTiming = "immediate" | "24_hours" | "3_days" | "1_week" | "2_weeks";
export type FollowupStatus = "draft" | "approved" | "rejected";
export type CrmSyncJob = typeof crmSyncJobs.$inferSelect;
export type NewCrmSyncJob = typeof crmSyncJobs.$inferInsert;
export type CrmSyncType = "contact" | "company" | "deal" | "task" | "full_sync";
export type CrmSyncStatus = "pending_approval" | "approved" | "queued" | "processing" | "completed" | "failed";
export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
export type OpportunityStage = "identified" | "qualified" | "meeting_scheduled" | "proposal_requested" | "proposal_sent" | "negotiation" | "won" | "lost";
export type OpportunityPriority = "high" | "medium" | "low";
export type OpportunitySource = "trade_show" | "manual" | "crm_sync";
export type OpportunityStatus = "active" | "won" | "lost" | "archived";
export type OpportunityActivity = typeof opportunityActivities.$inferSelect;
export type NewOpportunityActivity = typeof opportunityActivities.$inferInsert;
export type OpportunityActivityType = "note" | "call" | "email" | "meeting" | "task" | "stage_change" | "crm_sync" | "follow_up";
export type EventCost = typeof eventCosts.$inferSelect;
export type NewEventCost = typeof eventCosts.$inferInsert;
export type EventCostCategory = "booth" | "travel" | "hotel" | "marketing" | "sponsorship" | "staff" | "collateral" | "other";
export type EventRoiMetrics = typeof eventRoiMetrics.$inferSelect;
export type NewEventRoiMetrics = typeof eventRoiMetrics.$inferInsert;
export type AgentRegistryRow = typeof agentRegistry.$inferSelect;
export type NewAgentRegistryRow = typeof agentRegistry.$inferInsert;
export type AgentStatus = "active" | "inactive" | "maintenance";
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type WorkflowStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type AgentExecution = typeof agentExecutions.$inferSelect;
export type NewAgentExecution = typeof agentExecutions.$inferInsert;
export type AgentExecutionStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "skipped";
export type AgentPolicy = typeof agentPolicies.$inferSelect;
export type NewAgentPolicy = typeof agentPolicies.$inferInsert;

// ─── Tenant Access Requests ───────────────────────────────────────────────────

export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "requested",
  "under_review",
  "approved",
  "rejected",
  "provisioned",
]);

export const tenantAccessRequests = pgTable(
  "tenant_access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    companyName:    varchar("company_name",    { length: 255 }).notNull(),
    companyWebsite: varchar("company_website", { length: 255 }),
    contactName:    varchar("contact_name",    { length: 255 }).notNull(),
    contactEmail:   varchar("contact_email",   { length: 255 }).notNull(),
    phone:          varchar("phone",           { length: 50 }),
    country:        varchar("country",         { length: 100 }),

    eventName:     varchar("event_name",   { length: 255 }),
    expectedUsers: integer("expected_users"),
    crmSystem:     varchar("crm_system",   { length: 100 }),
    useCase:       text("use_case"),
    message:       text("message"),

    honeypotTriggered: boolean("honeypot_triggered").notNull().default(false),
    ipAddress:         varchar("ip_address",  { length: 64 }),
    userAgent:         varchar("user_agent",  { length: 512 }),

    status:            accessRequestStatusEnum("status").notNull().default("requested"),
    reviewedByUserId:  uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt:        timestamp("reviewed_at",     { withTimezone: true }),
    rejectionReason:   text("rejection_reason"),
    adminNotes:        text("admin_notes"),

    createdTenantId:   uuid("created_tenant_id").references(() => tenants.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tar_status_idx").on(t.status),
    index("tar_email_idx").on(t.contactEmail),
    index("tar_created_idx").on(t.createdAt),
  ]
);

export type TenantAccessRequest = typeof tenantAccessRequests.$inferSelect;
export type NewTenantAccessRequest = typeof tenantAccessRequests.$inferInsert;
export type AccessRequestStatus = "requested" | "under_review" | "approved" | "rejected" | "provisioned";
