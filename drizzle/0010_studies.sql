CREATE TABLE "study_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"parent_id" uuid,
	"position" smallint DEFAULT 0 NOT NULL,
	"code" text,
	"title" text NOT NULL,
	"description" text,
	"duration_minutes" smallint,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"planned_date" date,
	"planned_time" text,
	"planned_minutes" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "study_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"color" text DEFAULT 'violet' NOT NULL,
	"source_file_name" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "study_items" ADD CONSTRAINT "study_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_items" ADD CONSTRAINT "study_items_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_items" ADD CONSTRAINT "study_items_parent_id_study_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."study_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_items_plan_idx" ON "study_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "study_items_user_planned_idx" ON "study_items" USING btree ("user_id","planned_date");--> statement-breakpoint
CREATE INDEX "study_plans_user_idx" ON "study_plans" USING btree ("user_id");