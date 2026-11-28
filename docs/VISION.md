# TGRAM Vision · Ein Ökosystem aus drei Repos

Festgehalten nach den Vorgaben von @Satoramy (RFOF-NETWORK). Die drei Repos bilden **eine** Mini App:

| Repo | Zweck |
| --- | --- |
| `RFOF-NETWORK/TGRAM` | Mini App, @toncoing_bot, TGRAM Copilot (KI), Vault & Credits |
| `RFOF-NETWORK/TON-Coin` | Non-custodial TON dApp, Jetton-Contracts (Tolk/Acton), STON.fi-Swap |
| `RFOF-NETWORK/rfof-network.github.ton` | PRAIAI, Tokenizer-Paket `multi_spark_tokenizer_python_paket`, Auth/Crypto/Web3-Module |

## Die Vorgaben (abgeschrieben)

1. **Verlauf-Button links neben Settings**, klein wie bei Tonkeeper. Ein Klick zeigt den eigenen Transaktionsverlauf und weitere Account-Cluster-Daten und Analyse-Status. Ein Klick auf eine Transaktion öffnet ein Popup, in dem man Tonviewer oder Tonscan wählt.
2. **Home** ist die erste Ansicht nach der Landing Page und bleibt so.
3. **TC (TGRAM Copilot)** wird aus Home herausgelöst und bekommt einen eigenen Button mit dem Bot-Symbol und eine eigene Seite.
4. **DEX** ist ein eigener Button mit eigener Ansicht: Trading-Charts, Kaufen und Verkaufen, und, wenn man verbunden ist, dauerhaft stehende, gut sortierte Infos zu den getätigten Transaktionen pro Währung.
5. **Mining** ist ein eigener Mini-App-Button.
6. **TLPFG** (Token Launchpad for Games): Man soll einen Token **plus** Mini App launchen können.
7. **Unten mehrere Haupt-Buttons auf gleicher Höhe**, jeder schaltet die ganze Ansicht um (wie Major auf Telegram).
8. **Jettons echt verwenden.** Die Plattform-Gebühren für Jettons zahlt der @toncoing_bot als Freundschaftsbündnis mit seinen Usern.
9. **Die KI bezahlt der Bot für alle.** Sie soll nicht nur echte Transaktionen, sondern alles aus dem Chat heraus ermöglichen: Coden, Chatten und alle App-Funktionen über Slash-Befehle.
10. **Sub-Befehle:** Die KI des Bots (der Bot als Entität) kann neue Sub-Befehle erstellen und wieder entfernen, aber nur über Slash-Befehle und nur nach einem **Allow-Popup**. So bleibt es sicher und auf den Chat beschränkt.
11. **KI-Chat wie ein echter Coding-Agent:** Man soll sich mit GitHub verbinden und mit Repos bzw. in Repos coden können.
12. **Telegram Stars** werden durch die Transaktionen des Bots verdient. Die eigenen Token sollen diesen Wert schaffen und ihn als Anreiz zur Nutzung der KI an die User weitergeben.

## Umsetzung im Code

| # | Umsetzung | Datei |
| --- | --- | --- |
| 1 | `#verlauf`: Account-Analyse (Status, Wallet-Version, Balance, letzte Aktivität, Ein/Aus, Scam-Flag), Cluster der häufigsten Gegenparteien, Explorer-Popup (Tonviewer / Tonscan / TON Explorer) | `app/index.html` |
| 2 | `#home` ist die Standardansicht | `app/index.html` |
| 3 | `#tc` mit eigenem Bot-Button | `app/index.html` |
| 4 | `#dex`: Kerzen-Chart (CoinGecko für TON, GeckoTerminal für Jettons), Kaufen/Verkaufen, Liste „Meine Transaktionen“ mit Währungsfilter | `app/index.html` |
| 5 | `#staking` als Mining-Button | `app/index.html` |
| 6 | `#launchpad` (TLPFG): TEP-64-Metadaten, Deploy über minter.ton.org, Mini App über @BotFather `/newapp`, Pool auf STON.fi | `app/index.html` |
| 7 | Bottom-Nav: Home · Trading · TC · TLPFG · Mining | `app/index.html` |
| 8 | TEP-74-Jetton-Transfers; TON-Swaps 1 % an den Vault, Jetton-Gebühr 0 % | `app/index.html` |
| 9 | Slash-Befehle im TC: `/help /balance /send /receive /swap /verlauf /mining /launch /repo /file /cmd /clear` | `app/index.html` |
| 10 | Mini App: `/cmd add/remove` erst nach Allow-Dialog. Bot: Inline-Buttons „Erlauben/Ablehnen“, gespeichert pro Chat über `setMyCommands` | `app/index.html`, `api/telegram.js` |
| 11 | `/repo owner/name` lädt ein öffentliches GitHub-Repo als Kontext, `/file pfad frage` gibt eine Datei an die KI | `app/index.html` |
| 12 | `/stars <n>`: Telegram-Stars-Rechnung (XTR), 1 Star = 1 Credit; das Ledger liest der Bot direkt über `getStarTransactions` | `api/telegram.js`, `api/_economy.js` |

## Offene Grenzen (ehrlich)

- **Stars an User auszahlen:** Die Bot API hat keine direkte Stars-Überweisung an User. Möglich sind Geschenke aus dem Bot-Guthaben (`sendGift`) oder Premium-Geschenke. Das ist der nächste Schritt für die Belohnungen.
- **In Repos schreiben (Commits/PRs)** braucht einen GitHub-OAuth-Login. Lesen geht schon ohne Login über die öffentliche API.
- **Jetton-Contracts** im Repo TON-Coin sind ein ungeprüfter Acton-Starter. Vor einem Mainnet-Deploy braucht es ein Audit.
- **Eigene Sub-Befehle in der Mini App** werden pro Gerät gespeichert, im Bot pro Chat bei Telegram.
