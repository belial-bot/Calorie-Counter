# Calorie-Counter

Ein Kalorienzähler als installierbare Web-App.

---

## Was drin ist

- **Eintragen** über Suche, Barcode-Scan oder von Hand
- **Nährwerte** aus [Open Food Facts](https://de.openfoodfacts.org) — offene Datenbank, kein API-Schlüssel
- **Suche mit Region, Marke und Tippfehlertoleranz** — „skyr ja" findet den Skyr von ja!
- **Tagesansicht** mit Kalorien und den drei Makros gegen dein Ziel
- **Verlauf** über 30 Tage, jeder Tag anklickbar und nachträglich änderbar
- **Eigene Lebensmittel** speichern und wiederverwenden
- **Deutsch und Englisch**, umschaltbar unter *Ziele → Sprache*
- **Offline** nutzbar, sobald sie einmal geladen wurde
- **Kopie sichern / laden** als JSON-Datei

Alles wird ausschließlich im `localStorage` deines Geräts gespeichert. Es gibt keinen Server,
der irgendetwas mitbekommt.

---

## Auf dem iPhone installieren

1. Die Adresse **in Safari** öffnen (nicht Chrome — nur Safari darf auf dem iPhone Web-Apps installieren)
2. Teilen-Symbol unten → **Zum Home-Bildschirm**
3. Name bestätigen

Ab jetzt liegt sie als Icon auf dem Home-Bildschirm und startet ohne Browser-Leiste im Vollbild.

---

## Barcode-Scan

Der Scan braucht **HTTPS**. Über GitHub Pages ist das automatisch der Fall.

---

## Anpassen

| Was | Wo |
|---|---|
| Farben, Schriftgrößen, Abstände | `css/style.css`, ganz oben im `:root`-Block |
| Texte und Übersetzungen | `js/i18n.js` |
| Reihenfolge der Suchtreffer | `js/search.js`, die Gewichte in `score()` |
| Länder in der Regionsauswahl | `js/off.js` (`COUNTRIES`) und `js/store.js` (`REGIONS`) |
| Name der App | `index.html` (`<title>`, `apple-mobile-web-app-title`) und `manifest.webmanifest` |
| Icon | `icons/` — vier PNGs ersetzen, gleiche Dateinamen und Größen behalten |
| Start-Ziele für neue Nutzer | `js/store.js`, `DEFAULTS.goals` |
| Länge des Verlaufs | `js/app.js`, `Store.recentDays(30)` |

Die drei Makro-Farben sind `--protein`, `--carbs` und `--fat` und werden überall
daraus abgeleitet — einmal ändern reicht.

**Region.** Unter *Ziele → Region* legst du fest, aus welchem Land die Suche Produkte
bevorzugt. Findet sie dort zu wenig, sucht sie automatisch weltweit weiter. Beim ersten
Start wird die Region aus den Geräteeinstellungen abgeleitet.

**Sprache.** Beim ersten Start richtet sich die App nach der Spracheinstellung des Geräts;
danach gilt, was du unter *Ziele → Sprache* wählst. Eine weitere Sprache brauchst du an
drei Stellen: in `js/i18n.js` einen Block in `DICT` (die englische Fassung als Vorlage
kopieren), einen Eintrag in `LOCALES`, und in `index.html` einen Knopf im Block
`<div class="seg" id="lang-seg">`.

**Wichtig nach jeder Änderung:** in `sw.js` die Zeile `const VERSION = 'zettel-v1'`
hochzählen (`zettel-v2` usw.). Sonst zeigt die installierte App weiter die alte Fassung,
weil der Service Worker die alten Dateien behält.

---

## Aufbau

```
index.html                 alle Ansichten und Sheets
css/style.css              das komplette Design
js/store.js                Speichern, Tage, Summen — die einzige Datenstelle
js/i18n.js                 sämtliche Texte, Deutsch und Englisch
js/off.js                  Open-Food-Facts-Abfragen, Region, Zwischenspeicher
js/search.js               Sortierung der Treffer, Tippfehlertoleranz
js/scanner.js              Kamera und Barcode-Erkennung
js/app.js                  Oberfläche und Abläufe
sw.js                      Offline-Betrieb
manifest.webmanifest       Angaben für die Installation
icons/                     App-Icons
