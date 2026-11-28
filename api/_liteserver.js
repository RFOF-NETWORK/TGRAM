// Direct TON liteserver access (own TON Console liteservers) so chain reads do not go
// through a third-party HTTP API. Callers fall back to Toncenter when this returns null.

const SERVERS = [
  { host: process.env.TON_LITESERVER_1 || "31.57.199.1:5053", key: process.env.TON_LITESERVER_1_KEY || process.env.key },
  { host: process.env.TON_LITESERVER_2 || "163.5.62.1:5053", key: process.env.TON_LITESERVER_2_KEY || process.env.key_2 },
].filter((s) => s.host && s.key);

const HANDSHAKE_MS = 3000;
const QUERY_TIMEOUT_MS = 6000;

let lib = null;
function loadLib() {
  if (lib === null) {
    try {
      const { LiteClient, LiteSingleEngine, LiteRoundRobinEngine } = require("ton-lite-client");
      const { Address, Cell, loadTransaction } = require("@ton/core");
      lib = { LiteClient, LiteSingleEngine, LiteRoundRobinEngine, Address, Cell, loadTransaction };
    } catch {
      lib = false;
    }
  }
  return lib;
}

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("liteserver timeout")), ms))]);

// Reused across warm serverless invocations; the ADNL handshake is the slow part.
let clientPromise = null;
function getClient() {
  const l = loadLib();
  if (!l || SERVERS.length === 0) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const engines = SERVERS.map(
        (s) => new l.LiteSingleEngine({ host: `tcp://${s.host}`, publicKey: Buffer.from(String(s.key).trim(), "base64") }),
      );
      const engine = engines.length > 1 ? new l.LiteRoundRobinEngine(engines) : engines[0];
      await new Promise((r) => setTimeout(r, HANDSHAKE_MS));
      return new l.LiteClient({ engine });
    })().catch((e) => { clientPromise = null; throw e; });
  }
  return clientPromise;
}

// Latest transaction of an account: { hash (hex), utime, fee (TON) } or null.
async function latestTx(address) {
  try {
    const pending = getClient();
    if (!pending) return null;
    const client = await pending;
    const l = loadLib();
    const addr = l.Address.parse(address);
    const mc = await withTimeout(client.getMasterchainInfo(), QUERY_TIMEOUT_MS);
    const state = await withTimeout(client.getAccountState(addr, mc.last), QUERY_TIMEOUT_MS);
    if (!state || !state.lastTx) return null;
    const hashBuf = Buffer.from(BigInt(state.lastTx.hash).toString(16).padStart(64, "0"), "hex");
    const res = await withTimeout(
      client.getAccountTransactions(addr, String(state.lastTx.lt), hashBuf, 1),
      QUERY_TIMEOUT_MS,
    );
    const cells = l.Cell.fromBoc(res.transactions);
    if (!cells.length) return null;
    const tx = l.loadTransaction(cells[0].beginParse());
    return {
      hash: hashBuf.toString("hex"),
      utime: tx.now,
      fee: Number(tx.totalFees.coins) / 1e9,
      source: "liteserver",
    };
  } catch {
    clientPromise = null;
    return null;
  }
}

module.exports = { latestTx, liteserverCount: SERVERS.length };
