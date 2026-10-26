// Ações de "leituras" chamadas pela tela. Mesmas funções do servidor (src/server/actions/leituras.ts), via API.
import { serverAction } from "@/web/lib/api";
import type * as S from "@/server/actions/leituras";

export const createBook = serverAction<typeof S.createBook>("leituras", "createBook");
export const updateBook = serverAction<typeof S.updateBook>("leituras", "updateBook");
export const setBookPage = serverAction<typeof S.setBookPage>("leituras", "setBookPage");
export const deleteBook = serverAction<typeof S.deleteBook>("leituras", "deleteBook");
export const createMedia = serverAction<typeof S.createMedia>("leituras", "createMedia");
export const updateMedia = serverAction<typeof S.updateMedia>("leituras", "updateMedia");
export const deleteMedia = serverAction<typeof S.deleteMedia>("leituras", "deleteMedia");
