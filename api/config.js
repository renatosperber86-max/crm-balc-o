// Entrega para o navegador o endereço do Supabase e a chave pública (anon).
// A chave pública é feita para ficar no navegador: quem protege os dados
// são as regras de acesso do banco (supabase/schema.sql).
export default function handler(req, res) {
  // Limpa o endereço: fica só "https://xxxx.supabase.co", mesmo que tenham
  // colado com barra, "/rest/v1/" ou espaço no final.
  const bruto = String(process.env.SUPABASE_URL || '').trim();
  const url = (bruto.match(/^https?:\/\/[^\/\s]+/i) || [''])[0];
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) {
    return res.status(500).json({ erro: 'Cadastre SUPABASE_URL e SUPABASE_ANON_KEY na Vercel.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ url, anonKey });
}
