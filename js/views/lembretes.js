// Lembretes com calendário
import { S, $, esc, q, toast, falhou, icon, isoDia, hoje, fmtData, lider, nomePessoa, emitir, buscarTudo, opcoesPessoas, minhaEquipe } from '../core.js';
import { formLembrete } from '../comum.js';

const L = { mes: null, dia: null, status: 'todos', pessoa: '' };
let el, lista = [], nomesCli = new Map();

export default {
  async render(root) {
    el = root;
    if (!L.mes) { const d = new Date(); L.mes = new Date(d.getFullYear(), d.getMonth(), 1); L.dia = hoje(); }
    el.innerHTML = `<div class="bar"><div><h2>Lembretes</h2><p class="sub">Retornos para clientes, compromissos e tarefas pessoais. O sistema avisa na hora marcada.</p></div>
      <div class="bar-r"><span class="chip mute" id="lmAberto"></span><button class="btn pri" id="lmNovo">${icon('mais2')}Novo lembrete</button></div></div>
      <div class="cal-wrap">
        <div class="panel">
          <div class="cal-h"><div style="display:flex;gap:6px;align-items:center"><select id="lmSt" aria-label="Filtrar por status" style="width:auto"><option value="todos">Todos os status</option><option value="pend">Pendentes</option><option value="atras">Atrasados</option><option value="feitos">Concluídos</option></select>
            ${lider() ? `<select id="lmPes" aria-label="Pessoa" style="width:auto"><option value="">${S.me.papel === 'admin' ? 'Toda a empresa' : 'Toda a equipe'}</option>${opcoesPessoas(L.pessoa)}</select>` : ''}
            <button class="btn sm" id="lmHoje">Hoje</button></div>
            <div style="display:flex;gap:4px;align-items:center"><button class="icon-btn" id="lmAnt" aria-label="Mês anterior">${icon('voltar')}</button><h3 id="lmMes"></h3><button class="icon-btn" id="lmProx" aria-label="Próximo mês" style="transform:scaleX(-1)">${icon('voltar')}</button></div></div>
          <div class="cal" id="lmCal"></div>
        </div>
        <div class="panel"><div class="panel-h"><div><h3>Agenda do dia</h3><p id="lmDiaT"></p></div></div><div id="lmDia"></div></div>
      </div>`;
    $('#lmSt').value = L.status;
    $('#lmSt').onchange = (e) => { L.status = e.target.value; desenhar(); };
    $('#lmPes')?.addEventListener('change', (e) => { L.pessoa = e.target.value; desenhar(); });
    $('#lmHoje').onclick = () => { const d = new Date(); L.mes = new Date(d.getFullYear(), d.getMonth(), 1); L.dia = hoje(); desenhar(); };
    $('#lmAnt').onclick = () => { L.mes = new Date(L.mes.getFullYear(), L.mes.getMonth() - 1, 1); desenhar(); };
    $('#lmProx').onclick = () => { L.mes = new Date(L.mes.getFullYear(), L.mes.getMonth() + 1, 1); desenhar(); };
    $('#lmNovo').onclick = () => formLembrete({ id: null, data: L.dia, responsavel_id: L.pessoa || undefined, ...novoPadrao() }, () => carregar());
    $('#lmCal').onclick = (e) => { const b = e.target.closest('[data-dia]'); if (b) { L.dia = b.dataset.dia; desenhar(); } };
    $('#lmDia').onclick = clique; $('#lmDia').onchange = marcar;
    await carregar();
  },
};
function novoPadrao() { return {}; }

async function carregar() {
  try {
    lista = await buscarTudo('tarefas', (x) => x.eq('empresa_id', S.empresaId), '*', 'data');
    const ids = [...new Set(lista.map((t) => t.cliente_id).filter(Boolean))];
    if (ids.length) { const cs = await q(S.sb.from('clientes').select('id,nome').in('id', ids.slice(0, 500))); nomesCli = new Map(cs.map((c) => [c.id, c.nome])); }
    desenhar();
  } catch (e) { falhou(e); }
}
const atrasado = (t) => !t.feita && t.data && (t.data < hoje() || (t.data === hoje() && t.hora && t.hora.slice(0, 5) < new Date().toTimeString().slice(0, 5)));
function filtrar(l) {
  return l.filter((t) => {
    if (L.pessoa && t.responsavel_id !== L.pessoa) return false;
    if (L.status === 'pend') return !t.feita;
    if (L.status === 'atras') return atrasado(t);
    if (L.status === 'feitos') return t.feita;
    return true;
  });
}
function desenhar() {
  const f = filtrar(lista);
  $('#lmAberto').textContent = filtrar(lista.filter((t) => !t.feita)).length + ' em aberto';
  const mt = L.mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); $('#lmMes').textContent = mt.charAt(0).toUpperCase() + mt.slice(1);
  const ini = new Date(L.mes); ini.setDate(1 - ini.getDay());
  const porDia = new Map(); for (const t of f) { if (!t.data) continue; if (!porDia.has(t.data)) porDia.set(t.data, []); porDia.get(t.data).push(t); }
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => `<div class="dw">${d}</div>`);
  for (let i = 0; i < 42; i++) {
    const d = new Date(ini); d.setDate(ini.getDate() + i); const k = isoDia(d);
    if (i >= 35 && d.getMonth() !== L.mes.getMonth()) break;
    const ts = (porDia.get(k) || []).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    dias.push(`<button type="button" class="d ${d.getMonth() !== L.mes.getMonth() ? 'fora' : ''} ${k === hoje() ? 'hoje' : ''}" data-dia="${k}" aria-pressed="${k === L.dia}" aria-label="${fmtData(k)}: ${ts.length} lembrete(s)">
      <span class="n">${d.getDate()}</span><span class="pts" data-n="${ts.length ? ts.length : ''}">${ts.slice(0, 3).map((t) => `<span class="pt ${t.feita ? 'ok' : atrasado(t) ? 'late' : ''}">${esc((t.hora ? t.hora.slice(0, 5) + ' ' : '') + t.titulo)}</span>`).join('')}${ts.length > 3 ? `<span class="tiny muted">+${ts.length - 3}</span>` : ''}</span></button>`);
  }
  $('#lmCal').innerHTML = dias.join('');
  const d = new Date(L.dia + 'T12:00');
  $('#lmDiaT').textContent = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const doDia = f.filter((t) => t.data === L.dia).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
  const semData = L.status !== 'feitos' ? f.filter((t) => !t.data && !t.feita) : [];
  const linha = (t) => `<div class="lem ${t.feita ? 'feita' : ''}"><input type="checkbox" class="check" data-feito="${t.id}" ${t.feita ? 'checked' : ''} aria-label="Concluir ${esc(t.titulo)}">
    <div style="flex:1;min-width:0"><div class="t" style="font-weight:600">${esc(t.titulo)}</div>
    <div class="small muted">${t.hora ? esc(t.hora.slice(0, 5)) : 'Sem horário'}${t.cliente_id ? ' · ' + esc(nomesCli.get(t.cliente_id) || 'contato') : ''}${lider() ? ' · ' + esc(nomePessoa(t.responsavel_id)) : ''}${atrasado(t) ? ' · <span style="color:var(--bad);font-weight:600">atrasado</span>' : ''}</div>
    ${t.descricao ? `<div class="small" style="white-space:pre-wrap;margin-top:2px">${esc(t.descricao)}</div>` : ''}
    <div style="display:flex;gap:6px;margin-top:4px">${t.conversa_id ? `<a class="btn sm" href="#/chat/${t.conversa_id}">Abrir conversa</a>` : ''}<button class="btn sm ghost" data-ed="${t.id}">Editar</button></div></div></div>`;
  $('#lmDia').innerHTML = (doDia.length ? doDia.map(linha).join('') : `<div class="empty">Sem lembretes neste dia. <button class="btn sm" data-novo="1" style="margin-top:8px">Criar lembrete</button></div>`)
    + (semData.length ? `<div class="lbl" style="margin-top:12px">Sem data</div>${semData.map(linha).join('')}` : '');
}
function clique(e) {
  const ed = e.target.closest('[data-ed]'); if (ed) formLembrete(lista.find((t) => t.id === ed.dataset.ed), () => carregar());
  if (e.target.closest('[data-novo]')) formLembrete({ id: null, data: L.dia, responsavel_id: L.pessoa || undefined }, () => carregar());
}
async function marcar(e) {
  const cb = e.target.closest('[data-feito]'); if (!cb) return;
  const t = lista.find((x) => x.id === cb.dataset.feito);
  try { await q(S.sb.from('tarefas').update({ feita: cb.checked }).eq('id', t.id)); t.feita = cb.checked; toast(t.feita ? 'Lembrete concluído' : 'Lembrete reaberto'); emitir('lembretes-mudaram'); desenhar(); }
  catch (er) { cb.checked = !cb.checked; falhou(er); }
}
