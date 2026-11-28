// @toncoing_bot webhook (Vercel). Set once:
// https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://tgram-tau.vercel.app/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>
const { PRICING, balance, charge, paymentLink, askAI, VAULT, ledger, explorerLinks, accountLinks, botLatestTx, rewardAI } = require("./_economy");
const { signAIReply } = require("./_botwallet");
const { AXF_PER_STAR, isAxfPayload, axfClaims, axfInvoice } = require("./_axf");
const userdb = require("./_userdb");
const cells = require("./_cells");
const { getExtension } = require("./extension");
const github = require("./_github");

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

// Link the latest matching vault payment, or the latest vault transaction as context.
// Neither proves the cost of the current AI response.
const utc = (s) => (s ? " · " + new Date(s * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "");

async function txFooter(subject, reward, proof) {
  const aiCost = PRICING.cost.ai ? `${PRICING.cost.ai} Credits` : "0 Credits fuer dich (zahlt @toncoing_bot)";
  const rewardLine = reward
    ? `\nKI-Punkte: +${reward.earned} · gesamt ${reward.total} (nur voruebergehend, keine Telegram Stars)`
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
      text: `\n\n— KI-Kosten: ${aiCost}${rewardLine}\nLetzte zugeordnete Vault-Zahlung: ${fmt(latest.amount)} ${latest.token} · Netzgebuehr ${fmt(latest.fee)} TON${utc(latest.utime)}`,
      row: links ? [{ text: "Tonviewer", url: links.tonviewer }, { text: "Tonscan", url: links.tonscan }] : [],
    };
  }
  let bot = null;
  try { bot = await botLatestTx(); } catch {}
  const botLinks = bot && explorerLinks(bot.hash);
  if (botLinks) {
    return {
      text: `\n\n— KI-Kosten: ${aiCost}${rewardLine}\nLetzte Vault-Transaktion (kein Nachweis fuer diese Antwort) · Netzgebuehr ${fmt(bot.fee)} TON${utc(bot.utime)}`,
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

const axfStatus = (c) =>
  `Dein AXF: ${c.axf} (aus ${c.stars} Stars, ${c.payments} Kaeufe) · ` +
  (c.onchain ? `on-chain ueber Minter ${c.minter}` : "reserviert, Lieferung nach AXF-Deploy");

const BUILTIN = ["start", "app", "help", "balance", "buy", "price", "game", "ask", "stars", "axf", "cmd", "github", "repo", "ls", "cat", "code"];

const CODE_SYSTEM =
  "Du bist ein praeziser Code-Editor. Du bekommst eine Datei und eine Anweisung. " +
  "Gib AUSSCHLIESSLICH den vollstaendigen neuen Dateiinhalt zurueck, ohne Erklaerung und ohne Markdown-Codeblock.";
const stripFence = s => String(s).trim().replace(/^```[\w-]*\n/, "").replace(/\n```\s*$/, "");

async function githubCommand(chatId, uid, cmd, arg, msg, reply) {
  const conn = await github.load(uid);
  const ok = github.usable(conn);
  const need = () => reply(chatId, "Erst GitHub verbinden: /github connect");
  const needRepo = () => reply(chatId, "Erst ein Repo waehlen: /repo owner/name");

  if (cmd === "/github") {
    const [sub, ...p] = arg.split(" ");
    if (sub === "token") {
      await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
      const login = await github.connectToken(uid, p.join(" ").trim());
      return reply(chatId, `GitHub verbunden als ${login}. Deine Token-Nachricht wurde aus dem Chat geloescht.\nJetzt: /repo owner/name`);
    }
    if (sub === "connect") {
      const device = await github.startDevice(uid).catch(e => ({ error: e.message }));
      if (device?.code) {
        return reply(chatId, `1. Oeffne ${device.url}\n2. Gib diesen Code ein: ${device.code}\n3. Danach hier auf "Bestaetigt" tippen.`, {
          reply_markup: { inline_keyboard: [[{ text: "GitHub oeffnen", url: device.url }], [{ text: "Bestaetigt", callback_data: "gh:poll" }]] },
        });
      }
      return reply(
        chatId,
        (device?.error ? `Device-Login fehlgeschlagen: ${device.error}\n\n` : "") +
          "Verbinden per Token:\n1. GitHub > Settings > Developer settings > Fine-grained tokens\n" +
          "2. Repo auswaehlen, Rechte: Contents + Pull requests = Read and write\n" +
          "3. Hier senden: /github token <dein_token>\nDie Nachricht wird sofort geloescht, der Token verschluesselt gespeichert.",
        { reply_markup: { inline_keyboard: [[{ text: "Token erstellen", url: "https://github.com/settings/personal-access-tokens/new" }]] } },
      );
    }
    if (sub === "logout") {
      await github.logout(uid);
      return reply(chatId, "GitHub getrennt. Token geloescht.");
    }
    return reply(
      chatId,
      (ok ? `Verbunden als ${conn.login}${conn.repo ? ` · Repo ${conn.repo} (${conn.branch})` : " · kein Repo gewaehlt"}` : "Nicht mit GitHub verbunden.") +
        "\n\n/github connect - verbinden\n/repo owner/name - Repo waehlen\n/ls [pfad] - Dateien\n/cat <pfad> - Datei lesen\n" +
        "/code <pfad> <anweisung> - KI aendert Datei und oeffnet einen Pull Request\n/github logout - trennen",
    );
  }
  if (!ok) return need();
  if (cmd === "/repo") {
    if (!arg) return reply(chatId, conn.repo ? `Aktives Repo: ${conn.repo} (${conn.branch})` : "Nutzung: /repo owner/name");
    const r = await github.setRepo(uid, conn, arg.trim());
    return reply(chatId, `Aktives Repo: ${r.full_name} (Branch ${r.default_branch}).`);
  }
  if (!conn.repo) return needRepo();
  if (cmd === "/ls") {
    const items = await github.list(conn, arg);
    return reply(chatId, `${conn.repo}/${arg || ""}\n` + items.slice(0, 80).join("\n") + (items.length > 80 ? `\n... +${items.length - 80}` : ""));
  }
  if (cmd === "/cat") {
    if (!arg) return reply(chatId, "Nutzung: /cat <pfad>");
    const f = await github.readFile(conn, arg);
    return reply(chatId, `${arg}:\n${f.text.slice(0, 3200)}${f.text.length > 3200 ? "\n... (gekuerzt)" : ""}`);
  }
  if (cmd === "/code") {
    const [path, ...instr] = arg.split(" ");
    const instruction = instr.join(" ").trim();
    if (!path || !instruction) return reply(chatId, "Nutzung: /code <pfad> <anweisung>\nz. B. /code README.md Fuege einen Abschnitt Installation hinzu");
    await tg("sendChatAction", { chat_id: chatId, action: "typing" });
    let current = "";
    try { current = (await github.readFile(conn, path)).text; } catch (e) { if (!/404/.test(e.message)) throw e; }
    const content = stripFence(
      await askAI(`Datei: ${path}\n${current ? `Aktueller Inhalt:\n${current}` : "(neue Datei)"}\n\nAnweisung: ${instruction}`, null, { system: CODE_SYSTEM }),
    );
    if (!content.trim()) return reply(chatId, "Die KI hat keinen Inhalt geliefert. Bitte Anweisung praeziser formulieren.");
    const pr = await github.proposeChange(conn, path, content + (content.endsWith("\n") ? "" : "\n"), `${path}: ${instruction}`.slice(0, 200));
    return reply(chatId, `Pull Request #${pr.number} in ${conn.repo} erstellt (Branch ${pr.branch}).\nPruefen und dann mergen:`, {
      reply_markup: { inline_keyboard: [[{ text: `PR #${pr.number} ansehen`, url: pr.url }], [{ text: "Mergen", callback_data: `gh:merge:${pr.number}` }]] },
    });
  }
}

async function githubCallback(q, chatId) {
  const uid = String(q.from.id);
  const [, op, num] = String(q.data).split(":");
  const edit = text => tg("editMessageText", { chat_id: chatId, message_id: q.message.message_id, text });
  try {
    if (op === "poll") {
      const r = await github.finishDevice(uid);
      return r.ok ? edit(`GitHub verbunden als ${r.login}. Jetzt: /repo owner/name`) : tg("sendMessage", { chat_id: chatId, text: r.msg });
    }
    if (op === "merge" && /^\d+$/.test(num || "")) {
      const conn = await github.load(uid);
      if (!github.usable(conn) || !conn.repo) return edit("Nicht verbunden oder kein Repo gewaehlt.");
      const sha = await github.mergePR(conn, Number(num));
      return edit(`PR #${num} in ${conn.repo} gemergt (${sha.slice(0, 7)}).`);
    }
  } catch (e) {
    return tg("sendMessage", { chat_id: chatId, text: `GitHub-Fehler: ${e.message}` });
  }
}
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
  if (chatId && String(q.data || "").startsWith("gh:")) return githubCallback(q, chatId);
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
    const p = msg.successful_payment;
    if (isAxfPayload(p.invoice_payload, uid)) {
      const c = await axfClaims(uid).catch(() => null);
      return reply(chatId, `Danke! ${p.total_amount} Stars -> ${p.total_amount * AXF_PER_STAR} AXF.` + (c ? `\n${axfStatus(c)}` : ""));
    }
    const b = await balance(uid);
    return reply(chatId, `Danke! ${p.total_amount} Stars erhalten. Credits: ${b.available}.`);
  }
  const text = (msg.text || "").trim();
  const [cmdRaw, ...rest] = text.split(" ");
  const cmd = cmdRaw.split("@")[0].toLowerCase();
  const arg = rest.join(" ").trim();
  const me = msg.from ? await userdb.touchUser(msg.from).catch(e => (console.error("userdb", e.message), null)) : null;
  if (me && text) {
    const inbound = cells.chain(text);
    await userdb
      .logEvent(uid, text.startsWith("/") ? "cmd" : "msg", { chars: inbound.chars, meta: { cells: inbound.cells, gram: inbound.gram, axf: inbound.axf } })
      .catch(e => console.error("userdb log", e.message));
  }

  if (cmd === "/meinedaten") {
    const o = await userdb.myOverview(uid);
    return reply(
      chatId,
      [
        `Deine Datenbank (${o.role === "admin" ? "Admin" : "Nutzer"})`,
        `KI-Punkte: ${o.points} (AXF-gedeckt, werden erst zu Stars, wenn AXF echte Stars gekauft hat)`,
        `Echte Stars ausgezahlt: ${o.stars} | AXF: ${o.axf}`,
        `Nachrichten: ${o.messages} | Zeichen: ${o.chars}`,
        `Gespeicherte Eintraege: ${o.keys.length ? o.keys.join(", ") : "keine"}`,
        "/speichern <name> <text> | /laden <name> | /loeschen",
      ].join("\n"),
    );
  }
  if (cmd === "/speichern") {
    const [key, ...val] = arg.split(" ");
    const k = (key || "").toLowerCase();
    if (!userdb.KEY_RE.test(k) || k.startsWith("_") || !val.join(" ").trim()) return reply(chatId, "Nutzung: /speichern <name> <text> (name: a-z, 0-9, _ -, nicht mit _ beginnen)");
    await userdb.setData(uid, k, val.join(" ").trim());
    return reply(chatId, `Gespeichert in deiner Datenbank: ${k}`);
  }
  if (cmd === "/laden") {
    const row = arg.startsWith("_") ? null : await userdb.getData(uid, arg.toLowerCase());
    return reply(chatId, row ? `${arg}:\n${row.value.text}` : "Kein Eintrag mit diesem Namen.");
  }
  if (cmd === "/loeschen") {
    if (arg !== "ja") return reply(chatId, "Loescht alle deine Daten unwiderruflich. Bestaetigen mit: /loeschen ja");
    await userdb.deleteMe(uid);
    return reply(chatId, "Deine Daten wurden geloescht.");
  }
  if (cmd === "/admin") {
    if (me?.role !== "admin") return reply(chatId, "Nur fuer den Admin.");
    const s = await userdb.adminStats();
    return reply(
      chatId,
      `Admin-Uebersicht\nNutzer: ${s.users} (aktiv 24h: ${s.active24h})\nNachrichten: ${s.messages} (KI-Antworten: ${s.aiReplies}) | Zeichen: ${s.chars} | Cells: ${s.cells}\nKI-Punkte offen: ${s.points} | Echte Stars ausgezahlt: ${s.stars} | AXF gesamt: ${s.axf}`,
    );
  }

  if (cmd === "/settings") {
    if (me?.role !== "admin") return reply(chatId, "Nur fuer den Admin.");
    const groups = {
      "KI (AI Gateway)": ["VERCEL_OIDC_TOKEN", "AI_GATEWAY_API_KEY", "GEMINI_API_BASE", "GEMINI_ACTIVE_MODEL"],
      Telegram: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"],
      "TON / Blockchain": ["BOT_WALLET_MNEMONIC", "TON_MULTISIG_VAULT", "TONCENTER_RPC_URL", "TONCONNECT_MANIFEST_URL", "TGRAM_SUPPORTED_TOKENS"],
      "Datenbank (Supabase)": ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "POSTGRES_URL"],
      GitHub: ["GITHUB_APP_CLIENT_ID", "GITHUB_TOKEN"],
      "Login (Google/Microsoft)": ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    };
    const lines = Object.entries(groups).map(([name, keys]) =>
      `${name}\n` + keys.map((k) => `  ${process.env[k] ? "OK " : "-- "} ${k}`).join("\n"),
    );
    return reply(chatId, `Settings-Cluster (nur Status, keine Geheimwerte)\n\n${lines.join("\n\n")}\n\nWerte aendern: Vercel > Project > Settings > Environment Variables.`);
  }

  if (["/github", "/repo", "/ls", "/cat", "/code"].includes(cmd)) {
    if (msg.chat.type !== "private") return reply(chatId, "GitHub-Befehle nur im privaten Chat mit dem Bot.");
    try {
      return await githubCommand(chatId, uid, cmd, arg, msg, reply);
    } catch (e) {
      return reply(chatId, `GitHub-Fehler: ${e.message}`);
    }
  }

  if (cmd === "/axf") {
    const stars = parseInt(arg, 10);
    if (stars > 0) return axfInvoice(chatId, uid, Math.min(10000, stars));
    const c = await axfClaims(uid);
    return reply(chatId, `${axfStatus(c)}\nKaufen: /axf <Stars>, z. B. /axf 50 (1 Star = ${AXF_PER_STAR} AXF).`);
  }

  if (cmd === "/stars") {
    const amount = Math.min(10000, Math.max(1, parseInt(arg, 10) || 50));
    return tg("sendInvoice", {
      chat_id: chatId,
      title: "TGRAM Credits",
      description: `${amount} Credits fuer TGRAM (1 Star = 1 Credit). Unterstuetzt die Bereitstellung der KI.`,
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

  if (cmd === "/start" && me && /^ref_\d{1,15}$/.test(arg)) {
    const credited = await userdb.setReferrer(uid, arg.slice(4)).catch(e => (console.error("referral", e.message), false));
    if (credited) {
      await reply(Number(arg.slice(4)), `Neuer Nutzer ueber deinen Einladungslink! +${userdb.REFERRAL_POINTS} KI-Punkte.`).catch(() => {});
    }
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
        "/kosten <text> - Rechnung Cell -> TON -> Gram -> AXF -> Stars",
        "/stars <n> - Credits mit Telegram Stars kaufen (1 Star = 1 Credit)",
        `/axf <n> - AXF mit Stars kaufen (1 Star = ${AXF_PER_STAR} AXF), /axf zeigt deinen AXF-Stand`,
        "/cmd add|remove|list - eigene Sub-Befehle (nur nach Erlauben)",
        "/github - GitHub verbinden, dann /repo, /ls, /cat, /code (KI codet per Pull Request)",
        "/meinedaten - deine eigene Datenbank ansehen",
        "/speichern <name> <text>, /laden <name>, /loeschen - eigene Daten verwalten",
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
        `DEX-Handelsgebuehr: ${PRICING.dexFeePercent} %\n1 TON = ${PRICING.creditsPerTon} Credits\n\n` +
        `KI-Punkte pro Nachricht (Beispiel 100 Zeichen):\n${cells.formatChain(cells.chain("x".repeat(100)))}`,
    );
  }
  if (cmd === "/kosten") {
    if (!arg) return reply(chatId, "Nutzung: /kosten <text>");
    return reply(chatId, cells.formatChain(cells.chain(arg)));
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
  const extension = await getExtension(uid).catch(() => null);
  const conn = await github.load(uid).catch(() => null);
  const context = github.usable(conn)
    ? `Der Nutzer ist mit GitHub verbunden als ${conn.login}${conn.repo ? `, aktives Repo ${conn.repo}` : ""}. ` +
      "Du KANNST in seinem Repo coden: verweise auf /ls, /cat <pfad> und /code <pfad> <anweisung> (erstellt einen Pull Request, Mergen per Knopf)."
    : "Du kannst in GitHub-Repos des Nutzers coden, sobald er sich mit /github connect verbindet. Sag nie, dass das unmoeglich ist.";
  const [answer, proof] = await Promise.all([askAI(question, extension, { context }), signAIReply(uid)]);
  const reward = rewardAI(uid);
  const cost = cells.chain(question + String(answer));
  const answerChars = String(answer).length;
  await userdb
    .logEvent(uid, "ai", { chars: answerChars, points: cost.stars, meta: { cells: cost.cells, gram: cost.gram, axf: cost.axf } })
    .catch(e => console.error("userdb log", e.message));
  return sendReply(chatId, c.free ? answer : `${answer}\n\n(-${c.cost} Credits, Rest ${c.available})`, {}, uid, reward, proof);
}

module.exports = async (req, res) => {
  const oidc = req.headers["x-vercel-oidc-token"];
  if (oidc) process.env.VERCEL_OIDC_TOKEN = oidc;
  if (req.method !== "POST") return res.status(200).json({ ok: true, bot: "@toncoing_bot" });
  if (!TOKEN) return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN missing" });
  if (SECRET && req.headers["x-telegram-bot-api-secret-token"] !== SECRET) return res.status(401).end();
  try {
    const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (update?.pre_checkout_query) {
      const q = update.pre_checkout_query;
      await tg("answerPreCheckoutQuery", { pre_checkout_query_id: q.id, ok: q.currency === "XTR" && (q.invoice_payload === `TGRAM:${q.from.id}` || isAxfPayload(q.invoice_payload, q.from.id)) });
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
