// Envia uma mensagem do CRM para o cliente pelo WhatsApp (API oficial da Meta).
// Se o WhatsApp da empresa ainda não estiver conectado, a mensagem fica guardada só no CRM.
import { admin, comoUsuario, configurado, falha, corpo, quemChamou, graph, extDe } from './_comum.js';

const TIPOS = ['texto', 'imagem', 'video', 'audio', 'documento', 'modelo'];
const TIPO_WA = { imagem: 'image', video: 'video', audio: 'audio', documento: 'document' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return falha(res, 405, 'Método não permitido.');
  if (!configurado()) return falha(res, 500, 'Servidor sem configuração: cadastre as chaves do Supabase na Vercel.');
  const sb = admin();
  const eu = await quemChamou(req, res, sb); if (!eu) return;
  const b = corpo(req);
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : 'texto';
  const texto = String(b.texto || '').slice(0, 4096);
  if (tipo === 'texto' && !texto.trim()) return falha(res, 400, 'Escreva a mensagem.');

  // a conversa precisa estar visível para quem está enviando (regras do banco)
  const { data: conv } = await comoUsuario(eu.token).from('conversas').select('*').eq('id', b.conversa_id || '').maybeSingle();
  if (!conv) return falha(res, 404, 'Conversa não encontrada ou sem acesso.');
  const { data: cli } = await sb.from('clientes').select('*').eq('id', conv.cliente_id).single();
  if (cli.bloqueado) return falha(res, 400, 'Este contato está bloqueado. Desbloqueie para enviar mensagens.');

  let midia = {};
  if (TIPO_WA[tipo]) {
    const path = String(b.midia_path || '');
    if (!path.startsWith(conv.empresa_id + '/')) return falha(res, 400, 'Arquivo inválido.');
    midia = { midia_path: path, midia_mime: String(b.midia_mime || 'application/octet-stream').split(';')[0], midia_nome: String(b.midia_nome || '').slice(0, 200) || null, midia_tamanho: Number(b.midia_tamanho) || null };
  }
  let respostaWa = null; let resposta_a = null;
  if (b.resposta_a) {
    const { data } = await sb.from('mensagens').select('id,wa_id,conversa_id').eq('id', b.resposta_a).maybeSingle();
    if (data && data.conversa_id === conv.id) { resposta_a = data.id; respostaWa = data.wa_id; }
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
      const msg = { messaging_product: 'whatsapp', recipient_type: 'individual', to: cli.whatsapp };
      if (!cli.whatsapp) throw new Error('O contato não tem número de WhatsApp cadastrado.');
      if (respostaWa) msg.context = { message_id: respostaWa };
      if (tipo === 'texto') Object.assign(msg, { type: 'text', text: { body: texto, preview_url: /https?:\/\//.test(texto) } });
      else if (tipo === 'modelo') {
        const md = b.modelo || {};
        if (!md.nome) throw new Error('Informe o nome do modelo.');
        const params = (md.params || []).map((t) => ({ type: 'text', text: String(t) }));
        Object.assign(msg, { type: 'template', template: { name: String(md.nome), language: { code: String(md.idioma || 'pt_BR') }, ...(params.length ? { components: [{ type: 'body', parameters: params }] } : {}) } });
      } else {
        // baixa do Supabase e manda para a Meta
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

  const { data: m, error } = await sb.from('mensagens').insert({
    empresa_id: conv.empresa_id, conversa_id: conv.id, direcao: 'out', tipo, texto, autor_id: eu.user.id,
    status, wa_id, erro, resposta_a, ...midia,
  }).select().single();
  if (error) return falha(res, 500, 'Não foi possível salvar a mensagem: ' + error.message);
  return res.status(200).json({ mensagem: m, aviso });
}
