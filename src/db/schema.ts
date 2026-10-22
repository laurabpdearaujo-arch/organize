import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import type { Recurrence } from "@/lib/calendar/recurrence";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Dona do registro. Toda tabela de dados pessoais tem esta coluna. */
const ownerId = () =>
  uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" });

/** Preferências da usuária. Uma linha por conta do Supabase Auth. */
export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  currency: text("currency").notNull().default("BRL"),
  /** Quando as categorias padrão e a Carteira foram criadas (garante que acontece uma única vez). */
  financeSetupAt: timestamp("finance_setup_at", { withTimezone: true }),
  ...timestamps,
}).enableRLS();

// ---------------- Calendário ----------------

/** Um evento único ou uma série recorrente (regra em `recurrence`). */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    color: text("color").notNull().default("violet"),
    allDay: boolean("all_day").notNull().default(false),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Fuso em que a série foi criada: "toda terça 19:00" continua 19:00 nesse fuso. */
    timezone: text("timezone").notNull(),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    ...timestamps,
  },
  (t) => [
    index("events_user_starts_idx").on(t.userId, t.startsAt),
    check("events_ends_after_starts", sql`${t.endsAt} > ${t.startsAt}`),
  ],
).enableRLS();

/** Alteração ou cancelamento de UMA ocorrência de uma série. */
export const eventExceptions = pgTable(
  "event_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    originalStart: timestamp("original_start", { withTimezone: true }).notNull(),
    cancelled: boolean("cancelled").notNull().default(false),
    title: text("title"),
    description: text("description"),
    location: text("location"),
    color: text("color"),
    allDay: boolean("all_day"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("event_exceptions_event_original_uq").on(t.eventId, t.originalStart),
    index("event_exceptions_user_idx").on(t.userId),
  ],
).enableRLS();

// ---------------- Hábitos ----------------

export const habits = pgTable(
  "habits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    name: text("name").notNull(),
    /** "build" = desenvolver · "reduce" = reduzir (sempre com limite diário) */
    direction: text("direction").$type<"build" | "reduce">().notNull(),
    /** "boolean" = sim/não · "quantity" · "duration" (minutos) */
    measure: text("measure").$type<"boolean" | "quantity" | "duration">().notNull(),
    unit: text("unit"),
    category: text("category").notNull().default("Outros"),
    color: text("color").notNull().default("violet"),
    /** Dia (no fuso da usuária) em que o hábito começou a valer. */
    createdOn: date("created_on", { mode: "string" }).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("habits_user_idx").on(t.userId)],
).enableRLS();

/** Versões da meta: cada mudança vale a partir de uma data, sem alterar o passado. */
export const habitGoals = pgTable(
  "habit_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    scheduleType: text("schedule_type").$type<"days" | "weekly">().notNull(),
    weekdays: smallint("weekdays").array().notNull().default(sql`'{}'::smallint[]`),
    timesPerWeek: smallint("times_per_week"),
    target: numeric("target", { mode: "number" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("habit_goals_habit_from_uq").on(t.habitId, t.effectiveFrom)],
).enableRLS();

/** Períodos pausados (inclusive). end_date nulo = pausado até agora. */
export const habitPauses = pgTable(
  "habit_pauses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    ...timestamps,
  },
  (t) => [index("habit_pauses_habit_idx").on(t.habitId)],
).enableRLS();

/** Um registro por hábito por dia. Apagar o registro = dia sem registro. */
export const habitLogs = pgTable(
  "habit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    value: numeric("value", { mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("habit_logs_habit_date_uq").on(t.habitId, t.date),
    index("habit_logs_user_date_idx").on(t.userId, t.date),
    check("habit_logs_value_nonneg", sql`${t.value} >= 0`),
  ],
).enableRLS();

// ---------------- Finanças ----------------
// Valores sempre em CENTAVOS inteiros (bigint) para evitar erros de arredondamento.

/** Conta corrente, poupança, dinheiro, investimento ou cartão de crédito. */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    name: text("name").notNull(),
    type: text("type").$type<"checking" | "savings" | "cash" | "investment" | "credit_card">().notNull(),
    currency: text("currency").$type<"BRL" | "USD" | "EUR" | "GBP">().notNull().default("BRL"),
    initialBalanceCents: bigint("initial_balance_cents", { mode: "number" }).notNull().default(0),
    color: text("color").notNull().default("violet"),
    /** Cartão: dia do fechamento e do vencimento da fatura. */
    closingDay: smallint("closing_day"),
    dueDay: smallint("due_day"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
).enableRLS();

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    name: text("name").notNull(),
    kind: text("kind").$type<"expense" | "income">().notNull(),
    color: text("color").notNull().default("gray"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("categories_user_kind_name_uq").on(t.userId, t.kind, t.name)],
).enableRLS();

/**
 * Lançamento. Transferência = uma linha com conta de origem (account_id) e destino (to_account_id);
 * transferências nunca entram em receitas/despesas (pagamento de fatura é transferência).
 */
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    type: text("type").$type<"income" | "expense" | "transfer">().notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "no action" }),
    toAccountId: uuid("to_account_id").references(() => accounts.id, { onDelete: "no action" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    /** Data do lançamento (para compras no cartão: data da compra). */
    date: date("date", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    paymentMethod: text("payment_method")
      .$type<"pix" | "debit" | "credit" | "cash" | "boleto" | "transfer" | "auto_debit" | "other">()
      .notNull()
      .default("other"),
    notes: text("notes"),
    /** Impressão digital para evitar importar o mesmo lançamento duas vezes (importação de extratos). */
    fingerprint: text("fingerprint"),
    /** Importação de onde veio. Desfazer a importação (apagar o lote) apaga estes lançamentos. */
    importBatchId: uuid("import_batch_id").references((): AnyPgColumn => importBatches.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date),
    index("transactions_account_idx").on(t.accountId),
    uniqueIndex("transactions_user_fingerprint_uq").on(t.userId, t.fingerprint),
    index("transactions_import_batch_idx").on(t.importBatchId),
    check("transactions_amount_positive", sql`${t.amountCents} > 0`),
    check(
      "transactions_transfer_shape",
      sql`(${t.type} = 'transfer') = (${t.toAccountId} is not null) and (${t.toAccountId} is null or ${t.toAccountId} <> ${t.accountId})`,
    ),
  ],
).enableRLS();

/** Metas de longo prazo (reserva, viagem…). O progresso é a soma dos aportes. */
export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    name: text("name").notNull(),
    targetCents: bigint("target_cents", { mode: "number" }).notNull(),
    currency: text("currency").$type<"BRL" | "USD" | "EUR" | "GBP">().notNull().default("BRL"),
    deadline: date("deadline", { mode: "string" }),
    color: text("color").notNull().default("violet"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("savings_goals_user_idx").on(t.userId), check("savings_goals_target_positive", sql`${t.targetCents} > 0`)],
).enableRLS();

/** Aporte (positivo) ou retirada (negativo) de uma meta. */
export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => savingsGoals.id, { onDelete: "cascade" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("goal_contributions_goal_idx").on(t.goalId)],
).enableRLS();

/** Registro de cada extrato importado (o PDF em si NÃO é guardado; só o hash, para avisar repetição). */
export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    fileHash: text("file_hash").notNull(),
    fileName: text("file_name"),
    periodStart: date("period_start", { mode: "string" }),
    periodEnd: date("period_end", { mode: "string" }),
    rowsImported: smallint("rows_imported").notNull().default(0),
    rowsSkipped: smallint("rows_skipped").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("import_batches_user_hash_idx").on(t.userId, t.fileHash)],
).enableRLS();

/** Regras aprendidas na importação: descrição normalizada → tipo/categoria/conta de destino. */
export const importRules = pgTable(
  "import_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    pattern: text("pattern").notNull(),
    type: text("type").$type<"income" | "expense" | "transfer">().notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    toAccountId: uuid("to_account_id").references(() => accounts.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("import_rules_user_pattern_uq").on(t.userId, t.pattern)],
).enableRLS();

// ---------------- Contas a pagar (registro; não gera lançamentos) ----------------

/** Conta recorrente mensal (luz, aluguel, assinatura…). */
export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    name: text("name").notNull(),
    /** Valor de referência (opcional; contas como luz variam). */
    amountCents: bigint("amount_cents", { mode: "number" }),
    /** Dia do vencimento (ou do débito automático). Em meses mais curtos, vale o último dia. */
    dueDay: smallint("due_day").notNull(),
    autoDebit: boolean("auto_debit").notNull().default(false),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("bills_user_idx").on(t.userId),
    check("bills_due_day_range", sql`${t.dueDay} between 1 and 31`),
  ],
).enableRLS();

/** Marca de "paga" de uma conta num mês ("AAAA-MM"). */
export const billPayments = pgTable(
  "bill_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("bill_payments_bill_month_uq").on(t.billId, t.month)],
).enableRLS();

// ---------------- Investimentos (registro; não gera lançamentos) ----------------

export const investments = pgTable(
  "investments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    name: text("name").notNull(),
    /** fixed_income = renda fixa · stock = ações/FIIs/ETFs (por cotas) · pension = previdência */
    kind: text("kind").$type<"fixed_income" | "stock" | "pension">().notNull(),
    /** Ex.: CDB, Tesouro, FII, ETF, PGBL… (livre) */
    subtype: text("subtype"),
    ticker: text("ticker"),
    institution: text("institution"),
    currency: text("currency").$type<"BRL" | "USD" | "EUR" | "GBP">().notNull().default("BRL"),
    color: text("color").notNull().default("blue"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("investments_user_idx").on(t.userId)],
).enableRLS();

export const investmentMovements = pgTable(
  "investment_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    investmentId: uuid("investment_id")
      .notNull()
      .references(() => investments.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    /** contribution = aporte · withdrawal = resgate/venda · reinvestment = rendimento reinvestido · income = rendimento recebido */
    type: text("type").$type<"contribution" | "withdrawal" | "reinvestment" | "income">().notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    /** Cotas (ações/FIIs/ETFs). */
    quantity: numeric("quantity", { mode: "number" }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("investment_movements_inv_idx").on(t.investmentId),
    check("investment_movements_amount_positive", sql`${t.amountCents} > 0`),
    check("investment_movements_quantity_positive", sql`${t.quantity} is null or ${t.quantity} > 0`),
  ],
).enableRLS();

/** Atualização de valor feita pela pessoa (valor total, ou preço da cota para ações). Uma por dia. */
export const investmentValuations = pgTable(
  "investment_valuations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    investmentId: uuid("investment_id")
      .notNull()
      .references(() => investments.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    valueCents: bigint("value_cents", { mode: "number" }),
    priceCents: bigint("price_cents", { mode: "number" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("investment_valuations_inv_date_uq").on(t.investmentId, t.date),
    check("investment_valuations_one_value", sql`(${t.valueCents} is null) <> (${t.priceCents} is null)`),
  ],
).enableRLS();

// ---------------- Estudos ----------------

export const studyPlans = pgTable(
  "study_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    name: text("name").notNull(),
    objective: text("objective"),
    color: text("color").notNull().default("violet"),
    sourceFileName: text("source_file_name"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("study_plans_user_idx").on(t.userId)],
).enableRLS();

/**
 * Item da árvore do plano: tema, subtema ou conteúdo a estudar (as folhas).
 * O progresso de um tema é calculado a partir das folhas dele.
 */
export const studyItems = pgTable(
  "study_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => studyPlans.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => studyItems.id, { onDelete: "cascade" }),
    position: smallint("position").notNull().default(0),
    code: text("code"),
    title: text("title").notNull(),
    /** Tema/subtema: agrupa conteúdos e não entra na conta do progresso, mesmo vazio. */
    isGroup: boolean("is_group").notNull().default(false),
    description: text("description"),
    durationMinutes: smallint("duration_minutes"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    status: text("status").$type<"not_started" | "in_progress" | "partial" | "done">().notNull().default("not_started"),
    /** Dia (e, opcionalmente, horário e duração) em que a pessoa planejou estudar. */
    plannedDate: date("planned_date", { mode: "string" }),
    plannedTime: text("planned_time"),
    plannedMinutes: smallint("planned_minutes"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("study_items_plan_idx").on(t.planId),
    index("study_items_user_planned_idx").on(t.userId, t.plannedDate),
  ],
).enableRLS();

/** Registro de uma sessão de estudo de um conteúdo: tempo, questões, dificuldades e erros. */
export const studyLogs = pgTable(
  "study_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => studyItems.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    minutes: smallint("minutes"),
    questionsDone: smallint("questions_done"),
    questionsCorrect: smallint("questions_correct"),
    difficulties: text("difficulties"),
    mistakes: text("mistakes"),
    ...timestamps,
  },
  (t) => [
    index("study_logs_item_idx").on(t.itemId),
    index("study_logs_user_date_idx").on(t.userId, t.date),
    check("study_logs_correct_le_done", sql`${t.questionsCorrect} is null or (${t.questionsDone} is not null and ${t.questionsCorrect} <= ${t.questionsDone})`),
  ],
).enableRLS();

// ---------- Leituras e Filmes ----------

/** Livro. Status: quero ler, lendo, lido, abandonado. Página atual = onde parou. */
export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    title: text("title").notNull(),
    author: text("author"),
    totalPages: smallint("total_pages"),
    currentPage: smallint("current_page").notNull().default(0),
    status: text("status").$type<"want" | "reading" | "read" | "dropped">().notNull().default("want"),
    startedOn: date("started_on", { mode: "string" }),
    finishedOn: date("finished_on", { mode: "string" }),
    rating: smallint("rating"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("books_user_idx").on(t.userId, t.status),
    check("books_rating_1_5", sql`${t.rating} is null or ${t.rating} between 1 and 5`),
    check("books_pages_ok", sql`${t.currentPage} >= 0 and (${t.totalPages} is null or ${t.totalPages} > 0)`),
  ],
).enableRLS();

/** Até onde a pessoa leu em cada dia (uma linha por livro e dia). Serve para o ritmo e a estimativa. */
export const bookProgress = pgTable(
  "book_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    /** Página em que parou nesse dia. */
    page: smallint("page").notNull(),
    /** Páginas lidas nesse dia (soma das atualizações; correções para trás descontam). */
    pagesRead: smallint("pages_read").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("book_progress_book_date_uq").on(t.bookId, t.date), index("book_progress_user_date_idx").on(t.userId, t.date)],
).enableRLS();

/** Filme ou série. Status: quero ver, vendo, visto. Em séries, temporada/episódio onde parou. */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    kind: text("kind").$type<"movie" | "series">().notNull(),
    title: text("title").notNull(),
    status: text("status").$type<"want" | "watching" | "watched">().notNull().default("want"),
    season: smallint("season"),
    episode: smallint("episode"),
    finishedOn: date("finished_on", { mode: "string" }),
    rating: smallint("rating"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("media_user_idx").on(t.userId, t.status), check("media_rating_1_5", sql`${t.rating} is null or ${t.rating} between 1 and 5`)],
).enableRLS();
