// KI-Trader: reads the candles the Mini App already shows and returns a perpetual-futures
// signal (LONG / SHORT / HOLD). It never holds keys or moves funds; every order is opened
// on Storm Trade and signed by the user's own wallet.
const { askAI } = require("./_economy");
const userdb = require("./_userdb");
const { verifyInitData } = require("./extension");

const ALLOWED_ORIGINS = ["https://rfof-network.github.io", "https://tgram-tau.vercel.app"];
const PAIRS = new Set(["TON", "NEC", "BBC", "AXF"]);

function parseSignal(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  try {
    const j = JSON.parse(m ? m[0] : text);
    const signal = ["LONG", "SHORT", "HOLD"].includes(String(j.signal).toUpperCase()) ? String(j.signal).toUpperCase() : "HOLD";
    const leverage = Math.min(5, Math.max(1, Math.round(Number(j.leverage) || 1)));
    const confidence = Math.min(100, Math.max(0, Math.round(Number(j.confidence) || 0)));
    return { signal, leverage, confidence, reason: String(j.reason || "").slice(0, 280) };
  } catch {
    return { signal: "HOLD", leverage: 1, confidence: 0, reason: "Keine eindeutige Analyse." };
  }
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return res.status(400).json({ error: "bad_json" });
  }
  const user = verifyInitData(String(body.initData || ""));
  if (!user?.id) return res.status(401).json({ error: "telegram_login_required" });
  const pair = String(body.pair || "").toUpperCase();
  if (!PAIRS.has(pair)) return res.status(400).json({ error: "unknown_pair" });
  const candles = (Array.isArray(body.candles) ? body.candles : [])
    .slice(-48)
    .map(c => (Array.isArray(c) ? c.slice(0, 5).map(Number) : []))
    .filter(c => c.length === 5 && c.every(Number.isFinite));
  if (candles.length < 10) return res.status(400).json({ error: "not_enough_candles" });

  const prompt =
    `Analysiere ${pair} fuer Perpetual Futures. Kerzen [zeit,open,high,low,close], aelteste zuerst:\n` +
    JSON.stringify(candles.map(([t, o, h, l, c]) => [t, +o.toPrecision(6), +h.toPrecision(6), +l.toPrecision(6), +c.toPrecision(6)])) +
    `\nAntworte NUR mit JSON: {"signal":"LONG|SHORT|HOLD","leverage":1-5,"confidence":0-100,"reason":"max 2 Saetze"}. ` +
    `Sei konservativ: bei unklarem Trend HOLD.`;
  try {
    const result = parseSignal(await askAI(prompt));
    await userdb.touchUser(user);
    await userdb.logEvent(user.id, "ai_trade_signal", { chars: result.reason.length, meta: { pair, ...result } });
    return res.status(200).json({ ok: true, pair, ...result });
  } catch (e) {
    console.error("ai-trader", e.message);
    return res.status(502).json({ error: "ai_failed" });
  }
};
