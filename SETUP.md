# Einrichtung: Ranking-Posting über GitHub Actions (Option 2)

Ziel: Das Ranking wird künftig von GitHubs eigener IP nach Discord gepostet.
Damit verschwindet das Cloudflare-1015-Problem. Die Rating-Berechnung im
Google Sheet bleibt **unverändert** – nur das Posten zieht um.

Du brauchst dafür kein Programmieren, nur Kopieren/Einfügen und Klicken.

---

## Überblick: was wo lebt

- **Google Sheet** rechnet wie bisher und schreibt das Ranking-Tab.
- **GitHub** liest das Ranking als CSV, postet zu Discord, merkt sich den
  Snapshot (für Pfeile / NEW entries) in `snapshot.json`.

Neuer Ablauf nach jedem Update:
1. Im Sheet: **Racing → Ratings & Ranking neu berechnen** (aktualisiert das Ranking-Tab)
2. Auf GitHub: **Actions → Post Ranking to Discord → Run workflow**

---

## Schritt 1 – GitHub-Account & Repository

1. Falls noch kein Account: auf https://github.com registrieren.
2. Oben rechts **+ → New repository**.
3. Name z. B. `simracing-ranking-bot`, Sichtbarkeit **Private**, **Create repository**.

## Schritt 2 – Dateien hochladen

Lade diese drei Dateien (aus dem Ordner `simracing-discord-runner`) ins Repo:

- `post-ranking.mjs`
- `snapshot.json`
- `.github/workflows/post-ranking.yml`  ← der Ordnerpfad ist wichtig!

Am einfachsten: im Repo **Add file → Upload files**, dann die Dateien
hineinziehen. Den Workflow-Ordner legst du an, indem du beim Dateinamen
`.github/workflows/post-ranking.yml` eintippst (die Schrägstriche erzeugen
die Ordner automatisch).

## Schritt 3 – Google Sheet lesbar machen

Damit GitHub das Ranking lesen kann:

1. Im Sheet oben rechts **Freigeben**.
2. Unter „Allgemeiner Zugriff": **Jeder mit dem Link**, Rolle **Betrachter**.
   (Nur Lesen. Es stehen nur Fahrernamen + Ratings drin – dieselben Daten,
   die ohnehin öffentlich auf Discord gepostet werden.)
3. **CSV-Link bauen:** Öffne das **Ranking**-Tab. Schau in die Browser-
   Adressleiste – am Ende steht `#gid=ZAHL`. Diese ZAHL ist die Tab-ID.
   Der CSV-Link lautet dann:

   ```
   https://docs.google.com/spreadsheets/d/1K7dAEFipikKOX8KxjgdFADQXB146Rgtuku5F5YDKgcE/export?format=csv&gid=DEINE_GID
   ```

   Teste den Link einmal im Browser – es sollte eine CSV-Datei mit den
   Ranking-Spalten herunterladen/anzeigen.

## Schritt 4 – Secrets in GitHub eintragen

Im Repo: **Settings → Secrets and variables → Actions → New repository secret**.
Lege zwei Secrets an:

| Name              | Wert                                                        |
|-------------------|-------------------------------------------------------------|
| `SHEET_CSV_URL`   | der CSV-Link aus Schritt 3                                   |
| `DISCORD_WEBHOOK` | die Webhook-URL deines **offiziellen** Channels             |

> Den Webhook NICHT mehr im Sheet lassen müssen – ab jetzt lebt er sicher
> hier in den GitHub-Secrets.

## Schritt 5 (empfohlen) – Snapshot vorbefüllen

Damit der erste Post korrekte Pfeile zeigt (statt 100x „NEW entry"):

1. Im Apps Script diese Mini-Funktion einfügen und ausführen:

   ```javascript
   function dumpSnapshot() {
     const s = PropertiesService.getScriptProperties().getProperty('lastRankingSnapshot');
     Logger.log(s || '[]');
   }
   ```

2. Den ausgegebenen JSON-Text kopieren.
3. Im Repo `snapshot.json` öffnen → **Edit** (Stift) → kompletten Inhalt durch
   den kopierten Text ersetzen → **Commit changes**.

Überspringst du das, ist nur der allererste Post „alle neu" – ab dem zweiten
stimmen die Pfeile von selbst.

## Schritt 6 – Testlauf

1. Repo → **Actions** → links **Post Ranking to Discord** → rechts **Run workflow**.
2. Klick in die Ausführung – du siehst dasselbe Logging wie gewohnt
   (`[SEND] ... OK`, am Ende `[RESULT] Alle Nachrichten gesendet`).
3. Schau im Discord-Channel, ob alles korrekt steht.

## Schritt 7 – Apps-Script-Posten abschalten

Sobald Schritt 6 sauber klappt, damit nichts doppelt postet und die
Cloudflare-Sperre nie wieder getriggert wird:

- In `recalcRatingsAndRanking` den Aufruf von `postRankingToDiscord(...)`
  auskommentieren (`//` davor) oder löschen. Den Rest der Funktion
  (Berechnung + Ranking-Tab schreiben) **unverändert lassen**.

Fertig. Ab jetzt: Sheet neu berechnen → auf GitHub „Run workflow".
