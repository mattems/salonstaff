ALTER TABLE "salon_claims" ADD COLUMN "verify_via" text;--> statement-breakpoint
ALTER TABLE "salon_claims" ADD COLUMN "code_hash" text;--> statement-breakpoint
ALTER TABLE "salon_claims" ADD COLUMN "code_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "hero_key" text;