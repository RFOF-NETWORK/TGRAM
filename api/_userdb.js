const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const ADMIN_USERNAME = "satoramy";
const KEY_RE = /^[a-z0-9_-]{1,64}$/;

async function rest(path, { method = "GET", body, prefer } = {}) {
  if (!URL || !KEY) throw new Error("Supabase not configured");
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const idOf = uid => {
  const n = Number(uid);
  if (!Number.isSafeInteger(n)) throw new Error("invalid tg id");
  return n;
};

async function touchUser(from) {
  const tg_id = idOf(from.id);
  const [user] = await rest("tg_users?on_conflict=tg_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: { tg_id, username: from.username || null, first_name: from.first_name || null, last_seen: new Date().toISOString() },
  });
  if (user.role !== "admin" && (from.username || "").toLowerCase() === ADMIN_USERNAME) {
    const existing = await rest("tg_users?role=eq.admin&select=tg_id");
    if (!existing.length) {
      const [promoted] = await rest(`tg_users?tg_id=eq.${tg_id}`, { method: "PATCH", prefer: "return=representation", body: { role: "admin" } });
      return promoted;
    }
  }
  return user;
}

// AI points are an AXF-backed claim on Stars. They only turn into stars_earned
// once real AXF has bought real Stars (settleStars), never on interaction alone.
async function logEvent(uid, kind, { chars = 0, points = 0, meta = {} } = {}) {
  const id = idOf(uid);
  await rest("tg_events", { method: "POST", body: { tg_id: id, kind, chars, stars: 0, meta: { ...meta, points } } });
  if (points) {
    const [u] = await rest(`tg_users?tg_id=eq.${id}&select=ai_points`);
    await rest(`tg_users?tg_id=eq.${id}`, { method: "PATCH", body: { ai_points: Number(u?.ai_points || 0) + points } });
  }
}

async function settleStars(uid, stars, axfSpent) {
  const id = idOf(uid);
  const [u] = await rest(`tg_users?tg_id=eq.${id}&select=ai_points,stars_earned`);
  if (!u || Number(u.ai_points) < stars) throw new Error("not enough AI points");
  await rest(`tg_users?tg_id=eq.${id}`, {
    method: "PATCH",
    body: { ai_points: Number(u.ai_points) - stars, stars_earned: u.stars_earned + stars },
  });
  await rest("tg_events", { method: "POST", body: { tg_id: id, kind: "settle", stars, meta: { axf_spent: axfSpent } } });
}

async function setData(uid, key, text) {
  if (!KEY_RE.test(key)) throw new Error("bad key");
  await rest("tg_user_data?on_conflict=tg_id,key", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: { tg_id: idOf(uid), key, value: { text: String(text).slice(0, 4000) }, updated_at: new Date().toISOString() },
  });
}

async function getData(uid, key) {
  if (!KEY_RE.test(key)) return null;
  const [row] = await rest(`tg_user_data?tg_id=eq.${idOf(uid)}&key=eq.${encodeURIComponent(key)}&select=value,updated_at`);
  return row || null;
}

async function myOverview(uid) {
  const id = idOf(uid);
  const [[user], keys, events] = await Promise.all([
    rest(`tg_users?tg_id=eq.${id}&select=role,stars_earned,axf_minted,ai_points,created_at`),
    rest(`tg_user_data?tg_id=eq.${id}&select=key&order=key`),
    rest(`tg_events?tg_id=eq.${id}&select=chars`),
  ]);
  return {
    role: user?.role || "user",
    stars: user?.stars_earned || 0,
    axf: Number(user?.axf_minted || 0),
    points: Number(user?.ai_points || 0),
    since: user?.created_at,
    keys: keys.map(k => k.key),
    messages: events.length,
    chars: events.reduce((s, e) => s + e.chars, 0),
  };
}

async function deleteMe(uid) {
  await rest(`tg_users?tg_id=eq.${idOf(uid)}`, { method: "DELETE" });
}

async function isAdmin(uid) {
  const [u] = await rest(`tg_users?tg_id=eq.${idOf(uid)}&select=role`);
  return u?.role === "admin";
}

async function adminStats() {
  const [users, events] = await Promise.all([
    rest("tg_users?select=tg_id,stars_earned,axf_minted,ai_points,last_seen"),
    rest("tg_events?select=chars,stars"),
  ]);
  const dayAgo = Date.now() - 864e5;
  return {
    users: users.length,
    active24h: users.filter(u => Date.parse(u.last_seen) > dayAgo).length,
    stars: users.reduce((s, u) => s + u.stars_earned, 0),
    axf: users.reduce((s, u) => s + Number(u.axf_minted), 0),
    points: users.reduce((s, u) => s + Number(u.ai_points), 0),
    messages: events.length,
    chars: events.reduce((s, e) => s + e.chars, 0),
  };
}

async function adminId() {
  const [u] = await rest("tg_users?role=eq.admin&select=tg_id&order=created_at&limit=1");
  return u?.tg_id || null;
}

async function saveAutopilotReport(report) {
  const id = await adminId();
  if (id) await setData(id, "autopilot_report", JSON.stringify(report));
}

module.exports = { touchUser, logEvent, settleStars, setData, getData, myOverview, deleteMe, isAdmin, adminStats, adminId, saveAutopilotReport, KEY_RE };
