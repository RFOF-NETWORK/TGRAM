// TGRAM Economy: shared by /api/telegram (bot) and /api/copilot (website).
// Credits are derived from on-chain payments to the TGRAM vault whose comment is
// "TGRAM:<telegram-id or wallet>". Nothing is free: every AI call / command costs credits.

const VAULT = process.env.TON_MULTISIG_VAULT || "";
const TONCENTER = "https://toncenter.com/api/v3";

const PRICING = {
  creditsPerTon: 100,        // 1 TON  -> 100 credits
  creditsPerJetton: 1,       // 1 Jetton (NEC/BBC/AXF) -> 1 credit
  cost: { ai: 2, command: 1, game: 1 },
  dexFeePercent: 1,          // 1 % platform fee on DEX swaps
};

const usage = new Map(); // per-instance usage ledger; plug a DB here for multi-instance persistence

async function fetchJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`toncenter ${r.status}`);
  return r.json();
}

async function paidCredits(subject) {
  if (!VAULT) return 0;
  const tag = `TGRAM:${subject}`;
  let credits = 0;
  try {
    const tx = await fetchJson(`${TONCENTER}/transactions?account=${encodeURIComponent(VAULT)}&limit=256&sort=desc`);
    for (const t of tx.transactions || []) {
      const msg = t.in_msg || {};
      const comment = msg.message_content?.decoded?.comment || "";
      if (comment.trim() === tag) credits += (Number(msg.value || 0) / 1e9) * PRICING.creditsPerTon;
    }
  } catch {}
  try {
    const jt = await fetchJson(`${TONCENTER}/jetton/transfers?owner_address=${encodeURIComponent(VAULT)}&direction=in&limit=256&sort=desc`);
    for (const j of jt.jetton_transfers || []) {
      const comment = j.comment || j.forward_payload_comment || "";
      if (String(comment).trim() === tag) credits += (Number(j.amount || 0) / 1e9) * PRICING.creditsPerJetton;
    }
  } catch {}
  return Math.floor(credits);
}

async function balance(subject) {
  const paid = await paidCredits(subject);
  const used = usage.get(subject) || 0;
  return { paid, used, available: Math.max(0, paid - used) };
}

async function charge(subject, kind) {
  const cost = PRICING.cost[kind] ?? 1;
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

module.exports = { PRICING, balance, charge, paymentLink, askAI, VAULT };
