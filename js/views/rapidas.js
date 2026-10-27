// Mensagens rápidas (atalhos pessoais)
import { S, $, esc, q, abrir, rodape, toast, falhou, icon, menu, confirmar, buscarTudo } from '../core.js';

let el;
export default {
  async render(root) {
    el = root;
    el.innerHTML = `<div class="bar"><div><h2>Mensagens rápidas</h2><p class="sub">Atalhos pessoais para respostas prontas. No chat, digite <b>/</b> e o começo do atalho para usar.</p></div>
      <div class="bar-r"><button class="btn pri" id="mrNova">${icon('mais2')}Nova mensagem</button></div></div><div id="mrLista"></div>`;
    $('#mrNova').onclick = () => form();
    $('#mrLista').onclick = (e) => {
      const b = e.target.closest('[data-mr]'); if (!b) return;
      const r = S.rapidas.find((x) => x.id === b.dataset.mr);
      menu(b, [['editar', 'Editar', 'editar'], ['copiar', 'Copiar texto', 'doc'], ['excluir', 'Excluir', 'lixo', 'bad']], async (v) => {
        if (v === 'editar') form(r);
        if (v === 'copiar') { try { await navigator.clipboard.writeText(r.conteudo); toast('Texto copiado'); } catch (er) { toast('Não foi possível copiar.', true); } }
        if (v === 'excluir' && await confirmar('Excluir mensagem rápida?', `O atalho ${r.atalho} deixa de funcionar no chat.`, 'Excluir', true)) {
          try { await q(S.sb.from('mensagens_rapidas').delete().eq('id', r.id)); await recarregar(); toast('Mensagem excluída'); } catch (er) { falhou(er); }
        }
      });
    };
    await recarregar();
  },
};
async function recarregar() {
  S.rapidas = await buscarTudo('mensagens_rapidas', (x) => x.eq('user_id', S.me.id), '*', 'atalho');
  $('#mrLista').innerHTML = S.rapidas.length ? S.rapidas.map((r) => `<div class="mr"><span class="at">${esc(r.atalho)}</span><span class="ct">${esc(r.conteudo)}</span>
      <button class="icon-btn" data-mr="${r.id}" aria-label="Ações para ${esc(r.atalho)}">${icon('mais')}</button></div>`).join('')
    : '<div class="empty">Nenhuma mensagem rápida ainda. Crie atalhos como <b>/oi</b> para "Bom dia! Me chamo… e estou fazendo seu atendimento."</div>';
}
function form(r) {
  abrir(`<div class="dlg-h"><h3>${r ? 'Editar mensagem rápida' : 'Nova mensagem rápida'}</h3></div>
    <div class="field"><label for="mrA">Atalho</label><input id="mrA" name="atalho" required value="${esc(r?.atalho || '/')}" pattern="/\\S+" title="Comece com / e não use espaços. Ex.: /oi"></div>
    <div class="field"><label for="mrC">Conteúdo</label><textarea id="mrC" name="conteudo" required style="min-height:140px">${esc(r?.conteudo || '')}</textarea></div>
    <p class="hint">Use atalhos curtos e fáceis de lembrar, como /oi, /frete ou /pix.</p>
    ${rodape({ salvar: r ? 'Salvar' : 'Criar' })}`,
  async (d) => {
    let at = d.atalho.trim().replace(/\s+/g, ''); if (!at.startsWith('/')) at = '/' + at;
    if (at.length < 2) throw new Error('Escreva o atalho depois da barra. Ex.: /oi');
    const dados = { atalho: at, conteudo: d.conteudo.trim() };
    if (r) await q(S.sb.from('mensagens_rapidas').update(dados).eq('id', r.id));
    else await q(S.sb.from('mensagens_rapidas').insert({ ...dados, user_id: S.me.id }));
    await recarregar(); toast(r ? 'Mensagem salva' : 'Mensagem criada');
  });
}
