// Chat do WhatsApp com os clientes
import {
  S, $, $$, esc, q, rpc, api, abrir, rodape, fechar, confirmar, toast, falhou, msgErro, icon, avatar, menu, pop, fecharPop,
  fmtQuando, fmtHora, fmtData, fmtDataHora, fmtTel, desde, isoDia, norm, debounce, lider, atende, isAdmin, STATUS, PAPEL_NOME,
  nomePessoa, pessoa, ouvir, buscarTudo, enviarArquivo, tipoMidia, uid, etiquetaHtml,
} from '../core.js';
import { irPara, contador } from '../app.js';
import {
  gerenciarEtiquetas, chipsEtiquetas, formLembrete, formContato, escolherEmoji, inserirNoCursor, autoAltura, linkificar,
  resolverMidias, htmlMidia, verMidia, escolherDaGaleria, escolherContato, escolherPessoa,
} from '../comum.js';

const LIM = { imagem: 5, video: 16, audio: 16, documento: 100 }; // MB, limites do WhatsApp
const C = { notas: [], agendadas: [], modoNota: false, lista: [], etq: new Map(), favs: new Set(), filtro: 'todos', extra: '', busca: '', sel: null, msgs: [], eventos: [], favMsgs: new Set(), det: false, resp: null, rec: null, carregouTudo: false };
let el, desligar = [], tickLista;

export default {
  async render(root, arg) {
    el = root; el.className = 'view-area flush';
    Object.assign(C, { sel: null, msgs: [], eventos: [], resp: null });
    el.innerHTML = `<div class="chat" id="chat">
      <section class="chat-lista" aria-label="Conversas">
        <div class="cl-top">
          <div class="linha"><input type="search" id="clBusca" placeholder="Nome, telefone, status ou etiqueta" aria-label="Buscar conversa" value="${esc(C.busca)}">
            <button class="icon-btn" id="clNova" title="Nova conversa" aria-label="Nova conversa">${icon('mais2')}</button></div>
          <div class="filt" id="clFilt"></div>
        </div>
        <div class="cl-itens" id="clItens"><div class="empty" style="margin:12px">Carregando conversas…</div></div>
      </section>
      <section class="chat-conv" id="conv" aria-label="Conversa aberta"><div class="vazio-conv"><div class="empty"><b>Nenhuma conversa aberta</b><br>Escolha uma conversa na lista para atender.</div></div></section>
    </div>`;
    $('#clBusca').oninput = debounce((e) => { C.busca = e.target.value; desenharLista(); }, 150);
    $('#clNova').onclick = novaConversa;
    $('#clFilt').onclick = cliqueFiltro;
    $('#clItens').onclick = (e) => { const a = e.target.closest('[data-conv]'); if (a) { e.preventDefault(); irPara('#/chat/' + a.dataset.conv); } };
    await carregarLista();
    if (arg) abrirConversa(arg);
    desligar = [
      ouvir('conversas', aoMudarConversa), ouvir('mensagens', aoMudarMensagem),
      ouvir('notas_internas', (p) => { const n = p.new; if (n?.conversa_id === C.sel && !C.notas.some((x) => x.id === n.id)) { C.notas.push(n); desenharMensagens(false); } }),
      ouvir('mensagens_agendadas', (p) => { if ((p.new || p.old)?.conversa_id === C.sel) recarregarAgendadas(); }), ouvir('tick', () => { carregarLista(true); if (C.sel) recarregarMsgs(); }),
    ];
    tickLista = setInterval(() => { if (S.rtOk && !document.hidden) carregarLista(true); }, 60000);
  },
  mudarArg(arg) { if (arg) abrirConversa(arg); else fecharConversa(); },
  sair() { desligar.forEach((f) => f()); desligar = []; clearInterval(tickLista); pararGravacao(true); },
};

/* ---------- lista ---------- */
const SEL_CONV = '*, cliente:clientes(id,nome,telefone,whatsapp,bloqueado,responsavel_id,obs,email,instagram,empresa_cliente,ultima_interacao,criado_em)';
async function carregarLista(silencioso) {
  try {
    const [lista, etq, favs] = await Promise.all([
      q(S.sb.from('conversas').select(SEL_CONV).eq('empresa_id', S.empresaId).order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(800)),
      buscarTudo('cliente_etiquetas', (x) => x.eq('empresa_id', S.empresaId), 'cliente_id,etiqueta_id', null),
      q(S.sb.from('conversa_favoritas').select('conversa_id').eq('user_id', S.me.id)),
    ]);
    C.lista = lista; C.etq = new Map();
    for (const r of etq) { if (!C.etq.has(r.cliente_id)) C.etq.set(r.cliente_id, []); C.etq.get(r.cliente_id).push(r.etiqueta_id); }
    C.favs = new Set(favs.map((f) => f.conversa_id));
    desenharLista();
    if (C.sel) { const c = conv(C.sel); if (c) desenharCabecalho(); }
  } catch (e) { if (!silencioso) falhou(e); }
}
const conv = (id) => C.lista.find((c) => c.id === id);
const etqsDe = (c) => C.etq.get(c?.cliente_id) || [];
function contarNaoLidas() {
  const n = C.lista.filter((c) => !c.arquivada && c.nao_lidas > 0 && (c.responsavel_id === S.me.id || !c.responsavel_id)).length;
  contador('chat', n); return n;
}

function filtrar() {
  const b = norm(C.busca);
  let l = C.lista.filter((c) => {
    if (C.filtro === 'arquivadas') { if (!c.arquivada) return false; } else if (c.arquivada) return false;
    if (C.filtro === 'naolidas' && !(c.nao_lidas > 0)) return false;
    if (C.filtro === 'favoritas' && !C.favs.has(c.id)) return false;
    if (C.filtro === 'minhas' && c.responsavel_id !== S.me.id) return false;
    if (C.filtro === 'fixadas' && !c.fixada) return false;
    if (C.filtro.startsWith('st:') && c.status !== C.filtro.slice(3)) return false;
    if (C.filtro.startsWith('etq:') && !etqsDe(c).includes(C.filtro.slice(4))) return false;
    if (C.filtro.startsWith('resp:') && c.responsavel_id !== C.filtro.slice(5)) return false;
    if (b) {
      const txt = [c.cliente?.nome, c.cliente?.telefone, c.cliente?.whatsapp, STATUS[c.status]?.nome, ...etqsDe(c).map((id) => S.etiquetas.find((e) => e.id === id)?.nome)].join(' ');
      if (!norm(txt).includes(b) && !String(c.cliente?.whatsapp || '').includes(b.replace(/\D/g, '') || '§')) return false;
    }
    return true;
  });
  l.sort((a, b2) => (b2.fixada - a.fixada) || String(b2.ultima_msg_em || b2.criado_em).localeCompare(String(a.ultima_msg_em || a.criado_em)));
  return l;
}
const NOMES_FILTRO = { minhas: 'Minhas conversas', fixadas: 'Fixadas', arquivadas: 'Arquivadas' };
function nomeFiltroExtra(f) {
  if (NOMES_FILTRO[f]) return NOMES_FILTRO[f];
  if (f.startsWith('st:')) return STATUS[f.slice(3)]?.nome;
  if (f.startsWith('etq:')) return S.etiquetas.find((e) => e.id === f.slice(4))?.nome || 'Etiqueta';
  if (f.startsWith('resp:')) return nomePessoa(f.slice(5));
  return '';
}
function desenharLista() {
  const vis = C.lista.filter((c) => !c.arquivada);
  const nNl = vis.filter((c) => c.nao_lidas > 0).length, nFav = vis.filter((c) => C.favs.has(c.id)).length;
  const extra = !['todos', 'naolidas', 'favoritas'].includes(C.filtro) ? C.filtro : '';
  $('#clFilt').innerHTML = `<button type="button" data-f="todos" aria-pressed="${C.filtro === 'todos'}">Todos</button>
    <button type="button" data-f="naolidas" aria-pressed="${C.filtro === 'naolidas'}">Não lidos <b>${nNl}</b></button>
    <button type="button" data-f="favoritas" aria-pressed="${C.filtro === 'favoritas'}">Favoritos <b>${nFav}</b></button>
    <button type="button" data-f="mais" aria-pressed="${!!extra}" aria-label="Mais filtros">${extra ? esc(nomeFiltroExtra(extra)) + ' ✕' : 'Mais filtros ▾'}</button>`;
  const l = filtrar();
  contarNaoLidas();
  $('#clItens').innerHTML = l.length ? l.map(itemLista).join('') : `<div class="empty" style="margin:12px">${C.lista.length ? 'Nenhuma conversa com esse filtro.' : 'Nenhuma conversa ainda. Quando um cliente mandar mensagem no WhatsApp, ela aparece aqui. Você também pode começar uma no botão +.'}</div>`;
}
function itemLista(c) {
  const k = c.cliente || {}; const nome = k.nome || fmtTel(k.whatsapp) || 'Sem nome';
  const prev = (c.ultima_msg_direcao === 'out' ? 'Você: ' : '') + (c.ultima_msg_texto || '');
  const resp = lider() && c.responsavel_id && c.responsavel_id !== S.me.id ? ` · ${esc(nomePessoa(c.responsavel_id))}` : '';
  return `<a class="ci st-${c.status}" href="#/chat/${c.id}" data-conv="${c.id}" ${C.sel === c.id ? 'aria-current="true"' : ''}>
    ${avatar(nome, null)}
    <div class="c-main"><div class="c-l1"><span class="nm">${c.fixada ? '📌 ' : ''}${C.favs.has(c.id) ? '★ ' : ''}${esc(nome)}</span><span class="hr">${fmtQuando(c.ultima_msg_em || c.criado_em)}</span></div>
      <span class="tel">${esc(fmtTel(k.whatsapp || k.telefone))}</span>
      ${prev ? `<span class="pv">${esc(prev)}</span>` : ''}
      ${etqsDe(c).length ? `<div class="etqs">${chipsEtiquetas(etqsDe(c), 2)}</div>` : ''}
      <div class="c-l3"><span class="stl">${STATUS[c.status]?.nome || c.status}${resp}</span>${c.nao_lidas > 0 ? `<span class="nl">${c.nao_lidas}</span>` : ''}</div></div></a>`;
}
function cliqueFiltro(e) {
  const b = e.target.closest('[data-f]'); if (!b) return;
  const f = b.dataset.f;
  if (f !== 'mais') { C.filtro = f; desenharLista(); return; }
  if (!['todos', 'naolidas', 'favoritas'].includes(C.filtro)) { C.filtro = 'todos'; desenharLista(); return; }
  const itens = [['minhas', 'Minhas conversas'], ['fixadas', 'Fixadas'], ['arquivadas', 'Arquivadas'], '-',
    ...Object.entries(STATUS).map(([k, v]) => ['st:' + k, v.nome])];
  if (S.etiquetas.length) itens.push('-', ...S.etiquetas.slice(0, 30).map((e2) => ['etq:' + e2.id, 'Etiqueta: ' + e2.nome]));
  if (lider()) itens.push('-', ...S.pessoas.filter((p) => p.papel !== 'admin' && p.ativo).map((p) => ['resp:' + p.id, 'Responsável: ' + (p.nome || p.email)]));
  menu(b, itens, (v) => { C.filtro = v; desenharLista(); }, { alinhar: 'esq' });
}

/* ---------- tempo real ---------- */
async function aoMudarConversa(p) {
  const id = p.new?.id || p.old?.id; if (!id) return;
  if (p.eventType === 'DELETE') { C.lista = C.lista.filter((c) => c.id !== id); desenharLista(); if (C.sel === id) fecharConversa(); return; }
  const { data } = await S.sb.from('conversas').select(SEL_CONV).eq('id', id).maybeSingle();
  const i = C.lista.findIndex((c) => c.id === id);
  if (!data) { if (i >= 0) C.lista.splice(i, 1); }
  else if (i >= 0) C.lista[i] = data; else C.lista.unshift(data);
  desenharLista();
  if (C.sel === id) { if (data) { desenharCabecalho(); if (data.nao_lidas > 0 && document.hasFocus()) marcarLida(data); } else { toast('Esta conversa saiu da sua lista.'); fecharConversa(); } }
}
async function aoMudarMensagem(p) {
  const m = p.new; if (!m || m.conversa_id !== C.sel) return;
  const i = C.msgs.findIndex((x) => x.id === m.id);
  if (i >= 0) { C.msgs[i] = { ...C.msgs[i], ...m }; atualizarBolha(C.msgs[i]); }
  else if (p.eventType === 'INSERT') {
    if (C.msgs.some((x) => x._tmp && x.texto === m.texto && x.direcao === m.direcao && m.autor_id === S.me.id)) return; // a resposta do envio vai trocar
    C.msgs.push(m); desenharMensagens(true);
  }
}

/* ---------- conversa aberta ---------- */
async function abrirConversa(id) {
  if (!conv(id)) {
    const { data } = await S.sb.from('conversas').select(SEL_CONV).eq('id', id).maybeSingle();
    if (!data) { toast('Conversa não encontrada ou sem acesso.', true); irPara('#/chat', true); return; }
    C.lista.unshift(data);
  }
  C.sel = id; C.resp = null; C.carregouTudo = false; pararGravacao(true);
  $('#chat').classList.add('aberta');
  $$('#clItens .ci').forEach((a) => a.toggleAttribute('aria-current', a.dataset.conv === id));
  $$('#clItens .ci[aria-current]').forEach((a) => a.setAttribute('aria-current', 'true'));
  const box = $('#conv');
  box.innerHTML = `<header class="cv-h" id="cvH"></header><div id="cvAvisos"></div><div class="cv-busca" id="cvBusca" hidden></div>
    <div class="cv-msgs" id="cvMsgs" aria-live="polite"><div class="evt">Carregando mensagens…</div></div>
    <div class="cv-comp" id="cvComp"></div>`;
  desenharCabecalho(); desenharComposer();
  await recarregarMsgs();
  const c = conv(id); if (c?.nao_lidas > 0) marcarLida(c);
  if (C.det) abrirDetalhes();
}
function fecharConversa() {
  C.sel = null; $('#chat')?.classList.remove('aberta', 'com-det');
  $('#chat-det')?.remove();
  const box = $('#conv'); if (box) box.innerHTML = '<div class="vazio-conv"><div class="empty"><b>Nenhuma conversa aberta</b><br>Escolha uma conversa na lista para atender.</div></div>';
  $$('#clItens .ci[aria-current]').forEach((a) => a.removeAttribute('aria-current'));
}
async function marcarLida(c) {
  try { await q(S.sb.from('conversas').update({ nao_lidas: 0 }).eq('id', c.id)); c.nao_lidas = 0; desenharLista(); } catch (e) {}
}
async function recarregarMsgs(tudo) {
  const id = C.sel; if (!id) return;
  try {
    let qm = S.sb.from('mensagens').select('*').eq('conversa_id', id).order('criado_em', { ascending: false }).limit(tudo ? 3000 : 80);
    const [msgs, evs, favs, notas, ags] = await Promise.all([
      q(qm), q(S.sb.from('conversa_eventos').select('*').eq('conversa_id', id).order('criado_em', { ascending: true }).limit(300)),
      q(S.sb.from('mensagem_favoritas').select('mensagem_id').eq('user_id', S.me.id)),
      q(S.sb.from('notas_internas').select('*').eq('conversa_id', id).order('criado_em', { ascending: true }).limit(300)).catch(() => []),
      q(S.sb.from('mensagens_agendadas').select('*').eq('conversa_id', id).in('status', ['pendente', 'erro']).order('enviar_em')).catch(() => []),
    ]);
    if (C.sel !== id) return;
    C.carregouTudo = tudo || msgs.length < 80;
    C.msgs = msgs.reverse(); C.eventos = evs; C.favMsgs = new Set(favs.map((f) => f.mensagem_id)); C.notas = notas; C.agendadas = ags;
    desenharMensagens(true); desenharAgendadas();
  } catch (e) { falhou(e); }
}

function desenharCabecalho() {
  const c = conv(C.sel); const h = $('#cvH'); if (!c || !h) return;
  const k = c.cliente || {}; const nome = k.nome || fmtTel(k.whatsapp) || 'Sem nome';
  const podeAssumir = atende() && (!c.responsavel_id || (lider() && c.responsavel_id !== S.me.id));
  h.innerHTML = `<button class="icon-btn cv-voltar" id="cvVoltar" aria-label="Voltar para a lista">${icon('voltar')}</button>
    ${avatar(nome, null)}
    <div class="cv-id"><span class="nm">${esc(nome)}${k.bloqueado ? ' <span class="chip bad">Bloqueado</span>' : ''}</span><span class="tel">${esc(fmtTel(k.whatsapp || k.telefone))}${c.responsavel_id && c.responsavel_id !== S.me.id ? ' · com ' + esc(nomePessoa(c.responsavel_id)) : ''}</span></div>
    ${podeAssumir && !c.responsavel_id ? '<button class="btn sm pri" id="cvAssumir">Assumir</button>' : ''}
    <button class="icon-btn" id="cvHist" title="Histórico do atendimento" aria-label="Histórico do atendimento">${icon('hist')}</button>
    <button class="icon-btn" id="cvBuscar" title="Buscar na conversa" aria-label="Buscar na conversa">${icon('busca')}</button>
    <button class="icon-btn" id="cvMais" title="Mais ações" aria-label="Mais ações">${icon('mais')}</button>
    <button class="stbtn st-${c.status}" id="cvStatus" title="Mudar status">${STATUS[c.status]?.nome}</button>
    <button class="icon-btn ${C.det ? 'on' : ''}" id="cvDet" title="Detalhes do contato" aria-label="Detalhes do contato" aria-pressed="${C.det}">${icon('info')}</button>`;
  $('#cvVoltar').onclick = () => irPara('#/chat');
  $('#cvAssumir') && ($('#cvAssumir').onclick = assumir);
  $('#cvHist').onclick = historico;
  $('#cvBuscar').onclick = abrirBusca;
  $('#cvMais').onclick = (e) => menuConversa(e.currentTarget);
  $('#cvStatus').onclick = mudarStatus;
  $('#cvDet').onclick = () => { C.det = !C.det; if (C.det) abrirDetalhes(); else fecharDetalhes(); desenharCabecalho(); };
  // avisos
  const av = [];
  if (!c.responsavel_id) av.push(`<div class="cv-aviso fila">Esta conversa está ${c.area_id ? 'na fila da área <b>' + esc(S.areas.find((a) => a.id === c.area_id)?.nome || '') + '</b>' : 'na fila, sem responsável'}.${atende() ? ' Assuma para atender, ou responda direto que ela fica com você.' : ''}</div>`);
  if (!S.waConta) av.push('<div class="cv-aviso">O WhatsApp ainda não está conectado. As mensagens que você enviar ficam guardadas só aqui no CRM.</div>');
  else if (!c.janela_ate || new Date(c.janela_ate) < new Date()) av.push('<div class="cv-aviso">Passaram mais de 24 horas desde a última mensagem do cliente. Pelas regras do WhatsApp, agora só dá para enviar um modelo aprovado. <button class="btn sm" id="cvModelo">Enviar modelo</button></div>');
  if (k.bloqueado) av.push('<div class="cv-aviso fila">Este contato está bloqueado. As mensagens dele não entram no CRM.</div>');
  $('#cvAvisos').innerHTML = av.join('') + '<div id="cvAgend"></div>';
  desenharAgendadas();
  $('#cvModelo') && ($('#cvModelo').onclick = enviarModelo);
  // composer liberado?
  const ta = $('#cvTxt'); if (ta) { ta.disabled = !!k.bloqueado; ta.placeholder = k.bloqueado ? 'Contato bloqueado' : 'Mensagem (digite / para atalhos)'; }
}

/* ---------- mensagens ---------- */
const TK = { pendente: '🕓', enviada: '✓', entregue: '✓✓', lida: '✓✓', erro: '⚠', nao_enviada: '•', recebida: '' };
const TKN = { pendente: 'Enviando', enviada: 'Enviada', entregue: 'Entregue', lida: 'Lida', erro: 'Erro ao enviar', nao_enviada: 'Guardada no CRM (WhatsApp não conectado)', recebida: '' };
function bolha(m) {
  const fav = C.favMsgs.has(m.id);
  const quote = m.resposta_a ? C.msgs.find((x) => x.id === m.resposta_a) : null;
  let corpo = '';
  if (m.tipo === 'texto' || m.tipo === 'modelo' || m.tipo === 'outro') corpo = `<div class="tx">${linkificar(m.texto || (m.tipo === 'outro' ? 'Mensagem não suportada' : ''))}</div>`;
  else if (m.tipo === 'localizacao') { const [la, lo] = String(m.texto || '').split(','); corpo = `<a href="https://maps.google.com/?q=${encodeURIComponent((la || '') + ',' + (lo || ''))}" target="_blank" rel="noopener">📍 Ver localização no mapa</a>`; }
  else { corpo = htmlMidia(m.midia_path, m.midia_mime || '', m.midia_nome, m.midia_tamanho) || `<span class="muted">${m.tipo === 'figurinha' ? 'Figurinha' : 'Mídia'} indisponível</span>`; if (m.texto) corpo += `<div class="tx" style="margin-top:4px">${linkificar(m.texto)}</div>`; }
  const autor = m.direcao === 'out' && m.autor_id && m.autor_id !== S.me.id ? `<div class="autor">${esc(nomePessoa(m.autor_id))}</div>` : '';
  return `<div class="bb ${m.direcao}" data-msg="${m.id}" id="m-${m.id}">${autor}${quote ? `<div class="quote">${esc((quote.texto || quote.midia_nome || quote.tipo).slice(0, 120))}</div>` : ''}${corpo}
    <div class="meta">${fav ? '<span class="fav" title="Favorita">★</span>' : ''}${m.tipo === 'modelo' ? '<span>modelo</span>' : ''}<span>${fmtHora(m.criado_em)}</span>${m.direcao === 'out' ? `<span class="tk ${m.status}" title="${esc(m.erro || TKN[m.status] || '')}">${TK[m.status] || ''}</span>` : ''}</div>
    ${m.direcao === 'out' && m.status === 'erro' && m.tipo !== 'modelo' ? `<div class="small" style="color:var(--bad);margin-top:4px">${esc(m.erro || 'Não foi enviada')} <button type="button" class="btn sm" data-act="reenviar">Tentar de novo</button></div>` : ''}
    <div class="acoes">${m._tmp ? '' : `<button type="button" data-act="resp" title="Responder" aria-label="Responder">${icon('responder')}</button><button type="button" data-act="fav" title="${fav ? 'Tirar dos favoritos' : 'Favoritar'}" aria-label="Favoritar">${icon('estrela')}</button>`}</div></div>`;
}
function desenharMensagens(rolar) {
  const box = $('#cvMsgs'); if (!box) return;
  const perto = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const desdeT = (x) => !C.msgs.length || C.carregouTudo || x.criado_em >= C.msgs[0].criado_em;
  const itens = [...C.msgs.map((m) => ({ t: m.criado_em, m })), ...C.eventos.filter(desdeT).map((e) => ({ t: e.criado_em, e })), ...C.notas.filter(desdeT).map((n) => ({ t: n.criado_em, n }))]
    .sort((a, b) => String(a.t).localeCompare(String(b.t)));
  let dia = ''; const out = [];
  if (!C.carregouTudo && C.msgs.length) out.push('<button class="btn sm" id="cvAntigas" style="align-self:center">Carregar mensagens antigas</button>');
  for (const it of itens) {
    const d = isoDia(new Date(it.t));
    if (d !== dia) { dia = d; out.push(`<div class="dia">${d === isoDia() ? 'Hoje' : fmtData(d)}</div>`); }
    if (it.n) { out.push(`<div class="nota-int" data-nota="${it.n.id}"><div class="autor">📝 Nota interna · ${esc(nomePessoa(it.n.autor_id))}</div><div class="tx">${linkificar(it.n.texto)}</div><div class="meta"><span>${fmtHora(it.n.criado_em)}</span>${it.n.autor_id === S.me.id || lider() ? `<button type="button" class="btn sm ghost" data-del-nota="${it.n.id}">Apagar</button>` : ''}</div></div>`); continue; }
    out.push(it.m ? bolha(it.m) : `<div class="evt">${esc(it.e.texto || it.e.tipo)} · ${fmtHora(it.e.criado_em)}${it.e.autor_id ? ' · ' + esc(nomePessoa(it.e.autor_id)) : ''}</div>`);
  }
  box.innerHTML = out.join('') || '<div class="evt">Nenhuma mensagem ainda. Escreva abaixo para começar.</div>';
  resolverMidias(box);
  if (rolar || perto) box.scrollTop = box.scrollHeight;
  const ant = $('#cvAntigas'); if (ant) ant.onclick = async () => { ant.disabled = true; await recarregarMsgs(true); $('#cvMsgs').scrollTop = 0; };
  box.onclick = cliqueMensagem;
}
function atualizarBolha(m) {
  const b = $('#m-' + m.id); if (!b) return desenharMensagens(false);
  b.outerHTML = bolha(m); resolverMidias($('#cvMsgs'));
}
async function cliqueMensagem(e) {
  const dn = e.target.closest('[data-del-nota]');
  if (dn) { try { await q(S.sb.from('notas_internas').delete().eq('id', dn.dataset.delNota)); C.notas = C.notas.filter((n) => n.id !== dn.dataset.delNota); desenharMensagens(false); } catch (er) { falhou(er); } return; }
  const img = e.target.closest('img[data-ver]'); if (img) return verMidia(img.dataset.ver, img.dataset.mime, img.alt);
  const b = e.target.closest('[data-act]'); if (!b) return;
  const m = C.msgs.find((x) => x.id === b.closest('[data-msg]').dataset.msg); if (!m) return;
  if (b.dataset.act === 'reenviar') {
    b.disabled = true;
    try { await enviar({ tipo: m.tipo, texto: m.texto, midia_path: m.midia_path, midia_mime: m.midia_mime, midia_nome: m.midia_nome, midia_tamanho: m.midia_tamanho }); } catch (er) { b.disabled = false; }
    return;
  }
  if (b.dataset.act === 'resp') { C.resp = m; desenharResposta(); $('#cvTxt')?.focus(); }
  if (b.dataset.act === 'fav') {
    try {
      if (C.favMsgs.has(m.id)) { await q(S.sb.from('mensagem_favoritas').delete().eq('user_id', S.me.id).eq('mensagem_id', m.id)); C.favMsgs.delete(m.id); }
      else { await q(S.sb.from('mensagem_favoritas').insert({ user_id: S.me.id, mensagem_id: m.id })); C.favMsgs.add(m.id); }
      atualizarBolha(m);
    } catch (er) { falhou(er); }
  }
}

/* ---------- escrever e enviar ---------- */
function desenharComposer() {
  const box = $('#cvComp');
  box.innerHTML = `<div id="cvResp"></div><div class="sug" id="cvSug" hidden role="listbox" aria-label="Respostas rápidas"></div>
    <div class="linha" id="cvLinha">
      <button class="icon-btn" id="cvAnexo" title="Enviar arquivo do computador" aria-label="Enviar arquivo">${icon('clipe')}</button>
      <button class="icon-btn" id="cvGaleria" title="Enviar da galeria" aria-label="Enviar da galeria">${icon('pasta')}</button>
      <button class="icon-btn" id="cvEmoji" title="Emoji" aria-label="Emoji">${icon('emoji')}</button>
      <button class="icon-btn" id="cvProd" title="Enviar produto do catálogo" aria-label="Enviar produto">${icon('caixa')}</button>
      <button class="icon-btn ${C.modoNota ? 'on' : ''}" id="cvNota" title="Nota interna (o cliente não vê)" aria-label="Nota interna" aria-pressed="${C.modoNota}">${icon('editar')}</button>
      <textarea id="cvTxt" rows="1" placeholder="Mensagem (digite / para atalhos)" aria-label="Mensagem" class="${C.modoNota ? 'modo-nota' : ''}"></textarea>
      <button class="icon-btn" id="cvAgendar" title="Agendar mensagem" aria-label="Agendar mensagem">${icon('hist')}</button>
      <button class="icon-btn" id="cvMic" title="Gravar áudio" aria-label="Gravar áudio">${icon('mic')}</button>
      <button class="icon-btn on" id="cvEnviar" title="Enviar" aria-label="Enviar" hidden>${icon('enviar')}</button>
    </div><input type="file" id="cvArq" multiple hidden>`;
  const ta = $('#cvTxt');
  ta.oninput = () => { autoAltura(ta); const tem = !!ta.value.trim(); $('#cvEnviar').hidden = !tem; $('#cvMic').hidden = tem; sugestoes(); };
  ta.onkeydown = teclaComposer;
  $('#cvEnviar').onclick = enviarTexto;
  $('#cvAnexo').onclick = () => $('#cvArq').click();
  $('#cvArq').onchange = (e) => { enviarArquivos([...e.target.files]); e.target.value = ''; };
  $('#cvGaleria').onclick = () => escolherDaGaleria((arqs) => arqs.forEach((a) => enviarMidia({ midia_path: a.path, midia_mime: a.mime, midia_nome: a.nome, midia_tamanho: a.tamanho })));
  $('#cvEmoji').onclick = (e) => escolherEmoji(e.currentTarget, (em) => inserirNoCursor(ta, em));
  $('#cvMic').onclick = gravar;
  $('#cvProd').onclick = enviarProduto;
  $('#cvAgendar').onclick = () => agendar();
  $('#cvNota').onclick = () => { C.modoNota = !C.modoNota; desenharComposer(); $('#cvTxt').focus(); };
  if (C.modoNota) { ta.placeholder = 'Nota interna: só a equipe vê. Enter para salvar'; }
  const conv2 = $('#conv');
  conv2.ondragover = (e) => { e.preventDefault(); };
  conv2.ondrop = (e) => { e.preventDefault(); if (e.dataTransfer.files.length) enviarArquivos([...e.dataTransfer.files]); };
  ta.onpaste = (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); enviarArquivos(fs); } };
  desenharCabecalho();
}
function desenharResposta() {
  const b = $('#cvResp'); if (!b) return;
  b.innerHTML = C.resp ? `<div class="resp"><span>Respondendo: <b>${esc((C.resp.texto || C.resp.midia_nome || C.resp.tipo).slice(0, 90))}</b></span><button class="icon-btn" id="cvRespX" aria-label="Cancelar resposta">${icon('x')}</button></div>` : '';
  $('#cvRespX') && ($('#cvRespX').onclick = () => { C.resp = null; desenharResposta(); });
}
// respostas rápidas: digite / e o atalho
let sugIdx = 0, sugLista = [];
function sugestoes() {
  const ta = $('#cvTxt'), box = $('#cvSug');
  const antes = ta.value.slice(0, ta.selectionStart); const mt = /(^|\s)(\/\S*)$/.exec(antes);
  if (!mt || !S.rapidas.length) { box.hidden = true; sugLista = []; return; }
  const t = mt[2].toLowerCase();
  sugLista = S.rapidas.filter((r) => r.atalho.toLowerCase().startsWith(t) || norm(r.conteudo).includes(norm(t.slice(1)))).slice(0, 8);
  if (!sugLista.length) { box.hidden = true; return; }
  sugIdx = Math.min(sugIdx, sugLista.length - 1);
  box.innerHTML = sugLista.map((r, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === sugIdx}"><b>${esc(r.atalho)}</b>${esc(r.conteudo.slice(0, 90))}</button>`).join('');
  box.hidden = false;
  box.onmousedown = (e) => { const b = e.target.closest('[data-i]'); if (b) { e.preventDefault(); usarSugestao(Number(b.dataset.i)); } };
}
function usarSugestao(i) {
  const r = sugLista[i]; if (!r) return;
  const ta = $('#cvTxt'); const pos = ta.selectionStart; const antes = ta.value.slice(0, pos).replace(/(^|\s)\/\S*$/, '$1');
  ta.value = antes + r.conteudo + ta.value.slice(pos); ta.selectionStart = ta.selectionEnd = (antes + r.conteudo).length;
  $('#cvSug').hidden = true; sugLista = []; ta.dispatchEvent(new Event('input')); ta.focus();
}
function teclaComposer(e) {
  if (sugLista.length && !$('#cvSug').hidden) {
    if (e.key === 'ArrowDown') { e.preventDefault(); sugIdx = (sugIdx + 1) % sugLista.length; sugestoes(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); sugIdx = (sugIdx - 1 + sugLista.length) % sugLista.length; sugestoes(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); usarSugestao(sugIdx); return; }
    if (e.key === 'Escape') { $('#cvSug').hidden = true; sugLista = []; return; }
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviarTexto(); }
}
function msgTemporaria(dados) {
  const m = { id: 'tmp-' + uid(), _tmp: true, conversa_id: C.sel, direcao: 'out', status: 'pendente', autor_id: S.me.id, criado_em: new Date().toISOString(), tipo: 'texto', ...dados };
  C.msgs.push(m); desenharMensagens(true); return m;
}
async function enviar(dados) {
  const id = C.sel; const tmp = msgTemporaria(dados);
  try {
    const r = await api('enviar', { conversa_id: id, ...dados });
    const i = C.msgs.findIndex((x) => x.id === tmp.id);
    if (i >= 0) { if (C.msgs.some((x) => x.id === r.mensagem.id)) C.msgs.splice(i, 1); else C.msgs[i] = r.mensagem; }
    if (C.sel === id) { desenharMensagens(true); if (!S.rtOk || conv(id)?.status !== 'aguardando_cliente') recarregarConversa(); }
    if (r.aviso) toast(r.aviso, true);
  } catch (e) {
    const i = C.msgs.findIndex((x) => x.id === tmp.id); if (i >= 0) C.msgs.splice(i, 1);
    if (C.sel === id) desenharMensagens(false);
    falhou(e); throw e;
  }
}
async function enviarTexto() {
  const ta = $('#cvTxt'); const texto = ta.value.trim(); if (!texto || !C.sel) return;
  if (C.modoNota) {
    ta.value = ''; ta.dispatchEvent(new Event('input'));
    try {
      const c = conv(C.sel);
      const n = await q(S.sb.from('notas_internas').insert({ empresa_id: c.empresa_id, conversa_id: c.id, autor_id: S.me.id, texto }).select().single());
      if (!C.notas.some((x) => x.id === n.id)) C.notas.push(n); desenharMensagens(true);
    } catch (e) { ta.value = texto; falhou(e); }
    return;
  }
  const resposta_a = C.resp?.id || null;
  ta.value = ''; ta.dispatchEvent(new Event('input')); C.resp = null; desenharResposta();
  try { await enviar({ tipo: 'texto', texto, resposta_a }); } catch (e) { if (!ta.value) { ta.value = texto; ta.dispatchEvent(new Event('input')); } }
}
async function enviarArquivos(files) {
  for (const f of files) {
    const tipo = tipoMidia(f.type || '');
    if (f.size > LIM[tipo] * 1048576) { toast(`"${f.name}" passa do limite do WhatsApp (${LIM[tipo]} MB para ${tipo}).`, true); continue; }
    try {
      toast('Enviando ' + f.name + '…');
      const path = await enviarArquivo('chat/' + C.sel, f);
      await enviarMidia({ midia_path: path, midia_mime: f.type || 'application/octet-stream', midia_nome: f.name, midia_tamanho: f.size });
    } catch (e) { falhou(e); }
  }
}
async function enviarMidia(d) {
  const legenda = $('#cvTxt')?.value.trim() || '';
  if (legenda && tipoMidia(d.midia_mime) !== 'audio') { $('#cvTxt').value = ''; $('#cvTxt').dispatchEvent(new Event('input')); }
  try { await enviar({ tipo: tipoMidia(d.midia_mime), texto: tipoMidia(d.midia_mime) === 'audio' ? '' : legenda, ...d }); } catch (e) {}
}
function enviarModelo() {
  abrir(`<h3>Enviar modelo do WhatsApp</h3><p class="hint">Modelos são mensagens aprovadas pela Meta. Crie e aprove os modelos no Gerenciador do WhatsApp da Meta e digite aqui o nome exato.</p>
    <div class="fields2"><div class="field"><label for="mdN">Nome do modelo *</label><input id="mdN" name="nome" required placeholder="ex.: retomar_contato"></div>
    <div class="field"><label for="mdL">Idioma</label><input id="mdL" name="idioma" value="pt_BR"></div></div>
    <div class="field"><label for="mdP">Valores das variáveis, um por linha (se o modelo tiver {{1}}, {{2}}...)</label><textarea id="mdP" name="params"></textarea></div>
    ${rodape({ salvar: 'Enviar modelo' })}`,
  async (d) => { await enviar({ tipo: 'modelo', modelo: { nome: d.nome.trim(), idioma: d.idioma.trim() || 'pt_BR', params: d.params.split('\n').map((x) => x.trim()).filter(Boolean) }, texto: 'Modelo: ' + d.nome.trim() }); });
}

/* ---------- áudio ---------- */
async function gravar() {
  if (C.rec) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Este navegador não grava áudio.', true); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const tipo = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    const partes = []; rec.ondataavailable = (e) => e.data.size && partes.push(e.data);
    C.rec = { rec, stream, partes, ini: Date.now(), cancelar: false };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const r = C.rec; C.rec = null; clearInterval(r?.timer); desenharComposer();
      if (!r || r.cancelar || !partes.length) return;
      const mime = (rec.mimeType || 'audio/webm').split(';')[0];
      const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
      const f = new File(partes, `audio-${Date.now()}.${ext}`, { type: mime });
      enviarArquivos([f]);
    };
    rec.start();
    $('#cvLinha').innerHTML = `<button class="icon-btn" id="grX" aria-label="Cancelar gravação">${icon('lixo')}</button><div class="grav"><i></i><span id="grT">0:00</span> gravando…</div><button class="icon-btn on" id="grOk" aria-label="Enviar áudio">${icon('enviar')}</button>`;
    C.rec.timer = setInterval(() => { const s = Math.floor((Date.now() - (C.rec?.ini || Date.now())) / 1000); const t = $('#grT'); if (t) t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 500);
    $('#grX').onclick = () => pararGravacao(true);
    $('#grOk').onclick = () => pararGravacao(false);
  } catch (e) { toast('Não foi possível usar o microfone. Libere o acesso no navegador.', true); }
}
function pararGravacao(cancelar) { if (!C.rec) return; C.rec.cancelar = cancelar; try { C.rec.rec.stop(); } catch (e) {} }

/* ---------- ações da conversa ---------- */
async function assumir() { try { await rpc('assumir_conversa', { p_conversa: C.sel }); toast('Agora a conversa é sua'); await recarregarConversa(); } catch (e) { falhou(e); } }
async function recarregarConversa() {
  const { data } = await S.sb.from('conversas').select(SEL_CONV).eq('id', C.sel).maybeSingle();
  const i = C.lista.findIndex((c) => c.id === C.sel);
  if (!data) { if (i >= 0) C.lista.splice(i, 1); desenharLista(); fecharConversa(); return; }
  if (i >= 0) C.lista[i] = data; desenharLista(); desenharCabecalho();
  const evs = await q(S.sb.from('conversa_eventos').select('*').eq('conversa_id', C.sel).order('criado_em', { ascending: true }).limit(300)).catch(() => null);
  if (evs) { C.eventos = evs; desenharMensagens(false); }
  if (C.det) abrirDetalhes();
}
function mudarStatus() {
  const c = conv(C.sel);
  const ops = [['ativo', 'Ativo', 'Atendimento em andamento com a equipe.'], ['aguardando_cliente', 'Aguardando cliente', 'Aguardando retorno do cliente.'], ['encerrada', 'Encerrada', 'Atendimento concluído.']];
  const f = abrir(`<h3>Alterar status do atendimento</h3><p class="hint">Escolha a etapa atual do atendimento.</p>
    <div class="list">${ops.map(([k, n, d]) => `<button type="button" class="mi" data-st="${k}" style="border:1px solid ${c.status === k ? 'var(--accent)' : 'var(--line)'};margin-bottom:6px;border-radius:8px"><span><b>${n}</b><br><span class="small muted">${d}</span></span></button>`).join('')}</div>
    <div class="dlg-actions"><div class="r"><button type="button" class="btn" id="f-cancel">Fechar</button></div></div>`, null);
  f.onclick = async (e) => {
    const b = e.target.closest('[data-st]'); if (!b) return;
    try {
      const st = b.dataset.st, id = C.sel;
      await rpc('mudar_status_conversa', { p_conversa: id, p_status: st }); fechar(); toast('Status: ' + STATUS[st].nome);
      if (st === 'encerrada') api('automacao', { acao: 'encerrou', conversa_id: id }).then((r) => { if (r.enviada) toast('Pesquisa de satisfação enviada ao cliente'); else if (r.aviso) toast(r.aviso, true); if (C.sel === id) recarregarMsgs(); }).catch(() => {});
      await recarregarConversa();
    } catch (er) { falhou(er); }
  };
}
function transferir() {
  const c = conv(C.sel);
  const ops = S.pessoas.filter((p) => p.ativo && ['gerente', 'funcionario'].includes(p.papel) && p.id !== c.responsavel_id);
  escolherPessoa('Transferir conversa', 'Escolha quem vai ficar responsável por este atendimento.', ops, async (para) => {
    await rpc('transferir_conversa', { p_conversa: C.sel, p_para: para });
    toast(para ? 'Transferida para ' + nomePessoa(para) : 'Devolvida para a fila');
    await recarregarConversa();
  }, c.responsavel_id ? { titulo: 'Devolver para aguardando atendimento', texto: 'Tira o responsável e deixa a conversa na fila para alguém assumir.' } : null);
}
function encaminhar() {
  if (!S.areas.length) { toast('Nenhuma área cadastrada. Peça ao gerente para criar em Configurações.', true); return; }
  abrir(`<h3>Encaminhar para área</h3><p class="hint">A conversa vai para a fila da área escolhida, no mesmo WhatsApp e sem nenhuma mensagem visível para o cliente.</p>
    <div class="field"><label for="enA">Área de destino</label><select id="enA" name="area" required>${S.areas.map((a) => `<option value="${a.id}" ${a.nome === 'Assistência' ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></div>
    <div class="field"><label for="enM">Motivo *</label><textarea id="enM" name="motivo" required placeholder="Descreva por que a área de destino deve assumir este atendimento."></textarea></div>
    <div class="field"><label for="enP">Prazo de retorno (horas)</label><input id="enP" name="prazo" type="number" min="1" max="720" value="4"></div>
    ${rodape({ salvar: 'Encaminhar' })}`,
  async (d) => {
    await rpc('encaminhar_conversa', { p_conversa: C.sel, p_area: d.area, p_motivo: d.motivo.trim(), p_prazo: Number(d.prazo) || 4 });
    toast('Encaminhada para ' + (S.areas.find((a) => a.id === d.area)?.nome || 'a área')); await recarregarConversa();
  });
}
async function menuConversa(btn) {
  const c = conv(C.sel); const k = c.cliente || {}; const fav = C.favs.has(c.id);
  const itens = [
    ['buscar', 'Buscar na conversa', 'busca'], ['hist', 'Histórico do atendimento', 'hist'], '-',
    atende() && c.responsavel_id !== S.me.id ? ['assumir', c.responsavel_id ? 'Assumir (tirar de ' + nomePessoa(c.responsavel_id) + ')' : 'Assumir atendimento', 'check'] : null,
    ['transferir', 'Transferir conversa', 'equipe'],
    ['encaminhar', 'Encaminhar para área', 'voltar'],
    '-',
    ['lembrete', 'Criar lembrete', 'lembretes'],
    ['orcamento', 'Enviar orçamento', 'doc'],
    ['agendar', 'Agendar mensagem', 'hist'],
    ['produto', 'Enviar produto do catálogo', 'caixa'],
    ['pedido', 'Novo pedido', 'pedidos'],
    ['os', 'Nova ordem de serviço', 'assistencia'],
    ['etiquetas', 'Gerenciar etiquetas', 'etiquetas'],
    '-',
    ['fixar', c.fixada ? 'Desafixar conversa' : 'Fixar conversa', 'estrela'],
    ['favorita', fav ? 'Tirar dos favoritos' : 'Favoritar conversa', 'estrela'],
    ['naolida', 'Marcar como não lida', 'chat'],
    ['arquivar', c.arquivada ? 'Desarquivar conversa' : 'Arquivar conversa', 'pasta'],
    ['nome', 'Alterar nome do contato', 'editar'],
    ['bloquear', k.bloqueado ? 'Desbloquear contato' : 'Bloquear contato', 'x', k.bloqueado ? '' : 'bad'],
    !S.waConta && lider() ? '-' : null,
    !S.waConta && lider() ? ['simular', 'Simular mensagem do cliente (teste)', 'chat'] : null,
    lider() ? ['excluir', 'Excluir conversa', 'lixo', 'bad'] : null,
  ];
  menu(btn, itens, async (v) => {
    try {
      if (v === 'buscar') return abrirBusca();
      if (v === 'hist') return historico();
      if (v === 'assumir') return assumir();
      if (v === 'transferir') return transferir();
      if (v === 'encaminhar') return encaminhar();
      if (v === 'lembrete') return formLembrete(null, null, { cliente_id: c.cliente_id, conversa_id: c.id, nomeCliente: k.nome, responsavel_id: c.responsavel_id || undefined });
      if (v === 'orcamento') return (await import('./orcamentos.js')).formOrcamento(null, () => recarregarMsgs(), { cliente_id: c.cliente_id, conversa_id: c.id, responsavel_id: c.responsavel_id });
      if (v === 'agendar') return agendar();
      if (v === 'produto') return enviarProduto();
      if (v === 'pedido') return (await import('./pedidos.js')).formPedido(null, null, { cliente_id: c.cliente_id, conversa_id: c.id, responsavel_id: c.responsavel_id });
      if (v === 'os') return (await import('./assistencia.js')).formOS(null, null, { cliente_id: c.cliente_id, conversa_id: c.id, responsavel_id: c.responsavel_id });
      if (v === 'etiquetas') return gerenciarEtiquetas(c.cliente_id, k.nome, (l) => { C.etq.set(c.cliente_id, l); desenharLista(); if (C.det) abrirDetalhes(); });
      if (v === 'fixar') { await q(S.sb.from('conversas').update({ fixada: !c.fixada }).eq('id', c.id)); c.fixada = !c.fixada; desenharLista(); return; }
      if (v === 'favorita') {
        if (fav) await q(S.sb.from('conversa_favoritas').delete().eq('user_id', S.me.id).eq('conversa_id', c.id)), C.favs.delete(c.id);
        else await q(S.sb.from('conversa_favoritas').insert({ user_id: S.me.id, conversa_id: c.id })), C.favs.add(c.id);
        desenharLista(); return;
      }
      if (v === 'naolida') { await q(S.sb.from('conversas').update({ nao_lidas: Math.max(1, c.nao_lidas) }).eq('id', c.id)); c.nao_lidas = Math.max(1, c.nao_lidas); desenharLista(); irPara('#/chat'); return; }
      if (v === 'arquivar') { await q(S.sb.from('conversas').update({ arquivada: !c.arquivada }).eq('id', c.id)); c.arquivada = !c.arquivada; toast(c.arquivada ? 'Conversa arquivada' : 'Conversa desarquivada'); desenharLista(); if (c.arquivada) irPara('#/chat'); return; }
      if (v === 'nome') return abrir(`<h3>Alterar nome do contato</h3><div class="field"><label for="nmN">Nome</label><input id="nmN" name="nome" required value="${esc(k.nome)}"></div>${rodape()}`,
        async (d) => { await q(S.sb.from('clientes').update({ nome: d.nome.trim() }).eq('id', c.cliente_id)); k.nome = d.nome.trim(); desenharLista(); desenharCabecalho(); toast('Nome alterado'); });
      if (v === 'bloquear') {
        if (!k.bloqueado && !(await confirmar('Bloquear contato?', 'As mensagens novas deste contato não vão mais entrar no CRM. Dá para desbloquear depois.', 'Bloquear', true))) return;
        await q(S.sb.from('clientes').update({ bloqueado: !k.bloqueado }).eq('id', c.cliente_id)); k.bloqueado = !k.bloqueado; desenharCabecalho(); toast(k.bloqueado ? 'Contato bloqueado' : 'Contato desbloqueado'); return;
      }
      if (v === 'simular') return abrir(`<h3>Simular mensagem do cliente</h3><p class="hint">Só para testar enquanto o WhatsApp não está conectado. A mensagem entra como se o cliente tivesse mandado.</p>
        <div class="field"><label for="smT">Mensagem</label><textarea id="smT" name="texto" required>Olá, tudo bem? Quero saber o preço.</textarea></div>${rodape({ salvar: 'Simular' })}`,
        async (d) => { await api('whatsapp-admin', { acao: 'simular', conversa_id: c.id, texto: d.texto }); });
      if (v === 'excluir') {
        if (!(await confirmar('Excluir conversa?', 'Apaga a conversa e todas as mensagens dela do CRM. O contato continua cadastrado. Isso não pode ser desfeito.', 'Excluir', true))) return;
        await q(S.sb.from('conversas').delete().eq('id', c.id)); C.lista = C.lista.filter((x) => x.id !== c.id); desenharLista(); irPara('#/chat'); toast('Conversa excluída');
      }
    } catch (e) { falhou(e); }
  });
}
async function historico() {
  const evs = await q(S.sb.from('conversa_eventos').select('*').eq('conversa_id', C.sel).order('criado_em', { ascending: false }).limit(200)).catch(() => []);
  abrir(`<div class="dlg-h"><h3>Histórico do atendimento</h3><button type="button" class="icon-btn" id="f-cancel" aria-label="Fechar">${icon('x')}</button></div>
    <div class="list" style="max-height:60vh;overflow-y:auto">${evs.length ? evs.map((e) => `<div class="row"><div class="main-c"><div class="t">${esc(e.texto || e.tipo)}</div><div class="s">${fmtDataHora(e.criado_em)}${e.autor_id ? ' · por ' + esc(nomePessoa(e.autor_id)) : ''}</div></div></div>`).join('') : '<div class="empty">Nada registrado ainda.</div>'}</div>`, null, null, { semFoco: true });
}
function abrirBusca() {
  const b = $('#cvBusca'); if (!b) return;
  if (!b.hidden) { b.hidden = true; b.innerHTML = ''; $$('.bb.achada').forEach((x) => x.classList.remove('achada')); return; }
  b.hidden = false;
  b.innerHTML = `<input type="search" id="cvBq" placeholder="Buscar mensagens nesta conversa" aria-label="Buscar mensagens"><span class="small muted" id="cvBn" style="align-self:center;white-space:nowrap"></span><button class="btn sm" id="cvBx">Fechar</button>`;
  $('#cvBx').onclick = abrirBusca; $('#cvBq').focus();
  let achados = [], pos = 0;
  $('#cvBq').onkeydown = async (e) => {
    if (e.key !== 'Enter') return;
    const t = e.target.value.trim(); if (!t) return;
    if (achados.length && achados.t === t) { pos = (pos + 1) % achados.length; return mostrarAchado(); }
    if (!C.carregouTudo) await recarregarMsgs(true);
    achados = C.msgs.filter((m) => norm(m.texto).includes(norm(t)) || norm(m.midia_nome).includes(norm(t))).reverse(); achados.t = t; pos = 0;
    mostrarAchado();
  };
  function mostrarAchado() {
    $$('.bb.achada').forEach((x) => x.classList.remove('achada'));
    $('#cvBn').textContent = achados.length ? `${pos + 1} de ${achados.length} (Enter para o próximo)` : 'Nada encontrado';
    const m = achados[pos]; if (!m) return; const b2 = $('#m-' + m.id); if (b2) { b2.classList.add('achada'); b2.scrollIntoView({ block: 'center' }); }
  }
}

/* ---------- detalhes do contato ---------- */
async function abrirDetalhes() {
  const c = conv(C.sel); if (!c) return;
  const k = c.cliente || {};
  $('#chat').classList.add('com-det');
  let d = $('#chat-det'); if (!d) { d = document.createElement('aside'); d.id = 'chat-det'; d.className = 'chat-det'; d.setAttribute('aria-label', 'Detalhes do contato'); $('#chat').appendChild(d); }
  const nome = k.nome || fmtTel(k.whatsapp) || 'Sem nome';
  d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h3>Detalhes do contato</h3><button class="icon-btn" id="dtX" aria-label="Fechar detalhes">${icon('x')}</button></div>
    <div style="display:flex;gap:10px;align-items:center">${avatar(nome, null, 'lg')}<div style="min-width:0"><b style="overflow-wrap:anywhere">${esc(nome)}</b><br><button class="btn sm" id="dtEd" style="margin-top:4px">Editar</button></div></div>
    <div class="sec"><span class="lbl">Telefone</span><span>${esc(fmtTel(k.whatsapp || k.telefone)) || '—'}</span>${k.email ? `<span class="small">${esc(k.email)}</span>` : ''}${k.instagram ? `<span class="small">${esc(k.instagram)}</span>` : ''}</div>
    <div class="sec"><span class="lbl">Responsável</span><span>${c.responsavel_id ? esc(nomePessoa(c.responsavel_id)) : 'Ninguém (na fila)'}${c.area_id ? ' · área ' + esc(S.areas.find((a) => a.id === c.area_id)?.nome || '') : ''}</span></div>
    <div class="sec"><span class="lbl">Etiquetas <button class="btn sm ghost" id="dtEtq">Gerenciar</button></span><div class="etqs">${etqsDe(c).length ? chipsEtiquetas(etqsDe(c), 20) : '<span class="small muted">Nenhuma</span>'}</div></div>
    <div class="sec"><span class="lbl">Mídia, links e documentos <button class="btn sm ghost" id="dtMidia">Ver</button></span><span class="small muted" id="dtMidiaN"></span></div>
    <div class="sec"><span class="lbl">Última interação</span><span class="small">${k.ultima_interacao ? fmtDataHora(k.ultima_interacao) : '—'}</span></div>
    <div class="sec"><span class="lbl">Anotações <button class="btn sm ghost" id="dtObs">Editar</button></span><div class="small" style="white-space:pre-wrap">${k.obs ? esc(k.obs) : '<span class="muted">Nenhuma anotação ainda.</span>'}</div></div>
    <div class="sec"><span class="lbl">Pedidos</span><div id="dtPed" class="small muted">Carregando…</div></div>
    <div class="sec"><span class="lbl">Lembretes</span><div id="dtLem" class="small muted">Carregando…</div></div>`;
  $('#dtX').onclick = () => { C.det = false; fecharDetalhes(); desenharCabecalho(); };
  $('#dtEd').onclick = () => formContato(k, (r) => { if (r) { Object.assign(k, r); desenharLista(); desenharCabecalho(); abrirDetalhes(); } else { irPara('#/chat'); carregarLista(); } });
  $('#dtEtq').onclick = () => gerenciarEtiquetas(c.cliente_id, k.nome, (l) => { C.etq.set(c.cliente_id, l); desenharLista(); abrirDetalhes(); });
  $('#dtObs').onclick = () => abrir(`<h3>Anotações do contato</h3><div class="field"><label for="obT">Anotações</label><textarea id="obT" name="obs" style="min-height:160px">${esc(k.obs)}</textarea></div>${rodape()}`,
    async (dd) => { await q(S.sb.from('clientes').update({ obs: dd.obs }).eq('id', c.cliente_id)); k.obs = dd.obs; abrirDetalhes(); toast('Anotações salvas'); });
  $('#dtMidia').onclick = midiasConversa;
  const [peds, lems, nm] = await Promise.all([
    q(S.sb.from('pedidos').select('id,numero,produto,total,status').eq('cliente_id', c.cliente_id).order('criado_em', { ascending: false }).limit(5)).catch(() => []),
    q(S.sb.from('tarefas').select('id,titulo,data,hora,feita').eq('cliente_id', c.cliente_id).eq('feita', false).order('data').limit(5)).catch(() => []),
    S.sb.from('mensagens').select('id', { count: 'exact', head: true }).eq('conversa_id', c.id).not('midia_path', 'is', null),
  ]);
  if (!$('#dtPed')) return;
  $('#dtMidiaN').textContent = (nm.count || 0) + ' arquivo(s)';
  $('#dtPed').innerHTML = peds.length ? peds.map((p) => `<div><a href="#/pedidos">#${p.numero}</a> ${esc(p.produto || '')} · ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.total)}</div>`).join('') : 'Nenhum pedido.';
  $('#dtLem').innerHTML = lems.length ? lems.map((l) => `<div>${esc(l.titulo)} · ${fmtData(l.data)} ${esc(l.hora || '')}</div>`).join('') : 'Nenhum lembrete pendente.';
}
function fecharDetalhes() { $('#chat-det')?.remove(); $('#chat')?.classList.remove('com-det'); }
async function midiasConversa() {
  const ms = await q(S.sb.from('mensagens').select('id,midia_path,midia_mime,midia_nome,criado_em,texto').eq('conversa_id', C.sel).not('midia_path', 'is', null).order('criado_em', { ascending: false }).limit(200)).catch(() => []);
  const links = C.msgs.filter((m) => /https?:\/\//.test(m.texto || ''));
  const f = abrir(`<div class="dlg-h"><h3>Mídia, links e documentos</h3><button type="button" class="icon-btn" id="f-cancel" aria-label="Fechar">${icon('x')}</button></div>
    ${ms.length ? `<div class="pick">${ms.map((m) => `<button type="button" data-v="${esc(m.midia_path)}" data-mime="${esc(m.midia_mime)}" data-n="${esc(m.midia_nome || '')}">${/^image/.test(m.midia_mime) ? `<img data-path="${esc(m.midia_path)}" alt="">` : `<span class="ic">${icon(/^video/.test(m.midia_mime) ? 'play' : /^audio/.test(m.midia_mime) ? 'mic' : 'doc')}</span>`}<span>${esc(m.midia_nome || fmtData(m.criado_em))}</span></button>`).join('')}</div>` : '<div class="empty">Nenhum arquivo nesta conversa.</div>'}
    ${links.length ? `<div class="lbl">Links</div><div class="list">${links.map((m) => `<div class="row small">${linkificar(m.texto)}</div>`).join('')}</div>` : ''}`, null, null, { largo: true, semFoco: true });
  resolverMidias(f);
  f.onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) verMidia(b.dataset.v, b.dataset.mime, b.dataset.n); };
}

/* ---------- nova conversa ---------- */
function novaConversa() {
  escolherContato('Nova conversa', async (cli) => {
    try { const id = await rpc('abrir_conversa', { p_cliente: cli.id }); await carregarLista(true); irPara('#/chat/' + id); }
    catch (e) { falhou(e); }
  });
}

/* ---------- produtos, agendamento ---------- */
async function enviarProduto() {
  const { escolherProduto } = await import('./produtos.js');
  escolherProduto('Enviar produto', async (p) => {
    const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
    const texto = `*${p.nome}*\n${brl(p.preco)}${p.descricao ? '\n' + p.descricao : ''}`;
    try {
      if (p.foto_path) await enviar({ tipo: 'imagem', texto, midia_path: p.foto_path, midia_mime: p.foto_mime || 'image/jpeg', midia_nome: p.nome });
      else await enviar({ tipo: 'texto', texto });
    } catch (e) {}
  });
}
async function recarregarAgendadas() {
  if (!C.sel) return;
  C.agendadas = await q(S.sb.from('mensagens_agendadas').select('*').eq('conversa_id', C.sel).in('status', ['pendente', 'erro']).order('enviar_em')).catch(() => []);
  desenharAgendadas();
}
function desenharAgendadas() {
  const box = $('#cvAgend'); if (!box) return;
  box.innerHTML = C.agendadas.map((a) => `<div class="cv-aviso" style="background:var(--info-soft)">${a.status === 'erro' ? '⚠ Não foi enviada' : '🕓 Agendada para ' + fmtDataHora(a.enviar_em)}: <b>${esc(a.texto.slice(0, 80))}</b>${a.erro ? ` <span class="small">(${esc(a.erro)})</span>` : ''}
    ${a.status === 'pendente' ? `<button class="btn sm" data-ag-ed="${a.id}">Editar</button><button class="btn sm" data-ag-x="${a.id}">Cancelar</button>` : `<button class="btn sm" data-ag-ok="${a.id}">Dispensar</button>`}</div>`).join('');
  box.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.dataset.agEd || b.dataset.agX || b.dataset.agOk; const a = C.agendadas.find((x) => x.id === id);
    try {
      if (b.dataset.agEd) return agendar(a);
      if (b.dataset.agX) { await q(S.sb.from('mensagens_agendadas').update({ status: 'cancelada' }).eq('id', id)); toast('Agendamento cancelado'); }
      if (b.dataset.agOk) { C.agendadas = C.agendadas.filter((x) => x.id !== id); desenharAgendadas(); return; }
      recarregarAgendadas();
    } catch (er) { falhou(er); }
  };
}
function agendar(a) {
  const c = conv(C.sel); if (!c) return;
  const ta = $('#cvTxt'); const pre = a?.texto || (C.modoNota ? '' : ta?.value.trim() || '');
  const d = a ? new Date(a.enviar_em) : new Date(Date.now() + 3600e3);
  const dia = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const hora = String(d.getHours()).padStart(2, '0') + ':' + String(a ? d.getMinutes() : 0).padStart(2, '0');
  abrir(`<h3>${a ? 'Editar mensagem agendada' : 'Agendar mensagem'}</h3><p class="hint">O sistema envia sozinho no dia e hora escolhidos. Pelas regras do WhatsApp, só funciona se o cliente tiver mandado mensagem nas 24 horas anteriores.</p>
    <div class="field"><label for="agT">Mensagem *</label><textarea id="agT" name="texto" required style="min-height:110px">${esc(pre)}</textarea></div>
    <div class="fields2"><div class="field"><label for="agD">Dia</label><input id="agD" name="dia" type="date" required value="${dia}"></div>
    <div class="field"><label for="agH">Hora</label><input id="agH" name="hora" type="time" required value="${hora}"></div></div>
    ${rodape({ salvar: a ? 'Salvar' : 'Agendar' })}`,
  async (dd) => {
    const quando = new Date(dd.dia + 'T' + dd.hora);
    if (!(quando > new Date())) throw new Error('Escolha um horário no futuro.');
    if (a) await q(S.sb.from('mensagens_agendadas').update({ texto: dd.texto.trim(), enviar_em: quando.toISOString() }).eq('id', a.id));
    else await q(S.sb.from('mensagens_agendadas').insert({ empresa_id: c.empresa_id, conversa_id: c.id, autor_id: S.me.id, texto: dd.texto.trim(), enviar_em: quando.toISOString() }));
    if (!a && ta && ta.value.trim() === dd.texto.trim()) { ta.value = ''; ta.dispatchEvent(new Event('input')); }
    toast('Mensagem agendada para ' + quando.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
    recarregarAgendadas();
  });
}
