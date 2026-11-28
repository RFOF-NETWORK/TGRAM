// @toncoing_bot webhook (Vercel). Set once:
// https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://tgram-tau.vercel.app/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>
const { PRICING, balance, charge, paymentLink, askAI, VAULT, ledger, explorerLinks, accountLinks, botLatestTx, rewardAI } = require("./_economy");
const { signAIReply } = require("./_botwallet");

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

const MAX_TEXT = 3600;
const fmt = (n) => (n == null ? "-" : Number(n.toFixed(6)).toString());

// Every bot message links the user's latest real on-chain transaction on Tonviewer and
// Tonscan, so costs and the bot-paid AI stay verifiable. No account-level fallback links.
const utc = (s) => (s ? " · " + new Date(s * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "");

async function txFooter(subject, reward, proof) {
  const aiCost = PRICING.cost.ai ? `${PRICING.cost.ai} Credits` : "0 fuer dich (zahlt @toncoing_bot)";
  const rewardLine = reward
    ? `\nBonus: +${reward.earned} TGRAM-Punkt (intern, keine Telegram Stars, kein TON) · gesamt ${reward.total}`
    : "";
  const proofLinks = proof?.hash && explorerLinks(proof.hash);
  if (proofLinks) {
    return {
      text: `\n\n— KI-Kosten: ${aiCost}${rewardLine}\nNachweis: diese Antwort wurde von der Bot-Wallet in TON signiert · Netzgebuehr ${fmt(proof.fee)} TON (zahlt der Bot)${utc(proof.utime)}`,
      row: [{ text: "Tonviewer", url: proofLinks.tonviewer }, { text: "Tonscan", url: proofLinks.tonscan }],
    };
  }
  let latest = null;
  try { latest = (await ledger(String(subject))).txs[0] || null; } catch {}
  if (latest) {
    const links = explorerLinks(latest.hash);
    return {
      text: `\n\n— KI-Kosten: ${aiCost}${rewardLine}\nNachweis: deine letzte Tx ${fmt(latest.amount)} ${latest.token} · Netzgebuehr ${fmt(latest.fee)} TON${utc(latest.utime)}`,
      row: links ? [{ text: "Tonviewer", url: links.tonviewer }, { text: "Tonscan", url: links.tonscan }] : [],
    };
  }
  let bot = null;
  try { bot = await botLatestTx(); } catch {}
  const botLinks = bot && explorerLinks(bot.hash);
  if (botLinks) {
    return {
      text: `\n\n— KI-Kosten: ${aiCost}${rewardLine}\nNachweis: Bot-Wallet Tx · Netzgebuehr ${fmt(bot.fee)} TON${utc(bot.utime)}`,
      row: [{ text: "Tonviewer", url: botLinks.tonviewer }, { text: "Tonscan", url: botLinks.tonscan }],
    };
  }
  return { text: `\n\n— KI-Kosten: ${aiCost}${rewardLine}`, row: [] };
}

const reply = (chat_id, text, extra = {}) => sendReply(chat_id, text, extra);

async function sendReply(chat_id, text, extra = {}, subject = chat_id, reward = null, proof = null) {
  const footer = await txFooter(subject, reward, proof);
  const keyboard = extra.reply_markup?.inline_keyboard || [];
  const body = String(text).slice(0, MAX_TEXT) + footer.text;
  const reply_markup = footer.row.length ? { ...extra.reply_markup, inline_keyboard: [...keyboard, footer.row] } : extra.reply_markup;
  return tg("sendMessage", { chat_id, text: body, ...extra, ...(reply_markup ? { reply_markup } : {}) });
}

const openAppKeyboard = {
  reply_markup: { inline_keyboard: [[{ text: "TGRAM Mini App oeffnen", web_app: { url: MINI_APP } }]] },
};

async function needCredits(chatId, uid, res) {
  const link = paymentLink(uid);
  await sendReply(
    chatId,
    `Nicht genug Credits (verfuegbar: ${res.available}, benoetigt: ${res.cost}).\n` +
      `Aufladen: TON oder NEC/BBC/AXF an den TGRAM Vault senden mit Kommentar TGRAM:${uid}\n` +
      `1 TON = ${PRICING.creditsPerTon} Credits, 1 Jetton = ${PRICING.creditsPerJetton} Credit.` +
      (link ? `\n${link}` : ""),
    {},
    uid,
  );
}

const BUILTIN = ["start", "app", "help", "balance", "buy", "price", "game", "ask", "stars", "cmd"];
const NAME_RE = /^[a-z][a-z0-9_]{1,30}$/;

// Per-chat sub-commands are stored by Telegram itself (setMyCommands, chat scope); the
// description holds the prompt. Changes only happen after the user taps "Erlauben".
async function chatCommands(chatId) {
  const r = await (await tg("getMyCommands", { scope: { type: "chat", chat_id: chatId } })).json();
  return r.result || [];
}

async function proposeCmd(chatId, op, name, prompt) {
  const text = op === "add" ? `Neuen Sub-Befehl /${name} anlegen?\n\n${prompt}` : `Sub-Befehl /${name} entfernen?`;
  return reply(chatId, text, {
    reply_markup: { inline_keyboard: [[{ text: "Erlauben", callback_data: `cmd:${op}:${name}` }, { text: "Ablehnen", callback_data: "cmd:deny" }]] },
  });
}

async function handleCallback(q) {
  const chatId = q.message?.chat?.id;
  const [, op, name] = String(q.data || "").split(":");
  await tg("answerCallbackQuery", { callback_query_id: q.id });
  if (!chatId || op === "deny" || !NAME_RE.test(name || "")) {
    return tg("editMessageText", { chat_id: chatId, message_id: q.message.message_id, text: "Abgelehnt." });
  }
  const current = (await chatCommands(chatId)).filter(c => c.command !== name);
  if (op === "add") {
    const prompt = String(q.message.text || "").split("\n\n").slice(1).join("\n\n").slice(0, 256);
    current.push({ command: name, description: prompt || name });
  }
  await tg("setMyCommands", { commands: current, scope: { type: "chat", chat_id: chatId } });
  return tg("editMessageText", { chat_id: chatId, message_id: q.message.message_id, text: op === "add" ? `/${name} angelegt.` : `/${name} entfernt.` });
}

async function handle(msg) {
  const chatId = msg.chat.id;
  const uid = String(msg.from?.id || chatId);
  const reply = (id, text, extra = {}) => sendReply(id, text, extra, uid);
  if (msg.successful_payment) {
    const b = await balance(uid);
    return reply(chatId, `Danke! ${msg.successful_payment.total_amount} Stars erhalten. Credits: ${b.available}.`);
  }
  const text = (msg.text || "").trim();
  const [cmdRaw, ...rest] = text.split(" ");
  const cmd = cmdRaw.split("@")[0].toLowerCase();
  const arg = rest.join(" ").trim();

  if (cmd === "/stars") {
    const amount = Math.min(10000, Math.max(1, parseInt(arg, 10) || 50));
    return tg("sendInvoice", {
      chat_id: chatId,
      title: "TGRAM Credits",
      description: `${amount} Credits fuer TGRAM (1 Star = 1 Credit). Unterstuetzt die KI, die der Bot fuer alle bezahlt.`,
      payload: `TGRAM:${uid}`,
      currency: "XTR",
      prices: [{ label: `${amount} Credits`, amount }],
    });
  }
  if (cmd === "/cmd") {
    const [op, raw, ...p] = arg.split(" ");
    const name = (raw || "").replace(/^\//, "").toLowerCase();
    if (!op || op === "list") {
      const list = await chatCommands(chatId);
      return reply(chatId, list.length ? list.map(c => `/${c.command} - ${c.description}`).join("\n") : "Keine eigenen Sub-Befehle. /cmd add name prompt");
    }
    if (!NAME_RE.test(name) || BUILTIN.includes(name)) return reply(chatId, "Ungueltiger oder reservierter Befehlsname.");
    if (op === "add" && p.join(" ").trim()) return proposeCmd(chatId, "add", name, p.join(" ").trim().slice(0, 256));
    if (op === "remove") return proposeCmd(chatId, "remove", name);
    return reply(chatId, "Nutzung: /cmd add|remove|list name [prompt]");
  }

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
        "/stars <n> - Credits mit Telegram Stars kaufen (1 Star = 1 Credit)",
        "/cmd add|remove|list - eigene Sub-Befehle (nur nach Erlauben)",
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

  let question = cmd === "/ask" ? arg : text.startsWith("/") ? "" : text;
  if (!question && text.startsWith("/")) {
    const custom = (await chatCommands(chatId)).find(c => "/" + c.command === cmd);
    if (custom) question = custom.description + (arg ? "\n" + arg : "");
  }
  if (!question) return reply(chatId, "Unbekannter Befehl. /help zeigt alle Befehle.");
  const c = await charge(uid, "ai");
  if (!c.ok) return needCredits(chatId, uid, c);
  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
  const [answer, proof] = await Promise.all([askAI(question), signAIReply(uid)]);
  const reward = rewardAI(uid);
  return sendReply(chatId, c.free ? answer : `${answer}\n\n(-${c.cost} Credits, Rest ${c.available})`, {}, uid, reward, proof);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).json({ ok: true, bot: "@toncoing_bot" });
  if (!TOKEN) return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN missing" });
  if (SECRET && req.headers["x-telegram-bot-api-secret-token"] !== SECRET) return res.status(401).end();
  try {
    const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (update?.pre_checkout_query) {
      const q = update.pre_checkout_query;
      await tg("answerPreCheckoutQuery", { pre_checkout_query_id: q.id, ok: q.currency === "XTR" && q.invoice_payload === `TGRAM:${q.from.id}` });
    } else if (update?.callback_query) {
      await handleCallback(update.callback_query);
    } else {
      const msg = update?.message || update?.edited_message;
      if (msg) await handle(msg);
    }
  } catch (e) {
    console.error("telegram webhook error", e);
  }
  return res.status(200).json({ ok: true });
};
