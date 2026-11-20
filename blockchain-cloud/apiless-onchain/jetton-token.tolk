tolk 0.6

// TEP-74 Jetton Master & Wallet Blueprint (APIless On-Chain)
const OP_MINT = 21;
const OP_BURN = 0x595f07bc;

fun onInternalMessage(myBalance: int, msgValue: int, inMsgFull: cell, inMsgBody: slice) {
    if (inMsgBody.isEmpty()) {
        return; // Einfache TON-Einzahlung akzeptieren
    }
    val op = inMsgBody.loadUint(32);
    if (op == OP_MINT) {
        // Mint-Logik für Admin-Wallet
    }
}
