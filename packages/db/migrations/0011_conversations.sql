CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"from" text NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"sender_id" uuid,
	"body" text DEFAULT '' NOT NULL,
	"application_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"salon_id" uuid NOT NULL,
	"seeker_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"salon_read_at" timestamp with time zone,
	"seeker_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_idx" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_salon_seeker_uq" ON "conversations" USING btree ("salon_id","seeker_id");--> statement-breakpoint
CREATE INDEX "conversations_seeker_idx" ON "conversations" USING btree ("seeker_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_salon_idx" ON "conversations" USING btree ("salon_id","last_message_at");--> statement-breakpoint
-- D-19: one conversation per salon and job seeker. Copy in each application's messages (D-17) and each
-- emailed profile message and number look (D-13). The old tables stay until no deployed code reads them.
WITH sources AS (
  SELECT j.salon_id, a.seeker_id, m.created_at, a.salon_read_at, a.seeker_read_at
  FROM application_messages m
  JOIN applications a ON a.id = m.application_id
  JOIN jobs j ON j.id = a.job_id
  UNION ALL
  SELECT pc.salon_id, pc.seeker_id, pc.created_at, NULL, pc.read_at
  FROM profile_contacts pc
)
INSERT INTO "conversations" ("id", "salon_id", "seeker_id", "last_message_at", "salon_read_at", "seeker_read_at", "created_at")
SELECT gen_random_uuid(), salon_id, seeker_id, max(created_at), max(salon_read_at), max(seeker_read_at), min(created_at)
FROM sources
GROUP BY salon_id, seeker_id
ON CONFLICT ("salon_id", "seeker_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "conversation_messages" ("id", "conversation_id", "from", "kind", "sender_id", "body", "application_id", "created_at")
SELECT m.id, c.id, m."from", 'text', m.sender_id, m.body, m.application_id, m.created_at
FROM application_messages m
JOIN applications a ON a.id = m.application_id
JOIN jobs j ON j.id = a.job_id
JOIN conversations c ON c.salon_id = j.salon_id AND c.seeker_id = a.seeker_id
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "conversation_messages" ("id", "conversation_id", "from", "kind", "sender_id", "body", "application_id", "created_at")
SELECT pc.id, c.id, 'salon', CASE WHEN pc.kind = 'phone' THEN 'number_viewed' ELSE 'text' END, pc.sender_id, coalesce(pc.message, ''), NULL, pc.created_at
FROM profile_contacts pc
JOIN conversations c ON c.salon_id = pc.salon_id AND c.seeker_id = pc.seeker_id
ON CONFLICT ("id") DO NOTHING;
