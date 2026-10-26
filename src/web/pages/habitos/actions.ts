// Ações de "habitos" chamadas pela tela. Mesmas funções do servidor (src/server/actions/habitos.ts), via API.
import { serverAction } from "@/web/lib/api";
import type * as S from "@/server/actions/habitos";

export const createHabit = serverAction<typeof S.createHabit>("habitos", "createHabit");
export const updateHabit = serverAction<typeof S.updateHabit>("habitos", "updateHabit");
export const changeGoal = serverAction<typeof S.changeGoal>("habitos", "changeGoal");
export const setPaused = serverAction<typeof S.setPaused>("habitos", "setPaused");
export const setArchived = serverAction<typeof S.setArchived>("habitos", "setArchived");
export const deleteHabit = serverAction<typeof S.deleteHabit>("habitos", "deleteHabit");
export const setLog = serverAction<typeof S.setLog>("habitos", "setLog");
