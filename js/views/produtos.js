// Catálogo de produtos
import { S, $, esc, q, abrir, rodape, toast, falhou, icon, brl, norm, debounce, lider, buscarTudo, enviarArquivo, confirmar } from '../core.js';
import { resolverMidias, escolherDaGaleria } from '../comum.js';

const F = { busca: '', cat: '', inativos: false };
let el, lista = [];

export default {
  async render(root) {
    el = root;
    el.innerHTML = `<div class="bar"><div><h2>Produtos</h2><p class="sub">O catálogo com foto e preço. No chat, envie um produto com um clique; nos pedidos e orçamentos, o preço já vem preenchido.</p></div>
      <div class="bar-r">${lider() ? `<button class="btn pri" id="pdNovo">${icon('mais2')}Novo produto</button>` : ''}</div></div>
      <div class="panel" style="margin-bottom:14px"><div class="filtros" style="margin:0">
        <div class="field" style="flex:2"><label for="prB">Buscar</label><input type="search" id="prB" placeholder="Nome ou código"></div>
        <div class="field"><label for="prC">Categoria</label><select id="prC"><option value="">Todas</option></select></div>
        ${lider() ? '<label class="check-line"><input type="checkbox" id="prI"> Mostrar inativos</label>' : ''}
      </div></div><div id="prLista"><div class="empty">Carregando…</div></div>`;
    $('#pdNovo') && ($('#pdNovo').onclick = () => form());
    $('#prB').oninput = debounce((e) => { F.busca = e.target.value; desenhar(); }, 200);
    $('#prC').onchange = (e) => { F.cat = e.target.value; desenhar(); };
    $('#prI')?.addEventListener('change', (e) => { F.inativos = e.target.checked; desenhar(); });
    $('#prLista').onclick = (e) => { const b = e.target.closest('[data-pr]'); if (b && lider()) form(lista.find((p) => p.id === b.dataset.pr)); };
    await carregar();
  },
};
async function carregar() {
  try { lista = await buscarTudo('produtos', (x) => x.eq('empresa_id', S.empresaId), '*', 'nome'); }
  catch (e) { falhou(e); return; }
  const cats = [...new Set(lista.map((p) => p.categoria).filter(Boolean))].sort();
  $('#prC').innerHTML = '<option value="">Todas</option>' + cats.map((c) => `<option ${c === F.cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
  desenhar();
}
function desenhar() {
  const b = norm(F.busca);
  const l = lista.filter((p) => (F.inativos || p.ativo) && (!F.cat || p.categoria === F.cat) && (!b || norm(p.nome + ' ' + p.codigo).includes(b)));
  const box = $('#prLista');
  if (!lista.length) { box.innerHTML = `<div class="empty">Nenhum produto cadastrado ainda.${lider() ? ' Clique em <b>Novo produto</b> e coloque foto, preço e descrição.' : ' Peça para o seu gerente cadastrar.'}</div>`; return; }
  box.innerHTML = l.length ? `<div class="pick" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));max-height:none">${l.map((p) => `
    <button type="button" data-pr="${p.id}" style="align-items:stretch;text-align:left;padding:8px;cursor:${lider() ? 'pointer' : 'default'}">
      ${p.foto_path ? `<img data-path="${esc(p.foto_path)}" alt="" style="height:140px">` : `<span class="ic" style="height:140px">${icon('pedidos')}</span>`}
      <b style="font-size:14px;white-space:normal">${esc(p.nome)}</b>
      <span class="small muted">${esc([p.codigo, p.categoria].filter(Boolean).join(' · '))}${p.ativo ? '' : ' · inativo'}</span>
      <b style="font-size:16px;color:var(--accent)">${brl(p.preco)}</b></button>`).join('')}</div>` : '<div class="empty">Nenhum produto com esses filtros.</div>';
  resolverMidias(box);
}
function form(p, extra) {
  const o = { ...(p || { ativo: true, preco: '' }), ...(extra || {}) };
  let foto = { path: o.foto_path, mime: o.foto_mime };
  const f = abrir(`<h3>${p ? 'Editar produto' : 'Novo produto'}</h3>
    <div class="field"><label for="prN">Nome *</label><input id="prN" name="nome" required value="${esc(o.nome)}" placeholder="Ex.: Sofá retrátil Albany 2,30m"></div>
    <div class="fields3"><div class="field"><label for="prP">Preço (R$) *</label><input id="prP" name="preco" type="number" min="0" step="0.01" required value="${esc(o.preco)}"></div>
      <div class="field"><label for="prCo">Código</label><input id="prCo" name="codigo" value="${esc(o.codigo)}"></div>
      <div class="field"><label for="prCa">Categoria</label><input id="prCa" name="categoria" list="prCats" value="${esc(o.categoria)}" placeholder="Ex.: Sofás"><datalist id="prCats">${[...new Set(lista.map((x) => x.categoria).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div></div>
    <div class="field"><label for="prD">Descrição (vai junto quando enviar no chat)</label><textarea id="prD" name="descricao" placeholder="Medidas, cores, tecido, prazo de entrega">${esc(o.descricao)}</textarea></div>
    <div class="field"><span class="lbl">Foto</span><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span id="prFotoPrev"></span>
      <button type="button" class="btn sm" id="prUp">Enviar foto</button><button type="button" class="btn sm" id="prGal">Escolher da galeria</button><button type="button" class="btn sm ghost" id="prSem">Sem foto</button></div>
      <input type="file" id="prArq" accept="image/*" hidden></div>
    <label class="check-line"><input type="checkbox" name="ativo" ${o.ativo ? 'checked' : ''}> Produto ativo (desmarque para esconder do catálogo)</label>
    ${rodape({ excluir: !!p })}`,
  async (d) => {
    const dados = { nome: d.nome.trim(), preco: Number(d.preco) || 0, codigo: d.codigo.trim(), categoria: d.categoria.trim(), descricao: d.descricao.trim(), ativo: d.ativo === 'on', foto_path: foto.path || null, foto_mime: foto.mime || null };
    if (p) await q(S.sb.from('produtos').update(dados).eq('id', p.id)); else await q(S.sb.from('produtos').insert({ ...dados, empresa_id: S.empresaId }));
    toast(p ? 'Produto salvo' : 'Produto cadastrado'); carregar();
  },
  async () => { await q(S.sb.from('produtos').delete().eq('id', p.id)); toast('Produto excluído'); carregar(); });
  const prev = () => { f.querySelector('#prFotoPrev').innerHTML = foto.path ? `<img class="thumb" style="width:64px;height:64px" data-path="${esc(foto.path)}" alt="">` : '<span class="small muted">Nenhuma foto</span>'; resolverMidias(f); };
  prev();
  f.querySelector('#prUp').onclick = () => f.querySelector('#prArq').click();
  f.querySelector('#prArq').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5 * 1048576) { toast('A foto pode ter até 5 MB (limite do WhatsApp).', true); return; }
    try { foto = { path: await enviarArquivo('produtos', file), mime: file.type }; prev(); } catch (er) { falhou(er); }
  };
  f.querySelector('#prGal').onclick = () => {
    const vals = Object.fromEntries(new FormData(f).entries());
    escolherDaGaleria((arqs) => { const a = arqs.find((x) => /^image\//.test(x.mime)); form(p, { ...vals, ativo: vals.ativo === 'on', foto_path: a?.path || foto.path, foto_mime: a?.mime || foto.mime }); });
  };
  f.querySelector('#prSem').onclick = () => { foto = {}; prev(); };
}

// usado pelo chat e pelos pedidos: escolher um produto do catálogo
export async function escolherProduto(titulo, onEscolher) {
  const ps = await buscarTudo('produtos', (x) => x.eq('empresa_id', S.empresaId).eq('ativo', true), '*', 'nome');
  let busca = '';
  const grade = () => {
    const l = ps.filter((p) => !busca || norm(p.nome + ' ' + p.codigo + ' ' + p.categoria).includes(norm(busca)));
    return l.length ? `<div class="pick" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${l.map((p) => `<button type="button" data-p="${p.id}">${p.foto_path ? `<img data-path="${esc(p.foto_path)}" alt="">` : `<span class="ic">${icon('pedidos')}</span>`}<span title="${esc(p.nome)}">${esc(p.nome)}</span><b>${brl(p.preco)}</b></button>`).join('')}</div>`
      : `<div class="empty">${ps.length ? 'Nenhum produto encontrado.' : 'O catálogo está vazio. O gerente cadastra os produtos na tela Produtos.'}</div>`;
  };
  const f = abrir(`<div class="dlg-h"><h3>${esc(titulo)}</h3></div><input type="search" id="epB" placeholder="Buscar produto" aria-label="Buscar produto"><div id="epG">${grade()}</div>
    <div class="dlg-actions"><div class="r"><button type="button" class="btn" id="f-cancel">Cancelar</button></div></div>`, null, null, { largo: true });
  resolverMidias(f);
  f.querySelector('#epB').oninput = (e) => { busca = e.target.value; f.querySelector('#epG').innerHTML = grade(); resolverMidias(f); };
  f.querySelector('#epG').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { const p = ps.find((x) => x.id === b.dataset.p); (async () => { const { fechar } = await import('../core.js'); fechar(); onEscolher(p); })(); } };
}
