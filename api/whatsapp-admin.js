// Configuração do WhatsApp de cada empresa e simulação de mensagens para testes.
import { admin, configurado, falha, corpo, quemChamou, graph, receberMensagem } from './_comum.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return falha(res, 405, 'Método não permitido.');
  if (!configurado()) return falha(res, 500, 'Servidor sem configuração: cadastre as chaves do Supabase na Vercel.');
  const sb = admin();
  const eu = await quemChamou(req, res, sb); if (!eu) return;
  const b = corpo(req);
  const p = eu.perfil;
  const lider = (emp) => p.papel === 'admin' || (p.papel === 'gerente' && p.empresa_id === emp);
  try {
    if (b.acao === 'info') {
      const emp = b.empresa_id;
      if (!lider(emp)) return falha(res, 403, 'Só gerente ou administrador.');
      const { data: conta } = await sb.from('whatsapp_contas').select('*').eq('empresa_id', emp).maybeSingle();
      const { data: tk } = await sb.from('whatsapp_tokens').select('empresa_id').eq('empresa_id', emp).maybeSingle();
      return res.status(200).json({
        conta, temToken: !!tk,
        verifyConfigurado: !!String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim(),
        secretConfigurado: !!String(process.env.WHATSAPP_APP_SECRET || '').trim(),
      });
    }
    if (b.acao === 'salvar') {
      if (p.papel !== 'admin') return falha(res, 403, 'Só o administrador conecta o WhatsApp.');
      const emp = b.empresa_id; const pid = String(b.phone_number_id || '').trim();
      if (!emp || !/^\d{5,25}$/.test(pid)) return falha(res, 400, 'Informe o ID do número de telefone (só números), que aparece na Meta.');
      const token = String(b.access_token || '').trim();
      const { data: tkAtual } = await sb.from('whatsapp_tokens').select('access_token').eq('empresa_id', emp).maybeSingle();
      const usar = token || tkAtual?.access_token;
      if (!usar) return falha(res, 400, 'Informe o token de acesso.');
      // confere com a Meta antes de salvar
      let info;
      try { info = await graph(`/${pid}?fields=display_phone_number,verified_name,quality_rating`, usar); }
      catch (e) { return falha(res, 400, 'A Meta recusou os dados: ' + e.message); }
      const { data: outro } = await sb.from('whatsapp_contas').select('empresa_id').eq('phone_number_id', pid).maybeSingle();
      if (outro && outro.empresa_id !== emp) return falha(res, 400, 'Esse número já está ligado a outra empresa.');
      const { error: e1 } = await sb.from('whatsapp_contas').upsert({ empresa_id: emp, phone_number_id: pid, waba_id: String(b.waba_id || '').trim(), numero_exibicao: info.display_phone_number || '', ativo: true, atualizado_em: new Date().toISOString() });
      if (e1) throw e1;
      if (token) { const { error: e2 } = await sb.from('whatsapp_tokens').upsert({ empresa_id: emp, access_token: token }); if (e2) throw e2; }
      // inscreve o app para receber as mensagens desse número (se o ID da conta foi informado)
      let inscrito = null;
      if (b.waba_id) { try { await graph(`/${String(b.waba_id).trim()}/subscribed_apps`, usar, { method: 'POST' }); inscrito = true; } catch (e) { inscrito = e.message; } }
      return res.status(200).json({ ok: true, info, inscrito });
    }
    if (b.acao === 'desconectar') {
      if (p.papel !== 'admin') return falha(res, 403, 'Só o administrador.');
      await sb.from('whatsapp_tokens').delete().eq('empresa_id', b.empresa_id);
      await sb.from('whatsapp_contas').delete().eq('empresa_id', b.empresa_id);
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'simular') {
      // só para testes, enquanto o WhatsApp não está conectado
      let emp, de, nome;
      if (b.conversa_id) {
        const { data: c } = await sb.from('conversas').select('empresa_id, cliente:clientes(whatsapp,telefone,nome)').eq('id', b.conversa_id).maybeSingle();
        if (!c) return falha(res, 404, 'Conversa não encontrada.');
        emp = c.empresa_id; de = c.cliente?.whatsapp || String(c.cliente?.telefone || '').replace(/\D/g, ''); nome = c.cliente?.nome;
      } else { emp = b.empresa_id; de = String(b.telefone || '').replace(/\D/g, ''); nome = b.nome; if (de.length === 10 || de.length === 11) de = '55' + de; }
      if (!lider(emp)) return falha(res, 403, 'Só gerente ou administrador pode simular mensagens.');
      const { data: conta } = await sb.from('whatsapp_contas').select('ativo').eq('empresa_id', emp).maybeSingle();
      if (conta?.ativo) return falha(res, 400, 'O WhatsApp desta empresa já está conectado. Mande uma mensagem de verdade para testar.');
      if (!de) return falha(res, 400, 'O contato precisa ter telefone para simular.');
      const r = await receberMensagem(sb, emp, { wa_id_msg: 'sim.' + Date.now() + Math.random().toString(36).slice(2, 8), de, nome, tipo: 'texto', texto: String(b.texto || 'Olá!').slice(0, 4096) });
      return res.status(200).json({ ok: true, ...r });
    }
    return falha(res, 400, 'Ação desconhecida.');
  } catch (e) {
    console.error(e);
    return falha(res, 500, 'Erro inesperado no servidor: ' + (e.message || e));
  }
}
