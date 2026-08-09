/* =========================================================
   ean.js — Barcodes selbst lesen

   Deckt EAN-13, EAN-8 und UPC-A ab. Mehr braucht es für
   Lebensmittel nicht: alles im Supermarkt trägt einen davon.

   Ohne diese Datei hinge der Scanner an einer nachgeladenen
   Bibliothek — und damit an Internet, an einem CDN und an einer
   API, die sich zwischen Fassungen ändert. Der Weg hier ist
   nachvollziehbar und lässt sich Zeile für Zeile prüfen.

   Verfahren nach dem Vorbild der ZXing-Zeilenleser: binarisieren,
   Strichbreiten zählen, Muster vergleichen. Mit drei Zusätzen, ohne die
   auf gewölbten und zerknitterten Packungen nichts zu holen ist:

   - gelesen wird entlang beliebig geneigter Geraden, nicht nur waagerecht
   - in einer Geraden werden alle Randmuster durchprobiert, nicht nur das
     erste
   - zwischen den Bildpunkten wird gemittelt, damit schräge Schnitte die
     Strichbreiten nicht verfälschen
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

  /* Auf einer echten Packung steht selten nur der Barcode: daneben liegen
     Schrift, Falten, Kanten, ein Stück Nachbarpackung. Jedes davon kann
     wie ein Randmuster aussehen. Wer nach dem ersten Fund aufgibt, gibt
     bei solchen Bildern immer auf — deshalb werden hier der Reihe nach
     alle Kandidaten in der Zeile durchprobiert. */
  const GUARD_TRIES = 12;

  function decodeRow(bits) {
    let from = 0;
    for (let n = 0; n < GUARD_TRIES; n++) {
      const start = findGuard(bits, from, false, GUARD);
      if (!start) return null;
      const hit = tryEan13(bits, start[1]) || tryEan8(bits, start[1]);
      if (hit) return hit;
      from = start[0] + 1;
    }
    return null;
  }

  /* Ein einzelner Schwellwert je Zeile scheitert, sobald ein Schatten
     über der Packung liegt: die eine Hälfte ist dann durchweg dunkler
     als die andere. Der gleitende Mittelwert vergleicht jeden Punkt nur
     mit seiner Nachbarschaft und ist gegen so etwas unempfindlich.
     Er hilft nebenbei auch bei unscharfen Aufnahmen. */
  let preBuf = null;

  function localBits(row, width, out) {
    if (!preBuf || preBuf.length < width + 1) preBuf = new Int32Array(width + 1);
    const pre = preBuf;
    pre[0] = 0;
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

  /* ---------- Einen Schnitt durch das Bild legen ----------

     Eine Packung liegt nie ganz gerade in der Hand, und eine Tüte liegt
     überhaupt nicht: sie ist gewölbt, geknickt, verdreht. Der Barcode
     steht dann schräg im Bild, und eine waagerechte Zeile schneidet ihn
     unter einem Winkel. Die Striche wirken dadurch breiter, als sie
     sind, und an einer Wölbung ungleichmäßig breiter — die Randmuster
     passen nicht mehr zusammen, und die Zeile ist verloren.

     Deshalb wird hier nicht zeilenweise gelesen, sondern entlang einer
     Geraden in beliebigem Winkel. Über einer Wölbung genügt oft ein
     einziger Schnitt, der günstig zur Krümmung liegt.

     `sample` schneidet diese Gerade aus dem Bild: durch einen gegebenen
     Punkt, in Richtung (ux, uy), an den Bildrändern abgeschnitten.
     Zwischen den Bildpunkten wird gemittelt — bei schrägen Winkeln
     liegen die Abtastpunkte sonst mal auf dem Strich und mal daneben,
     und jede Breite schwankt um einen ganzen Bildpunkt. */

  function sample(gray, width, height, cx, cy, ux, uy, out) {
    // Wie weit reicht die Gerade, ohne das Bild zu verlassen?
    let t0 = -Infinity, t1 = Infinity;
    for (let k = 0; k < 2; k++) {
      const c = k ? cy : cx, u = k ? uy : ux, hi = (k ? height : width) - 1;
      if (Math.abs(u) < 1e-9) {
        if (c < 0 || c > hi) return 0;
        continue;
      }
      let a = -c / u, b = (hi - c) / u;
      if (a > b) { const s = a; a = b; b = s; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
    }

    const n = Math.min(Math.floor(t1 - t0), out.length);
    if (n < 60) return 0;                      // zu kurz für einen Barcode

    let x = cx + ux * t0, y = cy + uy * t0;
    for (let i = 0; i < n; i++, x += ux, y += uy) {
      let xi = x | 0, yi = y | 0;
      if (xi < 0) xi = 0; else if (xi > width - 1) xi = width - 1;
      if (yi < 0) yi = 0; else if (yi > height - 1) yi = height - 1;
      const fx = x - xi, fy = y - yi;
      const x1 = xi + 1 < width ? xi + 1 : xi;
      const r0 = yi * width, r1 = (yi + 1 < height ? yi + 1 : yi) * width;
      const top = gray[r0 + xi] + (gray[r0 + x1] - gray[r0 + xi]) * fx;
      const bot = gray[r1 + xi] + (gray[r1 + x1] - gray[r1 + xi]) * fx;
      out[i] = (top + (bot - top) * fy) | 0;
    }
    return n;
  }

  /* Aus Helligkeit Schwarz und Weiß machen — auf zwei Wegen, weil keiner
     allein reicht. Der feste Schwellwert ist genauer, solange die
     Ausleuchtung gleichmäßig ist; der gleitende Mittelwert kommt mit
     Schatten und Unschärfe zurecht. Jeder Schnitt wird zusätzlich
     rückwärts gelesen, falls der Code auf dem Kopf steht. */

  function readCut(buf, n, bits, back) {
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 0) {
        const cut = blackPoint(buf, n);
        if (cut < 0) continue;
        for (let i = 0; i < n; i++) bits[i] = buf[i] < cut ? 1 : 0;
      } else {
        localBits(buf, n, bits);
      }

      const row = bits.subarray(0, n);
      const hit = decodeRow(row);
      if (hit) return hit;

      for (let i = 0; i < n; i++) back[i] = row[n - 1 - i];
      const flipped = decodeRow(back.subarray(0, n));
      if (flipped) return flipped;
    }
    return null;
  }

  /* Ein Winkel, mehrere parallele Schnitte. Sie wandern von der Mitte aus
     nach beiden Seiten, damit der Barcode auch getroffen wird, wenn er
     nicht genau mittig liegt.

     `spread` sagt, wie weit sie ausschwärmen — als Anteil der kürzeren
     Bildseite. Das ist ein Tausch: eng gestreut liegen alle Schnitte im
     Barcode, weit gestreut findet man ihn auch am Bildrand, aber die
     Hälfte der Schnitte trifft nur Verpackung. Im Sucherfenster wird
     deshalb eng gestreut, im ganzen Bild weit. */

  function scanAngle(gray, width, height, deg, tries, spread, buf, bits, back) {
    const rad = deg * Math.PI / 180;
    const ux = Math.cos(rad), uy = Math.sin(rad);
    const px = -uy, py = ux;                   // quer zur Leserichtung
    const cx = (width - 1) / 2, cy = (height - 1) / 2;
    const step = Math.min(width, height) * spread / Math.max(1, tries >> 1);

    for (let a = 0; a < tries; a++) {
      const off = Math.ceil(a / 2) * step * (a & 1 ? -1 : 1);
      const n = sample(gray, width, height, cx + px * off, cy + py * off, ux, uy, buf);
      if (!n) continue;
      const hit = readCut(buf, n, bits, back);
      if (hit) return hit;
    }
    return null;
  }

  /* Die Puffer bleiben zwischen den Bildern erhalten. Bei zehn Bildern in
     der Sekunde wären es sonst hundert Megabyte Abfall je Minute. */
  let gBuf = null, sBuf = null, bBuf = null, kBuf = null;

  function toGray(image) {
    const { data, width, height } = image;
    const need = width * height;
    if (!gBuf || gBuf.length < need) gBuf = new Uint8Array(need);
    for (let i = 0, j = 0; j < need; i += 4, j++) {
      gBuf[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    }
    return gBuf;
  }

  /**
   * image: ein ImageData (oder { data, width, height }).
   * opts.angles: Winkel in Grad, unter denen gelesen wird. 0 ist
   *              waagerecht, 90 senkrecht. Voreinstellung: beides.
   * opts.lines:  Schnitte je Winkel.
   * opts.spread: wie weit die Schnitte ausschwärmen (Anteil der kürzeren
   *              Bildseite). Voreinstellung: ein Viertel.
   * Gibt die Ziffernfolge zurück oder null.
   */
  function decode(image, opts = {}) {
    const { width, height } = image;
    if (!width || !height) return null;

    const tries = opts.lines || 15;
    const spread = opts.spread || 0.25;
    const angles = opts.angles || (opts.rotate === false ? [0] : [0, 90]);

    const gray = toGray(image);
    const span = Math.ceil(Math.sqrt(width * width + height * height)) + 2;
    if (!sBuf || sBuf.length < span) {
      sBuf = new Uint8Array(span);
      bBuf = new Uint8Array(span);
      kBuf = new Uint8Array(span);
    }

    for (const deg of angles) {
      const hit = scanAngle(gray, width, height, deg, tries, spread, sBuf, bBuf, kBuf);
      if (hit) return hit;
    }
    return null;
  }

  return { decode, decodeRow, checksumOk };
})();

if (typeof module !== 'undefined') module.exports = EAN;
