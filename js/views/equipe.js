// Chat da equipe (conversas internas)
import {
  S, $, $$, esc, q, rpc, abrir, rodape, fechar, confirmar, toast, falhou, icon, avatar, avatarPessoa, menu, fmtQuando, fmtHora, fmtData,
  isoDia, norm, debounce, nomePessoa, pessoa, ouvir, buscarTudo, enviarArquivo, online, PRESENCA, PAPEL_NOME, ordPessoa, lider, uid,
} from '../core.js';
import { irPara, contador } from '../app.js';
import { escolherEmoji, inserirNoCursor, autoAltura, linkificar, resolverMidias, htmlMidia, verMidia, escolherDaGaleria } from '../comum.js';

const E = { convs: [], membros: new Map(), meuLido: new Map(), sel: null, msgs: [], filtro: 'todos', busca: '', favs: new Set() };
let el, desligar = [];

export default {
  async render(root, arg) {
    el = root; el.className = 'view-area flush'; E.sel = null;
    el.innerHTML = `<div class="chat" id="chat">
      <section class="chat-lista" aria-label="Conversas da equipe">
        <div class="cl-top">
          <div class="linha"><input type="search" id="eqBusca" placeholder="Buscar conversa ou pessoa" aria-label="Buscar"><button class="btn sm pri" id="eqNova">Nova conversa</button></div>
          <div class="filt" id="eqFilt"></div>
        </div>
        <div class="cl-itens" id="eqItens"><div class="empty" style="margin:12px">Carregando…</div></div>
      </section>
      <section class="chat-conv" id="conv"><div class="vazio-conv"><div class="empty"><b>Selecione uma conversa</b><br>Converse com os colegas sem o cliente ver.</div></div></section>
    </div>`;
    $('#eqBusca').oninput = debounce((e) => { E.busca = e.target.value; lista(); }, 150);
    $('#eqNova').onclick = nova;
    $('#eqFilt').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { E.filtro = b.dataset.f; lista(); } };
    $('#eqItens').onclick = (e) => { const a = e.target.closest('[data-c]'); if (a) { e.preventDefault(); irPara('#/equipe/' + a.dataset.c); } };
    await carregar();
    if (arg) abrirConv(arg);
    desligar = [ouvir('equipe_mensagens', aoMsg), ouvir('equipe_conversas', () => carregar(true)), ouvir('tick', () => { carregar(true); if (E.sel) carregarMsgs(); })];
  },
  mudarArg(arg) { if (arg) abrirConv(arg); },
  sair() { desligar.forEach((f) => f()); desligar = []; },
};

async function carregar(silencioso) {
  try {
    const [convs, membros, favs] = await Promise.all([
      q(S.sb.from('equipe_conversas').select('*').eq('empresa_id', S.empresaId).order('ultima_msg_em', { ascending: false, nullsFirst: false })),
      buscarTudo('equipe_membros', null, 'conversa_id,user_id,lido_em', null),
      q(S.sb.from('equipe_favoritas').select('mensagem_id').eq('user_id', S.me.id)),
    ]);
    E.convs = convs; E.membros = new Map(); E.meuLido = new Map();
    for (const m of membros) {
      if (!E.membros.has(m.conversa_id)) E.membros.set(m.conversa_id, []);
      E.membros.get(m.conversa_id).push(m.user_id);
      if (m.user_id === S.me.id) E.meuLido.set(m.conversa_id, m.lido_em);
    }
    E.favs = new Set(favs.map((f) => f.mensagem_id));
    lista();
    if (E.sel) cabecalho();
  } catch (e) { if (!silencioso) falhou(e); }
}
const outros = (c) => (E.membros.get(c.id) || []).filter((u) => u !== S.me.id);
const titulo = (c) => c.tipo === 'grupo' ? c.nome : (outros(c).map((u) => nomePessoa(u)).join(', ') || 'Conversa');
const naoLida = (c) => c.ultima_msg_em && (!E.meuLido.get(c.id) || c.ultima_msg_em > E.meuLido.get(c.id));

function lista() {
  const nNl = E.convs.filter(naoLida).length;
  $('#eqFilt').innerHTML = `<button type="button" data-f="todos" aria-pressed="${E.filtro === 'todos'}">Todos</button>
    <button type="button" data-f="naolidas" aria-pressed="${E.filtro === 'naolidas'}">Não lidos <b>${nNl}</b></button>
    <button type="button" data-f="favoritas" aria-pressed="${E.filtro === 'favoritas'}">Mensagens favoritas <b>${E.favs.size}</b></button>`;
  contador('equipe', nNl);
  const box = $('#eqItens');
  if (E.filtro === 'favoritas') { favoritas(box); return; }
  const b = norm(E.busca);
  const l = E.convs.filter((c) => (E.filtro !== 'naolidas' || naoLida(c)) && (!b || norm(titulo(c)).includes(b)));
  box.innerHTML = l.length ? l.map((c) => {
    const p = c.tipo === 'direta' ? pessoa(outros(c)[0]) : null;
    return `<a class="ci" href="#/equipe/${c.id}" data-c="${c.id}" ${E.sel === c.id ? 'aria-current="true"' : ''} style="--st:${naoLida(c) ? 'var(--accent)' : 'transparent'}">
      ${p ? avatarPessoa(p, '', true) : avatar(titulo(c), null)}
      <div class="c-main"><div class="c-l1"><span class="nm">${esc(titulo(c))}</span><span class="hr">${fmtQuando(c.ultima_msg_em || c.criado_em)}</span></div>
      <span class="tel">${c.tipo === 'grupo' ? (E.membros.get(c.id) || []).length + ' participantes' : 'Conversa da equipe'}</span>
      <span class="pv">${esc(c.ultima_msg_texto || 'Sem mensagens')}</span></div>${naoLida(c) ? '<span class="nl" style="align-self:center">•</span>' : ''}</a>`;
  }).join('') : `<div class="empty" style="margin:12px">${E.convs.length ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda. Clique em <b>Nova conversa</b> para falar com um colega ou criar um grupo.'}</div>`;
}
async function favoritas(box) {
  if (!E.favs.size) { box.innerHTML = '<div class="empty" style="margin:12px">Nenhuma mensagem favorita. Passe o mouse numa mensagem e clique na estrela.</div>'; return; }
  const ms = await q(S.sb.from('equipe_mensagens').select('*').in('id', [...E.favs]).order('criado_em', { ascending: false })).catch(() => []);
  box.innerHTML = ms.map((m) => { const c = E.convs.find((x) => x.id === m.conversa_id); return `<a class="ci" href="#/equipe/${m.conversa_id}" data-c="${m.conversa_id}"><div class="c-main"><div class="c-l1"><span class="nm">★ ${esc(nomePessoa(m.autor_id))}</span><span class="hr">${fmtQuando(m.criado_em)}</span></div><span class="tel">${esc(c ? titulo(c) : '')}</span><span class="pv">${esc(m.texto || m.midia_nome || 'Arquivo')}</span></div></a>`; }).join('');
}

async function aoMsg(p) {
  const m = p.new; if (!m) return;
  const c = E.convs.find((x) => x.id === m.conversa_id);
  if (c) { c.ultima_msg_em = m.criado_em; c.ultima_msg_texto = m.texto || m.midia_nome || 'Arquivo'; }
  else return carregar(true);
  if (m.conversa_id === E.sel) {
    if (!E.msgs.some((x) => x.id === m.id)) { E.msgs.push(m); msgs(true); }
    marcarLida();
  }
  E.convs.sort((a, b) => String(b.ultima_msg_em || '').localeCompare(String(a.ultima_msg_em || '')));
  lista();
}

async function abrirConv(id) {
  if (!E.convs.some((c) => c.id === id)) await carregar(true);
  if (!E.convs.some((c) => c.id === id)) { toast('Conversa não encontrada.', true); irPara('#/equipe', true); return; }
  E.sel = id; $('#chat').classList.add('aberta');
  lista();
  $('#conv').innerHTML = `<header class="cv-h" id="cvH"></header><div class="cv-busca" id="cvBusca" hidden></div><div class="cv-msgs" id="cvMsgs"><div class="evt">Carregando…</div></div>
    <div class="cv-comp"><div class="linha" id="cvLinha">
      <button class="icon-btn" id="eqAnexo" aria-label="Enviar arquivo" title="Enviar arquivo">${icon('clipe')}</button>
      <button class="icon-btn" id="eqGal" aria-label="Enviar da galeria" title="Enviar da galeria">${icon('pasta')}</button>
      <button class="icon-btn" id="eqEmoji" aria-label="Emoji" title="Emoji">${icon('emoji')}</button>
      <textarea id="cvTxt" rows="1" placeholder="Digite uma mensagem" aria-label="Mensagem"></textarea>
      <button class="icon-btn on" id="eqEnviar" aria-label="Enviar" title="Enviar">${icon('enviar')}</button></div><input type="file" id="eqArq" multiple hidden></div>`;
  cabecalho();
  const ta = $('#cvTxt');
  ta.oninput = () => autoAltura(ta);
  ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviarTexto(); } };
  $('#eqEnviar').onclick = enviarTexto;
  $('#eqAnexo').onclick = () => $('#eqArq').click();
  $('#eqArq').onchange = async (e) => { for (const f of e.target.files) await enviarArq(f); e.target.value = ''; };
  $('#eqGal').onclick = () => escolherDaGaleria((arqs) => arqs.forEach((a) => postar({ midia_path: a.path, midia_mime: a.mime, midia_nome: a.nome })));
  $('#eqEmoji').onclick = (e) => escolherEmoji(e.currentTarget, (em) => inserirNoCursor(ta, em));
  await carregarMsgs();
  marcarLida();
}
function cabecalho() {
  const c = E.convs.find((x) => x.id === E.sel); if (!c || !$('#cvH')) return;
  const p = c.tipo === 'direta' ? pessoa(outros(c)[0]) : null;
  $('#cvH').innerHTML = `<button class="icon-btn cv-voltar" id="cvVoltar" aria-label="Voltar">${icon('voltar')}</button>${p ? avatarPessoa(p, '', true) : avatar(titulo(c), null)}
    <div class="cv-id"><span class="nm">${esc(titulo(c))}</span><span class="tel">${c.tipo === 'grupo' ? (E.membros.get(c.id) || []).length + ' participantes' : (p ? PAPEL_NOME[p.papel] + ' · ' + PRESENCA[online(p)] : 'Conversa da equipe')}</span></div>
    <button class="icon-btn" id="eqBuscar" aria-label="Buscar mensagens" title="Buscar mensagens">${icon('busca')}</button>
    <button class="btn sm" id="eqDet">Detalhes</button>`;
  $('#cvVoltar').onclick = () => { E.sel = null; $('#chat').classList.remove('aberta'); irPara('#/equipe'); };
  $('#eqDet').onclick = detalhes;
  $('#eqBuscar').onclick = buscar;
}
async function carregarMsgs() {
  const id = E.sel;
  const ms = await q(S.sb.from('equipe_mensagens').select('*').eq('conversa_id', id).order('criado_em', { ascending: false }).limit(300)).catch((e) => { falhou(e); return []; });
  if (E.sel !== id) return;
  E.msgs = ms.reverse(); msgs(true);
}
function msgs(rolar) {
  const box = $('#cvMsgs'); if (!box) return;
  let dia = ''; const out = [];
  for (const m of E.msgs) {
    const d = isoDia(new Date(m.criado_em)); if (d !== dia) { dia = d; out.push(`<div class="dia">${d === isoDia() ? 'Hoje' : fmtData(d)}</div>`); }
    const meu = m.autor_id === S.me.id; const fav = E.favs.has(m.id);
    out.push(`<div class="bb ${meu ? 'out' : 'in'}" data-msg="${m.id}" id="m-${m.id}">${meu ? '' : `<div class="autor">${esc(nomePessoa(m.autor_id))}</div>`}
      ${m.midia_path ? htmlMidia(m.midia_path, m.midia_mime || '', m.midia_nome) : ''}${m.texto ? `<div class="tx">${linkificar(m.texto)}</div>` : ''}
      <div class="meta">${fav ? '<span class="fav">★</span>' : ''}<span>${fmtHora(m.criado_em)}</span></div>
      <div class="acoes">${m._tmp ? '' : `<button type="button" data-fav="${m.id}" aria-label="Favoritar" title="${fav ? 'Tirar dos favoritos' : 'Favoritar'}">${icon('estrela')}</button>`}</div></div>`);
  }
  box.innerHTML = out.join('') || '<div class="evt">Nenhuma mensagem ainda. Diga oi!</div>';
  resolverMidias(box);
  if (rolar) box.scrollTop = box.scrollHeight;
  box.onclick = async (e) => {
    const img = e.target.closest('img[data-ver]'); if (img) return verMidia(img.dataset.ver, img.dataset.mime, img.alt);
    const b = e.target.closest('[data-fav]'); if (!b) return;
    const id = b.dataset.fav;
    try {
      if (E.favs.has(id)) { await q(S.sb.from('equipe_favoritas').delete().eq('user_id', S.me.id).eq('mensagem_id', id)); E.favs.delete(id); }
      else { await q(S.sb.from('equipe_favoritas').insert({ user_id: S.me.id, mensagem_id: id })); E.favs.add(id); }
      msgs(false); lista();
    } catch (er) { falhou(er); }
  };
}
async function marcarLida() {
  if (!E.sel) return;
  const agora = new Date().toISOString();
  try { await q(S.sb.from('equipe_membros').update({ lido_em: agora }).eq('conversa_id', E.sel).eq('user_id', S.me.id)); E.meuLido.set(E.sel, agora); lista(); } catch (e) {}
}
async function postar(d) {
  const tmp = { id: 'tmp-' + uid(), _tmp: true, autor_id: S.me.id, criado_em: new Date().toISOString(), ...d };
  E.msgs.push(tmp); msgs(true);
  try {
    const m = await q(S.sb.from('equipe_mensagens').insert({ empresa_id: S.empresaId, conversa_id: E.sel, autor_id: S.me.id, ...d }).select().single());
    const i = E.msgs.findIndex((x) => x.id === tmp.id);
    if (E.msgs.some((x) => x.id === m.id)) E.msgs.splice(i, 1); else E.msgs[i] = m;
    msgs(true);
    const c = E.convs.find((x) => x.id === E.sel); if (c) { c.ultima_msg_em = m.criado_em; c.ultima_msg_texto = m.texto || m.midia_nome; E.meuLido.set(c.id, m.criado_em); }
    lista();
  } catch (e) { E.msgs = E.msgs.filter((x) => x.id !== tmp.id); msgs(false); falhou(e); throw e; }
}
async function enviarTexto() {
  const ta = $('#cvTxt'); const t = ta.value.trim(); if (!t) return;
  ta.value = ''; autoAltura(ta);
  try { await postar({ texto: t }); } catch (e) { ta.value = t; }
}
async function enviarArq(f) {
  if (f.size > 50 * 1048576) { toast('Arquivo maior que 50 MB.', true); return; }
  try { const path = await enviarArquivo('equipe/' + E.sel, f); await postar({ midia_path: path, midia_mime: f.type || 'application/octet-stream', midia_nome: f.name }); } catch (e) { falhou(e); }
}
function buscar() {
  const b = $('#cvBusca');
  if (!b.hidden) { b.hidden = true; return; }
  b.hidden = false; b.innerHTML = `<input type="search" id="eqBq" placeholder="Buscar mensagens nesta conversa" aria-label="Buscar mensagens"><span class="small muted" id="eqBn" style="align-self:center"></span>`;
  $('#eqBq').focus();
  $('#eqBq').oninput = debounce((e) => {
    const t = norm(e.target.value); $$('.bb.achada').forEach((x) => x.classList.remove('achada'));
    if (!t) { $('#eqBn').textContent = ''; return; }
    const ach = E.msgs.filter((m) => norm(m.texto + ' ' + m.midia_nome).includes(t));
    $('#eqBn').textContent = ach.length ? ach.length + ' encontrada(s)' : 'Nada encontrado';
    ach.forEach((m) => $('#m-' + m.id)?.classList.add('achada'));
    if (ach.length) $('#m-' + ach[ach.length - 1].id)?.scrollIntoView({ block: 'center' });
  }, 200);
}

function colegas() { return S.pessoas.filter((p) => p.ativo && p.id !== S.me.id && p.papel !== 'pendente').sort(ordPessoa); }
function nova() {
  let tipo = 'direta'; const sel = new Set(); let busca = '';
  const linhas = () => colegas().filter((p) => !busca || norm(p.nome + ' ' + p.email).includes(norm(busca))).map((p) => `
    <label class="row" style="padding:8px 4px;cursor:pointer"><span class="pessoa">${avatarPessoa(p, 'sm', true)}<span><b>${esc(p.nome || p.email)}</b><br><span class="small muted">${esc(p.email)} · ${PAPEL_NOME[p.papel]}</span></span></span>
    <input type="${tipo === 'direta' ? 'radio' : 'checkbox'}" name="pp" value="${p.id}" ${sel.has(p.id) ? 'checked' : ''}></label>`).join('') || '<div class="empty">Ninguém encontrado.</div>';
  const f = abrir(`<h3>Nova conversa</h3>
    <div class="seg" id="ncTipo"><button type="button" data-t="direta" aria-pressed="true">Conversa</button><button type="button" data-t="grupo" aria-pressed="false">Grupo</button></div>
    <div class="field" id="ncNomeBox" hidden><label for="ncNome">Nome do grupo</label><input id="ncNome" name="nome" placeholder="Ex.: Produtos"></div>
    <div class="lbl" id="ncLbl">Escolha um atendente</div>
    <input type="search" id="ncBusca" placeholder="Buscar pessoa" aria-label="Buscar pessoa">
    <div id="ncLista" class="list" style="max-height:40vh;overflow-y:auto">${linhas()}</div>
    ${rodape({ salvar: 'Criar conversa' })}`,
  async (d) => {
    if (!sel.size) throw new Error(tipo === 'direta' ? 'Escolha uma pessoa.' : 'Escolha pelo menos uma pessoa.');
    const id = await rpc('criar_conversa_equipe', { p_empresa: S.empresaId, p_tipo: tipo, p_nome: d.nome || '', p_membros: [...sel] });
    await carregar(true); irPara('#/equipe/' + id);
  });
  f.querySelector('#ncTipo').onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return; tipo = b.dataset.t; sel.clear();
    $$('#ncTipo button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.t === tipo));
    f.querySelector('#ncNomeBox').hidden = tipo !== 'grupo'; f.querySelector('#ncLbl').textContent = tipo === 'grupo' ? 'Escolha os participantes' : 'Escolha um atendente';
    f.querySelector('#ncLista').innerHTML = linhas();
  };
  f.querySelector('#ncBusca').oninput = (e) => { busca = e.target.value; f.querySelector('#ncLista').innerHTML = linhas(); };
  f.querySelector('#ncLista').onchange = (e) => {
    const i = e.target; if (!i.value) return;
    if (tipo === 'direta') { sel.clear(); sel.add(i.value); } else if (i.checked) sel.add(i.value); else sel.delete(i.value);
  };
}
function detalhes() {
  const c = E.convs.find((x) => x.id === E.sel); if (!c) return;
  const ms = (E.membros.get(c.id) || []).map((u) => pessoa(u) || { id: u, nome: 'Pessoa', email: '' });
  const podeEditar = c.tipo === 'grupo' && (c.criado_por === S.me.id || lider());
  const f = abrir(`<div class="dlg-h"><h3>${esc(titulo(c))}</h3><button type="button" class="icon-btn" id="f-cancel" aria-label="Fechar">${icon('x')}</button></div>
    ${c.tipo === 'grupo' && podeEditar ? `<div class="field"><label for="gNome">Nome do grupo</label><div style="display:flex;gap:6px"><input id="gNome" value="${esc(c.nome)}"><button type="button" class="btn" id="gRen">Renomear</button></div></div>` : ''}
    <div class="lbl">Participantes (${ms.length})</div>
    <div class="list">${ms.map((p) => `<div class="row"><span class="pessoa">${avatarPessoa(p, 'sm', true)}<span><b>${esc(p.nome || p.email)}</b>${p.id === c.criado_por && c.tipo === 'grupo' ? ' <span class="chip mute">criou o grupo</span>' : ''}<br><span class="small muted">${PRESENCA[online(p)]}</span></span></span>${podeEditar && p.id !== S.me.id ? `<button type="button" class="btn sm" data-rm="${p.id}">Remover</button>` : ''}</div>`).join('')}</div>
    ${podeEditar ? `<div class="field"><label for="gAdd">Adicionar pessoa</label><div style="display:flex;gap:6px"><select id="gAdd">${colegas().filter((p) => !ms.some((m) => m.id === p.id)).map((p) => `<option value="${p.id}">${esc(p.nome || p.email)}</option>`).join('')}</select><button type="button" class="btn" id="gAddB">Adicionar</button></div></div>` : ''}
    ${c.tipo === 'grupo' ? '<div class="dlg-actions"><button type="button" class="btn danger" id="gSair">Sair do grupo</button></div>' : ''}`, null, null, { semFoco: true });
  const ren = f.querySelector('#gRen'); if (ren) ren.onclick = async () => { try { await q(S.sb.from('equipe_conversas').update({ nome: f.querySelector('#gNome').value.trim() }).eq('id', c.id)); c.nome = f.querySelector('#gNome').value.trim(); lista(); cabecalho(); toast('Grupo renomeado'); } catch (e) { falhou(e); } };
  const add = f.querySelector('#gAddB'); if (add) add.onclick = async () => { const u = f.querySelector('#gAdd').value; if (!u) return; try { await rpc('membros_grupo', { p_conversa: c.id, p_add: [u], p_remover: [] }); await carregar(true); detalhes(); } catch (e) { falhou(e); } };
  f.onclick = async (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; try { await rpc('membros_grupo', { p_conversa: c.id, p_add: [], p_remover: [b.dataset.rm] }); await carregar(true); detalhes(); } catch (er) { falhou(er); } };
  const sair = f.querySelector('#gSair'); if (sair) sair.onclick = async () => {
    if (!(await confirmar('Sair do grupo?', 'Você para de ver as mensagens deste grupo.', 'Sair', true))) return;
    try { await q(S.sb.from('equipe_membros').delete().eq('conversa_id', c.id).eq('user_id', S.me.id)); E.sel = null; await carregar(true); irPara('#/equipe'); } catch (er) { falhou(er); }
  };
}
