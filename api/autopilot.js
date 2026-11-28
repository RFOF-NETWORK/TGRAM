// Wallet-KI Autopilot: runs on a schedule without any user present.
// It only reads (vault, liteservers, bot wallet, database) and reports. It never signs
// or sends funds, so a bug or a leaked trigger cannot move money.
const { latestTx, liteserverCount } = require("./_liteserver");
const { VAULT } = require("./_economy");
const userdb = require("./_userdb");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TRIGGER_SECRETS = [process.env.CRON_SECRET, process.env.TELEGRAM_WEBHOOK_SECRET].filter(Boolean);

function authorized(req) {
  const auth = req.headers.authorization || "";
  const header = req.headers["x-tgram-secret"] || "";
  return TRIGGER_SECRETS.some(s => auth === `Bearer ${s}` || header === s);
}

async function step(id, name, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    return { id, name, ok: true, detail, ms: Date.now() - t };
  } catch (e) {
    return { id, name, ok: false, detail: String(e.message || e).slice(0, 200), ms: Date.now() - t };
  }
}

async function notifyAdmin(text) {
  const adminId = await userdb.adminId().catch(() => null);
  if (!TOKEN || !adminId) return false;
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: adminId, text }),
  });
  return r.ok;
}

module.exports = async (req, res) => {
  if (req.headers["x-vercel-oidc-token"]) process.env.VERCEL_OIDC_TOKEN = req.headers["x-vercel-oidc-token"];
  if (!authorized(req)) return res.status(401).json({ error: "unauthorized" });

  const words = (process.env.BOT_WALLET_MNEMONIC || "").trim().split(/\s+/).filter(Boolean);
  const steps = await Promise.all([
    step("vault", "Vault letzte Transaktion", async () => {
      const tx = await latestTx(VAULT);
      if (!tx) throw new Error("keine Transaktion gefunden");
      return tx.hash ? `${tx.hash.slice(0, 12)}...` : "ok";
    }),
    step("liteservers", "Liteserver erreichbar", async () => `${await liteserverCount()} Server`),
    step("bot-wallet", "Bot-Wallet Seed", async () => {
      if (words.length !== 24) throw new Error(`${words.length} statt 24 Wörter`);
      return "24 Wörter";
    }),
    step("database", "Nutzer-Datenbank", async () => {
      const s = await userdb.adminStats();
      return `${s.users} Nutzer, ${s.active24h} aktiv (24h)`;
    }),
    step("telegram", "Telegram Bot API", async () => {
      if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN fehlt");
      const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.description || "Fehler");
      if (d.result.last_error_message) throw new Error(`Webhook: ${d.result.last_error_message}`);
      return `${d.result.pending_update_count} offene Updates`;
    }),
  ]);

  const ok = steps.every(s => s.ok);
  const report = { ranAt: new Date().toISOString(), ok, steps };
  await userdb.saveAutopilotReport(report).catch(e => console.error("autopilot save", e.message));
  if (!ok) {
    const failed = steps.filter(s => !s.ok).map(s => `- ${s.name}: ${s.detail}`).join("\n");
    await notifyAdmin(`TGRAM Autopilot: Problem gefunden\n${failed}`).catch(() => {});
  }
  return res.status(200).json(report);
};
