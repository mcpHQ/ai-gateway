ALTER TABLE "organizations" ADD COLUMN "monthly_budget_cents" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "period_spend_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "period_start" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "cache_ttl_seconds" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "fallbacks_json" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "requests_per_minute" integer;--> statement-breakpoint
ALTER TABLE "llm_requests" ADD COLUMN "cache_hit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_requests" ADD COLUMN "attempts_json" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"api_key_id" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_buckets_api_key_id_window_start_pk" PRIMARY KEY("api_key_id","window_start")
);--> statement-breakpoint
CREATE TABLE "response_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"api_key_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"provider_type" text NOT NULL,
	"model" text NOT NULL,
	"body_json" text NOT NULL,
	"meta_json" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "rate_limit_buckets" ADD CONSTRAINT "rate_limit_buckets_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_cache" ADD CONSTRAINT "response_cache_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_cache" ADD CONSTRAINT "response_cache_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "response_cache_expires_idx" ON "response_cache" USING btree ("expires_at");
