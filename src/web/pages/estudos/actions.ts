// Ações de "estudos" chamadas pela tela. Mesmas funções do servidor (src/server/actions/estudos.ts), via API.
import { serverAction } from "@/web/lib/api";
import type * as S from "@/server/actions/estudos";

export type { ImportSummary } from "@/server/actions/estudos";

export const importStudyPlans = serverAction<typeof S.importStudyPlans>("estudos", "importStudyPlans");
export const addStudyLog = serverAction<typeof S.addStudyLog>("estudos", "addStudyLog");
export const deleteStudyLog = serverAction<typeof S.deleteStudyLog>("estudos", "deleteStudyLog");
export const updateStudyItemDetails = serverAction<typeof S.updateStudyItemDetails>("estudos", "updateStudyItemDetails");
export const addStudyItem = serverAction<typeof S.addStudyItem>("estudos", "addStudyItem");
export const moveStudyItem = serverAction<typeof S.moveStudyItem>("estudos", "moveStudyItem");
export const deleteStudyItem = serverAction<typeof S.deleteStudyItem>("estudos", "deleteStudyItem");
export const updateStudyItem = serverAction<typeof S.updateStudyItem>("estudos", "updateStudyItem");
export const setStudyStatusMany = serverAction<typeof S.setStudyStatusMany>("estudos", "setStudyStatusMany");
export const updateStudyPlan = serverAction<typeof S.updateStudyPlan>("estudos", "updateStudyPlan");
export const archiveStudyPlan = serverAction<typeof S.archiveStudyPlan>("estudos", "archiveStudyPlan");
export const deleteStudyPlan = serverAction<typeof S.deleteStudyPlan>("estudos", "deleteStudyPlan");
