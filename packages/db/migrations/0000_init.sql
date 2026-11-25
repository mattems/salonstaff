CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"seeker_id" uuid NOT NULL,
	"cover_note" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"request_id" text,
	"reason" text,
	"confirmed_with" uuid
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"response_status" integer,
	"response_body" text,
	"response_content_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"salon_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"suburb_slug" text NOT NULL,
	"title" text NOT NULL,
	"role" text NOT NULL,
	"employment_type" text NOT NULL,
	"pay_min" double precision,
	"pay_max" double precision,
	"pay_period" text DEFAULT 'hour' NOT NULL,
	"suburb" text NOT NULL,
	"state" text NOT NULL,
	"postcode" text NOT NULL,
	"description" text NOT NULL,
	"requirements" text,
	"require_qualification" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"paid_via" text,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"salon_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"provider" text NOT NULL,
	"checkout_ref" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_checkout_ref_unique" UNIQUE("checkout_ref")
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"image_key" text NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salon_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"salon_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"abn" text NOT NULL,
	"abn_entity_name" text,
	"contact_name" text NOT NULL,
	"phone" text NOT NULL,
	"status" text NOT NULL,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"decided_by" text,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"suburb_slug" text NOT NULL,
	"abn" text,
	"abn_status" text DEFAULT 'not_started' NOT NULL,
	"abn_entity_name" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"website" text,
	"instagram" text,
	"address" text,
	"suburb" text NOT NULL,
	"state" text NOT NULL,
	"postcode" text NOT NULL,
	"about" text,
	"logo_key" text,
	"founding" boolean DEFAULT false NOT NULL,
	"free_until" timestamp with time zone,
	"listing_credits" integer DEFAULT 0 NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text,
	"subscription_current_period_end" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"source" text DEFAULT 'owner' NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_jobs" (
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_jobs_user_id_job_id_pk" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "seeker_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reference" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"document_key" text,
	"reviewed_by" uuid,
	"review_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seeker_checks_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "seeker_education" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"qualification" text NOT NULL,
	"institution" text NOT NULL,
	"year" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seeker_experience" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"salon_name" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"start_month" text NOT NULL,
	"end_month" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seeker_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"headline" text,
	"about" text,
	"suburb" text NOT NULL,
	"state" text NOT NULL,
	"postcode" text NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"years_experience" integer DEFAULT 0 NOT NULL,
	"qualifications" text,
	"instagram" text,
	"right_to_work" text NOT NULL,
	"open_to_work" boolean DEFAULT true NOT NULL,
	"photo_key" text,
	"specialties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brands" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"available_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"employment_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"available_from" text,
	"travel_km" integer,
	"pay_expectation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "slug_redirects" (
	"path" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"added_by" uuid,
	"reason" text,
	"last_seen_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "staff_confirmations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"action" text,
	"target" text,
	"challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_passkeys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}' NOT NULL,
	"name" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "user_flags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone_number" text,
	"phone_number_verified" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'seeker' NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspended_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salon_claims" ADD CONSTRAINT "salon_claims_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salon_claims" ADD CONSTRAINT "salon_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salons" ADD CONSTRAINT "salons_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_checks" ADD CONSTRAINT "seeker_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_education" ADD CONSTRAINT "seeker_education_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_experience" ADD CONSTRAINT "seeker_experience_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeker_profiles" ADD CONSTRAINT "seeker_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_confirmations" ADD CONSTRAINT "staff_confirmations_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_passkeys" ADD CONSTRAINT "staff_passkeys_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_flags" ADD CONSTRAINT "user_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_job_seeker_uq" ON "applications" USING btree ("job_id","seeker_id");--> statement-breakpoint
CREATE INDEX "applications_seeker_idx" ON "applications" USING btree ("seeker_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_id","id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_path_uq" ON "jobs" USING btree ("state","suburb_slug","slug");--> statement-breakpoint
CREATE INDEX "jobs_feed_idx" ON "jobs" USING btree ("status","expires_at","published_at");--> statement-breakpoint
CREATE INDEX "jobs_salon_idx" ON "jobs" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "jobs_role_place_idx" ON "jobs" USING btree ("role","state","suburb_slug");--> statement-breakpoint
CREATE INDEX "portfolio_items_user_idx" ON "portfolio_items" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "salon_claims_status_idx" ON "salon_claims" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "salons_path_uq" ON "salons" USING btree ("state","suburb_slug","slug");--> statement-breakpoint
CREATE INDEX "salons_owner_idx" ON "salons" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "salons_abn_idx" ON "salons" USING btree ("abn");--> statement-breakpoint
CREATE INDEX "salons_directory_idx" ON "salons" USING btree ("status","state","suburb_slug");--> statement-breakpoint
CREATE INDEX "seeker_checks_user_idx" ON "seeker_checks" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "seeker_checks_provider_ref_idx" ON "seeker_checks" USING btree ("provider_ref");--> statement-breakpoint
CREATE INDEX "seeker_checks_pending_idx" ON "seeker_checks" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "seeker_education_user_idx" ON "seeker_education" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "seeker_experience_user_idx" ON "seeker_experience" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "slug_redirects_target_idx" ON "slug_redirects" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "staff_confirmations_expires_idx" ON "staff_confirmations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "staff_passkeys_staff_idx" ON "staff_passkeys" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "user_flags_user_idx" ON "user_flags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");