# TGRAM Gesamtplan (zusammengeführt, Stand 28.11.2026)

## Gang des Systems

```
 User schreibt mit KI (TC)
        |
        v
 [Zeichen -> Bytes -> Bits/Zellen] --> TON-Gebühr pro Nachricht (Kostenrechner, Tab MTS)
        |
        v
 Bot-Wallet (Extension-Wallet, 24/7, eigene Rechte) signiert Antwort on-chain
        |
        +--> AXF wird gemintet (TEP-74-Minter, Supply startet bei 0)        [wartet auf Deploy]
        |        Schichten der Formel: (∞×) 4× / 2× / 1×
        |
        +--> STON.fi-Pool AXF/TON 50 %:50 % = 100 % dual                    [wartet auf TON-Seite]
        |        Arbitrage, Marge und Flash-Swaps nur gegen echte Liquidität im Pool
        |
        +--> Speicher wächst je User (Supabase + TON-Speichergebühr)        [bezahlt aus Gebühren]

 Telegram Stars (XTR): nur über XTR-Rechnungen und das Telegram-Affiliate-Programm
 (Freunde einladen). Eine Wallet kann keine Stars erzeugen.
 Andere Coins (TON, MAJOR, NEC, 600+ STON.fi-Token): handelbar, nicht von uns mintbar.
```

## Status

| Schritt | Kosten ca. | Status |
|---|---|---|
| Bot-Wallet aktiv (v4r2, seqno 2) | 0,01 TON | erledigt |
| KI-Antwort signieren | ~0,0026 TON je Nachricht | möglich (Restguthaben ~0,046 TON) |
| AXF-Minter + Wallet (offizieller Tolk-Code) | ~0,15 TON | kompiliert, Deploy offen |
| Verifizierung verifier.ton.org | ~0,5 TON | offen |
| STON.fi-Pool AXF/TON | ~0,3 TON Gas + TON-Seite | offen |

## Gebührenformel (TON Config-Parameter 25, Basechain)

```
fwd_fee = lump + ceil((bit_price * bits + cell_price * cells) / 2^16)
lump = 66667, bit_price = 4369067, cell_price = 436906667   (nanoTON)
bits = 32 + 8 * bytes(UTF-8),  cells = ceil((bytes + 4) / 127)
```

Beispiel mit 100 ASCII-Zeichen: rund 0,000129 TON Weiterleitung, plus rund 0,0025 TON Wallet-Gas.
