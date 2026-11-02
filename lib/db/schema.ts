import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  monthlyBudgetCents: integer("monthly_budget_cents"),
  periodSpendMicros: bigint("period_spend_micros", { mode: "number" }).notNull().default(0),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull().defaultNow(),
  cacheTtlSeconds: integer("cache_ttl_seconds"),
  cacheMode: text("cache_mode").notNull().default("exact"),
  similarityThreshold: text("similarity_threshold").notNull().default("0.95"),
  guardAction: text("guard_action").notNull().default("flag"),
  fallbacksJson: text("fallbacks_json").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gateways = pgTable(
  "gateways",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    monthlyBudgetCents: integer("monthly_budget_cents"),
    periodSpendMicros: bigint("period_spend_micros", { mode: "number" }).notNull().default(0),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull().defaultNow(),
    cacheTtlSeconds: integer("cache_ttl_seconds"),
    cacheMode: text("cache_mode").notNull().default("exact"),
    similarityThreshold: text("similarity_threshold").notNull().default("0.95"),
    fallbacksJson: text("fallbacks_json").notNull().default("[]"),
    guardAction: text("guard_action").notNull().default("flag"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("gateways_org_slug_idx").on(table.organizationId, table.slug),
    index("gateways_org_id_idx").on(table.organizationId),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memberships_org_user_idx").on(table.organizationId, table.userId),
    index("memberships_user_id_idx").on(table.userId),
  ],
);

export const providers = pgTable(
  "providers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    baseUrl: text("base_url"),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    modelsJson: text("models_json").notNull().default("[]"),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("providers_org_id_idx").on(table.organizationId)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    gatewayId: text("gateway_id").references(() => gateways.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    monthlyBudgetCents: integer("monthly_budget_cents"),
    requestsPerMinute: integer("requests_per_minute"),
    disabled: boolean("disabled").notNull().default(false),
    periodSpendMicros: bigint("period_spend_micros", { mode: "number" }).notNull().default(0),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("api_keys_org_id_idx").on(table.organizationId)],
);

export const llmRequests = pgTable(
  "llm_requests",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    gatewayId: text("gateway_id").references(() => gateways.id, { onDelete: "set null" }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    providerId: text("provider_id").references(() => providers.id, { onDelete: "set null" }),
    providerType: text("provider_type").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    usageSource: text("usage_source").notNull().default("provider"),
    status: integer("status").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    streamed: boolean("streamed").notNull().default(false),
    cacheHit: boolean("cache_hit").notNull().default(false),
    cacheKind: text("cache_kind").notNull().default("miss"),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    attemptsJson: text("attempts_json").notNull().default("[]"),
    guardAction: text("guard_action").notNull().default(""),
    guardFindings: text("guard_findings").notNull().default("[]"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("llm_requests_org_created_idx").on(table.organizationId, table.createdAt),
    index("llm_requests_model_idx").on(table.model),
  ],
);

export const modelPrices = pgTable(
  "model_prices",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    inputPerMillion: text("input_per_million").notNull(),
    outputPerMillion: text("output_per_million").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("model_prices_org_model_idx").on(table.organizationId, table.model)],
);

export const responseCache = pgTable(
  "response_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    providerType: text("provider_type").notNull(),
    model: text("model").notNull(),
    bodyJson: text("body_json").notNull(),
    metaJson: text("meta_json").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("response_cache_expires_idx").on(table.expiresAt)],
);

export const semanticCache = pgTable(
  "semantic_cache",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    model: text("model").notNull(),
    paramsHash: text("params_hash").notNull(),
    embeddingJson: text("embedding_json").notNull(),
    bodyJson: text("body_json").notNull(),
    metaJson: text("meta_json").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("semantic_cache_lookup_idx").on(table.organizationId, table.apiKeyId, table.endpoint, table.model, table.paramsHash)],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.apiKeyId, table.windowStart] })],
);

export const userRelations = relations(user, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(session),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  providers: many(providers),
  apiKeys: many(apiKeys),
  llmRequests: many(llmRequests),
  modelPrices: many(modelPrices),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  user: one(user, {
    fields: [memberships.userId],
    references: [user.id],
  }),
}));

export const providersRelations = relations(providers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [providers.organizationId],
    references: [organizations.id],
  }),
  requests: many(llmRequests),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [apiKeys.organizationId],
    references: [organizations.id],
  }),
  requests: many(llmRequests),
}));

export const llmRequestsRelations = relations(llmRequests, ({ one }) => ({
  organization: one(organizations, {
    fields: [llmRequests.organizationId],
    references: [organizations.id],
  }),
  apiKey: one(apiKeys, {
    fields: [llmRequests.apiKeyId],
    references: [apiKeys.id],
  }),
  provider: one(providers, {
    fields: [llmRequests.providerId],
    references: [providers.id],
  }),
}));
