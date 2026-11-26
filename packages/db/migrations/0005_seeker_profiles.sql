CREATE TABLE "profile_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seeker_id" uuid NOT NULL,
	"salon_id" uuid NOT NULL,
	"sender_id" uuid,
	"kind" text NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seeker_endorsements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"referee_email" text NOT NULL,
	"referee_name" text NOT NULL,
	"note" text,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"referee_title" text,
	"salon_name" text,
	"relationship" text,
	"body" text,
	"contact_ok" boolean DEFAULT false NOT NULL,
	"referee_phone" text,
	"referee_salon_id" uuid,
	"written_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seeker_endorsements_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "seeker_hidden_salons" (
	"user_id" uuid NOT NULL,
	"salon_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seeker_hidden_salons_user_id_salon_id_pk" PRIMARY KEY("user_id","salon_id")
);
--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "tiktok" text;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "visibility" text DEFAULT 'salons' NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "contact_by" text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "share_code" text;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "pay_min" double precision;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD COLUMN "pay_period" text DEFAULT 'hour' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_contacts" ADD CONSTRAINT "profile_contacts_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_contacts" ADD CONSTRAINT "profile_contacts_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_contacts" ADD CONSTRAINT "profile_contacts_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_endorsements" ADD CONSTRAINT "seeker_endorsements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_endorsements" ADD CONSTRAINT "seeker_endorsements_referee_salon_id_salons_id_fk" FOREIGN KEY ("referee_salon_id") REFERENCES "public"."salons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_hidden_salons" ADD CONSTRAINT "seeker_hidden_salons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_hidden_salons" ADD CONSTRAINT "seeker_hidden_salons_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_contacts_seeker_idx" ON "profile_contacts" USING btree ("seeker_id","created_at");--> statement-breakpoint
CREATE INDEX "profile_contacts_salon_idx" ON "profile_contacts" USING btree ("salon_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "seeker_endorsements_user_idx" ON "seeker_endorsements" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "seeker_endorsements_referee_idx" ON "seeker_endorsements" USING btree ("user_id","referee_email");--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD CONSTRAINT "seeker_profiles_share_code_unique" UNIQUE("share_code");--> statement-breakpoint
-- D-13: carry free-text pay expectations ("$35/hr", "$70k") over to pay_min and pay_period where a number can be read.
UPDATE "seeker_profiles" AS p SET
  "pay_min" = v.amount,
  "pay_period" = CASE
    WHEN v.said ~* '(week|wk|p/?w\M)' THEN 'week'
    WHEN v.said ~* '(year|annum|salary|p/?a\M)' OR v.amount >= 1000 THEN 'year'
    ELSE 'hour'
  END
FROM (
  SELECT "user_id", "pay_expectation" AS said,
    (substring(replace("pay_expectation", ',', '') from '[0-9]+(?:\.[0-9]+)?'))::double precision
      * CASE WHEN "pay_expectation" ~* '[0-9]\s*k\M' THEN 1000 ELSE 1 END AS amount
  FROM "seeker_profiles"
  WHERE "pay_expectation" ~ '[0-9]' AND "pay_min" IS NULL
) AS v
WHERE p."user_id" = v."user_id" AND v.amount > 0 AND v.amount <= 500000;
