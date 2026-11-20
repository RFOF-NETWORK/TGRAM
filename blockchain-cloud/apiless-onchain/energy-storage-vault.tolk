tolk 0.6

const OP_STORE_DATA = 0x53544f52;
const OP_LINK_BAG_ID = 0x42414749;

struct VaultStorage {
    ownerAddress: address;
    energyReserveNano: coins;
    tonStorageBagId: uint256;
    payloadCell: cell;
}

fun VaultStorage.load(): VaultStorage {
    return VaultStorage.fromCell(contract.getData());
}

fun VaultStorage.save(self) {
    contract.setData(self.toCell());
}

fun onInternalMessage(myBalance: int, msgValue: int, inMsgFull: cell, inMsgBody: slice) {
    if (inMsgBody.isEmpty()) {
        return;
    }
    val op = inMsgBody.loadUint(32);
    var storage = VaultStorage.load();

    if (op == OP_STORE_DATA) {
        storage.payloadCell = inMsgBody.loadRef();
        storage.save();
    } else if (op == OP_LINK_BAG_ID) {
        storage.tonStorageBagId = inMsgBody.loadUint(256);
        storage.save();
    }
}

get fun getTonStorageBagId(): uint256 {
    val storage = VaultStorage.load();
    return storage.tonStorageBagId;
}
