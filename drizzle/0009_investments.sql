CREATE TABLE "investment_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"investment_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"quantity" numeric,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_movements_amount_positive" CHECK ("investment_movements"."amount_cents" > 0),
	CONSTRAINT "investment_movements_quantity_positive" CHECK ("investment_movements"."quantity" is null or "investment_movements"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "investment_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "investment_valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"investment_id" uuid NOT NULL,
	"date" date NOT NULL,
	"value_cents" bigint,
	"price_cents" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_valuations_one_value" CHECK (("investment_valuations"."value_cents" is null) <> ("investment_valuations"."price_cents" is null))
);
--> statement-breakpoint
ALTER TABLE "investment_valuations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "investments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"subtype" text,
	"ticker" text,
	"institution" text,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "investment_movements" ADD CONSTRAINT "investment_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_movements" ADD CONSTRAINT "investment_movements_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_valuations" ADD CONSTRAINT "investment_valuations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_valuations" ADD CONSTRAINT "investment_valuations_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investment_movements_inv_idx" ON "investment_movements" USING btree ("investment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investment_valuations_inv_date_uq" ON "investment_valuations" USING btree ("investment_id","date");--> statement-breakpoint
CREATE INDEX "investments_user_idx" ON "investments" USING btree ("user_id");