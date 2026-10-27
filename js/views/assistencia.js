// Assistência: ordens de serviço e atendimentos encaminhados
import { S, $, esc, q, rpc, abrir, rodape, toast, falhou, icon, menu, brl, fmtData, fmtDataHora, desde, norm, debounce, lider, isAdmin, atende,
  nomePessoa, campoResponsavel, responsavelPadrao, buscarTudo, ouvir, opcoesPessoas } from '../core.js';
import { irPara } from '../app.js';
import { escolherContato } from '../comum.js';

const ST_OS = { aberta: ['Aberta', 'info'], em_andamento: ['Em andamento', 'gold'], concluida: ['Concluída', 'good'], cancelada: ['Cancelada', 'bad'] };
const A = { aba: 'pend', busca: '', status: '' };
let el, os = [], pend = [], nomes = new Map(), desligar = [];

export default {
  async render(root, arg) {
    el = root; if (arg === 'os') A.aba = 'os';
    el.innerHTML = `<div class="bar"><div><h2>Assistência</h2><p class="sub">Ordens de serviço, custos de frete, contas a pagar e os atendimentos encaminhados para a área.</p></div>
      <div class="bar-r" id="asBar"></div></div>
      <div class="tabs" role="tablist"><button role="tab" data-aba="pend">Pendências encaminhadas <span class="chip mute" id="asNp">0</span></button><button role="tab" data-aba="os">Ordens de serviço</button></div>
      <div id="asCorpo"><div class="empty">Carregando…</div></div>`;
    el.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('[data-aba]'); if (b) { A.aba = b.dataset.aba; desenhar(); } };
    $('#asCorpo').onclick = clique;
    await carregar();
    desligar = [ouvir('encaminhamentos', debounce(() => carregar(), 800)), ouvir('tick', () => carregar())];
  },
  sair() { desligar.forEach((f) => f()); desligar = []; },
};
async function carregar() {
  try {
    const porEmp = (x) => x.eq('empresa_id', S.empresaId);
    [os, pend] = await Promise.all([
      buscarTudo('ordens_servico', porEmp, '*', 'numero'),
      q(S.sb.from('encaminhamentos').select('*, conversa:conversas(id, cliente:clientes(nome,telefone))').eq('empresa_id', S.empresaId).order('criado_em', { ascending: false }).limit(300)),
    ]);
    os.reverse();
    const ids = [...new Set(os.map((o) => o.cliente_id).filter(Boolean))];
    nomes = new Map(ids.length ? (await q(S.sb.from('clientes').select('id,nome').in('id', ids.slice(0, 500)))).map((c) => [c.id, c.nome]) : []);
    desenhar();
  } catch (e) { falhou(e); }
}
function desenhar() {
  el.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.aba === A.aba));
  const abertas = pend.filter((p) => p.status === 'pendente');
  $('#asNp').textContent = abertas.length;
  $('#asBar').innerHTML = A.aba === 'os' ? `<input type="search" id="asB" placeholder="Buscar OS" value="${esc(A.busca)}" style="max-width:200px" aria-label="Buscar ordem de serviço"><select id="asS" aria-label="Status"><option value="">Todos os status</option>${Object.entries(ST_OS).map(([k, v]) => `<option value="${k}" ${A.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select><button class="btn pri" id="asNova">${icon('mais2')}Nova ordem de serviço</button>` : '';
  if (A.aba === 'os') {
    $('#asNova').onclick = () => formOS(null, () => carregar());
    $('#asB').oninput = debounce((e) => { A.busca = e.target.value; tabelaOS(); }, 200);
    $('#asS').onchange = (e) => { A.status = e.target.value; tabelaOS(); };
    tabelaOS();
  } else pendencias();
}
function pendencias() {
  const box = $('#asCorpo');
  const abertas = pend.filter((p) => p.status === 'pendente'); const feitas = pend.filter((p) => p.status !== 'pendente').slice(0, 30);
  const area = (id) => S.areas.find((a) => a.id === id)?.nome || 'Área';
  const card = (p) => {
    const vence = new Date(new Date(p.criado_em).getTime() + p.prazo_horas * 3600e3); const atras = p.status === 'pendente' && vence < new Date();
    const souDestino = S.me.area_id === p.area_id || lider(); const souOrigem = p.de_id === S.me.id;
    return `<div class="row"><div class="main-c"><div class="t">${esc(p.conversa?.cliente?.nome || 'Cliente')} <span class="chip mute">${esc(area(p.area_id))}</span> ${p.status === 'pendente' ? (atras ? '<span class="chip bad">Prazo vencido</span>' : `<span class="chip gold">Vence em ${desde(new Date(Date.now() * 2 - vence.getTime()).toISOString())}</span>`) : `<span class="chip good">${{ assumida: 'Assumida', devolvida: 'Devolvida', recuperada: 'Recuperada' }[p.status]}</span>`}</div>
      <div class="s">Motivo: ${esc(p.motivo)}</div><div class="s">Encaminhada por ${esc(nomePessoa(p.de_id))} em ${fmtDataHora(p.criado_em)} · prazo ${p.prazo_horas}h${p.resolvido_por ? ' · resolvida por ' + esc(nomePessoa(p.resolvido_por)) : ''}</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${p.conversa?.id ? `<button class="btn sm" data-conv="${p.conversa.id}">Abrir conversa</button>` : ''}
      ${p.status === 'pendente' && souDestino && atende() ? `<button class="btn sm pri" data-res="assumir:${p.id}">Assumir</button>` : ''}
      ${p.status === 'pendente' && souDestino && p.de_id ? `<button class="btn sm" data-res="devolver:${p.id}">Devolver</button>` : ''}
      ${p.status === 'pendente' && souOrigem ? `<button class="btn sm" data-res="recuperar:${p.id}">Recuperar cliente</button>` : ''}</div></div>`;
  };
  box.innerHTML = `<div class="panel"><div class="panel-h"><div><h3>Pendências encaminhadas</h3><p>Atendimentos enviados para uma área esperando alguém assumir ou devolver.</p></div></div>
    ${abertas.length ? `<div class="list">${abertas.map(card).join('')}</div>` : '<div class="empty">Nenhuma pendência encaminhada. As conversas enviadas por Vendas ou Financeiro aparecem aqui.</div>'}</div>
    ${feitas.length ? `<div class="panel"><div class="panel-h"><div><h3>Resolvidas recentemente</h3></div></div><div class="list">${feitas.map(card).join('')}</div></div>` : ''}`;
}
function tabelaOS() {
  const b = norm(A.busca);
  const l = os.filter((o) => (!A.status || o.status === A.status) && (!b || norm(`${o.numero} ${o.titulo} ${nomes.get(o.cliente_id) || ''}`).includes(b)));
  const box = $('#asCorpo');
  const ab = os.filter((o) => !['concluida', 'cancelada'].includes(o.status));
  const contas = os.filter((o) => Number(o.conta_valor) > 0 && !o.conta_paga);
  box.innerHTML = `<div class="kgrid" style="margin-bottom:14px">
      <div class="k"><div class="lb">Em aberto</div><div class="vl">${ab.length}</div></div>
      <div class="k"><div class="lb">Frete das abertas</div><div class="vl">${brl(ab.reduce((a, o) => a + Number(o.custo_frete), 0))}</div></div>
      <div class="k ${contas.some((o) => o.conta_vencimento && o.conta_vencimento < new Date().toISOString().slice(0, 10)) ? 'dest rust' : ''}"><div class="lb">Contas a pagar</div><div class="vl">${brl(contas.reduce((a, o) => a + Number(o.conta_valor), 0))}</div><div class="sub">${contas.length} conta(s) em aberto</div></div></div>
    ${os.length ? `<div class="table-wrap"><table><thead><tr><th>Nº</th><th>Serviço</th><th>Cliente</th><th>Responsável</th><th>Status</th><th class="r">Frete</th><th class="r">Valor</th><th>Conta a pagar</th><th class="r">Ações</th></tr></thead><tbody>
      ${l.length ? l.map((o) => `<tr><td><b>${o.numero}</b></td><td><b>${esc(o.titulo)}</b>${o.descricao ? `<div class="s">${esc(o.descricao.slice(0, 80))}</div>` : ''}</td><td>${esc(nomes.get(o.cliente_id) || '—')}</td><td>${esc(nomePessoa(o.responsavel_id))}</td>
        <td><span class="chip ${ST_OS[o.status][1]}">${ST_OS[o.status][0]}</span></td><td class="r">${brl(o.custo_frete)}</td><td class="r">${brl(o.valor)}</td>
        <td>${Number(o.conta_valor) > 0 ? `${brl(o.conta_valor)}<div class="s">${o.conta_paga ? 'Paga' : o.conta_vencimento ? 'Vence ' + fmtData(o.conta_vencimento) : 'Sem vencimento'}</div>` : '<span class="s">—</span>'}</td>
        <td class="r"><button class="icon-btn" data-os="${o.id}" aria-label="Ações da OS ${o.numero}">${icon('mais')}</button></td></tr>`).join('') : '<tr><td colspan="9"><div class="empty" style="border:0">Nenhuma OS com esses filtros.</div></td></tr>'}
      </tbody></table></div>` : '<div class="empty">Nenhuma ordem de serviço ainda. Crie uma aqui ou direto de uma conversa no chat.</div>'}`;
}
async function clique(e) {
  const cv = e.target.closest('[data-conv]'); if (cv) { irPara('#/chat/' + cv.dataset.conv); return; }
  const r = e.target.closest('[data-res]');
  if (r) { const [acao, id] = r.dataset.res.split(':'); try { await rpc('resolver_encaminhamento', { p_id: id, p_acao: acao }); toast({ assumir: 'Atendimento assumido', devolver: 'Devolvido para quem encaminhou', recuperar: 'Cliente recuperado' }[acao]); await carregar(); if (acao !== 'devolver') { const p = pend.find((x) => x.id === id); if (p?.conversa?.id && acao === 'assumir') irPara('#/chat/' + p.conversa.id); } } catch (er) { falhou(er); } return; }
  const b = e.target.closest('[data-os]'); if (!b) return;
  const o = os.find((x) => x.id === b.dataset.os);
  menu(b, [['editar', 'Editar', 'editar'], ...Object.entries(ST_OS).filter(([k]) => k !== o.status).map(([k, v]) => ['st:' + k, 'Marcar como ' + v[0].toLowerCase()]),
    Number(o.conta_valor) > 0 ? ['conta', o.conta_paga ? 'Marcar conta como não paga' : 'Marcar conta como paga', 'check'] : null, o.conversa_id ? ['conv', 'Abrir conversa', 'chat'] : null],
  async (v) => {
    try {
      if (v === 'editar') return formOS(o, () => carregar());
      if (v === 'conv') return irPara('#/chat/' + o.conversa_id);
      const mud = v === 'conta' ? { conta_paga: !o.conta_paga } : { status: v.slice(3) };
      await q(S.sb.from('ordens_servico').update(mud).eq('id', o.id)); Object.assign(o, mud); tabelaOS(); toast('Ordem de serviço atualizada');
    } catch (er) { falhou(er); }
  });
}

// formulário usado também pelo chat
export function formOS(o0, onSalvo, ctx = {}) {
  const o = o0 || { status: 'aberta', custo_frete: 0, valor: 0, conta_valor: 0, cliente_id: ctx.cliente_id || null, conversa_id: ctx.conversa_id || null, responsavel_id: ctx.responsavel_id || responsavelPadrao() };
  const id = o0?.id; let cliId = o.cliente_id;
  const f = abrir(`<h3>${id ? 'Ordem de serviço ' + o.numero : 'Nova ordem de serviço'}</h3>
    <div class="field"><span class="lbl">Cliente</span><div style="display:flex;gap:8px;align-items:center"><b id="osCli">…</b><button type="button" class="btn sm" id="osTroca">Escolher</button></div></div>
    <div class="field"><label for="osT">Serviço *</label><input id="osT" name="titulo" required value="${esc(o.titulo)}" placeholder="Ex.: Troca de espuma do assento"></div>
    <div class="field"><label for="osD">Descrição</label><textarea id="osD" name="descricao">${esc(o.descricao)}</textarea></div>
    <div class="fields3"><div class="field"><label for="osS">Status</label><select id="osS" name="status">${Object.entries(ST_OS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
      <div class="field"><label for="osF">Custo do frete (R$)</label><input id="osF" name="custo_frete" type="number" min="0" step="0.01" value="${esc(o.custo_frete)}"></div>
      <div class="field"><label for="osV">Valor cobrado (R$)</label><input id="osV" name="valor" type="number" min="0" step="0.01" value="${esc(o.valor)}"></div></div>
    <fieldset style="border:1px solid var(--line-2);border-radius:8px;padding:10px;display:grid;gap:10px"><legend class="lbl" style="padding:0 6px">Conta a pagar (fornecedor, peça, frete)</legend>
      <div class="fields3"><div class="field"><label for="osCv">Valor (R$)</label><input id="osCv" name="conta_valor" type="number" min="0" step="0.01" value="${esc(o.conta_valor)}"></div>
      <div class="field"><label for="osCd">Vencimento</label><input id="osCd" name="conta_vencimento" type="date" value="${esc(o.conta_vencimento)}"></div>
      <label class="check-line" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="conta_paga" ${o.conta_paga ? 'checked' : ''}> Já paga</label></div></fieldset>
    ${campoResponsavel(o.responsavel_id)}
    ${rodape({ excluir: !!id, salvar: id ? 'Salvar' : 'Criar ordem de serviço' })}`,
  async (d) => {
    const dados = { titulo: d.titulo.trim(), descricao: d.descricao.trim(), status: d.status, custo_frete: Number(d.custo_frete) || 0, valor: Number(d.valor) || 0,
      conta_valor: Number(d.conta_valor) || 0, conta_vencimento: d.conta_vencimento || null, conta_paga: d.conta_paga === 'on', cliente_id: cliId || null,
      responsavel_id: lider() ? d.responsavel_id : (o.responsavel_id || S.me.id) };
    if (!id) Object.assign(dados, { empresa_id: S.empresaId, conversa_id: o.conversa_id || null });
    const r = id ? await q(S.sb.from('ordens_servico').update(dados).eq('id', id).select().single()) : await q(S.sb.from('ordens_servico').insert(dados).select().single());
    toast(id ? 'Ordem de serviço salva' : `Ordem de serviço ${r.numero} criada`); onSalvo?.(r);
  },
  async () => { await q(S.sb.from('ordens_servico').delete().eq('id', id)); toast('Ordem de serviço excluída'); onSalvo?.(null); });
  (cliId ? S.sb.from('clientes').select('nome').eq('id', cliId).maybeSingle().then((r) => r.data?.nome || 'Contato') : Promise.resolve('Nenhum contato escolhido')).then((n) => { const x = f.querySelector('#osCli'); if (x) x.textContent = n; });
  f.querySelector('#osTroca').onclick = () => {
    const v = Object.fromEntries(new FormData(f).entries()); v.conta_paga = v.conta_paga === 'on';
    escolherContato('Cliente da ordem de serviço', (c) => formOS({ ...o, ...v, id, cliente_id: c.id }, onSalvo, ctx));
  };
}
