// Cria, edita e desativa logins respeitando a hierarquia:
//   admin   -> cria gerente ou funcionário em qualquer empresa
//   gerente -> cria funcionário só na própria equipe
// Roda na Vercel. Usa a chave secreta do Supabase (service role), que
// nunca vai para o navegador.
import { createClient } from '@supabase/supabase-js';

const URL = (String(process.env.SUPABASE_URL || '').trim().match(/^https?:\/\/[^\/\s]+/i) || [''])[0];
const SERVICE = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function falha(res, status, erro) {
  return res.status(status).json({ erro });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return falha(res, 405, 'Método não permitido.');
  if (!URL || !SERVICE) {
    return falha(res, 500, 'Servidor sem configuração: cadastre SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.');
  }
  const sb = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  // Quem está pedindo?
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return falha(res, 401, 'Faça login de novo.');
  const { data: auth, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !auth?.user) return falha(res, 401, 'Sua sessão expirou. Faça login de novo.');

  const { data: eu } = await sb.from('perfis').select('*').eq('id', auth.user.id).maybeSingle();
  if (!eu || !eu.ativo || !['admin', 'gerente'].includes(eu.papel)) {
    return falha(res, 403, 'Só administrador ou gerente pode gerenciar logins.');
  }

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  try {
    if (body.acao === 'criar') return await criar(sb, eu, body, res);
    if (body.acao === 'atualizar') return await atualizar(sb, eu, body, res);
    return falha(res, 400, 'Ação desconhecida.');
  } catch (e) {
    console.error(e);
    return falha(res, 500, 'Erro inesperado no servidor. Tente de novo.');
  }
}

async function gerenteValido(sb, gerenteId, empresaId) {
  if (!gerenteId) return false;
  const { data } = await sb.from('perfis').select('id,papel,empresa_id,ativo').eq('id', gerenteId).maybeSingle();
  return !!data && data.papel === 'gerente' && data.empresa_id === empresaId && data.ativo;
}

async function criar(sb, eu, b, res) {
  const nome = String(b.nome || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const senha = String(b.senha || '');
  let { papel, empresa_id, gerente_id } = b;

  if (!nome) return falha(res, 400, 'Informe o nome.');
  if (!EMAIL_RE.test(email)) return falha(res, 400, 'E-mail inválido.');
  if (senha.length < 8) return falha(res, 400, 'A senha precisa ter pelo menos 8 caracteres.');

  if (eu.papel === 'gerente') {
    // Gerente só cria funcionário, sempre na própria equipe.
    papel = 'funcionario';
    empresa_id = eu.empresa_id;
    gerente_id = eu.id;
  } else {
    if (!['gerente', 'funcionario'].includes(papel)) return falha(res, 400, 'Escolha gerente ou funcionário.');
    const { data: emp } = await sb.from('empresas').select('id').eq('id', empresa_id || '').maybeSingle();
    if (!emp) return falha(res, 400, 'Escolha uma empresa válida.');
    if (papel === 'gerente') gerente_id = null;
    else if (!(await gerenteValido(sb, gerente_id, empresa_id))) {
      return falha(res, 400, 'Escolha o gerente desse funcionário (precisa ser um gerente ativo da mesma empresa).');
    }
  }

  const { data: criado, error } = await sb.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { nome },
  });
  if (error || !criado?.user) {
    const msg = /already|registered|exists/i.test(error?.message || '')
      ? 'Já existe um login com esse e-mail.'
      : 'Não foi possível criar o login: ' + (error?.message || 'erro desconhecido');
    return falha(res, 400, msg);
  }

  const { error: perfilErr } = await sb.from('perfis').upsert({
    id: criado.user.id, nome, email, papel, empresa_id, gerente_id, ativo: true,
  });
  if (perfilErr) {
    await sb.auth.admin.deleteUser(criado.user.id); // desfaz para não sobrar login sem papel
    return falha(res, 500, 'Não foi possível salvar o perfil: ' + perfilErr.message);
  }
  return res.status(200).json({ ok: true, id: criado.user.id });
}

async function atualizar(sb, eu, b, res) {
  const { data: alvo } = await sb.from('perfis').select('*').eq('id', b.id || '').maybeSingle();
  if (!alvo) return falha(res, 404, 'Pessoa não encontrada.');
  if (alvo.papel === 'admin') return falha(res, 403, 'O login de administrador não pode ser alterado por aqui.');

  if (eu.papel === 'gerente') {
    const daEquipe = alvo.papel === 'funcionario' && alvo.gerente_id === eu.id && alvo.empresa_id === eu.empresa_id;
    if (!daEquipe) return falha(res, 403, 'Você só pode alterar funcionários da sua equipe.');
  }

  const mudancas = {};
  if (typeof b.nome === 'string' && b.nome.trim()) mudancas.nome = b.nome.trim();
  if (typeof b.ativo === 'boolean') mudancas.ativo = b.ativo;
  if (eu.papel === 'admin' && b.gerente_id !== undefined && alvo.papel === 'funcionario') {
    if (!(await gerenteValido(sb, b.gerente_id, alvo.empresa_id))) {
      return falha(res, 400, 'O novo gerente precisa ser um gerente ativo da mesma empresa.');
    }
    mudancas.gerente_id = b.gerente_id;
  }
  if (b.senha !== undefined && b.senha !== '') {
    if (String(b.senha).length < 8) return falha(res, 400, 'A senha precisa ter pelo menos 8 caracteres.');
  }

  if (Object.keys(mudancas).length) {
    const { error } = await sb.from('perfis').update(mudancas).eq('id', alvo.id);
    if (error) return falha(res, 500, 'Não foi possível salvar: ' + error.message);
  }

  const authMud = {};
  if (b.senha) authMud.password = String(b.senha);
  if (typeof b.ativo === 'boolean') authMud.ban_duration = b.ativo ? 'none' : '876000h';
  if (Object.keys(authMud).length) {
    const { error } = await sb.auth.admin.updateUserById(alvo.id, authMud);
    if (error) return falha(res, 500, 'Perfil salvo, mas não consegui atualizar o login: ' + error.message);
  }
  return res.status(200).json({ ok: true });
}
