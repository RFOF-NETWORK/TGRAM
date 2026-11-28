// TLPFG launches: every Jetton launched through the TGRAM Launchpad trades on STON.fi
// from day one. It graduates to DeDust once its pooled liquidity reaches DEDUST_MIN_USD.
// Liquidity is read live from GeckoTerminal; nothing here is estimated.
const userdb = require("./_userdb");
const { verifyInitData } = require("./extension");

const ALLOWED_ORIGINS = ["https://rfof-network.github.io", "https://tgram-tau.vercel.app"];
const DEDUST_MIN_USD = 10000;
const ADDRESS_RE = /^(?:[EUk0][Qf][A-Za-z0-9_-]{46}|-?\d:[0-9a-fA-F]{64})$/;

async function liquidity(address) {
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/ton/tokens/${encodeURIComponent(address)}/pools`);
    if (!r.ok) return { stonfi: 0, dedust: 0, stonfiPool: null, dedustPool: null };
    const pools = (await r.json()).data || [];
    const out = { stonfi: 0, dedust: 0, stonfiPool: null, dedustPool: null };
    for (const p of pools) {
      const dex = p.relationships?.dex?.data?.id || "";
      const tvl = Number(p.attributes?.reserve_in_usd || 0);
      const side = dex.startsWith("stonfi") ? "stonfi" : dex.startsWith("dedust") ? "dedust" : null;
      if (!side) continue;
      out[side] += tvl;
      out[side + "Pool"] ||= p.attributes?.address || null;
    }
    return out;
  } catch {
    return { stonfi: 0, dedust: 0, stonfiPool: null, dedustPool: null };
  }
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const rows = await userdb.rest("tlpfg_launches?select=jetton_address,symbol,name,created_at&order=created_at.desc&limit=50");
      const launches = await Promise.all(
        rows.map(async row => {
          const l = await liquidity(row.jetton_address);
          const total = l.stonfi + l.dedust;
          return { ...row, liquidityUsd: { stonfi: l.stonfi, dedust: l.dedust, total }, stonfiPool: l.stonfiPool, dedustPool: l.dedustPool, dedustReady: total >= DEDUST_MIN_USD };
        }),
      );
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120");
      return res.status(200).json({ ok: true, dedustMinUsd: DEDUST_MIN_USD, launches });
    }
    if (req.method !== "POST") return res.status(405).end();

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const user = verifyInitData(String(body.initData || ""));
    if (!user?.id) return res.status(401).json({ error: "telegram_login_required" });
    const address = String(body.address || "").trim();
    const symbol = String(body.symbol || "").trim().toUpperCase().slice(0, 8);
    const name = String(body.name || "").trim().slice(0, 40);
    if (!ADDRESS_RE.test(address) || !/^[A-Z0-9]{1,8}$/.test(symbol) || name.length < 2) return res.status(400).json({ error: "invalid_launch" });

    await userdb.touchUser(user);
    await userdb.rest("tlpfg_launches?on_conflict=jetton_address", {
      method: "POST",
      prefer: "resolution=ignore-duplicates",
      body: { jetton_address: address, symbol, name, launcher_tg_id: Number(user.id) },
    });
    await userdb.logEvent(user.id, "tlpfg_launch", { meta: { address, symbol } });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("launches", e.message);
    return res.status(500).json({ error: "launches_failed" });
  }
};
