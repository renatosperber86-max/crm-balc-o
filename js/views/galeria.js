// Galeria de mídia (pastas e arquivos)
import { S, $, $$, esc, q, abrir, rodape, toast, falhou, icon, menu, confirmar, fmtBytes, fmtDataHora, norm, debounce, nomePessoa, lider, isAdmin,
  enviarArquivo, buscarTudo, urlArquivo } from '../core.js';
import { resolverMidias, verMidia } from '../comum.js';

const VIS = { privada: ['Privada', 'Só você'], equipe: ['Equipe', 'Você, seu gerente e a equipe dele'], empresa: ['Empresa', 'Todos da empresa'] };
const G = { pasta: null, busca: '' };
let el, pastas = [], arqs = [];

export default {
  async render(root) {
    el = root; G.pasta = null; G.busca = '';
    el.innerHTML = `<div class="bar"><div><h2>Galeria</h2><p class="sub">Crie pastas, escolha quem vê e envie os arquivos para os clientes pelo chat.</p></div>
      <div class="bar-r"><input type="search" id="glB" placeholder="Buscar arquivo" aria-label="Buscar arquivo" style="max-width:220px"><button class="btn" id="glPasta">${icon('pasta')}Nova pasta</button><button class="btn pri" id="glEnviar">${icon('baixar')}Enviar arquivos</button></div></div>
      <div class="drop" id="glDrop">Arraste arquivos aqui para enviar para esta pasta</div>
      <div class="trilha" id="glTrilha"></div><div id="glTab"><div class="empty">Carregando…</div></div><input type="file" id="glArq" multiple hidden>`;
    $('#glPasta').onclick = novaPasta;
    $('#glEnviar').onclick = () => $('#glArq').click();
    $('#glArq').onchange = (e) => { enviar([...e.target.files]); e.target.value = ''; };
    $('#glB').oninput = debounce((e) => { G.busca = e.target.value.trim(); desenhar(); }, 200);
    const d = $('#glDrop');
    d.ondragover = (e) => { e.preventDefault(); d.classList.add('on'); };
    d.ondragleave = () => d.classList.remove('on');
    d.ondrop = (e) => { e.preventDefault(); d.classList.remove('on'); enviar([...e.dataTransfer.files]); };
    $('#glTrilha').onclick = (e) => { const b = e.target.closest('[data-ir]'); if (b) { G.pasta = b.dataset.ir || null; desenhar(); } };
    $('#glTab').onclick = clique;
    await carregar();
  },
};
async function carregar() {
  try {
    const porEmp = (x) => x.eq('empresa_id', S.empresaId);
    [pastas, arqs] = await Promise.all([buscarTudo('pastas', porEmp, '*', 'nome'), buscarTudo('arquivos', porEmp, '*', 'nome')]);
    desenhar();
  } catch (e) { falhou(e); }
}
const caminho = (id) => { const out = []; let p = pastas.find((x) => x.id === id); while (p) { out.unshift(p); p = pastas.find((x) => x.id === p.parent_id); } return out; };
const podeMexer = (x) => x.dono_id === S.me.id || lider();
function chipVis(v) { return `<span class="chip ${v === 'privada' ? 'mute' : v === 'equipe' ? 'info' : 'good'}" title="${VIS[v][1]}">${VIS[v][0]}</span>`; }
function desenhar() {
  $('#glTrilha').innerHTML = G.busca ? `<span>Resultados para “${esc(G.busca)}”</span>` : [`<button data-ir="">Todos</button>`, ...caminho(G.pasta).map((p) => `<span class="muted">/</span><button data-ir="${p.id}">${esc(p.nome)}</button>`)].join('');
  $('#glDrop').textContent = G.pasta ? `Arraste arquivos aqui para enviar para "${caminho(G.pasta).pop()?.nome}"` : 'Arraste arquivos aqui para enviar';
  const ps = G.busca ? pastas.filter((p) => norm(p.nome).includes(norm(G.busca))) : pastas.filter((p) => (p.parent_id || null) === G.pasta);
  const as = G.busca ? arqs.filter((a) => norm(a.nome).includes(norm(G.busca))) : arqs.filter((a) => (a.pasta_id || null) === G.pasta);
  const box = $('#glTab');
  if (!ps.length && !as.length) { box.innerHTML = `<div class="empty">${G.busca ? 'Nada encontrado.' : G.pasta ? 'Pasta vazia. Envie arquivos ou crie uma subpasta.' : 'Nenhum arquivo ainda. Crie pastas (por exemplo, uma por produto) e envie as fotos e vídeos.'}</div>`; return; }
  box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Tamanho</th><th>Tipo</th><th>Dono</th><th class="r">Ações</th></tr></thead><tbody>
    ${ps.map((p) => `<tr><td><div class="nome-arq"><span class="thumb">${icon('pasta')}</span><button data-abrir-p="${p.id}">${esc(p.nome)}</button></div></td><td class="s">${arqs.filter((a) => a.pasta_id === p.id).length} arquivo(s)</td><td>Pasta ${chipVis(p.visibilidade)}</td><td class="s">${esc(nomePessoa(p.dono_id))}</td>
      <td class="r"><button class="icon-btn" data-mp="${p.id}" aria-label="Ações da pasta ${esc(p.nome)}">${icon('mais')}</button></td></tr>`).join('')}
    ${as.map((a) => `<tr><td><div class="nome-arq">${/^image\//.test(a.mime) ? `<img class="thumb" data-path="${esc(a.path)}" alt="">` : `<span class="thumb">${icon(/^video/.test(a.mime) ? 'play' : /^audio/.test(a.mime) ? 'mic' : 'doc')}</span>`}<button data-ver="${a.id}">${esc(a.nome)}</button></div></td>
      <td class="s">${fmtBytes(a.tamanho)}</td><td>${esc(a.mime.split('/')[1] || a.mime)} ${chipVis(a.visibilidade)}</td><td class="s">${esc(nomePessoa(a.dono_id))}<br>${fmtDataHora(a.criado_em)}</td>
      <td class="r"><button class="icon-btn" data-ma="${a.id}" aria-label="Ações do arquivo ${esc(a.nome)}">${icon('mais')}</button></td></tr>`).join('')}</tbody></table></div>`;
  resolverMidias(box);
}
async function enviar(files) {
  if (!files.length) return;
  const visPadrao = G.pasta ? pastas.find((p) => p.id === G.pasta)?.visibilidade || 'privada' : 'privada';
  let ok = 0;
  for (const f of files) {
    if (f.size > 100 * 1048576) { toast(`"${f.name}" tem mais de 100 MB.`, true); continue; }
    try {
      toast(`Enviando ${f.name} (${ok + 1} de ${files.length})…`);
      const path = await enviarArquivo('galeria', f);
      await q(S.sb.from('arquivos').insert({ empresa_id: S.empresaId, dono_id: S.me.id, pasta_id: G.pasta, nome: f.name, path, mime: f.type || 'application/octet-stream', tamanho: f.size, visibilidade: visPadrao }));
      ok++;
    } catch (e) { falhou(e); }
  }
  if (ok) toast(`${ok} arquivo(s) enviado(s)`);
  carregar();
}
function novaPasta() {
  abrir(`<h3>Nova pasta</h3><div class="field"><label for="npN">Nome</label><input id="npN" name="nome" required placeholder="Ex.: Sofá Albany"></div>
    <div class="field"><label for="npV">Quem pode ver</label><select id="npV" name="vis">${Object.entries(VIS).map(([k, v]) => `<option value="${k}">${v[0]}: ${v[1]}</option>`).join('')}</select></div>${rodape({ salvar: 'Criar pasta' })}`,
  async (d) => { await q(S.sb.from('pastas').insert({ empresa_id: S.empresaId, dono_id: S.me.id, parent_id: G.pasta, nome: d.nome.trim(), visibilidade: d.vis })); toast('Pasta criada'); carregar(); });
}
const filhosDe = (id) => { const ids = [id]; for (let i = 0; i < ids.length; i++) pastas.filter((p) => p.parent_id === ids[i]).forEach((p) => ids.push(p.id)); return ids; };
function compartilhar(item, ehPasta) {
  abrir(`<h3>Quem pode ver “${esc(item.nome)}”</h3>
    <div class="list">${Object.entries(VIS).map(([k, v]) => `<label class="check-line" style="padding:8px 0"><input type="radio" name="vis" value="${k}" ${item.visibilidade === k ? 'checked' : ''}> <span><b>${v[0]}</b><br><span class="small muted">${v[1]}</span></span></label>`).join('')}</div>
    ${ehPasta ? '<label class="check-line"><input type="checkbox" name="filhos" checked> Aplicar também aos arquivos e subpastas dentro dela</label>' : ''}${rodape()}`,
  async (d) => {
    if (ehPasta) {
      const ids = d.filhos ? filhosDe(item.id) : [item.id];
      await q(S.sb.from('pastas').update({ visibilidade: d.vis }).in('id', ids));
      if (d.filhos) await q(S.sb.from('arquivos').update({ visibilidade: d.vis }).in('pasta_id', ids));
    } else await q(S.sb.from('arquivos').update({ visibilidade: d.vis }).eq('id', item.id));
    toast('Acesso atualizado'); carregar();
  });
}
function mover(item, ehPasta) {
  const proibidas = ehPasta ? new Set(filhosDe(item.id)) : new Set();
  const ops = pastas.filter((p) => !proibidas.has(p.id)).map((p) => [p.id, caminho(p.id).map((x) => x.nome).join(' / ')]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  abrir(`<h3>Mover “${esc(item.nome)}”</h3><div class="field"><label for="mvP">Para a pasta</label><select id="mvP" name="p"><option value="">Todos (raiz)</option>${ops.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select></div>${rodape({ salvar: 'Mover' })}`,
  async (d) => {
    if (ehPasta) await q(S.sb.from('pastas').update({ parent_id: d.p || null }).eq('id', item.id));
    else await q(S.sb.from('arquivos').update({ pasta_id: d.p || null }).eq('id', item.id));
    toast('Movido'); carregar();
  });
}
function renomear(item, tabela) {
  abrir(`<h3>Renomear</h3><div class="field"><label for="rnN">Nome</label><input id="rnN" name="nome" required value="${esc(item.nome)}"></div>${rodape()}`,
    async (d) => { await q(S.sb.from(tabela).update({ nome: d.nome.trim() }).eq('id', item.id)); toast('Renomeado'); carregar(); });
}
async function excluirArquivos(lista) {
  const paths = lista.map((a) => a.path);
  for (let i = 0; i < paths.length; i += 100) await S.sb.storage.from('arquivos').remove(paths.slice(i, i + 100));
  if (lista.length) await q(S.sb.from('arquivos').delete().in('id', lista.map((a) => a.id)));
}
async function clique(e) {
  const ap = e.target.closest('[data-abrir-p]'); if (ap) { G.pasta = ap.dataset.abrirP; G.busca = ''; $('#glB').value = ''; desenhar(); return; }
  const v = e.target.closest('[data-ver]'); if (v) { const a = arqs.find((x) => x.id === v.dataset.ver); verMidia(a.path, a.mime, a.nome); return; }
  const mp = e.target.closest('[data-mp]');
  if (mp) {
    const p = pastas.find((x) => x.id === mp.dataset.mp); const pode = podeMexer(p);
    menu(mp, [['abrir', 'Abrir', 'pasta'], pode ? ['ren', 'Renomear', 'editar'] : null, pode ? ['comp', 'Compartilhar', 'equipe'] : null, pode ? ['mover', 'Mover', 'voltar'] : null, pode ? ['del', 'Excluir', 'lixo', 'bad'] : null], async (op) => {
      try {
        if (op === 'abrir') { G.pasta = p.id; desenhar(); }
        if (op === 'ren') renomear(p, 'pastas');
        if (op === 'comp') compartilhar(p, true);
        if (op === 'mover') mover(p, true);
        if (op === 'del') {
          const ids = filhosDe(p.id); const dentro = arqs.filter((a) => ids.includes(a.pasta_id));
          if (!(await confirmar('Excluir pasta?', `Apaga a pasta "${p.nome}"${dentro.length ? ` e ${dentro.length} arquivo(s) dentro dela` : ''}. Isso não pode ser desfeito.`, 'Excluir', true))) return;
          await excluirArquivos(dentro); await q(S.sb.from('pastas').delete().eq('id', p.id)); toast('Pasta excluída'); carregar();
        }
      } catch (er) { falhou(er); }
    });
    return;
  }
  const ma = e.target.closest('[data-ma]');
  if (ma) {
    const a = arqs.find((x) => x.id === ma.dataset.ma); const pode = podeMexer(a);
    menu(ma, [['ver', 'Abrir', 'galeria'], ['baixar', 'Baixar', 'baixar'], ['link', 'Copiar link (vale 1 hora)', 'doc'], pode ? ['ren', 'Renomear', 'editar'] : null, pode ? ['comp', 'Compartilhar', 'equipe'] : null, pode ? ['mover', 'Mover', 'voltar'] : null, pode ? ['del', 'Excluir', 'lixo', 'bad'] : null], async (op) => {
      try {
        if (op === 'ver') verMidia(a.path, a.mime, a.nome);
        if (op === 'baixar') { const u = await urlArquivo(a.path); const l = document.createElement('a'); l.href = u; l.download = a.nome; l.target = '_blank'; document.body.appendChild(l); l.click(); l.remove(); }
        if (op === 'link') { const u = await urlArquivo(a.path); await navigator.clipboard.writeText(u); toast('Link copiado'); }
        if (op === 'ren') renomear(a, 'arquivos');
        if (op === 'comp') compartilhar(a, false);
        if (op === 'mover') mover(a, false);
        if (op === 'del' && await confirmar('Excluir arquivo?', `Apaga "${a.nome}" da galeria. Se ele já foi enviado em alguma conversa, deixa de aparecer lá também.`, 'Excluir', true)) { await excluirArquivos([a]); toast('Arquivo excluído'); carregar(); }
      } catch (er) { falhou(er); }
    });
  }
}
