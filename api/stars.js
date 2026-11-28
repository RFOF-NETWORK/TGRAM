// Telegram Stars (XTR) of @toncoing_bot via the Bot Payments API. MAJOR is a separate TON jetton, loaded in the frontend.
// https://core.telegram.org/bots/payments-stars — read-only (getMyStarBalance, getStarTransactions).
const ALLOWED_ORIGINS = ["https://rfof-network.github.io", "https://tgram-tau.vercel.app"];

async function tg(method, params = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN fehlt");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || "Telegram-Fehler");
  return j.result;
}

const partnerType = p => (p && p.type) || "unbekannt";

module.exports = async (req, res) => {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).end();

  try {
    const [bal, txs] = await Promise.all([
      tg("getMyStarBalance"),
      tg("getStarTransactions", { limit: 50 }),
    ]);
    const transactions = (txs.transactions || []).map(t => ({
      id: t.id,
      amount: t.amount,
      date: t.date,
      direction: t.source ? "in" : "out",
      partner: partnerType(t.source || t.receiver),
    }));
    const earned = transactions.filter(t => t.direction === "in").reduce((s, t) => s + t.amount, 0);
    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
    return res.status(200).json({ balance: bal.amount ?? 0, earned, transactions });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e).slice(0, 160) });
  }
};
