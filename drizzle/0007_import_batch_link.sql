ALTER TABLE "transactions" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_import_batch_idx" ON "transactions" USING btree ("import_batch_id");--> statement-breakpoint
-- Liga os lançamentos importados antes desta mudança à importação de onde vieram
-- (mesma usuária, mesma conta, nota "Importado de <arquivo>", criados junto com a importação).
UPDATE transactions t
SET import_batch_id = b.id
FROM import_batches b
WHERE t.import_batch_id IS NULL
  AND t.fingerprint IS NOT NULL
  AND t.user_id = b.user_id
  AND (t.account_id = b.account_id OR t.to_account_id = b.account_id)
  AND t.notes = 'Importado de ' || b.file_name
  AND abs(extract(epoch FROM (t.created_at - b.created_at))) < 120;
