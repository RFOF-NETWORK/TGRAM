// Paper perpetuals: simulated LONG/SHORT positions with up to 5x leverage on live prices.
// No funds move. Entry and exit prices are always fetched here on the server, never taken
// from the client, so results reflect the real market. Real orders go through Storm Trade.
const { rest } = require("./_userdb");
const userdb = require("./_userdb");
const { verifyInitData } = require("./extension");

const ALLOWED_ORIGINS = ["https://rfof-network.github.io", "https://tgram-tau.vercel.app"];
const PAIRS = new Set(["TON", "NEC", "BBC", "AXF"]);
const ADDRESS_RE = /^(?:[EUk0][Qf][A-Za-z0-9_-]{46}|-?\d:[0-9a-fA-F]{64})$/;
const START_BALANCE_USD = 1000;
const MAX_OPEN = 5;

async function priceUsd(pair, master) {
  if (pair === "TON") {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd");
    const p = Number((await r.json())["the-open-network"]?.usd);
    if (!(p > 0)) throw new Error("no_price");
    return p;
  }
  const r = await fetch(`https://api.geckoterminal.com/api/v2/simple/networks/ton/token_price/${encodeURIComponent(master)}`);
  const prices = (await r.json()).data?.attributes?.token_prices || {};
  const p = Number(Object.values(prices)[0]);
  if (!(p > 0)) throw new Error("no_price");
  return p;
}

function pnlOf(pos, price) {
  const move = (price / Number(pos.entry_price) - 1) * (pos.side === "LONG" ? 1 : -1);
  return Math.max(-Number(pos.margin_usd), Number(pos.margin_usd) * pos.leverage * move);
}

async function overview(tgId) {
  const rows = await rest(`paper_positions?tg_id=eq.${tgId}&order=opened_at.desc&limit=50`);
  const open = rows.filter(r => !r.closed_at);
  const prices = new Map();
  for (const p of open) {
    const key = p.pair + (p.master || "");
    if (!prices.has(key)) prices.set(key, await priceUsd(p.pair, p.master).catch(() => null));
  }
  const realized = rows.filter(r => r.closed_at).reduce((s, r) => s + Number(r.pnl_usd || 0), 0);
  const locked = open.reduce((s, r) => s + Number(r.margin_usd), 0);
  const positions = rows.map(r => {
    const now = r.closed_at ? null : prices.get(r.pair + (r.master || ""));
    return { ...r, mark_price: now, live_pnl_usd: now ? pnlOf(r, now) : null };
  });
  return { balance_usd: START_BALANCE_USD + realized - locked, realized_usd: realized, positions };
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
  const tgId = Number(user.id);

  try {
    await userdb.touchUser(user);
    const action = String(body.action || "list");

    if (action === "open") {
      const pair = String(body.pair || "").toUpperCase();
      if (!PAIRS.has(pair)) return res.status(400).json({ error: "unknown_pair" });
      const master = pair === "TON" ? null : String(body.master || "");
      if (master !== null && !ADDRESS_RE.test(master)) return res.status(400).json({ error: "bad_master" });
      const side = String(body.side || "").toUpperCase();
      if (side !== "LONG" && side !== "SHORT") return res.status(400).json({ error: "bad_side" });
      const leverage = Math.round(Number(body.leverage));
      if (!(leverage >= 1 && leverage <= 5)) return res.status(400).json({ error: "bad_leverage" });
      const margin = Math.round(Number(body.margin) * 100) / 100;
      if (!(margin >= 1)) return res.status(400).json({ error: "bad_margin" });

      const state = await overview(tgId);
      if (state.positions.filter(p => !p.closed_at).length >= MAX_OPEN) return res.status(400).json({ error: "too_many_open" });
      if (margin > state.balance_usd) return res.status(400).json({ error: "insufficient_balance" });

      const entry = await priceUsd(pair, master);
      await rest("paper_positions", {
        method: "POST",
        prefer: "return=minimal",
        body: { tg_id: tgId, pair, master, side, leverage, margin_usd: margin, entry_price: entry },
      });
      await userdb.logEvent(user.id, "paper_open", { meta: { pair, side, leverage, margin, entry } });
    } else if (action === "close") {
      const id = Number(body.id);
      if (!Number.isSafeInteger(id)) return res.status(400).json({ error: "bad_id" });
      const [pos] = await rest(`paper_positions?id=eq.${id}&tg_id=eq.${tgId}&closed_at=is.null`);
      if (!pos) return res.status(404).json({ error: "not_found" });
      const exit = await priceUsd(pos.pair, pos.master);
      const pnl = pnlOf(pos, exit);
      await rest(`paper_positions?id=eq.${id}&tg_id=eq.${tgId}&closed_at=is.null`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: { exit_price: exit, pnl_usd: pnl, closed_at: new Date().toISOString() },
      });
      await userdb.logEvent(user.id, "paper_close", { meta: { id, exit, pnl } });
    }

    return res.status(200).json({ ok: true, ...(await overview(tgId)) });
  } catch (e) {
    console.error("paper-trade", e.message);
    return res.status(e.message === "no_price" ? 503 : 502).json({ error: e.message === "no_price" ? "no_price" : "paper_failed" });
  }
};
