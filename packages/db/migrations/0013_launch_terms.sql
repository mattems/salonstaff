CREATE TABLE "launch_terms" (
	"abn" text PRIMARY KEY NOT NULL,
	"free_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conversation_messages_sender_idx" ON "conversation_messages" USING btree ("sender_id","created_at");
--> statement-breakpoint
-- Salons that already have their launch terms: their ABNs have had them.
INSERT INTO "launch_terms" ("abn", "free_until")
SELECT "abn", min("free_until") FROM "salons"
WHERE "abn" IS NOT NULL AND "free_until" IS NOT NULL
GROUP BY "abn"
ON CONFLICT DO NOTHING;
