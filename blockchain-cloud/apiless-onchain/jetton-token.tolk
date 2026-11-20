tolk 0.6

const OP_MINT = 21;
const OP_BURN = 0x595f07bc;

fun onInternalMessage(myBalance: int, msgValue: int, inMsgFull: cell, inMsgBody: slice) {
    if (inMsgBody.isEmpty()) {
        return;
    }
    val op = inMsgBody.loadUint(32);
    if (op == OP_MINT) {
        // Mint-Logik für Owner-Wallet
    }
}
