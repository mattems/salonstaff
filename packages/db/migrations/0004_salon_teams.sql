CREATE TABLE "salon_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"salon_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salon_members" (
	"salon_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salon_members_salon_id_user_id_pk" PRIMARY KEY("salon_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "notify_user_ids" uuid[];--> statement-breakpoint
ALTER TABLE "salon_invites" ADD CONSTRAINT "salon_invites_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salon_invites" ADD CONSTRAINT "salon_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salon_members" ADD CONSTRAINT "salon_members_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salon_members" ADD CONSTRAINT "salon_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "salon_invites_token_uq" ON "salon_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "salon_invites_email_uq" ON "salon_invites" USING btree ("salon_id","email");--> statement-breakpoint
CREATE INDEX "salon_members_user_idx" ON "salon_members" USING btree ("user_id");--> statement-breakpoint
-- D-11: each salon's owner becomes its first team member. owner_id stays (unread) until a later migration drops it.
INSERT INTO "salon_members" ("salon_id", "user_id", "role", "created_at")
SELECT "id", "owner_id", 'owner', coalesce("claimed_at", "created_at") FROM "salons" WHERE "owner_id" IS NOT NULL
ON CONFLICT DO NOTHING;
