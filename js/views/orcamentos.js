// Orçamentos: monta, gera PDF, envia no chat e converte em pedido
import { S, $, $$, esc, q, rpc, api, abrir, rodape, fechar, toast, falhou, icon, menu, brl, fmtData, fmtDataHora, isoDia, norm, debounce,
  lider, nomePessoa, campoResponsavel, responsavelPadrao, buscarTudo, opcoesPessoas, uid, urlArquivo, fmtTel } from '../core.js';
import { irPara, empresaAtual } from '../app.js';
import { escolherContato, verMidia } from '../comum.js';
import { Pdf } from '../pdf.js';

export const ST_ORC = { rascunho: ['Rascunho', 'mute'], enviado: ['Enviado', 'info'], aprovado: ['Aprovado', 'good'], recusado: ['Recusado', 'bad'] };
const F = { busca: '', status: '', pessoa: '' };
let el, orcs = [], clientes = new Map();

export default {
  async render(root) {
    el = root;
    el.innerHTML = `<div class="bar"><div><h2>Orçamentos</h2><p class="sub">Monte o orçamento com os produtos do catálogo, envie o PDF para o cliente e transforme em pedido quando ele aprovar.</p></div>
      <div class="bar-r"><button class="btn pri" id="obNovo">${icon('mais2')}Novo orçamento</button></div></div>
      <div class="panel" style="margin-bottom:14px"><div class="filtros" style="margin:0">
        <div class="field" style="flex:2"><label for="obB">Buscar</label><input type="search" id="obB" placeholder="Número ou cliente"></div>
        <div class="field"><label for="obS">Status</label><select id="obS"><option value="">Todos</option>${Object.entries(ST_ORC).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></div>
        ${lider() ? `<div class="field"><label for="obP">Vendedor</label><select id="obP"><option value="">Todos</option>${opcoesPessoas('')}</select></div>` : ''}
      </div></div><div id="obTab"><div class="empty">Carregando…</div></div>`;
    $('#obNovo').onclick = () => escolherContato('Cliente do orçamento', (c) => formOrcamento(null, () => carregar(), { cliente_id: c.id }));
    $('#obB').oninput = debounce((e) => { F.busca = e.target.value; tabela(); }, 200);
    $('#obS').onchange = (e) => { F.status = e.target.value; tabela(); };
    $('#obP')?.addEventListener('change', (e) => { F.pessoa = e.target.value; tabela(); });
    $('#obTab').onclick = clique;
    await carregar();
  },
};
async function carregar() {
  try {
    const porEmp = (x) => x.eq('empresa_id', S.empresaId);
    const [o, cs] = await Promise.all([buscarTudo('orcamentos', porEmp, '*', 'numero'), buscarTudo('clientes', porEmp, 'id,nome,telefone,whatsapp', null)]);
    orcs = o.reverse(); clientes = new Map(cs.map((c) => [c.id, c])); tabela();
  } catch (e) { falhou(e); }
}
function tabela() {
  const b = norm(F.busca);
  const l = orcs.filter((o) => (!F.status || o.status === F.status) && (!F.pessoa || o.responsavel_id === F.pessoa) && (!b || norm(`${o.numero} ${clientes.get(o.cliente_id)?.nome || ''}`).includes(b)));
  const box = $('#obTab');
  if (!orcs.length) { box.innerHTML = '<div class="empty">Nenhum orçamento ainda. Crie aqui ou direto de uma conversa no chat (menu ⋮ > Enviar orçamento).</div>'; return; }
  box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Nº</th><th>Cliente</th><th>Itens</th><th>Vendedor</th><th>Status</th><th>Validade</th><th class="r">Total</th><th class="r">Ações</th></tr></thead><tbody>
    ${l.length ? l.map((o) => `<tr><td><b>${o.numero}</b><div class="s">${fmtData(o.criado_em)}</div></td><td>${esc(clientes.get(o.cliente_id)?.nome || '—')}</td>
      <td class="s">${esc((o.itens || []).map((i) => i.descricao).join(', ').slice(0, 70))}</td><td>${esc(nomePessoa(o.responsavel_id))}</td>
      <td><span class="chip ${ST_ORC[o.status][1]}">${ST_ORC[o.status][0]}</span>${o.pedido_id ? ' <span class="chip good">Virou pedido</span>' : ''}</td>
      <td class="s">${o.validade ? fmtData(o.validade) : '—'}</td><td class="r"><b>${brl(o.total)}</b></td>
      <td class="r"><button class="icon-btn" data-ob="${o.id}" aria-label="Ações do orçamento ${o.numero}">${icon('mais')}</button></td></tr>`).join('')
      : '<tr><td colspan="8"><div class="empty" style="border:0">Nenhum orçamento com esses filtros.</div></td></tr>'}</tbody></table></div>`;
}
function clique(e) {
  const b = e.target.closest('[data-ob]'); if (!b) return;
  const o = orcs.find((x) => x.id === b.dataset.ob);
  menu(b, [['pdf', 'Ver PDF', 'doc'], ['editar', 'Editar', 'editar'], ['enviar', 'Enviar para o cliente no chat', 'enviar'], '-',
    o.status !== 'aprovado' ? ['aprovado', 'Marcar como aprovado', 'check'] : null, o.status !== 'recusado' ? ['recusado', 'Marcar como recusado', 'x'] : null,
    !o.pedido_id ? ['pedido', 'Transformar em pedido', 'pedidos'] : null, o.conversa_id ? ['conv', 'Abrir conversa', 'chat'] : null],
  async (v) => {
    try {
      if (v === 'pdf') { const path = await garantirPdf(o); verMidia(path, 'application/pdf', `orcamento-${o.numero}.pdf`); }
      if (v === 'editar') formOrcamento(o, () => carregar());
      if (v === 'enviar') { await enviarNoChat(o); await carregar(); }
      if (v === 'aprovado' || v === 'recusado') { await q(S.sb.from('orcamentos').update({ status: v }).eq('id', o.id)); toast('Orçamento ' + ST_ORC[v][0].toLowerCase()); carregar(); }
      if (v === 'pedido') { await virarPedido(o); carregar(); }
      if (v === 'conv') irPara('#/chat/' + o.conversa_id);
    } catch (er) { falhou(er); }
  });
}

/* ---------- formulário ---------- */
let produtosCache = null;
async function produtos() { if (!produtosCache) produtosCache = await buscarTudo('produtos', (x) => x.eq('empresa_id', S.empresaId).eq('ativo', true), 'id,nome,codigo,preco', 'nome').catch(() => []); return produtosCache; }
const validadePadrao = () => { const d = new Date(); d.setDate(d.getDate() + 7); return isoDia(d); };

export async function formOrcamento(o0, onSalvo, ctx = {}) {
  const ps = await produtos(); produtosCache = null;
  const o = o0 ? { ...o0, itens: (o0.itens || []).map((i) => ({ ...i })) } : { itens: [{ descricao: '', qtd: 1, preco: 0 }], desconto: 0, frete: 0, validade: validadePadrao(), condicoes: '', obs: '', cliente_id: ctx.cliente_id || null, conversa_id: ctx.conversa_id || null, responsavel_id: ctx.responsavel_id || responsavelPadrao() };
  const id = o0?.id;
  const cli = o.cliente_id ? (await S.sb.from('clientes').select('nome').eq('id', o.cliente_id).maybeSingle()).data : null;
  const linhas = () => o.itens.map((it, i) => `<div class="fields3" style="grid-template-columns:3fr 70px 120px 110px 36px;align-items:end;gap:8px" data-i="${i}">
      <div class="field"><label for="oi-d${i}">Item</label><input id="oi-d${i}" list="oiProd" data-k="descricao" value="${esc(it.descricao)}" placeholder="Produto ou serviço" required></div>
      <div class="field"><label for="oi-q${i}">Qtd</label><input id="oi-q${i}" type="number" min="0" step="0.01" data-k="qtd" value="${esc(it.qtd)}"></div>
      <div class="field"><label for="oi-p${i}">Valor unit. (R$)</label><input id="oi-p${i}" type="number" min="0" step="0.01" data-k="preco" value="${esc(it.preco)}"></div>
      <div class="field"><span class="lbl">Total</span><b style="padding:9px 0">${brl((Number(it.qtd) || 0) * (Number(it.preco) || 0))}</b></div>
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="Tirar item" ${o.itens.length < 2 ? 'disabled' : ''}>${icon('lixo')}</button></div>`).join('');
  const totais = () => {
    const sub = o.itens.reduce((a, i) => a + (Number(i.qtd) || 0) * (Number(i.preco) || 0), 0);
    return { sub, total: Math.max(0, sub - (Number(o.desconto) || 0) + (Number(o.frete) || 0)) };
  };
  const f = abrir(`<h3>${id ? 'Orçamento ' + o.numero : 'Novo orçamento'}</h3><p class="hint">Cliente: <b>${esc(cli?.nome || 'Sem cliente')}</b></p>
    <datalist id="oiProd">${ps.map((p) => `<option value="${esc(p.nome)}">${brl(p.preco)}</option>`).join('')}</datalist>
    <div id="oiLinhas" style="display:grid;gap:8px">${linhas()}</div>
    <button type="button" class="btn sm" id="oiAdd" style="justify-self:start">${icon('mais2')}Adicionar item</button>
    <div class="fields3"><div class="field"><label for="oiDesc">Desconto (R$)</label><input id="oiDesc" type="number" min="0" step="0.01" value="${esc(o.desconto)}"></div>
      <div class="field"><label for="oiFrete">Frete (R$)</label><input id="oiFrete" type="number" min="0" step="0.01" value="${esc(o.frete)}"></div>
      <div class="field"><label for="oiVal">Válido até</label><input id="oiVal" type="date" value="${esc(o.validade)}"></div></div>
    <div class="panel" style="background:var(--surface-2);display:flex;justify-content:space-between;align-items:center"><span>Subtotal <b id="oiSub"></b></span><span style="font-size:18px">Total <b id="oiTot"></b></span></div>
    <div class="field"><label for="oiCond">Condições de pagamento</label><input id="oiCond" value="${esc(o.condicoes)}" placeholder="Ex.: 10x sem juros no cartão ou 5% de desconto no Pix"></div>
    <div class="field"><label for="oiObs">Observações</label><textarea id="oiObs" style="min-height:60px">${esc(o.obs)}</textarea></div>
    ${campoResponsavel(o.responsavel_id)}
    ${rodape({ salvar: ctx.conversa_id || o.conversa_id ? 'Salvar e enviar no chat' : 'Salvar', extra: ctx.conversa_id || o.conversa_id ? '<button type="button" class="btn" id="oiSoSalvar">Só salvar</button>' : '' })}`,
  async (d) => salvar(d, true), null, { largo: true });
  const atualizar = () => { const t = totais(); f.querySelector('#oiSub').textContent = brl(t.sub); f.querySelector('#oiTot').textContent = brl(t.total); };
  atualizar();
  f.querySelector('#oiLinhas').oninput = (e) => {
    const inp = e.target.closest('[data-k]'); if (!inp) return;
    const i = Number(inp.closest('[data-i]').dataset.i); const k = inp.dataset.k;
    o.itens[i][k] = k === 'descricao' ? inp.value : inp.value;
    if (k === 'descricao') { const p = ps.find((x) => x.nome === inp.value); if (p) { o.itens[i].preco = p.preco; o.itens[i].produto_id = p.id; f.querySelector('#oi-p' + i).value = p.preco; } }
    const tot = inp.closest('[data-i]').querySelector('b'); tot.textContent = brl((Number(o.itens[i].qtd) || 0) * (Number(o.itens[i].preco) || 0));
    atualizar();
  };
  f.querySelector('#oiLinhas').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; o.itens.splice(Number(b.dataset.rm), 1); f.querySelector('#oiLinhas').innerHTML = linhas(); atualizar(); };
  f.querySelector('#oiAdd').onclick = () => { o.itens.push({ descricao: '', qtd: 1, preco: 0 }); f.querySelector('#oiLinhas').innerHTML = linhas(); atualizar(); f.querySelector('#oi-d' + (o.itens.length - 1)).focus(); };
  for (const [s, k] of [['#oiDesc', 'desconto'], ['#oiFrete', 'frete']]) f.querySelector(s).oninput = (e) => { o[k] = e.target.value; atualizar(); };
  const so = f.querySelector('#oiSoSalvar'); if (so) so.onclick = async () => { try { await salvar(Object.fromEntries(new FormData(f).entries()), false); fechar(); } catch (er) { const err = f.querySelector('#f-err'); err.textContent = er.message; err.hidden = false; } };

  async function salvar(d, enviar) {
    const itens = o.itens.map((i) => ({ descricao: String(i.descricao || '').trim(), qtd: Number(i.qtd) || 0, preco: Number(i.preco) || 0, produto_id: i.produto_id || null })).filter((i) => i.descricao);
    if (!itens.length) throw new Error('Coloque pelo menos um item.');
    const t = totais();
    const dados = { itens, subtotal: t.sub, desconto: Number(f.querySelector('#oiDesc').value) || 0, frete: Number(f.querySelector('#oiFrete').value) || 0, total: t.total,
      validade: f.querySelector('#oiVal').value || null, condicoes: f.querySelector('#oiCond').value.trim(), obs: f.querySelector('#oiObs').value.trim(), pdf_path: null,
      responsavel_id: lider() ? (d.responsavel_id || o.responsavel_id) : (o.responsavel_id || S.me.id) };
    if (!id) Object.assign(dados, { empresa_id: S.empresaId, cliente_id: o.cliente_id, conversa_id: o.conversa_id || ctx.conversa_id || null });
    let r = id ? await q(S.sb.from('orcamentos').update(dados).eq('id', id).select().single()) : await q(S.sb.from('orcamentos').insert(dados).select().single());
    await garantirPdf(r);
    if (enviar && (r.conversa_id)) { await enviarNoChat(r); toast(`Orçamento ${r.numero} enviado no chat`); }
    else toast(id ? 'Orçamento salvo' : `Orçamento ${r.numero} criado`);
    onSalvo?.(r);
  }
}

/* ---------- PDF ---------- */
export async function garantirPdf(o) {
  if (o.pdf_path) return o.pdf_path;
  const [cli, emp] = [o.cliente_id ? (await S.sb.from('clientes').select('nome,telefone,whatsapp,email').eq('id', o.cliente_id).maybeSingle()).data : null, empresaAtual()];
  const pdf = new Pdf(); const M = 48, R = pdf.W - 48; let y = 60;
  pdf.ret(0, 0, pdf.W, 8, { cor: '#0f6b5c' });
  pdf.texto(emp?.nome || 'Orçamento', M, y, { tam: 18, negrito: true }); pdf.texto('Orçamento nº ' + o.numero, R, y, { tam: 14, negrito: true, alinhar: 'dir', cor: '#0f6b5c' });
  y += 18; pdf.texto('Emitido em ' + fmtData(o.criado_em || new Date().toISOString()), R, y, { tam: 9, alinhar: 'dir', cor: '#5b6f6a' });
  if (o.validade) pdf.texto('Válido até ' + fmtData(o.validade), R, y + 12, { tam: 9, alinhar: 'dir', cor: '#5b6f6a' });
  y += 34; pdf.texto('Cliente', M, y, { tam: 9, cor: '#5b6f6a' }); y += 14;
  pdf.texto(cli?.nome || '-', M, y, { tam: 12, negrito: true }); y += 14;
  const contato = [fmtTel(cli?.whatsapp || cli?.telefone), cli?.email].filter(Boolean).join('   '); if (contato) { pdf.texto(contato, M, y, { tam: 9, cor: '#5b6f6a' }); y += 12; }
  y += 16;
  const cX = [M, 340, 410, R];
  pdf.ret(M, y - 13, R - M, 20, { cor: '#dcefe9' });
  pdf.texto('Item', cX[0] + 6, y, { tam: 9, negrito: true }); pdf.texto('Qtd', cX[1] + 30, y, { tam: 9, negrito: true, alinhar: 'dir' });
  pdf.texto('Valor unit.', cX[2] + 70, y, { tam: 9, negrito: true, alinhar: 'dir' }); pdf.texto('Total', R - 6, y, { tam: 9, negrito: true, alinhar: 'dir' });
  y += 20;
  for (const it of o.itens || []) {
    const ls = pdf.quebrar(it.descricao, cX[1] - cX[0] - 20, 10);
    if (y + ls.length * 13 > pdf.H - 140) { pdf.novaPagina(); y = 60; }
    ls.forEach((l, k) => pdf.texto(l, cX[0] + 6, y + k * 13, { tam: 10 }));
    pdf.texto(String(it.qtd).replace('.', ','), cX[1] + 30, y, { tam: 10, alinhar: 'dir' });
    pdf.texto(brl(it.preco), cX[2] + 70, y, { tam: 10, alinhar: 'dir' });
    pdf.texto(brl(it.qtd * it.preco), R - 6, y, { tam: 10, negrito: true, alinhar: 'dir' });
    y += ls.length * 13 + 6; pdf.linha(M, y - 2, R, y - 2); y += 10;
  }
  y += 6;
  const tl = (rot, val, neg) => { pdf.texto(rot, 400, y, { tam: neg ? 12 : 10, negrito: neg, alinhar: 'dir', cor: neg ? '#15302b' : '#5b6f6a' }); pdf.texto(val, R - 6, y, { tam: neg ? 12 : 10, negrito: neg, alinhar: 'dir' }); y += neg ? 20 : 15; };
  tl('Subtotal', brl(o.subtotal));
  if (Number(o.desconto)) tl('Desconto', '- ' + brl(o.desconto));
  if (Number(o.frete)) tl('Frete', brl(o.frete));
  pdf.linha(300, y - 9, R, y - 9, { cor: '#0f6b5c', esp: 1.2 }); y += 4; tl('Total', brl(o.total), true);
  y += 10;
  for (const [rot, txt] of [['Condições de pagamento', o.condicoes], ['Observações', o.obs]]) {
    if (!txt) continue;
    pdf.texto(rot, M, y, { tam: 9, cor: '#5b6f6a' }); y += 13;
    for (const l of pdf.quebrar(txt, R - M, 10)) { pdf.texto(l, M, y, { tam: 10 }); y += 13; }
    y += 8;
  }
  pdf.texto('Vendedor: ' + (nomePessoa(o.responsavel_id) || ''), M, pdf.H - 50, { tam: 9, cor: '#5b6f6a' });
  pdf.texto('Orçamento gerado pelo CRM Balcão', R, pdf.H - 50, { tam: 8, alinhar: 'dir', cor: '#93a8a2' });
  const arq = new File([pdf.blob()], `orcamento-${o.numero}.pdf`, { type: 'application/pdf' });
  const path = `${S.empresaId}/orcamentos/${uid()}-orcamento-${o.numero}.pdf`;
  const { error } = await S.sb.storage.from('arquivos').upload(path, arq, { contentType: 'application/pdf' });
  if (error) throw error;
  await q(S.sb.from('orcamentos').update({ pdf_path: path }).eq('id', o.id));
  o.pdf_path = path;
  return path;
}
export async function enviarNoChat(o) {
  const path = await garantirPdf(o);
  let conv = o.conversa_id;
  if (!conv) { if (!o.cliente_id) throw new Error('O orçamento não tem cliente.'); conv = await rpc('abrir_conversa', { p_cliente: o.cliente_id }); await q(S.sb.from('orcamentos').update({ conversa_id: conv }).eq('id', o.id)); o.conversa_id = conv; }
  const r = await api('enviar', { conversa_id: conv, tipo: 'documento', midia_path: path, midia_mime: 'application/pdf', midia_nome: `orcamento-${o.numero}.pdf`, texto: `Orçamento nº ${o.numero}: ${brl(o.total)}` });
  if (o.status === 'rascunho') await q(S.sb.from('orcamentos').update({ status: 'enviado' }).eq('id', o.id));
  if (r.aviso) toast(r.aviso, true);
  return r;
}
export async function virarPedido(o) {
  const produto = (o.itens || []).map((i) => (Number(i.qtd) !== 1 ? String(i.qtd).replace('.', ',') + 'x ' : '') + i.descricao).join(' + ').slice(0, 300);
  const p = await q(S.sb.from('pedidos').insert({ empresa_id: S.empresaId, responsavel_id: o.responsavel_id, cliente_id: o.cliente_id, conversa_id: o.conversa_id, produto, quantidade: 1, total: o.total, status: 'aberto', obs: `Do orçamento nº ${o.numero}${o.condicoes ? '. ' + o.condicoes : ''}` }).select().single());
  await q(S.sb.from('orcamentos').update({ status: 'aprovado', pedido_id: p.id }).eq('id', o.id));
  toast(`Pedido ${p.numero} criado a partir do orçamento ${o.numero}`);
  return p;
}
