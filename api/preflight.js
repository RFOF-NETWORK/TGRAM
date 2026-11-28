// Pre-flight: every wallet transaction is simulated against the live mainnet state before the
// user is asked to sign. The wallet's real external message is rebuilt with an empty signature
// and run through TonAPI's emulator, so the full message chain (jetton wallets, STON.fi router,
// vault) executes exactly as it would on-chain, without moving funds. Anything that would fail
// or bounce is blocked here; if the emulator is unreachable the result is also "blocked".
const { Address, Cell, beginCell, internal, external, storeMessage, loadStateInit, SendMode, WalletContractV4, WalletContractV5R1 } = require("@ton/ton");

const ALLOWED_ORIGINS = ["https://rfof-network.github.io", "https://tgram-tau.vercel.app"];
const NETS = {
  mainnet: { label: "Mainnet-Simulation", toncenter: "https://toncenter.com/api/v3", tonapi: "https://tonapi.io/v2" },
  testnet: { label: "Testnet-Lauf", toncenter: "https://testnet.toncenter.com/api/v3", tonapi: "https://testnet.tonapi.io/v2" },
};
const MODES = { mainnet: ["mainnet"], testnet: ["testnet"], both: ["mainnet", "testnet"] };
const MAX_MESSAGES = 4;
const GAS_RESERVE = 50_000_000n;
const ZERO_SIGNATURE_KEY = Buffer.alloc(64);

const TONCENTER_KEY = process.env.TONCENTER_MAINNET_API_KEY;

async function getJson(url, init = {}, attempt = 0) {
  const headers = { ...(init.headers || {}) };
  if (TONCENTER_KEY && url.startsWith(NETS.mainnet.toncenter)) headers["X-API-Key"] = TONCENTER_KEY;
  const r = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(10000) });
  // Toncenter allows 1 request/second without a key; wait and retry instead of blocking the user.
  if (r.status === 429 && attempt < 3) {
    await new Promise((res) => setTimeout(res, 1100 * (attempt + 1)));
    return getJson(url, init, attempt + 1);
  }
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}

function parseMessage(m) {
  const to = Address.parseFriendly(String(m.address || ""));
  const value = BigInt(String(m.amount ?? ""));
  if (value < 0n) throw new Error("negative_amount");
  return internal({
    to: to.address,
    value,
    bounce: to.isBounceable,
    body: m.payload ? Cell.fromBase64(m.payload) : undefined,
    init: m.stateInit ? loadStateInit(Cell.fromBase64(m.stateInit).beginParse()) : undefined,
  });
}

function walletFor(type, publicKey, workchain) {
  if (type === "wallet v4 r2") return WalletContractV4.create({ workchain, publicKey });
  if (type === "wallet v5 r1") return WalletContractV5R1.create({ workchain, publicKey });
  return null;
}

function failedNodes(node, out = []) {
  const t = node?.transaction;
  if (t && (!t.success || t.aborted)) {
    out.push({ account: t.account?.address, exitCode: t.compute_phase?.exit_code ?? t.action_phase?.result_code ?? null });
  }
  for (const c of node?.children || []) failedNodes(c, out);
  return out;
}

function sumFees(node) {
  return BigInt(node?.transaction?.total_fees || 0) + (node?.children || []).reduce((s, c) => s + sumFees(c), 0n);
}

async function runOn(netName, { from, messages }) {
  const net = NETS[netName];
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  let sender;
  try { sender = Address.parse(String(from || "")); } catch { add("Absender", false, "Ungültige Wallet-Adresse"); return { ok: false, checks }; }
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) {
    add("Nachrichten", false, `1 bis ${MAX_MESSAGES} Nachrichten erlaubt`);
    return { ok: false, checks };
  }

  let parsed;
  try { parsed = messages.map(parseMessage); add("Format", true, "Adressen, Beträge und Payloads gültig"); }
  catch (e) { add("Format", false, "Nachricht nicht lesbar: " + e.message); return { ok: false, checks }; }

  const raw = sender.toRawString();
  const info = await getJson(`${net.toncenter}/walletInformation?address=${encodeURIComponent(raw)}&use_v2=false`);
  if (info.status !== "active") {
    if (netName === "testnet") return { ok: false, skipped: true, checks: [{ name: "Wallet aktiv", ok: false, detail: "Wallet hat auf dem Testnet kein Guthaben. Testnet-TON gibt es kostenlos über @testgiver_ton_bot." }] };
    add("Wallet aktiv", false, "Wallet ist noch nicht aktiv. Erst eine kleine TON-Einzahlung empfangen.");
    return { ok: false, checks };
  }

  const total = parsed.reduce((s, m) => s + m.info.value.coins, 0n);
  const balance = BigInt(info.balance || 0);
  const covered = balance >= total + GAS_RESERVE;
  add("Guthaben", covered, `${(Number(balance) / 1e9).toFixed(4)} TON verfügbar, ${(Number(total + GAS_RESERVE) / 1e9).toFixed(4)} TON nötig (inkl. Gas-Reserve)`);
  if (!covered) return { ok: false, checks };

  const { public_key } = await getJson(`${net.tonapi}/accounts/${encodeURIComponent(raw)}/publickey`);
  const wallet = walletFor(info.wallet_type, Buffer.from(public_key, "hex"), sender.workChain);
  if (!wallet || !wallet.address.equals(sender)) {
    add("Wallet-Typ", false, `${info.wallet_type || "unbekannt"} wird noch nicht simuliert`);
    return { ok: false, checks };
  }

  const transfer = wallet.createTransfer({
    seqno: Number(info.seqno || 0),
    secretKey: ZERO_SIGNATURE_KEY,
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    messages: parsed,
  });
  const boc = beginCell().store(storeMessage(external({ to: wallet.address, body: transfer }))).endCell().toBoc().toString("base64");
  const sim = await getJson(`${net.tonapi}/wallet/emulate?ignore_signature_check=true`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ boc }),
  });

  const actions = (sim.event?.actions || []).map((a) => ({ type: a.type, ok: a.status === "ok", text: a.simple_preview?.description || a.type }));
  const failedActions = actions.filter((a) => !a.ok);
  const failedTx = failedNodes(sim.trace);
  const fee = sumFees(sim.trace);
  const simOk = actions.length > 0 && failedActions.length === 0 && failedTx.length === 0;
  add(
    net.label,
    simOk,
    simOk
      ? `${actions.length} Aktion(en) laufen fehlerfrei durch`
      : [...failedActions.map((a) => a.text + " schlägt fehl"), ...failedTx.map((t) => `Contract ${t.account?.slice(0, 10)}… Exit-Code ${t.exitCode}`)].join("; ") || "Keine Aktion erkannt",
  );

  return {
    ok: checks.every((c) => c.ok),
    checks,
    actions,
    feeTon: Number(fee) / 1e9,
    risk: sim.risk ? { ton: Number(sim.risk.ton || 0) / 1e9, jettons: (sim.risk.jettons || []).map((j) => ({ symbol: j.jetton?.symbol, amount: j.quantity })) } : null,
  };
}

// The user picks the mode. "both" requires mainnet to pass; the testnet run blocks only when it
// actually ran and failed, because most mainnet wallets hold no testnet balance.
async function preflight(body) {
  const mode = MODES[body.mode] ? body.mode : "both";
  const runs = {};
  for (const netName of MODES[mode]) {
    try { runs[netName] = await runOn(netName, body); }
    catch (e) { runs[netName] = { ok: false, unreachable: true, checks: [{ name: NETS[netName].label + " erreichbar", ok: false, detail: "Prüfung nicht möglich (" + e.message + ")" }] }; }
  }
  const t = runs.testnet;
  const ok = mode === "both" ? runs.mainnet.ok && (!t || t.ok || t.skipped) : runs[mode].ok;
  const primary = runs.mainnet || runs.testnet;
  return { ok, mode, runs, checks: primary.checks, actions: primary.actions, feeTon: primary.feeTon, risk: primary.risk };
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  try {
    return res.status(200).json(await preflight(body));
  } catch (e) {
    return res.status(200).json({ ok: false, checks: [{ name: "Simulation erreichbar", ok: false, detail: "Prüfung nicht möglich (" + e.message + "). Zur Sicherheit blockiert, bitte erneut versuchen." }] });
  }
};

module.exports.preflight = preflight;
