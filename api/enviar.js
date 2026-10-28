// Envia uma mensagem do CRM para o cliente pelo WhatsApp (API oficial da Meta).
// Se o WhatsApp da empresa ainda não estiver conectado, a mensagem fica guardada só no CRM.
import { admin, comoUsuario, configurado, falha, corpo, quemChamou, enviarSaida } from './_comum.js';

const TIPOS = ['texto', 'imagem', 'video', 'audio', 'documento', 'modelo'];
const COM_MIDIA = ['imagem', 'video', 'audio', 'documento'];

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
  if (COM_MIDIA.includes(tipo)) {
    const path = String(b.midia_path || '');
    if (!path.startsWith(conv.empresa_id + '/')) return falha(res, 400, 'Arquivo inválido.');
    midia = { midia_path: path, midia_mime: String(b.midia_mime || 'application/octet-stream').split(';')[0], midia_nome: String(b.midia_nome || '').slice(0, 200) || null, midia_tamanho: Number(b.midia_tamanho) || null };
  }
  try {
    const r = await enviarSaida(sb, conv, cli, { tipo, texto, midia, modelo: b.modelo, resposta_a: b.resposta_a || null, autor_id: eu.user.id });
    return res.status(200).json(r);
  } catch (e) { return falha(res, 500, 'Não foi possível salvar a mensagem: ' + (e.message || e)); }
}
