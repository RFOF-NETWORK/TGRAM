// Signs one real TON transaction per AI reply with the bot's own wallet (BOT_WALLET_MNEMONIC).
// The bot sends a 1-nanoton self-transfer carrying a comment, so only the network fee is spent
// and every reply gets its own verifiable transaction hash on Tonviewer/Tonscan.
const { TonClient, WalletContractV4, internal, external, beginCell, storeMessage, SendMode } = require("@ton/ton");
const { mnemonicToPrivateKey } = require("@ton/crypto");

const RPC = "https://toncenter.com/api/v2/jsonRPC";
const INDEX = "https://toncenter.com/api/v3";
const POLL_MS = 2000;
const POLL_TRIES = 8;

let keyPromise = null;
let queue = Promise.resolve();
const client = new TonClient({ endpoint: RPC });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadKey() {
  const words = (process.env.BOT_WALLET_MNEMONIC || "").trim().split(/\s+/).filter(Boolean);
  if (words.length !== 24) return Promise.resolve(null);
  keyPromise ||= mnemonicToPrivateKey(words);
  return keyPromise;
}

async function retry(fn, tries = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= tries - 1) throw e; await sleep(1200 * (i + 1)); }
  }
}

async function findTx(msgHash) {
  for (let i = 0; i < POLL_TRIES; i++) {
    await sleep(POLL_MS);
    try {
      const r = await fetch(`${INDEX}/transactionsByMessage?msg_hash=${msgHash}&direction=in&limit=1`);
      const t = r.ok ? (await r.json()).transactions?.[0] : null;
      if (t) return { hash: Buffer.from(t.hash, "base64").toString("hex"), fee: Number(t.total_fees || 0) / 1e9, utime: t.now, aborted: !!t.description?.aborted };
    } catch {}
  }
  return null;
}

async function signProof(subject) {
  const key = await loadKey();
  if (!key) return null;
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: key.publicKey });
  const state = await retry(() => client.getContractState(wallet.address));
  if (BigInt(state.balance) < 5_000_000n) return null;
  const seqno = state.state === "active" ? await retry(() => client.open(wallet).getSeqno()) : 0;
  const comment = `TGRAM KI-Antwort · user ${String(subject).slice(0, 24)} · ${new Date().toISOString().slice(0, 19)}Z`;
  const transfer = wallet.createTransfer({
    seqno,
    secretKey: key.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    messages: [internal({ to: wallet.address, value: 1n, bounce: false, body: comment })],
  });
  const ext = beginCell()
    .store(storeMessage(external({ to: wallet.address, init: state.state === "active" ? undefined : wallet.init, body: transfer })))
    .endCell();
  const msgHash = ext.hash().toString("hex");
  await retry(() => client.sendFile(ext.toBoc()));
  const tx = await findTx(msgHash);
  return tx ? { ...tx, msgHash, wallet: wallet.address.toString({ bounceable: false }) } : { hash: null, msgHash, wallet: wallet.address.toString({ bounceable: false }) };
}

// Serialized per instance so two replies never reuse the same seqno.
function signAIReply(subject) {
  const run = queue.then(() => signProof(subject)).catch((e) => { console.error("bot wallet sign failed", e?.message || e); return null; });
  queue = run.then(() => sleep(500));
  return run;
}

module.exports = { signAIReply };
