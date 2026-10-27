# azeitona

Organizador pessoal: painel do dia, calendário, tarefas (geral e carreira), estudos, finanças, hábitos, leituras e filmes.

**Stack:** React 19 + Vite (tela) · Hono em Node (API) · Drizzle ORM · Supabase (Postgres + Auth) · Tailwind · Docker + Caddy na VPS.

## Estrutura

- `src/web/`: a tela (React, React Router). Cada página busca seus dados em `GET /api/pages/:pagina` e chama ações em `POST /api/actions/:modulo/:acao` (`src/web/lib/api.ts`). Depois de uma ação que dá certo, os dados das páginas abertas são recarregados.
- `src/server/`: a API (Hono). `app.ts` junta as rotas; `actions/` tem as ações de cada módulo (validam o payload com zod e filtram pela usuária); `pages.ts` monta os dados de cada página; `auth.ts` resolve a usuária logada pela sessão do Supabase (cookie `HttpOnly`).
- `src/lib/`: regras, consultas ao banco e leitores de PDF, usados pelo servidor. A tela só importa daqui funções puras e tipos (o lint bloqueia importar código do servidor na tela).
- `src/db/`: esquema do banco (Drizzle). Migrações em `drizzle/`.

Segurança: toda rota da API (menos o login) exige sessão; escrita só com `Origin` do próprio site (CSRF); respostas com cabeçalhos de segurança; nenhum segredo vai para o navegador.

## Desenvolvimento

```bash
npm ci
cp .env.example .env.local   # preencha com os dados do Supabase
npm run dev                  # http://localhost:3000 (tela + API no mesmo endereço)
```

- `npm test`: testes unitários (regras puras).
- `npm run test:db`: integração contra o banco e testes da API (criam e apagam usuárias temporárias; precisa de `SUPABASE_SECRET_KEY`).
- `npm run build` e `npm start`: versão de produção (`dist/web` + `dist/server/index.js`).
- `npm run db:generate` / `npm run db:migrate`: migrações do Drizzle. As migrações rodam a partir da máquina de desenvolvimento, não do contêiner.

## Deploy na VPS (Docker Compose, atrás do edge proxy)

Segue o mesmo padrão das outras apps da VPS: o contêiner não expõe portas nem cuida de TLS. A VPS não publica
porta HTTP nenhuma: o Cloudflare traz o tráfego por um Cloudflare Tunnel (criptografado) até o edge compartilhado
(Caddy), que encaminha `azeitona.<domínio>` para `azeitona-web:3000` pela rede Docker `web`. O HTTPS é obrigatório
(redirect e HSTS no Cloudflare).

```
Visitante ─HTTPS→ Cloudflare ─túnel→ edge (Caddy) → azeitona-web:3000 ─TLS→ Supabase
```

O bloco do Caddy fica no repo do edge, [viniaraujo68/edge](https://github.com/viniaraujo68/edge), em
`sites/azeitona.caddy`. Ele e a rota do túnel já estão prontos.

```bash
git clone https://github.com/laurabpdearaujo-arch/organize.git /opt/organize
cd /opt/organize
cp .env.example .env    # preencha SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e DATABASE_URL (com ?sslmode=require no fim)
docker compose up -d --build
```

Atualizar depois de novos commits: `git pull && docker compose up -d --build`.

A imagem é compilada sem nenhum segredo; as chaves só entram em tempo de execução pelo `.env` da VPS.
