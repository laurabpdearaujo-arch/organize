import "server-only";
import { cookies } from "next/headers";
import { io } from "next/cache";
import { createServerClient } from "@supabase/ssr";

/** Cliente Supabase para Server Components, Server Actions e Route Handlers (usado só para Auth/Storage). */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  // O cliente do Supabase consulta o relógio (Date.now) ao ser criado e ao validar o token.
  // io() avisa o Next que daqui em diante o resultado depende do momento da requisição.
  await io();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Chamado de um Server Component (não pode gravar cookies): o proxy renova a sessão.
          }
        },
      },
    },
  );
}
