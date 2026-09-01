import { relations } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

import { EMBEDDING_DIMENSIONS } from "@/lib/grievance/embedding-config";
import { COMPLAINT_STATUSES } from "@/lib/grievance/status";
import { ROLES } from "@/lib/roles";

/**
 * Closed sets the database enforces itself.
 *
 * These are declared in TypeScript first (lib/roles.ts, lib/grievance/status.ts)
 * because the UI needs their labels; mirroring them into pg enums means an
 * invalid value is rejected at the write rather than silently stored and then
 * narrowed on read. Adding a variant is `ALTER TYPE ... ADD VALUE`, which
 * Postgres does without rewriting the table.
 */
export const roleEnum = pgEnum("role", ROLES);

export const complaintStatusEnum = pgEnum(
  "complaint_status",
  COMPLAINT_STATUSES,
);

/** Who last set a routing field - the AI, or a human overriding it. */
export const decisionSourceEnum = pgEnum("decision_source", [
  "ai",
  "admin",
  "department",
]);

/** Which pass in the pipeline produced an ai_decision row. */
export const decisionKindEnum = pgEnum("decision_kind", [
  "classification",
  "prioritization",
  "duplicate",
]);

/** The kinds of entry that can appear on a complaint timeline. */
export const eventTypeEnum = pgEnum("event_type", [
  "created",
  "status_changed",
  "assigned",
  "reassigned",
  "remark",
  "ai_triage",
  "override",
  "resolved",
]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  /**
   * citizen | department | admin. Everyone signs up as a citizen; an admin
   * promotes them. Kept as text rather than a pg enum so adding a role later
   * is a code change, not a migration that locks the table.
   */
  role: roleEnum("role").notNull().default("citizen"),
  /**
   * Set only for department users - which department's queue they work. Null
   * for citizens and for admins, who see every department.
   *
   * `set null` on delete, not cascade: removing a department must not delete
   * the people who staffed it.
   */
  departmentId: text("department_id").references(() => department.id, {
    onDelete: "set null",
  }),
  /** Disabled accounts keep their history but cannot sign in. */
  active: boolean("active").default(true).notNull(),
  /**
   * WhatsApp contact, stored in full international form without a plus - the
   * shape the gateway expects, so nothing has to reformat it at send time.
   * Null until the citizen provides one.
   */
  phone: text("phone"),
  /**
   * Whether to push complaint updates to WhatsApp.
   *
   * Kept separate from `phone` on purpose: a citizen can turn the messages off
   * without deleting their number, and turn them back on without typing it
   * again. Defaults to off - a phone number is not consent to be messaged.
   */
  whatsappNotifications: boolean("whatsapp_notifications")
    .default(false)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_issuer_accountId_uidx").on(
      table.issuer,
      table.accountId,
    ),
    index("account_userId_idx").on(table.userId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));


/**
 * A unit that complaints are routed to - "Water Supply", "Roads", "Sanitation".
 *
 * The description is not decoration: it is the text the classifier reads when
 * deciding where a complaint belongs, so an admin retunes routing by editing
 * prose rather than by touching a prompt in the codebase.
 */
export const department = pgTable(
  "department",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Short code shown in dense table cells - "WTR", "RDS". */
    slug: text("slug").notNull().unique(),
    /** What this department handles. Fed to the AI classifier verbatim. */
    description: text("description").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("department_active_name_idx").on(table.active, table.name)],
);

/**
 * A configurable priority level - "Critical", "Routine".
 *
 * A table rather than a code enum because the strategy makes priorities admin
 * managed. `severity` (1-5) is what everything actually sorts and escalates by,
 * so renaming a level never breaks a query.
 */
export const priority = pgTable(
  "priority",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** 1 (lowest) to 5 (critical). Sorting and SLAs key off this, not the name. */
    severity: integer("severity").notNull().default(3),
    /** Hours to resolution, for the overdue tallies. Null means no target. */
    slaHours: integer("sla_hours"),
    /** Hex swatch, so a level keeps one colour across every chart and badge. */
    color: text("color").notNull().default("#64748B"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("priority_severity_idx").on(table.severity)],
);

/**
 * One citizen complaint, and the spine of the whole platform.
 *
 * The AI conclusions live here as ordinary columns (`departmentId`,
 * `priorityId`, `duplicateOfId`) rather than in a side table, because the
 * moment an admin overrides one there is no useful distinction between "what
 * the AI said" and "what is true" - the audit trail in `aiDecision` keeps the
 * history. The `*Source` columns record who last set each field.
 */
export const complaint = pgTable(
  "complaint",
  {
    id: text("id").primaryKey(),
    /** Short human reference shown to citizens - "GRV-4F2A19". */
    reference: text("reference").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull(),

    /** Who filed it. Their complaints die with the account. */
    citizenId: text("citizen_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    status: complaintStatusEnum("status").notNull().default("submitted"),

    /**
     * Routing and ranking. Both nullable: a complaint exists from the instant
     * it is submitted, and triage happens immediately afterwards.
     */
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "set null",
    }),
    priorityId: text("priority_id").references(() => priority.id, {
      onDelete: "set null",
    }),
    /** Who last set the department, and who last set the priority. */
    departmentSource: decisionSourceEnum("department_source"),
    prioritySource: decisionSourceEnum("priority_source"),

    /** The department user who accepted it, if anyone has. */
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),

    /**
     * The earlier complaint this one restates, if any. Self-referencing, and
     * `set null` so deleting the original does not erase the duplicate.
     */
    duplicateOfId: text("duplicate_of_id").references(
      (): AnyPgColumn => complaint.id,
      { onDelete: "set null" },
    ),

    /** Free-text location as typed, plus coordinates when the browser gave them. */
    locationText: text("location_text"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    /** Coarse bucket for hotspot grouping without PostGIS - see lib/grievance/geo.ts. */
    geohash: text("geohash"),

    /**
     * Embedding of title + description, for semantic duplicate detection.
     * Null until the triage pass runs, or if the embedding call fails - which
     * must never block a submission.
     */
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),

    resolutionNote: text("resolution_note"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // The citizen's own list, newest first.
    index("complaint_citizen_createdAt_idx").on(
      table.citizenId,
      table.createdAt,
    ),
    // The department queue, which always filters by status.
    index("complaint_department_status_idx").on(
      table.departmentId,
      table.status,
      table.createdAt,
    ),
    // The admin table's default sort, and every dashboard tally.
    index("complaint_status_createdAt_idx").on(table.status, table.createdAt),
    // Duplicate detection shortlists by HNSW cosine distance.
    index("complaint_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

/** A photo attached to a complaint. Stored in MinIO; only the key lives here. */
export const complaintImage = pgTable(
  "complaint_image",
  {
    id: text("id").primaryKey(),
    complaintId: text("complaint_id")
      .notNull()
      .references(() => complaint.id, { onDelete: "cascade" }),
    /** The object key, never a URL - view links are signed per request. */
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("complaint_image_complaintId_idx").on(table.complaintId)],
);

/**
 * Every state change on a complaint, append-only.
 *
 * This is what the citizen tracking timeline and the admin audit view both
 * read. Kept separate from the complaint row so that overriding the AI leaves
 * evidence rather than overwriting it.
 */
export const complaintEvent = pgTable(
  "complaint_event",
  {
    id: text("id").primaryKey(),
    complaintId: text("complaint_id")
      .notNull()
      .references(() => complaint.id, { onDelete: "cascade" }),
    type: eventTypeEnum("type").notNull(),
    /** Who acted. Null when the actor was the AI pipeline rather than a person. */
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Rendered summary - "Status changed from Assigned to In progress". */
    message: text("message").notNull(),
    /** The remark body, for `remark` events. */
    note: text("note"),
    fromStatus: complaintStatusEnum("from_status"),
    toStatus: complaintStatusEnum("to_status"),
    /** Hidden from the citizen timeline - internal department chatter. */
    internal: boolean("internal").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("complaint_event_complaintId_createdAt_idx").on(
      table.complaintId,
      table.createdAt,
    ),
  ],
);

/**
 * One AI decision, kept for the "AI decision logs" screen.
 *
 * Every pass writes a row whether or not it changed anything, so a wrong
 * routing can be traced to the confidence and reasoning that produced it.
 */
export const aiDecision = pgTable(
  "ai_decision",
  {
    id: text("id").primaryKey(),
    complaintId: text("complaint_id")
      .notNull()
      .references(() => complaint.id, { onDelete: "cascade" }),
    kind: decisionKindEnum("kind").notNull(),
    /** The chosen department id, priority id or duplicate complaint id. */
    outcomeId: text("outcome_id"),
    /** Human-readable outcome, so the log renders without four joins. */
    outcomeLabel: text("outcome_label"),
    /** 0-1. Below the configured threshold the decision is left for review. */
    confidence: doublePrecision("confidence").notNull().default(0),
    /** The model's own justification, shown verbatim in the log. */
    reason: text("reason").notNull(),
    model: text("model"),
    /** Whether a human later overrode this decision. */
    overridden: boolean("overridden").default(false).notNull(),
    /** Anything extra the pass wants to keep - candidate scores, alternatives. */
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_decision_complaintId_idx").on(table.complaintId),
    index("ai_decision_kind_createdAt_idx").on(table.kind, table.createdAt),
  ],
);

/**
 * A message to one user about one complaint.
 *
 * Written by the same code that records the event, because a citizen should
 * hear about exactly the transitions their timeline shows.
 */
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    complaintId: text("complaint_id").references(() => complaint.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notification_userId_readAt_idx").on(
      table.userId,
      table.readAt,
      table.createdAt,
    ),
  ],
);

/**
 * Platform-wide settings, as a single row keyed by `id = "singleton"`.
 *
 * A table rather than env vars because these are tuned by an admin at runtime:
 * turning auto-assignment off during an incident should not need a redeploy.
 */
export const platformSetting = pgTable("platform_setting", {
  id: text("id").primaryKey(),
  /** Master switch for the whole triage pipeline. */
  aiEnabled: boolean("ai_enabled").default(true).notNull(),
  autoClassify: boolean("auto_classify").default(true).notNull(),
  autoPrioritize: boolean("auto_prioritize").default(true).notNull(),
  duplicateDetection: boolean("duplicate_detection").default(true).notNull(),
  /**
   * Cosine similarity above which two complaints are treated as the same
   * underlying issue. 0.86 is deliberately conservative - a missed duplicate
   * is a wasted crew visit, a false one silently buries a real complaint.
   */
  duplicateThreshold: doublePrecision("duplicate_threshold")
    .default(0.86)
    .notNull(),
  /** Below this classifier confidence the complaint is left for manual triage. */
  confidenceThreshold: doublePrecision("confidence_threshold")
    .default(0.55)
    .notNull(),
  /** Whether a confident classification also moves the complaint to "assigned". */
  autoAssign: boolean("auto_assign").default(true).notNull(),
  platformName: text("platform_name").default("Jan Samadhan").notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  notifications: many(notification),
  // A user reaches `complaint` two ways - as the citizen who filed it and as
  // the staff member assigned to it. Both sides must name the same
  // relationName, otherwise Drizzle cannot tell which foreign key each one
  // means and refuses to build the relational graph.
  complaints: many(complaint, { relationName: "complaint_citizen" }),
  assignedComplaints: many(complaint, { relationName: "complaint_assignee" }),
  department: one(department, {
    fields: [user.departmentId],
    references: [department.id],
  }),
  events: many(complaintEvent),
}));

export const departmentRelations = relations(department, ({ many }) => ({
  members: many(user),
  complaints: many(complaint),
}));

export const priorityRelations = relations(priority, ({ many }) => ({
  complaints: many(complaint),
}));

export const complaintRelations = relations(complaint, ({ one, many }) => ({
  citizen: one(user, {
    fields: [complaint.citizenId],
    references: [user.id],
    relationName: "complaint_citizen",
  }),
  assignee: one(user, {
    fields: [complaint.assigneeId],
    references: [user.id],
    relationName: "complaint_assignee",
  }),
  department: one(department, {
    fields: [complaint.departmentId],
    references: [department.id],
  }),
  priority: one(priority, {
    fields: [complaint.priorityId],
    references: [priority.id],
  }),
  duplicateOf: one(complaint, {
    fields: [complaint.duplicateOfId],
    references: [complaint.id],
    relationName: "complaint_duplicate",
  }),
  duplicates: many(complaint, { relationName: "complaint_duplicate" }),
  images: many(complaintImage),
  events: many(complaintEvent),
  decisions: many(aiDecision),
}));

export const complaintImageRelations = relations(complaintImage, ({ one }) => ({
  complaint: one(complaint, {
    fields: [complaintImage.complaintId],
    references: [complaint.id],
  }),
}));

export const complaintEventRelations = relations(complaintEvent, ({ one }) => ({
  complaint: one(complaint, {
    fields: [complaintEvent.complaintId],
    references: [complaint.id],
  }),
  actor: one(user, {
    fields: [complaintEvent.actorId],
    references: [user.id],
  }),
}));

export const aiDecisionRelations = relations(aiDecision, ({ one }) => ({
  complaint: one(complaint, {
    fields: [aiDecision.complaintId],
    references: [complaint.id],
  }),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
    references: [user.id],
  }),
  complaint: one(complaint, {
    fields: [notification.complaintId],
    references: [complaint.id],
  }),
}));
