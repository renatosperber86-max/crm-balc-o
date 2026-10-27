// Endereço que a Meta chama quando chega mensagem no WhatsApp (webhook).
// Na Meta, cadastre: URL de retorno = https://SEU-SITE/api/whatsapp
//                    Token de verificação = o mesmo valor de WHATSAPP_VERIFY_TOKEN na Vercel
import crypto from 'node:crypto';
import { admin, configurado, graph, receberMensagem } from './_comum.js';

const VERIFY = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
const APP_SECRET = String(process.env.WHATSAPP_APP_SECRET || '').trim();
const ORDEM = { enviada: 1, entregue: 2, lida: 3 };
const ST = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'erro' };

// A Meta confere o endereço uma vez, quando você salva o webhook
export async function GET(request) {
  const u = new URL(request.url);
  if (u.searchParams.get('hub.mode') === 'subscribe' && VERIFY && u.searchParams.get('hub.verify_token') === VERIFY) {
    return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('Token de verificação não confere.', { status: 403 });
}

export async function POST(request) {
  const bruto = await request.text();
  if (APP_SECRET) {
    const ass = request.headers.get('x-hub-signature-256') || '';
    const esperado = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(bruto).digest('hex');
    const a = Buffer.from(ass), b = Buffer.from(esperado);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return new Response('assinatura inválida', { status: 401 });
  }
  if (!configurado()) return new Response('ok', { status: 200 });
  let corpo; try { corpo = JSON.parse(bruto); } catch { return new Response('ok', { status: 200 }); }
  const sb = admin();
  try {
    for (const entry of corpo.entry || []) {
      for (const ch of entry.changes || []) {
        const v = ch.value || {};
        const pid = v.metadata?.phone_number_id; if (!pid) continue;
        const { data: conta } = await sb.from('whatsapp_contas').select('*').eq('phone_number_id', pid).maybeSingle();
        if (!conta || !conta.ativo) continue;
        const { data: tk } = await sb.from('whatsapp_tokens').select('access_token').eq('empresa_id', conta.empresa_id).maybeSingle();
        const nomes = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']));
        for (const msg of v.messages || []) {
          try { await processar(sb, conta, tk?.access_token, msg, nomes[msg.from]); } catch (e) { console.error('mensagem', msg.id, e); }
        }
        for (const s of v.statuses || []) {
          try { await statusMsg(sb, s); } catch (e) { console.error('status', s.id, e); }
        }
      }
    }
  } catch (e) { console.error(e); }
  return new Response('ok', { status: 200 });
}

async function processar(sb, conta, token, msg, nome) {
  const t = msg.type; let tipo = 'texto', texto = '', midiaRef = null;
  if (t === 'text') texto = msg.text?.body || '';
  else if (t === 'image') { tipo = 'imagem'; midiaRef = msg.image; texto = msg.image?.caption || ''; }
  else if (t === 'video') { tipo = 'video'; midiaRef = msg.video; texto = msg.video?.caption || ''; }
  else if (t === 'audio') { tipo = 'audio'; midiaRef = msg.audio; }
  else if (t === 'document') { tipo = 'documento'; midiaRef = msg.document; texto = msg.document?.caption || ''; }
  else if (t === 'sticker') { tipo = 'figurinha'; midiaRef = msg.sticker; }
  else if (t === 'location') { tipo = 'localizacao'; texto = `${msg.location?.latitude},${msg.location?.longitude}`; }
  else if (t === 'button') texto = msg.button?.text || '';
  else if (t === 'interactive') texto = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
  else if (t === 'reaction') { texto = 'Reagiu com ' + (msg.reaction?.emoji || '👍'); }
  else if (t === 'contacts') texto = 'Contato compartilhado: ' + (msg.contacts || []).map((c) => c.name?.formatted_name).join(', ');
  else { tipo = 'outro'; texto = 'Mensagem de um tipo que o CRM ainda não mostra.'; }

  let midia = null;
  if (midiaRef?.id && token) {
    try {
      const info = await graph('/' + midiaRef.id, token);
      const r = await fetch(info.url, { headers: { Authorization: 'Bearer ' + token } });
      if (r.ok) midia = { bytes: Buffer.from(await r.arrayBuffer()), mime: midiaRef.mime_type || info.mime_type, nome: midiaRef.filename || null };
    } catch (e) { console.error('baixar mídia', e); }
  }
  await receberMensagem(sb, conta.empresa_id, {
    wa_id_msg: msg.id, de: msg.from, nome, tipo, texto, midia, resposta_wa_id: msg.context?.id || null,
    criado_em: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : null,
  });
}

async function statusMsg(sb, s) {
  const novo = ST[s.status]; if (!novo || !s.id) return;
  const { data: m } = await sb.from('mensagens').select('id,status').eq('wa_id', s.id).maybeSingle();
  if (!m) return;
  if (novo !== 'erro' && (ORDEM[m.status] || 0) >= ORDEM[novo]) return;
  const err = s.errors?.[0];
  await sb.from('mensagens').update({ status: novo, ...(novo === 'erro' ? { erro: (err?.error_data?.details || err?.message || err?.title || 'Falha na entrega').slice(0, 500) } : {}) }).eq('id', m.id);
}
