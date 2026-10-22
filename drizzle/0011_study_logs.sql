CREATE TABLE "study_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"date" date NOT NULL,
	"minutes" smallint,
	"questions_done" smallint,
	"questions_correct" smallint,
	"difficulties" text,
	"mistakes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_logs_correct_le_done" CHECK ("study_logs"."questions_correct" is null or ("study_logs"."questions_done" is not null and "study_logs"."questions_correct" <= "study_logs"."questions_done"))
);
--> statement-breakpoint
ALTER TABLE "study_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "study_logs" ADD CONSTRAINT "study_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_logs" ADD CONSTRAINT "study_logs_item_id_study_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."study_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_logs_item_idx" ON "study_logs" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "study_logs_user_date_idx" ON "study_logs" USING btree ("user_id","date");