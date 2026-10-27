// Configurações da empresa: áreas, tempo de resposta e WhatsApp
import { S, $, esc, q, rpc, api, abrir, rodape, toast, falhou, icon, isAdmin, confirmar } from '../core.js';
import { carregarBase, carregarEmpresas, empresaAtual } from '../app.js';

let el;
export default {
  async render(root) {
    el = root;
    const emp = empresaAtual();
    el.innerHTML = `<div class="bar"><div><h2>Configurações</h2><p class="sub">${esc(emp?.nome || '')}</p></div></div>
      <div class="panel"><div class="panel-h"><div><h3>WhatsApp</h3><p>Conexão com a API oficial do WhatsApp (Meta).</p></div></div><div id="cfWa"><div class="empty">Carregando…</div></div></div>
      <div class="panel"><div class="panel-h"><div><h3>Áreas da empresa</h3><p>Para encaminhar atendimentos entre setores (ex.: Vendas para Assistência).</p></div><button class="btn sm" id="cfNovaArea">${icon('mais2')}Nova área</button></div><div id="cfAreas"></div></div>
      <div class="panel"><div class="panel-h"><div><h3>Tempo de resposta esperado</h3><p>O painel mostra quantas primeiras respostas saíram dentro deste prazo.</p></div></div>
        <form id="cfSla" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap"><div class="field" style="max-width:200px"><label for="cfMin">Minutos</label><input id="cfMin" type="number" min="1" max="1440" value="${emp?.sla_minutos || 5}"></div><button class="btn pri">Salvar</button></form></div>`;
    $('#cfNovaArea').onclick = () => formArea();
    $('#cfAreas').onclick = (e) => { const b = e.target.closest('[data-ar]'); if (b) formArea(S.areas.find((a) => a.id === b.dataset.ar)); };
    $('#cfSla').onsubmit = async (e) => { e.preventDefault(); try { await rpc('salvar_config_empresa', { p_empresa: S.empresaId, p_sla: Number($('#cfMin').value) }); await carregarEmpresas(); toast('Tempo de resposta salvo'); } catch (er) { falhou(er); } };
    areas(); whatsapp();
  },
};
function areas() {
  $('#cfAreas').innerHTML = S.areas.length ? `<div class="list">${S.areas.map((a) => `<div class="row"><div class="main-c"><div class="t">${esc(a.nome)}</div><div class="s">${S.pessoas.filter((p) => p.area_id === a.id).length} pessoa(s) nesta área</div></div><button class="btn sm" data-ar="${a.id}">Editar</button></div>`).join('')}</div>` : '<div class="empty">Nenhuma área.</div>';
}
function formArea(a) {
  abrir(`<h3>${a ? 'Editar área' : 'Nova área'}</h3><div class="field"><label for="arN">Nome</label><input id="arN" name="nome" required value="${esc(a?.nome)}"></div>
    <p class="hint">Quem é de cada área se escolhe em Equipe e logins.</p>${rodape({ excluir: !!a })}`,
  async (d) => {
    if (a) await q(S.sb.from('areas').update({ nome: d.nome.trim() }).eq('id', a.id)); else await q(S.sb.from('areas').insert({ empresa_id: S.empresaId, nome: d.nome.trim() }));
    await carregarBase(); areas(); toast('Área salva');
  },
  async () => { await q(S.sb.from('areas').delete().eq('id', a.id)); await carregarBase(); areas(); toast('Área excluída'); });
}
async function whatsapp() {
  const box = $('#cfWa');
  let info;
  try { info = await api('whatsapp-admin', { acao: 'info', empresa_id: S.empresaId }); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const c = info.conta; const hook = location.origin + '/api/whatsapp';
  box.innerHTML = `${c?.ativo ? `<div class="row"><div class="main-c"><div class="t">Conectado: ${esc(c.numero_exibicao || c.phone_number_id)} <span class="chip good">Ativo</span></div><div class="s">ID do número: ${esc(c.phone_number_id)}${c.waba_id ? ' · Conta: ' + esc(c.waba_id) : ''}</div></div></div>`
    : '<p style="margin:0 0 10px">O WhatsApp desta empresa <b>ainda não está conectado</b>. Enquanto isso, dá para testar o chat com mensagens simuladas (menu ⋮ da conversa).</p>'}
    <div class="list small">
      <div class="row"><div class="main-c"><div class="t">Endereço do webhook (cole na Meta)</div><div class="s" style="font-family:monospace">${esc(hook)}</div></div><button class="btn sm" id="cfCopiar">Copiar</button></div>
      <div class="row"><div class="main-c"><div class="t">Token de verificação</div><div class="s">${info.verifyConfigurado ? 'Cadastrado na Vercel (WHATSAPP_VERIFY_TOKEN).' : '<span style="color:var(--bad)">Falta cadastrar WHATSAPP_VERIFY_TOKEN na Vercel.</span>'}</div></div></div>
      <div class="row"><div class="main-c"><div class="t">Chave secreta do app</div><div class="s">${info.secretConfigurado ? 'Cadastrada na Vercel (WHATSAPP_APP_SECRET).' : 'Recomendado: cadastre WHATSAPP_APP_SECRET na Vercel para conferir que as mensagens vêm mesmo da Meta.'}</div></div></div>
    </div>
    ${isAdmin() ? `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn pri" id="cfWaCon">${c ? 'Atualizar dados da conexão' : 'Conectar WhatsApp'}</button>${c ? '<button class="btn danger" id="cfWaDes">Desconectar</button>' : ''}</div>` : '<p class="hint" style="margin-top:10px">Só o administrador do sistema conecta o WhatsApp.</p>'}`;
  $('#cfCopiar').onclick = async () => { try { await navigator.clipboard.writeText(hook); toast('Endereço copiado'); } catch (e) { toast('Copie o endereço manualmente.', true); } };
  $('#cfWaCon') && ($('#cfWaCon').onclick = () => conectar(c, info.temToken));
  $('#cfWaDes') && ($('#cfWaDes').onclick = async () => {
    if (!(await confirmar('Desconectar o WhatsApp?', 'As mensagens novas deixam de chegar e o CRM para de enviar. As conversas antigas continuam aqui.', 'Desconectar', true))) return;
    try { await api('whatsapp-admin', { acao: 'desconectar', empresa_id: S.empresaId }); await carregarBase(); whatsapp(); toast('WhatsApp desconectado'); } catch (e) { falhou(e); }
  });
}
function conectar(c, temToken) {
  abrir(`<h3>Conectar WhatsApp</h3><p class="hint">Esses dados ficam no painel da Meta for Developers, em WhatsApp, Configuração da API. O token fica guardado só no servidor; ninguém consegue ver pelas telas.</p>
    <div class="field"><label for="waP">ID do número de telefone *</label><input id="waP" name="pid" required inputmode="numeric" value="${esc(c?.phone_number_id)}" placeholder="Ex.: 123456789012345"></div>
    <div class="field"><label for="waW">ID da conta do WhatsApp Business</label><input id="waW" name="waba" inputmode="numeric" value="${esc(c?.waba_id)}" placeholder="Ex.: 109876543210987"></div>
    <div class="field"><label for="waT">Token de acesso ${temToken ? '(deixe em branco para manter o atual)' : '*'}</label><textarea id="waT" name="token" ${temToken ? '' : 'required'} placeholder="EAAG..." style="min-height:70px;font-family:monospace;font-size:13px"></textarea></div>
    ${rodape({ salvar: 'Conferir e salvar' })}`,
  async (d) => {
    const r = await api('whatsapp-admin', { acao: 'salvar', empresa_id: S.empresaId, phone_number_id: d.pid.trim(), waba_id: d.waba.trim(), access_token: d.token.trim() });
    toast('WhatsApp conectado: ' + (r.info?.display_phone_number || '')); if (r.inscrito && r.inscrito !== true) toast('Conectado, mas não consegui inscrever o webhook: ' + r.inscrito, true);
    await carregarBase(); whatsapp();
  });
}
