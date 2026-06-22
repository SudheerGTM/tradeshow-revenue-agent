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
