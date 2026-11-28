// Public, browser-safe runtime config for static pages (GitHub Pages, Vercel).
// Only publishable values are returned here; secret and service-role keys never leave the server.
const ALLOWED_ORIGINS = ["https://rfof-network.github.io", "https://tgram-tau.vercel.app"];

module.exports = (req, res) => {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).end();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: "Supabase ist nicht konfiguriert" });
  }

  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  return res.status(200).json({ supabaseUrl, supabaseKey });
};
