ALTER TABLE "profiles" ADD COLUMN "finance_setup_at" timestamp with time zone;--> statement-breakpoint
-- Limpeza do bug de concorrência: remove "Carteira (dinheiro)" repetidas e VAZIAS
-- (sem lançamentos nem importações), mantendo a mais antiga de cada usuária.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS rn
  FROM accounts
  WHERE type = 'cash' AND name = 'Carteira (dinheiro)'
)
DELETE FROM accounts a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.account_id = a.id OR t.to_account_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM import_batches b WHERE b.account_id = a.id);--> statement-breakpoint
-- Quem já tem categorias ou contas já passou pela configuração inicial.
UPDATE profiles p SET finance_setup_at = now()
WHERE finance_setup_at IS NULL
  AND (EXISTS (SELECT 1 FROM categories c WHERE c.user_id = p.user_id) OR EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = p.user_id));
