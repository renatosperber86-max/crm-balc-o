/* CRM Balcão — estrutura do sistema: login, menu, barra de cima, rotas,
   notificações, tempo real e preferências. Cada tela fica em js/views/. */
import {
  S, $, $$, esc, q, rpc, buscarTudo, toast, falhou, msgErro, icon, avatarPessoa, PAPEL_NOME, PRESENCA, isAdmin, lider,
  menu, pop, fecharPop, emitir, ouvir, bip, fmtQuando, abrir, rodape, fechar, uid, nomeSeguro, ordPessoa,
} from './core.js';

/* ---------- telas do sistema ---------- */
export const TELAS = [
  { id: 'painel', nome: 'Painel', grupo: 'atendimento', ic: 'painel', dica: 'Os números da sua operação em tempo real: atendimentos, pedidos e desempenho. Use os filtros de período, etiqueta e status.' },
  { id: 'chat', nome: 'Chat', grupo: 'atendimento', ic: 'chat', dica: 'As conversas de WhatsApp com os clientes. Atenda, transfira, encaminhe para outra área, ponha etiquetas e crie lembretes.' },
  { id: 'equipe', nome: 'Chat da equipe', grupo: 'atendimento', ic: 'equipe', dica: 'Conversas internas com os colegas, uma a uma ou em grupo. O cliente não vê nada daqui.' },
  { id: 'contatos', nome: 'Contatos', grupo: 'atendimento', ic: 'contatos', dica: 'A base de clientes. Busque por nome ou telefone, filtre por etiqueta e abra a conversa com um clique.' },
  { id: 'lembretes', nome: 'Lembretes', grupo: 'atendimento', ic: 'lembretes', dica: 'Seus retornos e compromissos num calendário. O sistema avisa na hora marcada.' },
  { id: 'rapidas', nome: 'Mensagens rápidas', grupo: 'atendimento', ic: 'rapidas', dica: 'Atalhos como /oi que viram respostas prontas no chat. Digite / na conversa para usar.' },
  { id: 'pedidos', nome: 'Pedidos', grupo: 'vendas', ic: 'pedidos', dica: 'Os pedidos de venda com status e pagamento. Filtre por data, status e etiqueta.' },
  { id: 'orcamentos', nome: 'Orçamentos', grupo: 'vendas', ic: 'doc', dica: 'Monte orçamentos com os produtos, envie o PDF para o cliente e transforme em pedido quando ele aprovar.' },
  { id: 'produtos', nome: 'Produtos', grupo: 'vendas', ic: 'caixa', dica: 'O catálogo com foto e preço, para enviar no chat com um clique.' },
  { id: 'funil', nome: 'Funil de vendas', grupo: 'vendas', ic: 'funil', dica: 'Os negócios em andamento, do primeiro contato até o fechamento.' },
  { id: 'galeria', nome: 'Galeria de mídia', grupo: 'midia', ic: 'galeria', dica: 'Fotos, vídeos e arquivos dos produtos, em pastas. Envie direto para o cliente pelo chat.' },
  { id: 'assistencia', nome: 'Assistência', grupo: 'conta', ic: 'assistencia', dica: 'Ordens de serviço e os atendimentos encaminhados para a Assistência.' },
  { id: 'logins', nome: 'Equipe e logins', grupo: 'conta', ic: 'logins', quem: lider, dica: 'Crie e gerencie os logins da equipe.' },
  { id: 'etiquetas', nome: 'Etiquetas', grupo: 'conta', ic: 'etiquetas', dica: 'As etiquetas que organizam os contatos, como "preço alto" ou "orçamento".' },
  { id: 'config', nome: 'Configurações', grupo: 'conta', ic: 'config', quem: lider, dica: 'Áreas da empresa, tempo de resposta esperado e a conexão com o WhatsApp.' },
  { id: 'empresas', nome: 'Empresas', grupo: 'conta', ic: 'empresas', quem: isAdmin, semEmpresa: true, dica: 'As empresas clientes do sistema.' },
  { id: 'suporte', nome: 'Suporte', grupo: 'conta', ic: 'suporte', semEmpresa: true, dica: 'Abra um chamado quando algo não funcionar ou tiver dúvida.' },
  { id: 'perfil', nome: 'Meu perfil', grupo: null, ic: 'perfil', semEmpresa: true },
];
const GRUPOS = { atendimento: 'Atendimento', vendas: 'Vendas e operação', midia: 'Mídia', conta: 'Conta e equipe' };
const telaPorId = (id) => TELAS.find((t) => t.id === id);
const permitida = (t) => !t.quem || t.quem();

let atual = { id: null, mod: null };
let canal = null;
let naoLidas = 0;

/* ---------- tema ---------- */
export function aplicarTema(t) {
  const v = t === 'claro' || t === 'escuro' ? t : '';
  if (v) document.documentElement.dataset.tema = v; else delete document.documentElement.dataset.tema;
  try { if (v) localStorage.setItem('crm-tema', v); else localStorage.removeItem('crm-tema'); } catch (e) {}
}

/* ---------- inicialização e login ---------- */
function mostrar(tela) {
  for (const id of ['telaLogin', 'telaMfa', 'telaAviso', 'app']) $('#' + id).hidden = id !== tela;
}
function aviso(txt) { $('#avisoTxt').textContent = txt; mostrar('telaAviso'); }

async function iniciar() {
  try {
    const r = await fetch('/api/config');
    const cfg = await r.json();
    if (!r.ok) throw new Error(cfg.erro || 'Configuração ausente');
    S.sb = window.supabase.createClient(cfg.url, cfg.anonKey);
    S.cfg = cfg;
  } catch (e) {
    aviso('O sistema ainda não está configurado: ' + msgErro(e));
    return;
  }
  const { data } = await S.sb.auth.getSession();
  if (data.session) {
    if (sessaoVencida()) { await S.sb.auth.signOut(); mostrar('telaLogin'); }
    else await depoisDoLogin();
  } else mostrar('telaLogin');
  S.sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { sairLimpo(); } });
}
function sessaoVencida() {
  try {
    const em = Number(localStorage.getItem('crm-login-em') || 0); const dias = Number(localStorage.getItem('crm-sessao-dias') || 7);
    return em && Date.now() - em > dias * 864e5;
  } catch (e) { return false; }
}
function sairLimpo() {
  S.me = null; if (canal) { S.sb.removeChannel(canal); canal = null; }
  atual = { id: null, mod: null }; $('#view').innerHTML = ''; fechar(); fecharPop();
  mostrar('telaLogin');
}
export async function sair() { try { await rpc('atualizar_meu_perfil', { p_presenca: null }); } catch (e) {} await S.sb.auth.signOut(); sairLimpo(); }

$('#lVer').addEventListener('change', (e) => { $('#lSenha').type = e.target.checked ? 'text' : 'password'; });
$('#formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#lBtn'); const err = $('#lErro');
  btn.disabled = true; err.hidden = true;
  const { error } = await S.sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lSenha').value });
  btn.disabled = false;
  if (error) {
    const m = String(error.message || '');
    err.textContent = /invalid login credentials/i.test(m) ? 'E-mail ou senha incorretos.'
      : /banned/i.test(m) ? 'Este login foi desativado. Fale com seu gerente.'
      : /not confirmed/i.test(m) ? 'Este e-mail ainda não foi confirmado no Supabase.'
      : /api key/i.test(m) ? 'Chave do Supabase errada na Vercel (SUPABASE_ANON_KEY). Detalhe: ' + m
      : 'Erro ao entrar: ' + msgErro(error);
    err.hidden = false; return;
  }
  $('#lSenha').value = '';
  try { localStorage.setItem('crm-login-em', String(Date.now())); } catch (er) {}
  await depoisDoLogin();
});

async function depoisDoLogin() {
  // verificação em duas etapas
  try {
    const { data } = await S.sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') { mostrar('telaMfa'); $('#mfaCod').value = ''; $('#mfaCod').focus(); return; }
  } catch (e) {}
  const { data: u } = await S.sb.auth.getUser();
  if (!u?.user) { mostrar('telaLogin'); return; }
  await entrar(u.user.id);
}
$('#formMfa').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#mfaErro'); err.hidden = true;
  try {
    const { data: f } = await S.sb.auth.mfa.listFactors();
    const fator = (f?.totp || []).find((x) => x.status === 'verified');
    if (!fator) throw new Error('Nenhum autenticador cadastrado.');
    const { error } = await S.sb.auth.mfa.challengeAndVerify({ factorId: fator.id, code: $('#mfaCod').value.trim() });
    if (error) throw error;
    await depoisDoLogin();
  } catch (er) { err.textContent = /invalid|code/i.test(String(er.message)) ? 'Código incorreto. Confira no aplicativo e tente de novo.' : msgErro(er); err.hidden = false; }
});
document.addEventListener('click', (e) => { if (e.target.closest('[data-sair]')) sair(); });

async function entrar(id) {
  const { data: me, error } = await S.sb.from('perfis').select('*').eq('id', id).maybeSingle();
  if (error || !me) { aviso('Seu login existe, mas ainda não tem acesso liberado. Fale com o administrador.'); return; }
  if (!me.ativo) { aviso('Este login foi desativado. Fale com seu gerente.'); return; }
  if (me.papel === 'pendente') { aviso('Seu login ainda não tem um papel definido. Fale com o administrador.'); return; }
  S.me = me; me.prefs = me.prefs || {};
  aplicarTema(me.prefs.tema);
  try { localStorage.setItem('crm-sessao-dias', String(me.prefs.sessao_dias || 7)); } catch (e) {}
  mostrar('app');
  try { const m = localStorage.getItem('crm-menu-mini') === '1'; $('#app').classList.toggle('mini', m && innerWidth > 900); } catch (e) {}
  desenharEu();
  await carregarEmpresas();
  await carregarBase();
  rpc('ping_presenca').catch(() => {});
  if (me.papel === 'admin') rpc('registrar_url_automacao', { p_url: location.origin }).catch(() => {});
  setTimeout(processarAutomacoes, 5000);
  irPara(location.hash || '#/painel', true);
  if (!me.prefs.tour_ok) setTimeout(() => tour(), 600);
}

/* ---------- dados comuns ---------- */
async function carregarEmpresas() {
  S.empresas = await buscarTudo('empresas', null, '*', 'nome');
  const sel = $('#selEmpresa');
  if (isAdmin()) {
    let salvo = ''; try { salvo = localStorage.getItem('crm-empresa') || ''; } catch (e) {}
    if (!S.empresas.some((x) => x.id === S.empresaId)) S.empresaId = S.empresas.some((x) => x.id === salvo) ? salvo : (S.empresas[0]?.id || '');
    sel.innerHTML = S.empresas.map((x) => `<option value="${x.id}" ${x.id === S.empresaId ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');
    sel.hidden = !S.empresas.length;
  } else { S.empresaId = S.me.empresa_id; sel.hidden = true; }
  const emp = S.empresas.find((x) => x.id === S.empresaId);
  $('#crumbEmp').textContent = emp ? emp.nome : '';
}
export const empresaAtual = () => S.empresas.find((x) => x.id === S.empresaId);
export { carregarEmpresas };

export async function carregarBase() {
  if (!S.empresaId) { S.pessoas = []; S.areas = []; S.etiquetas = []; S.waConta = null; }
  else {
    const porEmp = (x) => x.eq('empresa_id', S.empresaId);
    const [pessoas, areas, etiquetas, wa] = await Promise.all([
      buscarTudo('perfis', porEmp, '*', 'nome'), buscarTudo('areas', porEmp, '*', 'nome'),
      buscarTudo('etiquetas', porEmp, '*', 'nome'),
      S.sb.from('whatsapp_contas').select('*').eq('empresa_id', S.empresaId).maybeSingle(),
    ]);
    S.pessoas = pessoas; S.areas = areas; S.etiquetas = etiquetas; S.waConta = wa.data?.ativo ? wa.data : null;
  }
  S.rapidas = await buscarTudo('mensagens_rapidas', (x) => x.eq('user_id', S.me.id), '*', 'atalho').catch(() => []);
  desenharMenu();
  ligarTempoReal();
  atualizarNotificacoes();
  contarChat();
}

// número de conversas não lidas no menu (minhas ou na fila)
let tContar;
export async function contarChat() {
  if (!S.me || !S.empresaId) return;
  const { count } = await S.sb.from('conversas').select('id', { count: 'exact', head: true }).eq('empresa_id', S.empresaId)
    .eq('arquivada', false).gt('nao_lidas', 0).or(`responsavel_id.eq.${S.me.id},responsavel_id.is.null`);
  contador('chat', count || 0);
}
ouvir('conversas', () => { clearTimeout(tContar); tContar = setTimeout(contarChat, 800); });
ouvir('tick', () => contarChat());

$('#selEmpresa').addEventListener('change', async (e) => {
  S.empresaId = e.target.value;
  try { localStorage.setItem('crm-empresa', S.empresaId); } catch (er) {}
  const emp = empresaAtual(); $('#crumbEmp').textContent = emp ? emp.nome : '';
  await carregarBase();
  abrirTela(atual.id === 'chat' || atual.id === 'equipe' ? atual.id : (atual.id || 'painel'), null, true);
});

/* ---------- menu lateral ---------- */
function ordemMenu() {
  const pr = S.me.prefs.menu || {}; const ocultos = new Set(pr.ocultos || []);
  const out = {};
  for (const g of Object.keys(GRUPOS)) {
    const base = TELAS.filter((t) => t.grupo === g && permitida(t));
    const ord = (pr.ordem || {})[g] || [];
    base.sort((a, b) => { const ia = ord.indexOf(a.id), ib = ord.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    out[g] = base.map((t) => ({ ...t, oculto: ocultos.has(t.id) }));
  }
  return out;
}
export function desenharMenu() {
  const ord = ordemMenu();
  let fech = []; try { fech = JSON.parse(localStorage.getItem('crm-grupos-fechados') || '[]'); } catch (e) {}
  $('#menu').innerHTML = Object.entries(ord).map(([g, itens]) => {
    const vis = itens.filter((t) => !t.oculto); if (!vis.length) return '';
    return `<div class="grp ${fech.includes(g) ? 'fechado' : ''}" data-g="${g}"><button class="grp-h" type="button" aria-expanded="${!fech.includes(g)}">${GRUPOS[g]}<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>
      <div class="grp-itens">${vis.map((t) => `<a class="nav-a" href="#/${t.id}" data-tela="${t.id}" title="${esc(t.nome)}" ${atual.id === t.id ? 'aria-current="page"' : ''}>${icon(t.ic)}<span>${esc(t.nome)}</span><b class="cnt" data-cnt="${t.id}" hidden></b></a>`).join('')}</div></div>`;
  }).join('');
  $('#sideFoot').innerHTML = `${esc(S.me.nome || S.me.email)}<br>${PAPEL_NOME[S.me.papel]}`;
}
$('#menu').addEventListener('click', (e) => {
  const h = e.target.closest('.grp-h');
  if (h) {
    const g = h.parentElement; g.classList.toggle('fechado'); h.setAttribute('aria-expanded', !g.classList.contains('fechado'));
    try { localStorage.setItem('crm-grupos-fechados', JSON.stringify($$('.grp.fechado').map((x) => x.dataset.g))); } catch (er) {}
  }
  if (e.target.closest('.nav-a')) $('#app').classList.remove('menu-aberto'), ($('#sideVeu').hidden = true);
});
$('#btnMenu').addEventListener('click', () => {
  const app = $('#app');
  if (innerWidth <= 900) { app.classList.toggle('menu-aberto'); $('#sideVeu').hidden = !app.classList.contains('menu-aberto'); }
  else { app.classList.toggle('mini'); try { localStorage.setItem('crm-menu-mini', app.classList.contains('mini') ? '1' : '0'); } catch (e) {} }
});
$('#btnFecharMenu').addEventListener('click', () => { $('#app').classList.remove('menu-aberto'); $('#sideVeu').hidden = true; });
$('#sideVeu').addEventListener('click', () => { $('#app').classList.remove('menu-aberto'); $('#sideVeu').hidden = true; });
export function contador(id, n) { const b = $(`[data-cnt="${id}"]`); if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; } }

/* ---------- rotas ---------- */
export function irPara(hash, substituir) {
  if (substituir) history.replaceState(null, '', hash); else if (location.hash !== hash) { location.hash = hash; return; }
  rota();
}
function rota() {
  if (!S.me) return;
  const [, id = 'painel', arg = ''] = (location.hash || '#/painel').split('/');
  abrirTela(id, decodeURIComponent(arg || ''));
}
window.addEventListener('hashchange', rota);

async function abrirTela(id, arg, forcar) {
  let t = telaPorId(id);
  if (!t || !permitida(t)) { t = telaPorId('painel'); id = 'painel'; }
  if (!forcar && atual.id === id && atual.mod?.mudarArg) { atual.mod.mudarArg(arg); return; }
  try { atual.mod?.sair?.(); } catch (e) {}
  const el = $('#view'); el.className = 'view-area'; el.innerHTML = '';
  $('#titulo').textContent = t.nome;
  document.title = (naoLidas ? `(${naoLidas}) ` : '') + t.nome + ' · CRM Balcão';
  $$('.nav-a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.tela === id));
  $$('.nav-a[aria-current]').forEach((a) => a.setAttribute('aria-current', 'page'));
  atual = { id, mod: null };
  if (!t.semEmpresa && !S.empresaId) {
    el.innerHTML = `<div class="empty">${isAdmin() ? 'Nenhuma empresa cadastrada ainda. Vá em <b>Empresas</b> e crie a primeira.' : 'Seu login não está ligado a nenhuma empresa. Fale com o administrador.'}</div>`;
    return;
  }
  try {
    const mod = (await import(`./views/${id}.js`)).default;
    if (atual.id !== id) return;
    atual.mod = mod;
    await mod.render(el, arg);
  } catch (e) { console.error(e); el.innerHTML = `<div class="empty">Não foi possível abrir esta tela: ${esc(msgErro(e))}</div>`; }
}
export const telaAtual = () => atual.id;

/* ---------- tempo real ---------- */
function setRt(ok) {
  S.rtOk = ok;
  const el = $('#rt'); el.classList.toggle('on', ok);
  el.querySelector('span').textContent = ok ? 'Tempo real ativo' : 'Atualizando a cada 20s';
  el.title = ok ? 'As telas se atualizam sozinhas' : 'Sem conexão em tempo real: atualizando a cada 20 segundos';
}
function ligarTempoReal() {
  if (canal) { S.sb.removeChannel(canal); canal = null; }
  setRt(false);
  if (!S.empresaId) return;
  const f = `empresa_id=eq.${S.empresaId}`;
  canal = S.sb.channel('crm-' + S.empresaId + '-' + uid().slice(0, 6));
  for (const t of ['conversas', 'mensagens', 'equipe_mensagens', 'equipe_conversas', 'encaminhamentos', 'notas_internas', 'mensagens_agendadas']) {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: f }, (p) => emitir(t, p));
  }
  canal.on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes', filter: `user_id=eq.${S.me.id}` }, (p) => {
    if (p.eventType === 'INSERT') { bip(); avisoNavegador(p.new); }
    atualizarNotificacoes();
    emitir('notificacoes', p);
  });
  canal.subscribe((st) => setRt(st === 'SUBSCRIBED'));
}
setInterval(() => {
  if (!S.me || document.hidden) return;
  if (!S.rtOk) { emitir('tick'); atualizarNotificacoes(); }
}, 20000);
setInterval(() => { if (S.me && !document.hidden) rpc('ping_presenca').catch(() => {}); }, 60000);
// reserva das automações: se o relógio do banco não estiver ligado, quem estiver com o CRM aberto dispara
function processarAutomacoes() { if (S.me) fetch('/api/automacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"acao":"processar"}' }).catch(() => {}); }
setInterval(processarAutomacoes, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me) { emitir('tick'); atualizarNotificacoes(); } });

function avisoNavegador(n) {
  try {
    if (document.hasFocus() || !('Notification' in window) || Notification.permission !== 'granted') return;
    const no = new Notification(n.titulo, { body: n.texto || '', tag: n.id });
    no.onclick = () => { window.focus(); abrirLink(n.link); };
  } catch (e) {}
}

/* ---------- notificações ---------- */
let ultimaContagem = -1;
async function atualizarNotificacoes() {
  if (!S.me) return;
  const { count } = await S.sb.from('notificacoes').select('id', { count: 'exact', head: true }).eq('user_id', S.me.id).eq('lida', false);
  naoLidas = count || 0;
  const b = $('#notifN'); b.hidden = !naoLidas; b.textContent = naoLidas > 99 ? '99+' : naoLidas;
  document.title = document.title.replace(/^\(\d+\+?\) /, '');
  if (naoLidas) document.title = `(${naoLidas}) ` + document.title;
  if (ultimaContagem >= 0 && naoLidas > ultimaContagem && !S.rtOk) bip();
  ultimaContagem = naoLidas;
}
export function abrirLink(link) {
  if (!link) return;
  const [tipo, id] = link.split(':');
  if (tipo === 'chat') irPara('#/chat/' + id);
  else if (tipo === 'equipe') irPara('#/equipe/' + id);
  else if (tipo === 'chamado') irPara('#/suporte/' + id);
  else if (tipo === 'lembrete') irPara('#/lembretes');
}
$('#btnNotif').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const lista = await q(S.sb.from('notificacoes').select('*').eq('user_id', S.me.id).order('criado_em', { ascending: false }).limit(40)).catch(() => []);
  const html = `<div class="notif-h"><b>Notificações</b><div>${lista.some((n) => !n.lida) ? '<button class="btn sm ghost" data-mi="todas">Marcar todas como lidas</button>' : ''}${lista.length ? '<button class="btn sm ghost" data-mi="limpar">Limpar</button>' : ''}</div></div>
    <div class="notif-l">${lista.length ? lista.map((n) => `<button class="ni ${n.lida ? '' : 'nova'}" data-mi="n:${n.id}"><div><div class="t">${esc(n.titulo)}</div>${n.texto ? `<div class="s">${esc(n.texto)}</div>` : ''}<div class="s tiny">${fmtQuando(n.criado_em)}</div></div></button>`).join('')
      : '<div class="empty" style="margin:12px;border:0">Nada novo por aqui.</div>'}</div>`;
  pop(btn, html, async (v) => {
    try {
      if (v === 'todas') await q(S.sb.from('notificacoes').update({ lida: true }).eq('user_id', S.me.id).eq('lida', false));
      else if (v === 'limpar') await q(S.sb.from('notificacoes').delete().eq('user_id', S.me.id));
      else if (v.startsWith('n:')) {
        const n = lista.find((x) => x.id === v.slice(2));
        if (!n.lida) await q(S.sb.from('notificacoes').update({ lida: true }).eq('id', n.id));
        abrirLink(n.link);
      }
    } catch (er) { falhou(er); }
    atualizarNotificacoes();
  }, { cls: 'notif' });
  if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (er) {} }
});

/* ---------- conta (avatar) ---------- */
export function desenharEu() { $('#btnEu').innerHTML = avatarPessoa({ ...S.me, visto_em: new Date().toISOString() }, '', true); }
export async function salvarPerfil(campos) {
  await rpc('atualizar_meu_perfil', { p_nome: campos.nome ?? null, p_foto_url: campos.foto_url ?? null, p_presenca: campos.presenca ?? null, p_prefs: campos.prefs ?? null });
  if (campos.nome) S.me.nome = campos.nome;
  if (campos.foto_url !== undefined && campos.foto_url !== null) S.me.foto_url = campos.foto_url || null;
  if (campos.presenca) S.me.presenca = campos.presenca;
  if (campos.prefs) S.me.prefs = { ...S.me.prefs, ...campos.prefs };
  const p = S.pessoas.find((x) => x.id === S.me.id); if (p) Object.assign(p, { nome: S.me.nome, foto_url: S.me.foto_url, presenca: S.me.presenca });
  desenharEu();
}
export async function trocarFoto() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    if (f.size > 5 * 1048576) { toast('Escolha uma foto de até 5 MB.', true); return; }
    try {
      const path = `${S.me.id}/${uid()}-${nomeSeguro(f.name)}`;
      const { error } = await S.sb.storage.from('fotos').upload(path, f, { contentType: f.type, upsert: true });
      if (error) throw error;
      const url = S.sb.storage.from('fotos').getPublicUrl(path).data.publicUrl;
      await salvarPerfil({ foto_url: url }); toast('Foto atualizada');
    } catch (e) { falhou(e); }
  };
  inp.click();
}
function painelEu(btn) {
  const me = S.me, pr = me.prefs || {}; const tema = pr.tema || 'auto';
  const html = `<div class="eu">
    <div class="eu-top">${avatarPessoa({ ...me, visto_em: new Date().toISOString() }, 'lg', true)}<div style="min-width:0"><b>${esc(me.nome || 'Sem nome')}</b><div class="small muted" style="overflow-wrap:anywhere">${esc(me.email)}</div><div class="small muted">${PAPEL_NOME[me.papel]}</div></div></div>
    <div class="eu-sec"><span class="lbl">Foto</span><div style="display:flex;gap:6px"><button class="btn sm" data-mi="foto">Alterar</button>${me.foto_url ? '<button class="btn sm" data-mi="semfoto">Remover</button>' : ''}</div></div>
    <div class="eu-sec"><span class="lbl">Status</span><div class="seg">${Object.entries(PRESENCA).map(([k, v]) => `<button type="button" data-mi="pres:${k}" aria-pressed="${me.presenca === k}">${v}</button>`).join('')}</div></div>
    <div class="eu linha" style="padding:0;min-width:0"><span>Som de notificação</span><label class="toggle"><input type="checkbox" data-mi="som" ${pr.som === false ? '' : 'checked'} aria-label="Som de notificação"><span></span></label></div>
    <div class="eu-sec"><span class="lbl">Tema</span><div class="seg">${[['claro', 'Claro'], ['escuro', 'Escuro'], ['auto', 'Automático']].map(([k, v]) => `<button type="button" data-mi="tema:${k}" aria-pressed="${tema === k}">${v}</button>`).join('')}</div></div>
    <div><hr style="border:0;border-top:1px solid var(--line-2);margin:0 0 6px">
      <button class="mi" data-mi="perfil">${icon('perfil')}<span>Meu perfil</span></button>
      <button class="mi" data-mi="menu">${icon('painel')}<span>Organizar o menu</span></button>
      <button class="mi" data-mi="senha">${icon('config')}<span>Trocar senha</span></button>
      <button class="mi" data-mi="tour">${icon('info')}<span>Ver o tour de novo</span></button>
      <button class="mi bad" data-mi="sair">${icon('voltar')}<span>Sair</span></button></div></div>`;
  pop(btn, html, async (v) => {
    try {
      if (v === 'foto') { fecharPop(); trocarFoto(); }
      else if (v === 'semfoto') { fecharPop(); await salvarPerfil({ foto_url: '' }); }
      else if (v.startsWith('pres:')) { await salvarPerfil({ presenca: v.slice(5) }); painelEu(btn); painelEu(btn); }
      else if (v === 'som') { await salvarPerfil({ prefs: { som: !(S.me.prefs.som !== false) } }); }
      else if (v.startsWith('tema:')) { const t = v.slice(5); aplicarTema(t); await salvarPerfil({ prefs: { tema: t } }); painelEu(btn); painelEu(btn); }
      else if (v === 'perfil') { fecharPop(); irPara('#/perfil'); }
      else if (v === 'senha') { fecharPop(); irPara('#/perfil/senha'); }
      else if (v === 'menu') { fecharPop(); preferenciasMenu(); }
      else if (v === 'tour') { fecharPop(); tour(); }
      else if (v === 'sair') { fecharPop(); sair(); }
    } catch (e) { falhou(e); }
  }, { manter: true });
}
$('#btnEu').addEventListener('click', (e) => painelEu(e.currentTarget));
$('#btnSuporte').addEventListener('click', () => irPara('#/suporte/novo'));
$('#btnAjuda').addEventListener('click', () => tour());

/* ---------- organizar o menu ---------- */
export function preferenciasMenu() {
  const ord = ordemMenu();
  const estado = Object.fromEntries(Object.entries(ord).map(([g, l]) => [g, l.map((t) => ({ id: t.id, nome: t.nome, oculto: t.oculto }))]));
  const desenhar = () => Object.entries(estado).map(([g, l]) => l.length ? `<div><div class="lbl" style="margin:6px 0">${GRUPOS[g]}</div>${l.map((t, i) => `
      <div class="row" style="padding:6px 0"><span class="main-c" style="min-width:0;${t.oculto ? 'color:var(--muted);text-decoration:line-through' : ''}">${esc(t.nome)}</span>
      <button type="button" class="btn sm ghost" data-up="${g}:${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir ${esc(t.nome)}">↑</button>
      <button type="button" class="btn sm ghost" data-down="${g}:${i}" ${i === l.length - 1 ? 'disabled' : ''} aria-label="Descer ${esc(t.nome)}">↓</button>
      <button type="button" class="btn sm" data-oc="${g}:${i}">${t.oculto ? 'Mostrar' : 'Ocultar'}</button></div>`).join('')}</div>` : '').join('');
  const f = abrir(`<div class="dlg-h"><h3>Organizar o menu</h3></div><p class="hint">Mude a ordem dentro de cada grupo e esconda o que você não usa. Vale só para o seu login.</p>
    <div id="pm">${desenhar()}</div>${rodape({ salvar: 'Concluir', extra: '<button type="button" class="btn ghost" id="pmPadrao">Restaurar padrão</button>' })}`,
  async () => {
    const ordem = Object.fromEntries(Object.entries(estado).map(([g, l]) => [g, l.map((t) => t.id)]));
    const ocultos = Object.values(estado).flat().filter((t) => t.oculto).map((t) => t.id);
    await salvarPerfil({ prefs: { menu: { ordem, ocultos } } }); desenharMenu(); toast('Menu atualizado');
  });
  f.querySelector('#pm').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const [k, val] = Object.entries(b.dataset)[0] || []; if (!val) return;
    const [g, i] = val.split(':'); const l = estado[g]; const n = Number(i);
    if (k === 'up') [l[n - 1], l[n]] = [l[n], l[n - 1]];
    if (k === 'down') [l[n + 1], l[n]] = [l[n], l[n + 1]];
    if (k === 'oc') l[n].oculto = !l[n].oculto;
    f.querySelector('#pm').innerHTML = desenhar();
  };
  f.querySelector('#pmPadrao').onclick = async () => { await salvarPerfil({ prefs: { menu: {} } }); desenharMenu(); fechar(); toast('Menu restaurado'); };
}

/* ---------- tour guiado ---------- */
export function tour() {
  const passos = [
    { sel: null, t: 'Bem-vindo ao CRM Balcão', d: 'Um passeio rápido pelas telas. Você pode pular quando quiser e rever depois pelo botão de ajuda (?) lá em cima.' },
    ...TELAS.filter((t) => t.grupo && permitida(t) && t.dica).map((t) => ({ sel: `.nav-a[data-tela="${t.id}"]`, t: t.nome, d: t.dica })),
    { sel: '#rt', t: 'Tempo real', d: 'Quando aparece "Tempo real ativo", as telas se atualizam sozinhas quando chega mensagem ou muda alguma coisa.' },
    { sel: '#btnNotif', t: 'Notificações', d: 'Aqui chegam os avisos: mensagem nova, conversa transferida para você, chamado respondido.' },
    { sel: '#btnEu', t: 'Sua conta', d: 'Troque a foto, o status (online, ocupado), o tema claro ou escuro, o som e a senha.' },
  ];
  let i = 0;
  const box = $('#tour'); box.hidden = false;
  const fim = async () => { box.hidden = true; box.innerHTML = ''; if (!S.me.prefs.tour_ok) { try { await salvarPerfil({ prefs: { tour_ok: true } }); } catch (e) {} } };
  const mostrarPasso = () => {
    const p = passos[i];
    let alvo = p.sel ? $(p.sel) : null;
    if (alvo && alvo.closest('.grp.fechado')) alvo.closest('.grp').classList.remove('fechado');
    if (alvo && innerWidth <= 900 && alvo.closest('#side')) { $('#app').classList.add('menu-aberto'); }
    if (alvo && !alvo.offsetParent) alvo = null;
    alvo?.scrollIntoView?.({ block: 'nearest' });
    const r = alvo ? alvo.getBoundingClientRect() : null;
    box.innerHTML = `${r ? `<div class="foco" style="left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px"></div>` : '<div class="foco" style="left:50%;top:40%;width:0;height:0"></div>'}
      <div class="caixa" role="dialog" aria-label="${esc(p.t)}"><h3>${esc(p.t)}</h3><p>${esc(p.d)}</p>
      <div class="pe"><span class="small muted">${i + 1} de ${passos.length}</span><div style="display:flex;gap:6px"><button class="btn sm ghost" data-t="pular">Pular</button>${i ? '<button class="btn sm" data-t="voltar">Voltar</button>' : ''}<button class="btn sm pri" data-t="prox">${i === passos.length - 1 ? 'Concluir' : 'Próximo'}</button></div></div></div>`;
    const c = box.querySelector('.caixa'); const cw = c.offsetWidth, ch = c.offsetHeight;
    let left, top;
    if (r) { left = r.right + 14; top = r.top; if (left + cw > innerWidth - 8) { left = Math.max(8, r.right - cw); top = r.bottom + 12; } if (top + ch > innerHeight - 8) top = Math.max(8, r.top - ch - 12); }
    else { left = (innerWidth - cw) / 2; top = innerHeight * 0.3; }
    c.style.left = Math.max(8, left) + 'px'; c.style.top = Math.max(8, top) + 'px';
    c.querySelector('[data-t="prox"]').focus();
  };
  box.onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    if (b.dataset.t === 'pular') { $('#app').classList.remove('menu-aberto'); return fim(); }
    if (b.dataset.t === 'voltar') i--; else i++;
    if (i >= passos.length) { $('#app').classList.remove('menu-aberto'); return fim(); }
    mostrarPasso();
  };
  mostrarPasso();
}

/* ---------- lembretes na hora marcada ---------- */
let lembretesHoje = [];
async function carregarLembretesHoje() {
  if (!S.me || !S.empresaId || S.me.papel === 'admin') { lembretesHoje = []; return; }
  const d = new Date(); const dia = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  lembretesHoje = await q(S.sb.from('tarefas').select('id,titulo,hora,data').eq('responsavel_id', S.me.id).eq('feita', false).eq('data', dia)).catch(() => []);
}
export { carregarLembretesHoje };
setInterval(carregarLembretesHoje, 10 * 60e3);
setInterval(() => {
  if (!S.me) return;
  const agora = new Date(); const hm = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
  for (const l of lembretesHoje) {
    if (!l.hora || l.hora.slice(0, 5) > hm) continue;
    const k = 'crm-lemb-' + l.id + '-' + l.data;
    try { if (localStorage.getItem(k)) continue; localStorage.setItem(k, '1'); } catch (e) { continue; }
    bip(); toast('Lembrete: ' + l.titulo);
    avisoNavegador({ id: l.id, titulo: 'Lembrete', texto: l.titulo, link: 'lembrete:' + l.id });
  }
}, 30000);
ouvir('lembretes-mudaram', carregarLembretesHoje);
setTimeout(() => carregarLembretesHoje(), 3000);

iniciar();
