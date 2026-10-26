// Ações de "tarefas" chamadas pela tela. Mesmas funções do servidor (src/server/actions/tarefas.ts), via API.
import { serverAction } from "@/web/lib/api";
import type * as S from "@/server/actions/tarefas";

export const createTask = serverAction<typeof S.createTask>("tarefas", "createTask");
export const updateTask = serverAction<typeof S.updateTask>("tarefas", "updateTask");
export const moveTask = serverAction<typeof S.moveTask>("tarefas", "moveTask");
export const deleteTask = serverAction<typeof S.deleteTask>("tarefas", "deleteTask");
export const createProject = serverAction<typeof S.createProject>("tarefas", "createProject");
export const updateProject = serverAction<typeof S.updateProject>("tarefas", "updateProject");
export const deleteProject = serverAction<typeof S.deleteProject>("tarefas", "deleteProject");
export const createFeedback = serverAction<typeof S.createFeedback>("tarefas", "createFeedback");
export const updateFeedback = serverAction<typeof S.updateFeedback>("tarefas", "updateFeedback");
export const deleteFeedback = serverAction<typeof S.deleteFeedback>("tarefas", "deleteFeedback");
