// Contatos (base de clientes)
import { S, $, esc, q, rpc, buscarTudo, toast, falhou, icon, menu, abrir, rodape, confirmar, fmtTel, fmtDataHora, norm, debounce,
  lider, nomePessoa, STATUS, baixarCsv, ouvir, minhaEquipe, opcoesPessoas } from '../core.js';
import { irPara } from '../app.js';
import { formContato, gerenciarEtiquetas, chipsEtiquetas, formLembrete, escolherPessoa } from '../comum.js';

const POR_PAG = 25;
const F = { busca: '', etq: '', at: '', emAt: false, bloq: false, resp: '', pag: 1 };
let el, dados = { clientes: [], etq: new Map(), conv: new Map() }, desligar = [];

export default {
  async render(root) {
    el = root;
    el.innerHTML = `<div class="bar"><div><h2>Contatos</h2><p class="sub">Busque, filtre por etiqueta e veja o histórico de cada cliente.</p></div>
      <div class="bar-r"><button class="btn" id="ctImp">Importar planilha</button><button class="btn" id="ctExp">Exportar</button><button class="btn pri" id="ctNovo">${icon('mais2')}Novo contato</button></div></div>
      <div class="panel" style="margin-bottom:14px"><div class="filtros" style="margin:0">
        <div class="field" style="flex:2"><label for="ctB">Buscar</label><input type="search" id="ctB" placeholder="Nome ou telefone" value="${esc(F.busca)}"></div>
        <div class="field"><label for="ctE">Etiqueta</label><select id="ctE"><option value="">Todas as etiquetas</option>${S.etiquetas.map((e) => `<option value="${e.id}" ${e.id === F.etq ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>
        <div class="field"><label for="ctA">Atendimento</label><select id="ctA"><option value="">Todos os atendimentos</option><option value="sem" ${F.at === 'sem' ? 'selected' : ''}>Sem conversa</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === F.at ? 'selected' : ''}>${v.nome}</option>`).join('')}</select></div>
        ${lider() ? `<div class="field"><label for="ctR">Responsável</label><select id="ctR"><option value="">Todos</option><option value="__fila" ${F.resp === '__fila' ? 'selected' : ''}>Ninguém (fila)</option>${opcoesPessoas(F.resp)}</select></div>` : ''}
        <label class="check-line"><input type="checkbox" id="ctEm" ${F.emAt ? 'checked' : ''}> Em atendimento</label>
        <label class="check-line"><input type="checkbox" id="ctBl" ${F.bloq ? 'checked' : ''}> Bloqueados</label>
      </div></div>
      <div id="ctTab"><div class="empty">Carregando contatos…</div></div>`;
    $('#ctNovo').onclick = () => formContato(null, () => carregar());
    $('#ctExp').onclick = exportar;
    $('#ctImp').onclick = importar;
    $('#ctB').oninput = debounce((e) => { F.busca = e.target.value; F.pag = 1; tabela(); }, 200);
    for (const [s, k] of [['#ctE', 'etq'], ['#ctA', 'at'], ['#ctR', 'resp']]) $(s)?.addEventListener('change', (e) => { F[k] = e.target.value; F.pag = 1; tabela(); });
    $('#ctEm').onchange = (e) => { F.emAt = e.target.checked; F.pag = 1; tabela(); };
    $('#ctBl').onchange = (e) => { F.bloq = e.target.checked; F.pag = 1; tabela(); };
    $('#ctTab').onclick = clique;
    await carregar();
    desligar = [ouvir('conversas', debounce(() => carregar(true), 2000))];
  },
  sair() { desligar.forEach((f) => f()); desligar = []; },
};

async function carregar(silencioso) {
  try {
    const porEmp = (x) => x.eq('empresa_id', S.empresaId);
    const [clientes, etq, conv] = await Promise.all([
      buscarTudo('clientes', porEmp, '*', 'nome'),
      buscarTudo('cliente_etiquetas', porEmp, 'cliente_id,etiqueta_id', null),
      buscarTudo('conversas', porEmp, 'id,cliente_id,status,responsavel_id,ultima_msg_em', null),
    ]);
    dados.clientes = clientes; dados.etq = new Map(); dados.conv = new Map(conv.map((c) => [c.cliente_id, c]));
    for (const r of etq) { if (!dados.etq.has(r.cliente_id)) dados.etq.set(r.cliente_id, []); dados.etq.get(r.cliente_id).push(r.etiqueta_id); }
    tabela();
  } catch (e) { if (!silencioso) falhou(e); }
}

function filtrados() {
  const b = norm(F.busca), bd = F.busca.replace(/\D/g, '');
  return dados.clientes.filter((c) => {
    const cv = dados.conv.get(c.id);
    if (b && !norm(c.nome).includes(b) && !(bd && String(c.whatsapp || c.telefone || '').replace(/\D/g, '').includes(bd))) return false;
    if (F.etq && !(dados.etq.get(c.id) || []).includes(F.etq)) return false;
    if (F.at === 'sem' && cv) return false;
    if (F.at && F.at !== 'sem' && cv?.status !== F.at) return false;
    if (F.emAt && !(cv && cv.status !== 'encerrada')) return false;
    if (F.bloq && !c.bloqueado) return false;
    if (!F.bloq && c.bloqueado && F.busca === '') { /* bloqueados aparecem normalmente */ }
    if (F.resp === '__fila' && c.responsavel_id) return false;
    if (F.resp && F.resp !== '__fila' && c.responsavel_id !== F.resp) return false;
    return true;
  }).sort((a, b2) => String(b2.ultima_interacao || b2.criado_em).localeCompare(String(a.ultima_interacao || a.criado_em)));
}

function tabela() {
  const l = filtrados(); const tot = l.length; const pags = Math.max(1, Math.ceil(tot / POR_PAG));
  F.pag = Math.min(F.pag, pags);
  const pg = l.slice((F.pag - 1) * POR_PAG, F.pag * POR_PAG);
  const box = $('#ctTab'); if (!box) return;
  if (!dados.clientes.length) { box.innerHTML = '<div class="empty">Nenhum contato ainda. Clique em <b>Novo contato</b>, importe uma planilha, ou espere o primeiro cliente chamar no WhatsApp.</div>'; return; }
  box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Etiquetas</th><th>Atendimento</th><th>Responsável</th><th>Última interação</th><th class="r">Ações</th></tr></thead><tbody>
    ${pg.length ? pg.map((c) => { const cv = dados.conv.get(c.id); return `<tr>
      <td><b>${esc(c.nome)}</b>${c.bloqueado ? ' <span class="chip bad">Bloqueado</span>' : ''}${c.empresa_cliente ? `<div class="s">${esc(c.empresa_cliente)}</div>` : ''}</td>
      <td>${esc(fmtTel(c.whatsapp || c.telefone))}${c.email ? `<div class="s">${esc(c.email)}</div>` : ''}</td>
      <td><div class="etqs">${chipsEtiquetas(dados.etq.get(c.id), 3) || '<span class="s">—</span>'}</div></td>
      <td>${cv ? `<span class="chip ${cv.status === 'fila' ? 'rust' : cv.status === 'aguardando_atendente' ? 'gold' : cv.status === 'aguardando_cliente' ? 'info' : cv.status === 'ativo' ? 'good' : 'mute'}">${STATUS[cv.status].nome}</span>` : '<span class="s">Sem conversa</span>'}</td>
      <td>${c.responsavel_id ? esc(nomePessoa(c.responsavel_id)) : '<span class="s">Ninguém</span>'}</td>
      <td>${c.ultima_interacao ? fmtDataHora(c.ultima_interacao) : '<span class="s">—</span>'}</td>
      <td class="r"><button class="btn sm" data-abrir="${c.id}">Conversa</button> <button class="icon-btn" data-mais="${c.id}" aria-label="Mais ações para ${esc(c.nome)}">${icon('mais')}</button></td></tr>`; }).join('')
      : '<tr><td colspan="7"><div class="empty" style="border:0">Nenhum contato com esses filtros.</div></td></tr>'}
    </tbody></table>
    <div class="pag"><span>Mostrando ${tot ? (F.pag - 1) * POR_PAG + 1 : 0}–${Math.min(F.pag * POR_PAG, tot)} de ${tot} contatos</span>
      <div><button class="btn sm" data-pg="-1" ${F.pag <= 1 ? 'disabled' : ''}>Anterior</button><span>Página ${F.pag} de ${pags}</span><button class="btn sm" data-pg="1" ${F.pag >= pags ? 'disabled' : ''}>Próxima</button></div></div></div>`;
}

async function clique(e) {
  const pg = e.target.closest('[data-pg]'); if (pg) { F.pag += Number(pg.dataset.pg); tabela(); return; }
  const ab = e.target.closest('[data-abrir]');
  if (ab) { try { const id = await rpc('abrir_conversa', { p_cliente: ab.dataset.abrir }); irPara('#/chat/' + id); } catch (er) { falhou(er); } return; }
  const mb = e.target.closest('[data-mais]'); if (!mb) return;
  const c = dados.clientes.find((x) => x.id === mb.dataset.mais); const cv = dados.conv.get(c.id);
  menu(mb, [
    ['editar', 'Editar contato', 'editar'], ['etq', 'Etiquetas', 'etiquetas'], ['hist', 'Histórico', 'hist'],
    ['lembrete', 'Criar lembrete', 'lembretes'], ['pedido', 'Novo pedido', 'pedidos'],
    cv ? ['transferir', 'Transferir atendimento', 'equipe'] : null,
    ['bloq', c.bloqueado ? 'Desbloquear' : 'Bloquear', 'x'],
  ], async (v) => {
    try {
      if (v === 'editar') formContato(c, () => carregar());
      if (v === 'etq') gerenciarEtiquetas(c.id, c.nome, (l) => { dados.etq.set(c.id, l); tabela(); });
      if (v === 'hist') historico(c);
      if (v === 'lembrete') formLembrete(null, null, { cliente_id: c.id, conversa_id: cv?.id || null, nomeCliente: c.nome, responsavel_id: c.responsavel_id || undefined });
      if (v === 'pedido') (await import('./pedidos.js')).formPedido(null, null, { cliente_id: c.id, conversa_id: cv?.id || null, responsavel_id: c.responsavel_id });
      if (v === 'transferir') {
        const ops = S.pessoas.filter((p) => p.ativo && ['gerente', 'funcionario'].includes(p.papel) && p.id !== cv.responsavel_id);
        escolherPessoa('Transferir atendimento', 'Quem vai cuidar deste contato a partir de agora?', ops, async (para) => { await rpc('transferir_conversa', { p_conversa: cv.id, p_para: para }); toast('Atendimento transferido'); carregar(); },
          { titulo: 'Devolver para aguardando atendimento', texto: 'Deixa o contato na fila, sem responsável.' });
      }
      if (v === 'bloq') { await q(S.sb.from('clientes').update({ bloqueado: !c.bloqueado }).eq('id', c.id)); c.bloqueado = !c.bloqueado; tabela(); toast(c.bloqueado ? 'Contato bloqueado' : 'Contato desbloqueado'); }
    } catch (er) { falhou(er); }
  });
}

async function historico(c) {
  const cv = dados.conv.get(c.id);
  const [peds, lems, negs, evs] = await Promise.all([
    q(S.sb.from('pedidos').select('numero,produto,total,status,criado_em').eq('cliente_id', c.id).order('criado_em', { ascending: false })).catch(() => []),
    q(S.sb.from('tarefas').select('titulo,data,hora,feita').eq('cliente_id', c.id).order('data', { ascending: false })).catch(() => []),
    q(S.sb.from('negocios').select('titulo,valor,etapa').eq('cliente_id', c.id)).catch(() => []),
    cv ? q(S.sb.from('conversa_eventos').select('texto,criado_em,autor_id').eq('conversa_id', cv.id).order('criado_em', { ascending: false }).limit(30)).catch(() => []) : [],
  ]);
  const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  const sec = (t, l, fn) => `<div class="lbl" style="margin-top:6px">${t} (${l.length})</div>${l.length ? `<div class="list">${l.map(fn).join('')}</div>` : '<p class="hint">Nada ainda.</p>'}`;
  abrir(`<div class="dlg-h"><div><h3>${esc(c.nome)}</h3><p class="hint">Cadastrado em ${fmtDataHora(c.criado_em)}${c.origem === 'whatsapp' ? ' pelo WhatsApp' : ''}</p></div><button type="button" class="icon-btn" id="f-cancel" aria-label="Fechar">${icon('x')}</button></div>
    <div style="max-height:62vh;overflow-y:auto">
    ${sec('Pedidos', peds, (p) => `<div class="row"><div class="main-c"><div class="t">#${p.numero} ${esc(p.produto)}</div><div class="s">${fmtDataHora(p.criado_em)} · ${p.status}</div></div><b>${brl(p.total)}</b></div>`)}
    ${sec('Negócios no funil', negs, (n) => `<div class="row"><div class="main-c"><div class="t">${esc(n.titulo)}</div><div class="s">${n.etapa}</div></div><b>${brl(n.valor)}</b></div>`)}
    ${sec('Lembretes', lems, (l) => `<div class="row"><div class="main-c"><div class="t">${l.feita ? '✓ ' : ''}${esc(l.titulo)}</div><div class="s">${l.data ? l.data.split('-').reverse().join('/') : ''} ${esc(l.hora || '')}</div></div></div>`)}
    ${sec('Atendimento', evs, (e) => `<div class="row"><div class="main-c"><div class="t">${esc(e.texto)}</div><div class="s">${fmtDataHora(e.criado_em)}${e.autor_id ? ' · ' + esc(nomePessoa(e.autor_id)) : ''}</div></div></div>`)}
    </div>`, null, null, { semFoco: true });
}

function exportar() {
  const l = filtrados();
  baixarCsv('contatos.csv', [['Nome', 'Telefone', 'WhatsApp', 'E-mail', 'Empresa', 'Instagram', 'Etiquetas', 'Atendimento', 'Responsável', 'Última interação', 'Anotações'],
    ...l.map((c) => [c.nome, c.telefone, c.whatsapp, c.email, c.empresa_cliente, c.instagram, (dados.etq.get(c.id) || []).map((id) => S.etiquetas.find((e) => e.id === id)?.nome).join(', '),
      STATUS[dados.conv.get(c.id)?.status]?.nome || '', c.responsavel_id ? nomePessoa(c.responsavel_id) : '', c.ultima_interacao ? fmtDataHora(c.ultima_interacao) : '', c.obs])]);
}

// importar CSV (nome; telefone; e-mail; empresa; anotações)
function importar() {
  const f = abrir(`<h3>Importar contatos de planilha</h3>
    <p class="hint">Salve a planilha como CSV (no Excel: Arquivo, Salvar como, CSV). A primeira linha deve ter os títulos. O sistema reconhece as colunas <b>nome</b>, <b>telefone</b>, <b>email</b>, <b>empresa</b> e <b>anotações</b>.</p>
    <input type="file" id="impArq" accept=".csv,text/csv">
    <div id="impPrev" class="small"></div>
    ${lider() ? `<div class="field"><label for="impResp">Responsável pelos contatos</label><select id="impResp"><option value="">Ninguém (ficam na fila)</option>${opcoesPessoas('')}</select></div>` : ''}
    ${rodape({ salvar: 'Importar' })}`, async () => {
    if (!linhas.length) throw new Error('Escolha um arquivo com contatos.');
    const resp = lider() ? (f.querySelector('#impResp').value || null) : S.me.id;
    let ok = 0, rep = 0;
    for (let i = 0; i < linhas.length; i += 200) {
      const lote = linhas.slice(i, i + 200).map((x) => ({ ...x, empresa_id: S.empresaId, responsavel_id: resp }));
      const { error } = await S.sb.from('clientes').insert(lote);
      if (!error) { ok += lote.length; continue; }
      for (const x of lote) { const r = await S.sb.from('clientes').insert(x); if (r.error) rep++; else ok++; }
    }
    toast(`${ok} contato(s) importado(s)${rep ? `, ${rep} ignorado(s) (telefone repetido ou inválido)` : ''}`);
    carregar();
  });
  let linhas = [];
  f.querySelector('#impArq').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    let txt = await file.text(); if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
    const sep = (txt.split('\n')[0].match(/;/g) || []).length >= (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows = parseCsv(txt, sep).filter((r) => r.some((c) => c.trim()));
    const cab = (rows.shift() || []).map((h) => norm(h).trim());
    const idx = (nomes) => cab.findIndex((h) => nomes.some((n) => h.includes(n)));
    const iN = idx(['nome', 'name', 'cliente']), iT = idx(['telefone', 'celular', 'whatsapp', 'fone', 'phone']), iE = idx(['email', 'e-mail']), iEm = idx(['empresa', 'company']), iO = idx(['anota', 'obs', 'nota']);
    if (iN < 0) { f.querySelector('#impPrev').innerHTML = '<span class="err">Não achei a coluna "nome" na primeira linha.</span>'; linhas = []; return; }
    linhas = rows.map((r) => ({ nome: (r[iN] || '').trim(), telefone: iT >= 0 ? (r[iT] || '').trim() : '', email: iE >= 0 ? (r[iE] || '').trim() : '', empresa_cliente: iEm >= 0 ? (r[iEm] || '').trim() : '', obs: iO >= 0 ? (r[iO] || '').trim() : '' })).filter((x) => x.nome);
    f.querySelector('#impPrev').innerHTML = `${linhas.length} contato(s) encontrados. Primeiros: ${linhas.slice(0, 3).map((x) => esc(x.nome)).join(', ')}`;
  };
}
function parseCsv(t, sep) {
  const out = []; let row = [], cur = '', aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else aspas = false; } else cur += ch; }
    else if (ch === '"') aspas = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); out.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out;
}
