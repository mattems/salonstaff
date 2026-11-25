CREATE TABLE "localities" (
	"code" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"suburb" text NOT NULL,
	"suburb_slug" text NOT NULL,
	"postcodes" text[] NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postcodes" (
	"postcode" text PRIMARY KEY NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "salons" ADD COLUMN "longitude" double precision;--> statement-breakpoint
CREATE INDEX "localities_place_idx" ON "localities" USING btree ("state","suburb_slug");--> statement-breakpoint
CREATE INDEX "jobs_location_idx" ON "jobs" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "salons_location_idx" ON "salons" USING btree ("latitude","longitude");