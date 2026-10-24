-- =====================================================================
-- CRM Balcão — banco de dados e regras de acesso
-- Cole este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- Pode rodar mais de uma vez sem estragar nada.
-- =====================================================================
-- Papéis:
--   admin       -> dono do sistema. Vê e controla todas as empresas e pessoas.
--   gerente     -> pertence a uma empresa. Vê os próprios dados e os da equipe dele.
--   funcionario -> pertence a uma empresa e a um gerente. Vê só os próprios dados.
--   pendente    -> login criado mas ainda sem papel definido. Não vê nada.
-- As regras abaixo são aplicadas pelo próprio banco (Row Level Security),
-- então valem mesmo que alguém tente acessar o banco por fora das telas.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email text,
  papel text not null default 'pendente'
    check (papel in ('admin','gerente','funcionario','pendente')),
  empresa_id uuid references public.empresas(id) on delete cascade,
  gerente_id uuid references public.perfis(id) on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  responsavel_id uuid not null references public.perfis(id),
  nome text not null,
  telefone text default '',
  email text default '',
  instagram text default '',
  empresa_cliente text default '',
  obs text default '',
  criado_em timestamptz not null default now()
);

create table if not exists public.negocios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  responsavel_id uuid not null references public.perfis(id),
  cliente_id uuid references public.clientes(id) on delete set null,
  titulo text not null,
  valor numeric(12,2) not null default 0,
  etapa text not null default 'novo'
    check (etapa in ('novo','contato','proposta','negociando','ganho','perdido')),
  obs text default '',
  fechado_em date,
  criado_em timestamptz not null default now()
);

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  responsavel_id uuid not null references public.perfis(id),
  cliente_id uuid references public.clientes(id) on delete set null,
  titulo text not null,
  data date,
  hora text default '',
  feita boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists clientes_resp_idx on public.clientes(empresa_id, responsavel_id);
create index if not exists negocios_resp_idx on public.negocios(empresa_id, responsavel_id);
create index if not exists tarefas_resp_idx on public.tarefas(empresa_id, responsavel_id);
create index if not exists perfis_gerente_idx on public.perfis(gerente_id);

-- ---------- Funções de apoio (quem é o usuário logado) ----------
-- "security definer" deixa a função ler a tabela perfis sem cair nas
-- próprias regras de acesso (evita loop). Elas só respondem sobre o
-- usuário logado, nunca sobre outra pessoa.

create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;

create or replace function public.minha_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from public.perfis where id = auth.uid() and ativo
$$;

-- true quando o usuário logado pode ver os dados da pessoa "alvo"
create or replace function public.pode_ver_pessoa(alvo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.perfis eu
    join public.perfis p on p.id = alvo
    where eu.id = auth.uid() and eu.ativo and (
      eu.papel = 'admin'
      or (eu.papel in ('gerente','funcionario') and p.id = eu.id)
      or (eu.papel = 'gerente' and p.gerente_id = eu.id
          and p.empresa_id = eu.empresa_id and p.papel = 'funcionario')
    )
  )
$$;

-- true quando a pessoa pertence à empresa (e é gerente ou funcionário ativo)
create or replace function public.pessoa_da_empresa(pessoa uuid, emp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfis
    where id = pessoa and empresa_id = emp and ativo
      and papel in ('gerente','funcionario')
  )
$$;

-- ---------- Novo login ----------
-- O primeiríssimo usuário criado vira administrador.
-- Todos os outros nascem "pendente" (sem acesso) até o sistema definir o papel.
create or replace function public.ao_criar_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, papel)
  values (
    new.id, new.email,
    case when exists (select 1 from public.perfis) then 'pendente' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.ao_criar_usuario();

-- ---------- Regras de acesso ----------
alter table public.empresas enable row level security;
alter table public.perfis   enable row level security;
alter table public.clientes enable row level security;
alter table public.negocios enable row level security;
alter table public.tarefas  enable row level security;

-- Empresas: admin vê e mexe em todas; os outros só enxergam a própria.
drop policy if exists empresas_ver on public.empresas;
create policy empresas_ver on public.empresas for select to authenticated
  using (public.meu_papel() = 'admin' or id = public.minha_empresa());

drop policy if exists empresas_admin on public.empresas;
create policy empresas_admin on public.empresas for all to authenticated
  using (public.meu_papel() = 'admin')
  with check (public.meu_papel() = 'admin');

-- Perfis: só leitura pelas telas. Criar, editar e desativar logins
-- passa obrigatoriamente pelo servidor (/api/usuarios), que confere a hierarquia.
drop policy if exists perfis_ver on public.perfis;
create policy perfis_ver on public.perfis for select to authenticated
  using (public.pode_ver_pessoa(id));

-- Clientes, negócios e tarefas: mesma regra nas três tabelas.
do $$
declare t text;
begin
  foreach t in array array['clientes','negocios','tarefas'] loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format($p$
      create policy %1$s_ver on public.%1$s for select to authenticated
      using (
        public.pode_ver_pessoa(responsavel_id)
        and (public.meu_papel() = 'admin' or empresa_id = public.minha_empresa())
      )$p$, t);

    execute format('drop policy if exists %1$s_criar on public.%1$s', t);
    execute format($p$
      create policy %1$s_criar on public.%1$s for insert to authenticated
      with check (
        public.pode_ver_pessoa(responsavel_id)
        and public.pessoa_da_empresa(responsavel_id, empresa_id)
        and (public.meu_papel() = 'admin' or empresa_id = public.minha_empresa())
      )$p$, t);

    execute format('drop policy if exists %1$s_editar on public.%1$s', t);
    execute format($p$
      create policy %1$s_editar on public.%1$s for update to authenticated
      using (
        public.pode_ver_pessoa(responsavel_id)
        and (public.meu_papel() = 'admin' or empresa_id = public.minha_empresa())
      )
      with check (
        public.pode_ver_pessoa(responsavel_id)
        and public.pessoa_da_empresa(responsavel_id, empresa_id)
        and (public.meu_papel() = 'admin' or empresa_id = public.minha_empresa())
      )$p$, t);

    execute format('drop policy if exists %1$s_apagar on public.%1$s', t);
    execute format($p$
      create policy %1$s_apagar on public.%1$s for delete to authenticated
      using (
        public.pode_ver_pessoa(responsavel_id)
        and (public.meu_papel() = 'admin' or empresa_id = public.minha_empresa())
      )$p$, t);
  end loop;
end $$;

-- Ninguém sem login enxerga nada.
revoke all on public.empresas, public.perfis, public.clientes, public.negocios, public.tarefas from anon;
grant select, insert, update, delete on public.empresas, public.clientes, public.negocios, public.tarefas to authenticated;
grant select on public.perfis to authenticated;
revoke insert, update, delete on public.perfis from authenticated;
