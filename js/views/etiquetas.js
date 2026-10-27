// Etiquetas
import { S, $, esc, q, abrir, rodape, toast, falhou, icon, lider, etiquetaHtml, buscarTudo } from '../core.js';

let el, usos = new Map();
export default {
  async render(root) {
    el = root;
    el.innerHTML = `<div class="bar"><div><h2>Etiquetas</h2><p class="sub">Organize os contatos por motivo, produto ou situação. ${lider() ? 'Crie categorias para agrupar.' : 'Só gerentes criam e editam etiquetas.'}</p></div>
      <div class="bar-r">${lider() ? `<button class="btn pri" id="etNova">${icon('mais2')}Nova etiqueta</button>` : ''}</div></div><div id="etBox"></div>`;
    $('#etNova') && ($('#etNova').onclick = () => form());
    $('#etBox').onclick = (e) => { const b = e.target.closest('[data-et]'); if (b) form(S.etiquetas.find((x) => x.id === b.dataset.et)); };
    try {
      const ce = await buscarTudo('cliente_etiquetas', (x) => x.eq('empresa_id', S.empresaId), 'etiqueta_id', null);
      usos = new Map(); for (const r of ce) usos.set(r.etiqueta_id, (usos.get(r.etiqueta_id) || 0) + 1);
    } catch (e) {}
    desenhar();
  },
};
function desenhar() {
  const cats = new Map();
  for (const e of S.etiquetas) { if (!cats.has(e.categoria)) cats.set(e.categoria, []); cats.get(e.categoria).push(e); }
  $('#etBox').innerHTML = cats.size ? [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([c, es]) => `<div class="panel"><div class="panel-h"><h3>${esc(c)}</h3><span class="small muted">${es.length} etiqueta(s)</span></div>
    <div class="list">${es.map((e) => `<div class="row"><div class="main-c">${etiquetaHtml(e)}</div><span class="small muted">${usos.get(e.id) || 0} contato(s)</span>${lider() ? `<button class="btn sm" data-et="${e.id}">Editar</button>` : ''}</div>`).join('')}</div></div>`).join('')
    : `<div class="empty">Nenhuma etiqueta ainda.${lider() ? ' Clique em <b>Nova etiqueta</b>. Exemplos: "Preço alto" e "Prazo de entrega" na categoria Motivo, ou o nome dos produtos na categoria Produto.' : ''}</div>`;
}
function form(e) {
  const cats = [...new Set(S.etiquetas.map((x) => x.categoria))];
  abrir(`<h3>${e ? 'Editar etiqueta' : 'Nova etiqueta'}</h3>
    <div class="field"><label for="etN">Nome *</label><input id="etN" name="nome" required value="${esc(e?.nome)}"></div>
    <div class="fields2"><div class="field"><label for="etC">Categoria</label><input id="etC" name="categoria" list="etCats" value="${esc(e?.categoria || '')}" placeholder="Sem categoria"><datalist id="etCats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
    <div class="field"><label for="etCor">Cor</label><input type="color" id="etCor" name="cor" value="${esc(e?.cor || '#3fbfa6')}"></div></div>
    ${rodape({ excluir: !!e })}`,
  async (d) => {
    const dados = { nome: d.nome.trim(), categoria: d.categoria.trim() || 'Sem categoria', cor: d.cor };
    if (e) { await q(S.sb.from('etiquetas').update(dados).eq('id', e.id)); Object.assign(e, dados); }
    else S.etiquetas.push(await q(S.sb.from('etiquetas').insert({ ...dados, empresa_id: S.empresaId }).select().single()));
    S.etiquetas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); toast(e ? 'Etiqueta salva' : 'Etiqueta criada'); desenhar();
  },
  async () => { await q(S.sb.from('etiquetas').delete().eq('id', e.id)); S.etiquetas = S.etiquetas.filter((x) => x.id !== e.id); toast('Etiqueta excluída'); desenhar(); });
}
