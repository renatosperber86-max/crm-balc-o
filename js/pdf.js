// Gerador de PDF simples (sem bibliotecas externas): texto, linhas e retângulos em páginas A4.
// Usa as fontes padrão Helvetica e Helvetica-Bold, que todo leitor de PDF já tem.

const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

// troca caracteres fora do padrão WinAnsi (emojis etc.)
function limpar(s) {
  return String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/•/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}
function largura(s, tam, negrito) {
  const t = negrito ? W_BOLD : W_REG; let w = 0;
  for (const ch of limpar(s)) {
    const c = ch.charCodeAt(0);
    const base = c >= 32 && c <= 126 ? c : ch.normalize('NFD').charCodeAt(0);
    w += t[(base >= 32 && base <= 126 ? base : 97) - 32];
  }
  return (w * tam) / 1000;
}
const esc = (s) => limpar(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const cor = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(' '); };

export class Pdf {
  constructor() { this.W = 595.28; this.H = 841.89; this.paginas = []; this.novaPagina(); }
  novaPagina() { this.ops = []; this.paginas.push(this.ops); return this; }
  // y conta de cima para baixo (mais fácil de pensar)
  texto(s, x, y, o = {}) {
    const tam = o.tam || 10, neg = !!o.negrito;
    let xx = x;
    if (o.alinhar === 'dir') xx = x - largura(s, tam, neg);
    if (o.alinhar === 'centro') xx = x - largura(s, tam, neg) / 2;
    this.ops.push(`BT /${neg ? 'F2' : 'F1'} ${tam} Tf ${cor(o.cor || '#15302b')} rg ${xx.toFixed(2)} ${(this.H - y).toFixed(2)} Td (${esc(s)}) Tj ET`);
    return this;
  }
  // quebra o texto em linhas que cabem na largura; devolve as linhas
  quebrar(s, larg, tam = 10, neg = false) {
    const out = [];
    for (const par of limpar(s).split(/\r?\n/)) {
      let linha = '';
      for (const p of par.split(' ')) {
        const t = linha ? linha + ' ' + p : p;
        if (largura(t, tam, neg) > larg && linha) { out.push(linha); linha = p; } else linha = t;
      }
      out.push(linha);
    }
    return out;
  }
  linha(x1, y1, x2, y2, o = {}) { this.ops.push(`${cor(o.cor || '#d8e0dd')} RG ${o.esp || 0.8} w ${x1.toFixed(2)} ${(this.H - y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.H - y2).toFixed(2)} l S`); return this; }
  ret(x, y, w, h, o = {}) { this.ops.push(`${cor(o.cor || '#f1f4f3')} rg ${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); return this; }
  blob() {
    const objs = []; const add = (s) => { objs.push(s); return objs.length; };
    const catalogo = add(''), paginasRef = add('');
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const ops of this.paginas) {
      const conteudo = ops.join('\n');
      const c = add(`<< /Length ${latin1(conteudo).length} >>\nstream\n${conteudo}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${paginasRef} 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
    }
    objs[catalogo - 1] = `<< /Type /Catalog /Pages ${paginasRef} 0 R >>`;
    objs[paginasRef - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(latin1(pdf).length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = latin1(pdf).length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([latin1(pdf)], { type: 'application/pdf' });
  }
}
function latin1(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b; }
export { largura };
