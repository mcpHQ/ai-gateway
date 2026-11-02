CREATE TABLE "semantic_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"api_key_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"model" text NOT NULL,
	"params_hash" text NOT NULL,
	"embedding_json" text NOT NULL,
	"body_json" text NOT NULL,
	"meta_json" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_requests" ADD COLUMN "cache_kind" text DEFAULT 'miss' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_requests" ADD COLUMN "cache_read_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_requests" ADD COLUMN "cache_write_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "cache_mode" text DEFAULT 'exact' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "similarity_threshold" text DEFAULT '0.95' NOT NULL;--> statement-breakpoint
ALTER TABLE "semantic_cache" ADD CONSTRAINT "semantic_cache_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_cache" ADD CONSTRAINT "semantic_cache_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "semantic_cache_lookup_idx" ON "semantic_cache" USING btree ("organization_id","api_key_id","endpoint","model","params_hash");