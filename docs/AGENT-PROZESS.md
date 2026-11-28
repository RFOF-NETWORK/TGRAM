# Agent-Prozess: so arbeitet die KI am Repo

Diese Datei beschreibt den Ablauf, mit dem eine KI (v0 oder die eigene TGRAM-KI)
eine Nutzeranfrage in echte, geprüfte Änderungen am Repo umsetzt.
Regel Nr. 1: Nichts gilt als "fertig", was nicht ausgeführt und geprüft wurde.

```
 NUTZER-NACHRICHT (z.B. "Gebühren pro Zeichen anzeigen")
        |
        v
 [1] VERSTEHEN ------------------------------------------------
        | Ziel in 1 Satz formulieren
        | Was ist echt machbar? Was kostet echtes Geld/Gas?
        | Unmögliches ehrlich benennen, nicht vortäuschen
        v
 [2] KONTEXT LESEN (CLI) --------------------------------------
        | git status / git log            -> wo stehen wir?
        | grep / read app/index.html      -> wo gehört der Code hin?
        | docs/GESAMTPLAN.md              -> passt es zum Plan?
        v
 [3] PLANEN ---------------------------------------------------
        | kleinste Änderung, die das Ziel erfüllt
        | bestehende Muster/Funktionen wiederverwenden
        v
 [4] BRANCH (Git) ---------------------------------------------
        | git checkout -b v0/<thema>      -> nie direkt auf main
        v
 [5] CODIEREN -------------------------------------------------
        | Edit/Write: HTML/JS (Frontend), Tolk (Contracts),
        | Python/Node (Skripte, Bot), YAML (CI-Workflows)
        v
 [6] LOKAL PRÜFEN ---------------------------------------------
        | Contracts:  npx tolk-js ...      -> kompiliert?
        | Skripte:    python -m py_compile / node --check
        | UI:         Dev-Server + agent-browser eval/screenshot
        |             -> echter Wert sichtbar? (z.B. 100 Zeichen
        |                = 832 Bit = 1 Cell = ~0.0026 TON)
        |
        +--- FEHLER? ---> zurück zu [5], Ursache beheben
        v
 [7] COMMIT + PUSH (Git) --------------------------------------
        | git add <nur relevante Dateien>
        | git commit -m "Was und warum"
        | git push origin v0/<thema>
        v
 [8] CI/CD (GitHub Actions) -----------------------------------
        | ci.yml           -> Build/Lint/Tests
        | codeql.yml       -> Sicherheits-Scan
        | scorecard.yml    -> Repo-Hygiene
        | workflow-doctor  -> Workflows selbst prüfen
        |
        +--- ROT? ---> Logs lesen (gh run view), zurück zu [5]
        v
 [9] PULL REQUEST + MERGE -------------------------------------
        | gh pr create  -> Review  -> gh pr merge
        | main = Produktion (Vercel deployt automatisch)
        v
 [10] EHRLICH BERICHTEN ---------------------------------------
        | Was ist fertig + geprüft
        | Was ist NICHT fertig + warum (z.B. fehlendes Gas)
        | Nächster konkreter Schritt
```

## Multi-Ebenen: wer macht was

```
 +-----------+     +-------------+     +---------------+     +-----------+
 |  NUTZER   | --> |   KI-AGENT  | --> |  GIT / REPO   | --> |  CI / CD  |
 | Telegram, |     | versteht,   |     | Branch, Commit|     | Actions,  |
 | Web-App   |     | plant, code |     | PR, Merge     |     | Vercel    |
 +-----------+     +------+------+     +-------+-------+     +-----+-----+
                          |                    |                   |
                          v                    v                   v
                   +-------------+     +---------------+     +-----------+
                   | WERKZEUGE   |     | SPRACHEN      |     | ON-CHAIN  |
                   | CLI, gh,    |     | JS/HTML,      |     | TON-Wallet|
                   | npx, python |     | Python, Tolk, |     | Jetton,   |
                   | browser     |     | YAML          |     | STON.fi   |
                   +-------------+     +---------------+     +-----------+
```

## Harte Regeln für die KI

1. Nie Geld, Gas, Verifizierung oder Liquidität als vorhanden melden, ohne On-Chain-Abfrage.
2. Nie Secrets (Mnemonic, Tokens, Passwörter) in Code, Commits oder Chat schreiben.
3. Jede Änderung über einen Branch, CI muss grün sein, bevor gemergt wird.
4. Wenn etwas nicht geht, sagen, warum und was es kostet, statt Erfolg vorzutäuschen.
