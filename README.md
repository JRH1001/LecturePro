# Lecture Pro

English version coming soon. Yeah i know credits for Claude, but its working so far, so what do you want more :)

Zotero-Markierungen → fertige Vorlesungs-Zusammenfassung in Obsidian. Ohne KI, rein algorithmisch.

## Installation
1. Ordner `lecture-pro` (enthält `main.js` + `manifest.json`) nach `<Vault>/.obsidian/plugins/` kopieren.
2. Obsidian: Einstellungen → Community-Plugins → *Lecture Pro* aktivieren.
3. Verbindung (Plugin-Einstellungen), danach immer **„Verbindung testen“** klicken:
   - **Zotflow-Reader / Handy / Tablet:** Modus **Web**. Nur den Lese-API-Key einfügen (zotero.org/settings/keys) – die User-ID trägt der Test automatisch ein.
   - **Zotero-Dateien per WebDAV:** zusätzlich WebDAV-URL (wie in Zotero, ohne `/zotero`), Benutzer, Passwort eintragen. Nötig für Bilder im Web-Modus; der Test prüft die Datei der letzten Vorlesung auf dem Server.
   - **Zotero-Reader am PC:** Modus **Lokal**; in Zotero Einstellungen → Erweitert → „Andere Anwendungen auf diesem Computer dürfen mit Zotero kommunizieren“ aktivieren. Bilder werden von der Platte gelesen (WebDAV egal).
   - API-Key und WebDAV-Passwort liegen in Obsidians SecretStorage (pro Gerät, nicht im Vault/data.json) – am zweiten Gerät neu eintragen.

## Farben = Hierarchie (Taste = Ziffer im Reader)
| Taste | Farbe | Rolle |
|---|---|---|
| 1 | Gelb | Fakt → Stichpunkt (Standardfarbe) |
| 2 | Rot | Überschrift 1 |
| 3 | Grün | Überschrift 2 |
| 4 | Blau | Überschrift 3 |
| 5 | Violett | Überschrift 4 |
| 6 | Magenta | Beispiel → Stichpunkt mit „**Bsp.:**“ |
| 7 | Orange | **Titel (h0)** = Haupt-Thema: gibt der Notiz den Namen (keine Überschrift im Text). Mehrere Titel in einem PDF (Buch) → im Export-Dialog unter „Abschnitte“ **auswählbar** |
| 8 | Grau | wird ignoriert |

Alles in den Einstellungen änderbar (inkl. „Zurücksetzen“).

## Workflow in der Vorlesung
1. **Alt+1** → Markieren-Werkzeug, **1** → Gelb. Ab jetzt nur noch markieren.
2. Neue Folie/Thema: Taste **2–5** → Folientitel markieren → Taste **1** zurück zu Gelb.
3. Fakt = markieren. Beispiel: **6**, markieren, **1**.
4. Prof sagt etwas Zusätzliches: Markierung anklicken → Kommentar.
5. Abschweifung: **Alt+3** (Sticky Note) an die Stelle setzen. Zeile 1 `!Überschrift`, dann `- Punkt` pro Zeile.
6. Bild: **Alt+5** (Rechteck) um den Ausschnitt; Kommentar = Bildunterschrift (Farbe egal).

*Die Tastenkürzel stammen aus dem Quellcode des Zotero-Readers (Zotflow-Fork) und sollten im Reader kurz gegengetestet werden. Am Tablet tippst du die Farben in der Werkzeugleiste.*

Nach der Vorlesung: Ribbon-Icon 🎓 oder Befehl **„Vorlesung aus Zotero importieren“** → Enter (zuletzt bearbeitete PDF steht oben). Die Notiz wird neu angelegt, bestehende Notizen werden **nie überschrieben**.

## Export-Dialog
Nach der Auswahl der Vorlesung erscheint ein Dialog. **Enter = sofort erstellen** (eine Notiz mit allen Markierungen). Darunter, eingeklappt, **„Erweitert“**. Der **Bereich** bestimmt, was entsteht:

| Bereich | Ergebnis |
|---|---|
| **Alles** | eine Notiz. Name = einzige Titel-Markierung (Taste 7), sonst PDF-Name |
| **Seiten** | eine Notiz aus PDF-Seitenzahlen, z. B. `1-5, 8, 12-` („12-“ = bis Ende) |
| **Abschnitte** | **du wählst per Häkchen**, welche Abschnitte exportiert werden – je Abschnitt eine Notiz, Dateiname = Abschnittstitel |

**Abschnitte** stammen wahlweise aus den **Titel-Markierungen** (Taste 7; Inhalt vor dem ersten Titel = „… (Vorspann)“) oder aus dem **Inhaltsverzeichnis des PDFs** (Lesezeichen; Ebene wählbar, das PDF wird dafür geladen). Es ist nichts vorgewählt, außer es gibt nur einen Abschnitt mit Inhalt. Für **eine gemeinsame Notiz aus mehreren Kapiteln** nimm „Seiten“.

Weitere Optionen (werden als Standardwerte gemerkt): Bilder einbinden · **Bildauflösung** (Niedrig 144 dpi · Standard 216 dpi · Hoch 288 dpi · Sehr hoch 432 dpi; zu große Ausschnitte werden automatisch begrenzt) · Seitenverweise (keine / an Überschriften / an jedem Punkt) · Quellen-Fußzeile · Zotero-Tags übernehmen · Zielordner · Notiz öffnen.

## Ausgabeformat (wie in den Mitschriften)
`# Überschrift 1` ist eine echte Überschrift. Ebene 2–4 sind **eingerückte Listen-Überschriften** (`- ## …`, `\t- ### …`, `\t\t- #### …`), der Inhalt rückt jeweils eine Stufe darunter – so lässt sich alles in Obsidian einklappen.

## Regeln
- Reihenfolge = Position im PDF, nicht Zeitpunkt des Markierens.
- Sticky Note `!Titel` = neue Überschrift, eine Ebene unter der aktuellen; alles danach landet darunter, bis die nächste Überschrift kommt.
- Sticky-Zeilen: `- ` am Zeilenanfang = Stichpunkt (Einrückung = Unterpunkt); `->` und andere Symbole bleiben Text; normale Zeilen werden ebenfalls Stichpunkte.
- Text-Box-Markierungen verhalten sich wie Sticky Notes.
- Bilder werden aus dem PDF geschnitten (Attachment-Ordner nach deinen Obsidian-Einstellungen).
- Am Ende: Link zur PDF in Zotero, Datum der ersten Markierung, Seitenbereich. Zotero-Tags der PDF werden zu `#Tags`.

## Entwicklung
`npm i && npm test && npm run build`. Lizenz: MIT.

| Datei | Aufgabe |
|---|---|
| `core.ts` | Einstellungen, Farbrollen, Annotationen → Notiz (Markdown) |
| `sections.ts` | Seiten, Kapitel, Titel-Markierungen, Abschnittsauswahl |
| `crop.ts` | Bildausschnitt rendern (Auflösung, Pixel-Obergrenze) |
| `outline.ts`, `zip.ts` | PDF-Inhaltsverzeichnis, WebDAV-Zip entpacken |
| `zotero.ts` | Zotero-Zugriff (lokal/Web/WebDAV), Verbindungstest |
| `pdf.ts` | PDF öffnen (Obsidians pdf.js) |
| `exporter.ts` | Notizen und Bilder ins Vault schreiben |
| `modals.ts`, `settings-tab.ts`, `main.ts` | Oberfläche und Plugin-Ablauf |

Tests (`test/`) laufen ohne Obsidian, auch gegen echte PDFs (Lesezeichen, Bildausschnitt).
