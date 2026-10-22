ALTER TABLE "study_items" ADD COLUMN "is_group" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "study_items" p SET "is_group" = true WHERE EXISTS (SELECT 1 FROM "study_items" c WHERE c."parent_id" = p."id");
