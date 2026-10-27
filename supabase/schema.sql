-- =====================================================================
-- CRM Balcão — banco de dados e regras de acesso (versão 2)
-- Cole este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- Pode rodar mais de uma vez sem estragar nada: ele cria o que falta e
-- atualiza o que já existe, sem apagar dados.
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

-- =====================================================================
-- 1. TABELAS
-- =====================================================================
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);
alter table public.empresas add column if not exists sla_minutos int not null default 5;

-- Áreas da empresa (Vendas, Financeiro, Assistência...) para encaminhar conversas
create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
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
alter table public.perfis add column if not exists area_id uuid references public.areas(id) on delete set null;
alter table public.perfis add column if not exists foto_url text;
alter table public.perfis add column if not exists presenca text not null default 'online';
alter table public.perfis add column if not exists visto_em timestamptz;
alter table public.perfis add column if not exists prefs jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.perfis add constraint perfis_presenca_ck check (presenca in ('online','ocupado','offline'));
exception when duplicate_object then null; end $$;

-- Contatos (clientes). Responsável vazio = contato na fila, ainda sem dono.
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  responsavel_id uuid references public.perfis(id),
  nome text not null,
  telefone text default '',
  email text default '',
  instagram text default '',
  empresa_cliente text default '',
  obs text default '',
  criado_em timestamptz not null default now()
);
alter table public.clientes alter column responsavel_id drop not null;
alter table public.clientes add column if not exists whatsapp text;
alter table public.clientes add column if not exists bloqueado boolean not null default false;
alter table public.clientes add column if not exists ultima_interacao timestamptz;
alter table public.clientes add column if not exists origem text not null default 'manual';

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

-- Etiquetas (só gerente e administrador criam) e etiquetas de cada contato
create table if not exists public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  cor text not null default '#3fbfa6',
  categoria text not null default 'Sem categoria',
  criado_em timestamptz not null default now()
);
create table if not exists public.cliente_etiquetas (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  etiqueta_id uuid not null references public.etiquetas(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (cliente_id, etiqueta_id)
);

-- Conversas do WhatsApp: uma por contato
create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null unique references public.clientes(id) on delete cascade,
  responsavel_id uuid references public.perfis(id),
  area_id uuid references public.areas(id) on delete set null,
  status text not null default 'fila'
    check (status in ('fila','aguardando_atendente','aguardando_cliente','ativo','encerrada')),
  nao_lidas int not null default 0,
  ultima_msg_em timestamptz,
  ultima_msg_texto text default '',
  ultima_msg_direcao text,
  aguardando_desde timestamptz,
  janela_ate timestamptz,
  arquivada boolean not null default false,
  fixada boolean not null default false,
  encerrada_em timestamptz,
  criado_em timestamptz not null default now()
);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  direcao text not null check (direcao in ('in','out')),
  tipo text not null default 'texto'
    check (tipo in ('texto','imagem','video','audio','documento','figurinha','localizacao','modelo','outro')),
  texto text default '',
  midia_path text,
  midia_mime text,
  midia_nome text,
  midia_tamanho bigint,
  wa_id text unique,
  status text not null default 'pendente'
    check (status in ('pendente','enviada','entregue','lida','erro','nao_enviada','recebida')),
  erro text,
  autor_id uuid references public.perfis(id) on delete set null,
  resposta_a uuid references public.mensagens(id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.mensagem_favoritas (
  user_id uuid not null references public.perfis(id) on delete cascade,
  mensagem_id uuid not null references public.mensagens(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (user_id, mensagem_id)
);

create table if not exists public.conversa_favoritas (
  user_id uuid not null references public.perfis(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  primary key (user_id, conversa_id)
);

-- Histórico de cada conversa (atribuída, transferida, encerrada...)
create table if not exists public.conversa_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  tipo text not null,
  autor_id uuid references public.perfis(id) on delete set null,
  para_id uuid references public.perfis(id) on delete set null,
  area_id uuid references public.areas(id) on delete set null,
  texto text default '',
  criado_em timestamptz not null default now()
);

-- Tempo de resposta (para o SLA do painel)
create table if not exists public.respostas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  responsavel_id uuid references public.perfis(id) on delete set null,
  esperou_seg int not null,
  criado_em timestamptz not null default now()
);

-- Conversas encaminhadas para outra área (pendências da Assistência etc.)
create table if not exists public.encaminhamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  de_id uuid references public.perfis(id) on delete set null,
  motivo text not null default '',
  prazo_horas int not null default 4,
  status text not null default 'pendente' check (status in ('pendente','assumida','devolvida','recuperada')),
  resolvido_por uuid references public.perfis(id) on delete set null,
  resolvido_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Pedidos
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero int,
  responsavel_id uuid not null references public.perfis(id),
  cliente_id uuid references public.clientes(id) on delete set null,
  conversa_id uuid references public.conversas(id) on delete set null,
  produto text not null default '',
  quantidade numeric(12,2) not null default 1,
  total numeric(12,2) not null default 0,
  status text not null default 'aberto' check (status in ('aberto','em_andamento','pago','cancelado')),
  pagamento_forma text not null default '' check (pagamento_forma in ('','pix','cartao_credito','cartao_debito','dinheiro','boleto','transferencia','outro')),
  pagamento_status text not null default 'pendente' check (pagamento_status in ('pendente','confirmado')),
  obs text default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, numero)
);

-- Lembretes (antiga "tarefas")
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
alter table public.tarefas add column if not exists descricao text default '';
alter table public.tarefas add column if not exists conversa_id uuid references public.conversas(id) on delete set null;

-- Mensagens rápidas: atalhos pessoais de cada usuário
create table if not exists public.mensagens_rapidas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.perfis(id) on delete cascade,
  atalho text not null,
  conteudo text not null,
  criado_em timestamptz not null default now(),
  unique (user_id, atalho)
);

-- Galeria de mídia
create table if not exists public.pastas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  dono_id uuid not null references public.perfis(id) on delete cascade,
  parent_id uuid references public.pastas(id) on delete cascade,
  nome text not null,
  visibilidade text not null default 'privada' check (visibilidade in ('privada','equipe','empresa')),
  criado_em timestamptz not null default now()
);
create table if not exists public.arquivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  dono_id uuid not null references public.perfis(id) on delete cascade,
  pasta_id uuid references public.pastas(id) on delete cascade,
  nome text not null,
  path text not null,
  mime text not null default 'application/octet-stream',
  tamanho bigint not null default 0,
  visibilidade text not null default 'privada' check (visibilidade in ('privada','equipe','empresa')),
  criado_em timestamptz not null default now()
);

-- Chat da equipe
create table if not exists public.equipe_conversas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('direta','grupo')),
  nome text not null default '',
  criado_por uuid references public.perfis(id) on delete set null,
  ultima_msg_em timestamptz,
  ultima_msg_texto text default '',
  criado_em timestamptz not null default now()
);
create table if not exists public.equipe_membros (
  conversa_id uuid not null references public.equipe_conversas(id) on delete cascade,
  user_id uuid not null references public.perfis(id) on delete cascade,
  lido_em timestamptz not null default now(),
  primary key (conversa_id, user_id)
);
create table if not exists public.equipe_mensagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversa_id uuid not null references public.equipe_conversas(id) on delete cascade,
  autor_id uuid references public.perfis(id) on delete set null,
  texto text default '',
  midia_path text,
  midia_mime text,
  midia_nome text,
  criado_em timestamptz not null default now()
);
create table if not exists public.equipe_favoritas (
  user_id uuid not null references public.perfis(id) on delete cascade,
  mensagem_id uuid not null references public.equipe_mensagens(id) on delete cascade,
  primary key (user_id, mensagem_id)
);

-- Assistência: ordens de serviço
create table if not exists public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero int,
  responsavel_id uuid not null references public.perfis(id),
  cliente_id uuid references public.clientes(id) on delete set null,
  conversa_id uuid references public.conversas(id) on delete set null,
  titulo text not null,
  descricao text default '',
  status text not null default 'aberta' check (status in ('aberta','em_andamento','concluida','cancelada')),
  custo_frete numeric(12,2) not null default 0,
  valor numeric(12,2) not null default 0,
  conta_valor numeric(12,2) not null default 0,
  conta_vencimento date,
  conta_paga boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, numero)
);

-- Chamados de suporte (abertos pela equipe para o administrador do sistema)
create table if not exists public.chamados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  autor_id uuid references public.perfis(id) on delete set null,
  titulo text not null,
  descricao text default '',
  status text not null default 'aberto' check (status in ('aberto','resolvido')),
  resposta text default '',
  resolvido_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Notificações de cada usuário
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.perfis(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade,
  tipo text not null default 'info',
  titulo text not null,
  texto text default '',
  link text default '',
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Conexão do WhatsApp (API oficial da Meta), uma por empresa.
-- O token fica numa tabela separada que ninguém consegue ler pelas telas.
create table if not exists public.whatsapp_contas (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  phone_number_id text not null unique,
  waba_id text default '',
  numero_exibicao text default '',
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.whatsapp_tokens (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  access_token text not null
);

-- ---------- Índices ----------
create index if not exists clientes_resp_idx on public.clientes(empresa_id, responsavel_id);
create unique index if not exists clientes_whatsapp_uk on public.clientes(empresa_id, whatsapp) where whatsapp is not null and whatsapp <> '';
create index if not exists negocios_resp_idx on public.negocios(empresa_id, responsavel_id);
create index if not exists tarefas_resp_idx on public.tarefas(empresa_id, responsavel_id);
create index if not exists perfis_gerente_idx on public.perfis(gerente_id);
create index if not exists perfis_empresa_idx on public.perfis(empresa_id);
create index if not exists areas_emp_idx on public.areas(empresa_id);
create index if not exists etiquetas_emp_idx on public.etiquetas(empresa_id);
create index if not exists conversas_emp_idx on public.conversas(empresa_id, responsavel_id, status);
create index if not exists conversas_ult_idx on public.conversas(empresa_id, ultima_msg_em desc);
create index if not exists mensagens_conv_idx on public.mensagens(conversa_id, criado_em);
create index if not exists eventos_conv_idx on public.conversa_eventos(conversa_id, criado_em);
create index if not exists eventos_emp_idx on public.conversa_eventos(empresa_id, criado_em);
create index if not exists respostas_emp_idx on public.respostas(empresa_id, criado_em);
create index if not exists enc_emp_idx on public.encaminhamentos(empresa_id, status);
create index if not exists pedidos_resp_idx on public.pedidos(empresa_id, responsavel_id);
create index if not exists os_resp_idx on public.ordens_servico(empresa_id, responsavel_id);
create index if not exists pastas_emp_idx on public.pastas(empresa_id);
create index if not exists arquivos_emp_idx on public.arquivos(empresa_id, pasta_id);
create index if not exists eqmsg_conv_idx on public.equipe_mensagens(conversa_id, criado_em);
create index if not exists eqmemb_user_idx on public.equipe_membros(user_id);
create index if not exists notif_user_idx on public.notificacoes(user_id, lida, criado_em desc);
create index if not exists chamados_emp_idx on public.chamados(empresa_id, status);

-- =====================================================================
-- 2. FUNÇÕES DE APOIO (quem é o usuário logado)
-- "security definer" deixa a função ler a tabela perfis sem cair nas
-- próprias regras de acesso (evita loop). Elas só respondem sobre o
-- usuário logado.
-- =====================================================================
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;

create or replace function public.minha_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from public.perfis where id = auth.uid() and ativo
$$;

create or replace function public.minha_area() returns uuid
language sql stable security definer set search_path = public as $$
  select area_id from public.perfis where id = auth.uid() and ativo
$$;

-- admin, ou a empresa é a do usuário logado
create or replace function public.acesso_empresa(emp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and ativo and (papel = 'admin' or (empresa_id = emp and papel in ('gerente','funcionario')))
  )
$$;

-- admin, ou gerente dessa empresa
create or replace function public.lider_da_empresa(emp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and ativo and (papel = 'admin' or (papel = 'gerente' and empresa_id = emp))
  )
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

-- duas pessoas estão no mesmo time (mesmo gerente)
create or replace function public.mesmo_time(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfis pa, public.perfis pb
    where pa.id = a and pb.id = b and pa.empresa_id = pb.empresa_id
      and coalesce(case when pa.papel = 'funcionario' then pa.gerente_id end, pa.id)
        = coalesce(case when pb.papel = 'funcionario' then pb.gerente_id end, pb.id)
  )
$$;

-- regra de quem vê uma conversa
create or replace function public.pode_ver_conversa_reg(emp uuid, resp uuid, area uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.acesso_empresa(emp) and (
    public.pode_ver_pessoa(resp)
    or (resp is null and (area is null or area = public.minha_area() or public.lider_da_empresa(emp)))
  )
$$;

create or replace function public.pode_ver_conversa(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversas x where x.id = c and public.pode_ver_conversa_reg(x.empresa_id, x.responsavel_id, x.area_id))
$$;

-- id da empresa no começo do caminho de um arquivo (nulo se o caminho for inválido)
create or replace function public.empresa_do_caminho(n text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(n, '/', 1)::uuid;
exception when others then return null;
end $$;

create or replace function public.sou_membro(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipe_membros where conversa_id = c and user_id = auth.uid())
$$;

-- só os dígitos do telefone, com 55 na frente quando for número brasileiro sem DDI
create or replace function public.so_digitos(t text) returns text
language sql immutable as $$
  select case
    when t is null or regexp_replace(t, '\D', '', 'g') = '' then null
    when length(regexp_replace(t, '\D', '', 'g')) in (10, 11) then '55' || regexp_replace(t, '\D', '', 'g')
    else regexp_replace(t, '\D', '', 'g') end
$$;

-- cria uma notificação (usada pelos gatilhos)
create or replace function public.notificar(u uuid, emp uuid, tp text, tit text, txt text, lnk text) returns void
language sql security definer set search_path = public as $$
  insert into public.notificacoes (user_id, empresa_id, tipo, titulo, texto, link)
  select u, emp, tp, tit, left(coalesce(txt, ''), 200), lnk where u is not null
$$;

-- =====================================================================
-- 3. GATILHOS (automatizações)
-- =====================================================================

-- O primeiríssimo usuário criado vira administrador. Os outros nascem "pendente".
create or replace function public.ao_criar_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, papel)
  values (new.id, new.email, case when exists (select 1 from public.perfis) then 'pendente' else 'admin' end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.ao_criar_usuario();

-- Empresa nova já nasce com as áreas padrão
create or replace function public.ao_criar_empresa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.areas (empresa_id, nome)
  select new.id, n from unnest(array['Vendas','Financeiro','Assistência']) n;
  return new;
end $$;
drop trigger if exists ao_criar_empresa on public.empresas;
create trigger ao_criar_empresa after insert on public.empresas
  for each row execute function public.ao_criar_empresa();

-- empresas que já existiam ganham as áreas padrão (uma vez só)
insert into public.areas (empresa_id, nome)
select e.id, n from public.empresas e cross join unnest(array['Vendas','Financeiro','Assistência']) n
where not exists (select 1 from public.areas a where a.empresa_id = e.id);

-- WhatsApp do contato calculado a partir do telefone
create or replace function public.cliente_whatsapp() returns trigger
language plpgsql as $$
begin
  if new.whatsapp is null or new.whatsapp = '' or (tg_op = 'UPDATE' and new.telefone is distinct from old.telefone and new.whatsapp = old.whatsapp) then
    new.whatsapp := public.so_digitos(new.telefone);
  else
    new.whatsapp := public.so_digitos(new.whatsapp);
  end if;
  return new;
end $$;
drop trigger if exists cliente_whatsapp on public.clientes;
create trigger cliente_whatsapp before insert or update on public.clientes
  for each row execute function public.cliente_whatsapp();

-- preenche o WhatsApp dos contatos antigos (ignora números repetidos)
do $$
declare r record;
begin
  for r in select id, telefone from public.clientes where whatsapp is null and coalesce(telefone, '') <> '' loop
    begin
      update public.clientes set whatsapp = public.so_digitos(r.telefone) where id = r.id;
    exception when unique_violation then null;
    end;
  end loop;
end $$;

-- Numeração sequencial por empresa (pedidos e ordens de serviço)
create or replace function public.numerar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext(tg_table_name || new.empresa_id::text));
    execute format('select coalesce(max(numero), 1000) + 1 from public.%I where empresa_id = $1', tg_table_name)
      into new.numero using new.empresa_id;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists numerar on public.pedidos;
create trigger numerar before insert or update on public.pedidos for each row execute function public.numerar();
drop trigger if exists numerar on public.ordens_servico;
create trigger numerar before insert or update on public.ordens_servico for each row execute function public.numerar();

-- Cada mensagem nova atualiza a conversa, o tempo de resposta e avisa o responsável
create or replace function public.ao_criar_mensagem() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.conversas; previa text; era_encerrada boolean; nome_cli text;
begin
  -- mensagem que falhou no envio não conta como resposta
  if new.direcao = 'out' and new.status = 'erro' then return new; end if;
  select * into c from public.conversas where id = new.conversa_id for update;
  previa := case new.tipo
    when 'texto' then coalesce(new.texto, '') when 'imagem' then '📷 Foto' when 'video' then '🎬 Vídeo'
    when 'audio' then '🎤 Áudio' when 'documento' then '📄 ' || coalesce(new.midia_nome, 'Documento')
    when 'figurinha' then 'Figurinha' when 'localizacao' then '📍 Localização' when 'modelo' then coalesce(new.texto, 'Modelo')
    else coalesce(nullif(new.texto, ''), 'Mensagem') end;
  if new.tipo in ('imagem','video','documento') and coalesce(new.texto, '') <> '' then previa := previa || ' · ' || new.texto; end if;
  era_encerrada := c.status = 'encerrada';

  if new.direcao = 'in' then
    update public.conversas set
      ultima_msg_em = new.criado_em, ultima_msg_texto = left(previa, 200), ultima_msg_direcao = 'in',
      nao_lidas = nao_lidas + 1, aguardando_desde = coalesce(aguardando_desde, new.criado_em),
      janela_ate = new.criado_em + interval '24 hours', arquivada = false, encerrada_em = null,
      status = case when responsavel_id is null then 'fila' else 'aguardando_atendente' end
    where id = c.id;
    if era_encerrada then
      insert into public.conversa_eventos (empresa_id, conversa_id, tipo, texto) values (c.empresa_id, c.id, 'reaberta', 'Cliente voltou a falar');
    end if;
    select nome into nome_cli from public.clientes where id = c.cliente_id;
    perform public.notificar(c.responsavel_id, c.empresa_id, 'mensagem', 'Nova mensagem de ' || coalesce(nome_cli, 'cliente'), previa, 'chat:' || c.id);
  else
    if c.aguardando_desde is not null then
      insert into public.respostas (empresa_id, conversa_id, responsavel_id, esperou_seg)
      values (c.empresa_id, c.id, coalesce(new.autor_id, c.responsavel_id), greatest(0, extract(epoch from (new.criado_em - c.aguardando_desde)))::int);
    end if;
    update public.conversas set
      ultima_msg_em = new.criado_em, ultima_msg_texto = left(previa, 200), ultima_msg_direcao = 'out',
      aguardando_desde = null, nao_lidas = 0,
      responsavel_id = coalesce(responsavel_id, new.autor_id),
      area_id = case when responsavel_id is null and new.autor_id is not null then null else area_id end,
      status = 'aguardando_cliente',
      encerrada_em = null
    where id = c.id;
    if c.responsavel_id is null and new.autor_id is not null then
      insert into public.conversa_eventos (empresa_id, conversa_id, tipo, autor_id, para_id, texto)
      values (c.empresa_id, c.id, 'atribuida', new.autor_id, new.autor_id, 'Assumiu ao responder');
      update public.clientes set responsavel_id = new.autor_id where id = c.cliente_id and responsavel_id is null;
    end if;
  end if;
  update public.clientes set ultima_interacao = new.criado_em where id = c.cliente_id;
  return new;
end $$;
drop trigger if exists ao_criar_mensagem on public.mensagens;
create trigger ao_criar_mensagem after insert on public.mensagens
  for each row execute function public.ao_criar_mensagem();

-- Mensagem no chat da equipe: atualiza a conversa e avisa os outros membros
create or replace function public.ao_criar_msg_equipe() returns trigger
language plpgsql security definer set search_path = public as $$
declare previa text; autor text; ec public.equipe_conversas;
begin
  previa := coalesce(nullif(new.texto, ''), case when new.midia_mime like 'image/%' then '📷 Foto' when new.midia_mime like 'video/%' then '🎬 Vídeo'
    when new.midia_mime like 'audio/%' then '🎤 Áudio' when new.midia_path is not null then '📄 ' || coalesce(new.midia_nome, 'Arquivo') else '' end);
  update public.equipe_conversas set ultima_msg_em = new.criado_em, ultima_msg_texto = left(previa, 200) where id = new.conversa_id returning * into ec;
  update public.equipe_membros set lido_em = new.criado_em where conversa_id = new.conversa_id and user_id = new.autor_id;
  select coalesce(nullif(nome, ''), email) into autor from public.perfis where id = new.autor_id;
  insert into public.notificacoes (user_id, empresa_id, tipo, titulo, texto, link)
  select m.user_id, new.empresa_id, 'equipe',
    case when ec.tipo = 'grupo' then coalesce(autor, '') || ' em ' || ec.nome else 'Mensagem de ' || coalesce(autor, '') end,
    left(previa, 200), 'equipe:' || new.conversa_id
  from public.equipe_membros m where m.conversa_id = new.conversa_id and m.user_id <> new.autor_id;
  return new;
end $$;
drop trigger if exists ao_criar_msg_equipe on public.equipe_mensagens;
create trigger ao_criar_msg_equipe after insert on public.equipe_mensagens
  for each row execute function public.ao_criar_msg_equipe();

-- Chamado novo avisa os administradores; resposta avisa quem abriu
create or replace function public.ao_mudar_chamado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notificacoes (user_id, empresa_id, tipo, titulo, texto, link)
    select p.id, new.empresa_id, 'chamado', 'Novo chamado: ' || new.titulo, new.descricao, 'chamado:' || new.id
    from public.perfis p where p.papel = 'admin' and p.ativo and p.id <> coalesce(new.autor_id, '00000000-0000-0000-0000-000000000000'::uuid);
  elsif new.status = 'resolvido' and old.status <> 'resolvido' then
    new.resolvido_em := now();
    perform public.notificar(new.autor_id, new.empresa_id, 'chamado', 'Chamado resolvido: ' || new.titulo, new.resposta, 'chamado:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists ao_criar_chamado on public.chamados;
create trigger ao_criar_chamado after insert on public.chamados for each row execute function public.ao_mudar_chamado();
drop trigger if exists ao_editar_chamado on public.chamados;
create trigger ao_editar_chamado before update on public.chamados for each row execute function public.ao_mudar_chamado();

-- =====================================================================
-- 4. AÇÕES (funções chamadas pelas telas, com as regras conferidas aqui)
-- =====================================================================

-- Atualiza o próprio perfil (nome, foto, status, preferências)
create or replace function public.atualizar_meu_perfil(p_nome text default null, p_foto_url text default null,
  p_presenca text default null, p_prefs jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  if p_presenca is not null and p_presenca not in ('online','ocupado','offline') then raise exception 'Status inválido.'; end if;
  update public.perfis set
    nome = coalesce(nullif(trim(p_nome), ''), nome),
    foto_url = case when p_foto_url is null then foto_url when p_foto_url = '' then null else p_foto_url end,
    presenca = coalesce(p_presenca, presenca),
    prefs = case when p_prefs is null then prefs else prefs || p_prefs end,
    visto_em = now()
  where id = auth.uid();
end $$;

create or replace function public.ping_presenca() returns void
language sql security definer set search_path = public as $$
  update public.perfis set visto_em = now() where id = auth.uid()
$$;

-- Configuração da empresa (tempo de resposta esperado)
create or replace function public.salvar_config_empresa(p_empresa uuid, p_sla int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.lider_da_empresa(p_empresa) then raise exception 'Só gerente ou administrador pode mudar isso.'; end if;
  update public.empresas set sla_minutos = greatest(1, least(coalesce(p_sla, 5), 1440)) where id = p_empresa;
end $$;

-- Começa (ou reabre) a conversa de um contato
create or replace function public.abrir_conversa(p_cliente uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cli public.clientes; cid uuid;
begin
  select * into cli from public.clientes where id = p_cliente;
  if cli.id is null or not public.acesso_empresa(cli.empresa_id)
     or not (public.pode_ver_pessoa(cli.responsavel_id) or cli.responsavel_id is null) then
    raise exception 'Contato não encontrado.';
  end if;
  select id into cid from public.conversas where cliente_id = cli.id;
  if cid is null then
    insert into public.conversas (empresa_id, cliente_id, responsavel_id, status)
    values (cli.empresa_id, cli.id, coalesce(cli.responsavel_id, case when public.meu_papel() <> 'admin' then auth.uid() end),
            case when coalesce(cli.responsavel_id, case when public.meu_papel() <> 'admin' then auth.uid() end) is null then 'fila' else 'ativo' end)
    returning id into cid;
    insert into public.conversa_eventos (empresa_id, conversa_id, tipo, autor_id, texto) values (cli.empresa_id, cid, 'criada', auth.uid(), 'Conversa iniciada');
  end if;
  return cid;
end $$;

-- Assumir uma conversa da fila
create or replace function public.assumir_conversa(p_conversa uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.conversas;
begin
  select * into c from public.conversas where id = p_conversa for update;
  if c.id is null or not public.pode_ver_conversa(c.id) then raise exception 'Conversa não encontrada.'; end if;
  if public.meu_papel() not in ('gerente','funcionario') then raise exception 'O administrador não atende conversas. Transfira para alguém da equipe.'; end if;
  if c.responsavel_id is not null and c.responsavel_id <> auth.uid() and not public.lider_da_empresa(c.empresa_id) then
    raise exception 'Essa conversa já tem responsável.';
  end if;
  update public.conversas set responsavel_id = auth.uid(), area_id = null,
    status = case when aguardando_desde is not null then 'aguardando_atendente' else 'ativo' end
  where id = c.id;
  update public.clientes set responsavel_id = auth.uid() where id = c.cliente_id and responsavel_id is null;
  update public.encaminhamentos set status = 'assumida', resolvido_por = auth.uid(), resolvido_em = now()
  where conversa_id = c.id and status = 'pendente';
  insert into public.conversa_eventos (empresa_id, conversa_id, tipo, autor_id, para_id, texto)
  values (c.empresa_id, c.id, 'atribuida', auth.uid(), auth.uid(), 'Assumiu o atendimento');
end $$;

-- Transferir para outra pessoa (ou devolver para a fila quando p_para é nulo)
create or replace function public.transferir_conversa(p_conversa uuid, p_para uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.conversas; nome_para text; nome_cli text;
begin
  select * into c from public.conversas where id = p_conversa for update;
  if c.id is null or not public.pode_ver_conversa(c.id) then raise exception 'Conversa não encontrada.'; end if;
  if p_para is not null and not public.pessoa_da_empresa(p_para, c.empresa_id) then raise exception 'Escolha alguém ativo da mesma empresa.'; end if;
  update public.conversas set responsavel_id = p_para, area_id = null,
    status = case when p_para is null then 'fila' when aguardando_desde is not null then 'aguardando_atendente' else 'ativo' end
  where id = c.id;
  update public.clientes set responsavel_id = p_para where id = c.cliente_id;
  update public.encaminhamentos set status = 'assumida', resolvido_por = auth.uid(), resolvido_em = now()
  where conversa_id = c.id and status = 'pendente';
  select coalesce(nullif(nome, ''), email) into nome_para from public.perfis where id = p_para;
  insert into public.conversa_eventos (empresa_id, conversa_id, tipo, autor_id, para_id, texto)
  values (c.empresa_id, c.id, case when p_para is null then 'devolvida_fila' else 'transferida' end, auth.uid(), p_para,
          case when p_para is null then 'Devolvida para aguardando atendimento' else 'Transferida para ' || nome_para end);
  if p_para is not null and p_para <> auth.uid() then
    select nome into nome_cli from public.clientes where id = c.cliente_id;
    perform public.notificar(p_para, c.empresa_id, 'transferencia', 'Conversa transferida para você', coalesce(nome_cli, ''), 'chat:' || c.id);
  end if;
end $$;

-- Mudar o status: ativo, aguardando cliente ou encerrada
create or replace function public.mudar_status_conversa(p_conversa uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.conversas;
begin
  if p_status not in ('ativo','aguardando_cliente','encerrada') then raise exception 'Status inválido.'; end if;
  select * into c from public.conversas where id = p_conversa for update;
  if c.id is null or not public.pode_ver_conversa(c.id) then raise exception 'Conversa não encontrada.'; end if;
  update public.conversas set status = p_status,
    responsavel_id = coalesce(responsavel_id, case when public.meu_papel() in ('gerente','funcionario') then auth.uid() end),
    encerrada_em = case when p_status = 'encerrada' then now() else null end,
    aguardando_desde = case when p_status = 'encerrada' then null else aguardando_desde end,
    nao_lidas = case when p_status = 'encerrada' then 0 else nao_lidas end
  where id = c.id;
  insert into public.conversa_eventos (empresa_id, conversa_id, tipo, autor_id, texto)
  values (c.empresa_id, c.id, case when p_status = 'encerrada' then 'encerrada' else 'status' end, auth.uid(),
          case p_status when 'encerrada' then 'Atendimento encerrado' when 'ativo' then 'Marcada como ativa' else 'Aguardando retorno do cliente' end);
end $$;

-- Encaminhar a conversa para a fila de uma área (sem aviso ao cliente)
create or replace function public.encaminhar_conversa(p_conversa uuid, p_area uuid, p_motivo text, p_prazo int) returns void
language plpgsql security definer set search_path = public as $$
declare c public.conversas; a public.areas; nome_cli text;
begin
  select * into c from public.conversas where id = p_conversa for update;
  if c.id is null or not public.pode_ver_conversa(c.id) then raise exception 'Conversa não encontrada.'; end if;
  select * into a from public.areas where id = p_area and empresa_id = c.empresa_id;
  if a.id is null then raise exception 'Escolha uma área válida.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Descreva o motivo.'; end if;
  insert into public.encaminhamentos (empresa_id, conversa_id, area_id, de_id, motivo, prazo_horas)
  values (c.empresa_id, c.id, a.id, auth.uid(), trim(p_motivo), greatest(1, coalesce(p_prazo, 4)));
  update public.conversas set responsavel_id = null, area_id = a.id, status = 'fila' where id = c.id;
  insert into public.conversa_eventos (empresa_id, conversa_id, tipo, autor_id, area_id, texto)
  values (c.empresa_id, c.id, 'encaminhada', auth.uid(), a.id, 'Encaminhada para ' || a.nome || ': ' || trim(p_motivo));
  select nome into nome_cli from public.clientes where id = c.cliente_id;
  insert into public.notificacoes (user_id, empresa_id, tipo, titulo, texto, link)
  select p.id, c.empresa_id, 'encaminhamento', 'Atendimento encaminhado para ' || a.nome, coalesce(nome_cli, '') || ': ' || trim(p_motivo), 'chat:' || c.id
  from public.perfis p where p.empresa_id = c.empresa_id and p.ativo and p.area_id = a.id and p.id <> auth.uid();
end $$;

-- Resolver uma pendência encaminhada: assumir, devolver para quem enviou ou recuperar (quem enviou pega de volta)
create or replace function public.resolver_encaminhamento(p_id uuid, p_acao text) returns void
language plpgsql security definer set search_path = public as $$
declare e public.encaminhamentos; novo uuid;
begin
  select * into e from public.encaminhamentos where id = p_id for update;
  if e.id is null or e.status <> 'pendente' then raise exception 'Essa pendência já foi resolvida.'; end if;
  if not public.acesso_empresa(e.empresa_id) then raise exception 'Sem acesso.'; end if;
  if p_acao = 'recuperar' then
    if e.de_id <> auth.uid() and not public.lider_da_empresa(e.empresa_id) then raise exception 'Só quem encaminhou pode recuperar.'; end if;
    novo := e.de_id;
  elsif p_acao = 'devolver' then
    if not (public.minha_area() = e.area_id or public.lider_da_empresa(e.empresa_id)) then raise exception 'Só a área de destino pode devolver.'; end if;
    novo := e.de_id;
  elsif p_acao = 'assumir' then
    if not (public.minha_area() = e.area_id or public.lider_da_empresa(e.empresa_id)) then raise exception 'Só a área de destino pode assumir.'; end if;
    if public.meu_papel() not in ('gerente','funcionario') then raise exception 'O administrador não atende conversas.'; end if;
    novo := auth.uid();
  else raise exception 'Ação inválida.'; end if;
  if novo is null or not public.pessoa_da_empresa(novo, e.empresa_id) then raise exception 'A pessoa de destino não está mais ativa.'; end if;
  update public.encaminhamentos set status = case p_acao when 'assumir' then 'assumida' when 'devolver' then 'devolvida' else 'recuperada' end,
    resolvido_por = auth.uid(), resolvido_em = now() where id = e.id;
  update public.conversas set responsavel_id = novo, area_id = null,
    status = case when aguardando_desde is not null then 'aguardando_atendente' else 'ativo' end where id = e.conversa_id;
  update public.clientes set responsavel_id = novo where id = (select cliente_id from public.conversas where id = e.conversa_id);
  insert into public.conversa_eventos (empresa_id, conversa_id, tipo, autor_id, para_id, texto)
  values (e.empresa_id, e.conversa_id, 'atribuida', auth.uid(), novo,
          case p_acao when 'assumir' then 'Área assumiu o atendimento' when 'devolver' then 'Devolvida para quem encaminhou' else 'Recuperada por quem encaminhou' end);
  if novo <> auth.uid() then
    perform public.notificar(novo, e.empresa_id, 'transferencia', 'Atendimento voltou para você', '', 'chat:' || e.conversa_id);
  end if;
end $$;

-- Cria conversa do chat da equipe (direta reaproveita a que já existe)
create or replace function public.criar_conversa_equipe(p_empresa uuid, p_tipo text, p_nome text, p_membros uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; m uuid; outros uuid[];
begin
  if not public.acesso_empresa(p_empresa) then raise exception 'Sem acesso a essa empresa.'; end if;
  outros := array(select distinct x from unnest(coalesce(p_membros, '{}')) x where x <> auth.uid());
  if array_length(outros, 1) is null then raise exception 'Escolha pelo menos uma pessoa.'; end if;
  foreach m in array outros loop
    if not exists (select 1 from public.perfis where id = m and ativo and (empresa_id = p_empresa or papel = 'admin')) then
      raise exception 'Só dá para conversar com pessoas ativas da empresa.';
    end if;
  end loop;
  if p_tipo = 'direta' then
    if array_length(outros, 1) <> 1 then raise exception 'Conversa direta é com uma pessoa só.'; end if;
    select c.id into cid from public.equipe_conversas c
    where c.empresa_id = p_empresa and c.tipo = 'direta'
      and exists (select 1 from public.equipe_membros where conversa_id = c.id and user_id = auth.uid())
      and exists (select 1 from public.equipe_membros where conversa_id = c.id and user_id = outros[1])
    limit 1;
    if cid is not null then return cid; end if;
  elsif p_tipo = 'grupo' then
    if coalesce(trim(p_nome), '') = '' then raise exception 'Dê um nome ao grupo.'; end if;
  else raise exception 'Tipo inválido.'; end if;
  insert into public.equipe_conversas (empresa_id, tipo, nome, criado_por)
  values (p_empresa, p_tipo, case when p_tipo = 'grupo' then trim(p_nome) else '' end, auth.uid()) returning id into cid;
  insert into public.equipe_membros (conversa_id, user_id) select cid, x from unnest(outros || auth.uid()) x;
  return cid;
end $$;

-- Adicionar/remover pessoas de um grupo (quem criou o grupo, ou gerente/administrador)
create or replace function public.membros_grupo(p_conversa uuid, p_add uuid[], p_remover uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare c public.equipe_conversas;
begin
  select * into c from public.equipe_conversas where id = p_conversa;
  if c.id is null or c.tipo <> 'grupo' or not public.sou_membro(c.id) then raise exception 'Grupo não encontrado.'; end if;
  if c.criado_por <> auth.uid() and not public.lider_da_empresa(c.empresa_id) then raise exception 'Só quem criou o grupo pode mudar os participantes.'; end if;
  insert into public.equipe_membros (conversa_id, user_id)
  select c.id, x from unnest(coalesce(p_add, '{}')) x
  where exists (select 1 from public.perfis where id = x and ativo and (empresa_id = c.empresa_id or papel = 'admin'))
  on conflict do nothing;
  delete from public.equipe_membros where conversa_id = c.id and user_id = any(coalesce(p_remover, '{}')) and user_id <> auth.uid();
end $$;

-- Números do painel (respeita as regras de acesso de quem está vendo)
create or replace function public.painel_metricas(p_empresa uuid, p_inicio date, p_fim date, p_pessoa uuid default null,
  p_etiqueta uuid default null, p_status text default null) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  ini timestamptz := p_inicio::timestamptz; fim timestamptz := (p_fim + 1)::timestamptz;
  sla int; eu uuid := auth.uid(); res jsonb;
begin
  select sla_minutos into sla from public.empresas where id = p_empresa;
  sla := coalesce(sla, 5);
  with
  conv as (
    select c.* from public.conversas c
    where c.empresa_id = p_empresa
      and (p_pessoa is null or c.responsavel_id = p_pessoa)
      and (p_status is null or c.status = p_status)
      and (p_etiqueta is null or exists (select 1 from public.cliente_etiquetas ce where ce.cliente_id = c.cliente_id and ce.etiqueta_id = p_etiqueta))
  ),
  ped as (
    select p.* from public.pedidos p
    where p.empresa_id = p_empresa and p.criado_em >= ini and p.criado_em < fim
      and (p_pessoa is null or p.responsavel_id = p_pessoa)
      and (p_etiqueta is null or exists (select 1 from public.cliente_etiquetas ce where ce.cliente_id = p.cliente_id and ce.etiqueta_id = p_etiqueta))
  ),
  ev as (
    select e.* from public.conversa_eventos e join conv on conv.id = e.conversa_id
    where e.criado_em >= ini and e.criado_em < fim
  ),
  resp as (
    select r.* from public.respostas r join conv on conv.id = r.conversa_id
    where r.criado_em >= ini and r.criado_em < fim and (p_pessoa is null or r.responsavel_id = p_pessoa)
  ),
  msgs as (
    select m.conversa_id, (m.criado_em at time zone 'America/Sao_Paulo')::date dia from public.mensagens m join conv on conv.id = m.conversa_id
    where m.criado_em >= ini and m.criado_em < fim
  ),
  cli as (
    select k.* from public.clientes k
    where k.empresa_id = p_empresa and (p_pessoa is null or k.responsavel_id = p_pessoa)
      and (p_etiqueta is null or exists (select 1 from public.cliente_etiquetas ce where ce.cliente_id = k.id and ce.etiqueta_id = p_etiqueta))
  ),
  atrib as (select distinct conversa_id from ev where tipo in ('atribuida','transferida') and (p_pessoa is null or para_id = p_pessoa)),
  encer as (select distinct conversa_id from ev where tipo = 'encerrada' and (p_pessoa is null or autor_id = p_pessoa)),
  cham as (
    select ch.* from public.chamados ch where ch.empresa_id = p_empresa and ch.criado_em >= ini and ch.criado_em < fim
      and (p_pessoa is null or ch.autor_id = p_pessoa)
  )
  select jsonb_build_object(
    'sla_minutos', sla,
    'pedidos', (select count(*) from ped),
    'pedidos_validos', (select count(*) from ped where status <> 'cancelado'),
    'pedidos_valor', (select coalesce(sum(total), 0) from ped where status <> 'cancelado'),
    'em_atendimento', (select count(*) from conv where status = 'ativo' and responsavel_id is not null),
    'aguardando_resposta', (select count(*) from conv where status = 'aguardando_atendente' and responsavel_id is not null),
    'aguardando_cliente', (select count(*) from conv where status = 'aguardando_cliente'),
    'na_fila', (select count(*) from conv where status = 'fila'),
    'abertas_agora', (select count(*) from conv where status <> 'encerrada'),
    'encerradas_periodo', (select count(*) from ev where tipo = 'encerrada' and (p_pessoa is null or autor_id = p_pessoa)),
    'contatos_ativos', (select count(distinct conversa_id) from msgs),
    'contatos_novos', (select count(*) from cli where criado_em >= ini and criado_em < fim),
    'contatos_total', (select count(*) from cli),
    'atribuidas', (select count(*) from atrib),
    'resolvidas', (select count(*) from atrib where conversa_id in (select conversa_id from encer)),
    'respostas', (select count(*) from resp),
    'respostas_no_prazo', (select count(*) from resp where esperou_seg <= sla * 60),
    'tempo_medio_seg', (select coalesce(round(avg(esperou_seg)), 0) from resp),
    'esperando', (select coalesce(jsonb_agg(x order by x->>'desde'), '[]') from (
        select jsonb_build_object('conversa_id', c.id, 'nome', k.nome, 'status', c.status, 'desde', coalesce(c.aguardando_desde, c.ultima_msg_em)) x
        from conv c join public.clientes k on k.id = c.cliente_id
        where c.status in ('fila','aguardando_atendente','aguardando_cliente')
        order by coalesce(c.aguardando_desde, c.ultima_msg_em) asc nulls last limit 5) s),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', d::date, 'n', coalesce(n, 0)) order by d), '[]') from
        generate_series(p_inicio, p_fim, interval '1 day') d
        left join (select dia, count(distinct conversa_id) n from msgs group by dia) q on q.dia = d::date),
    'ranking', (select coalesce(jsonb_agg(jsonb_build_object('pessoa', responsavel_id, 'n', n, 'valor', v) order by n desc), '[]') from
        (select responsavel_id, count(*) n, sum(total) v from ped where status <> 'cancelado' group by responsavel_id) r),
    'chamados', (select count(*) from cham),
    'chamados_abertos', (select count(*) from cham where status = 'aberto'),
    'chamados_resolvidos', (select count(*) from cham where status = 'resolvido')
  ) into res;
  return res;
end $$;

-- =====================================================================
-- 5. REGRAS DE ACESSO (Row Level Security)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['empresas','areas','perfis','clientes','negocios','etiquetas','cliente_etiquetas','conversas','mensagens',
    'mensagem_favoritas','conversa_favoritas','conversa_eventos','respostas','encaminhamentos','pedidos','tarefas','mensagens_rapidas',
    'pastas','arquivos','equipe_conversas','equipe_membros','equipe_mensagens','equipe_favoritas','ordens_servico','chamados',
    'notificacoes','whatsapp_contas','whatsapp_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    -- ninguém sem login enxerga nada; quem tem login só faz o que as regras abaixo permitirem
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
  end loop;
end $$;

-- Empresas: admin vê e mexe em todas; os outros só enxergam a própria.
drop policy if exists empresas_ver on public.empresas;
create policy empresas_ver on public.empresas for select to authenticated
  using (public.meu_papel() = 'admin' or id = public.minha_empresa());
drop policy if exists empresas_admin on public.empresas;
create policy empresas_admin on public.empresas for all to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');
grant select, insert, update, delete on public.empresas to authenticated;

-- Áreas: todos da empresa veem; gerente e admin mudam
drop policy if exists areas_ver on public.areas;
create policy areas_ver on public.areas for select to authenticated using (public.acesso_empresa(empresa_id));
drop policy if exists areas_editar on public.areas;
create policy areas_editar on public.areas for all to authenticated
  using (public.lider_da_empresa(empresa_id)) with check (public.lider_da_empresa(empresa_id));
grant select, insert, update, delete on public.areas to authenticated;

-- Perfis: a pessoa vê quem ela gerencia e também a lista de colegas da mesma empresa
-- (nome, foto e status, para transferir conversas e usar o chat da equipe).
-- Criar, editar e desativar logins passa obrigatoriamente pelo servidor (/api/usuarios).
drop policy if exists perfis_ver on public.perfis;
create policy perfis_ver on public.perfis for select to authenticated
  using (public.pode_ver_pessoa(id) or (empresa_id is not null and empresa_id = public.minha_empresa()));
grant select on public.perfis to authenticated;

-- Contatos: dono do contato e quem o gerencia; contatos sem dono (fila) são vistos pela empresa toda
drop policy if exists clientes_ver on public.clientes;
create policy clientes_ver on public.clientes for select to authenticated
  using (public.acesso_empresa(empresa_id) and (public.pode_ver_pessoa(responsavel_id) or responsavel_id is null));
drop policy if exists clientes_criar on public.clientes;
create policy clientes_criar on public.clientes for insert to authenticated
  with check (public.acesso_empresa(empresa_id) and (responsavel_id is null
    or (public.pode_ver_pessoa(responsavel_id) and public.pessoa_da_empresa(responsavel_id, empresa_id))));
drop policy if exists clientes_editar on public.clientes;
create policy clientes_editar on public.clientes for update to authenticated
  using (public.acesso_empresa(empresa_id) and (public.pode_ver_pessoa(responsavel_id) or responsavel_id is null))
  with check (public.acesso_empresa(empresa_id) and (responsavel_id is null
    or (public.pode_ver_pessoa(responsavel_id) and public.pessoa_da_empresa(responsavel_id, empresa_id))));
drop policy if exists clientes_apagar on public.clientes;
create policy clientes_apagar on public.clientes for delete to authenticated
  using (public.acesso_empresa(empresa_id) and (public.pode_ver_pessoa(responsavel_id) or (responsavel_id is null and public.lider_da_empresa(empresa_id))));
grant select, insert, update, delete on public.clientes to authenticated;

-- Negócios, lembretes, pedidos e ordens de serviço: mesma regra (dono e quem o gerencia)
do $$
declare t text;
begin
  foreach t in array array['negocios','tarefas','pedidos','ordens_servico'] loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format($p$
      create policy %1$s_ver on public.%1$s for select to authenticated
      using (public.pode_ver_pessoa(responsavel_id) and public.acesso_empresa(empresa_id))$p$, t);
    execute format('drop policy if exists %1$s_criar on public.%1$s', t);
    execute format($p$
      create policy %1$s_criar on public.%1$s for insert to authenticated
      with check (public.pode_ver_pessoa(responsavel_id) and public.pessoa_da_empresa(responsavel_id, empresa_id)
                  and public.acesso_empresa(empresa_id))$p$, t);
    execute format('drop policy if exists %1$s_editar on public.%1$s', t);
    execute format($p$
      create policy %1$s_editar on public.%1$s for update to authenticated
      using (public.pode_ver_pessoa(responsavel_id) and public.acesso_empresa(empresa_id))
      with check (public.pode_ver_pessoa(responsavel_id) and public.pessoa_da_empresa(responsavel_id, empresa_id)
                  and public.acesso_empresa(empresa_id))$p$, t);
    execute format('drop policy if exists %1$s_apagar on public.%1$s', t);
    execute format($p$
      create policy %1$s_apagar on public.%1$s for delete to authenticated
      using (public.pode_ver_pessoa(responsavel_id) and public.acesso_empresa(empresa_id))$p$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Etiquetas: todos da empresa veem; só gerente e admin criam/editam/apagam
drop policy if exists etiquetas_ver on public.etiquetas;
create policy etiquetas_ver on public.etiquetas for select to authenticated using (public.acesso_empresa(empresa_id));
drop policy if exists etiquetas_editar on public.etiquetas;
create policy etiquetas_editar on public.etiquetas for all to authenticated
  using (public.lider_da_empresa(empresa_id)) with check (public.lider_da_empresa(empresa_id));
grant select, insert, update, delete on public.etiquetas to authenticated;

-- Etiqueta de contato: quem vê o contato põe e tira etiquetas
drop policy if exists cli_etq_ver on public.cliente_etiquetas;
create policy cli_etq_ver on public.cliente_etiquetas for select to authenticated
  using (exists (select 1 from public.clientes k where k.id = cliente_id));
drop policy if exists cli_etq_por on public.cliente_etiquetas;
create policy cli_etq_por on public.cliente_etiquetas for insert to authenticated
  with check (exists (select 1 from public.clientes k where k.id = cliente_id and k.empresa_id = cliente_etiquetas.empresa_id)
    and exists (select 1 from public.etiquetas e where e.id = etiqueta_id and e.empresa_id = cliente_etiquetas.empresa_id));
drop policy if exists cli_etq_tirar on public.cliente_etiquetas;
create policy cli_etq_tirar on public.cliente_etiquetas for delete to authenticated
  using (exists (select 1 from public.clientes k where k.id = cliente_id));
grant select, insert, delete on public.cliente_etiquetas to authenticated;

-- Conversas: dono e quem o gerencia; conversas na fila são vistas pela empresa (ou pela área de destino)
drop policy if exists conversas_ver on public.conversas;
create policy conversas_ver on public.conversas for select to authenticated
  using (public.pode_ver_conversa_reg(empresa_id, responsavel_id, area_id));
-- pelas telas só dá para mudar arquivada, fixada e lida; trocar responsável/status é pelas ações acima
drop policy if exists conversas_editar on public.conversas;
create policy conversas_editar on public.conversas for update to authenticated
  using (public.pode_ver_conversa_reg(empresa_id, responsavel_id, area_id))
  with check (public.pode_ver_conversa_reg(empresa_id, responsavel_id, area_id));
drop policy if exists conversas_apagar on public.conversas;
create policy conversas_apagar on public.conversas for delete to authenticated using (public.lider_da_empresa(empresa_id));
grant select, delete on public.conversas to authenticated;
grant update (arquivada, fixada, nao_lidas) on public.conversas to authenticated;

-- Mensagens: só leitura pelas telas. Enviar passa pelo servidor (/api/enviar), que manda para o WhatsApp.
drop policy if exists mensagens_ver on public.mensagens;
create policy mensagens_ver on public.mensagens for select to authenticated using (public.pode_ver_conversa(conversa_id));
grant select on public.mensagens to authenticated;

drop policy if exists msg_fav_minhas on public.mensagem_favoritas;
create policy msg_fav_minhas on public.mensagem_favoritas for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.pode_ver_conversa((select conversa_id from public.mensagens where id = mensagem_id)));
grant select, insert, delete on public.mensagem_favoritas to authenticated;

drop policy if exists conv_fav_minhas on public.conversa_favoritas;
create policy conv_fav_minhas on public.conversa_favoritas for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.pode_ver_conversa(conversa_id));
grant select, insert, delete on public.conversa_favoritas to authenticated;

drop policy if exists eventos_ver on public.conversa_eventos;
create policy eventos_ver on public.conversa_eventos for select to authenticated using (public.pode_ver_conversa(conversa_id));
grant select on public.conversa_eventos to authenticated;

drop policy if exists respostas_ver on public.respostas;
create policy respostas_ver on public.respostas for select to authenticated
  using (public.acesso_empresa(empresa_id) and public.pode_ver_pessoa(responsavel_id));
grant select on public.respostas to authenticated;

drop policy if exists enc_ver on public.encaminhamentos;
create policy enc_ver on public.encaminhamentos for select to authenticated
  using (public.acesso_empresa(empresa_id) and (de_id = auth.uid() or area_id = public.minha_area() or public.lider_da_empresa(empresa_id)));
grant select on public.encaminhamentos to authenticated;

-- Mensagens rápidas: cada um só vê as suas
drop policy if exists rapidas_minhas on public.mensagens_rapidas;
create policy rapidas_minhas on public.mensagens_rapidas for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.mensagens_rapidas to authenticated;

-- Galeria: privada (só o dono), equipe (mesmo gerente) ou empresa toda. Admin vê tudo.
drop policy if exists pastas_ver on public.pastas;
create policy pastas_ver on public.pastas for select to authenticated
  using (public.acesso_empresa(empresa_id) and (dono_id = auth.uid() or visibilidade = 'empresa'
    or (visibilidade = 'equipe' and public.mesmo_time(dono_id, auth.uid())) or public.meu_papel() = 'admin'));
drop policy if exists pastas_criar on public.pastas;
create policy pastas_criar on public.pastas for insert to authenticated
  with check (dono_id = auth.uid() and public.acesso_empresa(empresa_id));
drop policy if exists pastas_editar on public.pastas;
create policy pastas_editar on public.pastas for update to authenticated
  using (dono_id = auth.uid() or public.lider_da_empresa(empresa_id)) with check (public.acesso_empresa(empresa_id));
drop policy if exists pastas_apagar on public.pastas;
create policy pastas_apagar on public.pastas for delete to authenticated
  using (dono_id = auth.uid() or public.lider_da_empresa(empresa_id));
grant select, insert, update, delete on public.pastas to authenticated;

drop policy if exists arquivos_ver on public.arquivos;
create policy arquivos_ver on public.arquivos for select to authenticated
  using (public.acesso_empresa(empresa_id) and (dono_id = auth.uid() or visibilidade = 'empresa'
    or (visibilidade = 'equipe' and public.mesmo_time(dono_id, auth.uid())) or public.meu_papel() = 'admin'));
drop policy if exists arquivos_criar on public.arquivos;
create policy arquivos_criar on public.arquivos for insert to authenticated
  with check (dono_id = auth.uid() and public.acesso_empresa(empresa_id));
drop policy if exists arquivos_editar on public.arquivos;
create policy arquivos_editar on public.arquivos for update to authenticated
  using (dono_id = auth.uid() or public.lider_da_empresa(empresa_id)) with check (public.acesso_empresa(empresa_id));
drop policy if exists arquivos_apagar on public.arquivos;
create policy arquivos_apagar on public.arquivos for delete to authenticated
  using (dono_id = auth.uid() or public.lider_da_empresa(empresa_id));
grant select, insert, update, delete on public.arquivos to authenticated;

-- Chat da equipe: só os participantes
drop policy if exists eqconv_ver on public.equipe_conversas;
create policy eqconv_ver on public.equipe_conversas for select to authenticated using (public.sou_membro(id));
drop policy if exists eqconv_renomear on public.equipe_conversas;
create policy eqconv_renomear on public.equipe_conversas for update to authenticated
  using (public.sou_membro(id) and tipo = 'grupo') with check (public.sou_membro(id) and tipo = 'grupo');
grant select on public.equipe_conversas to authenticated;
grant update (nome) on public.equipe_conversas to authenticated;

drop policy if exists eqmemb_ver on public.equipe_membros;
create policy eqmemb_ver on public.equipe_membros for select to authenticated using (public.sou_membro(conversa_id));
drop policy if exists eqmemb_lido on public.equipe_membros;
create policy eqmemb_lido on public.equipe_membros for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists eqmemb_sair on public.equipe_membros;
create policy eqmemb_sair on public.equipe_membros for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.equipe_membros to authenticated;
grant update (lido_em) on public.equipe_membros to authenticated;

drop policy if exists eqmsg_ver on public.equipe_mensagens;
create policy eqmsg_ver on public.equipe_mensagens for select to authenticated using (public.sou_membro(conversa_id));
drop policy if exists eqmsg_enviar on public.equipe_mensagens;
create policy eqmsg_enviar on public.equipe_mensagens for insert to authenticated
  with check (autor_id = auth.uid() and public.sou_membro(conversa_id)
    and empresa_id = (select empresa_id from public.equipe_conversas where id = conversa_id));
grant select, insert on public.equipe_mensagens to authenticated;

drop policy if exists eqfav_minhas on public.equipe_favoritas;
create policy eqfav_minhas on public.equipe_favoritas for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.equipe_favoritas to authenticated;

-- Chamados: quem abriu, os gerentes da empresa e o administrador
drop policy if exists chamados_ver on public.chamados;
create policy chamados_ver on public.chamados for select to authenticated
  using (public.acesso_empresa(empresa_id) and (autor_id = auth.uid() or public.lider_da_empresa(empresa_id)));
drop policy if exists chamados_criar on public.chamados;
create policy chamados_criar on public.chamados for insert to authenticated
  with check (autor_id = auth.uid() and public.acesso_empresa(empresa_id) and status = 'aberto');
drop policy if exists chamados_responder on public.chamados;
create policy chamados_responder on public.chamados for update to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');
grant select, insert, update on public.chamados to authenticated;

-- Notificações: cada um só as suas
drop policy if exists notif_minhas on public.notificacoes;
create policy notif_minhas on public.notificacoes for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_lidas on public.notificacoes;
create policy notif_lidas on public.notificacoes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_apagar on public.notificacoes;
create policy notif_apagar on public.notificacoes for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.notificacoes to authenticated;
grant update (lida) on public.notificacoes to authenticated;

-- WhatsApp: a empresa vê se está conectada; o token ninguém lê pelas telas (sem regra = sem acesso)
drop policy if exists wa_ver on public.whatsapp_contas;
create policy wa_ver on public.whatsapp_contas for select to authenticated using (public.acesso_empresa(empresa_id));
grant select on public.whatsapp_contas to authenticated;

-- Funções: só quem tem login pode chamar
do $$
declare f text;
begin
  foreach f in array array['atualizar_meu_perfil(text,text,text,jsonb)','ping_presenca()','salvar_config_empresa(uuid,int)',
    'abrir_conversa(uuid)','assumir_conversa(uuid)','transferir_conversa(uuid,uuid)','mudar_status_conversa(uuid,text)',
    'encaminhar_conversa(uuid,uuid,text,int)','resolver_encaminhamento(uuid,text)','criar_conversa_equipe(uuid,text,text,uuid[])',
    'membros_grupo(uuid,uuid[],uuid[])','painel_metricas(uuid,date,date,uuid,uuid,text)','notificar(uuid,uuid,text,text,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- notificar só é usada por dentro do banco
  execute 'revoke all on function public.notificar(uuid,uuid,text,text,text,text) from authenticated';
end $$;

-- =====================================================================
-- 6. ARQUIVOS (fotos de perfil, galeria e mídias das conversas)
-- =====================================================================
-- (fica dentro de um bloco protegido: se o Supabase não deixar criar alguma regra,
--  o resto continua e o resultado no fim avisa)
create table if not exists public._instalacao (chave text primary key, valor text);
do $arq$
begin
  insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true) on conflict (id) do nothing;
  insert into storage.buckets (id, name, public) values ('arquivos', 'arquivos', false) on conflict (id) do nothing;

  -- fotos de perfil: cada um mexe só na própria pasta (nome = id do usuário)
  drop policy if exists "fotos ver" on storage.objects;
  create policy "fotos ver" on storage.objects for select to authenticated using (bucket_id = 'fotos');
  drop policy if exists "fotos enviar" on storage.objects;
  create policy "fotos enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists "fotos trocar" on storage.objects;
  create policy "fotos trocar" on storage.objects for update to authenticated
    using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists "fotos apagar" on storage.objects;
  create policy "fotos apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

  -- arquivos da empresa: a primeira pasta do caminho é o id da empresa
  drop policy if exists "arquivos ver" on storage.objects;
  create policy "arquivos ver" on storage.objects for select to authenticated
    using (bucket_id = 'arquivos' and public.acesso_empresa(public.empresa_do_caminho(name)));
  drop policy if exists "arquivos enviar" on storage.objects;
  create policy "arquivos enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'arquivos' and public.acesso_empresa(public.empresa_do_caminho(name)));
  drop policy if exists "arquivos apagar" on storage.objects;
  create policy "arquivos apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'arquivos' and public.acesso_empresa(public.empresa_do_caminho(name))
      and (owner = auth.uid() or public.lider_da_empresa(public.empresa_do_caminho(name))));
  insert into public._instalacao values ('arquivos', 'ok') on conflict (chave) do update set valor = 'ok';
exception when others then
  insert into public._instalacao values ('arquivos', sqlerrm) on conflict (chave) do update set valor = excluded.valor;
end $arq$;

-- =====================================================================
-- 7. TEMPO REAL (as telas se atualizam sozinhas)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['conversas','mensagens','notificacoes','equipe_mensagens','equipe_conversas','encaminhamentos'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

-- =====================================================================
-- 8. RESULTADO (aparece embaixo, depois de clicar em Run)
-- =====================================================================
alter table public._instalacao enable row level security;
revoke all on public._instalacao from anon, authenticated;
select case when (select valor from public._instalacao where chave = 'arquivos') = 'ok'
  then 'Tudo certo! Banco do CRM Balcão atualizado (versão 2).'
  else 'Banco atualizado, MAS as regras de arquivos não foram criadas: ' || coalesce((select valor from public._instalacao where chave = 'arquivos'), '?') || '. Mande um print disso para o suporte.'
  end as resultado;
