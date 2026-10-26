/* CRM Balcão — telas do sistema.
   Toda a segurança (quem vê o quê) é feita pelo banco (supabase/schema.sql)
   e pelo servidor de logins (api/usuarios.js). Aqui é só a interface. */

const ETAPAS = [
  { id: 'novo', nome: 'Novo contato', cor: 'var(--muted)' },
  { id: 'contato', nome: 'Em contato', cor: 'var(--accent)' },
  { id: 'proposta', nome: 'Proposta enviada', cor: 'var(--gold)' },
  { id: 'negociando', nome: 'Negociando', cor: 'var(--warn)' },
  { id: 'ganho', nome: 'Fechado (ganho)', cor: 'var(--good)' },
  { id: 'perdido', nome: 'Perdido', cor: 'var(--bad)' },
];
const ABERTAS = ['novo', 'contato', 'proposta', 'negociando'];
const FECHADAS = ['ganho', 'perdido'];
const PAPEL_NOME = { admin: 'Administrador', gerente: 'Gerente', funcionario: 'Funcionário', pendente: 'Pendente' };

let sb = null;
const S = {
  me: null, empresas: [], empresaId: '', pessoas: [],
  clientes: [], negocios: [], tarefas: [], filtroPessoa: '', tab: 'painel',
};

/* ---------- utilidades ---------- */
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
const pad = (n) => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const fmtData = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; };
const soma = (arr) => arr.reduce((a, n) => a + (Number(n.valor) || 0), 0);
const isAdmin = () => S.me?.papel === 'admin';
const isGerente = () => S.me?.papel === 'gerente';
const lider = () => isAdmin() || isGerente();
const pessoa = (id) => S.pessoas.find((p) => p.id === id);
const nomePessoa = (id) => { const p = pessoa(id); return p ? (p.nome || p.email) : '—'; };
const nomeCliente = (id) => (S.clientes.find((c) => c.id === id) || {}).nome || '';
const visivel = (r) => !S.filtroPessoa || r.responsavel_id === S.filtroPessoa;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2600);
}
function msgErro(e) {
  const m = String(e?.message || e || '');
  if (/row-level security/i.test(m)) return 'Sem permissão para isso. Se o responsável foi desativado, passe o registro para outra pessoa.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem internet ou servidor fora do ar. Tente de novo.';
  return m || 'Algo deu errado. Tente de novo.';
}

async function buscarTudo(tabela, filtro) {
  const out = []; const tam = 1000;
  for (let ini = 0; ; ini += tam) {
    let q = sb.from(tabela).select('*').order('criado_em', { ascending: true }).range(ini, ini + tam - 1);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < tam) break;
  }
  return out;
}

/* ---------- inicialização e login ---------- */
function mostrar(tela) {
  $('#telaLogin').hidden = tela !== 'login';
  $('#telaAviso').hidden = tela !== 'aviso';
  $('#app').hidden = tela !== 'app';
}
function aviso(txt) { $('#avisoTxt').textContent = txt; mostrar('aviso'); }

async function iniciar() {
  try {
    const r = await fetch('/api/config');
    const cfg = await r.json();
    if (!r.ok) throw new Error(cfg.erro || 'Configuração ausente');
    sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  } catch (e) {
    aviso('O sistema ainda não está configurado: ' + msgErro(e));
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data.session) await entrar(data.session.user.id); else mostrar('login');
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { S.me = null; mostrar('login'); } });
}

$('#lVer').addEventListener('change', (e) => { $('#lSenha').type = e.target.checked ? 'text' : 'password'; });

$('#formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#lBtn'); const err = $('#lErro');
  btn.disabled = true; err.hidden = true;
  const { data, error } = await sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lSenha').value });
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
  await entrar(data.user.id);
});
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-sair]')) { await sb?.auth.signOut(); mostrar('login'); }
});

async function entrar(uid) {
  const { data: me, error } = await sb.from('perfis').select('*').eq('id', uid).maybeSingle();
  if (error || !me) { aviso('Seu login existe, mas ainda não tem acesso liberado. Fale com o administrador.'); return; }
  if (!me.ativo) { aviso('Este login foi desativado. Fale com seu gerente.'); return; }
  if (me.papel === 'pendente') { aviso('Seu login ainda não tem um papel definido. Fale com o administrador.'); return; }
  S.me = me;
  $('#quem').textContent = (me.nome || me.email) + ' · ' + PAPEL_NOME[me.papel];
  montarAbas();
  mostrar('app');
  await carregarEmpresas();
  await carregar();
}

/* ---------- carregar dados ---------- */
async function carregarEmpresas() {
  S.empresas = await buscarTudo('empresas');
  const sel = $('#selEmpresa');
  if (isAdmin()) {
    let salvo = ''; try { salvo = localStorage.getItem('crm-empresa') || ''; } catch (e) {}
    if (!S.empresas.some((x) => x.id === S.empresaId)) {
      S.empresaId = S.empresas.some((x) => x.id === salvo) ? salvo : (S.empresas[0]?.id || '');
    }
    sel.innerHTML = S.empresas.map((x) => `<option value="${x.id}" ${x.id === S.empresaId ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');
    sel.hidden = !S.empresas.length;
  } else {
    S.empresaId = S.me.empresa_id;
    sel.hidden = true;
    const emp = S.empresas.find((x) => x.id === S.empresaId);
    if (emp) $('#quem').textContent += ' · ' + emp.nome;
  }
}
$('#selEmpresa').addEventListener('change', async (e) => {
  S.empresaId = e.target.value; S.filtroPessoa = '';
  try { localStorage.setItem('crm-empresa', S.empresaId); } catch (er) {}
  await carregar();
});

async function carregar() {
  if (!S.empresaId) {
    S.pessoas = []; S.clientes = []; S.negocios = []; S.tarefas = [];
    render(); return;
  }
  const porEmpresa = (q) => q.eq('empresa_id', S.empresaId);
  try {
    const [pessoas, clientes, negocios, tarefas] = await Promise.all([
      buscarTudo('perfis', porEmpresa), buscarTudo('clientes', porEmpresa),
      buscarTudo('negocios', porEmpresa), buscarTudo('tarefas', porEmpresa),
    ]);
    Object.assign(S, { pessoas, clientes, negocios, tarefas });
  } catch (e) { toast(msgErro(e)); }
  montarFiltroPessoa();
  render();
}
$('#btnAtualizar').addEventListener('click', async () => { await carregarEmpresas(); await carregar(); toast('Dados atualizados'); });

function montarFiltroPessoa() {
  const box = $('#filtros');
  if (!lider() || !S.empresaId) { box.hidden = true; S.filtroPessoa = ''; return; }
  box.hidden = false;
  const ps = S.pessoas.filter((p) => p.papel !== 'admin').sort(ordPessoa);
  if (!ps.some((p) => p.id === S.filtroPessoa)) S.filtroPessoa = '';
  $('#selPessoa').innerHTML = `<option value="">${isAdmin() ? 'Toda a empresa' : 'Toda a minha equipe'}</option>` +
    ps.map((p) => `<option value="${p.id}" ${p.id === S.filtroPessoa ? 'selected' : ''}>${esc(p.nome || p.email)} (${PAPEL_NOME[p.papel]}${p.ativo ? '' : ', desativado'})</option>`).join('');
}
$('#selPessoa').addEventListener('change', (e) => { S.filtroPessoa = e.target.value; render(); });
function ordPessoa(a, b) {
  const ordem = { gerente: 0, funcionario: 1 };
  return (ordem[a.papel] ?? 2) - (ordem[b.papel] ?? 2) || (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
}

/* ---------- abas ---------- */
function montarAbas() {
  const abas = [['painel', 'Painel'], ['clientes', 'Clientes'], ['funil', 'Funil de vendas'], ['agenda', 'Agenda']];
  if (lider()) abas.push(['equipe', isAdmin() ? 'Equipe e logins' : 'Minha equipe']);
  if (isAdmin()) abas.push(['empresas', 'Empresas']);
  let salva = ''; try { salva = localStorage.getItem('crm-tab') || ''; } catch (e) {}
  if (abas.some(([id]) => id === salva)) S.tab = salva;
  if (!abas.some(([id]) => id === S.tab)) S.tab = 'painel';
  $('#tabs').innerHTML = abas.map(([id, n]) => `<button role="tab" data-tab="${id}" aria-selected="${id === S.tab}">${n}</button>`).join('');
}
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  S.tab = b.dataset.tab;
  try { localStorage.setItem('crm-tab', S.tab); } catch (er) {}
  document.querySelectorAll('#tabs button').forEach((x) => x.setAttribute('aria-selected', x.dataset.tab === S.tab));
  render();
});

/* ---------- render ---------- */
function render() {
  document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== 'v-' + S.tab));
  const precisaEmpresa = S.tab !== 'empresas' && !S.empresaId;
  $('#semEmpresa').hidden = !precisaEmpresa;
  if (precisaEmpresa) { document.querySelectorAll('.view').forEach((v) => (v.hidden = true)); return; }
  ({ painel: renderPainel, clientes: renderClientes, funil: renderFunil, agenda: renderAgenda, equipe: renderEquipe, empresas: renderEmpresas })[S.tab]();
}

function renderPainel() {
  const d = new Date(); const mes = d.getFullYear() + '-' + pad(d.getMonth() + 1);
  $('#mesLabel').textContent = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const negs = S.negocios.filter(visivel);
  const abertos = negs.filter((n) => ABERTAS.includes(n.etapa));
  const ganhos = negs.filter((n) => n.etapa === 'ganho' && (n.fechado_em || '').startsWith(mes));
  const perdidos = negs.filter((n) => n.etapa === 'perdido' && (n.fechado_em || '').startsWith(mes));
  const fech = ganhos.length + perdidos.length;
  const h = hoje();
  const pend = S.tarefas.filter(visivel).filter((t) => !t.feita);
  const atras = pend.filter((t) => t.data && t.data < h).length;
  const deHoje = pend.filter((t) => t.data === h).length;
  const k = [
    ['Clientes', S.clientes.filter(visivel).length, 'cadastrados'],
    ['Em aberto', brl(soma(abertos)), abertos.length + ' negócio(s) no funil'],
    ['Vendido no mês', brl(soma(ganhos)), ganhos.length + ' venda(s)' + (fech ? ' · ' + Math.round((ganhos.length / fech) * 100) + '% de conversão' : '')],
    ['Tarefas', deHoje + ' hoje', atras ? atras + ' atrasada(s)' : 'nada atrasado'],
  ];
  $('#kpis').innerHTML = k.map(([l, v, s]) => `<div class="kpi"><div class="lb">${l}</div><div class="vl">${esc(v)}</div><div class="sub">${esc(s)}</div></div>`).join('');

  const tot = ABERTAS.map((e) => { const l = abertos.filter((n) => n.etapa === e); return { e, v: soma(l), c: l.length }; });
  const max = Math.max(1, ...tot.map((t) => t.v));
  $('#stageBars').innerHTML = abertos.length
    ? tot.map((t) => { const et = ETAPAS.find((x) => x.id === t.e); return `<div class="stage-row"><span>${et.nome} <span class="muted">(${t.c})</span></span><div class="stage-track"><div class="stage-fill" style="width:${(t.v / max) * 100}%"></div></div><span class="num r">${brl(t.v)}</span></div>`; }).join('')
    : '<div class="empty">Nenhum negócio aberto.</div>';
  const prox = pend.slice().sort(ordTarefa).slice(0, 6);
  $('#nextTasks').innerHTML = prox.length ? prox.map(linhaTarefa).join('') : '<div class="empty">Nenhuma tarefa pendente.</div>';

  const box = $('#porPessoaBox');
  box.hidden = !lider();
  if (lider()) {
    const ps = S.pessoas.filter((p) => p.papel !== 'admin').filter((p) => !S.filtroPessoa || p.id === S.filtroPessoa).sort(ordPessoa);
    $('#porPessoa').innerHTML = ps.length ? ps.map((p) => {
      const n = S.negocios.filter((x) => x.responsavel_id === p.id);
      const at = S.tarefas.filter((t) => t.responsavel_id === p.id && !t.feita && t.data && t.data < h).length;
      return `<tr><td><b>${esc(p.nome || p.email)}</b> <span class="muted small">${PAPEL_NOME[p.papel]}${p.ativo ? '' : ' · desativado'}</span></td>
        <td class="num">${S.clientes.filter((c) => c.responsavel_id === p.id).length}</td>
        <td class="num r">${brl(soma(n.filter((x) => ABERTAS.includes(x.etapa))))}</td>
        <td class="num r">${brl(soma(n.filter((x) => x.etapa === 'ganho' && (x.fechado_em || '').startsWith(mes))))}</td>
        <td class="num r">${at ? `<span class="chip late">${at}</span>` : '0'}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="muted">Ninguém na equipe ainda.</td></tr>';
  }
}

function renderClientes() {
  const q = ($('#q').value || '').toLowerCase().trim();
  const base = S.clientes.filter(visivel);
  const lista = base.filter((c) => !q || [c.nome, c.telefone, c.email, c.empresa_cliente, c.instagram].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  if (!base.length) { $('#clientesBox').innerHTML = '<div class="empty">Nenhum cliente ainda. Toque em <b>+ Novo cliente</b> para cadastrar o primeiro.</div>'; return; }
  if (!lista.length) { $('#clientesBox').innerHTML = `<div class="empty">Nenhum cliente encontrado para “${esc(q)}”.</div>`; return; }
  const colResp = lider() ? '<th>Responsável</th>' : '';
  $('#clientesBox').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Contato</th>${colResp}<th>Negócios</th><th>Observações</th><th></th></tr></thead><tbody>${lista.map((c) => {
    const ns = S.negocios.filter((n) => n.cliente_id === c.id); const ab = ns.filter((n) => ABERTAS.includes(n.etapa));
    return `<tr><td><b>${esc(c.nome)}</b>${c.empresa_cliente ? `<div class="s">${esc(c.empresa_cliente)}</div>` : ''}</td>
      <td>${esc(c.telefone)}${c.email ? `<div class="s">${esc(c.email)}</div>` : ''}${c.instagram ? `<div class="s">${esc(c.instagram)}</div>` : ''}</td>
      ${lider() ? `<td>${esc(nomePessoa(c.responsavel_id))}</td>` : ''}
      <td>${ns.length ? `${ab.length} aberto(s)<div class="s">${brl(soma(ab))}</div>` : '<span class="s">—</span>'}</td>
      <td><div class="s" style="max-width:260px">${esc(c.obs)}</div></td>
      <td><button class="btn sm" data-edit="cliente" data-id="${c.id}">Editar</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
$('#q').addEventListener('input', renderClientes);

function renderFunil() {
  const negs = S.negocios.filter(visivel);
  $('#board').innerHTML = ETAPAS.map((et) => {
    const ns = negs.filter((n) => n.etapa === et.id).sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || ''));
    return `<div class="col" style="--stage:${et.cor}"><div class="col-h"><b>${et.nome}</b><span class="num">${ns.length} · ${brl(soma(ns))}</span></div>
      ${ns.length ? ns.map((n) => `<div class="card"><div class="t">${esc(n.titulo)}</div>
        <div class="meta"><span>${esc(nomeCliente(n.cliente_id) || 'Sem cliente')}</span><span class="num">${brl(n.valor)}</span></div>
        ${lider() ? `<div class="meta"><span>Resp.: ${esc(nomePessoa(n.responsavel_id))}</span></div>` : ''}
        <div class="meta"><select data-move="${n.id}" aria-label="Mover etapa">${ETAPAS.map((e) => `<option value="${e.id}" ${e.id === n.etapa ? 'selected' : ''}>${e.nome}</option>`).join('')}</select>
        <button class="btn sm" data-edit="negocio" data-id="${n.id}">Editar</button></div></div>`).join('') : '<div class="muted small" style="padding:6px 4px">Vazio</div>'}
    </div>`;
  }).join('');
}

function ordTarefa(a, b) { return (a.data || '9999').localeCompare(b.data || '9999') || (a.hora || '99').localeCompare(b.hora || '99'); }
function linhaTarefa(t) {
  const h = hoje(); let chip = '';
  if (!t.feita && t.data && t.data < h) chip = '<span class="chip late">Atrasada</span>';
  else if (!t.feita && t.data === h) chip = '<span class="chip today">Hoje</span>';
  const cli = nomeCliente(t.cliente_id);
  const resp = lider() ? ' · ' + esc(nomePessoa(t.responsavel_id)) : '';
  return `<div class="row ${t.feita ? 'task-done' : ''}"><input type="checkbox" class="check" data-done="${t.id}" ${t.feita ? 'checked' : ''} aria-label="Concluir tarefa">
    <div class="main"><div class="t">${esc(t.titulo)}</div><div class="s">${t.data ? fmtData(t.data) : 'Sem data'}${t.hora ? ' · ' + esc(t.hora) : ''}${cli ? ' · ' + esc(cli) : ''}${resp}</div></div>
    ${chip}<button class="btn sm" data-edit="tarefa" data-id="${t.id}">Editar</button></div>`;
}
function renderAgenda() {
  const f = $('#agFilter').value; const h = hoje();
  let l = S.tarefas.filter(visivel);
  if (f === 'pend') l = l.filter((t) => !t.feita);
  if (f === 'hoje') l = l.filter((t) => t.data === h);
  if (f === 'feitas') l = l.filter((t) => t.feita);
  l.sort(ordTarefa); if (f === 'feitas') l.reverse();
  $('#agendaList').innerHTML = l.length ? l.map(linhaTarefa).join('') : '<div class="empty">Nada por aqui. Toque em <b>+ Nova tarefa</b> para agendar um retorno ou compromisso.</div>';
}
$('#agFilter').addEventListener('change', renderAgenda);

function linhaPessoa(p) {
  const status = p.ativo ? '' : ' <span class="chip off">Desativado</span>';
  const editavel = isAdmin() || (isGerente() && p.papel === 'funcionario');
  return `<div class="row"><div class="main"><div class="t">${esc(p.nome || '(sem nome)')}${status}</div><div class="s">${esc(p.email)} · ${PAPEL_NOME[p.papel]}</div></div>
    ${editavel && p.id !== S.me.id ? `<button class="btn sm" data-pessoa="${p.id}">Editar</button>` : ''}</div>`;
}
function renderEquipe() {
  const gerentes = S.pessoas.filter((p) => p.papel === 'gerente').sort(ordPessoa);
  const funcs = S.pessoas.filter((p) => p.papel === 'funcionario').sort(ordPessoa);
  if (!gerentes.length && !funcs.length) {
    $('#equipeBox').innerHTML = `<div class="empty">Nenhum login nesta empresa ainda. Toque em <b>+ Novo login</b>${isAdmin() ? ' e comece criando um gerente' : ''}.</div>`;
    return;
  }
  const blocos = gerentes.map((g) => {
    const eq = funcs.filter((f) => f.gerente_id === g.id);
    return `<div class="panel"><h3><span class="chip ger">Gerente</span> ${esc(g.nome || g.email)}${g.ativo ? '' : ' <span class="chip off">Desativado</span>'}
      ${isAdmin() ? `<button class="btn sm" data-pessoa="${g.id}" style="margin-left:auto">Editar</button>` : ''}</h3>
      <div class="s muted small" style="margin:-6px 0 8px">${esc(g.email)} · ${eq.length} funcionário(s)</div>
      <div class="list">${eq.length ? eq.map(linhaPessoa).join('') : '<div class="muted small">Sem funcionários ainda.</div>'}</div></div>`;
  });
  const soltos = funcs.filter((f) => !gerentes.some((g) => g.id === f.gerente_id));
  if (soltos.length && isAdmin()) blocos.push(`<div class="panel"><h3>Funcionários sem gerente</h3><div class="list">${soltos.map(linhaPessoa).join('')}</div></div>`);
  $('#equipeBox').innerHTML = `<div class="team">${blocos.join('')}</div>`;
}

function renderEmpresas() {
  $('#empresasList').innerHTML = S.empresas.length ? S.empresas.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((x) =>
    `<div class="row"><div class="main"><div class="t">${esc(x.nome)}</div><div class="s">Criada em ${new Date(x.criado_em).toLocaleDateString('pt-BR')}</div></div>
     <button class="btn sm" data-empresa="${x.id}">Renomear</button></div>`).join('')
    : '<div class="empty">Nenhuma empresa ainda. Toque em <b>+ Nova empresa</b>.</div>';
}

/* ---------- formulários ---------- */
const dlg = $('#dlg'); const form = $('#dlgForm');
const opcoesClientes = (sel) => '<option value="">— sem cliente —</option>' + S.clientes.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  .map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
function opcoesResponsavel(sel) {
  const ps = S.pessoas.filter((p) => p.papel !== 'admin' && (p.ativo || p.id === sel)).sort(ordPessoa);
  return ps.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome || p.email)}${p.ativo ? '' : ' (desativado)'}</option>`).join('');
}
function campoResponsavel(sel) {
  if (!lider()) return '';
  return `<div class="field"><label for="f-resp">Responsável</label><select id="f-resp" name="responsavel_id" required>${opcoesResponsavel(sel)}</select></div>`;
}
function rodape(id, extra = '') {
  return `<div class="err" id="f-err" hidden></div><div class="dlg-actions">${id ? '<button type="button" class="btn danger" id="f-del">Excluir</button>' : ''}${extra}
    <div class="r"><button type="button" class="btn" id="f-cancel">Cancelar</button><button type="submit" class="btn pri" id="f-save">Salvar</button></div></div>`;
}
function erroForm(e) { const el = $('#f-err'); el.textContent = msgErro(e); el.hidden = false; const b = $('#f-save'); if (b) b.disabled = false; }
function abrir(html, onSubmit, onDelete) {
  form.innerHTML = html;
  form.onsubmit = async (e) => {
    e.preventDefault(); $('#f-save').disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(form).entries())); dlg.close(); } catch (er) { erroForm(er); }
  };
  $('#f-cancel').onclick = () => dlg.close();
  const del = $('#f-del');
  if (del && onDelete) del.onclick = async () => {
    if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Toque de novo para excluir'; return; }
    try { await onDelete(); dlg.close(); } catch (er) { erroForm(er); }
  };
  dlg.showModal();
}
async function salvar(tabela, id, dados) {
  const { error } = id ? await sb.from(tabela).update(dados).eq('id', id) : await sb.from(tabela).insert(dados);
  if (error) throw error;
  toast(id ? 'Alterações salvas' : 'Salvo');
  await carregar();
}
async function apagar(tabela, id) {
  const { error } = await sb.from(tabela).delete().eq('id', id);
  if (error) throw error;
  toast('Excluído'); await carregar();
}
function limpar(d) { for (const k in d) d[k] = String(d[k]).trim(); return d; }
function baseRegistro(d, o) {
  d.empresa_id = o.empresa_id || S.empresaId;
  d.responsavel_id = lider() ? d.responsavel_id : (o.responsavel_id || S.me.id);
  return d;
}

function formCliente(id) {
  const o = id ? S.clientes.find((x) => x.id === id) : { responsavel_id: S.filtroPessoa || S.me.id };
  if (!o) return;
  abrir(`<h3>${id ? 'Editar cliente' : 'Novo cliente'}</h3>
    <div class="field"><label for="f-nome">Nome *</label><input id="f-nome" name="nome" required value="${esc(o.nome)}"></div>
    <div class="fields2"><div class="field"><label for="f-tel">Telefone / WhatsApp</label><input id="f-tel" name="telefone" inputmode="tel" value="${esc(o.telefone)}"></div>
    <div class="field"><label for="f-email">E-mail</label><input id="f-email" name="email" type="email" value="${esc(o.email)}"></div></div>
    <div class="fields2"><div class="field"><label for="f-emp">Empresa do cliente</label><input id="f-emp" name="empresa_cliente" value="${esc(o.empresa_cliente)}"></div>
    <div class="field"><label for="f-ig">Instagram</label><input id="f-ig" name="instagram" placeholder="@perfil" value="${esc(o.instagram)}"></div></div>
    ${campoResponsavel(o.responsavel_id)}
    <div class="field"><label for="f-obs">Observações</label><textarea id="f-obs" name="obs">${esc(o.obs)}</textarea></div>
    ${rodape(id)}`,
  (d) => salvar('clientes', id, baseRegistro(limpar(d), o)),
  () => apagar('clientes', id));
}
function formNegocio(id) {
  const o = id ? S.negocios.find((x) => x.id === id) : { responsavel_id: S.filtroPessoa || S.me.id, etapa: 'novo' };
  if (!o) return;
  abrir(`<h3>${id ? 'Editar negócio' : 'Novo negócio'}</h3>
    <div class="field"><label for="f-tit">O que está sendo vendido *</label><input id="f-tit" name="titulo" required placeholder="Ex.: Pacote mensal de manutenção" value="${esc(o.titulo)}"></div>
    <div class="fields2"><div class="field"><label for="f-cli">Cliente</label><select id="f-cli" name="cliente_id">${opcoesClientes(o.cliente_id)}</select></div>
    <div class="field"><label for="f-val">Valor (R$)</label><input id="f-val" name="valor" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(o.valor)}"></div></div>
    <div class="field"><label for="f-et">Etapa</label><select id="f-et" name="etapa">${ETAPAS.map((e) => `<option value="${e.id}" ${e.id === o.etapa ? 'selected' : ''}>${e.nome}</option>`).join('')}</select></div>
    ${campoResponsavel(o.responsavel_id)}
    <div class="field"><label for="f-nobs">Observações</label><textarea id="f-nobs" name="obs">${esc(o.obs)}</textarea></div>
    ${rodape(id)}`,
  (d) => {
    d = baseRegistro(limpar(d), o);
    d.valor = Number(d.valor) || 0;
    d.cliente_id = d.cliente_id || null;
    if (FECHADAS.includes(d.etapa)) d.fechado_em = FECHADAS.includes(o.etapa) && o.fechado_em ? o.fechado_em : hoje();
    else d.fechado_em = null;
    return salvar('negocios', id, d);
  },
  () => apagar('negocios', id));
}
function formTarefa(id) {
  const o = id ? S.tarefas.find((x) => x.id === id) : { responsavel_id: S.filtroPessoa || S.me.id, data: hoje() };
  if (!o) return;
  abrir(`<h3>${id ? 'Editar tarefa' : 'Nova tarefa'}</h3>
    <div class="field"><label for="f-tt">Tarefa *</label><input id="f-tt" name="titulo" required placeholder="Ex.: Ligar para confirmar orçamento" value="${esc(o.titulo)}"></div>
    <div class="fields2"><div class="field"><label for="f-dt">Data</label><input id="f-dt" name="data" type="date" value="${esc(o.data)}"></div>
    <div class="field"><label for="f-hr">Hora</label><input id="f-hr" name="hora" type="time" value="${esc(o.hora)}"></div></div>
    <div class="field"><label for="f-tcli">Cliente</label><select id="f-tcli" name="cliente_id">${opcoesClientes(o.cliente_id)}</select></div>
    ${campoResponsavel(o.responsavel_id)}
    ${rodape(id)}`,
  (d) => {
    d = baseRegistro(limpar(d), o);
    d.cliente_id = d.cliente_id || null; d.data = d.data || null; d.feita = !!o.feita;
    return salvar('tarefas', id, d);
  },
  () => apagar('tarefas', id));
}

/* ---------- logins ---------- */
async function api(body) {
  const { data } = await sb.auth.getSession();
  const r = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (data.session?.access_token || '') },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
  return j;
}
function opcoesGerentes(sel) {
  const gs = S.pessoas.filter((p) => p.papel === 'gerente' && p.ativo).sort(ordPessoa);
  return gs.length ? gs.map((g) => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${esc(g.nome || g.email)}</option>`).join('')
    : '<option value="">Crie um gerente primeiro</option>';
}
function formNovoLogin() {
  const emp = S.empresas.find((x) => x.id === S.empresaId);
  const papelCampo = isAdmin()
    ? `<div class="fields2"><div class="field"><label for="u-papel">Tipo de login</label><select id="u-papel" name="papel"><option value="funcionario">Funcionário</option><option value="gerente">Gerente</option></select></div>
       <div class="field" id="u-ger-box"><label for="u-ger">Gerente responsável</label><select id="u-ger" name="gerente_id">${opcoesGerentes()}</select></div></div>`
    : '<p class="muted small" style="margin:0">Será criado como funcionário da sua equipe.</p>';
  abrir(`<h3>Novo login</h3>
    ${isAdmin() ? `<p class="muted small" style="margin:0">Empresa: <b>${esc(emp?.nome)}</b></p>` : ''}
    <div class="field"><label for="u-nome">Nome *</label><input id="u-nome" name="nome" required></div>
    <div class="field"><label for="u-email">E-mail (é o usuário de login) *</label><input id="u-email" name="email" type="email" required autocomplete="off"></div>
    <div class="field"><label for="u-senha">Senha inicial * (mínimo 8 caracteres)</label><input id="u-senha" name="senha" type="text" minlength="8" required autocomplete="new-password"></div>
    ${papelCampo}
    ${rodape(null)}`,
  async (d) => {
    await api({ acao: 'criar', nome: d.nome, email: d.email, senha: d.senha, papel: d.papel || 'funcionario', empresa_id: S.empresaId, gerente_id: d.gerente_id || null });
    toast('Login criado. Passe o e-mail e a senha para a pessoa.');
    await carregar();
  });
  const papel = $('#u-papel');
  if (papel) { const sync = () => { $('#u-ger-box').hidden = papel.value !== 'funcionario'; }; papel.onchange = sync; sync(); }
}
function formPessoa(id) {
  const p = pessoa(id); if (!p) return;
  const trocaGerente = isAdmin() && p.papel === 'funcionario'
    ? `<div class="field"><label for="u-ger2">Gerente responsável</label><select id="u-ger2" name="gerente_id">${opcoesGerentes(p.gerente_id)}</select></div>` : '';
  abrir(`<h3>Editar login</h3>
    <p class="muted small" style="margin:0">${esc(p.email)} · ${PAPEL_NOME[p.papel]}</p>
    <div class="field"><label for="u-nome2">Nome</label><input id="u-nome2" name="nome" value="${esc(p.nome)}" required></div>
    ${trocaGerente}
    <div class="field"><label for="u-senha2">Nova senha (deixe em branco para não mudar)</label><input id="u-senha2" name="senha" type="text" minlength="8" autocomplete="new-password"></div>
    <label class="check-line"><input type="checkbox" id="u-ativo" name="ativo" ${p.ativo ? 'checked' : ''}> Login ativo (desmarque para bloquear o acesso)</label>
    ${rodape(null)}`,
  async (d) => {
    const body = { acao: 'atualizar', id, nome: d.nome, ativo: d.ativo === 'on' };
    if (d.senha) body.senha = d.senha;
    if (trocaGerente && d.gerente_id && d.gerente_id !== p.gerente_id) body.gerente_id = d.gerente_id;
    await api(body);
    toast('Login atualizado'); await carregar();
  });
}
function formEmpresa(id) {
  const o = id ? S.empresas.find((x) => x.id === id) : {};
  abrir(`<h3>${id ? 'Renomear empresa' : 'Nova empresa'}</h3>
    <div class="field"><label for="e-nome">Nome da empresa *</label><input id="e-nome" name="nome" required value="${esc(o.nome)}"></div>
    ${rodape(null)}`,
  async (d) => {
    const nome = String(d.nome).trim();
    const { data, error } = id ? await sb.from('empresas').update({ nome }).eq('id', id).select().single()
      : await sb.from('empresas').insert({ nome }).select().single();
    if (error) throw error;
    if (!id) { S.empresaId = data.id; try { localStorage.setItem('crm-empresa', data.id); } catch (e) {} }
    toast(id ? 'Empresa renomeada' : 'Empresa criada');
    await carregarEmpresas(); await carregar();
  });
}

/* ---------- cliques e mudanças ---------- */
document.addEventListener('click', (e) => {
  const n = e.target.closest('[data-new]');
  if (n) ({ cliente: formCliente, negocio: formNegocio, tarefa: formTarefa })[n.dataset.new]();
  const ed = e.target.closest('[data-edit]');
  if (ed) ({ cliente: formCliente, negocio: formNegocio, tarefa: formTarefa })[ed.dataset.edit](ed.dataset.id);
  const p = e.target.closest('[data-pessoa]'); if (p) formPessoa(p.dataset.pessoa);
  const em = e.target.closest('[data-empresa]'); if (em) formEmpresa(em.dataset.empresa);
});
$('#btnNovoLogin').addEventListener('click', formNovoLogin);
$('#btnNovaEmpresa').addEventListener('click', () => formEmpresa());

document.addEventListener('change', async (e) => {
  const mv = e.target.closest('[data-move]');
  if (mv) {
    const n = S.negocios.find((x) => x.id === mv.dataset.move); const et = mv.value;
    const fechado_em = FECHADAS.includes(et) ? (FECHADAS.includes(n.etapa) && n.fechado_em ? n.fechado_em : hoje()) : null;
    const { error } = await sb.from('negocios').update({ etapa: et, fechado_em }).eq('id', n.id);
    if (error) { toast(msgErro(error)); render(); return; }
    Object.assign(n, { etapa: et, fechado_em }); toast('Movido para ' + ETAPAS.find((x) => x.id === et).nome); render();
  }
  const dn = e.target.closest('[data-done]');
  if (dn) {
    const t = S.tarefas.find((x) => x.id === dn.dataset.done);
    const { error } = await sb.from('tarefas').update({ feita: dn.checked }).eq('id', t.id);
    if (error) { toast(msgErro(error)); render(); return; }
    t.feita = dn.checked; toast(dn.checked ? 'Tarefa concluída' : 'Tarefa reaberta'); render();
  }
});

iniciar();
