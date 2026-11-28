// TGRAM Economy: shared by /api/telegram (bot) and /api/copilot (website).
// Credits are derived from on-chain payments to the TGRAM vault whose comment is
// "TGRAM:<telegram-id or wallet>". AI and commands are free; paid credits are value support.

const OWNER_ADDRESS = "UQDk-1Gqc4YIC22LTAAZLxomhkyp-V52B0yaeHgmk3t9Lli6";
// UQAHf2mw... was set as vault but does not belong to the owner; never route payments there.
const FOREIGN_ADDRESSES = new Set(["UQAHf2mwKFjEprwz5fBS5k5brROrldthRCz-CVi5eVm95EuN"]);
const envVault = (process.env.TON_MULTISIG_VAULT || "").trim();
const VAULT = envVault && !FOREIGN_ADDRESSES.has(envVault) ? envVault : OWNER_ADDRESS;
const TONCENTER = "https://toncenter.com/api/v3";
const { latestTx } = require("./_liteserver");

const PRICING = {
  creditsPerTon: 100,        // 1 TON  -> 100 credits
  creditsPerJetton: 1,       // 1 Jetton (NEC/BBC/AXF) -> 1 credit
  // AI, commands and game are free by default; credits are an optional value boost.
  // Set TGRAM_COST_AI / TGRAM_COST_COMMAND / TGRAM_COST_GAME > 0 to re-enable paid usage.
  cost: {
    ai: Number(process.env.TGRAM_COST_AI || 0),
    command: Number(process.env.TGRAM_COST_COMMAND || 0),
    game: Number(process.env.TGRAM_COST_GAME || 0),
  },
  dexFeePercent: 1,          // 1 % platform fee on DEX swaps
};

const usage = new Map(); // per-instance usage ledger; plug a DB here for multi-instance persistence

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Toncenter without an API key allows 1 request/second and answers the rest with 429.
async function fetchJson(url, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (r.status === 429 && attempt < retries) { await sleep(1100 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    return r.json();
  }
}

const VAULT_TTL_MS = 30_000;
let vaultCache = { at: 0, value: null, pending: null };
// One shared fetch of the vault's transactions per 30 s, used by every ledger and footer lookup.
async function vaultTransactions() {
  if (vaultCache.value && Date.now() - vaultCache.at < VAULT_TTL_MS) return vaultCache.value;
  if (vaultCache.pending) return vaultCache.pending;
  vaultCache.pending = fetchJson(`${TONCENTER}/transactions?account=${encodeURIComponent(VAULT)}&limit=256&sort=desc`)
    .then((d) => { vaultCache = { at: Date.now(), value: d.transactions || [], pending: null }; return vaultCache.value; })
    .catch((e) => { vaultCache.pending = null; if (vaultCache.value) return vaultCache.value; throw e; });
  return vaultCache.pending;
}

const toHex = (hash) => {
  if (!hash) return "";
  if (/^[0-9a-f]{64}$/i.test(hash)) return hash.toLowerCase();
  return Buffer.from(hash.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("hex");
};

const explorerLinks = (hash) => {
  const hex = toHex(hash);
  return hex ? { tonviewer: `https://tonviewer.com/transaction/${hex}`, tonscan: `https://tonscan.org/tx/${hex}` } : null;
};

const accountLinks = (address) =>
  address ? { tonviewer: `https://tonviewer.com/${address}`, tonscan: `https://tonscan.org/address/${address}` } : null;

const LEDGER_TTL_MS = 60_000;
const ledgerCache = new Map();

// Every vault payment tagged "TGRAM:<subject>", newest first, with its network fee.
async function ledger(subject) {
  const hit = ledgerCache.get(subject);
  if (hit && Date.now() - hit.at < LEDGER_TTL_MS) return hit.value;
  const tag = `TGRAM:${subject}`;
  const txs = [];
  let credits = 0;
  if (VAULT) {
    try {
      for (const t of await vaultTransactions()) {
        const msg = t.in_msg || {};
        const comment = msg.message_content?.decoded?.comment || "";
        if (comment.trim() !== tag) continue;
        const amount = Number(msg.value || 0) / 1e9;
        credits += amount * PRICING.creditsPerTon;
        txs.push({ hash: toHex(t.hash), token: "TON", amount, fee: Number(t.total_fees || 0) / 1e9, utime: t.now || 0 });
      }
    } catch {}
    try {
      const jt = await fetchJson(`${TONCENTER}/jetton/transfers?owner_address=${encodeURIComponent(VAULT)}&direction=in&limit=256&sort=desc`);
      for (const j of jt.jetton_transfers || []) {
        const comment = j.comment || j.forward_payload_comment || "";
        if (String(comment).trim() !== tag) continue;
        const amount = Number(j.amount || 0) / 1e9;
        credits += amount * PRICING.creditsPerJetton;
        txs.push({ hash: toHex(j.transaction_hash), token: "Jetton", amount, fee: null, utime: j.transaction_now || 0 });
      }
    } catch {}
  }
  txs.sort((a, b) => b.utime - a.utime);
  const value = { credits: Math.floor(credits), txs };
  ledgerCache.set(subject, { at: Date.now(), value });
  return value;
}

async function paidCredits(subject) {
  return (await ledger(subject)).credits;
}

// Telegram Stars (XTR) paid to @toncoing_bot. Telegram keeps the ledger, so no DB is needed:
// getStarTransactions lists every incoming Star payment with the paying user.
const STARS_PER_CREDIT = 1;
async function starCredits(subject) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !/^\d+$/.test(subject)) return 0;
  let stars = 0;
  try {
    for (let offset = 0; offset < 1000; offset += 100) {
      const r = await fetch(`https://api.telegram.org/bot${token}/getStarTransactions?offset=${offset}&limit=100`);
      const d = await r.json();
      const list = d.result?.transactions || [];
      for (const t of list) {
        if (t.source?.type === "user" && String(t.source.user?.id) === subject && t.source.invoice_payload === `TGRAM:${subject}`) stars += t.amount || 0;
      }
      if (list.length < 100) break;
    }
  } catch {}
  return Math.floor(stars / STARS_PER_CREDIT);
}

async function balance(subject) {
  const [ton, stars] = await Promise.all([paidCredits(subject), starCredits(subject)]);
  const paid = ton + stars;
  const used = usage.get(subject) || 0;
  return { paid, stars, used, available: Math.max(0, paid - used) };
}

async function charge(subject, kind) {
  const cost = PRICING.cost[kind] ?? 0;
  if (cost <= 0) return { ok: true, cost: 0, free: true };
  const b = await balance(subject);
  if (b.available < cost) return { ok: false, cost, ...b };
  usage.set(subject, (usage.get(subject) || 0) + cost);
  return { ok: true, cost, ...b, available: b.available - cost };
}

function paymentLink(subject, ton = 1) {
  if (!VAULT) return null;
  return `ton://transfer/${VAULT}?amount=${Math.round(ton * 1e9)}&text=${encodeURIComponent(`TGRAM:${subject}`)}`;
}

async function askAI(prompt) {
  const system = "Du bist TGRAM Copilot fuer TON, NEC, BBC und AXF auf der TGRAM Plattform. Antworte kurz und praezise auf Deutsch.";
  const token = process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
  if (token) {
    try {
      const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          model: process.env.TGRAM_AI_MODEL || "openai/gpt-5-mini",
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const text = d.choices?.[0]?.message?.content;
        if (text) return text;
      }
    } catch {}
  }
  const r = await fetch("https://text.pollinations.ai/" + encodeURIComponent(`${system} ${prompt}`));
  return (await r.text()).trim();
}

// Latest real transaction of the bot wallet that covers free AI usage.
async function botLatestTx() {
  const lite = await latestTx(VAULT);
  if (lite) return lite;
  try {
    const t = (await vaultTransactions())[0];
    if (t) return { hash: t.hash, utime: t.now, fee: Number(t.total_fees || 0) / 1e9 };
  } catch {}
  const d = await fetchJson(`https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(VAULT)}/transactions?limit=1`, 1);
  const t = (d.transactions || [])[0];
  return t ? { hash: t.hash, utime: t.utime, fee: Number(t.total_fees || 0) / 1e9 } : null;
}

// Value reward for AI interactions (instead of a referral reward): every answer the bot
// pays for puts value into circulation, and the user is credited Stars-points for it.
// Per-instance like `usage`; plug a DB here for persistence across serverless instances.
const AI_REWARD_STARS = Number(process.env.TGRAM_AI_REWARD_STARS || 1);
const rewards = new Map();
function rewardAI(subject) {
  const total = (rewards.get(subject) || 0) + AI_REWARD_STARS;
  rewards.set(subject, total);
  return { earned: AI_REWARD_STARS, total };
}

module.exports = { PRICING, balance, charge, paymentLink, askAI, VAULT, ledger, explorerLinks, accountLinks, botLatestTx, rewardAI };
