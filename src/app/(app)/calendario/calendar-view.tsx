"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type { DateSelectArg, EventApi, EventClickArg, EventDropArg, EventSourceFuncArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { Plus } from "lucide-react";
import { localDate } from "@/lib/calendar/dto";
import { dropParam } from "@/lib/drop-param";
import type { BillReminderDTO, CalendarEventDTO, StudyItemDTO, TaskDueDTO } from "@/lib/calendar/dto";
import { moveEvent } from "./actions";
import { EventDialog, type DialogState } from "./event-dialog";
import { newEventValues, valuesFrom } from "./event-form-values";

type Props = CalendarEventDTO["extendedProps"];

/** Evento novo começando na próxima hora cheia, com 1h de duração. */
function newEventState(timezone: string): DialogState {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return { kind: "create", values: newEventValues(start, new Date(start.getTime() + 3_600_000), false, timezone) };
}

export default function CalendarView({ timezone, openNew: startWithNew = false }: { timezone: string; openNew?: boolean }) {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar>(null);
  // "?novo=1" (ação rápida do Painel) já abre o formulário de evento novo
  const [dialog, setDialog] = useState<{ id: number; state: DialogState } | null>(() => (startWithNew ? { id: 0, state: newEventState(timezone) } : null));
  useEffect(() => dropParam("novo"), []);
  const [error, setError] = useState<string | null>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const open = (state: DialogState) => setDialog({ id: Date.now(), state });
  const refetch = () => calendarRef.current?.getApi().refetchEvents();

  async function fetchEvents(info: EventSourceFuncArg) {
    const qs = new URLSearchParams({ start: info.start.toISOString(), end: info.end.toISOString() });
    const res = await fetch(`/api/calendar?${qs}`, { cache: "no-store" });
    if (res.redirected || res.url.includes("/login")) {
      router.push("/login"); // sessão expirou
      return [];
    }
    if (!res.ok) throw new Error("Falha ao carregar eventos");
    setError(null);
    return (await res.json()) as (CalendarEventDTO | BillReminderDTO | StudyItemDTO | TaskDueDTO)[];
  }

  function openNew() {
    open(newEventState(timezone));
  }

  function onSelect(info: DateSelectArg) {
    info.view.calendar.unselect();
    open({ kind: "create", values: newEventValues(info.start, info.end, info.allDay, timezone) });
  }

  function onEventClick(info: EventClickArg) {
    const ev = info.event;
    if (ev.extendedProps.kind === "bill") {
      router.push("/financas?aba=pagar"); // lembrete de conta a pagar: a gestão fica em Finanças
      return;
    }
    if (ev.extendedProps.kind === "study") {
      router.push(`/estudos?plano=${ev.extendedProps.planId}`); // conteúdo de estudo: status e data ficam em Estudos
      return;
    }
    if (ev.extendedProps.kind === "task") {
      router.push(`/tarefas?aba=${ev.extendedProps.area === "career" ? "carreira" : "geral"}`); // prazo de tarefa: edição em Tarefas
      return;
    }
    const p = ev.extendedProps as Props;
    const occurrence = valuesFrom(
      {
        title: ev.title,
        description: p.description,
        location: p.location,
        color: p.color,
        allDay: ev.allDay,
        start: ev.start!,
        end: eventEnd(ev),
        recurrence: p.series.recurrence,
      },
      timezone,
    );
    const series = valuesFrom(
      {
        ...p.series,
        start: new Date(p.series.startsAt),
        end: new Date(p.series.endsAt),
      },
      timezone,
    );
    open({
      kind: "edit",
      eventId: p.eventId,
      originalStart: p.originalStart,
      recurring: p.recurring,
      occurrence,
      series: p.recurring ? series : occurrence,
    });
  }

  async function onMove(info: EventDropArg | EventResizeDoneArg) {
    const ev = info.event;
    const p = ev.extendedProps as Props;
    if (p.recurring && !window.confirm("Mover só esta ocorrência? (Para mudar a série toda, abra o evento e escolha “Toda a série”.)")) {
      info.revert();
      return;
    }
    const end = eventEnd(ev);
    const payload = ev.allDay
      ? { eventId: p.eventId, originalStart: p.originalStart, allDay: true, start: localDate(ev.start!, timezone), end: localDate(end, timezone) }
      : { eventId: p.eventId, originalStart: p.originalStart, allDay: false, start: ev.start!.toISOString(), end: end.toISOString() };
    const res = await moveEvent(payload);
    if (!res.ok) {
      info.revert();
      setError(res.error);
    }
    refetch();
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Clique ou arraste num horário vazio para criar um evento.</p>
        <button
          type="button"
          onClick={openNew}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-4" />
          Novo evento
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        locale={ptBrLocale}
        initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek",
        }}
        firstDay={0}
        height={isMobile ? 640 : 720}
        expandRows
        nowIndicator
        selectable
        selectMirror
        editable
        dayMaxEvents
        allDayText="Dia todo"
        scrollTime="07:00:00"
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        noEventsText="Nenhum evento neste período"
        events={(info, success, failure) => {
          fetchEvents(info).then(success, (e) => {
            setError("Não foi possível carregar os eventos. Verifique a conexão e recarregue.");
            failure(e);
          });
        }}
        select={onSelect}
        eventClick={onEventClick}
        eventDrop={onMove}
        eventResize={onMove}
      />

      {dialog && (
        <EventDialog
          key={dialog.id}
          state={dialog.state}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

/** FullCalendar deixa `end` nulo em alguns casos; reconstrói a partir do início. */
function eventEnd(ev: EventApi): Date {
  if (ev.end) return ev.end;
  const start = ev.start!;
  return ev.allDay ? new Date(start.getTime() + 86_400_000) : new Date(start.getTime() + 3_600_000);
}
