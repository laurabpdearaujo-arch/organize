import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { moveTask } from "../tarefas/actions";

/** Marca a tarefa como feita direto do Painel. */
export function TaskDone({ id, title }: { id: string; title: string }) {
  const [done, setDone] = useOptimistic(false);
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Marcar “${title}” como feita`}
      title="Marcar como feita"
      onClick={() =>
        startTransition(async () => {
          setDone(true);
          await moveTask({ id, status: "done", index: 0 });
        })
      }
      className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition ${done ? "border-success bg-success text-white" : "border-border hover:border-primary"}`}
    >
      {done && <Check className="size-3.5" />}
    </button>
  );
}
