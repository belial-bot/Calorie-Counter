/* =========================================================
   ean.js — Barcodes selbst lesen

   Deckt EAN-13, EAN-8 und UPC-A ab. Mehr braucht es für
   Lebensmittel nicht: alles im Supermarkt trägt einen davon.

   Ohne diese Datei hinge der Scanner an einer nachgeladenen
   Bibliothek — und damit an Internet, an einem CDN und an einer
   API, die sich zwischen Fassungen ändert. Der Weg hier ist
   nachvollziehbar und lässt sich Zeile für Zeile prüfen.

   Verfahren nach dem Vorbild der ZXing-Zeilenleser:
   Zeile binarisieren, Strichbreiten zählen, Muster vergleichen.
   ========================================================= */

const EAN = (() => {

  /* Wie stark ein einzelner Strich und das Muster insgesamt von der
     Vorlage abweichen dürfen. Zu streng heißt "findet nichts",
     zu locker heißt "liest Unsinn". Diese Werte sind erprobt. */
  const MAX_SINGLE = 0.7;
  const MAX_TOTAL  = 0.48;

  const GUARD  = [1, 1, 1];        // Rand: Strich, Lücke, Strich
  const MIDDLE = [1, 1, 1, 1, 1];  // Mitte

  /* Die zehn Ziffern als Folge von vier Strichbreiten.
     Links wie rechts dieselbe Tabelle — rechts ist nur Schwarz und
     Weiß vertauscht, und die Breiten bleiben dieselben. */
  const L = [
    [3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2],
    [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2]
  ];
  /* Für die linke Hälfte kommt die gespiegelte Fassung dazu. Welche der
     beiden je Ziffer benutzt wurde, verrät die erste Ziffer der 13. */
  const LG = L.concat(L.map(p => p.slice().reverse()));
  const FIRST = [0x00, 0x0B, 0x0D, 0x0E, 0x13, 0x19, 0x1C, 0x15, 0x16, 0x1A];

  /* ---------- Schwarzpunkt einer Zeile bestimmen ----------
     Zwei Häufungen im Helligkeitsverlauf: Striche und Papier.
     Die Grenze liegt im tiefsten Tal dazwischen. */

  function blackPoint(gray, len) {
    const hist = new Int32Array(32);
    for (let i = 0; i < len; i++) hist[gray[i] >> 3]++;

    let firstPeak = 0, firstScore = 0;
    for (let i = 0; i < 32; i++) {
      if (hist[i] > firstScore) { firstScore = hist[i]; firstPeak = i; }
    }

    let secondPeak = 0, secondScore = 0;
    for (let i = 0; i < 32; i++) {
      const d = i - firstPeak;
      const score = hist[i] * d * d;          // weit weg zählt mehr
      if (score > secondScore) { secondScore = score; secondPeak = i; }
    }

    let lo = Math.min(firstPeak, secondPeak), hi = Math.max(firstPeak, secondPeak);
    if (hi - lo <= 32 / 16) return -1;        // zu wenig Kontrast, Zeile taugt nicht

    let valley = hi - 1, best = -1;
    for (let i = hi - 1; i > lo; i--) {
      const d = i - lo;
      const score = d * d * (hi - i) * (secondScore - hist[i]);
      if (score > best) { best = score; valley = i; }
    }
    return valley << 3;
  }

  /* ---------- Strichbreiten ablesen ---------- */

  function record(bits, start, counters) {
    const n = counters.length, end = bits.length;
    counters.fill(0);
    if (start >= end) return false;
    let white = bits[start] === 0;
    let pos = 0, i = start;
    while (i < end) {
      if ((bits[i] === 0) === white) {
        counters[pos]++;
      } else {
        if (++pos === n) break;
        counters[pos] = 1;
        white = !white;
      }
      i++;
    }
    return pos === n || (pos === n - 1 && i === end);
  }

  /* Wie gut passen gemessene Breiten auf ein Sollmuster? Kleiner ist besser. */
  function variance(counters, pattern) {
    let total = 0, units = 0;
    for (let i = 0; i < counters.length; i++) { total += counters[i]; units += pattern[i]; }
    if (total < units) return Infinity;
    const unit = total / units;
    const cap = MAX_SINGLE * unit;
    let sum = 0;
    for (let i = 0; i < counters.length; i++) {
      const want = pattern[i] * unit;
      const off = Math.abs(counters[i] - want);
      if (off > cap) return Infinity;
      sum += off;
    }
    return sum / total;
  }

  /* Den Rand oder die Mitte im Strichbild suchen */
  function findGuard(bits, from, whiteFirst, pattern) {
    const width = bits.length, n = pattern.length;
    const counters = new Int32Array(n);
    let i = from;
    while (i < width && (bits[i] === 0) !== whiteFirst) i++;   // erste passende Farbe
    let start = i, pos = 0, white = whiteFirst;
    for (let x = i; x < width; x++) {
      if ((bits[x] === 0) === white) {
        counters[pos]++;
      } else {
        if (pos === n - 1) {
          if (variance(counters, pattern) < MAX_TOTAL) return [start, x];
          start += counters[0] + counters[1];
          for (let k = 2; k < n; k++) counters[k - 2] = counters[k];
          counters[n - 2] = 0;
          counters[n - 1] = 0;
        } else {
          pos++;
        }
        counters[pos] = 1;
        white = !white;
      }
    }
    return null;
  }

  function readDigit(bits, offset, table, counters) {
    if (!record(bits, offset, counters)) return -1;
    let best = MAX_TOTAL, match = -1;
    for (let i = 0; i < table.length; i++) {
      const v = variance(counters, table[i]);
      if (v < best) { best = v; match = i; }
    }
    return match;
  }

  function checksumOk(s) {
    let sum = 0;
    for (let i = s.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += (+s[i]) * w;
    return (10 - sum % 10) % 10 === +s[s.length - 1];
  }

  /* ---------- Eine Zeile lesen ---------- */

  /* EAN-13: 6 Ziffern links (teils gespiegelt), Mitte, 6 Ziffern rechts.
     Die 13. Ziffer steht nirgends — sie steckt im Spiegelungsmuster. */
  function tryEan13(bits, from) {
    const counters = new Int32Array(4);
    let offset = from, left = '', parity = 0;

    for (let x = 0; x < 6; x++) {
      const d = readDigit(bits, offset, LG, counters);
      if (d < 0) return null;
      left += String(d % 10);
      for (let k = 0; k < 4; k++) offset += counters[k];
      if (d >= 10) parity |= 1 << (5 - x);
    }

    const mid = findGuard(bits, offset, true, MIDDLE);
    if (!mid) return null;
    offset = mid[1];

    let right = '';
    for (let x = 0; x < 6; x++) {
      const d = readDigit(bits, offset, L, counters);
      if (d < 0) return null;
      right += String(d);
      for (let k = 0; k < 4; k++) offset += counters[k];
    }

    const lead = FIRST.indexOf(parity);
    if (lead < 0) return null;
    // Führende Null heißt UPC-A — die Nummer stimmt trotzdem
    const code = String(lead) + left + right;
    return checksumOk(code) ? code : null;
  }

  /* EAN-8: nur 4 Ziffern je Hälfte, ohne Spiegelung */
  function tryEan8(bits, from) {
    const counters = new Int32Array(4);
    let offset = from, code = '';

    for (let x = 0; x < 4; x++) {
      const d = readDigit(bits, offset, L, counters);
      if (d < 0) return null;
      code += String(d);
      for (let k = 0; k < 4; k++) offset += counters[k];
    }

    const mid = findGuard(bits, offset, true, MIDDLE);
    if (!mid) return null;
    offset = mid[1];

    for (let x = 0; x < 4; x++) {
      const d = readDigit(bits, offset, L, counters);
      if (d < 0) return null;
      code += String(d);
      for (let k = 0; k < 4; k++) offset += counters[k];
    }
    return checksumOk(code) ? code : null;
  }

  function decodeRow(bits) {
    const start = findGuard(bits, 0, false, GUARD);
    if (!start) return null;
    return tryEan13(bits, start[1]) || tryEan8(bits, start[1]);
  }

  /* Ein einzelner Schwellwert je Zeile scheitert, sobald ein Schatten
     über der Packung liegt: die eine Hälfte ist dann durchweg dunkler
     als die andere. Der gleitende Mittelwert vergleicht jeden Punkt nur
     mit seiner Nachbarschaft und ist gegen so etwas unempfindlich.
     Er hilft nebenbei auch bei unscharfen Aufnahmen. */
  function localBits(row, width, out) {
    const pre = new Int32Array(width + 1);
    for (let i = 0; i < width; i++) pre[i + 1] = pre[i] + row[i];
    const half = Math.max(4, width >> 4);
    for (let i = 0; i < width; i++) {
      // Am Rand wird das Fenster nach innen geschoben statt abgeschnitten.
      // Sonst entstehen dort Phantomstriche im weißen Rand.
      let a = i - half, b = i + half + 1;
      if (a < 0) { b -= a; a = 0; }
      if (b > width) { a -= b - width; b = width; if (a < 0) a = 0; }
      // Ohne Vorspannung: jede Abweichung nach Schwarz verbreitert bei
      // unscharfen Aufnahmen jeden Strich und verschiebt die Breiten.
      out[i] = row[i] * (b - a) < pre[b] - pre[a] ? 1 : 0;
    }
  }

  /* ---------- Ein Bild durchsuchen ----------
     Nicht jede Zeile trifft den Barcode sauber. Deshalb wird von der
     Mitte aus nach oben und unten gesucht, und jede Zeile zusätzlich
     rückwärts gelesen, falls der Code auf dem Kopf steht. */

  function scanLines(gray, width, height, tries) {
    const bits = new Uint8Array(width);
    const back = new Uint8Array(width);
    const middle = height >> 1;
    const step = Math.max(1, height / (tries * 2));

    for (let a = 0; a < tries; a++) {
      const delta = Math.ceil(a / 2) * step;
      const y = Math.round(middle + (a & 1 ? -delta : delta));
      if (y < 0 || y >= height) continue;

      const row = gray.subarray(y * width, y * width + width);

      // Zwei Wege, aus Helligkeit Schwarz und Weiß zu machen: ein fester
      // Schwellwert für die ganze Zeile, und der gleitende Mittelwert.
      for (let pass = 0; pass < 2; pass++) {
        if (pass === 0) {
          const cut = blackPoint(row, width);
          if (cut < 0) continue;
          for (let x = 0; x < width; x++) bits[x] = row[x] < cut ? 1 : 0;
        } else {
          localBits(row, width, bits);
        }

        const hit = decodeRow(bits);
        if (hit) return hit;

        for (let x = 0; x < width; x++) back[x] = bits[width - 1 - x];
        const flipped = decodeRow(back);
        if (flipped) return flipped;
      }
    }
    return null;
  }

  function toGray(image) {
    const { data, width, height } = image;
    const gray = new Uint8Array(width * height);
    for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
      gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    }
    return gray;
  }

  function transpose(gray, width, height) {
    const out = new Uint8Array(gray.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) out[x * height + y] = gray[y * width + x];
    }
    return out;
  }

  /**
   * image: ein ImageData (oder { data, width, height }).
   * Gibt die Ziffernfolge zurück oder null.
   */
  function decode(image, opts = {}) {
    const { width, height } = image;
    if (!width || !height) return null;
    const tries = opts.lines || 15;

    const gray = toGray(image);
    const flat = scanLines(gray, width, height, tries);
    if (flat) return flat;

    // Quer gehalten? Dann dasselbe noch einmal um 90 Grad gedreht.
    if (opts.rotate !== false) {
      const turned = transpose(gray, width, height);
      return scanLines(turned, height, width, tries);
    }
    return null;
  }

  return { decode, decodeRow, checksumOk };
})();

if (typeof module !== 'undefined') module.exports = EAN;
