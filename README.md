# Calorie-Counter

Ein Kalorienzähler als installierbare Web-App.

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
