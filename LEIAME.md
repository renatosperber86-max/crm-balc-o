# CRM Balcão — como colocar no ar

Sistema de CRM com três níveis de login:

| Login | O que vê | Pode criar login de |
|---|---|---|
| Administrador (você) | Todas as empresas, todos os gerentes e funcionários | Gerente e funcionário |
| Gerente | Os próprios dados e os da equipe dele | Funcionário da equipe dele |
| Funcionário | Só os próprios clientes, negócios e tarefas | Ninguém |

Essas regras ficam gravadas no próprio banco de dados. Mesmo que alguém tente acessar por fora das telas, não enxerga o que não pode.

Você vai precisar de três contas gratuitas: **Supabase** (banco e logins), **GitHub** (código) e **Vercel** (deixa o site no ar).

---

## Passo 1 — Criar o banco no Supabase

1. Entre em supabase.com e crie uma conta (pode usar a do GitHub).
2. Clique em **New project**. Dê um nome (ex.: `crm-balcao`), crie uma senha forte para o banco, escolha a região **South America (São Paulo)** e confirme.
3. Espere o projeto terminar de criar (1 a 2 minutos).
4. No menu da esquerda, abra **SQL Editor** e clique em **New query**.
5. Abra o arquivo `supabase/schema.sql`, copie **tudo**, cole no editor e clique em **Run**. Deve aparecer "Success".

## Passo 2 — Criar o seu login de administrador

> Faça isso **depois** do passo 1. O primeiro login criado no sistema vira administrador automaticamente.

1. No menu da esquerda, abra **Authentication** → **Users**.
2. Clique em **Add user** → **Create new user**.
3. Coloque o seu e-mail e uma senha. Marque **Auto Confirm User**. Confirme.

## Passo 3 — Fechar o cadastro público

Assim ninguém consegue criar conta sozinho. Todos os logins passam por você ou pelos gerentes.

1. Em **Authentication**, abra **Sign In / Providers** (em algumas versões aparece como **Providers** ou **Settings**).
2. Desligue **Allow new users to sign up** e salve.

## Passo 4 — Copiar as chaves

1. Abra **Project Settings** (engrenagem) → **API** (ou **API Keys**).
2. Anote três coisas. Se houver uma aba **Legacy API keys**, use as chaves dela:
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **anon / public** (chave pública)
   - **service_role** (chave secreta: **nunca** mande para ninguém nem cole em página)

## Passo 5 — Código no GitHub

Crie um repositório vazio no GitHub (ex.: `crm-balcao`) e envie estes arquivos para ele. Se o Claude estiver te ajudando, é só passar o nome do repositório que ele envia o código.

## Passo 6 — Colocar no ar com a Vercel

1. Entre em vercel.com com a sua conta do GitHub.
2. Clique em **Add New → Project** e importe o repositório `crm-balcao`.
3. Antes de clicar em Deploy, abra **Environment Variables** e cadastre:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | o Project URL |
| `SUPABASE_ANON_KEY` | a chave anon / public |
| `SUPABASE_SERVICE_ROLE_KEY` | a chave service_role |

4. Clique em **Deploy**. No fim, a Vercel mostra o link do sistema (ex.: `crm-balcao.vercel.app`).

## Passo 7 — Primeiro uso

1. Abra o link e entre com o login do passo 2.
2. Aba **Empresas** → **+ Nova empresa**.
3. Aba **Equipe e logins** → **+ Novo login** → crie um **gerente**.
4. Crie os funcionários escolhendo o gerente de cada um, ou deixe o próprio gerente criar a equipe dele.
5. Passe o e-mail e a senha para cada pessoa.

---

## Dúvidas comuns

- **Alguém esqueceu a senha:** o gerente (para a equipe dele) ou o administrador abre **Editar** no login da pessoa e coloca uma senha nova.
- **Funcionário saiu da empresa:** desmarque **Login ativo**. Ele perde o acesso na hora, e os clientes dele continuam visíveis para o gerente. Para passar um cliente para outra pessoa, edite o cliente e troque o **Responsável**.
- **Mudar um funcionário de equipe:** o administrador edita o login e troca o **Gerente responsável**.
- **Mais de 200 pessoas usando todo dia:** o plano gratuito do Supabase pausa projetos parados e tem limites de uso. Quando o sistema estiver rodando com clientes de verdade, vale passar para um plano pago.

## Arquivos

- `index.html`, `style.css`, `app.js`: as telas.
- `api/usuarios.js`: cria, edita e desativa logins conferindo quem pode o quê.
- `api/config.js`: entrega ao navegador o endereço do banco e a chave pública.
- `supabase/schema.sql`: tabelas e regras de acesso.
