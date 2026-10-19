import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { Recurrence } from "./recurrence";

/** Formato que a API do calendário entrega ao navegador (compatível com o FullCalendar). */
export type CalendarEventDTO = {
  id: string;
  title: string;
  /** ISO para eventos com horário; "AAAA-MM-DD" para dia inteiro. */
  start: string;
  end: string;
  allDay: boolean;
  backgroundColor: string;
  borderColor: string;
  extendedProps: {
    eventId: string;
    originalStart: string;
    recurring: boolean;
    modified: boolean;
    description: string | null;
    location: string | null;
    color: string;
    series: {
      title: string;
      description: string | null;
      location: string | null;
      color: string;
      allDay: boolean;
      startsAt: string;
      endsAt: string;
      recurrence: Recurrence | null;
    };
  };
};

/** "AAAA-MM-DD" do instante, no fuso indicado. */
export function localDate(date: Date, tz: string) {
  return format(new TZDate(date.getTime(), tz), "yyyy-MM-dd");
}

/** "HH:mm" do instante, no fuso indicado. */
export function localTime(date: Date, tz: string) {
  return format(new TZDate(date.getTime(), tz), "HH:mm");
}
