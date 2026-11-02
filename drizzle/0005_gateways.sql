CREATE TABLE "gateways" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"monthly_budget_cents" integer,
	"period_spend_micros" bigint DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"cache_ttl_seconds" integer,
	"cache_mode" text DEFAULT 'exact' NOT NULL,
	"similarity_threshold" text DEFAULT '0.95' NOT NULL,
	"fallbacks_json" text DEFAULT '[]' NOT NULL,
	"guard_action" text DEFAULT 'flag' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "gateway_id" text;--> statement-breakpoint
ALTER TABLE "llm_requests" ADD COLUMN "gateway_id" text;--> statement-breakpoint
INSERT INTO "gateways" (
  "id", "organization_id", "name", "slug",
  "monthly_budget_cents", "period_spend_micros", "period_start",
  "cache_ttl_seconds", "cache_mode", "similarity_threshold", "fallbacks_json", "guard_action"
)
SELECT
  gen_random_uuid()::text,
  "id",
  'Default',
  'default-' || left("id", 4),
  "monthly_budget_cents",
  "period_spend_micros",
  "period_start",
  "cache_ttl_seconds",
  "cache_mode",
  "similarity_threshold",
  "fallbacks_json",
  "guard_action"
FROM "organizations";--> statement-breakpoint
UPDATE "api_keys" AS keys
SET "gateway_id" = gateways."id"
FROM "gateways"
WHERE gateways."organization_id" = keys."organization_id" AND keys."gateway_id" IS NULL;--> statement-breakpoint
UPDATE "llm_requests" AS requests
SET "gateway_id" = gateways."id"
FROM "gateways"
WHERE gateways."organization_id" = requests."organization_id" AND requests."gateway_id" IS NULL;--> statement-breakpoint
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gateways_org_slug_idx" ON "gateways" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "gateways_org_id_idx" ON "gateways" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_gateway_id_gateways_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_requests" ADD CONSTRAINT "llm_requests_gateway_id_gateways_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateways"("id") ON DELETE set null ON UPDATE no action;