// Ações de "calendario" chamadas pela tela. Mesmas funções do servidor (src/server/actions/calendario.ts), via API.
import { serverAction } from "@/web/lib/api";
import type * as S from "@/server/actions/calendario";

export const saveEvent = serverAction<typeof S.saveEvent>("calendario", "saveEvent");
export const deleteEvent = serverAction<typeof S.deleteEvent>("calendario", "deleteEvent");
export const moveEvent = serverAction<typeof S.moveEvent>("calendario", "moveEvent");
