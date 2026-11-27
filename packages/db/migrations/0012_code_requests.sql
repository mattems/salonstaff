CREATE TABLE "code_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"destination_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "code_requests_destination_idx" ON "code_requests" USING btree ("destination_hash","created_at");