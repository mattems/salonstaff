ALTER TABLE "seeker_education" ALTER COLUMN "institution" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "seeker_checks" ADD COLUMN "education_id" uuid;--> statement-breakpoint
ALTER TABLE "seeker_checks" ADD CONSTRAINT "seeker_checks_education_id_seeker_education_id_fk" FOREIGN KEY ("education_id") REFERENCES "public"."seeker_education"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seeker_checks_education_idx" ON "seeker_checks" USING btree ("education_id");--> statement-breakpoint
-- The profile's free-text qualifications become education entries (one per comma, semicolon or line), unless already listed.
INSERT INTO "seeker_education" ("id", "user_id", "qualification", "institution")
SELECT DISTINCT ON (p."user_id", lower(q.name)) gen_random_uuid(), p."user_id", left(q.name, 120), NULL
FROM "seeker_profiles" AS p
CROSS JOIN LATERAL (
  SELECT trim(part) AS name FROM regexp_split_to_table(p."qualifications", '[,;\n]') AS part
) AS q
WHERE p."qualifications" IS NOT NULL AND q.name <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "seeker_education" AS e
    WHERE e."user_id" = p."user_id" AND lower(trim(e."qualification")) = lower(q.name)
  );
--> statement-breakpoint
-- Link qualification checks made before this to the education entry with the same name, where there is one.
UPDATE "seeker_checks" AS c SET "education_id" = (
  SELECT e."id" FROM "seeker_education" AS e
  WHERE e."user_id" = c."user_id" AND lower(trim(e."qualification")) = lower(trim(c."result"->>'title'))
  ORDER BY e."created_at" LIMIT 1
)
WHERE c."kind" = 'qualification' AND c."education_id" IS NULL;
