export function buildEnergyStoragePayload(bagIdHex, ownerWallet) {
  return {
    opcode: "0x42414749",
    ownerWallet,
    supportedTokens: ["TON", "NEC", "BBC"],
    tonStorageBagId: bagIdHex,
    gasMode: "contract-energy-sponsored",
    storageLayer: "ton-c4-cell + ton-storage-bag"
  };
}

export async function checkContractEnergyBalance(contractAddress, apiKey = "") {
  const url = `https://toncenter.com{contractAddress}`;
  const res = await fetch(url, {
    headers: apiKey ? { "X-API-Key": apiKey } : {}
  });
  return res.json();
}
