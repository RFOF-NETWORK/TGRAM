// TGRAM-Wächter: read-only health checks. It never writes, signs or sends anything,
// so it can run for anyone at any time without being able to break the network.
const { latestTx, liteserverCount } = require("./_liteserver");
const { VAULT } = require("./_economy");

const ALLOWED_ORIGINS = ["https://rfof-network.github.io", "https://tgram-tau.vercel.app"];
const NETS = {
  mainnet: { base: "https://toncenter.com/api/v3", key: process.env.TONCENTER_MAINNET_API_KEY },
  testnet: { base: "https://testnet.toncenter.com/api/v3", key: process.env.TONCENTER_TESTNET_API_KEY },
};

async function timed(fn) {
  const t = Date.now();
  try { return { ok: true, ms: Date.now() - t, ...(await fn()) }; }
  catch (e) { return { ok: false, ms: Date.now() - t, detail: String(e.message || e).slice(0, 120) }; }
}

async function toncenter(net) {
  const { base, key } = NETS[net];
  const r = await fetch(`${base}/masterchainInfo`, { headers: key ? { "X-API-Key": key } : {}, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return { detail: `Block ${j.last?.seqno ?? "?"}`, apiKey: Boolean(key) };
}

async function telegram(method) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN fehlt");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { signal: AbortSignal.timeout(6000) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || "Telegram-Fehler");
  return j.result;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).end();

  const words = String(process.env.BOT_WALLET_MNEMONIC || "").trim().split(/\s+/).filter(Boolean);
  const [main, test, lite, bot, stars] = await Promise.all([
    timed(() => toncenter("mainnet")),
    timed(() => toncenter("testnet")),
    timed(async () => {
      if (!liteserverCount) throw new Error("keine Liteserver konfiguriert");
      const tx = await latestTx(VAULT);
      return { detail: `${liteserverCount} Server, ${tx ? "Transaktion gelesen" : "erreichbar"}` };
    }),
    timed(async () => ({ detail: "@" + (await telegram("getMe")).username })),
    timed(async () => ({ detail: `${(await telegram("getMyStarBalance")).amount ?? 0} Stars` })),
  ]);

  const checks = [
    { id: "toncenter-mainnet", name: "Toncenter Mainnet", ...main, hint: main.apiKey ? undefined : "TONCENTER_MAINNET_API_KEY fehlt (1 RPS ohne Key)" },
    { id: "toncenter-testnet", name: "Toncenter Testnet", ...test, hint: test.apiKey ? undefined : "TONCENTER_TESTNET_API_KEY fehlt (1 RPS ohne Key)" },
    { id: "liteserver", name: "Eigene Liteserver", ...lite },
    { id: "telegram-bot", name: "Telegram-Bot", ...bot },
    { id: "telegram-stars", name: "Telegram Stars (Bot-Saldo)", ...stars },
    { id: "bot-wallet", name: "Bot-Wallet (Seed)", ok: words.length === 24, detail: words.length === 24 ? "24 Wörter" : `ungültig (${words.length} Wörter statt 24)` },
  ];
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
  return res.status(200).json({ checkedAt: new Date().toISOString(), ok: checks.every(c => c.ok), checks });
};
