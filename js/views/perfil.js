// Meu perfil: dados, senha, verificação em duas etapas e preferências
import { S, $, esc, q, abrir, rodape, toast, falhou, msgErro, icon, avatarPessoa, PAPEL_NOME, PRESENCA, fechar } from '../core.js';
import { salvarPerfil, trocarFoto, aplicarTema, preferenciasMenu, tour } from '../app.js';

let el;
export default {
  async render(root, arg) {
    el = root; desenhar();
    if (arg === 'senha') setTimeout(() => $('#pfAtual')?.focus(), 50);
  },
  mudarArg(arg) { if (arg === 'senha') $('#pfAtual')?.focus(); },
};
function desenhar() {
  const me = S.me, pr = me.prefs || {};
  el.innerHTML = `<div class="bar"><div><h2>Meu perfil</h2><p class="sub">Seus dados, senha, verificação em duas etapas e preferências.</p></div></div>
  <div class="grid-perfil" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">
    <form class="panel" id="pfDados"><div class="panel-h"><div><h3>Dados da conta</h3><p>Seu nome e por quanto tempo o login fica salvo neste aparelho.</p></div></div>
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">${avatarPessoa({ ...me, visto_em: new Date().toISOString() }, 'lg', true)}<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn sm" id="pfFoto">Alterar foto</button>${me.foto_url ? '<button type="button" class="btn sm" id="pfSemFoto">Remover</button>' : ''}</div></div>
      <div class="field"><label for="pfNome">Nome</label><input id="pfNome" required value="${esc(me.nome)}"></div>
      <div class="field" style="margin-top:10px"><label for="pfEmail">E-mail</label><input id="pfEmail" value="${esc(me.email)}" disabled></div>
      <div class="field" style="margin-top:10px"><label for="pfSess">Permanecer logado por</label><select id="pfSess">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${(pr.sessao_dias || 7) === n ? 'selected' : ''}>${n} dia${n > 1 ? 's' : ''}</option>`).join('')}</select><span class="hint">Depois disso, o sistema pede a senha de novo.</span></div>
      <p class="hint" style="margin-top:10px">${PAPEL_NOME[me.papel]}</p>
      <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn pri">Salvar alterações</button></div></form>
    <form class="panel" id="pfSenha"><div class="panel-h"><div><h3>Alterar senha</h3><p>Informe a senha atual e escolha uma nova.</p></div></div>
      <div class="field"><label for="pfAtual">Senha atual</label><input id="pfAtual" type="password" autocomplete="current-password" required></div>
      <div class="field" style="margin-top:10px"><label for="pfNova">Nova senha (mínimo 8 caracteres)</label><input id="pfNova" type="password" minlength="8" autocomplete="new-password" required></div>
      <div class="field" style="margin-top:10px"><label for="pfConf">Confirmar nova senha</label><input id="pfConf" type="password" minlength="8" autocomplete="new-password" required></div>
      <label class="check-line" style="margin-top:8px"><input type="checkbox" id="pfVer"> Mostrar senhas</label>
      <div class="err" id="pfErr" hidden></div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn pri">Alterar senha</button></div></form>
    <div class="panel"><div class="panel-h"><div><h3>Verificação em duas etapas</h3><p>Opcional. Além da senha, pede um código do celular (Google Authenticator, Authy e parecidos).</p></div><span class="chip mute" id="mfaSt">Carregando</span></div><div id="mfaBox"></div></div>
    <div class="panel"><div class="panel-h"><div><h3>Preferências</h3><p>Valem só para o seu login.</p></div></div>
      <div class="list">
        <div class="row"><div class="main-c"><div class="t">Status</div></div><div class="seg" id="pfPres">${Object.entries(PRESENCA).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${me.presenca === k}">${v}</button>`).join('')}</div></div>
        <div class="row"><div class="main-c"><div class="t">Tema</div></div><div class="seg" id="pfTema">${[['claro', 'Claro'], ['escuro', 'Escuro'], ['auto', 'Automático']].map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${(pr.tema || 'auto') === k}">${v}</button>`).join('')}</div></div>
        <div class="row"><div class="main-c"><div class="t">Som de notificação</div></div><label class="toggle"><input type="checkbox" id="pfSom" ${pr.som === false ? '' : 'checked'} aria-label="Som de notificação"><span></span></label></div>
        <div class="row"><div class="main-c"><div class="t">Avisos do navegador</div><div class="s">Mostra um aviso fora do sistema quando chega mensagem.</div></div><button type="button" class="btn sm" id="pfNotif">${'Notification' in window && Notification.permission === 'granted' ? 'Ativados' : 'Ativar'}</button></div>
        <div class="row"><div class="main-c"><div class="t">Menu lateral</div><div class="s">Mude a ordem e esconda o que não usa.</div></div><button type="button" class="btn sm" id="pfMenu">Organizar</button></div>
        <div class="row"><div class="main-c"><div class="t">Tour do sistema</div></div><button type="button" class="btn sm" id="pfTour">Ver de novo</button></div>
      </div></div>
  </div>`;
  $('#pfFoto').onclick = () => { trocarFoto(); setTimeout(desenhar, 4000); };
  $('#pfSemFoto') && ($('#pfSemFoto').onclick = async () => { try { await salvarPerfil({ foto_url: '' }); desenhar(); } catch (e) { falhou(e); } });
  $('#pfDados').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const dias = Number($('#pfSess').value);
      await salvarPerfil({ nome: $('#pfNome').value.trim(), prefs: { sessao_dias: dias } });
      try { localStorage.setItem('crm-sessao-dias', String(dias)); } catch (er) {}
      toast('Dados salvos');
    } catch (er) { falhou(er); }
  };
  $('#pfVer').onchange = (e) => ['#pfAtual', '#pfNova', '#pfConf'].forEach((s) => ($(s).type = e.target.checked ? 'text' : 'password'));
  $('#pfSenha').onsubmit = async (e) => {
    e.preventDefault(); const err = $('#pfErr'); err.hidden = true;
    const atual = $('#pfAtual').value, nova = $('#pfNova').value;
    try {
      if (nova.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');
      if (nova !== $('#pfConf').value) throw new Error('A confirmação não bate com a nova senha.');
      const { error: e1 } = await S.sb.auth.signInWithPassword({ email: S.me.email, password: atual });
      if (e1) throw new Error('A senha atual está incorreta.');
      const { error: e2 } = await S.sb.auth.updateUser({ password: nova });
      if (e2) throw e2;
      $('#pfSenha').reset(); toast('Senha alterada');
    } catch (er) { err.textContent = msgErro(er); err.hidden = false; }
  };
  $('#pfPres').onclick = async (e) => { const b = e.target.closest('[data-v]'); if (!b) return; try { await salvarPerfil({ presenca: b.dataset.v }); desenhar(); } catch (er) { falhou(er); } };
  $('#pfTema').onclick = async (e) => { const b = e.target.closest('[data-v]'); if (!b) return; aplicarTema(b.dataset.v); try { await salvarPerfil({ prefs: { tema: b.dataset.v } }); desenhar(); } catch (er) { falhou(er); } };
  $('#pfSom').onchange = async (e) => { try { await salvarPerfil({ prefs: { som: e.target.checked } }); toast(e.target.checked ? 'Som ligado' : 'Som desligado'); } catch (er) { falhou(er); } };
  $('#pfNotif').onclick = async () => { if (!('Notification' in window)) return toast('Este navegador não mostra avisos.', true); const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Avisos ativados' : 'O navegador bloqueou os avisos. Libere nas configurações do site.', r !== 'granted'); desenhar(); };
  $('#pfMenu').onclick = preferenciasMenu;
  $('#pfTour').onclick = tour;
  mfa();
}

async function mfa() {
  const box = $('#mfaBox'), st = $('#mfaSt');
  try {
    const { data, error } = await S.sb.auth.mfa.listFactors(); if (error) throw error;
    const ok = (data.totp || []).find((f) => f.status === 'verified');
    st.textContent = ok ? 'Ativada' : 'Desativada'; st.className = 'chip ' + (ok ? 'good' : 'mute');
    box.innerHTML = ok ? '<p class="hint">Ao entrar, o sistema pede o código do aplicativo.</p><button class="btn danger" id="mfaOff" style="margin-top:8px">Desativar</button>'
      : '<button class="btn pri" id="mfaOn">Configurar verificação em duas etapas</button>';
    $('#mfaOn') && ($('#mfaOn').onclick = configurar);
    $('#mfaOff') && ($('#mfaOff').onclick = async () => {
      try { const { error: e } = await S.sb.auth.mfa.unenroll({ factorId: ok.id }); if (e) throw e; toast('Verificação em duas etapas desativada'); mfa(); }
      catch (e) { falhou(/aal2|AAL2/i.test(String(e.message)) ? 'Para desativar, saia e entre de novo usando o código do aplicativo.' : e); }
    });
  } catch (e) { st.textContent = 'Indisponível'; box.innerHTML = `<p class="hint">Não foi possível ver a verificação em duas etapas: ${esc(msgErro(e))}</p>`; }
}
async function configurar() {
  try {
    const { data: l } = await S.sb.auth.mfa.listFactors();
    for (const f of (l?.all || l?.totp || []).filter((x) => x.status !== 'verified')) await S.sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await S.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'CRM Balcão ' + Date.now().toString(36) });
    if (error) throw error;
    const svg = data.totp.qr_code;
    abrir(`<h3>Configurar verificação em duas etapas</h3>
      <ol class="small" style="margin:0;padding-left:18px;display:grid;gap:4px"><li>Instale o Google Authenticator (ou outro autenticador) no celular.</li><li>No aplicativo, toque em adicionar e escaneie o código abaixo.</li><li>Digite o código de 6 números que aparecer.</li></ol>
      <div style="display:grid;place-items:center;background:#fff;border-radius:8px;padding:10px"><img src="${svg.startsWith('data:') ? svg : 'data:image/svg+xml;utf-8,' + encodeURIComponent(svg)}" alt="Código QR para o aplicativo autenticador" style="width:200px;height:200px"></div>
      <p class="hint">Sem câmera? Digite esta chave no aplicativo: <b style="font-family:monospace;overflow-wrap:anywhere">${esc(data.totp.secret)}</b></p>
      <div class="field"><label for="mfC">Código de 6 números</label><input id="mfC" name="cod" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></div>${rodape({ salvar: 'Ativar' })}`,
    async (d) => {
      const { error: e } = await S.sb.auth.mfa.challengeAndVerify({ factorId: data.id, code: d.cod.trim() });
      if (e) throw new Error('Código incorreto. Confira no aplicativo e tente de novo.');
      toast('Verificação em duas etapas ativada'); mfa();
    });
  } catch (e) { falhou(e); }
}
