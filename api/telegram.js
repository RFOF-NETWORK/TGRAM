// @toncoing_bot webhook (Vercel). Set once:
// https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://tgram-tau.vercel.app/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>
const { PRICING, balance, charge, paymentLink, askAI } = require("./_economy");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const MINI_APP = process.env.TGRAM_MINI_APP_URL || "https://rfof-network.github.io/TGRAM/app/index.html";

async function tg(method, body) {
  return fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const reply = (chat_id, text, extra = {}) => tg("sendMessage", { chat_id, text, ...extra });

const openAppKeyboard = {
  reply_markup: { inline_keyboard: [[{ text: "TGRAM Mini App oeffnen", web_app: { url: MINI_APP } }]] },
};

async function needCredits(chatId, uid, res) {
  const link = paymentLink(uid);
  await reply(
    chatId,
    `Nicht genug Credits (verfuegbar: ${res.available}, benoetigt: ${res.cost}).\n` +
      `Aufladen: TON oder NEC/BBC/AXF an den TGRAM Vault senden mit Kommentar TGRAM:${uid}\n` +
      `1 TON = ${PRICING.creditsPerTon} Credits, 1 Jetton = ${PRICING.creditsPerJetton} Credit.` +
      (link ? `\n${link}` : ""),
  );
}

async function handle(msg) {
  const chatId = msg.chat.id;
  const uid = String(msg.from?.id || chatId);
  const text = (msg.text || "").trim();
  const [cmdRaw, ...rest] = text.split(" ");
  const cmd = cmdRaw.split("@")[0].toLowerCase();
  const arg = rest.join(" ").trim();

  if (cmd === "/start" || cmd === "/app") {
    return reply(chatId, "Willkommen bei TGRAM. Schreib mir einfach - die KI ist kostenlos. Mini App, DEX (1 % Gebuehr) und Mini Game ueber den Knopf.", openAppKeyboard);
  }
  if (cmd === "/help") {
    return reply(
      chatId,
      [
        "/app - Mini App oeffnen",
        `/ask <Frage> - TGRAM KI (${PRICING.cost.ai ? PRICING.cost.ai + " Credits" : "kostenlos"})`,
        "Oder einfach eine Nachricht schreiben - die KI antwortet.",
        "/balance - Credits anzeigen",
        "/buy - Value-Support: TON/NEC/BBC/AXF an den Vault",
        "/price - Gebuehren & Preise",
        `/game - Mini Game starten (${PRICING.cost.game ? PRICING.cost.game + " Credit" : "kostenlos"})`,
      ].join("\n"),
    );
  }
  if (cmd === "/balance") {
    const b = await balance(uid);
    return reply(chatId, `Credits: ${b.available} verfuegbar (bezahlt ${b.paid}, verbraucht ${b.used}).`);
  }
  if (cmd === "/buy") {
    const link = paymentLink(uid);
    return reply(chatId, `Sende TON oder NEC/BBC/AXF an den Vault mit Kommentar:\nTGRAM:${uid}` + (link ? `\n${link}` : ""));
  }
  if (cmd === "/price") {
    return reply(
      chatId,
      `KI: ${PRICING.cost.ai} Credits | Befehl: ${PRICING.cost.command} | Game: ${PRICING.cost.game}\n` +
        `DEX-Handelsgebuehr: ${PRICING.dexFeePercent} %\n1 TON = ${PRICING.creditsPerTon} Credits`,
    );
  }
  if (cmd === "/game") {
    const c = await charge(uid, "game");
    if (!c.ok) return needCredits(chatId, uid, c);
    return reply(chatId, c.free ? "Game gestartet." : `Game gestartet (-${c.cost} Credit, Rest ${c.available}).`, openAppKeyboard);
  }

  const question = cmd === "/ask" ? arg : text.startsWith("/") ? "" : text;
  if (!question) return reply(chatId, "Unbekannter Befehl. /help zeigt alle Befehle.");
  const c = await charge(uid, "ai");
  if (!c.ok) return needCredits(chatId, uid, c);
  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
  const answer = await askAI(question);
  return reply(chatId, c.free ? answer : `${answer}\n\n(-${c.cost} Credits, Rest ${c.available})`);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).json({ ok: true, bot: "@toncoing_bot" });
  if (!TOKEN) return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN missing" });
  if (SECRET && req.headers["x-telegram-bot-api-secret-token"] !== SECRET) return res.status(401).end();
  try {
    const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const msg = update?.message || update?.edited_message;
    if (msg) await handle(msg);
  } catch (e) {
    console.error("telegram webhook error", e);
  }
  return res.status(200).json({ ok: true });
};
