// Funil de vendas (negócios)
import { S, $, esc, q, abrir, rodape, toast, falhou, icon, brl, hoje, lider, nomePessoa, campoResponsavel, responsavelPadrao, buscarTudo, opcoesPessoas } from '../core.js';
import { escolherContato } from '../comum.js';

const ETAPAS = [
  { id: 'novo', nome: 'Novo contato', cor: 'var(--muted)' }, { id: 'contato', nome: 'Em contato', cor: 'var(--info)' },
  { id: 'proposta', nome: 'Proposta enviada', cor: 'var(--gold)' }, { id: 'negociando', nome: 'Negociando', cor: 'var(--rust)' },
  { id: 'ganho', nome: 'Fechado (ganho)', cor: 'var(--good)' }, { id: 'perdido', nome: 'Perdido', cor: 'var(--bad)' },
];
const FECHADAS = ['ganho', 'perdido'];
let el, negs = [], nomes = new Map(), pessoaF = '';

export default {
  async render(root) {
    el = root;
    el.innerHTML = `<div class="bar"><div><h2>Funil de vendas</h2><p class="sub">Os negócios em andamento, do primeiro contato ao fechamento.</p></div>
      <div class="bar-r">${lider() ? `<select id="fnP" aria-label="Pessoa"><option value="">Todos</option>${opcoesPessoas(pessoaF)}</select>` : ''}<button class="btn pri" id="fnNovo">${icon('mais2')}Novo negócio</button></div></div>
      <div class="board-wrap"><div class="board" id="board"><div class="empty">Carregando…</div></div></div>`;
    $('#fnNovo').onclick = () => form();
    $('#fnP')?.addEventListener('change', (e) => { pessoaF = e.target.value; desenhar(); });
    $('#board').onclick = (e) => { const b = e.target.closest('[data-ed]'); if (b) form(negs.find((n) => n.id === b.dataset.ed)); };
    $('#board').onchange = mover;
    await carregar();
  },
};
async function carregar() {
  try {
    negs = await buscarTudo('negocios', (x) => x.eq('empresa_id', S.empresaId));
    const ids = [...new Set(negs.map((n) => n.cliente_id).filter(Boolean))];
    nomes = new Map(ids.length ? (await q(S.sb.from('clientes').select('id,nome').in('id', ids.slice(0, 500)))).map((c) => [c.id, c.nome]) : []);
    desenhar();
  } catch (e) { falhou(e); }
}
function desenhar() {
  const l = negs.filter((n) => !pessoaF || n.responsavel_id === pessoaF);
  const soma = (a) => a.reduce((t, n) => t + Number(n.valor || 0), 0);
  $('#board').innerHTML = ETAPAS.map((et) => {
    const ns = l.filter((n) => n.etapa === et.id).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    return `<div class="col" style="--stage:${et.cor}"><div class="col-h"><b>${et.nome}</b><span class="small muted">${ns.length} · ${brl(soma(ns))}</span></div>
      ${ns.length ? ns.map((n) => `<div class="card"><div class="t">${esc(n.titulo)}</div>
        <div class="meta"><span>${esc(nomes.get(n.cliente_id) || 'Sem cliente')}</span><b>${brl(n.valor)}</b></div>
        ${lider() ? `<div class="meta"><span>${esc(nomePessoa(n.responsavel_id))}</span></div>` : ''}
        <div class="meta"><select data-mv="${n.id}" aria-label="Mover etapa">${ETAPAS.map((e) => `<option value="${e.id}" ${e.id === n.etapa ? 'selected' : ''}>${e.nome}</option>`).join('')}</select>
        <button class="btn sm" data-ed="${n.id}">Editar</button></div></div>`).join('') : '<div class="small muted" style="padding:6px 4px">Vazio</div>'}</div>`;
  }).join('');
}
async function mover(e) {
  const s = e.target.closest('[data-mv]'); if (!s) return;
  const n = negs.find((x) => x.id === s.dataset.mv); const et = s.value;
  const fechado_em = FECHADAS.includes(et) ? (FECHADAS.includes(n.etapa) && n.fechado_em ? n.fechado_em : hoje()) : null;
  try { await q(S.sb.from('negocios').update({ etapa: et, fechado_em }).eq('id', n.id)); Object.assign(n, { etapa: et, fechado_em }); toast('Movido para ' + ETAPAS.find((x) => x.id === et).nome); desenhar(); }
  catch (er) { falhou(er); desenhar(); }
}
function form(n, vals) {
  const o = { ...(n || { etapa: 'novo', responsavel_id: responsavelPadrao(), cliente_id: null }), ...(vals || {}) };
  const id = n?.id;
  const f = abrir(`<h3>${id ? 'Editar negócio' : 'Novo negócio'}</h3>
    <div class="field"><label for="ngT">O que está sendo vendido *</label><input id="ngT" name="titulo" required placeholder="Ex.: Jogo de sofá e mesa" value="${esc(o.titulo)}"></div>
    <div class="field"><span class="lbl">Cliente</span><div style="display:flex;gap:8px;align-items:center"><b>${esc(nomes.get(o.cliente_id) || (o.cliente_id ? 'Contato' : 'Sem cliente'))}</b><button type="button" class="btn sm" id="ngCli">Escolher</button></div></div>
    <div class="fields2"><div class="field"><label for="ngV">Valor (R$)</label><input id="ngV" name="valor" type="number" min="0" step="0.01" value="${esc(o.valor)}"></div>
      <div class="field"><label for="ngE">Etapa</label><select id="ngE" name="etapa">${ETAPAS.map((e) => `<option value="${e.id}" ${e.id === o.etapa ? 'selected' : ''}>${e.nome}</option>`).join('')}</select></div></div>
    ${campoResponsavel(o.responsavel_id)}
    <div class="field"><label for="ngO">Observações</label><textarea id="ngO" name="obs">${esc(o.obs)}</textarea></div>
    ${rodape({ excluir: !!id })}`,
  async (d) => {
    const dados = { titulo: d.titulo.trim(), valor: Number(d.valor) || 0, etapa: d.etapa, obs: d.obs.trim(), cliente_id: o.cliente_id || null, responsavel_id: lider() ? d.responsavel_id : (o.responsavel_id || S.me.id) };
    dados.fechado_em = FECHADAS.includes(d.etapa) ? (FECHADAS.includes(n?.etapa) && n?.fechado_em ? n.fechado_em : hoje()) : null;
    if (!id) dados.empresa_id = S.empresaId;
    if (id) await q(S.sb.from('negocios').update(dados).eq('id', id)); else await q(S.sb.from('negocios').insert(dados));
    toast(id ? 'Negócio salvo' : 'Negócio criado'); carregar();
  },
  async () => { await q(S.sb.from('negocios').delete().eq('id', id)); toast('Negócio excluído'); carregar(); });
  f.querySelector('#ngCli').onclick = () => {
    const v = Object.fromEntries(new FormData(f).entries());
    escolherContato('Cliente do negócio', (c) => { nomes.set(c.id, c.nome); form(n, { ...v, cliente_id: c.id }); });
  };
}
