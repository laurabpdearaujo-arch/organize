# azeitona

Organizador pessoal: painel do dia, calendário, tarefas (geral e carreira), estudos, finanças, hábitos, leituras e filmes.

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind) · Drizzle ORM · Supabase (Postgres + Auth) · Docker + Caddy na VPS.

## Desenvolvimento

```bash
npm ci
cp .env.example .env.local   # preencha com os dados do Supabase
npm run dev                  # http://localhost:3000
```

- `npm test`: testes unitários (regras puras).
- `npm run test:db`: integração contra o banco (cria e apaga usuárias temporárias; precisa de `SUPABASE_SECRET_KEY`).
- `npm run db:generate` / `npm run db:migrate`: migrações do Drizzle (pasta `drizzle/`). As migrações rodam a partir da máquina de desenvolvimento, não do contêiner.

Todo acesso ao banco é feito no servidor e filtrado pelo usuário logado (`getCurrentUser`); as tabelas têm RLS ligado e sem permissões para os papéis públicos do Supabase.

## Deploy na VPS (Docker Compose, atrás do edge proxy)

Segue o mesmo padrão das outras apps da VPS: o contêiner não expõe portas nem cuida de TLS. O Caddy compartilhado
(edge, porta 80) encaminha `azeitona.<domínio>` para `azeitona-web:3000` pela rede Docker `web`, e o Cloudflare fornece o HTTPS.

```
Cloudflare (HTTPS) → VPS:80 → edge (Caddy) → azeitona-web:3000 → Supabase
```

```bash
# rede compartilhada (uma vez só; provavelmente já existe)
docker network create web

git clone git@github.com:laurabpdearaujo-arch/organize.git azeitona
cd azeitona
cp .env.example .env    # preencha SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e DATABASE_URL
docker compose up -d --build
```

Bloco para o `Caddyfile` do edge:

```caddy
# azeitona
http://{$AZEITONA_DOMAIN} {
	encode gzip
	reverse_proxy azeitona-web:3000 {
		# O visitante chega por HTTPS no Cloudflare; sem isto, os redirecionamentos do app sairiam como http://
		header_up X-Forwarded-Proto https
	}
}
```

Atualizar depois de novos commits: `git pull && docker compose up -d --build`.

A imagem é compilada sem nenhum segredo; as chaves só entram em tempo de execução pelo `.env` da VPS.
