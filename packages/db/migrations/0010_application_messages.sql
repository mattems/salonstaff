CREATE TABLE "application_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"from" text NOT NULL,
	"sender_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "last_message_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "salon_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "seeker_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "application_messages" ADD CONSTRAINT "application_messages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_messages" ADD CONSTRAINT "application_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_messages_application_idx" ON "application_messages" USING btree ("application_id","created_at");