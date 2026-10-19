export type AccountType = "checking" | "savings" | "cash" | "investment" | "credit_card";
export type TxType = "income" | "expense" | "transfer";
export type PaymentMethod = "pix" | "debit" | "credit" | "cash" | "boleto" | "transfer" | "auto_debit" | "other";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  investment: "Investimento",
  credit_card: "Cartão de crédito",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  debit: "Débito",
  credit: "Crédito",
  cash: "Dinheiro",
  boleto: "Boleto",
  transfer: "Transferência/TED",
  auto_debit: "Débito automático",
  other: "Outro",
};

export const TX_TYPE_LABEL: Record<TxType, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
};

/** Criadas automaticamente no primeiro acesso; podem ser renomeadas ou arquivadas. */
export const DEFAULT_CATEGORIES: { name: string; kind: "expense" | "income"; color: string }[] = [
  { name: "Alimentação", kind: "expense", color: "amber" },
  { name: "Mercado", kind: "expense", color: "green" },
  { name: "Moradia", kind: "expense", color: "blue" },
  { name: "Contas de casa", kind: "expense", color: "teal" },
  { name: "Transporte", kind: "expense", color: "violet" },
  { name: "Saúde", kind: "expense", color: "rose" },
  { name: "Educação", kind: "expense", color: "blue" },
  { name: "Lazer", kind: "expense", color: "amber" },
  { name: "Compras", kind: "expense", color: "rose" },
  { name: "Assinaturas", kind: "expense", color: "violet" },
  { name: "Viagem", kind: "expense", color: "teal" },
  { name: "Impostos e taxas", kind: "expense", color: "gray" },
  { name: "Outros", kind: "expense", color: "gray" },
  { name: "Salário", kind: "income", color: "green" },
  { name: "Freelance", kind: "income", color: "teal" },
  { name: "Rendimentos", kind: "income", color: "blue" },
  { name: "Reembolso", kind: "income", color: "violet" },
  { name: "Outros", kind: "income", color: "gray" },
];
