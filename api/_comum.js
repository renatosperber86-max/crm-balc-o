// Peças comuns dos servidores (arquivos com _ na frente não viram rota na Vercel).
import { createClient } from '@supabase/supabase-js';

export const SUPA_URL = (String(process.env.SUPABASE_URL || '').trim().match(/^https?:\/\/[^\/\s]+/i) || [''])[0];
export const SERVICE = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
export const ANON = String(process.env.SUPABASE_ANON_KEY || '').trim();
export const GRAPH = 'https://graph.facebook.com/' + (String(process.env.WHATSAPP_GRAPH_VERSION || '').trim() || 'v23.0');

export const configurado = () => !!(SUPA_URL && SERVICE && ANON);
// cliente com a chave secreta: ignora as regras de acesso, então só usar depois de conferir quem é o usuário
export const admin = () => createClient(SUPA_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
// cliente com o login do usuário: as regras de acesso do banco valem normalmente
export const comoUsuario = (token) => createClient(SUPA_URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: 'Bearer ' + token } },
});

export function falha(res, status, erro) { return res.status(status).json({ erro }); }
export function corpo(req) {
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b;
}

// Confere o login de quem chamou e devolve { token, user, perfil } ou responde com erro
export async function quemChamou(req, res, sb) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { falha(res, 401, 'Faça login de novo.'); return null; }
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) { falha(res, 401, 'Sua sessão expirou. Faça login de novo.'); return null; }
  const { data: perfil } = await sb.from('perfis').select('*').eq('id', data.user.id).maybeSingle();
  if (!perfil || !perfil.ativo || perfil.papel === 'pendente') { falha(res, 403, 'Seu login não tem acesso.'); return null; }
  return { token, user: data.user, perfil };
}

// variantes de número brasileiro com e sem o 9 (o WhatsApp às vezes manda sem)
export function variantesNumero(wa) {
  const d = String(wa || '').replace(/\D/g, '');
  const out = new Set([d]);
  if (d.startsWith('55') && d.length === 12) out.add(d.slice(0, 4) + '9' + d.slice(4));
  if (d.startsWith('55') && d.length === 13 && d[4] === '9') out.add(d.slice(0, 4) + d.slice(5));
  return [...out];
}
export function telefoneBonito(d) {
  d = String(d || '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith('55')) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return '+' + d;
}
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/3gpp': '3gp', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'application/pdf': 'pdf' };
export const extDe = (mime, nome) => (nome && /\.[a-z0-9]{1,5}$/i.test(nome) ? nome.split('.').pop() : EXT[String(mime || '').split(';')[0]] || 'bin');

const TIPO_WA = { imagem: 'image', video: 'video', audio: 'audio', documento: 'document' };

/* Manda uma mensagem para o cliente (pelo WhatsApp, se estiver conectado) e grava no CRM.
   d = { tipo, texto, midia: {midia_path, midia_mime, midia_nome, midia_tamanho}, modelo, resposta_a, autor_id, automatica } */
export async function enviarSaida(sb, conv, cli, d) {
  const tipo = d.tipo || 'texto'; const texto = String(d.texto || '').slice(0, 4096); const midia = d.midia || {};
  let respostaWa = null;
  if (d.resposta_a) {
    const { data } = await sb.from('mensagens').select('wa_id,conversa_id').eq('id', d.resposta_a).maybeSingle();
    if (data?.conversa_id === conv.id) respostaWa = data.wa_id; else d.resposta_a = null;
  }
  const { data: conta } = await sb.from('whatsapp_contas').select('*').eq('empresa_id', conv.empresa_id).maybeSingle();
  let status = 'nao_enviada', wa_id = null, erro = null, aviso = null;
  if (conta?.ativo) {
    const { data: tk } = await sb.from('whatsapp_tokens').select('access_token').eq('empresa_id', conv.empresa_id).maybeSingle();
    try {
      if (!tk?.access_token) throw new Error('Token do WhatsApp não cadastrado. Atualize em Configurações.');
      if (tipo !== 'modelo' && (!conv.janela_ate || new Date(conv.janela_ate) < new Date())) {
        throw Object.assign(new Error('Passaram mais de 24 horas desde a última mensagem do cliente. Envie um modelo aprovado.'), { code: 131047 });
      }
      if (!cli.whatsapp) throw new Error('O contato não tem número de WhatsApp cadastrado.');
      const msg = { messaging_product: 'whatsapp', recipient_type: 'individual', to: cli.whatsapp };
      if (respostaWa) msg.context = { message_id: respostaWa };
      if (tipo === 'texto') Object.assign(msg, { type: 'text', text: { body: texto, preview_url: /https?:\/\//.test(texto) } });
      else if (tipo === 'modelo') {
        const md = d.modelo || {};
        if (!md.nome) throw new Error('Informe o nome do modelo.');
        const params = (md.params || []).map((t) => ({ type: 'text', text: String(t) }));
        Object.assign(msg, { type: 'template', template: { name: String(md.nome), language: { code: String(md.idioma || 'pt_BR') }, ...(params.length ? { components: [{ type: 'body', parameters: params }] } : {}) } });
      } else {
        const dl = await sb.storage.from('arquivos').download(midia.midia_path);
        if (dl.error) throw new Error('Não encontrei o arquivo para enviar.');
        const fd = new FormData();
        fd.append('messaging_product', 'whatsapp');
        fd.append('type', midia.midia_mime);
        fd.append('file', new Blob([await dl.data.arrayBuffer()], { type: midia.midia_mime }), midia.midia_nome || ('arquivo.' + extDe(midia.midia_mime)));
        const up = await graph(`/${conta.phone_number_id}/media`, tk.access_token, { method: 'POST', body: fd });
        const t = TIPO_WA[tipo]; const obj = { id: up.id };
        if (texto && t !== 'audio') obj.caption = texto;
        if (t === 'document') obj.filename = midia.midia_nome || 'documento';
        Object.assign(msg, { type: t, [t]: obj });
      }
      const r = await graph(`/${conta.phone_number_id}/messages`, tk.access_token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) });
      wa_id = r.messages?.[0]?.id || null; status = 'enviada';
    } catch (e) {
      const m = String(e.message || e);
      status = 'erro'; erro = (/fetch failed|ECONN|ETIMEDOUT|network/i.test(m) ? 'Não foi possível falar com o WhatsApp agora. Tente de novo em instantes.' : m).slice(0, 500);
      aviso = 'Não foi enviada: ' + erro;
    }
  }
  const { data: mensagem, error } = await sb.from('mensagens').insert({
    empresa_id: conv.empresa_id, conversa_id: conv.id, direcao: 'out', tipo, texto, autor_id: d.autor_id || null,
    status, wa_id, erro, resposta_a: d.resposta_a || null, automatica: !!d.automatica, ...midia,
  }).select().single();
  if (error) throw error;
  return { mensagem, aviso };
}

// hora e dia da semana no horário de Brasília
export function agoraLocal(tz = 'America/Sao_Paulo') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), hm: `${p.hour}:${p.minute}` };
}
export function dentroDoHorario(horario, agora = agoraLocal()) {
  const d = (horario || {})[String(agora.dia)];
  if (!d || !d.ativo) return false;
  return agora.hm >= (d.abre || '00:00') && agora.hm < (d.fecha || '23:59');
}

// Depois que chega mensagem de cliente: agradece a nota da pesquisa ou responde fora do horário
async function aposReceber(sb, empresaId, convId, eraResposta) {
  const { data: emp } = await sb.from('empresas').select('config').eq('id', empresaId).single();
  const cfg = emp?.config || {};
  const { data: conv } = await sb.from('conversas').select('*').eq('id', convId).single();
  const { data: cli } = await sb.from('clientes').select('*').eq('id', conv.cliente_id).single();
  if (eraResposta) {
    if (cfg.pesquisa_agradecimento) await enviarSaida(sb, conv, cli, { texto: cfg.pesquisa_agradecimento, automatica: true });
    return;
  }
  if (cfg.horario_ativo && cfg.msg_fora_horario && !dentroDoHorario(cfg.horario)) {
    if (!conv.auto_resposta_em || Date.now() - new Date(conv.auto_resposta_em) > 12 * 3600e3) {
      await sb.from('conversas').update({ auto_resposta_em: new Date().toISOString() }).eq('id', conv.id);
      await enviarSaida(sb, conv, cli, { texto: cfg.msg_fora_horario, automatica: true });
    }
  }
}

/* Recebe uma mensagem de cliente (do WhatsApp ou simulada) e grava no CRM.
   m = { wa_id_msg, de (número), nome, tipo, texto, midia: {bytes, mime, nome}, resposta_wa_id, criado_em } */
export async function receberMensagem(sb, empresaId, m) {
  const cands = variantesNumero(m.de);
  let { data: cli } = await sb.from('clientes').select('*').eq('empresa_id', empresaId).in('whatsapp', cands).limit(1).maybeSingle();
  if (!cli) {
    const ins = await sb.from('clientes').insert({
      empresa_id: empresaId, nome: (m.nome || '').trim() || telefoneBonito(m.de), telefone: telefoneBonito(m.de),
      whatsapp: String(m.de).replace(/\D/g, ''), origem: 'whatsapp', responsavel_id: null,
    }).select().single();
    if (ins.error) {
      const again = await sb.from('clientes').select('*').eq('empresa_id', empresaId).in('whatsapp', cands).limit(1).maybeSingle();
      if (!again.data) throw ins.error; cli = again.data;
    } else cli = ins.data;
  }
  if (cli.bloqueado) return { ignorada: 'bloqueado' };
  let { data: conv } = await sb.from('conversas').select('id,pesquisa_pendente,pesquisa_em').eq('cliente_id', cli.id).maybeSingle();
  if (!conv) {
    const ins = await sb.from('conversas').insert({ empresa_id: empresaId, cliente_id: cli.id, responsavel_id: cli.responsavel_id || null, status: cli.responsavel_id ? 'aguardando_atendente' : 'fila' }).select('id').single();
    if (ins.error) { const again = await sb.from('conversas').select('id').eq('cliente_id', cli.id).maybeSingle(); if (!again.data) throw ins.error; conv = again.data; }
    else {
      conv = ins.data;
      await sb.from('conversa_eventos').insert({ empresa_id: empresaId, conversa_id: conv.id, tipo: 'criada', texto: 'Cliente iniciou a conversa' });
    }
  }
  let midia = {};
  if (m.midia?.bytes) {
    const path = `${empresaId}/chat/${conv.id}/${Date.now()}-${(m.wa_id_msg || 'm').replace(/[^\w]/g, '').slice(-24)}.${extDe(m.midia.mime, m.midia.nome)}`;
    const up = await sb.storage.from('arquivos').upload(path, m.midia.bytes, { contentType: m.midia.mime || 'application/octet-stream', upsert: true });
    if (!up.error) midia = { midia_path: path, midia_mime: (m.midia.mime || '').split(';')[0], midia_nome: m.midia.nome || null, midia_tamanho: m.midia.bytes.length };
  }
  let resposta_a = null;
  if (m.resposta_wa_id) {
    const { data } = await sb.from('mensagens').select('id').eq('wa_id', m.resposta_wa_id).maybeSingle();
    resposta_a = data?.id || null;
  }
  const linha = {
    empresa_id: empresaId, conversa_id: conv.id, direcao: 'in', tipo: m.tipo || 'texto', texto: m.texto || '',
    wa_id: m.wa_id_msg || null, status: 'recebida', resposta_a, ...midia,
    ...(m.criado_em ? { criado_em: m.criado_em } : {}),
  };
  const eraResposta = !!(conv.pesquisa_pendente && conv.pesquisa_em && Date.now() - new Date(conv.pesquisa_em) < 24 * 3600e3
    && (m.tipo || 'texto') === 'texto' && /^\s*[1-5]\s*$/.test(m.texto || ''));
  const ins = await sb.from('mensagens').insert(linha).select().single();
  if (ins.error) {
    if (/duplicate key/i.test(ins.error.message)) return { duplicada: true };
    throw ins.error;
  }
  try { await aposReceber(sb, empresaId, conv.id, eraResposta); } catch (e) { console.error('automação ao receber', e); }
  return { mensagem: ins.data, conversa_id: conv.id, cliente_id: cli.id };
}

// chamada à API da Meta
export async function graph(caminho, token, opts = {}) {
  const r = await fetch(GRAPH + caminho, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
  const txt = await r.text(); let j = {}; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  if (!r.ok) {
    const e = j.error || {};
    const msg = e.error_user_msg || e.message || ('Erro ' + r.status);
    const err = new Error(traduzErroMeta(e.code, msg)); err.code = e.code; throw err;
  }
  return j;
}
export function traduzErroMeta(code, msg) {
  const m = {
    131047: 'Passaram mais de 24 horas desde a última mensagem do cliente. Envie um modelo aprovado.',
    131026: 'Esse número não pode receber mensagens (pode não ter WhatsApp).',
    131051: 'Tipo de mensagem não suportado pelo WhatsApp.',
    131053: 'O WhatsApp não aceitou o arquivo. Confira o formato e o tamanho.',
    132001: 'Modelo não encontrado. Confira o nome e o idioma do modelo aprovado.',
    132000: 'A quantidade de variáveis não bate com o modelo.',
    190: 'O token de acesso do WhatsApp expirou ou é inválido. Atualize em Configurações.',
    131031: 'A conta do WhatsApp está bloqueada ou restrita pela Meta.',
    130429: 'Muitas mensagens em pouco tempo. Espere um pouco e tente de novo.',
    131056: 'Muitas mensagens para o mesmo número em pouco tempo. Espere um pouco.',
  };
  return m[code] || msg;
}
