import { TonConnectUI } from '@tonconnect/ui';

export interface TgramDualStackConfig {
  manifestUrl: string;
  vaultAddress: string; // Wird dynamisch aus extensions.json gezogen
  ownerRawPrefix: string; // "0:e4fb51"
  isDashboardScreen2: boolean; // Screen 1 = false
  onOwnerVerified: (rawAddress: string) => void;
}

export function initParallelTonConnect(config: TgramDualStackConfig) {
  const tonConnectUI = new TonConnectUI({
    manifestUrl: config.manifestUrl,
    ...(config.isDashboardScreen2 ? { buttonRootId: 'tgram-dual-wallet-slot' } : {})
  });

  tonConnectUI.setConnectRequestParameters({
    state: 'ready',
    value: { tonProof: `rfof-tgram-auth-${Date.now()}` }
  });

  tonConnectUI.onStatusChange((wallet) => {
    if (!wallet) return;
    const connectedRaw = wallet.account.address;
    if (connectedRaw.toLowerCase().startsWith(config.ownerRawPrefix.toLowerCase())) {
      config.onOwnerVerified(connectedRaw);
    }
  });

  async function sendParallelTonTransfer(amountTon: number) {
    const nanoTon = Math.floor(amountTon * 1e9).toString();
    return await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [{ address: config.vaultAddress, amount: nanoTon }]
    });
  }

  return { tonConnectUI, sendParallelTonTransfer };
}
