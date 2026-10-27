// Suporte: chamados para o administrador do sistema
import { S, $, esc, q, abrir, rodape, toast, falhou, icon, fmtDataHora, isAdmin, lider, nomePessoa } from '../core.js';

let el, lista = [], autores = new Map();
export default {
  async render(root, arg) {
    el = root;
    el.innerHTML = `<div class="bar"><div><h2>Suporte</h2><p class="sub">${isAdmin() ? 'Os chamados abertos pelas empresas. Responda e marque como resolvido.' : 'Algo não funcionou ou ficou com dúvida? Abra um chamado e acompanhe a resposta aqui.'}</p></div>
      <div class="bar-r">${S.empresaId ? `<button class="btn pri" id="spNovo">${icon('mais2')}Abrir chamado</button>` : ''}</div></div><div id="spLista"><div class="empty">Carregando…</div></div>`;
    $('#spNovo') && ($('#spNovo').onclick = novo);
    $('#spLista').onclick = (e) => { const b = e.target.closest('[data-ch]'); if (b) ver(lista.find((c) => c.id === b.dataset.ch)); };
    await carregar();
    if (arg === 'novo') novo(); else if (arg) { const c = lista.find((x) => x.id === arg); if (c) ver(c); }
  },
  mudarArg(arg) { if (arg === 'novo') novo(); else if (arg) { const c = lista.find((x) => x.id === arg); if (c) ver(c); } },
};
async function carregar() {
  try {
    let qq = S.sb.from('chamados').select('*').order('criado_em', { ascending: false }).limit(300);
    if (!isAdmin()) qq = qq.eq('empresa_id', S.empresaId);
    lista = await q(qq);
    const ids = [...new Set(lista.map((c) => c.autor_id).filter(Boolean))];
    if (ids.length) autores = new Map((await q(S.sb.from('perfis').select('id,nome,email').in('id', ids))).map((p) => [p.id, p.nome || p.email]));
    const nomeEmp = (id) => S.empresas.find((e) => e.id === id)?.nome || '';
    $('#spLista').innerHTML = lista.length ? `<div class="panel"><div class="list">${lista.map((c) => `<div class="row"><div class="main-c"><div class="t">${esc(c.titulo)} ${c.status === 'aberto' ? '<span class="chip gold">Em aberto</span>' : '<span class="chip good">Resolvido</span>'}</div>
      <div class="s">${fmtDataHora(c.criado_em)} · ${esc(autores.get(c.autor_id) || nomePessoa(c.autor_id))}${isAdmin() ? ' · ' + esc(nomeEmp(c.empresa_id)) : ''}</div>${c.resposta ? `<div class="s">Resposta: ${esc(c.resposta.slice(0, 120))}</div>` : ''}</div>
      <button class="btn sm" data-ch="${c.id}">${isAdmin() && c.status === 'aberto' ? 'Responder' : 'Ver'}</button></div>`).join('')}</div></div>`
      : '<div class="empty">Nenhum chamado por aqui.</div>';
  } catch (e) { falhou(e); }
}
function novo() {
  if (!S.empresaId) return;
  abrir(`<h3>Abrir chamado</h3><p class="hint">Conte o que aconteceu e em qual tela. Se puder, diga o horário e o nome do cliente envolvido.</p>
    <div class="field"><label for="chT">Assunto *</label><input id="chT" name="titulo" required placeholder="Ex.: Foto não aparece no chat"></div>
    <div class="field"><label for="chD">Descrição</label><textarea id="chD" name="descricao" style="min-height:140px"></textarea></div>${rodape({ salvar: 'Abrir chamado' })}`,
  async (d) => { await q(S.sb.from('chamados').insert({ empresa_id: S.empresaId, autor_id: S.me.id, titulo: d.titulo.trim(), descricao: d.descricao.trim() })); toast('Chamado aberto. Você recebe um aviso quando for respondido.'); carregar(); });
}
function ver(c) {
  if (!c) return;
  const adm = isAdmin();
  abrir(`<div class="dlg-h"><div><h3>${esc(c.titulo)}</h3><p class="hint">${fmtDataHora(c.criado_em)} · ${esc(autores.get(c.autor_id) || '')}</p></div></div>
    <div style="white-space:pre-wrap;font-size:14px">${esc(c.descricao) || '<span class="muted">Sem descrição.</span>'}</div>
    ${adm ? `<div class="field"><label for="chR">Resposta</label><textarea id="chR" name="resposta" style="min-height:120px">${esc(c.resposta)}</textarea></div>
      <label class="check-line"><input type="checkbox" name="resolvido" ${c.status === 'resolvido' ? 'checked' : ''}> Marcar como resolvido</label>${rodape()}`
    : `${c.resposta ? `<div class="panel" style="background:var(--surface-2)"><div class="lbl">Resposta${c.resolvido_em ? ' · ' + fmtDataHora(c.resolvido_em) : ''}</div><div style="white-space:pre-wrap;font-size:14px">${esc(c.resposta)}</div></div>` : '<p class="hint">Ainda sem resposta.</p>'}
      <div class="dlg-actions"><div class="r"><button type="button" class="btn" id="f-cancel">Fechar</button></div></div>`}`,
  adm ? async (d) => { await q(S.sb.from('chamados').update({ resposta: d.resposta.trim(), status: d.resolvido ? 'resolvido' : 'aberto' }).eq('id', c.id)); toast('Chamado atualizado'); carregar(); } : null);
}
