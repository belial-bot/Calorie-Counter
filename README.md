# Calorie-Counter

Ein Kalorienzähler als installierbare Web-App.

## Tests

Die Suche hat einen eigenen Prüflauf — ohne Abhängigkeiten, ohne Netz:

```
node test/search.test.js
```

Geprüft werden die Wertung der Treffer (deutsche Zusammensetzungen,
Mehrzahl, Umlaute, Marken, Vertipper), das Einlesen der Antworten von
Open Food Facts in beiden Formaten und der Ablauf der Suche selbst.

## Veröffentlichen

Wird an `js/`, `css/` oder `index.html` etwas geändert, gehört die
Fassung in `sw.js` hochgezählt. Sonst behalten Besucher, die schon
einmal da waren, die alten Dateien im Cache — und eine neue Seite läuft
mit altem Code, was schlimmer aussieht als eine alte Seite.
