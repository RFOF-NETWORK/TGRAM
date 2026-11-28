const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("contract list distinguishes account status, verification and missing deployments", async () => {
  const html = fs.readFileSync(require.resolve("../app/index.html"), "utf8");
  const code = html.slice(html.indexOf("  const CONTRACTS = ["), html.indexOf("  function renderPlan()"));
  const box = { innerHTML: "" };
  let calls = 0;
  const context = {
    document: { getElementById: () => box },
    esc: (value) => String(value),
    console: { warn() {} },
    fetch: async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ status: "active", interfaces: ["wallet"] }) };
    },
  };
  vm.createContext(context);
  vm.runInContext(code, context);

  await context.renderContracts();
  assert.match(box.innerHTML, /Kontostatus nicht verfügbar/);
  assert.match(box.innerHTML, /Konto aktiv/);
  assert.match(box.innerHTML, /Verifizierung im Verifier prüfen/);
  assert.match(box.innerHTML, /Deployment-Adresse nicht hinterlegt · Verifizierung unbekannt/);
  assert.match(box.innerHTML, /https:\/\/github.com\/RFOF-NETWORK\/TON-Coin\/blob\/main\/contracts\/JettonMinter.tolk/);
  assert.match(box.innerHTML, /https:\/\/verifier.ton.org\/UQBg9Q1kUBfe5pRgguB5M2XzCSxwaZ0nIXRcovleeh-QSv27/);

  await context.renderContracts(true);
  assert.doesNotMatch(box.innerHTML, /Kontostatus nicht verfügbar/);
  assert.equal(calls, 4);
});
