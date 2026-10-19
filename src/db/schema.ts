import { sql } from "drizzle-orm";
import {
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
    currency: text("currency").$type<"BRL" | "USD" | "EUR">().notNull().default("BRL"),
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
    ...timestamps,
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date),
    index("transactions_account_idx").on(t.accountId),
    uniqueIndex("transactions_user_fingerprint_uq").on(t.userId, t.fingerprint),
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
    currency: text("currency").$type<"BRL" | "USD" | "EUR">().notNull().default("BRL"),
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
