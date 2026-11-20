export const TGRAM_APP_CONFIG = {
  owner: "RFOF-NETWORK",
  tokens: ["TON", "NEC", "BBC"],
  modules: ["wallet", "dex", "launchpad", "energy-storage"],
  rpcEndpoint: "https://toncenter.com"
};

export function initAppModules() {
  console.log("TGRAM App gestartet:", TGRAM_APP_CONFIG);
  return TGRAM_APP_CONFIG;
}
