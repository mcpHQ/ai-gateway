ALTER TABLE "llm_requests" ADD COLUMN "guard_action" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_requests" ADD COLUMN "guard_findings" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "guard_action" text DEFAULT 'flag' NOT NULL;