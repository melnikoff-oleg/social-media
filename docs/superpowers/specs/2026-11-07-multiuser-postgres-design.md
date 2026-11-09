# Design: Social Media AI — multiusuário com PostgreSQL e login (rodando local primeiro)

**Data:** 2026-11-07
**Status:** Aguardando revisão do dono do projeto

---

## 1. Intenção e motivo

O sistema hoje roda só em localhost, com dados em CSV e sem login. O dono quer:

- Colocá-lo online depois, numa VPS da Hostinger.
- Ter **várias pessoas usando**, cada uma com **o próprio perfil** (configs, criadores, vídeos e execuções) e sem ver os dados das outras.
- **Montar tudo local primeiro.** A publicação na VPS acontece depois, quando o local estiver pronto.

Sucesso: uma pessoa cadastrada faz login, opera o pipeline e vê só os seus dados. Uma pessoa sem login, ou logada como outra, não consegue ler nem alterar esses dados. Tudo roda no Windows local com Postgres via Docker.

## 2. Metas

- Migrar `data/*.csv` para PostgreSQL, com todas as entidades ligadas a um usuário (`user_id`).
- Login por e-mail e senha, com sessão no servidor.
- Isolamento de dados por usuário, aplicado em toda consulta e verificado por testes.
- Criação de contas somente pelo administrador (via linha de comando).
- Proteção das rotas de API e das páginas, incluindo o pipeline (que gasta créditos de API).
- Chaves de API (Apify, Gemini, Anthropic) continuam no servidor, compartilhadas e pagas pelo dono.
- Dados existentes (CSV atuais) importados para a conta do administrador.

## 3. Não-metas (fora desta etapa)

- Publicação na VPS da Hostinger (etapa seguinte).
- Cadastro público, recuperação de senha por e-mail, verificação de e-mail, 2FA.
- Tela de administração completa (edição de dados de usuário, histórico, auditoria). Nesta etapa, o painel admin só lista usuários, define cotas e ativa ou desativa contas. Criação e reset de senha continuam por linha de comando.
- Compartilhamento de configs ou criadores entre usuários.
- Chaves de API por usuário.
- Cobrança ou limite de créditos por usuário.

## 4. Anti-metas (o que faria isto falhar mesmo funcionando)

- Um usuário ver, editar ou apagar dados de outro usuário.
- Qualquer chave de API chegar ao navegador ou ao repositório git.
- Uma rota de dados responder sem sessão válida.
- Um usuário disparar o pipeline sem limite e gastar a conta do dono sem controle.

## 5. Restrições

- Projeto existente: Next.js 16 (App Router), TypeScript, Tailwind e shadcn/ui, em `app/`. Já é Next.js; não há migração de framework.
- Ambiente local: Windows 11, PowerShell e Git Bash. Docker Desktop disponível (a confirmar na implementação).
- O pipeline roda no servidor Node, com execuções longas (até 300 s por requisição). Não pode ser serverless.
- Dados existentes: `data/configs.csv`, `data/creators.csv`, `data/videos.csv` (este com ~4.500 linhas). Thumbnails são URLs do CDN do Instagram, que expiram; isso já é assim hoje e não muda nesta etapa.

## 6. Como será feito (decisões)

Decisões marcadas **[dono]** vieram da conversa. As marcadas **[minha escolha]** foram tomadas por mim e podem ser trocadas.

### 6.1 Usuários e perfis
- Cada pessoa tem uma conta. **[dono]**
- Cada pessoa vê só o próprio conteúdo. **[dono]**
- Não há compartilhamento entre contas. **[minha escolha]**
- Papéis: `admin` e `user`. O admin é o dono; ele cria contas, não tem cota e acessa os dados de qualquer conta pelo painel (seção 10.4). Usuários comuns têm os mesmos poderes dentro do próprio perfil e não veem dados de outras contas. **[dono]**
- Não há cadastro público. **[minha escolha]**
- Painel `/admin` (só para `role = admin`): lista usuários, mostra o uso do dia de cada um, define a cota de cada um e ativa ou desativa contas. **[dono]**

### 6.2 Banco de dados
- PostgreSQL 16 num `docker-compose.yml` na raiz (apenas o banco nesta etapa; o app roda com `npm run dev`). **[minha escolha]**
- ORM: Drizzle, com migrações versionadas. **[minha escolha]**
- Driver: `pg` (node-postgres). **[minha escolha]**
- Tabelas: `users`, `sessions`, `configs`, `creators`, `videos`, `pipeline_runs`. Cada uma de conteúdo tem `user_id` (FK para `users`, `ON DELETE CASCADE`). **[minha escolha]**
- Unicidade por usuário: `creators(user_id, username)` e `configs(user_id, config_name)`. **[minha escolha]**
- IDs em UUID gerados pelo banco. **[minha escolha]**
- `csv.ts` é substituído por uma camada de acesso (`src/lib/db/`). As rotas mantêm o mesmo formato de resposta, para a interface não quebrar. **[minha escolha]**

### 6.3 Autenticação
- E-mail e senha. Senha com hash Argon2id, usando `@node-rs/argon2` (instala sem compilação no Windows). **[minha escolha]**
- Sessão no banco: token aleatório de 32 bytes no cookie, armazenado como SHA-256 na tabela `sessions`. Cookie `httpOnly`, `sameSite=lax`, `secure` em produção. Validade de 7 dias. **[minha escolha]**
- `middleware.ts` redireciona páginas sem sessão para `/login` e responde 401 nas rotas `/api` (exceto `/api/auth/login`). **[minha escolha]**
- Limite de tentativas de login por e-mail e por IP (em memória, janela de 15 min, 5 tentativas). **[minha escolha]**
- Criação de usuário: `npm run create-user -- --email ... --name ... --role user`. Reset de senha: `npm run reset-password -- --email ...`. **[minha escolha]**
- Mensagens de login genéricas ("e-mail ou senha inválidos"), sem revelar se o e-mail existe. **[minha escolha]**

### 6.4 Pipeline e chaves
- As chaves `APIFY_API_TOKEN`, `GEMINI_API_KEY` e `ANTHROPIC_API_KEY` ficam em `.env` (local) e no servidor. Nunca vão ao navegador. Todas são do dono. **[dono]**
- Uma execução do pipeline por usuário por vez. Se já houver uma em andamento, a nova recebe 409. **[minha escolha]**
- Parâmetros limitados: máximo de vídeos e top-K com teto definido no servidor (valores exatos a definir na implementação). **[minha escolha]**
- Cota diária por usuário, com dois limites: execuções por dia e vídeos analisados por dia. Ver seção 10. **[dono]**
- `/api/pipeline` exige sessão antes de iniciar o stream SSE. Os resultados são gravados na conta do usuário que disparou. **[minha escolha]**

### 6.5 Segurança das rotas existentes
- PUT e PATCH passam a aceitar só campos listados num schema Zod. Nada de `{ ...existente, ...body }`. **[minha escolha]**
- Todas as entradas são validadas com Zod (tamanho máximo de texto, formato de URL). **[minha escolha]**
- `/api/proxy-image` aceita só hosts `*.cdninstagram.com` e `*.fbcdn.net`, e só via HTTPS. **[minha escolha]**
- Cabeçalhos de segurança em `next.config.ts` (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`). **[minha escolha]**
- Erros para o cliente sem stack trace. **[minha escolha]**

### 6.6 Migração dos dados atuais
- Script `npm run migrate:csv` lê os três CSVs e grava na conta do admin. É idempotente: reexecutar não duplica (usa os IDs originais dos CSVs). **[minha escolha]**
- Os CSVs continuam em `data/` como cópia de segurança e não são mais lidos pelo app depois da migração. **[minha escolha]**

### 6.7 Testes
- Vitest para as regras de autenticação, validação e isolamento. Teste principal: usuário A não lê, não altera e não apaga dados de B, em cada rota. **[minha escolha]**
- Teste de rota sem sessão retorna 401. **[minha escolha]**
- Testes de acesso do admin: o admin lê e altera dados de outra conta pelo painel; um usuário comum não lê nem altera dados de outra conta, e recebe 403 no painel. **[dono]**
- Teste de `proxy-image` recusando domínio fora da lista. **[minha escolha]**

### 6.8 Ambiente local
- `.env` na raiz com `DATABASE_URL`, as três chaves e `SESSION_SECRET` se for necessário. `.env.example` atualizado. **[minha escolha]**
- Passos de subida registrados no `README.md` e no `CLAUDE.md` ao final da implementação. **[minha escolha]**

## 7. O que fica para quem for construir

- Ordem exata das tarefas, nomes finais de arquivos e convenções de código: definidos no plano.
- Escolha de biblioteca de validação de senha e limites numéricos exatos do pipeline: definidos no plano.
- Como lidar com erros parciais de scraping por criador: manter o comportamento atual.

## 8. Publicação (etapa seguinte, fora deste documento)

Quando o local estiver pronto e validado, a publicação segue para uma VPS Hostinger (Ubuntu 24.04 com Docker), com Caddy para HTTPS, Postgres sem porta exposta e backup diário com `pg_dump`. Isso exige um domínio apontando para a VPS e será detalhado em outro documento.

## 9. Pontos levantados na revisão independente

### 9.1 Resolvidos pelo autor do documento (marcados como minha escolha)

- **Vídeos x criadores e configs.** `videos` guarda `creator_id` e `config_id` (FKs). Ao apagar um criador ou config, os vídeos são mantidos e o campo vira `NULL`; o nome em texto (`creator_username`, `config_name`) continua gravado para exibição. Na migração, os 3 vídeos cujo criador não existe em `creators.csv` entram com `creator_id = NULL` e o nome preservado. **[minha escolha]**
- **Execução do pipeline após queda ou fechamento de aba.** Estado fica em `pipeline_runs` (`status`: `running`, `done`, `failed`, `timed_out`). O trabalho roda no servidor e continua mesmo se a aba fechar. Na inicialização do servidor, qualquer execução `running` com mais de 15 minutos vira `timed_out`, liberando o usuário. Cancelamento manual fica fora desta etapa. **[minha escolha]**
- **Papel `admin` dentro do app.** Substituído pela decisão do dono (seção 10.4): o admin acessa os dados de qualquer conta pelo painel. Usuários comuns não acessam dados de outras contas. **[dono]**
- **Conta desativada ou apagada.** A tabela `users` ganha a coluna `active` (padrão `true`). Login e validação de sessão recusam contas inativas. Comandos: `npm run disable-user -- --email ...` e `npm run delete-user -- --email ...` (este último apaga em cascata). **[minha escolha]**

### 9.2 Decisões do dono

- **Limite de gasto por usuário.** Decidido: (b), cota diária por usuário, definida pelo admin no painel. Detalhes na seção 10.
- **Conteúdo inicial de uma conta nova.** Decidido: (b), cópia das 3 configs e dos 13 criadores do dono no primeiro acesso da conta. Detalhes na seção 10.

## 10. Cotas e conteúdo inicial (decisões do dono, 2026-11-07)

### 10.1 Cotas
- Cada usuário tem dois limites diários, definidos pelo admin no painel `/admin`: **execuções por dia** e **vídeos analisados por dia**. **[dono]**
- Valores padrão para contas novas: 5 execuções e 100 vídeos por dia. Valores de exemplo, ajustáveis pelo admin. **[minha escolha]**
- O admin não tem cota. As execuções dele não são limitadas. **[dono]**
- Quando a execução começa, ela é recusada (HTTP 429, com mensagem na tela) se a cota de execuções do dia acabou. Se restam menos vídeos que o top-K pedido, a execução roda só com os vídeos que sobram e a tela avisa. **[minha escolha]**
- O dia vira à meia-noite, horário de São Paulo. **[minha escolha]**
- Alterações de cota valem imediatamente para as próximas execuções. **[minha escolha]**
- Persistência: colunas `daily_runs_limit` e `daily_videos_limit` em `users`, e tabela `usage_daily` (`user_id`, `day`, `runs`, `videos`) com chave composta. **[minha escolha]**

### 10.2 Painel `/admin`
- Visível só para `role = admin`. Acesso negado para os demais, com 403 na API e redirecionamento na página. **[minha escolha]**
- Lista de usuários com nome, e-mail, status (ativo ou inativo), uso do dia e cotas. **[minha escolha]**
- Edição das duas cotas por usuário e botão para ativar ou desativar a conta. **[minha escolha]**
- Ações de criar conta e resetar senha continuam por linha de comando. **[minha escolha]**

### 10.4 Acesso do admin às contas
- O admin vê e altera configs, criadores, vídeos e execuções de qualquer conta, pelo painel `/admin`. **[dono]**
- Usuários comuns não veem nem alteram dados de outras contas. **[dono]**
- Quando o admin altera dados de outra conta, a ação fica registrada (quem, quando, qual conta, o que mudou). Não estava na sua resposta; é uma escolha minha, para deixar rastro de acesso a dados de terceiros. **[minha escolha]**

### 10.3 Conteúdo inicial de conta nova
- No primeiro acesso, a conta recebe uma cópia das 3 configs e dos 13 criadores do dono. A cópia é feita uma única vez, no momento da criação da conta. Depois disso, cada conta é independente. **[dono]**
- A cópia usa os IDs novos da conta, sem vínculo com os registros do dono. **[minha escolha]**
