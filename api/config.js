// Entrega para o navegador o endereço do Supabase e a chave pública (anon).
// A chave pública é feita para ficar no navegador: quem protege os dados
// são as regras de acesso do banco (supabase/schema.sql).
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return res.status(500).json({ erro: 'Cadastre SUPABASE_URL e SUPABASE_ANON_KEY na Vercel.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ url, anonKey });
}
