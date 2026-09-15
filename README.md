# Calorie-Counter

Ein Kalorienzähler als installierbare Web-App.

## Der Barcode-Leser

Gelesen wird mit **ZXing-C++** (`vendor/zxing/`, als WebAssembly über
[zxing-wasm](https://github.com/Sec-ant/zxing-wasm)) — die Bibliothek,
die auch in Kassensystemen und den meisten Scanner-Apps steckt. Sie
liegt im Projekt, nicht auf einem CDN: kein Netz beim ersten Scan,
keine fremde API, und der Offline-Speicher hat sie mit dabei.

Drumherum steht das, was ein Leser allein nicht kann (`js/scan-engine.js`):

* **Örtliche Schwelle** gegen halbe Schatten und Glanz auf Folie. Mit
  einem Schwellwert fürs ganze Bild findet ZXing bei einem Schatten
  über der Packung gar nichts; mit dem Mittel der Nachbarschaft alles.
* **Ein um 45 Grad gedrehtes Abbild.** ZXing liest waagerecht und
  senkrecht — über etwa 25 Grad Schräglage hört es auf. Der gedrehte
  Durchgang schließt die Lücke.
* **Reihum, ein Durchgang je Bild**, damit keines lange dauert.
* Gesucht wird in `js/scan-worker.js` **nebenan**, nicht im Haupt-Faden:
  das Sucherbild bleibt flüssig, und gesucht wird in jedem Kamerabild
  statt alle 110 ms in einem.

Fällt etwas davon aus, geht es weiter: ohne Arbeiter im Haupt-Faden,
ohne WebAssembly mit dem Leser des Browsers (`BarcodeDetector`) und
zuletzt mit dem eigenen aus `js/ean.js`.

## Mengen: Stück statt Gramm

Wer einen Apfel isst, legt ihn nicht auf die Waage. Neben Gramm und
Millilitern steht deshalb ein Auswahlfeld mit den Maßen, die zum
Lebensmittel passen — „Apfel“, „Ei“, „Scheibe“, „Glas“, „EL“ — und
daneben Plus und Minus. Zwei Äpfel sind zwei Mal Plus, nicht 364.

Die Gewichte kommen aus drei Quellen (`js/units.js`):

* **Von der Packung.** Steht bei Open Food Facts unter `serving_size`
  ein „2 Kekse (25 g)“, dann wiegt ein Keks 12,5 g. Die Zahl allein
  (`serving_quantity`) sagt das nicht — es steht nur im Wortlaut, und
  der wurde bisher weggeworfen.
* **Aus einer Tabelle**, für alles ohne Strichcode. Ein Apfel steht in
  keiner Produktdatenbank. Die rund 70 Einträge sind die typischen
  Haushaltsmaße des USDA (FoodData Central, `foodPortions`:
  1 medium apple = 182 g) — gemeinfrei und dieselbe Grundlage, auf der
  auch MyFitnessPal und Cronometer ihr „1 mittlerer Apfel“ bauen.
* **Vom Nutzer**, der beim Anlegen ein Stückgewicht einträgt.

Gesucht wird nur nach dem **letzten Wort** des Namens: „Apfel“ und
„Bio-Apfel“ sind ein Apfel, „Apfelsaft“ und „Apfeljoghurt“ nicht. Im
Deutschen steht das Grundwort hinten, und ein zusammengeschriebenes
Wort ist ein anderes Lebensmittel. Dazu eine Sperrliste für „mit“,
„getrocknet“, „Sauce“ und Ähnliches.

Gespeichert wird weiter in Gramm. Menge und Maß stehen zusätzlich im
Eintrag, damit „2 Äpfel“ beim Ändern wieder „2 Äpfel“ ist und nicht
„364 g“ — und alte Einträge ohne diese Angabe bleiben lesbar.

## Tests

Vier Prüfläufe, alle ohne Abhängigkeiten und ohne Netz:

```
node test/search.test.js
node test/scanner.test.js
node test/units.test.js
node test/flow.test.js
```

Die Suche: Wertung der Treffer (deutsche Zusammensetzungen, Mehrzahl,
Umlaute, Marken, Vertipper), das Einlesen der Antworten von Open Food
Facts in beiden Formaten und der Ablauf der Suche selbst.

Der Scanner: `test/barcode-image.js` malt EAN-13-Codes so, wie sie im
Regal aussehen — gewölbt wie auf einer Flasche, zerknittert wie auf
einer Tüte, schräg, unscharf, halb im Schatten, mit Glanz auf der
Folie, bei wenig Licht. Der Korb geht durch dieselbe Kette wie später
auf dem Handy, samt dem ausgelieferten WebAssembly; nur die
Zeichenfläche ist nachgebaut (`test/canvas2d.js`), weil node keine hat.
Jeder Fall muss gefunden werden, im Mittel in höchstens 2,5 Bildern,
und kein einziger falsch gelesen.

Die Maße: dass „Apfelsaft“ keine Äpfel zählt, dass aus „2 Kekse
(25 g)“ ein Keks von 12,5 g wird, dass ein Wechsel der Einheit die
Menge nicht verändert (182 g sind 1 Apfel, nicht 182), und dass Plus
und Minus in Stücken zählen statt in Zehnergrammschritten.

Der Weg zur Buchung: hier läuft `js/app.js` wirklich — gegen die
echte `index.html` und ein nachgebautes Dokument (`test/dom.js`), so
wie der Scanner gegen die nachgebaute Zeichenfläche läuft. Ein Apfel
wird ausgewählt, zwei Mal Plus gedrückt, eingetragen, wieder
aufgemacht, auf Gramm umgestellt und gelöscht. Dazu ein Eintrag aus
der Zeit vor den Einheiten: er muss weiter richtig rechnen und in
Gramm zurückkommen, nicht in Bechern.

## Veröffentlichen

Wird an `js/`, `css/`, `vendor/` oder `index.html` etwas geändert,
gehört die Fassung in `sw.js` hochgezählt. Sonst behalten Besucher, die
schon einmal da waren, die alten Dateien im Cache — und eine neue Seite
läuft mit altem Code, was schlimmer aussieht als eine alte Seite.
