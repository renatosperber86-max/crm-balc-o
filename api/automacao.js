// Automações do CRM.
//   acao "processar": chamada a cada minuto pelo relógio do banco (e pelos navegadores com o CRM aberto).
//     Envia mensagens agendadas, avisa clientes esperando, cria lembretes de retorno e distribui a fila.
//     Não precisa de login: só faz o trabalho que já está vencido e devolve apenas números.
//   acao "encerrou": chamada quando alguém encerra um atendimento; manda a pesquisa de satisfação.
import { admin, comoUsuario, configurado, falha, corpo, quemChamou, enviarSaida } from './_comum.js';

const PESQUISA_PADRAO = 'Obrigado pelo contato! De 1 a 5, como você avalia o nosso atendimento? Responda só com o número.';

export default async function handler(req, res) {
  if (req.method !== 'POST') return falha(res, 405, 'Método não permitido.');
  if (!configurado()) return falha(res, 500, 'Servidor sem configuração.');
  const sb = admin();
  const b = corpo(req);
  try {
    if (b.acao === 'processar') return res.status(200).json(await processar(sb));
    if (b.acao === 'encerrou') {
      const eu = await quemChamou(req, res, sb); if (!eu) return;
      const { data: conv } = await comoUsuario(eu.token).from('conversas').select('*').eq('id', b.conversa_id || '').maybeSingle();
      if (!conv) return falha(res, 404, 'Conversa não encontrada.');
      if (conv.status !== 'encerrada') return res.status(200).json({ enviada: false });
      const { data: emp } = await sb.from('empresas').select('config').eq('id', conv.empresa_id).single();
      const cfg = emp?.config || {};
      if (!cfg.pesquisa_ativa) return res.status(200).json({ enviada: false });
      const { data: cli } = await sb.from('clientes').select('*').eq('id', conv.cliente_id).single();
      if (cli.bloqueado) return res.status(200).json({ enviada: false });
      const r = await enviarSaida(sb, conv, cli, { texto: cfg.pesquisa_texto || PESQUISA_PADRAO, automatica: true });
      if (r.mensagem.status !== 'erro') await sb.from('conversas').update({ pesquisa_pendente: true, pesquisa_em: new Date().toISOString() }).eq('id', conv.id);
      return res.status(200).json({ enviada: r.mensagem.status !== 'erro', aviso: r.aviso });
    }
    return falha(res, 400, 'Ação desconhecida.');
  } catch (e) {
    console.error(e);
    return falha(res, 500, 'Erro nas automações: ' + (e.message || e));
  }
}

async function processar(sb) {
  const { data: pode } = await sb.rpc('pode_processar');
  if (!pode) return { pulado: true };
  const out = { agendadas: 0, erros: 0 };
  const [al, rt, fl] = await Promise.all([sb.rpc('processar_alertas'), sb.rpc('processar_retornos'), sb.rpc('distribuir_fila')]);
  out.alertas = al.data || 0; out.retornos = rt.data || 0; out.distribuidas = fl.data || 0;
  const { data: vencidas } = await sb.from('mensagens_agendadas').select('*').eq('status', 'pendente').lte('enviar_em', new Date().toISOString()).order('enviar_em').limit(30);
  for (const a of vencidas || []) {
    // "reserva" a mensagem para não enviar duas vezes
    const { data: pega } = await sb.from('mensagens_agendadas').update({ status: 'enviando' }).eq('id', a.id).eq('status', 'pendente').select('id');
    if (!pega?.length) continue;
    try {
      const { data: conv } = await sb.from('conversas').select('*').eq('id', a.conversa_id).single();
      const { data: cli } = await sb.from('clientes').select('*').eq('id', conv.cliente_id).single();
      if (cli.bloqueado) throw new Error('O contato está bloqueado.');
      const r = await enviarSaida(sb, conv, cli, { texto: a.texto, autor_id: a.autor_id });
      if (r.mensagem.status === 'erro') throw new Error(r.mensagem.erro || 'Falha no envio');
      await sb.from('mensagens_agendadas').update({ status: 'enviada', enviada_em: new Date().toISOString() }).eq('id', a.id);
      out.agendadas++;
    } catch (e) {
      out.erros++;
      await sb.from('mensagens_agendadas').update({ status: 'erro', erro: String(e.message || e).slice(0, 300) }).eq('id', a.id);
      await sb.from('notificacoes').insert({ user_id: a.autor_id, empresa_id: a.empresa_id, tipo: 'alerta', titulo: 'Mensagem agendada não foi enviada', texto: String(e.message || e).slice(0, 200), link: 'chat:' + a.conversa_id });
    }
  }
  return out;
}
