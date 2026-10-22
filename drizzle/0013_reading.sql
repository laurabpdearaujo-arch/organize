CREATE TABLE "book_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"date" date NOT NULL,
	"page" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"total_pages" smallint,
	"current_page" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'want' NOT NULL,
	"started_on" date,
	"finished_on" date,
	"rating" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_rating_1_5" CHECK ("books"."rating" is null or "books"."rating" between 1 and 5),
	CONSTRAINT "books_pages_ok" CHECK ("books"."current_page" >= 0 and ("books"."total_pages" is null or "books"."total_pages" > 0))
);
--> statement-breakpoint
ALTER TABLE "books" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'want' NOT NULL,
	"season" smallint,
	"episode" smallint,
	"finished_on" date,
	"rating" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_rating_1_5" CHECK ("media"."rating" is null or "media"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "book_progress" ADD CONSTRAINT "book_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_progress" ADD CONSTRAINT "book_progress_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "book_progress_book_date_uq" ON "book_progress" USING btree ("book_id","date");--> statement-breakpoint
CREATE INDEX "book_progress_user_date_idx" ON "book_progress" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "books_user_idx" ON "books" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "media_user_idx" ON "media" USING btree ("user_id","status");