/* CRM Balcão — peças comuns a todas as telas.
   A segurança (quem vê o quê) é feita pelo banco (supabase/schema.sql)
   e pelos servidores em /api. Aqui é só a interface. */

export const S = {
  sb: null, me: null, empresas: [], empresaId: '', pessoas: [], areas: [], etiquetas: [],
  rapidas: [], waConta: null, rtOk: false,
};

/* ---------- utilidades ---------- */
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
export const num = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
export const pad = (n) => String(n).padStart(2, '0');
export const isoDia = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const hoje = () => isoDia();
export const fmtData = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return d + '/' + m + '/' + y; };
export const fmtDataHora = (s) => { if (!s) return ''; const d = new Date(s); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
export const fmtHora = (s) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export function fmtQuando(s) {
  if (!s) return '';
  const d = new Date(s); const h = new Date();
  if (isoDia(d) === isoDia(h)) return fmtHora(s);
  const ontem = new Date(h); ontem.setDate(h.getDate() - 1);
  if (isoDia(d) === isoDia(ontem)) return 'Ontem';
  if (h - d < 6 * 864e5) return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
export function duracao(seg) {
  seg = Math.max(0, Math.round(seg));
  if (seg < 60) return seg + 's';
  const m = Math.floor(seg / 60); if (m < 60) return m + 'min';
  const h = Math.floor(m / 60); if (h < 48) return h + 'h ' + (m % 60) + 'min';
  return Math.floor(h / 24) + ' dias';
}
export const desde = (s) => s ? duracao((Date.now() - new Date(s)) / 1000) : '';
export const fmtTel = (t) => {
  const d = String(t || '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith('55')) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return t || '';
};
export const fmtBytes = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1).replace('.', ',') + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const isAdmin = () => S.me?.papel === 'admin';
export const isGerente = () => S.me?.papel === 'gerente';
export const lider = () => isAdmin() || isGerente();
export const atende = () => S.me?.papel === 'gerente' || S.me?.papel === 'funcionario';
export const PAPEL_NOME = { admin: 'Administrador', gerente: 'Gerente', funcionario: 'Funcionário', pendente: 'Pendente' };
export const pessoa = (id) => S.pessoas.find((p) => p.id === id) || (S.me && S.me.id === id ? S.me : null);
export const nomePessoa = (id) => { const p = pessoa(id); return p ? (p.nome || p.email) : (id ? '—' : 'Ninguém'); };
// pessoas que o usuário gerencia (ele mesmo + equipe)
export function minhaEquipe() {
  if (isAdmin()) return S.pessoas.filter((p) => p.papel !== 'admin');
  if (isGerente()) return S.pessoas.filter((p) => p.id === S.me.id || (p.papel === 'funcionario' && p.gerente_id === S.me.id));
  return S.pessoas.filter((p) => p.id === S.me.id);
}
export function ordPessoa(a, b) {
  const o = { gerente: 0, funcionario: 1 };
  return (o[a.papel] ?? 2) - (o[b.papel] ?? 2) || (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
}
export function online(p) {
  if (!p) return 'offline';
  if (p.presenca === 'offline') return 'offline';
  if (!p.visto_em || Date.now() - new Date(p.visto_em) > 4 * 60e3) return 'offline';
  return p.presenca;
}
export const PRESENCA = { online: 'Online', ocupado: 'Ocupado', offline: 'Offline' };

export const STATUS = {
  fila: { nome: 'Na fila', curto: 'Na fila' },
  aguardando_atendente: { nome: 'Aguardando atendente', curto: 'Aguardando você' },
  aguardando_cliente: { nome: 'Aguardando cliente', curto: 'Aguardando cliente' },
  ativo: { nome: 'Em atendimento', curto: 'Em atendimento' },
  encerrada: { nome: 'Encerrada', curto: 'Encerrada' },
};

/* ---------- ícones (traço simples) ---------- */
const IC = {
  painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  equipe: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6"/>',
  contatos: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17a4 4 0 0 1 8 0"/>',
  lembretes: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  rapidas: '<path d="M13 3 4 14h7l-1 7 9-11h-7z"/>',
  pedidos: '<path d="M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0"/>',
  funil: '<path d="M3 4h18l-7 9v6l-4 2v-8z"/>',
  galeria: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  assistencia: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  logins: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  etiquetas: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  empresas: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  suporte: '<path d="M4 13a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-2v-6h4M4 13v4a2 2 0 0 0 2 2h2v-6H4"/>',
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  mais: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  clipe: '<path d="M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3L15 7.5"/>',
  pasta: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  emoji: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5v.01M15 9.5v.01"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  enviar: '<path d="M4 12 20 4l-6 16-3-7z"/>',
  voltar: '<path d="M15 5l-7 7 7 7"/>',
  hist: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  estrela: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  responder: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v4"/>',
  baixar: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  doc: '<path d="M14 3H6v18h12V7zM14 3v4h4"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  lixo: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  mais2: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;

/* ---------- avatar ---------- */
const CORES = ['#0f6b5c', '#2f6fb2', '#b4532a', '#7a4fb0', '#b7791f', '#1f8a4c', '#a23b72', '#3d6b8f'];
export function corDe(s) { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CORES[h % CORES.length]; }
export function iniciais(n) { const p = String(n || '?').trim().split(/\s+/).filter(Boolean); return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
export function avatar(nome, foto, cls = '', status) {
  const inner = foto ? `<img src="${esc(foto)}" alt="">` : esc(iniciais(nome));
  const a = `<span class="av ${cls}" style="background:${corDe(nome)}" aria-hidden="true">${inner}</span>`;
  return status ? `<span class="av-wrap">${a}<i class="dot ${status}" title="${PRESENCA[status]}"></i></span>` : a;
}
export const avatarPessoa = (p, cls = '', comStatus = false) => avatar(p?.nome || p?.email, p?.foto_url, cls, comStatus ? online(p) : null);

/* ---------- avisos ---------- */
export function toast(msg, ruim = false) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.toggle('bad', !!ruim);
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ruim ? 5000 : 2600);
}
export function msgErro(e) {
  const m = String(e?.message || e?.error_description || e?.error || e || '');
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para fazer isso.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem internet ou servidor fora do ar. Tente de novo.';
  if (/duplicate key.*whatsapp/i.test(m)) return 'Já existe um contato com esse WhatsApp.';
  if (/duplicate key.*atalho|mensagens_rapidas_user_id_atalho/i.test(m)) return 'Você já tem um atalho com esse nome.';
  if (/duplicate key/i.test(m)) return 'Já existe um registro igual.';
  if (/JWT expired|invalid jwt/i.test(m)) return 'Sua sessão expirou. Entre de novo.';
  return m || 'Algo deu errado. Tente de novo.';
}
export function falhou(e) { console.error(e); toast(msgErro(e), true); }

/* ---------- banco ---------- */
export async function q(promessa) {
  const { data, error } = await promessa;
  if (error) throw error;
  return data;
}
export async function buscarTudo(tabela, filtro, sel = '*', ordem = 'criado_em') {
  const out = []; const tam = 1000;
  for (let ini = 0; ; ini += tam) {
    let qq = S.sb.from(tabela).select(sel);
    if (ordem) qq = qq.order(ordem, { ascending: true });
    qq = qq.range(ini, ini + tam - 1);
    if (filtro) qq = filtro(qq);
    const data = await q(qq);
    out.push(...data);
    if (data.length < tam) break;
  }
  return out;
}
export const rpc = (fn, args) => q(S.sb.rpc(fn, args));

// chamada aos servidores /api (com o login do usuário)
export async function api(rota, body, metodo = 'POST') {
  const { data } = await S.sb.auth.getSession();
  const r = await fetch('/api/' + rota, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (data.session?.access_token || '') },
    body: metodo === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
  return j;
}

/* ---------- arquivos ---------- */
const urlCache = new Map();
export async function urlArquivo(path) {
  if (!path) return '';
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const { data, error } = await S.sb.storage.from('arquivos').createSignedUrl(path, 3600);
  if (error) return '';
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3500e3 });
  return data.signedUrl;
}
export async function urlsArquivos(paths) {
  const falta = [...new Set(paths.filter((p) => p && !(urlCache.get(p)?.exp > Date.now())))];
  if (falta.length) {
    const { data } = await S.sb.storage.from('arquivos').createSignedUrls(falta, 3600);
    for (const d of data || []) if (d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: Date.now() + 3500e3 });
  }
  return Object.fromEntries(paths.map((p) => [p, urlCache.get(p)?.url || '']));
}
export const nomeSeguro = (n) => String(n || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80);
export async function enviarArquivo(pasta, file) {
  const path = `${S.empresaId}/${pasta}/${uid()}-${nomeSeguro(file.name)}`;
  const { error } = await S.sb.storage.from('arquivos').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
  return path;
}
export function tipoMidia(mime) {
  if (/^image\//.test(mime)) return 'imagem';
  if (/^video\//.test(mime)) return 'video';
  if (/^audio\//.test(mime)) return 'audio';
  return 'documento';
}

/* ---------- janela (diálogo) ---------- */
const dlg = () => $('#dlg'); const form = () => $('#dlgForm');
export function rodape(opts = {}) {
  const { excluir = false, salvar = 'Salvar', extra = '', cancelar = 'Cancelar' } = opts;
  return `<div class="err" id="f-err" hidden></div><div class="dlg-actions">${excluir ? '<button type="button" class="btn danger" id="f-del">Excluir</button>' : ''}${extra}
    <div class="r">${cancelar ? `<button type="button" class="btn" id="f-cancel">${cancelar}</button>` : ''}${salvar ? `<button type="submit" class="btn pri" id="f-save">${salvar}</button>` : ''}</div></div>`;
}
export function erroForm(e) { const el = $('#f-err'); if (!el) return falhou(e); el.textContent = msgErro(e); el.hidden = false; const b = $('#f-save'); if (b) b.disabled = false; }
export function fechar() { if (dlg().open) dlg().close(); }
// abre uma janela; onSubmit recebe os campos do formulário
export function abrir(html, onSubmit, onDelete, opts = {}) {
  const d = dlg(), f = form();
  d.classList.toggle('largo', !!opts.largo);
  f.innerHTML = html;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const inval = f.querySelector(':invalid');
    if (inval) { inval.reportValidity?.(); inval.focus(); return; }
    const b = $('#f-save'); if (b) b.disabled = true;
    try {
      const dados = Object.fromEntries(new FormData(f).entries());
      const r = await onSubmit?.(dados, f);
      if (r !== false) fechar(); else if (b) b.disabled = false;
    } catch (er) { erroForm(er); }
  };
  const c = $('#f-cancel'); if (c) c.onclick = () => fechar();
  const del = $('#f-del');
  if (del && onDelete) del.onclick = async () => {
    if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Clique de novo para excluir'; return; }
    try { await onDelete(); fechar(); } catch (er) { erroForm(er); }
  };
  if (!d.open) d.showModal();
  const primeiro = f.querySelector('[autofocus]') || f.querySelector('input:not([type=hidden]):not([type=checkbox]),textarea,select');
  if (primeiro && !opts.semFoco) setTimeout(() => primeiro.focus(), 30);
  return f;
}
export function confirmar(titulo, texto, botao = 'Confirmar', perigo = false) {
  return new Promise((ok) => {
    abrir(`<h3>${esc(titulo)}</h3><p class="hint" style="font-size:15px;color:var(--ink)">${esc(texto)}</p>
      <div class="dlg-actions"><div class="r"><button type="button" class="btn" id="f-cancel">Cancelar</button>
      <button type="submit" class="btn ${perigo ? 'danger' : 'pri'}" id="f-save">${esc(botao)}</button></div></div>`,
    () => { ok(true); }, null, { semFoco: true });
    const c = $('#f-cancel'); c.onclick = () => { ok(false); fechar(); };
    dlg().addEventListener('close', () => ok(false), { once: true });
  });
}

/* ---------- menu flutuante ---------- */
let popDono = null;
export function fecharPop() { const p = $('#pop'); p.hidden = true; p.innerHTML = ''; popDono = null; }
export function pop(anchor, html, onClick, opts = {}) {
  const p = $('#pop');
  if (popDono === anchor && !p.hidden) { fecharPop(); return null; }
  p.innerHTML = html; p.hidden = false; p.className = 'pop ' + (opts.cls || ''); popDono = anchor;
  const r = anchor.getBoundingClientRect(); const pw = p.offsetWidth, ph = p.offsetHeight;
  let left = opts.alinhar === 'esq' ? r.left : r.right - pw;
  left = Math.max(8, Math.min(left, innerWidth - pw - 8));
  let top = r.bottom + 6; if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  p.style.left = left + 'px'; p.style.top = top + 'px';
  p.onclick = (e) => { const b = e.target.closest('[data-mi]'); if (b) { const v = b.dataset.mi; if (!opts.manter) fecharPop(); onClick?.(v, b, e); } };
  (p.querySelector('[data-mi], input, button') || p).focus?.();
  return p;
}
// itens: [valor, rótulo, ícone?, classe?] ou '-' para separador
export function menu(anchor, itens, onClick, opts) {
  const html = itens.filter(Boolean).map((i) => i === '-' ? '<hr>' : `<button type="button" class="mi ${i[3] || ''}" data-mi="${esc(i[0])}">${i[2] ? icon(i[2]) : ''}<span>${esc(i[1])}</span></button>`).join('');
  return pop(anchor, html, onClick, opts);
}
document.addEventListener('mousedown', (e) => { if (popDono && !e.target.closest('#pop') && !popDono.contains(e.target)) fecharPop(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && popDono) { const d = popDono; fecharPop(); d.focus?.(); } });

/* ---------- eventos entre telas (tempo real) ---------- */
const ouvintes = new Map();
export function ouvir(tipo, fn) { if (!ouvintes.has(tipo)) ouvintes.set(tipo, new Set()); ouvintes.get(tipo).add(fn); return () => ouvintes.get(tipo).delete(fn); }
export function emitir(tipo, dado) { for (const fn of ouvintes.get(tipo) || []) { try { fn(dado); } catch (e) { console.error(e); } } }

/* ---------- campos reaproveitados ---------- */
export function opcoesPessoas(sel, lista) {
  const ps = (lista || minhaEquipe()).filter((p) => p.ativo || p.id === sel).slice().sort(ordPessoa);
  return ps.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome || p.email)}${p.ativo ? '' : ' (desativado)'}</option>`).join('');
}
export function campoResponsavel(sel, nome = 'responsavel_id') {
  if (!lider()) return '';
  return `<div class="field"><label for="f-resp">Responsável</label><select id="f-resp" name="${nome}" required>${opcoesPessoas(sel)}</select></div>`;
}
export const responsavelPadrao = () => (atende() ? S.me.id : (minhaEquipe().find((p) => p.ativo)?.id || ''));
export function etiquetaHtml(e) { return e ? `<span class="etq" title="${esc(e.categoria)}"><i style="background:${esc(e.cor)}"></i>${esc(e.nome)}</span>` : ''; }
export const etiqueta = (id) => S.etiquetas.find((e) => e.id === id);

// som curto para avisos
let audioCtx;
export function bip() {
  if (S.me?.prefs?.som === false) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.0001;
    o.connect(g); g.connect(audioCtx.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    o.stop(audioCtx.currentTime + 0.4);
  } catch (e) {}
}
export function baixarCsv(nome, linhas) {
  const csv = linhas.map((l) => l.map((c) => { const s = String(c ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
