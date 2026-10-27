// Empresas (só administrador)
import { S, $, esc, q, abrir, rodape, toast, icon, fmtData } from '../core.js';
import { carregarEmpresas, carregarBase } from '../app.js';

let el;
export default {
  async render(root) {
    el = root;
    el.innerHTML = `<div class="bar"><div><h2>Empresas</h2><p class="sub">As empresas clientes do sistema. Cada uma tem os dados separados.</p></div>
      <div class="bar-r"><button class="btn pri" id="emNova">${icon('mais2')}Nova empresa</button></div></div><div class="panel"><div class="list" id="emLista"></div></div>`;
    $('#emNova').onclick = () => form();
    $('#emLista').onclick = (e) => { const b = e.target.closest('[data-em]'); if (b) form(S.empresas.find((x) => x.id === b.dataset.em)); };
    desenhar();
  },
};
function desenhar() {
  $('#emLista').innerHTML = S.empresas.length ? S.empresas.map((x) => `<div class="row"><div class="main-c"><div class="t">${esc(x.nome)}${x.id === S.empresaId ? ' <span class="chip">Selecionada</span>' : ''}</div><div class="s">Criada em ${fmtData(x.criado_em)}</div></div><button class="btn sm" data-em="${x.id}">Renomear</button></div>`).join('')
    : '<div class="empty">Nenhuma empresa ainda. Clique em <b>Nova empresa</b>.</div>';
}
function form(o) {
  abrir(`<h3>${o ? 'Renomear empresa' : 'Nova empresa'}</h3><div class="field"><label for="emN">Nome da empresa *</label><input id="emN" name="nome" required value="${esc(o?.nome)}"></div>${rodape()}`,
  async (d) => {
    const nome = d.nome.trim();
    const r = o ? await q(S.sb.from('empresas').update({ nome }).eq('id', o.id).select().single()) : await q(S.sb.from('empresas').insert({ nome }).select().single());
    if (!o) { S.empresaId = r.id; try { localStorage.setItem('crm-empresa', r.id); } catch (e) {} }
    toast(o ? 'Empresa renomeada' : 'Empresa criada'); await carregarEmpresas(); await carregarBase(); desenhar();
  });
}
