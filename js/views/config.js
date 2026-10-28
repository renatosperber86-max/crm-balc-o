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
      <div id="cfAuto"></div>
      <div class="panel"><div class="panel-h"><div><h3>Áreas da empresa</h3><p>Para encaminhar atendimentos entre setores (ex.: Vendas para Assistência).</p></div><button class="btn sm" id="cfNovaArea">${icon('mais2')}Nova área</button></div><div id="cfAreas"></div></div>
      <div class="panel"><div class="panel-h"><div><h3>Tempo de resposta esperado</h3><p>O painel mostra quantas primeiras respostas saíram dentro deste prazo.</p></div></div>
        <form id="cfSla" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap"><div class="field" style="max-width:200px"><label for="cfMin">Minutos</label><input id="cfMin" type="number" min="1" max="1440" value="${emp?.sla_minutos || 5}"></div><button class="btn pri">Salvar</button></form></div>`;
    $('#cfNovaArea').onclick = () => formArea();
    $('#cfAreas').onclick = (e) => { const b = e.target.closest('[data-ar]'); if (b) formArea(S.areas.find((a) => a.id === b.dataset.ar)); };
    $('#cfSla').onsubmit = async (e) => { e.preventDefault(); try { await rpc('salvar_config_empresa', { p_empresa: S.empresaId, p_sla: Number($('#cfMin').value) }); await carregarEmpresas(); toast('Tempo de resposta salvo'); } catch (er) { falhou(er); } };
    areas(); whatsapp(); automacoes();
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

/* ---------- automações ---------- */
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HORARIO_PADRAO = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { ativo: d >= 1 && d <= 5 || d === 6, abre: '08:00', fecha: d === 6 ? '12:00' : '18:00' }]));
function automacoes() {
  const emp = empresaAtual(); const c = emp?.config || {};
  const h = c.horario && Object.keys(c.horario).length ? c.horario : HORARIO_PADRAO;
  const box = $('#cfAuto');
  box.innerHTML = `
  <form class="panel" id="cfDist"><div class="panel-h"><div><h3>Distribuição dos clientes novos</h3><p>Quem recebe as conversas que chegam sem responsável.</p></div></div>
    <div class="list">
      <label class="check-line" style="padding:6px 0"><input type="radio" name="distribuicao" value="manual" ${c.distribuicao !== 'rodizio' ? 'checked' : ''}> <span><b>Manual</b><br><span class="small muted">A conversa fica na fila e alguém assume.</span></span></label>
      <label class="check-line" style="padding:6px 0"><input type="radio" name="distribuicao" value="rodizio" ${c.distribuicao === 'rodizio' ? 'checked' : ''}> <span><b>Rodízio automático</b><br><span class="small muted">Cada cliente novo vai para o próximo atendente, em ordem, de forma igual entre todos.</span></span></label>
    </div>
    <div class="fields2" style="margin-top:8px">
      <label class="check-line"><input type="checkbox" name="rodizio_online" ${c.rodizio_online === false ? '' : 'checked'}> Só para quem está online</label>
      <label class="check-line"><input type="checkbox" name="rodizio_gerentes" ${c.rodizio_gerentes ? 'checked' : ''}> Gerentes também recebem</label></div>
    <div class="field" style="margin-top:8px;max-width:320px"><label for="cfRa">Só pessoas da área</label><select id="cfRa" name="rodizio_area"><option value="">Todas as áreas</option>${S.areas.map((a) => `<option value="${a.id}" ${c.rodizio_area === a.id ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></div>
    <p class="hint" style="margin-top:6px">Para tirar alguém do rodízio (por exemplo, quem está de folga), vá em Equipe e logins, Editar, e desmarque "Recebe clientes da fila automática". Se ninguém puder receber, a conversa espera na fila e é distribuída assim que alguém entrar.</p>
    <div style="display:flex;justify-content:flex-end"><button class="btn pri">Salvar</button></div></form>

  <form class="panel" id="cfAlertas"><div class="panel-h"><div><h3>Avisos automáticos</h3><p>O sistema avisa a equipe sozinho.</p></div></div>
    <div class="fields2">
      <div class="field"><label for="cfAm">Avisar quando o cliente espera resposta há mais de (minutos)</label><input id="cfAm" name="alerta_minutos" type="number" min="0" max="1440" value="${c.alerta_minutos ?? 15}"><span class="hint">Avisa o atendente e o gerente dele. Use 0 para desligar.</span></div>
      <div class="field"><label for="cfRd">Criar lembrete de retorno quando o cliente não responde há (dias)</label><input id="cfRd" name="retorno_dias" type="number" min="0" max="60" value="${c.retorno_dias ?? 3}"><span class="hint">Cria um lembrete para o vendedor chamar o cliente de novo. Use 0 para desligar.</span></div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn pri">Salvar</button></div></form>

  <form class="panel" id="cfHorario"><div class="panel-h"><div><h3>Horário de atendimento</h3><p>Fora do horário, o cliente recebe uma resposta automática (uma vez a cada 12 horas).</p></div>
      <label class="toggle"><input type="checkbox" name="horario_ativo" ${c.horario_ativo ? 'checked' : ''} aria-label="Ligar resposta fora do horário"><span></span></label></div>
    <div class="table-wrap" style="border:0"><table style="min-width:420px"><thead><tr><th>Dia</th><th>Atende</th><th>Abre</th><th>Fecha</th></tr></thead><tbody>
      ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<tr><td>${DIAS[d]}</td><td><input type="checkbox" name="d${d}" ${h[d]?.ativo ? 'checked' : ''} aria-label="Atende ${DIAS[d]}"></td>
        <td><input type="time" name="a${d}" value="${esc(h[d]?.abre || '08:00')}" aria-label="Abre ${DIAS[d]}"></td><td><input type="time" name="f${d}" value="${esc(h[d]?.fecha || '18:00')}" aria-label="Fecha ${DIAS[d]}"></td></tr>`).join('')}
    </tbody></table></div>
    <div class="field" style="margin-top:8px"><label for="cfMf">Mensagem fora do horário</label><textarea id="cfMf" name="msg_fora_horario">${esc(c.msg_fora_horario || 'Olá! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h, e sábado das 8h às 12h. Recebemos sua mensagem e respondemos assim que abrirmos.')}</textarea></div>
    <p class="hint">Horário de Brasília. Só funciona com o WhatsApp conectado.</p>
    <div style="display:flex;justify-content:flex-end"><button class="btn pri">Salvar</button></div></form>

  <form class="panel" id="cfPesquisa"><div class="panel-h"><div><h3>Pesquisa de satisfação</h3><p>Quando um atendimento é encerrado, o cliente recebe uma pergunta e responde com uma nota de 1 a 5.</p></div>
      <label class="toggle"><input type="checkbox" name="pesquisa_ativa" ${c.pesquisa_ativa ? 'checked' : ''} aria-label="Ligar pesquisa de satisfação"><span></span></label></div>
    <div class="field"><label for="cfPt">Pergunta</label><textarea id="cfPt" name="pesquisa_texto">${esc(c.pesquisa_texto || 'Obrigado pelo contato! De 1 a 5, como você avalia o nosso atendimento? Responda só com o número.')}</textarea></div>
    <div class="field" style="margin-top:8px"><label for="cfPa">Resposta depois da nota (opcional)</label><input id="cfPa" name="pesquisa_agradecimento" value="${esc(c.pesquisa_agradecimento ?? 'Obrigado pela avaliação! 😊')}"></div>
    <p class="hint">A nota aparece no painel de cada vendedor. Só funciona com o WhatsApp conectado.</p>
    <div style="display:flex;justify-content:flex-end"><button class="btn pri">Salvar</button></div></form>`;
  const salvar = async (parcial, msg) => {
    try { const r = await rpc('salvar_config', { p_empresa: S.empresaId, p_config: parcial }); const e = empresaAtual(); if (e) e.config = r; toast(msg); }
    catch (er) { falhou(er); }
  };
  const ler = (f) => Object.fromEntries(new FormData(f).entries());
  $('#cfDist').onsubmit = (e) => { e.preventDefault(); const d = ler(e.target); salvar({ distribuicao: d.distribuicao, rodizio_online: d.rodizio_online === 'on', rodizio_gerentes: d.rodizio_gerentes === 'on', rodizio_area: d.rodizio_area || '' }, d.distribuicao === 'rodizio' ? 'Rodízio automático ligado' : 'Distribuição manual'); };
  $('#cfAlertas').onsubmit = (e) => { e.preventDefault(); const d = ler(e.target); salvar({ alerta_minutos: Math.max(0, Number(d.alerta_minutos) || 0), retorno_dias: Math.max(0, Number(d.retorno_dias) || 0) }, 'Avisos salvos'); };
  $('#cfHorario').onsubmit = (e) => {
    e.preventDefault(); const d = ler(e.target);
    const horario = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((x) => [x, { ativo: d['d' + x] === 'on', abre: d['a' + x] || '08:00', fecha: d['f' + x] || '18:00' }]));
    salvar({ horario_ativo: d.horario_ativo === 'on', horario, msg_fora_horario: d.msg_fora_horario.trim() }, 'Horário salvo');
  };
  $('#cfPesquisa').onsubmit = (e) => { e.preventDefault(); const d = ler(e.target); salvar({ pesquisa_ativa: d.pesquisa_ativa === 'on', pesquisa_texto: d.pesquisa_texto.trim(), pesquisa_agradecimento: d.pesquisa_agradecimento.trim() }, 'Pesquisa salva'); };
}
