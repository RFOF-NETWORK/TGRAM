// TGRAM Copilot API: used by the website/Mini App and by the Termux bot (agent-to-agent).
// POST { subject: "<telegram-id or wallet>", prompt: "...", kind?: "ai"|"command"|"game" }
const { PRICING, balance, charge, paymentLink, askAI, VAULT, ledger, explorerLinks, accountLinks } = require("./_economy");

// Latest on-chain transaction of the subject (or the bot vault) for the explorer footer.
async function txInfo(subject) {
  let latest = null;
  try { latest = (await ledger(subject)).txs[0] || null; } catch {}
  if (latest) return { kind: "tx", ...latest, links: explorerLinks(latest.hash) };
  return { kind: "vault", address: VAULT, links: accountLinks(VAULT) };
}

const ALLOWED_ORIGINS = ["https://rfof-network.github.io", "https://tgram-tau.vercel.app"];

module.exports = async (req, res) => {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    const subject = String(req.query?.subject || "").slice(0, 128);
    if (!subject) return res.status(200).json({ pricing: PRICING });
    return res.status(200).json({ pricing: PRICING, ...(await balance(subject)), pay: paymentLink(subject) });
  }
  if (req.method !== "POST") return res.status(405).end();

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const subject = String(body.subject || "").slice(0, 128);
  const prompt = String(body.prompt || "").slice(0, 4000);
  const kind = ["ai", "command", "game"].includes(body.kind) ? body.kind : "ai";
  if (!subject) return res.status(401).json({ error: "connect_required" });

  const c = await charge(subject, kind);
  if (!c.ok) return res.status(402).json({ error: "insufficient_credits", ...c, pay: paymentLink(subject) });
  if (kind !== "ai") return res.status(200).json({ ok: true, ...c });
  if (!prompt) return res.status(400).json({ error: "prompt_required" });
  const [answer, tx] = await Promise.all([askAI(prompt), txInfo(subject)]);
  return res.status(200).json({ ok: true, answer, tx, ...c });
};
