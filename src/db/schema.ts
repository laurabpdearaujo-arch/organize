import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
