export function createTonTransaction(destinationAddress, amountNanoTon, payloadBoc = "") {
  return {
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: destinationAddress,
        amount: String(amountNanoTon),
        payload: payloadBoc
      }
    ]
  };
}
