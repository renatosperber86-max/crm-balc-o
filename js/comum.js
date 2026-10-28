// Peças usadas por mais de uma tela: etiquetas, contato, lembrete, emojis, galeria, mídia.
import { S, $, $$, esc, q, rpc, abrir, rodape, fechar, toast, falhou, lider, atende, isAdmin, campoResponsavel, responsavelPadrao,
  etiquetaHtml, urlsArquivos, fmtBytes, norm, icon, minhaEquipe, opcoesPessoas, hoje, buscarTudo,
  online, PRESENCA, avatarPessoa, ordPessoa, PAPEL_NOME } from './core.js';

/* ---------- etiquetas de um contato ---------- */
export async function etiquetasDoCliente(clienteId) {
  return (await q(S.sb.from('cliente_etiquetas').select('etiqueta_id').eq('cliente_id', clienteId))).map((x) => x.etiqueta_id);
}
// abre a janela para marcar/desmarcar etiquetas; chama onMudou(novaLista)
export async function gerenciarEtiquetas(clienteId, nomeCliente, onMudou) {
  let marcadas = new Set(await etiquetasDoCliente(clienteId));
  let busca = '';
  const cats = () => {
    const m = new Map();
    for (const e of S.etiquetas) { if (busca && !norm(e.nome + ' ' + e.categoria).includes(norm(busca))) continue; if (!m.has(e.categoria)) m.set(e.categoria, []); m.get(e.categoria).push(e); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  };
  const lista = () => {
    const c = cats();
    if (!S.etiquetas.length) return `<div class="empty">Nenhuma etiqueta criada ainda.${lider() ? ' Crie a primeira abaixo.' : ' Peça para o seu gerente criar.'}</div>`;
    if (!c.length) return '<div class="empty">Nenhuma etiqueta encontrada.</div>';
    return c.map(([cat, es]) => `<details open><summary class="lbl" style="cursor:pointer;margin:6px 0">${esc(cat)} <span class="muted">(${es.length})</span></summary>
      ${es.map((e) => `<label class="check-line" style="padding:5px 2px"><input type="checkbox" data-etq="${e.id}" ${marcadas.has(e.id) ? 'checked' : ''}> ${etiquetaHtml(e)}</label>`).join('')}</details>`).join('');
  };
  const f = abrir(`<div class="dlg-h"><div><h3>Etiquetas do contato</h3><p class="hint">${esc(nomeCliente || '')}</p></div></div>
    <input type="search" id="etqBusca" placeholder="Buscar etiqueta" aria-label="Buscar etiqueta">
    <div id="etqLista" style="max-height:46vh;overflow-y:auto">${lista()}</div>
    ${lider() ? `<details><summary class="small" style="cursor:pointer;color:var(--accent);font-weight:600">Criar etiqueta nova</summary>
      <div class="fields3" style="margin-top:8px"><div class="field"><label for="etqN">Nome</label><input id="etqN"></div><div class="field"><label for="etqC">Categoria</label><input id="etqC" list="etqCats" placeholder="Sem categoria"><datalist id="etqCats">${[...new Set(S.etiquetas.map((e) => e.categoria))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field"><label for="etqCor">Cor</label><input type="color" id="etqCor" value="#3fbfa6"></div></div><button type="button" class="btn sm" id="etqCriar" style="margin-top:8px">Criar etiqueta</button></details>`
    : '<p class="hint">Só gerentes podem criar ou editar etiquetas e categorias.</p>'}
    ${rodape({ salvar: 'Concluir', cancelar: '' })}`, () => onMudou?.([...marcadas]));
  f.querySelector('#etqBusca').oninput = (e) => { busca = e.target.value; f.querySelector('#etqLista').innerHTML = lista(); };
  f.querySelector('#etqLista').onchange = async (e) => {
    const cb = e.target.closest('[data-etq]'); if (!cb) return;
    const id = cb.dataset.etq; cb.disabled = true;
    try {
      if (cb.checked) { await q(S.sb.from('cliente_etiquetas').insert({ cliente_id: clienteId, etiqueta_id: id, empresa_id: S.empresaId })); marcadas.add(id); }
      else { await q(S.sb.from('cliente_etiquetas').delete().eq('cliente_id', clienteId).eq('etiqueta_id', id)); marcadas.delete(id); }
      onMudou?.([...marcadas]);
    } catch (er) { cb.checked = !cb.checked; falhou(er); }
    cb.disabled = false;
  };
  const criar = f.querySelector('#etqCriar');
  if (criar) criar.onclick = async () => {
    const nome = f.querySelector('#etqN').value.trim(); if (!nome) { f.querySelector('#etqN').focus(); return; }
    try {
      const e = await q(S.sb.from('etiquetas').insert({ empresa_id: S.empresaId, nome, categoria: f.querySelector('#etqC').value.trim() || 'Sem categoria', cor: f.querySelector('#etqCor').value }).select().single());
      S.etiquetas.push(e); S.etiquetas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      f.querySelector('#etqN').value = ''; f.querySelector('#etqLista').innerHTML = lista(); toast('Etiqueta criada');
    } catch (er) { falhou(er); }
  };
}
export const chipsEtiquetas = (ids, max = 3) => {
  const es = (ids || []).map((id) => S.etiquetas.find((e) => e.id === id)).filter(Boolean);
  return es.slice(0, max).map(etiquetaHtml).join('') + (es.length > max ? `<span class="etq">+${es.length - max}</span>` : '');
};

/* ---------- contato (novo/editar) ---------- */
export function formContato(c, onSalvo) {
  const o = c || { responsavel_id: responsavelPadrao() };
  const id = c?.id;
  abrir(`<h3>${id ? 'Editar contato' : 'Novo contato'}</h3>
    <div class="field"><label for="c-nome">Nome *</label><input id="c-nome" name="nome" required value="${esc(o.nome)}"></div>
    <div class="fields2"><div class="field"><label for="c-tel">Telefone / WhatsApp</label><input id="c-tel" name="telefone" inputmode="tel" placeholder="(47) 99999-0000" value="${esc(o.telefone)}"></div>
    <div class="field"><label for="c-email">E-mail</label><input id="c-email" name="email" type="email" value="${esc(o.email)}"></div></div>
    <div class="fields2"><div class="field"><label for="c-emp">Empresa do contato</label><input id="c-emp" name="empresa_cliente" value="${esc(o.empresa_cliente)}"></div>
    <div class="field"><label for="c-ig">Instagram</label><input id="c-ig" name="instagram" placeholder="@perfil" value="${esc(o.instagram)}"></div></div>
    ${lider() ? `<div class="field"><label for="c-resp">Responsável</label><select id="c-resp" name="responsavel_id"><option value="">Ninguém (fica na fila)</option>${opcoesPessoas(o.responsavel_id)}</select></div>` : ''}
    <div class="field"><label for="c-obs">Anotações</label><textarea id="c-obs" name="obs">${esc(o.obs)}</textarea></div>
    ${rodape({ excluir: !!id })}`,
  async (d) => {
    for (const k in d) d[k] = String(d[k]).trim();
    const dados = { nome: d.nome, telefone: d.telefone, email: d.email, empresa_cliente: d.empresa_cliente, instagram: d.instagram, obs: d.obs };
    if (lider()) dados.responsavel_id = d.responsavel_id || null;
    else if (!id) dados.responsavel_id = S.me.id;
    if (!id) dados.empresa_id = S.empresaId;
    if (id && d.telefone !== (c.telefone || '')) dados.whatsapp = null;
    const r = id ? await q(S.sb.from('clientes').update(dados).eq('id', id).select().single()) : await q(S.sb.from('clientes').insert(dados).select().single());
    toast(id ? 'Contato salvo' : 'Contato criado');
    onSalvo?.(r);
  },
  async () => { await q(S.sb.from('clientes').delete().eq('id', id)); toast('Contato excluído'); onSalvo?.(null); });
}

/* ---------- lembrete (novo/editar) ---------- */
export function formLembrete(t, onSalvo, ctx = {}) {
  const o = t ? { ...t } : { data: hoje(), cliente_id: ctx.cliente_id || null, conversa_id: ctx.conversa_id || null };
  if (!o.responsavel_id) o.responsavel_id = ctx.responsavel_id || responsavelPadrao();
  const id = t?.id;
  const agora = new Date(); const horaPadrao = String(Math.min(23, agora.getHours() + 1)).padStart(2, '0') + ':00';
  abrir(`<h3>${id ? 'Editar lembrete' : 'Novo lembrete'}</h3>
    ${ctx.nomeCliente ? `<p class="hint">Contato: <b>${esc(ctx.nomeCliente)}</b></p>` : ''}
    <div class="field"><label for="l-tit">Título *</label><input id="l-tit" name="titulo" required placeholder="Ex.: Ligar para confirmar o orçamento" value="${esc(o.titulo)}"></div>
    <div class="fields2"><div class="field"><label for="l-data">Data</label><input id="l-data" name="data" type="date" value="${esc(o.data)}"></div>
    <div class="field"><label for="l-hora">Horário</label><input id="l-hora" name="hora" type="time" value="${esc(id ? o.hora : (o.hora || horaPadrao))}"></div></div>
    <div class="field"><label for="l-desc">Descrição</label><textarea id="l-desc" name="descricao">${esc(o.descricao)}</textarea></div>
    ${campoResponsavel(o.responsavel_id)}
    ${rodape({ excluir: !!id, salvar: id ? 'Salvar' : 'Criar lembrete' })}`,
  async (d) => {
    const dados = { titulo: d.titulo.trim(), data: d.data || null, hora: d.hora || '', descricao: (d.descricao || '').trim(), responsavel_id: lider() ? d.responsavel_id : (o.responsavel_id || S.me.id) };
    if (!id) Object.assign(dados, { empresa_id: S.empresaId, cliente_id: o.cliente_id, conversa_id: o.conversa_id, feita: false });
    if (!dados.responsavel_id) throw new Error('Escolha o responsável.');
    const r = id ? await q(S.sb.from('tarefas').update(dados).eq('id', id).select().single()) : await q(S.sb.from('tarefas').insert(dados).select().single());
    toast(id ? 'Lembrete salvo' : 'Lembrete criado');
    (await import('./core.js')).emitir('lembretes-mudaram');
    onSalvo?.(r);
  },
  async () => { await q(S.sb.from('tarefas').delete().eq('id', id)); toast('Lembrete excluído'); onSalvo?.(null); });
}

/* ---------- emojis ---------- */
export const EMOJIS = '😀 😃 😄 😁 😊 😉 😍 🥰 😘 😎 🤩 🤗 🤔 😅 😂 🤣 🙂 🙃 😇 😌 😴 😢 😭 😡 😱 🙏 👍 👎 👏 🙌 👋 🤝 💪 ✌️ 👌 ☝️ ❤️ 💚 💙 💛 🧡 💜 🔥 ✨ ⭐ 🎉 🎁 ✅ ❌ ⚠️ 📦 🚚 🛋️ 🛏️ 🪑 🏠 📷 📍 💰 💳 🕐 📅 ☎️ 📞 💬 👀'.split(' ');
export function escolherEmoji(anchor, onEscolher) {
  return import('./core.js').then(({ pop }) => pop(anchor, `<div class="emojis">${EMOJIS.map((e) => `<button type="button" data-mi="${e}" aria-label="${e}">${e}</button>`).join('')}</div>`, (v) => onEscolher(v), { manter: true }));
}
export function inserirNoCursor(ta, txt) {
  const i = ta.selectionStart ?? ta.value.length, f = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, i) + txt + ta.value.slice(f);
  ta.selectionStart = ta.selectionEnd = i + txt.length; ta.focus(); ta.dispatchEvent(new Event('input'));
}
export function autoAltura(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight + 2) + 'px'; }

/* ---------- mídia ---------- */
export function linkificar(t) {
  // links clicáveis e a formatação do WhatsApp: *negrito*, _itálico_, ~riscado~
  return esc(t).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,!?)])/g, '$1<b>$2</b>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,!?)])/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s.,!?)])/g, '$1<s>$2</s>');
}
// troca data-path pelos links assinados
export async function resolverMidias(root) {
  const els = $$('[data-path]', root).filter((x) => !x.dataset.ok);
  if (!els.length) return;
  const urls = await urlsArquivos(els.map((x) => x.dataset.path));
  for (const x of els) {
    const u = urls[x.dataset.path]; x.dataset.ok = '1'; if (!u) continue;
    if (x.tagName === 'A') x.href = u; else x.src = u;
  }
}
export function htmlMidia(path, mime, nome, tamanho, cls = '') {
  if (!path) return '';
  if (/^image\//.test(mime)) return `<img data-path="${esc(path)}" alt="${esc(nome || 'Imagem')}" loading="lazy" data-ver="${esc(path)}" data-mime="${esc(mime)}" class="${cls}">`;
  if (/^video\//.test(mime)) return `<video data-path="${esc(path)}" controls preload="metadata" class="${cls}"></video>`;
  if (/^audio\//.test(mime)) return `<audio data-path="${esc(path)}" controls preload="none"></audio>`;
  return `<a class="doc" data-path="${esc(path)}" target="_blank" rel="noopener" download="${esc(nome || 'arquivo')}">${icon('doc')}<span><b>${esc(nome || 'Documento')}</b>${tamanho ? `<br><span class="tiny muted">${fmtBytes(tamanho)}</span>` : ''}</span></a>`;
}
export async function verMidia(path, mime, nome) {
  const urls = await urlsArquivos([path]); const u = urls[path]; if (!u) return toast('Arquivo não encontrado.', true);
  let corpo;
  if (/^image\//.test(mime)) corpo = `<img src="${esc(u)}" alt="${esc(nome || '')}">`;
  else if (/^video\//.test(mime)) corpo = `<video src="${esc(u)}" controls autoplay></video>`;
  else if (/^audio\//.test(mime)) corpo = `<audio src="${esc(u)}" controls autoplay></audio>`;
  else if (/pdf/.test(mime)) corpo = `<iframe src="${esc(u)}" title="${esc(nome || 'Documento')}"></iframe>`;
  else corpo = `<div class="empty">Não dá para mostrar este tipo de arquivo aqui. Use o botão Baixar.</div>`;
  abrir(`<div class="dlg-h"><h3 style="overflow-wrap:anywhere">${esc(nome || 'Arquivo')}</h3><button type="button" class="icon-btn" id="f-cancel" aria-label="Fechar">${icon('x')}</button></div>
    <div class="prev">${corpo}</div><div class="dlg-actions"><div class="r"><a class="btn" href="${esc(u)}" download="${esc(nome || 'arquivo')}" target="_blank" rel="noopener">${icon('baixar')}Baixar</a></div></div>`, null, null, { largo: true, semFoco: true });
}

/* ---------- escolher arquivos da galeria ---------- */
export async function escolherDaGaleria(onEscolher) {
  const [pastas, arqs] = await Promise.all([
    buscarTudo('pastas', (x) => x.eq('empresa_id', S.empresaId), 'id,nome,parent_id', 'nome'),
    buscarTudo('arquivos', (x) => x.eq('empresa_id', S.empresaId), 'id,nome,path,mime,tamanho,pasta_id', 'nome'),
  ]);
  let pasta = null, busca = ''; const sel = new Set();
  const nomePasta = (id) => pastas.find((p) => p.id === id)?.nome || '';
  const grade = () => {
    const ps = busca ? [] : pastas.filter((p) => (p.parent_id || null) === pasta);
    const as = arqs.filter((a) => busca ? norm(a.nome).includes(norm(busca)) : (a.pasta_id || null) === pasta);
    if (!ps.length && !as.length) return '<div class="empty">Nada aqui. Envie arquivos pela tela Galeria de mídia.</div>';
    return `<div class="pick">${ps.map((p) => `<button type="button" data-pasta="${p.id}"><span class="ic">${icon('pasta')}</span><span>${esc(p.nome)}</span></button>`).join('')}
      ${as.map((a) => `<button type="button" data-arq="${a.id}" aria-pressed="${sel.has(a.id)}">${/^image\//.test(a.mime) ? `<img data-path="${esc(a.path)}" alt="">` : `<span class="ic">${icon(/^video/.test(a.mime) ? 'play' : 'doc')}</span>`}<span title="${esc(a.nome)}">${esc(a.nome)}</span></button>`).join('')}</div>`;
  };
  const f = abrir(`<div class="dlg-h"><h3>Enviar da galeria</h3></div>
    <div style="display:flex;gap:8px;align-items:center"><button type="button" class="btn sm" id="gpVoltar" hidden>${icon('voltar')}Voltar</button><b id="gpNome" class="small"></b><input type="search" id="gpBusca" placeholder="Buscar arquivo" style="margin-left:auto;max-width:240px" aria-label="Buscar arquivo"></div>
    <div id="gpGrade">${grade()}</div>
    ${rodape({ salvar: 'Enviar selecionados' })}`, () => {
    if (!sel.size) { toast('Escolha pelo menos um arquivo.'); return false; }
    onEscolher(arqs.filter((a) => sel.has(a.id)));
  }, null, { largo: true });
  const redesenhar = () => {
    f.querySelector('#gpGrade').innerHTML = grade(); resolverMidias(f.querySelector('#gpGrade'));
    f.querySelector('#gpVoltar').hidden = !pasta || !!busca; f.querySelector('#gpNome').textContent = pasta && !busca ? nomePasta(pasta) : '';
  };
  resolverMidias(f.querySelector('#gpGrade'));
  f.querySelector('#gpGrade').onclick = (e) => {
    const p = e.target.closest('[data-pasta]'); if (p) { pasta = p.dataset.pasta; redesenhar(); return; }
    const a = e.target.closest('[data-arq]'); if (a) { const id = a.dataset.arq; if (sel.has(id)) sel.delete(id); else sel.add(id); a.setAttribute('aria-pressed', sel.has(id)); }
  };
  f.querySelector('#gpVoltar').onclick = () => { pasta = pastas.find((p) => p.id === pasta)?.parent_id || null; redesenhar(); };
  f.querySelector('#gpBusca').oninput = (e) => { busca = e.target.value.trim(); redesenhar(); };
}

/* ---------- escolher um contato ---------- */
export async function escolherContato(titulo, onEscolher) {
  const lista = await buscarTudo('clientes', (x) => x.eq('empresa_id', S.empresaId), 'id,nome,telefone,responsavel_id', 'nome');
  let busca = '';
  const linhas = () => {
    const l = lista.filter((c) => !busca || norm(c.nome + ' ' + c.telefone).includes(norm(busca))).slice(0, 60);
    return l.length ? l.map((c) => `<button type="button" class="mi" data-cli="${c.id}"><span><b>${esc(c.nome)}</b><br><span class="small muted">${esc(c.telefone || 'sem telefone')}</span></span></button>`).join('')
      : '<div class="empty">Nenhum contato encontrado.</div>';
  };
  const f = abrir(`<div class="dlg-h"><h3>${esc(titulo)}</h3></div>
    <input type="search" id="ecBusca" placeholder="Buscar por nome ou telefone" aria-label="Buscar contato" autofocus>
    <div id="ecLista" class="pop" style="position:static;box-shadow:none;max-height:44vh;max-width:none;border-color:var(--line-2)">${linhas()}</div>
    <div class="dlg-actions"><button type="button" class="btn" id="ecNovo">${icon('mais2')}Novo contato</button><div class="r"><button type="button" class="btn" id="f-cancel">Cancelar</button></div></div>`, null);
  f.querySelector('#ecBusca').oninput = (e) => { busca = e.target.value; f.querySelector('#ecLista').innerHTML = linhas(); };
  f.querySelector('#ecLista').onclick = (e) => { const b = e.target.closest('[data-cli]'); if (b) { fechar(); onEscolher(lista.find((c) => c.id === b.dataset.cli)); } };
  f.querySelector('#ecNovo').onclick = () => formContato(null, (c) => { if (c) onEscolher(c); });
}

/* ---------- escolher pessoa da equipe (transferir) ---------- */
export function escolherPessoa(titulo, texto, opcoes, onEscolher, extra) {
  let busca = '';
  const linhas = () => {
    const l = opcoes.filter((p) => !busca || norm(p.nome + ' ' + p.email).includes(norm(busca))).sort(ordPessoa);
    return (extra && !busca ? `<button type="button" class="mi" data-p="__extra"><span><b>${esc(extra.titulo)}</b><br><span class="small muted">${esc(extra.texto)}</span></span></button>` : '')
      + (l.length ? l.map((p) => `<button type="button" class="mi" data-p="${p.id}">${avatarPessoa(p, 'sm', true)}<span><b>${esc(p.nome || p.email)}</b><br><span class="small muted">${PAPEL_NOME[p.papel]} · ${PRESENCA[online(p)]}</span></span></button>`).join('') : '<div class="empty">Ninguém encontrado.</div>');
  };
  const f = abrir(`<div class="dlg-h"><div><h3>${esc(titulo)}</h3><p class="hint">${esc(texto)}</p></div></div>
    <input type="search" id="epBusca" placeholder="Buscar pessoa" aria-label="Buscar pessoa">
    <div id="epLista" class="pop" style="position:static;box-shadow:none;max-height:48vh;max-width:none;border-color:var(--line-2)">${linhas()}</div>
    <div class="dlg-actions"><div class="r"><button type="button" class="btn" id="f-cancel">Cancelar</button></div></div>`, null);
  f.querySelector('#epBusca').oninput = (e) => { busca = e.target.value; f.querySelector('#epLista').innerHTML = linhas(); };
  f.querySelector('#epLista').onclick = async (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    try { await onEscolher(b.dataset.p === '__extra' ? null : b.dataset.p); fechar(); } catch (er) { falhou(er); }
  };
}
