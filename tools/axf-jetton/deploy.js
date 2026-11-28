// Builds and (optionally) deploys the AXF TEP-74 jetton minter from the official
// ton-blockchain/token-contract sources (jetton-minter-discoverable.fc + jetton-wallet.fc).
// Usage: node deploy.js <path-to-token-contract-checkout> [--send]
// --send deploys from the bot wallet (BOT_WALLET_MNEMONIC); without it this is a dry run.
const fs = require("fs");
const path = require("path");
const { compileFunc } = require("@ton-community/func-js");
const { Cell, beginCell, Address, contractAddress, Dictionary, internal, SendMode } = require("@ton/core");
const { TonClient, WalletContractV4 } = require("@ton/ton");
const { sha256_sync, mnemonicToPrivateKey } = require("@ton/crypto");

const ADMIN = "0:e4fb51aa7386080b6d8b4c00192f1a26864ca9f95e76074c9a787826937b7d2e"; // satoramy-on.ton
const DEPLOY_VALUE = 50_000_000n; // 0.05 TON stays on the minter for storage fees

const IMAGE = "https://ton.org/download/ton_symbol.png";
const single = (name, symbol) => ({
  name,
  symbol,
  decimals: "9",
  description: `${symbol} - ${name}. Einzelwaehrung von AXF (ABillity XP FPS) im TGRAM-Netzwerk (RFOF-NETWORK). Startmenge 0; Menge entsteht nur durch Mints des Admins.`,
  image: IMAGE,
});
// AXF metadata must stay byte-identical: it determines the already deployed minter address.
const TOKENS = {
  AXF: {
    name: "ABillity XP FPS",
    symbol: "AXF",
    decimals: "9",
    description: "AXF - ABillity XP FPS. TEP-74 Jetton im TGRAM-Netzwerk (RFOF-NETWORK). Startmenge 0; Menge entsteht nur durch Mints des Admins.",
    image: IMAGE,
  },
  ABILLITY: single("ABillity", "ABILLITY"),
  XP: single("XP", "XP"),
  FPS: single("FPS", "FPS"),
};

const root = process.argv[2];
const send = process.argv.includes("--send");
const tokenArg = (process.argv.find((a) => a.startsWith("--token=")) || "--token=AXF").slice(8).toUpperCase();
const META = TOKENS[tokenArg];
if (!root || !META) { console.error("usage: node deploy.js <token-contract-dir> [--token=AXF|ABILLITY|XP|FPS] [--send]"); process.exit(1); }

const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const sources = {
  "stdlib.fc": read("stdlib.fc"),
  "params.fc": read("ft/params.fc"),
  "op-codes.fc": read("ft/op-codes.fc"),
  "discovery-params.fc": read("ft/discovery-params.fc"),
  "jetton-utils.fc": read("ft/jetton-utils.fc"),
  "jetton-wallet.fc": read("ft/jetton-wallet.fc"),
  "jetton-minter-discoverable.fc": read("ft/jetton-minter-discoverable.fc"),
};

async function compile(targets) {
  const r = await compileFunc({ targets, sources });
  if (r.status === "error") throw new Error(r.message);
  return Cell.fromBoc(Buffer.from(r.codeBoc, "base64"))[0];
}

const snake = (s) => beginCell().storeUint(0, 8).storeStringTail(s).endCell();

function onchainContent(fields) {
  const dict = Dictionary.empty(Dictionary.Keys.Buffer(32), Dictionary.Values.Cell());
  for (const [k, v] of Object.entries(fields)) dict.set(sha256_sync(k), snake(v));
  return beginCell().storeUint(0, 8).storeDict(dict).endCell();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Toncenter's keyless tier allows ~1 request/s and answers 429 above that.
async function retry(fn, tries = 6) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

async function main() {
  const walletCode = await compile(["stdlib.fc", "params.fc", "op-codes.fc", "jetton-utils.fc", "jetton-wallet.fc"]);
  const minterCode = await compile(["stdlib.fc", "params.fc", "op-codes.fc", "discovery-params.fc", "jetton-utils.fc", "jetton-minter-discoverable.fc"]);
  const data = beginCell()
    .storeCoins(0)
    .storeAddress(Address.parse(ADMIN))
    .storeRef(onchainContent(META))
    .storeRef(walletCode)
    .endCell();
  const init = { code: minterCode, data };
  const minter = contractAddress(0, init);

  console.log("minter code hash", minterCode.hash().toString("hex"));
  console.log("wallet code hash", walletCode.hash().toString("hex"));
  console.log("minter address  ", minter.toString({ bounceable: true }));
  console.log("minter raw      ", minter.toRawString());
  if (!send) return;

  const words = (process.env.BOT_WALLET_MNEMONIC || "").trim().split(/\s+/);
  if (words.length !== 24) throw new Error("BOT_WALLET_MNEMONIC missing");
  const key = await mnemonicToPrivateKey(words);
  const client = new TonClient({ endpoint: "https://toncenter.com/api/v2/jsonRPC" });
  const state = await retry(() => client.getContractState(minter));
  if (state.state === "active") { console.log("already deployed"); return; }
  await sleep(1500);

  const wallet = client.open(WalletContractV4.create({ workchain: 0, publicKey: key.publicKey }));
  const seqno = await retry(() => wallet.getSeqno());
  await sleep(1500);
  const transfer = wallet.createTransfer({
    seqno,
    secretKey: key.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages: [internal({ to: minter, value: DEPLOY_VALUE, bounce: false, init, body: beginCell().endCell() })],
  });
  // Re-sending the same signed message is safe: the wallet's seqno check rejects duplicates.
  await retry(() => wallet.send(transfer));
  console.log("sent with seqno", seqno);
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const s = await client.getContractState(minter).catch(() => null);
    if (s?.state === "active") { console.log("deployed, balance", Number(s.balance) / 1e9); return; }
  }
  console.log("not active yet - check Tonviewer");
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
