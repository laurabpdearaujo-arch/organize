import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import "@fontsource-variable/inter";
import "./styles.css";
import { AppLayout } from "./app-layout";
import { PageSkeleton } from "./components/page-header";
import { LoginPage } from "./pages/login/page";
import { PainelPage } from "./pages/painel/page";

// Cada página é carregada só quando é aberta (o celular não baixa o site inteiro de uma vez).
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const CalendarioPage = page(() => import("./pages/calendario/page"), "CalendarioPage");
const TarefasPage = page(() => import("./pages/tarefas/page"), "TarefasPage");
const EstudosPage = page(() => import("./pages/estudos/page"), "EstudosPage");
const FinancasPage = page(() => import("./pages/financas/page"), "FinancasPage");
const HabitosPage = page(() => import("./pages/habitos/page"), "HabitosPage");
const LeiturasPage = page(() => import("./pages/leituras/page"), "LeiturasPage");

const lazyEl = (C: React.ComponentType) => (
  <Suspense fallback={<PageSkeleton />}>
    <C />
  </Suspense>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<PainelPage />} />
          <Route path="calendario" element={lazyEl(CalendarioPage)} />
          <Route path="tarefas" element={lazyEl(TarefasPage)} />
          <Route path="estudos" element={lazyEl(EstudosPage)} />
          <Route path="financas" element={lazyEl(FinancasPage)} />
          <Route path="habitos" element={lazyEl(HabitosPage)} />
          <Route path="leituras" element={lazyEl(LeiturasPage)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
