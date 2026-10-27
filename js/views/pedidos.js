// Pedidos
import { S, $, esc, q, abrir, rodape, toast, falhou, icon, menu, brl, fmtDataHora, isoDia, norm, debounce, lider, nomePessoa,
  campoResponsavel, responsavelPadrao, buscarTudo, baixarCsv, opcoesPessoas } from '../core.js';
import { escolherContato } from '../comum.js';

export const ST_PED = { aberto: ['Aberto', 'info'], em_andamento: ['Em andamento', 'gold'], pago: ['Pago', 'good'], cancelado: ['Cancelado', 'bad'] };
export const FORMAS = { '': 'Não definido', pix: 'Pix', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', dinheiro: 'Dinheiro', boleto: 'Boleto', transferencia: 'Transferência', outro: 'Outro' };
const POR_PAG = 25;
const F = { busca: '', status: '', data: '', etq: '', pessoa: '', pag: 1 };
let el, ped = [], clientes = new Map(), etqCli = new Map();

export default {
  async render(root) {
    el = root;
    el.innerHTML = `<div class="bar"><div><h2>Pedidos</h2><p class="sub">Controle dos pedidos com status, pagamento e valor.</p></div>
      <div class="bar-r"><button class="btn" id="pdExp">Exportar</button><button class="btn pri" id="pdNovo">${icon('mais2')}Novo pedido</button></div></div>
      <div class="panel" style="margin-bottom:14px"><div class="filtros" style="margin:0">
        <div class="field" style="flex:2"><label for="pdB">Buscar</label><input type="search" id="pdB" placeholder="Número, produto ou cliente" value="${esc(F.busca)}"></div>
        <div class="field"><label for="pdS">Status</label><select id="pdS"><option value="">Todos os status</option>${Object.entries(ST_PED).map(([k, v]) => `<option value="${k}" ${F.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
        <div class="field curto"><label for="pdD">Data</label><input type="date" id="pdD" value="${F.data}"></div>
        <div class="field"><label for="pdE">Etiqueta do cliente</label><select id="pdE"><option value="">Todas as etiquetas</option>${S.etiquetas.map((e) => `<option value="${e.id}" ${F.etq === e.id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>
        ${lider() ? `<div class="field"><label for="pdP">Atendente</label><select id="pdP"><option value="">Todos</option>${opcoesPessoas(F.pessoa)}</select></div>` : ''}
      </div></div>
      <div class="kgrid" id="pdK" style="margin-bottom:14px"></div>
      <div id="pdTab"><div class="empty">Carregando pedidos…</div></div>`;
    $('#pdNovo').onclick = () => formPedido(null, () => carregar());
    $('#pdExp').onclick = exportar;
    $('#pdB').oninput = debounce((e) => { F.busca = e.target.value; F.pag = 1; tabela(); }, 200);
    for (const [s, k] of [['#pdS', 'status'], ['#pdD', 'data'], ['#pdE', 'etq'], ['#pdP', 'pessoa']]) $(s)?.addEventListener('change', (e) => { F[k] = e.target.value; F.pag = 1; tabela(); });
    $('#pdTab').onclick = clique;
    await carregar();
  },
};

async function carregar() {
  try {
    const porEmp = (x) => x.eq('empresa_id', S.empresaId);
    const [p, cs, et] = await Promise.all([
      buscarTudo('pedidos', porEmp, '*', 'numero'),
      buscarTudo('clientes', porEmp, 'id,nome,telefone', null),
      buscarTudo('cliente_etiquetas', porEmp, 'cliente_id,etiqueta_id', null),
    ]);
    ped = p.reverse(); clientes = new Map(cs.map((c) => [c.id, c])); etqCli = new Map();
    for (const r of et) { if (!etqCli.has(r.cliente_id)) etqCli.set(r.cliente_id, []); etqCli.get(r.cliente_id).push(r.etiqueta_id); }
    tabela();
  } catch (e) { falhou(e); }
}
function filtrados() {
  const b = norm(F.busca);
  return ped.filter((p) => {
    if (F.status && p.status !== F.status) return false;
    if (F.data && isoDia(new Date(p.criado_em)) !== F.data) return false;
    if (F.pessoa && p.responsavel_id !== F.pessoa) return false;
    if (F.etq && !(etqCli.get(p.cliente_id) || []).includes(F.etq)) return false;
    if (b && !norm(`${p.numero} ${p.produto} ${clientes.get(p.cliente_id)?.nome || ''}`).includes(b)) return false;
    return true;
  });
}
function tabela() {
  const l = filtrados(); const tot = l.length; const pags = Math.max(1, Math.ceil(tot / POR_PAG)); F.pag = Math.min(F.pag, pags);
  const val = l.filter((p) => p.status !== 'cancelado');
  $('#pdK').innerHTML = `<div class="k"><div class="lb">Pedidos</div><div class="vl">${tot}</div><div class="sub">com os filtros atuais</div></div>
    <div class="k"><div class="lb">Valor (sem cancelados)</div><div class="vl">${brl(val.reduce((a, p) => a + Number(p.total), 0))}</div></div>
    <div class="k"><div class="lb">Pagos</div><div class="vl">${l.filter((p) => p.status === 'pago').length}</div></div>
    <div class="k"><div class="lb">Pagamento pendente</div><div class="vl">${val.filter((p) => p.pagamento_status === 'pendente').length}</div></div>`;
  const box = $('#pdTab');
  if (!ped.length) { box.innerHTML = '<div class="empty">Nenhum pedido ainda. Clique em <b>Novo pedido</b> ou crie direto de uma conversa no chat.</div>'; return; }
  const pg = l.slice((F.pag - 1) * POR_PAG, F.pag * POR_PAG);
  box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Nº</th><th>Produto</th><th>Cliente</th><th>Atendente</th><th>Status</th><th>Pagamento</th><th>Atualizado</th><th class="r">Total</th><th class="r">Ações</th></tr></thead><tbody>
    ${pg.length ? pg.map((p) => `<tr><td><b>${p.numero}</b></td><td>${esc(p.produto) || '<span class="s">—</span>'}${Number(p.quantidade) !== 1 ? `<div class="s">${String(p.quantidade).replace('.', ',')} un.</div>` : ''}</td>
      <td>${esc(clientes.get(p.cliente_id)?.nome || '—')}</td><td>${esc(nomePessoa(p.responsavel_id))}</td>
      <td><span class="chip ${ST_PED[p.status][1]}">${ST_PED[p.status][0]}</span></td>
      <td>${FORMAS[p.pagamento_forma]}<div class="s">${p.pagamento_status === 'confirmado' ? 'Confirmado' : 'Pendente'}</div></td>
      <td class="s">${fmtDataHora(p.atualizado_em)}</td><td class="r"><b>${brl(p.total)}</b></td>
      <td class="r"><button class="icon-btn" data-pd="${p.id}" aria-label="Ações do pedido ${p.numero}">${icon('mais')}</button></td></tr>`).join('')
      : '<tr><td colspan="9"><div class="empty" style="border:0">Nenhum pedido com esses filtros.</div></td></tr>'}</tbody></table>
    <div class="pag"><span>Mostrando ${tot ? (F.pag - 1) * POR_PAG + 1 : 0}–${Math.min(F.pag * POR_PAG, tot)} de ${tot} pedidos</span>
      <div><button class="btn sm" data-pg="-1" ${F.pag <= 1 ? 'disabled' : ''}>Anterior</button><span>${F.pag}/${pags}</span><button class="btn sm" data-pg="1" ${F.pag >= pags ? 'disabled' : ''}>Próxima</button></div></div></div>`;
}
function clique(e) {
  const pg = e.target.closest('[data-pg]'); if (pg) { F.pag += Number(pg.dataset.pg); tabela(); return; }
  const b = e.target.closest('[data-pd]'); if (!b) return;
  const p = ped.find((x) => x.id === b.dataset.pd);
  menu(b, [['editar', 'Editar pedido', 'editar'], '-', ...Object.entries(ST_PED).filter(([k]) => k !== p.status).map(([k, v]) => ['st:' + k, 'Marcar como ' + v[0].toLowerCase()]),
    p.pagamento_status === 'pendente' ? ['pg', 'Confirmar pagamento', 'check'] : ['pgx', 'Voltar pagamento para pendente'], p.conversa_id ? ['conv', 'Abrir conversa', 'chat'] : null],
  async (v) => {
    try {
      if (v === 'editar') return formPedido(p, () => carregar());
      if (v === 'conv') { location.hash = '#/chat/' + p.conversa_id; return; }
      const mud = v.startsWith('st:') ? { status: v.slice(3) } : { pagamento_status: v === 'pg' ? 'confirmado' : 'pendente' };
      if (mud.status === 'pago') mud.pagamento_status = 'confirmado';
      await q(S.sb.from('pedidos').update(mud).eq('id', p.id)); Object.assign(p, mud, { atualizado_em: new Date().toISOString() }); tabela(); toast('Pedido atualizado');
    } catch (er) { falhou(er); }
  });
}
function exportar() {
  baixarCsv('pedidos.csv', [['Número', 'Produto', 'Quantidade', 'Cliente', 'Atendente', 'Status', 'Pagamento', 'Situação do pagamento', 'Criado em', 'Total', 'Observações'],
    ...filtrados().map((p) => [p.numero, p.produto, String(p.quantidade).replace('.', ','), clientes.get(p.cliente_id)?.nome || '', nomePessoa(p.responsavel_id), ST_PED[p.status][0], FORMAS[p.pagamento_forma], p.pagamento_status, fmtDataHora(p.criado_em), String(p.total).replace('.', ','), p.obs])]);
}

// formulário usado também pelo chat e pelos contatos
export function formPedido(p, onSalvo, ctx = {}) {
  const o = p || { status: 'aberto', pagamento_forma: '', pagamento_status: 'pendente', quantidade: 1, total: '', cliente_id: ctx.cliente_id || null, conversa_id: ctx.conversa_id || null, responsavel_id: ctx.responsavel_id || responsavelPadrao() };
  const id = p?.id; let cliId = o.cliente_id;
  const nomeCli = async () => cliId ? ((await S.sb.from('clientes').select('nome').eq('id', cliId).maybeSingle()).data?.nome || 'Contato') : 'Nenhum contato escolhido';
  const f = abrir(`<h3>${id ? 'Pedido ' + o.numero : 'Novo pedido'}</h3>
    <div class="field"><span class="lbl">Cliente</span><div style="display:flex;gap:8px;align-items:center"><b id="pfCli">…</b><button type="button" class="btn sm" id="pfTroca">Escolher</button></div></div>
    <div class="field"><label for="pfP">Produto *</label><input id="pfP" name="produto" required value="${esc(o.produto)}" placeholder="Ex.: Sofá retrátil 2,30m cinza"></div>
    <div class="fields2"><div class="field"><label for="pfQ">Quantidade</label><input id="pfQ" name="quantidade" type="number" min="0" step="0.01" value="${esc(o.quantidade)}"></div>
      <div class="field"><label for="pfT">Total (R$) *</label><input id="pfT" name="total" type="number" min="0" step="0.01" inputmode="decimal" required value="${esc(o.total)}"></div></div>
    <div class="fields3"><div class="field"><label for="pfS">Status</label><select id="pfS" name="status">${Object.entries(ST_PED).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
      <div class="field"><label for="pfF">Forma de pagamento</label><select id="pfF" name="pagamento_forma">${Object.entries(FORMAS).map(([k, v]) => `<option value="${k}" ${o.pagamento_forma === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label for="pfPs">Pagamento</label><select id="pfPs" name="pagamento_status"><option value="pendente" ${o.pagamento_status === 'pendente' ? 'selected' : ''}>Pendente</option><option value="confirmado" ${o.pagamento_status === 'confirmado' ? 'selected' : ''}>Confirmado</option></select></div></div>
    ${campoResponsavel(o.responsavel_id)}
    <div class="field"><label for="pfO">Observações</label><textarea id="pfO" name="obs">${esc(o.obs)}</textarea></div>
    ${rodape({ excluir: !!id, salvar: id ? 'Salvar' : 'Criar pedido' })}`,
  async (d) => {
    const dados = { produto: d.produto.trim(), quantidade: Number(d.quantidade) || 1, total: Number(d.total) || 0, status: d.status, pagamento_forma: d.pagamento_forma, pagamento_status: d.status === 'pago' ? 'confirmado' : d.pagamento_status, obs: d.obs.trim(), cliente_id: cliId || null,
      responsavel_id: lider() ? d.responsavel_id : (o.responsavel_id || S.me.id) };
    if (!dados.responsavel_id || dados.responsavel_id === 'undefined') dados.responsavel_id = S.me.id;
    if (!id) Object.assign(dados, { empresa_id: S.empresaId, conversa_id: o.conversa_id || null });
    const r = id ? await q(S.sb.from('pedidos').update(dados).eq('id', id).select().single()) : await q(S.sb.from('pedidos').insert(dados).select().single());
    toast(id ? 'Pedido salvo' : `Pedido ${r.numero} criado`); onSalvo?.(r);
  },
  async () => { await q(S.sb.from('pedidos').delete().eq('id', id)); toast('Pedido excluído'); onSalvo?.(null); });
  nomeCli().then((n) => { const x = f.querySelector('#pfCli'); if (x) x.textContent = n; });
  f.querySelector('#pfTroca').onclick = () => {
    const html = f.innerHTML; const vals = Object.fromEntries(new FormData(f).entries());
    escolherContato('Cliente do pedido', (c) => { cliId = c.id; formPedido({ ...o, ...vals, id, cliente_id: c.id, total: vals.total, quantidade: vals.quantidade }, onSalvo, ctx); void html; });
  };
}
