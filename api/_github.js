// Per-user GitHub connection for the Telegram bot. Tokens are AES-256-GCM encrypted
// before they are written to tg_user_data under reserved "_" keys.
const crypto = require("crypto");
const userdb = require("./_userdb");

const CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const SECRET = process.env.TGRAM_GITHUB_ENC_KEY || process.env.SUPABASE_JWT_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || "";
const TOKEN_KEY = "_github";
const PENDING_KEY = "_github_pending";
const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const MAX_FILE = 60000;

const key = () => {
  if (!SECRET) throw new Error("Kein Verschluesselungs-Schluessel konfiguriert");
  return crypto.createHash("sha256").update("tgram-github:" + SECRET).digest();
};

function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString("base64")).join(".");
}

function open(text) {
  const [iv, tag, data] = String(text).split(".").map(s => Buffer.from(s, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString("utf8"));
}

async function load(uid) {
  const row = await userdb.getData(uid, TOKEN_KEY);
  if (!row) return null;
  try { return open(row.value.text); } catch { return null; }
}

const save = (uid, conn) => userdb.setData(uid, TOKEN_KEY, seal(conn));

async function gh(token, path, { method = "GET", body } = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "tgram-bot",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  const data = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${data?.message || t.slice(0, 200)}`);
  return data;
}

async function connectToken(uid, token) {
  const user = await gh(token, "/user");
  const prev = (await load(uid)) || {};
  await save(uid, { token, login: user.login, repo: prev.repo || null, via: "token" });
  return user.login;
}

async function startDevice(uid) {
  if (!CLIENT_ID) return null;
  const r = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: "repo" }),
  });
  const d = await r.json();
  if (!d.device_code) throw new Error(d.error_description || "Device-Login nicht moeglich");
  await userdb.setData(uid, PENDING_KEY, seal({ device_code: d.device_code, exp: Date.now() + d.expires_in * 1000 }));
  return { code: d.user_code, url: d.verification_uri };
}

async function finishDevice(uid) {
  const row = await userdb.getData(uid, PENDING_KEY);
  if (!row) return { ok: false, msg: "Kein offener Login. Starte mit /github connect." };
  const pending = open(row.value.text);
  if (Date.now() > pending.exp) return { ok: false, msg: "Code abgelaufen. Starte neu mit /github connect." };
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, device_code: pending.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }),
  });
  const d = await r.json();
  if (!d.access_token) {
    const wait = d.error === "authorization_pending" || d.error === "slow_down";
    return { ok: false, msg: wait ? "Noch nicht bestaetigt. Code auf GitHub eingeben, dann erneut tippen." : d.error_description || d.error };
  }
  await userdb.setData(uid, PENDING_KEY, seal({ done: true, exp: 0 }));
  const login = await connectToken(uid, d.access_token);
  const conn = await load(uid);
  await save(uid, { ...conn, via: "device" });
  return { ok: true, login };
}

async function logout(uid) {
  await userdb.setData(uid, TOKEN_KEY, seal({ disconnected: true }));
}

async function setRepo(uid, conn, repo) {
  if (!REPO_RE.test(repo)) throw new Error("Format: owner/repo");
  const r = await gh(conn.token, `/repos/${repo}`);
  if (!r.permissions?.push) throw new Error(`Kein Schreibzugriff auf ${r.full_name}`);
  await save(uid, { ...conn, repo: r.full_name, branch: r.default_branch });
  return r;
}

const cleanPath = p => String(p || "").replace(/^\/+/, "").replace(/\.\.+/g, ".");
const enc = p => p.split("/").map(encodeURIComponent).join("/");

async function list(conn, path) {
  const items = await gh(conn.token, `/repos/${conn.repo}/contents/${enc(cleanPath(path))}?ref=${encodeURIComponent(conn.branch)}`);
  if (!Array.isArray(items)) return [`${items.path} (Datei, ${items.size} Bytes)`];
  return items.map(i => (i.type === "dir" ? `${i.path}/` : i.path));
}

async function readFile(conn, path, ref = conn.branch) {
  const f = await gh(conn.token, `/repos/${conn.repo}/contents/${enc(cleanPath(path))}?ref=${encodeURIComponent(ref)}`);
  if (Array.isArray(f) || f.type !== "file") throw new Error("Kein Dateipfad");
  if (f.size > MAX_FILE) throw new Error(`Datei zu gross (${f.size} Bytes, max ${MAX_FILE})`);
  return { text: Buffer.from(f.content, "base64").toString("utf8"), sha: f.sha };
}

// Creates a new branch from the default branch, commits the change there and opens a PR.
// Nothing lands on the default branch until the user merges the PR.
async function proposeChange(conn, path, content, message) {
  const file = cleanPath(path);
  const base = await gh(conn.token, `/repos/${conn.repo}/git/ref/heads/${encodeURIComponent(conn.branch)}`);
  const branch = `tgram/${Date.now().toString(36)}`;
  await gh(conn.token, `/repos/${conn.repo}/git/refs`, { method: "POST", body: { ref: `refs/heads/${branch}`, sha: base.object.sha } });
  let sha;
  try { sha = (await readFile(conn, file, branch)).sha; } catch {}
  await gh(conn.token, `/repos/${conn.repo}/contents/${enc(file)}`, {
    method: "PUT",
    body: { message, content: Buffer.from(content, "utf8").toString("base64"), branch, ...(sha ? { sha } : {}) },
  });
  const pr = await gh(conn.token, `/repos/${conn.repo}/pulls`, {
    method: "POST",
    body: { title: message.slice(0, 120), head: branch, base: conn.branch, body: `Erstellt ueber @toncoing_bot fuer ${conn.login}.\n\nDatei: \`${file}\`` },
  });
  return { number: pr.number, url: pr.html_url, branch };
}

async function mergePR(conn, number) {
  const r = await gh(conn.token, `/repos/${conn.repo}/pulls/${number}/merge`, { method: "PUT", body: { merge_method: "squash" } });
  return r.sha;
}

const usable = conn => conn && conn.token && !conn.disconnected;

module.exports = { CLIENT_ID, load, usable, connectToken, startDevice, finishDevice, logout, setRepo, list, readFile, proposeChange, mergePR };
