// Painel (dashboard)
import { S, $, esc, rpc, q, brl, num, isoDia, fmtData, desde, duracao, lider, isAdmin, minhaEquipe, ordPessoa, nomePessoa,
  STATUS, falhou, baixarCsv, buscarTudo, PAPEL_NOME, ouvir, debounce } from '../core.js';

const ETAPAS_ABERTAS = ['novo', 'contato', 'proposta', 'negociando'];
let F = null; let el = null; let desligar = [];

function filtrosPadrao() {
  const fim = new Date(); const ini = new Date(); ini.setDate(fim.getDate() - 6);
  return { inicio: isoDia(ini), fim: isoDia(fim), etiqueta: '', status: '', pessoa: '' };
}

export default {
  async render(root) {
    el = root; F = F || filtrosPadrao();
    if (!lider()) F.pessoa = '';
    desenharEstrutura();
    await atualizar();
    const recarregar = debounce(() => atualizar(true), 1500);
    desligar = [ouvir('conversas', recarregar), ouvir('tick', recarregar)];
  },
  sair() { desligar.forEach((f) => f()); desligar = []; },
};

function desenharEstrutura() {
  const eqp = minhaEquipe().filter((p) => p.papel !== 'admin').sort(ordPessoa);
  el.innerHTML = `
  <div class="bar no-print"><div><h2>Olá, ${esc((S.me.nome || '').split(' ')[0] || 'tudo bem')}</h2><p class="sub">Seus atendimentos, pedidos e indicadores no período escolhido.</p></div>
    <div class="bar-r"><button class="btn" id="pExport">Exportar</button></div></div>
  <div class="panel no-print" style="margin-bottom:14px"><div class="filtros" style="margin:0">
    <div class="field curto"><label for="pIni">Início</label><input type="date" id="pIni" value="${F.inicio}"></div>
    <div class="field curto"><label for="pFim">Fim</label><input type="date" id="pFim" value="${F.fim}"></div>
    <div class="field"><label for="pEtq">Etiqueta</label><select id="pEtq"><option value="">Todas as etiquetas</option>${S.etiquetas.map((e) => `<option value="${e.id}" ${e.id === F.etiqueta ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>
    <div class="field"><label for="pSt">Atendimento</label><select id="pSt"><option value="">Todos os status</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === F.status ? 'selected' : ''}>${v.nome}</option>`).join('')}</select></div>
    ${lider() ? `<div class="field"><label for="pPes">Pessoa</label><select id="pPes"><option value="">${isAdmin() ? 'Toda a empresa' : 'Toda a minha equipe'}</option>${eqp.map((p) => `<option value="${p.id}" ${p.id === F.pessoa ? 'selected' : ''}>${esc(p.nome || p.email)}</option>`).join('')}</select></div>` : ''}
    <button class="btn" id="pLimpar">Limpar</button>
  </div></div>
  <div id="pCorpo"><div class="empty">Carregando os números…</div></div>`;
  const ler = () => {
    F.inicio = $('#pIni').value || F.inicio; F.fim = $('#pFim').value || F.fim;
    if (F.fim < F.inicio) [F.inicio, F.fim] = [F.fim, F.inicio];
    F.etiqueta = $('#pEtq').value; F.status = $('#pSt').value; F.pessoa = $('#pPes')?.value || '';
    atualizar();
  };
  ['#pIni', '#pFim', '#pEtq', '#pSt', '#pPes'].forEach((s) => $(s)?.addEventListener('change', ler));
  $('#pLimpar').onclick = () => { F = filtrosPadrao(); desenharEstrutura(); atualizar(); };
  $('#pExport').onclick = (e) => exportar(e.currentTarget);
}

let ultimo = null;
async function atualizar(silencioso) {
  const corpo = $('#pCorpo'); if (!corpo) return;
  try {
    const pessoa = lider() ? (F.pessoa || null) : S.me.id;
    const [m, negs, mesDados] = await Promise.all([
      rpc('painel_metricas', { p_empresa: S.empresaId, p_inicio: F.inicio, p_fim: F.fim, p_pessoa: pessoa, p_etiqueta: F.etiqueta || null, p_status: F.status || null }),
      buscarTudo('negocios', (x) => { x = x.eq('empresa_id', S.empresaId); return pessoa ? x.eq('responsavel_id', pessoa) : x; }, 'id,etapa,valor,fechado_em,responsavel_id'),
      dadosDoMes(pessoa),
    ]);
    ultimo = { m, negs, mesDados };
    corpo.innerHTML = desenhar(m, negs, pessoa) ;
    corpo.insertAdjacentHTML('afterbegin', blocoMeta(mesDados, pessoa, m));
  } catch (e) { if (!silencioso) { corpo.innerHTML = '<div class="empty">Não foi possível carregar o painel.</div>'; falhou(e); } }
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
function k(lb, vl, sub, cls = '') { return `<div class="k ${cls}"><div class="lb">${lb}</div><div class="vl">${vl}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`; }

function desenhar(m, negs, pessoa) {
  const quem = pessoa === S.me.id || !lider() ? 'você' : (pessoa ? nomePessoa(pessoa) : (isAdmin() ? 'a empresa' : 'sua equipe'));
  const eu = quem === 'você';
  const taxa = pct(m.resolvidas, m.atribuidas); const slaP = pct(m.respostas_no_prazo, m.respostas);
  const ini = F.inicio, fim = F.fim;
  const ab = negs.filter((n) => ETAPAS_ABERTAS.includes(n.etapa));
  const ganhos = negs.filter((n) => n.etapa === 'ganho' && n.fechado_em >= ini && n.fechado_em <= fim);
  const maxDia = Math.max(1, ...m.por_dia.map((d) => d.n));
  const maxRank = Math.max(1, ...m.ranking.map((r) => r.n));
  const periodo = ini === fim ? fmtData(ini) : `${fmtData(ini)} a ${fmtData(fim)}`;
  return `
  <div class="panel op">
    <div><h3>${eu ? 'Sua operação' : 'Operação de ' + esc(quem)}</h3><p class="small muted" style="margin:0">${periodo}. Os pedidos contam quando são criados.</p></div>
    <div class="kgrid">
      ${k('Pedidos no período', num(m.pedidos), brl(m.pedidos_valor) + ' em pedidos válidos', 'dest')}
      ${k(eu ? 'Em atendimento com você' : 'Em atendimento', num(m.em_atendimento), 'Conversas marcadas como ativas', 'dest good')}
      ${k(eu ? 'Esperando sua resposta' : 'Esperando resposta', num(m.aguardando_resposta), 'Cliente falou por último', 'dest gold')}
      ${k(eu ? 'Encerradas por você' : 'Encerradas', num(m.encerradas_periodo), 'Atendimentos concluídos no período', 'dest info')}
    </div>
  </div>
  <div class="kgrid" style="margin-top:12px">
    ${k('Conversas abertas agora', num(m.abertas_agora), 'Tudo que não foi encerrado')}
    ${k('Na fila, sem responsável', num(m.na_fila), 'Esperando alguém assumir', m.na_fila ? 'dest rust' : '')}
    ${k('Aguardando o cliente', num(m.aguardando_cliente), 'Última mensagem foi da loja')}
    ${k('Contatos ativos no período', num(m.contatos_ativos), 'Conversas com mensagem no período')}
    ${k('Contatos novos', num(m.contatos_novos), `de ${num(m.contatos_total)} contatos ${eu ? 'seus' : 'no total'}`)}
  </div>
  <div class="dash2">
    <div class="panel"><div class="lb small muted" style="font-weight:600">Taxa de resolução</div><div class="vl" style="font-family:var(--display);font-size:32px;font-weight:700">${taxa}%</div>
      <div class="small muted">${num(m.resolvidas)} de ${num(m.atribuidas)} conversas atribuídas foram encerradas</div><div class="meter"><i style="width:${taxa}%"></i></div></div>
    <div class="panel"><div class="lb small muted" style="font-weight:600">Primeira resposta em até ${m.sla_minutos} min</div><div class="vl" style="font-family:var(--display);font-size:32px;font-weight:700">${slaP}%</div>
      <div class="small muted">${num(m.respostas_no_prazo)} de ${num(m.respostas)} respostas · média ${duracao(m.tempo_medio_seg)}</div><div class="meter"><i style="width:${slaP}%;background:${slaP >= 70 ? 'var(--good)' : slaP >= 40 ? 'var(--gold)' : 'var(--bad)'}"></i></div></div>
    <div class="panel"><div class="panel-h" style="margin-bottom:8px"><div><h3>Esperando há mais tempo</h3><p>As 5 conversas paradas há mais tempo</p></div></div>
      <div class="espera">${m.esperando.length ? m.esperando.map((x) => `<a href="#/chat/${x.conversa_id}"><span><b>${esc(x.nome)}</b><br><span class="chip ${x.status === 'fila' ? 'rust' : x.status === 'aguardando_atendente' ? 'gold' : 'info'}">${STATUS[x.status]?.nome || x.status}</span></span><span class="small muted">${desde(x.desde)}</span></a>`).join('') : '<div class="empty">Ninguém esperando. Bom trabalho!</div>'}</div></div>
  </div>
  <div class="dash2" style="grid-template-columns:2fr 1fr">
    <div class="panel"><div class="panel-h"><div><h3>Contatos atendidos por dia</h3><p>Conversas diferentes com mensagem em cada dia</p></div><span class="chip mute">${num(m.contatos_ativos)} no período</span></div>
      ${m.por_dia.length > 31 ? '<p class="hint">Escolha um período de até 31 dias para ver o gráfico por dia.</p>' : `<div class="bars" role="img" aria-label="Contatos por dia">${m.por_dia.map((d) => `<div class="b" title="${fmtData(d.dia)}: ${d.n}"><em>${d.n || ''}</em><i style="height:${(d.n / maxDia) * 100}%"></i><span>${fmtData(d.dia).slice(0, 5)}</span></div>`).join('')}</div>`}</div>
    <div class="panel"><div class="panel-h"><div><h3>Ranking por pedidos</h3><p>Quem mais criou pedidos válidos</p></div></div>
      <div class="rank">${m.ranking.length ? m.ranking.slice(0, 8).map((r) => `<div class="rr"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nomePessoa(r.pessoa))}</span><div class="tr"><i style="width:${(r.n / maxRank) * 100}%"></i></div><b>${r.n}</b></div>`).join('') : '<div class="empty">Nenhum pedido no período.</div>'}</div></div>
  </div>
  <div class="dash2" style="grid-template-columns:1fr 1fr">
    <div class="panel"><div class="panel-h"><div><h3>Funil de vendas</h3><p>Negócios em aberto e fechados no período</p></div><a class="btn sm" href="#/funil">Abrir funil</a></div>
      <div class="opgrid"><div><span>Em aberto</span><b>${brl(ab.reduce((a, n) => a + Number(n.valor || 0), 0))}</b></div><div><span>Negócios abertos</span><b>${ab.length}</b></div>
      <div><span>Vendido no período</span><b>${brl(ganhos.reduce((a, n) => a + Number(n.valor || 0), 0))}</b></div><div><span>Vendas fechadas</span><b>${ganhos.length}</b></div></div></div>
    <div class="panel"><div class="panel-h"><div><h3>Chamados de suporte</h3><p>Abertos no período</p></div><a class="btn sm" href="#/suporte">Ver chamados</a></div>
      <div class="opgrid"><div><span>Total</span><b>${m.chamados}</b></div><div><span>Em aberto</span><b>${m.chamados_abertos}</b></div><div><span>Resolvidos</span><b>${m.chamados_resolvidos}</b></div><div><span>Pedidos válidos</span><b>${m.pedidos_validos}</b></div></div></div>
  </div>
  ${lider() && !pessoa ? '<div class="panel" style="margin-top:14px" id="pPessoas"><div class="panel-h"><div><h3>Desempenho por pessoa</h3><p>No período escolhido</p></div><button class="btn sm" id="pCarregarPessoas">Mostrar</button></div></div>' : ''}`;
}

document.addEventListener('click', async (e) => {
  if (!e.target.closest('#pCarregarPessoas')) return;
  const box = $('#pPessoas'); const b = e.target.closest('button'); b.disabled = true; b.textContent = 'Calculando…';
  try {
    const ps = minhaEquipe().filter((p) => p.papel !== 'admin' && p.ativo).sort(ordPessoa);
    const md = await dadosDoMes(null);
    const rs = await Promise.all(ps.map((p) => rpc('painel_metricas', { p_empresa: S.empresaId, p_inicio: F.inicio, p_fim: F.fim, p_pessoa: p.id, p_etiqueta: F.etiqueta || null, p_status: F.status || null })));
    box.innerHTML = `<div class="panel-h"><div><h3>Desempenho por pessoa</h3><p>No período escolhido</p></div></div><div class="table-wrap" style="border:0"><table><thead><tr><th>Pessoa</th><th class="r">Pedidos</th><th class="r">Valor</th><th class="r">Esperando resposta</th><th class="r">Encerradas</th><th class="r">Resolução</th><th class="r">Resposta no prazo</th><th class="r">Meta do mês</th><th class="r">Comissão</th><th class="r">Nota</th></tr></thead><tbody>
      ${ps.map((p, i) => { const m = rs[i]; return `<tr><td><b>${esc(p.nome || p.email)}</b> <span class="small muted">${PAPEL_NOME[p.papel]}</span></td><td class="r">${m.pedidos}</td><td class="r">${brl(m.pedidos_valor)}</td><td class="r">${m.aguardando_resposta ? `<span class="chip gold">${m.aguardando_resposta}</span>` : 0}</td><td class="r">${m.encerradas_periodo}</td><td class="r">${pct(m.resolvidas, m.atribuidas)}%</td><td class="r">${pct(m.respostas_no_prazo, m.respostas)}%</td>
        <td class="r">${(() => { const r = resumoPessoa(md, p.id); return r.meta.meta_valor ? Math.round(r.vendido / r.meta.meta_valor * 100) + '%' : '—'; })()}</td>
        <td class="r">${brl(resumoPessoa(md, p.id).comissao)}</td><td class="r">${m.avaliacoes ? String(m.avaliacao_media).replace('.', ',') + ' ★' : '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
  } catch (er) { falhou(er); b.disabled = false; b.textContent = 'Mostrar'; }
});

async function exportar(btn) {
  const { menu } = await import('../core.js');
  menu(btn, [['csv', 'Planilha (CSV)', 'baixar'], ['pdf', 'PDF (imprimir)', 'doc']], (v) => {
    if (v === 'pdf') { window.print(); return; }
    if (!ultimo) return;
    const m = ultimo.m;
    baixarCsv(`painel-${F.inicio}-a-${F.fim}.csv`, [
      ['Indicador', 'Valor'], ['Período', `${fmtData(F.inicio)} a ${fmtData(F.fim)}`],
      ['Pedidos', m.pedidos], ['Pedidos válidos', m.pedidos_validos], ['Valor dos pedidos', String(m.pedidos_valor).replace('.', ',')],
      ['Em atendimento', m.em_atendimento], ['Esperando resposta', m.aguardando_resposta], ['Aguardando cliente', m.aguardando_cliente],
      ['Na fila', m.na_fila], ['Conversas abertas', m.abertas_agora], ['Encerradas no período', m.encerradas_periodo],
      ['Contatos ativos', m.contatos_ativos], ['Contatos novos', m.contatos_novos],
      ['Taxa de resolução (%)', pct(m.resolvidas, m.atribuidas)], [`Resposta em até ${m.sla_minutos} min (%)`, pct(m.respostas_no_prazo, m.respostas)],
      ['Chamados', m.chamados], ['Chamados em aberto', m.chamados_abertos], [],
      ['Dia', 'Contatos atendidos'], ...m.por_dia.map((d) => [fmtData(d.dia), d.n]), [],
      ['Pessoa', 'Pedidos', 'Valor'], ...m.ranking.map((r) => [nomePessoa(r.pessoa), r.n, String(r.valor).replace('.', ',')]),
    ]);
  });
}

/* ---------- meta, comissão e avaliação ---------- */
function mesDe(dia) { const [y, mo] = dia.split('-').map(Number); const ini = new Date(y, mo - 1, 1), fim = new Date(y, mo, 1); return { ini, fim, chave: isoDia(ini) }; }
async function dadosDoMes(pessoa) {
  const { ini, fim, chave } = mesDe(F.fim);
  let qp = S.sb.from('pedidos').select('responsavel_id,total,status').eq('empresa_id', S.empresaId).gte('criado_em', ini.toISOString()).lt('criado_em', fim.toISOString()).neq('status', 'cancelado');
  if (pessoa) qp = qp.eq('responsavel_id', pessoa);
  let qm = S.sb.from('metas').select('*').eq('empresa_id', S.empresaId).eq('mes', chave);
  if (pessoa) qm = qm.eq('user_id', pessoa);
  const [peds, metas] = await Promise.all([q(qp).catch(() => []), q(qm).catch(() => [])]);
  return { peds, metas, chave };
}
function resumoPessoa(md, id) {
  const ps = md.peds.filter((p) => p.responsavel_id === id); const meta = md.metas.find((x) => x.user_id === id) || {};
  const vendido = ps.reduce((a, p) => a + Number(p.total), 0); const pagos = ps.filter((p) => p.status === 'pago').reduce((a, p) => a + Number(p.total), 0);
  const pct = Number((S.pessoas.find((x) => x.id === id) || (S.me.id === id ? S.me : {})).comissao_pct || 0);
  return { vendido, pagos, n: ps.length, meta, comissao: pagos * pct / 100, pct };
}
function barra(atual, alvo) {
  const p = alvo ? Math.min(100, Math.round((atual / alvo) * 100)) : 0;
  return `<div class="meter"><i style="width:${p}%;background:${p >= 100 ? 'var(--good)' : p >= 60 ? 'var(--accent)' : 'var(--gold)'}"></i></div>`;
}
function blocoMeta(md, pessoa, m) {
  const nomeMes = new Date(md.chave + 'T12:00').toLocaleDateString('pt-BR', { month: 'long' });
  const aval = `<div class="panel"><div class="lb small muted" style="font-weight:600">Nota dos clientes</div><div class="vl" style="font-family:var(--display);font-size:32px;font-weight:700">${m.avaliacoes ? String(m.avaliacao_media).replace('.', ',') + ' ★' : '—'}</div>
    <div class="small muted">${m.avaliacoes ? `${m.avaliacoes} avaliação(ões) no período` : 'Sem avaliações no período. Ligue a pesquisa em Configurações.'}</div></div>`;
  if (pessoa) {
    const r = resumoPessoa(md, pessoa); const temMeta = r.meta.meta_valor || r.meta.meta_pedidos;
    return `<div class="dash2" style="margin:0 0 14px">
      <div class="panel"><div class="lb small muted" style="font-weight:600">Meta de ${esc(nomeMes)}</div>
        ${temMeta ? `<div class="vl" style="font-family:var(--display);font-size:24px;font-weight:700">${brl(r.vendido)} <span class="small muted" style="font-family:var(--body);font-weight:500">de ${brl(r.meta.meta_valor)}</span></div>${barra(r.vendido, r.meta.meta_valor)}
          ${r.meta.meta_pedidos ? `<div class="small muted" style="margin-top:8px">${r.n} de ${r.meta.meta_pedidos} pedidos</div>${barra(r.n, r.meta.meta_pedidos)}` : ''}`
        : `<div class="small muted" style="margin-top:6px">Nenhuma meta definida para este mês.${lider() ? ' Defina em Equipe e logins > Metas do mês.' : ''}</div><div class="vl" style="font-family:var(--display);font-size:24px;font-weight:700;margin-top:6px">${brl(r.vendido)}</div><div class="small muted">vendido no mês</div>`}</div>
      <div class="panel"><div class="lb small muted" style="font-weight:600">${pessoa === S.me.id ? 'Minha comissão' : 'Comissão'} em ${esc(nomeMes)}</div><div class="vl" style="font-family:var(--display);font-size:32px;font-weight:700">${brl(r.comissao)}</div>
        <div class="small muted">${r.pct ? `${String(r.pct).replace('.', ',')}% sobre ${brl(r.pagos)} em pedidos pagos` : 'Percentual de comissão não cadastrado.'}</div></div>
      ${aval}</div>`;
  }
  const tot = md.metas.reduce((a, x) => a + Number(x.meta_valor), 0); const vend = md.peds.reduce((a, p) => a + Number(p.total), 0);
  return `<div class="dash2" style="margin:0 0 14px;grid-template-columns:2fr 1fr">
    <div class="panel"><div class="panel-h" style="margin-bottom:6px"><div><h3>Metas de ${esc(nomeMes)}</h3><p>${tot ? `${brl(vend)} de ${brl(tot)} somando a equipe` : 'Nenhuma meta definida para este mês.'}</p></div>${lider() ? '<button class="btn sm" id="pMetas">Definir metas</button>' : ''}</div>
      ${tot ? barra(vend, tot) : ''}
      ${md.metas.length ? `<div class="rank" style="margin-top:12px">${md.metas.map((x) => { const r = resumoPessoa(md, x.user_id); const p = x.meta_valor ? Math.round(r.vendido / x.meta_valor * 100) : 0; return `<div class="rr"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nomePessoa(x.user_id))}</span><div class="tr"><i style="width:${Math.min(100, p)}%"></i></div><b>${p}%</b></div>`; }).join('')}</div>` : ''}</div>
    ${aval}</div>`;
}
document.addEventListener('click', async (e) => {
  if (!e.target.closest('#pMetas')) return;
  const { metas } = await import('./logins.js'); metas(mesDe(F.fim).chave);
});
