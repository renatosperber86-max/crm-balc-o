// Equipe e logins
import { S, $, esc, q, rpc, api, abrir, rodape, toast, falhou, icon, isAdmin, isGerente, PAPEL_NOME, PRESENCA, online, avatarPessoa, ordPessoa, minhaEquipe, brl, nomePessoa, isoDia } from '../core.js';
import { escolherPessoa } from '../comum.js';
import { carregarBase, empresaAtual } from '../app.js';

let el;
export default {
  async render(root) {
    el = root;
    el.innerHTML = `<div class="bar"><div><h2>${isAdmin() ? 'Equipe e logins' : 'Minha equipe'}</h2><p class="sub">${isAdmin() ? 'Crie gerentes e funcionários e escolha a área de cada um.' : 'Crie e gerencie os logins dos funcionários da sua equipe.'}</p></div>
      <div class="bar-r"><button class="btn" id="lgMetas">${icon('meta')}Metas do mês</button><button class="btn pri" id="lgNovo">${icon('mais2')}Novo login</button></div></div><div id="lgBox"></div>`;
    $('#lgNovo').onclick = novo;
    $('#lgMetas').onclick = () => metas();
    $('#lgBox').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) editar(b.dataset.p); const c = e.target.closest('[data-cart]'); if (c) carteira(c.dataset.cart); };
    desenhar();
  },
};
const area = (id) => S.areas.find((a) => a.id === id)?.nome;
function linha(p) {
  const pode = isAdmin() || (isGerente() && p.papel === 'funcionario' && p.gerente_id === S.me.id);
  return `<div class="row"><div class="pessoa">${avatarPessoa(p, 'sm', true)}<div style="min-width:0"><div class="t">${esc(p.nome || '(sem nome)')}${p.ativo ? '' : ' <span class="chip bad">Desativado</span>'}</div>
    <div class="s">${esc(p.email)} · ${PAPEL_NOME[p.papel]}${area(p.area_id) ? ' · área ' + esc(area(p.area_id)) : ''} · ${PRESENCA[online(p)]}${Number(p.comissao_pct) ? ' · comissão ' + String(p.comissao_pct).replace('.', ',') + '%' : ''}${p.recebe_fila ? '' : ' · fora do rodízio'}</div></div></div>
    ${pode ? `<button class="btn sm" data-cart="${p.id}" title="Passar todos os contatos e conversas para outra pessoa">Transferir carteira</button>` : ''}
    ${pode && p.id !== S.me.id ? `<button class="btn sm" data-p="${p.id}">Editar</button>` : ''}</div>`;
}
function desenhar() {
  const ger = S.pessoas.filter((p) => p.papel === 'gerente').sort(ordPessoa);
  const fun = S.pessoas.filter((p) => p.papel === 'funcionario').sort(ordPessoa);
  const visGer = isAdmin() ? ger : ger.filter((g) => g.id === S.me.id);
  if (!visGer.length && !fun.length) { $('#lgBox').innerHTML = `<div class="empty">Nenhum login nesta empresa ainda. Clique em <b>Novo login</b>${isAdmin() ? ' e comece criando um gerente' : ''}.</div>`; return; }
  const blocos = visGer.map((g) => {
    const eq = fun.filter((f) => f.gerente_id === g.id);
    return `<div class="panel"><div class="panel-h"><div class="pessoa">${avatarPessoa(g, '', true)}<div><h3>${esc(g.nome || g.email)} <span class="chip gold">Gerente</span>${g.ativo ? '' : ' <span class="chip bad">Desativado</span>'}</h3><p>${esc(g.email)} · ${eq.length} funcionário(s)${area(g.area_id) ? ' · área ' + esc(area(g.area_id)) : ''}</p></div></div>
      <div style="display:flex;gap:6px">${isAdmin() || g.id === S.me.id ? `<button class="btn sm" data-cart="${g.id}">Transferir carteira</button>` : ''}${isAdmin() ? `<button class="btn sm" data-p="${g.id}">Editar</button>` : ''}</div></div>
      <div class="list">${eq.length ? eq.map(linha).join('') : '<div class="small muted">Sem funcionários ainda.</div>'}</div></div>`;
  });
  const soltos = fun.filter((f) => !ger.some((g) => g.id === f.gerente_id));
  if (soltos.length && isAdmin()) blocos.push(`<div class="panel"><div class="panel-h"><h3>Funcionários sem gerente</h3></div><div class="list">${soltos.map(linha).join('')}</div></div>`);
  $('#lgBox').innerHTML = `<div class="team">${blocos.join('')}</div>`;
}
const opGer = (sel) => { const gs = S.pessoas.filter((p) => p.papel === 'gerente' && p.ativo).sort(ordPessoa); return gs.length ? gs.map((g) => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${esc(g.nome || g.email)}</option>`).join('') : '<option value="">Crie um gerente primeiro</option>'; };
const opArea = (sel) => `<option value="">Nenhuma</option>` + S.areas.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.nome)}</option>`).join('');
function novo() {
  const vendas = S.areas.find((a) => a.nome === 'Vendas')?.id;
  const f = abrir(`<h3>Novo login</h3>${isAdmin() ? `<p class="hint">Empresa: <b>${esc(empresaAtual()?.nome)}</b></p>` : ''}
    <div class="field"><label for="u-nome">Nome *</label><input id="u-nome" name="nome" required></div>
    <div class="field"><label for="u-email">E-mail (é o usuário de login) *</label><input id="u-email" name="email" type="email" required autocomplete="off"></div>
    <div class="field"><label for="u-senha">Senha inicial * (mínimo 8 caracteres, sem símbolos é mais fácil)</label><input id="u-senha" name="senha" type="text" minlength="8" required autocomplete="new-password"></div>
    ${isAdmin() ? `<div class="fields2"><div class="field"><label for="u-papel">Tipo de login</label><select id="u-papel" name="papel"><option value="funcionario">Funcionário</option><option value="gerente">Gerente</option></select></div>
      <div class="field" id="u-ger-box"><label for="u-ger">Gerente responsável</label><select id="u-ger" name="gerente_id">${opGer()}</select></div></div>` : '<p class="hint">Será criado como funcionário da sua equipe.</p>'}
    <div class="field"><label for="u-com">Comissão sobre vendas pagas (%)</label><input id="u-com" name="comissao_pct" type="number" min="0" max="100" step="0.1" value="0"></div>
    <div class="field"><label for="u-area">Área</label><select id="u-area" name="area_id">${opArea(vendas)}</select><span class="hint">Define para quais filas de encaminhamento a pessoa olha (ex.: Assistência).</span></div>
    ${rodape({ salvar: 'Criar login' })}`,
  async (d) => {
    await api('usuarios', { acao: 'criar', nome: d.nome, email: d.email, senha: d.senha, papel: d.papel || 'funcionario', empresa_id: S.empresaId, gerente_id: d.gerente_id || null, area_id: d.area_id || null, comissao_pct: Number(d.comissao_pct) || 0 });
    toast('Login criado. Passe o e-mail e a senha para a pessoa.'); await carregarBase(); desenhar();
  });
  const papel = f.querySelector('#u-papel');
  if (papel) { const sync = () => { f.querySelector('#u-ger-box').hidden = papel.value !== 'funcionario'; }; papel.onchange = sync; sync(); }
}
function editar(id) {
  const p = S.pessoas.find((x) => x.id === id); if (!p) return;
  const trocaGer = isAdmin() && p.papel === 'funcionario';
  abrir(`<h3>Editar login</h3><p class="hint">${esc(p.email)} · ${PAPEL_NOME[p.papel]}</p>
    <div class="field"><label for="e-nome">Nome</label><input id="e-nome" name="nome" value="${esc(p.nome)}" required></div>
    ${trocaGer ? `<div class="field"><label for="e-ger">Gerente responsável</label><select id="e-ger" name="gerente_id">${opGer(p.gerente_id)}</select></div>` : ''}
    <div class="field"><label for="e-area">Área</label><select id="e-area" name="area_id">${opArea(p.area_id)}</select></div>
    <div class="fields2"><div class="field"><label for="e-com">Comissão sobre vendas pagas (%)</label><input id="e-com" name="comissao_pct" type="number" min="0" max="100" step="0.1" value="${esc(p.comissao_pct || 0)}"></div>
      <label class="check-line" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="recebe_fila" ${p.recebe_fila ? 'checked' : ''}> Recebe clientes da fila automática</label></div>
    <div class="field"><label for="e-senha">Nova senha (deixe em branco para não mudar)</label><input id="e-senha" name="senha" type="text" minlength="8" autocomplete="new-password"></div>
    <label class="check-line"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> Login ativo (desmarque para bloquear o acesso)</label>
    ${rodape()}`,
  async (d) => {
    const body = { acao: 'atualizar', id, nome: d.nome, ativo: d.ativo === 'on', area_id: d.area_id || null, comissao_pct: Number(d.comissao_pct) || 0, recebe_fila: d.recebe_fila === 'on' };
    if (d.senha) body.senha = d.senha;
    if (trocaGer && d.gerente_id && d.gerente_id !== p.gerente_id) body.gerente_id = d.gerente_id;
    await api('usuarios', body); toast('Login atualizado'); await carregarBase(); desenhar();
  });
}

// passa toda a carteira (contatos, conversas, negócios e lembretes) de uma pessoa para outra
function carteira(deId) {
  const de = S.pessoas.find((p) => p.id === deId); if (!de) return;
  const ops = S.pessoas.filter((p) => p.ativo && p.id !== deId && ['gerente', 'funcionario'].includes(p.papel));
  abrir(`<h3>Transferir carteira de ${esc(de.nome || de.email)}</h3>
    <p class="hint">Todos os contatos e conversas dessa pessoa vão para quem você escolher, junto com os negócios abertos do funil. Pedidos e orçamentos antigos continuam no nome dela, para não mexer em comissão. Use quando alguém sair da empresa ou entrar de férias.</p>
    <div class="field"><label for="ctP">Passar para</label><select id="ctP" name="para" required>${ops.sort(ordPessoa).map((p) => `<option value="${p.id}">${esc(p.nome || p.email)} (${PAPEL_NOME[p.papel]})</option>`).join('')}</select></div>
    <label class="check-line"><input type="checkbox" name="lem" checked> Levar também os lembretes pendentes</label>
    ${rodape({ salvar: 'Transferir carteira' })}`,
  async (d) => {
    const r = await rpc('transferir_carteira', { p_de: deId, p_para: d.para, p_lembretes: d.lem === 'on' });
    toast(`Transferido para ${nomePessoa(d.para)}: ${r.contatos} contato(s), ${r.conversas} conversa(s), ${r.negocios} negócio(s), ${r.lembretes} lembrete(s)`);
  });
}

// metas do mês por pessoa
export async function metas(mesInicial) {
  const hoje = new Date(); let mes = mesInicial || isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const pessoas = minhaEquipe().filter((p) => p.ativo && p.papel !== 'admin').sort(ordPessoa);
  const atuais = await q(S.sb.from('metas').select('*').eq('empresa_id', S.empresaId).eq('mes', mes)).catch(() => []);
  const de = (id) => atuais.find((m) => m.user_id === id) || {};
  const nomeMes = new Date(mes + 'T12:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const f = abrir(`<div class="dlg-h"><div><h3>Metas do mês</h3><p class="hint">Valor em pedidos (sem os cancelados) e quantidade de pedidos que cada pessoa deve fazer no mês. Aparece no painel com a barra de progresso.</p></div></div>
    <div class="field" style="max-width:220px"><label for="mtMes">Mês</label><input type="month" id="mtMes" value="${mes.slice(0, 7)}"></div>
    <div class="table-wrap" style="border:0"><table style="min-width:480px"><thead><tr><th>Pessoa</th><th>Meta em R$</th><th>Meta de pedidos</th></tr></thead><tbody>
    ${pessoas.map((p) => `<tr><td><b>${esc(p.nome || p.email)}</b></td><td><input type="number" min="0" step="100" name="v-${p.id}" value="${esc(de(p.id).meta_valor || '')}" aria-label="Meta em reais de ${esc(p.nome)}"></td>
      <td><input type="number" min="0" step="1" name="n-${p.id}" value="${esc(de(p.id).meta_pedidos || '')}" aria-label="Meta de pedidos de ${esc(p.nome)}"></td></tr>`).join('') || '<tr><td colspan="3">Ninguém na equipe.</td></tr>'}
    </tbody></table></div>
    <p class="hint">Mês selecionado: <b>${esc(nomeMes)}</b>. Deixe em branco quem não tem meta.</p>
    ${rodape({ salvar: 'Salvar metas' })}`,
  async (d) => {
    const linhas = pessoas.map((p) => ({ empresa_id: S.empresaId, user_id: p.id, mes, meta_valor: Number(d['v-' + p.id]) || 0, meta_pedidos: Number(d['n-' + p.id]) || 0 }));
    const com = linhas.filter((l) => l.meta_valor || l.meta_pedidos), sem = linhas.filter((l) => !l.meta_valor && !l.meta_pedidos);
    if (com.length) await q(S.sb.from('metas').upsert(com));
    if (sem.length) await q(S.sb.from('metas').delete().eq('mes', mes).in('user_id', sem.map((l) => l.user_id)));
    toast('Metas salvas');
  }, null, { largo: true });
  f.querySelector('#mtMes').onchange = (e) => { if (e.target.value) metas(e.target.value + '-01'); };
}
