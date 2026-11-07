# Social Media AI — Multiusuário com PostgreSQL, Login, Cotas e Painel Admin: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o app Next.js atual (dados em CSV, sem login) num app multiusuário com PostgreSQL, login por sessão, isolamento de dados por conta, cotas diárias, painel admin e migração dos dados atuais, rodando localmente no Windows antes da publicação na VPS.

**Architecture:** O app Next.js 16 em `app/` continua como está, com as rotas de API e páginas adaptadas. Dados vão para PostgreSQL 16 (Docker local) acessados via Drizzle ORM. Autenticação é própria: senha com Argon2id e sessão guardada no banco, com cookie `httpOnly`. Cada consulta de conteúdo recebe `userId` explicitamente; a regra de admin fica numa única função de escopo. Cotas são contadas por dia em tabela própria com incremento atômico.

**Tech Stack:** Next.js 16.1.6 (App Router), TypeScript, React 19, Tailwind 4, shadcn/ui, PostgreSQL 16, Drizzle ORM + drizzle-kit, `pg`, Zod, `@node-rs/argon2`, Vitest, `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-07-multiuser-postgres-design.md`

**Diretório de trabalho:** raiz do repositório `social-media/`. Comandos de app rodam em `app/`.

## Global Constraints

- Hash de senha: Argon2id, biblioteca `@node-rs/argon2`.
- Sessão: token de 32 bytes aleatórios no cookie; no banco guarda-se apenas SHA-256 do token. Validade: 7 dias.
- Cookie de sessão: `httpOnly`, `sameSite=lax`, `secure` quando `NODE_ENV=production`, nome `sm_session`.
- Login: 5 tentativas por e-mail e 5 por IP a cada 15 min; ao exceder, resposta 429.
- Login recusa conta inexistente, senha errada e conta inativa com a mesma mensagem genérica: "E-mail ou senha inválidos".
- Sem sessão válida: páginas redirecionam para `/login`; rotas `/api/*` respondem 401 (exceto `/api/auth/login`).
- Usuário comum acessando `/admin` ou `/api/admin/*`: 403.
- Pipeline com execução já em andamento para o mesmo usuário: 409.
- Cota de execuções ou de vídeos esgotada: 429 com mensagem no corpo.
- Cotas padrão para conta nova: 5 execuções/dia e 100 vídeos/dia. Admin não tem cota.
- Dia da cota: fuso `America/Sao_Paulo`.
- Execução `running` com mais de 15 minutos é marcada `timed_out` na inicialização do servidor.
- Conta nova recebe cópia das 3 configs e dos 13 criadores do dono (copiados uma única vez, com IDs novos).
- Proxy de imagem aceita só `https://` com host terminando em `.cdninstagram.com` ou `.fbcdn.net`.
- Chaves `APIFY_API_TOKEN`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` ficam só no servidor; nunca em código de cliente nem no git.
- Nenhum commit é feito sem autorização do dono. Os passos de commit abaixo são checkpoints: o executor pergunta antes de cada um, ou ao fim do bloco.
- Os CSVs em `data/` não são apagados; deixam de ser lidos pelo app após a migração.

## Review Focus

1. **E-mail com maiúsculas ou espaços** ("Ana@X.com " vs "ana@x.com"): login e criação devem normalizar para minúsculas e sem espaços; o mesmo e-mail não pode criar duas contas. Testado na Task 6.
2. **Cota no limite com duas requisições simultâneas**: só uma execução pode passar quando restava uma. Testado na Task 9.
3. **Username de criador com `@` ou maiúsculas** ("@Marcel.Remus" e "marcel.remus"): normalizar e impedir duplicata por conta. Testado na Task 8.
4. **Cookie de sessão adulterado, expirado ou de conta desativada**: 401, e o cookie é removido. Testado na Task 5.
5. **Pedido de top-K maior que a quantidade de vídeos disponíveis, ou criador sem reels**: execução termina sem erro, com o que existe. Testado na Task 10.

---

### Task 1: Banco PostgreSQL local

**Files:**
- Create: `docker-compose.yml`
- Modify: `.env.example`
- Create: `.env` (local, não versionado; copiado de `.env.example` e preenchido pelo dono)

**Interfaces:**
- Consumes: nada.
- Produces: `DATABASE_URL` (ex.: `postgres://app:app@localhost:5432/social_media`) e `TEST_DATABASE_URL` (ex.: `postgres://app:app@localhost:5432/social_media_test`), ambos usados nas tasks seguintes.

- [ ] **Step 1: Escrever `docker-compose.yml`** na raiz, com serviço `db` (imagem `postgres:16`, usuário `app`, senha `app`, banco `social_media`, porta `127.0.0.1:5432:5432`, volume nomeado `pgdata`, healthcheck com `pg_isready`). Porta ligada só em localhost.

- [ ] **Step 2: Subir o banco**

Run: `docker compose up -d db` e depois `docker compose exec db pg_isready -U app`
Expected: "accepting connections".

- [ ] **Step 3: Criar banco de testes**

Run: `docker compose exec db createdb -U app social_media_test`
Expected: sem saída, código 0. Se já existir, a mensagem "already exists" é aceitável.

- [ ] **Step 4: Atualizar `.env.example`** com `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET` (comentado: não usado na v1, deixe vazio) e as três chaves já existentes. Sem valores reais.

- [ ] **Step 5: Commit** (checkpoint, pedir autorização): `chore: add local postgres via docker compose`

---

### Task 2: Dependências e harness de testes

**Files:**
- Modify: `app/package.json` (dependências)
- Create: `app/vitest.config.ts`
- Create: `app/src/test/db.ts` (helper que limpa tabelas do banco de teste)
- Create: `app/src/test/smoke.test.ts`

**Interfaces:**
- Consumes: `TEST_DATABASE_URL` (Task 1).
- Produces: `resetDb(): Promise<void>` em `src/test/db.ts`, que trunca todas as tabelas do schema e reaplica migrações; usado por todos os testes de integração.

- [ ] **Step 1: Instalar dependências**

Run (em `app/`): `npm install drizzle-orm pg zod @node-rs/argon2` e `npm install -D drizzle-kit vitest tsx @types/pg`
Expected: instalação sem erro.

- [ ] **Step 2: Verificar o nome do arquivo de middleware no Next 16.1.6**

Run: `grep -ril "proxy.ts\|middleware" node_modules/next/dist/docs | head`
Expected: ver se o Next documenta `middleware.ts` ou `proxy.ts`. A partir daqui, a Task 5 usa o nome que estiver documentado nesta versão. Registrar o resultado no relatório da task.

- [ ] **Step 3: Configurar Vitest** em `app/vitest.config.ts` com alias `@` → `src`, ambiente `node`, `fileParallelism: false` (testes de banco rodam em série), e variável `DATABASE_URL` apontando para `TEST_DATABASE_URL` nos testes.

- [ ] **Step 4: Escrever o smoke test** `src/test/smoke.test.ts`: `expect(1 + 1).toBe(2)`.

- [ ] **Step 5: Rodar**

Run: `npx vitest run`
Expected: 1 teste passando.

- [ ] **Step 6: Commit** (checkpoint): `chore: add vitest, drizzle, pg, zod, argon2`

---

### Task 3: Schema e migração inicial

**Files:**
- Create: `app/src/lib/db/schema.ts`
- Create: `app/src/lib/db/index.ts`
- Create: `app/drizzle.config.ts`
- Create: `app/drizzle/` (gerado pelo drizzle-kit)
- Create: `app/src/lib/db/migrate.ts`
- Modify: `app/package.json` (scripts `db:generate`, `db:migrate`)
- Test: `app/src/lib/db/schema.test.ts`

**Interfaces:**
- Produces (em `schema.ts`): tabelas `users`, `sessions`, `configs`, `creators`, `videos`, `pipeline_runs`, `usage_daily`, `admin_audit`, com estas colunas (camelCase no código, snake_case no banco):
  - `users`: `id uuid pk`, `email text unique not null` (sempre minúsculo), `name text not null`, `passwordHash text not null`, `role text not null` (`'admin' | 'user'`), `active boolean not null default true`, `dailyRunsLimit int not null default 5`, `dailyVideosLimit int not null default 100`, `createdAt timestamptz`.
  - `sessions`: `tokenHash text pk`, `userId uuid fk users cascade`, `expiresAt timestamptz`.
  - `configs`: `id uuid pk`, `userId fk cascade`, `configName text not null`, `creatorsCategory text`, `analysisInstruction text`, `newConceptsInstruction text`; unique `(userId, configName)`.
  - `creators`: `id uuid pk`, `userId fk cascade`, `username text not null`, `category text`, `profilePicUrl text`, `followers int default 0`, `reelsCount30d int default 0`, `avgViews30d int default 0`, `lastScrapedAt timestamptz null`; unique `(userId, username)`.
  - `videos`: `id uuid pk`, `userId fk cascade`, `creatorId uuid fk creators on delete set null null`, `configId uuid fk configs on delete set null null`, `creatorUsername text`, `configName text`, `link text`, `thumbnail text`, `views int`, `likes int`, `comments int`, `analysis text`, `newConcepts text`, `datePosted timestamptz null`, `dateAdded timestamptz not null`, `starred boolean default false`.
  - `pipeline_runs`: `id uuid pk`, `userId fk cascade`, `status text not null` (`'running' | 'done' | 'failed' | 'timed_out'`), `params jsonb`, `startedAt timestamptz`, `finishedAt timestamptz null`, `log jsonb default '[]'`.
  - `usage_daily`: `userId uuid fk cascade`, `day date`, `runs int default 0`, `videos int default 0`; pk `(userId, day)`.
  - `admin_audit`: `id uuid pk`, `adminId fk users`, `targetUserId fk users cascade`, `action text`, `detail jsonb`, `createdAt timestamptz`.
- Produces (em `index.ts`): `db` (instância Drizzle sobre `pg.Pool` com `DATABASE_URL`).

- [ ] **Step 1: Escrever o teste de schema** `schema.test.ts`: após `resetDb()`, inserir um usuário, uma config e tentar inserir config com mesmo `(userId, configName)` → deve falhar com erro de unicidade; apagar o usuário → configs somem (cascade).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/db/schema.test.ts`
Expected: FAIL (schema não existe).

- [ ] **Step 3: Implementar `schema.ts`, `index.ts`, `drizzle.config.ts`** conforme as Interfaces. `drizzle.config.ts` lê `DATABASE_URL`.

- [ ] **Step 4: Gerar e aplicar migração**

Run: `npm run db:generate` e `npm run db:migrate` (em `app/`, scripts apontando para `drizzle-kit generate` e para `src/lib/db/migrate.ts`).
Expected: pasta `app/drizzle/` com SQL gerado; migração aplicada no banco local sem erro.

- [ ] **Step 5: Rodar o teste**

Run: `npx vitest run src/lib/db/schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit** (checkpoint): `feat(db): add drizzle schema for multiuser app`

---

### Task 4: Núcleo de autenticação (hash, sessão, rate limit)

**Files:**
- Create: `app/src/lib/auth/password.ts`
- Create: `app/src/lib/auth/session.ts`
- Create: `app/src/lib/auth/rate-limit.ts`
- Create: `app/src/lib/auth/normalize.ts`
- Test: `app/src/lib/auth/auth.test.ts`

**Interfaces:**
- Produces:
  - `normalizeEmail(raw: string): string` — trim e minúsculas.
  - `hashPassword(pw: string): Promise<string>` e `verifyPassword(hash: string, pw: string): Promise<boolean>` — Argon2id.
  - `createSession(userId: string): Promise<{ token: string; expiresAt: Date }>` — grava `sha256(token)`.
  - `getSessionUser(token: string): Promise<SessionUser | null>` — `null` se token não existe, expirou ou usuário está inativo. `SessionUser = { id, email, name, role, active, dailyRunsLimit, dailyVideosLimit }`.
  - `deleteSession(token: string): Promise<void>`.
  - `rateLimit(key: string, max: number, windowMs: number, now?: number): { allowed: boolean; retryAfterSec: number }` — em memória. Login usa `rateLimit("email:"+email, 5, 15*60_000)` e `rateLimit("ip:"+ip, 5, 15*60_000)`.

- [ ] **Step 1: Escrever testes**
  - `normalizeEmail("  Ana@X.com ") === "ana@x.com"`.
  - `verifyPassword(await hashPassword("abc12345"), "abc12345") === true` e com senha errada `false`.
  - `rateLimit` permite 5 chamadas e bloqueia a 6ª na mesma janela; com `now` avançado além da janela, libera.
  - sessão: `getSessionUser` com token inexistente → `null`; com sessão expirada (ajustar `expiresAt` no banco) → `null`; com usuário `active=false` → `null`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/auth/auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** os quatro arquivos conforme as Interfaces. Token gerado com `crypto.randomBytes(32).toString("base64url")`.

- [ ] **Step 4: Rodar**

Run: `npx vitest run src/lib/auth/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint): `feat(auth): password hashing, sessions and rate limit`

---

### Task 5: Rotas de login/logout, guarda de acesso e página de login

**Files:**
- Create: `app/src/app/api/auth/login/route.ts`
- Create: `app/src/app/api/auth/logout/route.ts`
- Create: `app/src/app/api/auth/me/route.ts`
- Create: `app/src/lib/auth/require-session.ts` (com `requireSession` e `requireAdmin`)
- Create: `app/src/app/login/page.tsx`
- Create: `app/src/middleware.ts` **ou** `app/src/proxy.ts`, conforme o nome verificado na Task 2, Step 2
- Test: `app/src/app/api/auth/auth-routes.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail`, `verifyPassword`, `createSession`, `getSessionUser`, `deleteSession`, `rateLimit` (Task 4); `users` (Task 3).
- Produces:
  - `requireSession(request: Request): Promise<{ user: SessionUser } | { response: Response }>` — 401 se sem sessão válida, e remove o cookie nesse caso.
  - `requireAdmin(request: Request): Promise<{ user: SessionUser } | { response: Response }>` — 401 sem sessão, 403 se `role !== 'admin'`.
  - `POST /api/auth/login` body `{ email, password }` → 200 com `{ id, email, name, role }` e cookie `sm_session`; 401 com "E-mail ou senha inválidos" em qualquer falha; 429 com `Retry-After` quando excede limite.
  - `POST /api/auth/logout` → 200, apaga sessão e cookie.
  - `GET /api/auth/me` → 200 com o usuário, ou 401.

- [ ] **Step 1: Escrever testes de rota** (chamando os handlers diretamente com `Request`):
  - login com senha certa → 200 e header `set-cookie` contendo `sm_session=` e `HttpOnly`.
  - login com senha errada → 401 e corpo `{ error: "E-mail ou senha inválidos" }`.
  - login com e-mail em maiúsculas e espaços → 200.
  - sexta tentativa no mesmo e-mail → 429 com `Retry-After`.
  - conta inativa com senha certa → 401 (mesma mensagem).
  - `GET /api/auth/me` com cookie adulterado → 401 e `set-cookie` expirando `sm_session`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/auth/auth-routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** handlers, `requireSession`, `requireAdmin`, página `/login` (formulário simples com shadcn `Input`/`Button`, sem expor nada sensível) e o middleware/proxy. O middleware deixa passar `/login`, `/api/auth/login` e assets do Next; redireciona páginas sem cookie para `/login`; para `/api/*` sem cookie devolve 401. A validação completa de sessão continua em `requireSession`, dentro de cada rota.

- [ ] **Step 4: Rodar**

Run: `npx vitest run src/app/api/auth/auth-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificação manual**

Run: `npm run dev` (em `app/`), abrir `http://localhost:3000/` sem login.
Expected: redireciona para `/login`.

- [ ] **Step 6: Commit** (checkpoint): `feat(auth): login, logout, session guard and login page`

---

### Task 6: Comandos de linha de comando de contas

**Files:**
- Create: `app/src/scripts/account.ts` (um arquivo, com subcomandos `create-user`, `reset-password`, `disable-user`, `delete-user`)
- Modify: `app/package.json` (scripts `create-user`, `reset-password`, `disable-user`, `delete-user` chamando `tsx src/scripts/account.ts <cmd> ...`)
- Test: `app/src/scripts/account.test.ts`

**Interfaces:**
- Consumes: `db`, `users` (Task 3); `hashPassword`, `normalizeEmail` (Task 4). A chamada a `copyStarterContent` é adicionada na Task 12; nesta task, `create-user` deixa um comentário `// starter content: see Task 12` no ponto de chamada.
- Produces: funções testáveis `createUser({ email, name, password, role }): Promise<User>`, `resetPassword(email, password)`, `setActive(email, active)`, `deleteUser(email)`. Erros: e-mail duplicado lança `Error("email already exists")`; usuário inexistente lança `Error("user not found")`.

- [ ] **Step 1: Escrever testes**
  - `createUser` normaliza e-mail; segunda criação com `"ANA@x.com"` após `"ana@x.com"` lança "email already exists".
  - `role` fora de `admin|user` é rejeitado.
  - `resetPassword` troca o hash e `verifyPassword` do novo valor é `true`.
  - `setActive(email,false)` faz `getSessionUser` retornar `null` para sessão existente.
  - `deleteUser` remove sessões e configs do usuário (cascade).

- [ ] **Step 2: Rodar e ver falhar**, `npx vitest run src/scripts/account.test.ts` → FAIL.

- [ ] **Step 3: Implementar** o script. Senha mínima de 8 caracteres (validação com Zod). Senha lida de `--password` ou de prompt; o prompt não ecoa a senha.

- [ ] **Step 4: Rodar** → PASS.

- [ ] **Step 5: Criar a conta do dono (admin)**

Run: `npm run create-user -- --email <email-do-dono> --name "Dono" --role admin`
Expected: "user created" com o id. O e-mail real é informado pelo dono no terminal; não fica no repositório.

- [ ] **Step 6: Commit** (checkpoint): `feat(accounts): cli commands for user management`

---

### Task 7: Camada de acesso a dados com escopo por conta

**Files:**
- Create: `app/src/lib/repo/scope.ts`
- Create: `app/src/lib/repo/configs.ts`
- Create: `app/src/lib/repo/creators.ts`
- Create: `app/src/lib/repo/videos.ts`
- Create: `app/src/lib/repo/admin-audit.ts`
- Test: `app/src/lib/repo/isolation.test.ts`

**Interfaces:**
- Produces:
  - `resolveTargetUserId(session: SessionUser, requested: string | null): { userId: string; viaAdmin: boolean } | { error: "forbidden" }`
    - Sem `requested` (ou `requested === session.id`): `{ userId: session.id, viaAdmin: false }`.
    - `requested` diferente: se `session.role === 'admin'` → `{ userId: requested, viaAdmin: true }`; senão `{ error: "forbidden" }`.
  - `configs.ts`: `listConfigs(userId)`, `getConfig(userId, id)`, `createConfig(userId, input)`, `updateConfig(userId, id, patch)`, `deleteConfig(userId, id)`. `input` e `patch` são tipos inferidos de schemas Zod definidos no próprio arquivo (campos: `configName`, `creatorsCategory`, `analysisInstruction`, `newConceptsInstruction`). Toda query tem `where userId = ?`.
  - `creators.ts`: `listCreators(userId, category?)`, `getCreator(userId, id)`, `createCreator(userId, input)`, `updateCreator(userId, id, patch)`, `deleteCreator(userId, id)`. Normaliza `username` (remove `@`, minúsculas, trim) em `createCreator`/`updateCreator`.
  - `videos.ts`: `listVideos(userId, filter: { configName?, creator? })`, `setVideoStarred(userId, id, starred)`.
  - `admin-audit.ts`: `recordAdminAction({ adminId, targetUserId, action, detail })`.
  - Funções que retornam "não encontrado" devolvem `undefined`; nunca retornam registro de outra conta.
  - Erro de unicidade em `createConfig`/`createCreator` é devolvido como `{ error: "duplicate" }`.

- [ ] **Step 1: Escrever testes de isolamento** (dois usuários A e B, cada um com config e criador):
  - `listConfigs(A.id)` não contém a config de B.
  - `getConfig(A.id, configDeB.id)` → `undefined`.
  - `updateConfig(A.id, configDeB.id, {configName:"x"})` → `undefined` e a config de B continua igual.
  - `deleteConfig(A.id, configDeB.id)` → não apaga a de B.
  - Mesmo conjunto para `creators` e `videos` (`setVideoStarred` de B por A não altera).
  - `resolveTargetUserId(userA, B.id)` → `{error:"forbidden"}`; `resolveTargetUserId(adminSession, B.id)` → `{userId: B.id, viaAdmin: true}`.
  - `createCreator(A.id, {username:"@Marcel.Remus"})` grava `marcel.remus`; repetir para A retorna `{ error: "duplicate" }`.

- [ ] **Step 2: Rodar e ver falhar**, `npx vitest run src/lib/repo/isolation.test.ts` → FAIL.

- [ ] **Step 3: Implementar** os arquivos conforme as Interfaces.

- [ ] **Step 4: Rodar** → PASS.

- [ ] **Step 5: Commit** (checkpoint): `feat(repo): owner-scoped data access with admin scope`

---

### Task 8: Rotas de configs, criadores e vídeos sobre a camada nova

**Files:**
- Modify: `app/src/app/api/configs/route.ts`
- Modify: `app/src/app/api/creators/route.ts`
- Modify: `app/src/app/api/creators/refresh/route.ts`
- Modify: `app/src/app/api/videos/route.ts`
- Test: `app/src/app/api/crud-routes.test.ts`

**Interfaces:**
- Consumes: `requireSession`, `resolveTargetUserId`, funções de `repo/*` (Tasks 5 e 7).
- Produces (contrato HTTP mantido para a interface atual):
  - `GET /api/configs`, `POST /api/configs`, `PUT /api/configs` (body com `id`), `DELETE /api/configs?id=`.
  - `GET /api/creators?category=`, `POST /api/creators`, `PUT /api/creators`, `DELETE /api/creators?id=`, `POST /api/creators/refresh`.
  - `GET /api/videos?configName=&creator=`, `PATCH /api/videos`.
  - Todas aceitam `?userId=` **somente** para admin (ver `resolveTargetUserId`). Para `user` comum, `userId` diferente → 403.
  - Corpo validado com Zod; campos fora do schema são ignorados. Id inexistente ou de outra conta → 404. Duplicata → 409.

- [ ] **Step 1: Escrever testes de rota**:
  - Sem cookie → 401 em cada rota.
  - `PUT /api/configs` por A com `{id, configName, userId: B.id}` no corpo → config de A alterada só nos campos válidos; `userId` no corpo é ignorado.
  - `GET /api/configs?userId=B` por A → 403.
  - `GET /api/configs?userId=B` por admin → 200 com configs de B.
  - `DELETE /api/configs?id=<de B>` por A → 404.
  - `POST /api/creators` com username `"@Marcel.Remus"` e depois `"marcel.remus"` → segundo retorna 409.
  - `PATCH /api/videos` com `{id, starred:true}` de outra conta → 404.

- [ ] **Step 2: Rodar e ver falhar**, `npx vitest run src/app/api/crud-routes.test.ts` → FAIL.

- [ ] **Step 3: Reescrever os handlers** usando `requireSession` + `resolveTargetUserId` + repo. Remover `readCsv`/`writeCsv` destas rotas. Ao atuar via admin (`viaAdmin: true`), chamar `recordAdminAction` em PUT/POST/PATCH/DELETE (action = `"update" | "create" | "delete"`).

- [ ] **Step 4: Rodar** → PASS.

- [ ] **Step 5: Commit** (checkpoint): `feat(api): crud routes on owner-scoped repo with zod validation`

---

### Task 9: Cotas diárias

**Files:**
- Create: `app/src/lib/quota/day.ts`
- Create: `app/src/lib/quota/quota.ts`
- Test: `app/src/lib/quota/quota.test.ts`

**Interfaces:**
- Produces:
  - `todayInSaoPaulo(now?: Date): string` → `"YYYY-MM-DD"` no fuso `America/Sao_Paulo`.
  - `reserveRun(user: SessionUser, now?: Date): Promise<{ ok: true } | { ok: false; reason: "runs_exhausted" }>` — admin (`role === 'admin'`) sempre `ok: true`. Atômico: `INSERT ... ON CONFLICT (userId, day) DO UPDATE SET runs = usage_daily.runs + 1 WHERE usage_daily.runs < :limit RETURNING runs`; sem linha retornada → `runs_exhausted`.
  - `reserveVideos(user: SessionUser, requested: number, now?: Date): Promise<{ granted: number; remaining: number }>` — admin recebe `granted = requested`. Para usuário comum, concede `min(requested, dailyVideosLimit - usado)` dentro de transação com `SELECT ... FOR UPDATE`; `granted` pode ser 0.
  - `getUsageToday(userId: string, now?: Date): Promise<{ runs: number; videos: number }>`.

- [ ] **Step 1: Escrever testes**:
  - Limite de execuções = 5: cinco `reserveRun` retornam `ok: true`, o sexto `runs_exhausted`.
  - Duas chamadas simultâneas com um restante (`Promise.all` com 2 reservas, limite atingido em 4): exatamente uma `ok: true`.
  - `reserveVideos` pedindo 60 com restante 30 → `granted: 30`; depois pedindo 10 → `granted: 0`.
  - Admin: `reserveRun` sempre `ok`; `reserveVideos(…,500)` → `granted: 500`.
  - Virada do dia: `now` às 23:30 de 10/11 (São Paulo) e às 00:10 de 11/11 usam dias diferentes.

- [ ] **Step 2: Rodar e ver falhar**, `npx vitest run src/lib/quota/quota.test.ts` → FAIL.

- [ ] **Step 3: Implementar** conforme Interfaces.

- [ ] **Step 4: Rodar** → PASS.

- [ ] **Step 5: Commit** (checkpoint): `feat(quota): daily run and video quotas with atomic reservation`

---

### Task 10: Pipeline por conta com estado em `pipeline_runs`

**Files:**
- Modify: `app/src/lib/pipeline.ts`
- Create: `app/src/lib/pipeline/runs.ts`
- Modify: `app/src/app/api/pipeline/route.ts`
- Create: `app/src/instrumentation.ts`
- Test: `app/src/lib/pipeline/runs.test.ts`

**Interfaces:**
- Consumes: `reserveRun`, `reserveVideos` (Task 9); `requireSession` (Task 5); repo de configs/creators/videos (Task 7).
- Produces:
  - `startRun(userId: string, params: PipelineParams): Promise<{ runId: string } | { error: "busy" }>` — `busy` se já existe `pipeline_runs` com `status='running'` para o usuário.
  - `finishRun(runId: string, status: "done" | "failed", log: unknown[]): Promise<void>`.
  - `markStaleRuns(now?: Date): Promise<number>` — marca `timed_out` as `running` com `startedAt` mais de 15 min antes de `now`; retorna quantas.
  - `runPipeline(params, emit, owner: { userId: string; user: SessionUser }, deps?)`: além do fluxo atual, grava vídeos com `userId`, `creatorId`, `configId`; usa `reserveVideos` antes de analisar, limitando o top-K ao `granted`. `deps` injeta o analisador (Apify/Gemini/Claude) para os testes; em produção usa os clientes atuais.
  - `POST /api/pipeline` → exige sessão; 409 `{error:"busy"}` se ocupado; 429 `{error:"runs_exhausted"}` se a cota de execuções acabou; SSE caso contrário. Quando `granted < top-K`, o primeiro evento SSE informa `{ limitedTo: granted }`.
  - `instrumentation.ts` exporta `register()` que chama `markStaleRuns()` ao iniciar o servidor Node.

- [ ] **Step 1: Escrever testes**:
  - `startRun(A)` → ok; segundo `startRun(A)` → `{error:"busy"}`; `startRun(B)` → ok (contas independentes).
  - `finishRun` libera nova execução para A.
  - `markStaleRuns` com `startedAt` de 16 min atrás marca `timed_out` e retorna 1; uma de 5 min não muda.
  - Pipeline com top-K = 10 e cota de vídeos restante = 3: analisa só 3 (analisador falso injetado) e não lança erro.
  - Criador sem reels no período: a execução termina com `status='done'` e sem exceção.

- [ ] **Step 2: Rodar e ver falhar**, `npx vitest run src/lib/pipeline/runs.test.ts` → FAIL.

- [ ] **Step 3: Implementar**. A execução roda no servidor: fechar a aba não cancela. `runPipeline` não recebe mais caminhos de CSV.

- [ ] **Step 4: Rodar** → PASS.

- [ ] **Step 5: Verificação manual** (com chaves reais, no seu terminal, consumindo créditos): login, disparar execução com top-K pequeno, confirmar linhas em `videos` com `userId`.

- [ ] **Step 6: Commit** (checkpoint): `feat(pipeline): per-user runs with db state and quotas`

---

### Task 11: Painel admin (`/admin`)

**Files:**
- Create: `app/src/app/api/admin/users/route.ts` (GET lista com uso do dia; PATCH altera `dailyRunsLimit`, `dailyVideosLimit`, `active`)
- Create: `app/src/app/admin/page.tsx`
- Create: `app/src/app/admin/user-quota-row.tsx` (componente cliente para editar cotas e ativar/desativar)
- Modify: `app/src/components/app-sidebar.tsx` (item "Admin" visível só para `role === 'admin'`)
- Test: `app/src/app/api/admin/admin.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 5), `getUsageToday` (Task 9), `recordAdminAction` (Task 7).
- Produces:
  - `GET /api/admin/users` → `[{ id, email, name, role, active, dailyRunsLimit, dailyVideosLimit, usageToday: { runs, videos } }]`.
  - `PATCH /api/admin/users` body `{ id, dailyRunsLimit?, dailyVideosLimit?, active? }` (Zod: inteiros entre 0 e 10000 para cotas; boolean para `active`). Registra `recordAdminAction` com `action: "quota_update" | "set_active"` e valores anterior/novo em `detail`. Admin não pode desativar a própria conta (400).
  - Página `/admin` em lista com busca simples por e-mail; não-admin é redirecionado.

- [ ] **Step 1: Escrever testes**:
  - Usuário comum: `GET /api/admin/users` → 403.
  - Admin: `PATCH` de cota de B para 2 → B tem `dailyRunsLimit = 2` e uma linha em `admin_audit` com `action='quota_update'`.
  - Admin tentando `active:false` na própria conta → 400.
  - Conta de B desativada → login de B falha com a mensagem genérica (Task 5).

- [ ] **Step 2: Rodar e ver falhar**, `npx vitest run src/app/api/admin/admin.test.ts` → FAIL.

- [ ] **Step 3: Implementar** rota, página e linha de edição. Usar componentes shadcn já existentes (`Input`, `Button`, `Table`, `Badge`).

- [ ] **Step 4: Rodar** → PASS.

- [ ] **Step 5: Verificação manual**: logar como admin, alterar a cota de uma conta de teste e confirmar a mudança na página.

- [ ] **Step 6: Commit** (checkpoint): `feat(admin): users panel with quotas and access control`

---

### Task 12: Conteúdo inicial de conta nova

**Files:**
- Create: `app/src/lib/accounts/starter.ts`
- Modify: `app/src/scripts/account.ts` (substitui o comentário da Task 6 por chamada a `copyStarterContent`)
- Test: `app/src/lib/accounts/starter.test.ts`

**Interfaces:**
- Consumes: repo de configs/creators (Task 7); `users` (Task 3).
- Produces: `copyStarterContent(ownerId: string, newUserId: string): Promise<{ configs: number; creators: number }>` — copia configs e criadores do dono para a nova conta, com IDs novos (`crypto.randomUUID()`), dentro de uma única transação. Não copia vídeos, execuções nem sessões.
- Regra: o "dono" é o primeiro usuário `role='admin'` criado, ou o informado por `--owner-email` em `create-user`.

- [ ] **Step 1: Escrever testes**:
  - Após `copyStarterContent(owner, novo)`, o novo tem as mesmas configs e criadores do dono (fixture com 3 configs e 13 criadores).
  - Os IDs copiados diferem dos originais e nenhum registro do novo aponta para o dono.
  - Alterar uma config do novo não altera a do dono.
  - Se a cópia falhar no meio, nenhuma linha fica gravada (transação).

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar** e ligar em `create-user` (Task 6).

- [ ] **Step 4: Rodar** → PASS.

- [ ] **Step 5: Commit** (checkpoint): `feat(accounts): copy starter configs and creators on account creation`

---

### Task 13: Migração dos CSVs atuais

**Files:**
- Create: `app/src/scripts/migrate-csv.ts`
- Modify: `app/package.json` (script `migrate:csv`)
- Test: `app/src/scripts/migrate-csv.test.ts`

**Interfaces:**
- Consumes: lógica de parse de `src/lib/csv.ts` (reaproveitada só por este script), repo (Task 7), `users` (Task 3).
- Produces: `migrateCsv({ dataDir, ownerEmail }): Promise<{ configs: number; creators: number; videos: number; orphanVideos: number }>`.
  - Dono = conta com `ownerEmail` (deve existir).
  - IDs de origem são preservados (são UUIDs existentes nos CSVs). Idempotente: `ON CONFLICT (id) DO NOTHING`.
  - Vídeo cujo `creator` não existe em `creators.csv` entra com `creatorId = NULL` e `creatorUsername` preservado; conta em `orphanVideos`.
  - `configId` resolvido por `configName`; se não achar, `NULL`.

- [ ] **Step 1: Escrever testes** com CSVs de fixture (2 configs, 2 criadores, 3 vídeos, sendo 1 órfão):
  - Primeira execução: contagens corretas, `orphanVideos = 1`.
  - Segunda execução: mesmas linhas no banco, sem duplicatas.
  - Dono inexistente → erro claro "owner not found".

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar.** Fixtures em `src/scripts/__fixtures__/`, nunca os CSVs reais.

- [ ] **Step 4: Rodar** → PASS.

- [ ] **Step 5: Executar contra os dados reais**

Run: `npm run migrate:csv -- --owner-email <email-do-dono>` (em `app/`).
Expected: contagens próximas de 3 configs, 13 criadores, ~4.500 linhas de vídeos (pode haver 3 órfãos). Rodar uma segunda vez e confirmar que as contagens não mudam.

- [ ] **Step 6: Commit** (checkpoint): `feat(migration): import csv data into owner account idempotently`

---

### Task 14: Endurecimento de rotas e cabeçalhos

**Files:**
- Modify: `app/src/app/api/proxy-image/route.ts`
- Modify: `app/next.config.ts`
- Modify: `app/src/app/api/**/route.ts` (tratamento de erro genérico: nenhuma resposta com stack ou mensagem interna)
- Test: `app/src/app/api/proxy-image/proxy.test.ts`

**Interfaces:**
- Consumes: `requireSession` (Task 5).
- Produces: `isAllowedImageUrl(raw: string): boolean` — `true` só para `https:` com host `*.cdninstagram.com` ou `*.fbcdn.net`. `proxy-image` responde 400 para URL fora da lista e 401 sem sessão.
- Cabeçalhos em `next.config.ts` para todas as rotas: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.

- [ ] **Step 1: Escrever testes**:
  - `isAllowedImageUrl("https://scontent.cdninstagram.com/x.jpg") === true`
  - `isAllowedImageUrl("http://scontent.cdninstagram.com/x.jpg") === false`
  - `isAllowedImageUrl("https://evil.com/x.jpg") === false`
  - `isAllowedImageUrl("https://cdninstagram.com.evil.com/x.jpg") === false`
  - `isAllowedImageUrl("https://169.254.169.254/latest") === false`
  - `GET /api/proxy-image?url=https://evil.com` por usuário logado → 400.

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar** a função, a checagem na rota, os cabeçalhos e o tratamento de erro genérico (`catch` retorna `{ error: "Erro interno" }` com status 500, sem `err.message`).

- [ ] **Step 4: Rodar** → PASS.

- [ ] **Step 5: Commit** (checkpoint): `fix(security): restrict image proxy and add security headers`

---

### Task 15: Telas do app para o modelo multiusuário

**Files:**
- Modify: `app/src/app/layout.tsx` (mostrar usuário logado e botão de sair)
- Modify: `app/src/app/run/page.tsx` (mensagens para 409, 429 e `limitedTo`; exibir uso do dia)
- Modify: `app/src/app/configs/page.tsx`, `app/src/app/creators/page.tsx`, `app/src/app/videos/page.tsx` (tratar 401 redirecionando para `/login`, e 409 de duplicata)
- Create: `app/src/components/quota-badge.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/me`, `POST /api/auth/logout` (Task 5).
- Produces: `GET /api/auth/me` passa a devolver também `{ dailyRunsLimit, dailyVideosLimit, usageToday }`. Esta extensão é feita nesta task.

- [ ] **Step 1: Estender `/api/auth/me`** e escrever teste: retorna `usageToday` e limites.

- [ ] **Step 2: Implementar** as mudanças de tela. Admin não vê badge de cota.

- [ ] **Step 3: Verificação manual**: com conta comum, esgotar a cota de execuções e ver a mensagem de 429 na tela de execução; com duas abas, disparar 409.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: todos os testes passando.

- [ ] **Step 5: Commit** (checkpoint): `feat(ui): login state, quota display and error messages`

---

### Task 16: Verificação final e documentação

**Files:**
- Modify: `README.md`, `CLAUDE.md` (raiz) e `app/README.md` (subida local, comandos de conta, migração, cotas)
- Modify: `context/current-data.md` (estado atual: PostgreSQL, multiusuário)
- Modify: `app/src/scripts/seed.ts` (comentário no topo marcando como obsoleto; o arquivo fica)

**Interfaces:**
- Consumes: tudo acima.
- Produces: nada.

- [ ] **Step 1: Build de produção**

Run (em `app/`): `npm run build`
Expected: build sem erro de tipo.

- [ ] **Step 2: Lint**

Run (em `app/`): `npm run lint`
Expected: sem erros.

- [ ] **Step 3: Suíte completa**

Run (em `app/`): `npx vitest run`
Expected: todos os testes passando.

- [ ] **Step 4: Checklist manual com duas contas de teste**
  - Conta A e conta B: A não enxerga configs, criadores ou vídeos de B.
  - Admin enxerga e altera dados de A e B pelo painel; a alteração aparece em `admin_audit`.
  - Cota de execuções esgota e a tela avisa.
  - Conta desativada não loga.
  - Proxy de imagem recusa domínio fora da lista.

- [ ] **Step 5: Atualizar documentação** (seguindo a seção "Critical Instruction: Maintain This File" do `CLAUDE.md`: novas funções, nova estrutura de pastas, novos comandos).

- [ ] **Step 6: Commit** (checkpoint): `docs: update setup, commands and data model for multiuser`

---

## Self-Review

1. **Cobertura da spec:** login (Tasks 4–5), isolamento (Tasks 7–8), chaves no servidor (Global Constraints, Task 10), CRUD (Task 8), cotas (Task 9), painel admin com cotas, desativação e acesso a outras contas (Task 11), admin sem cota (Tasks 9, 11), cópia inicial (Task 12), migração CSV (Task 13), pipeline com estado e timeout (Task 10), registro de ações do admin (Tasks 7, 8, 11), comandos de conta (Task 6), segurança do proxy e cabeçalhos (Task 14), documentação (Task 16). Pontos da seção 9 da spec: vídeos órfãos (Tasks 3 e 13), crash e timeout (Task 10), admin (Tasks 7 e 11), desativação (Tasks 4, 6, 11). Nada sem tarefa.
2. **Consistência de tipos:** `SessionUser`, `resolveTargetUserId`, `reserveRun`, `reserveVideos`, `startRun`, `recordAdminAction` e `copyStarterContent` aparecem com a mesma assinatura onde são definidos e usados. A Task 6 deixa o comentário de gancho para a Task 12.
3. **Pontos a verificar na execução:** nome `middleware.ts` ou `proxy.ts` (Task 2, Step 2); se Drizzle e `pg` funcionam no Windows com Docker Desktop (Task 1); se a migração e a cópia batem com as contagens reais (Tasks 12 e 13, Step 5).

## Execution Handoff

**Plano salvo em `docs/superpowers/plans/2026-11-07-multiuser-postgres-plan.md`.** Por favor, revise e confirme se ele captura o que você quer.

Escolha a forma de execução:

- **Subagent-driven**: um subagente novo implementa cada task, e um revisor novo confere antes da próxima. Mais cuidadoso, mas gasta contexto novo em cada task e em cada revisão.
- **Native**: eu implemento todas as tasks nesta sessão, e no fim um revisor novo confere o conjunto. Mais barato e rápido, sem revisão independente até o final.

**Recomendo Subagent-driven**, porque são 16 tasks com interfaces encadeadas (repo, auth, quotas e pipeline dependem umas das outras) e um erro de isolamento de dados custaria caro se chegasse ao ar. Você escolhe a forma e confirma que o plano está como você quer.

Antes de cada commit, vou pedir a sua autorização. Também preciso do e-mail da conta de admin (o seu) para criar a conta, e de uma chave de cada serviço para as verificações com dados reais, que você coloca no seu `.env` local.
