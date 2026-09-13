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

## Tests

Zwei Prüfläufe, beide ohne Abhängigkeiten und ohne Netz:

```
node test/search.test.js
node test/scanner.test.js
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

## Veröffentlichen

Wird an `js/`, `css/`, `vendor/` oder `index.html` etwas geändert,
gehört die Fassung in `sw.js` hochgezählt. Sonst behalten Besucher, die
schon einmal da waren, die alten Dateien im Cache — und eine neue Seite
läuft mit altem Code, was schlimmer aussieht als eine alte Seite.
