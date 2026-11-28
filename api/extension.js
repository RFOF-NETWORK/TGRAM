// KI-Extension API: every Telegram user can create their own extension of the TGRAM AI
// (name + persona). The user is identified only through Telegram's signed initData,
// so nobody can read or overwrite another user's extension.
const crypto = require("crypto");
const userdb = require("./_userdb");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ALLOWED_ORIGINS = ["https://rfof-network.github.io", "https://tgram-tau.vercel.app"];
const MAX_AGE_S = 24 * 3600;
const EXT_KEY = "ai_extension";

function verifyInitData(initData) {
  if (!TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const expected = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (expected.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null;
  if (Date.now() / 1000 - Number(params.get("auth_date") || 0) > MAX_AGE_S) return null;
  try {
    return JSON.parse(params.get("user") || "null");
  } catch {
    return null;
  }
}

function parseExtension(row) {
  if (!row) return null;
  try {
    return { ...JSON.parse(row.value.text), updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

async function getExtension(uid) {
  return parseExtension(await userdb.getData(uid, EXT_KEY));
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
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

  try {
    await userdb.touchUser(user);
    if (body.action === "get") return res.status(200).json({ ok: true, extension: await getExtension(user.id) });
    if (body.action === "save") {
      const name = String(body.name || "").trim().slice(0, 40);
      const persona = String(body.persona || "").trim().slice(0, 1200);
      if (name.length < 2 || persona.length < 10) return res.status(400).json({ error: "name_and_persona_required" });
      await userdb.setData(user.id, EXT_KEY, JSON.stringify({ name, persona, base: "TGRAM Copilot" }));
      await userdb.logEvent(user.id, "extension_saved", { meta: { name } });
      return res.status(200).json({ ok: true, extension: await getExtension(user.id) });
    }
    return res.status(400).json({ error: "unknown_action" });
  } catch (e) {
    console.error("extension", e.message);
    return res.status(500).json({ error: "storage_failed" });
  }
};

module.exports.getExtension = getExtension;
module.exports.verifyInitData = verifyInitData;
