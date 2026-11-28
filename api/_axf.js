// AXF is never handed out for free: users buy it with Telegram Stars (XTR).
// Telegram itself is the ledger: every Stars payment with payload "AXF:<uid>" is listed by
// getStarTransactions, so claims survive restarts without a separate database.
// Until the AXF jetton minter is deployed (AXF_MINTER), claims are reserved, not yet on-chain.

const AXF_PER_STAR = Number(process.env.AXF_PER_STAR || 1);
const AXF_MINTER = (process.env.AXF_MINTER || "").trim();
const PAYLOAD_PREFIX = "AXF:";
const PAGE = 100;
const MAX_PAGES = 20;

async function tg(method, params) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || "Telegram-Fehler");
  return j.result;
}

const payloadFor = (uid) => `${PAYLOAD_PREFIX}${uid}`;
const isAxfPayload = (payload, uid) => payload === payloadFor(uid);

async function axfClaims(uid) {
  let stars = 0;
  let payments = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { transactions = [] } = await tg("getStarTransactions", { offset: page * PAGE, limit: PAGE });
    for (const t of transactions) {
      const s = t.source;
      if (s?.type === "user" && String(s.user?.id) === String(uid) && isAxfPayload(s.invoice_payload, uid)) {
        stars += t.amount;
        payments++;
      }
    }
    if (transactions.length < PAGE) break;
  }
  return { stars, payments, axf: stars * AXF_PER_STAR, onchain: Boolean(AXF_MINTER), minter: AXF_MINTER || null };
}

function axfInvoice(chatId, uid, stars) {
  return tg("sendInvoice", {
    chat_id: chatId,
    title: "AXF mit Stars kaufen",
    description: `${stars * AXF_PER_STAR} AXF fuer ${stars} Stars (1 Star = ${AXF_PER_STAR} AXF). ${
      AXF_MINTER ? "Lieferung an deine TON-Wallet." : "Wird reserviert und nach dem AXF-Deploy an deine TON-Wallet geliefert."
    }`,
    payload: payloadFor(uid),
    currency: "XTR",
    prices: [{ label: `${stars * AXF_PER_STAR} AXF`, amount: stars }],
  });
}

module.exports = { AXF_PER_STAR, AXF_MINTER, payloadFor, isAxfPayload, axfClaims, axfInvoice };
