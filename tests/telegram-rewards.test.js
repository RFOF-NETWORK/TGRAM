const test = require("node:test");
const assert = require("node:assert/strict");

test("AI replies distinguish temporary points and vault context from real payments", async () => {
  const economyPath = require.resolve("../api/_economy");
  let transactions = [];
  require.cache[economyPath] = {
    id: economyPath,
    filename: economyPath,
    loaded: true,
    exports: {
      PRICING: { cost: { ai: 0 } },
      charge: async () => ({ ok: true, free: true }),
      askAI: async () => "Antwort",
      ledger: async () => ({ txs: transactions }),
      explorerLinks: (hash) => ({ tonviewer: `https://tonviewer.com/transaction/${hash}`, tonscan: `https://tonscan.org/tx/${hash}` }),
      botLatestTx: async () => ({ hash: "vault-hash", fee: 0.01 }),
      rewardAI: () => ({ earned: 1, total: 1 }),
    },
  };
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_BOT_TOKEN = "test";
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  const messages = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (url.endsWith("/sendMessage")) messages.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true }) };
  };
  try {
    const handler = require("../api/telegram");
    const req = { method: "POST", headers: {}, body: { message: { chat: { id: 1 }, from: { id: 1 }, text: "/ask hallo" } } };
    const res = { status() { return this; }, json() { return this; } };
    await handler(req, res);
    assert.match(messages[0].text, /keine Telegram Stars/);
    assert.match(messages[0].text, /Letzte Vault-Transaktion \(kein Nachweis fuer diese Antwort\)/);
    assert.equal(messages[0].reply_markup.inline_keyboard[0][0].url, "https://tonviewer.com/transaction/vault-hash");

    transactions = [{ hash: "payment-hash", amount: 0.1, token: "TON", fee: 0.01 }];
    await handler(req, res);
    assert.match(messages[1].text, /Letzte zugeordnete Vault-Zahlung: 0.1 TON/);
    assert.equal(messages[1].reply_markup.inline_keyboard[0][0].url, "https://tonviewer.com/transaction/payment-hash");
  } finally {
    global.fetch = originalFetch;
    delete require.cache[economyPath];
    delete require.cache[require.resolve("../api/telegram")];
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret;
  }
});
