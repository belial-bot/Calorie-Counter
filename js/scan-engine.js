/* =========================================================
   scan-engine.js — was aus einem Kamerabild einen Code macht

   Läuft im Arbeiter (scan-worker.js) und, wo es den nicht gibt,
   auch im Haupt-Faden. Kennt die Kamera nicht: bekommt ein Bild,
   gibt eine Nummer zurück.

   Gelesen wird mit ZXing-C++ — derselbe Leser, der in unzähligen
   Kassen- und Handy-Apps steckt, als WebAssembly mitgeliefert
   (vendor/zxing/). Kein CDN, kein Netz, keine fremde API: die
   Dateien liegen im Projekt und gehen mit in den Offline-Speicher.

   Zwei Dinge kann kein Leser von allein, und beide sind hier
   nachgemessen (test/scanner.test.js):

   1. Liegt ein Schatten oder ein Glanzstreifen über der Packung,
      scheitert die Schwellwertbildung von ZXing. Ein örtlicher
      Mittelwert davor räumt das weg — aus 0 % werden 100 %.
   2. Über etwa 25 Grad Schräglage findet ZXing nichts mehr: es
      liest waagerecht und senkrecht, nicht diagonal. Ein um 45
      Grad gedrehtes Abbild deckt genau die Lücke.

   Deshalb wird nicht jedes Bild gleich behandelt, sondern reihum
   auf vier Arten (siehe PASSES). Ein Bild, ein Durchgang — so
   bleibt jeder einzelne kurz, und nach vier Bildern war jede Art
   einmal dran.
   ========================================================= */

const ScanEngine = (() => {

  /* Nur was Lebensmittel tragen. Die Liste kurz zu halten ist keine
     Sparsamkeit, sondern Sicherheit: UPC-E ist sechs Ziffern lang und
     wurde in den Versuchen reihenweise in Falten und Schrägen
     hineingelesen — jeder Fehlgriff im Versuchslauf war einer. Ohne
     UPC-E: keiner mehr. */
  const FORMATS = ['EAN-13', 'EAN-8', 'UPC-A'];

  const READER = {
    formats: FORMATS,
    tryHarder: true,
    tryRotate: true,        // deckt 90 Grad ab, nicht die Diagonale
    tryInvert: true,        // heller Code auf dunklem Grund
    tryDownscale: true,
    minLineCount: 3,        // eine Zeile allein zählt nicht
    maxNumberOfSymbols: 3
  };

  /* Wie viele übereinstimmende Zeilen ein Fund haben muss, damit er
     ohne zweite Lesung gilt. Gemessen über den Versuchslauf: richtige
     Funde liegen im Mittel bei über hundert Zeilen, ein Viertel unter
     48; die wenigen falschen lagen alle unter 24. Wer darüber liegt,
     wird sofort genommen — das ist der Unterschied zwischen „draufhalten
     und fertig" und „draufhalten und warten". */
  const SURE_LINES = 24;

  /* Die vier Arten, ein Bild anzusehen.

     w/h   Ausschnitt aus dem Kamerabild (Anteil)
     cap   längste Kante danach — höher heißt mehr Bildpunkte je
           Strich, aber auch mehr Rechenzeit
     bin   örtliche Schwelle davorschalten (gegen Schatten und Glanz)
     rot   das Abbild drehen, bevor gelesen wird
     angles  nur für den eingebauten Ersatzleser, der schräg lesen kann */
  const PASSES = [
    { id: 'band',    w: 0.92, h: 0.62, cap: 1440, bin: false, rot: 0,  angles: [0, 90] },
    { id: 'bandBin', w: 0.92, h: 0.62, cap: 1024, bin: true,  rot: 0,  angles: [12, -12] },
    { id: 'diag',    w: 0.92, h: 0.62, cap: 1024, bin: true,  rot: 45, angles: [45, -45] },
    { id: 'full',    w: 1.00, h: 1.00, cap: 1280, bin: false, rot: 0,  angles: [0, 90] }
  ];

  let engine = null;
  let canvas = null;

  /* ---------- Bild zurechtschneiden ---------- */

  function surface(w, h) {
    if (!canvas) {
      canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : document.createElement('canvas');
    }
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);     // ein Dreh von vorhin klebt sonst
    return ctx;
  }

  /* Schneidet den Ausschnitt heraus, rechnet ihn auf `cap` herunter und
     dreht ihn, wenn der Durchgang das verlangt. Das Zeichnen übernimmt
     die Grafikeinheit — in JavaScript nachgebaut wäre es ein Vielfaches
     teurer. */
  function shot(source, vw, vh, pass, rotate) {
    const sw = Math.round(vw * pass.w), sh = Math.round(vh * pass.h);
    const sx = (vw - sw) >> 1, sy = (vh - sh) >> 1;
    const scale = Math.min(1, pass.cap / sw);
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const deg = rotate ? pass.rot : 0;

    if (!deg) {
      const ctx = surface(dw, dh);
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
      return ctx.getImageData(0, 0, dw, dh);
    }

    const rad = deg * Math.PI / 180;
    const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
    const ow = Math.ceil(dw * c + dh * s), oh = Math.ceil(dw * s + dh * c);
    const ctx = surface(ow, oh);
    // Weiß in die Ecken: gedreht bleibt außen Platz, und ein Barcode
    // ohne helle Ruhezone am Rand wird von keinem Leser erkannt.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, ow, oh);
    ctx.translate(ow / 2, oh / 2);
    ctx.rotate(rad);
    ctx.drawImage(source, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return ctx.getImageData(0, 0, ow, oh);
  }

  /* ---------- Örtliche Schwelle ----------

     Jeder Punkt wird mit dem Mittel seiner Umgebung verglichen statt
     mit einer Zahl fürs ganze Bild. Ein Schatten, der über die halbe
     Packung läuft, verschiebt dann Punkt und Umgebung gleichermaßen
     und fällt heraus.

     Das Summenbild macht das bezahlbar: einmal aufaddieren, danach
     kostet jedes Fenster vier Zugriffe, egal wie groß es ist. */

  let sums = null, gray = null;

  function binarize(img) {
    const W = img.width, H = img.height, d = img.data;
    const n = W * H;
    if (!gray || gray.length < n) gray = new Uint8Array(n);
    // 255 * 2^31 passt nicht mehr in Int32 — bei 1,2 Mio Punkten mit
    // je 255 sind es 3 * 10^8, das passt.
    if (!sums || sums.length < (W + 1) * (H + 1)) sums = new Int32Array((W + 1) * (H + 1));

    for (let i = 0, j = 0; j < n; i += 4, j++) {
      gray[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    }
    const row = W + 1;
    for (let y = 0; y < H; y++) {
      let acc = 0;
      const above = y * row, here = (y + 1) * row;
      for (let x = 0; x < W; x++) {
        acc += gray[y * W + x];
        sums[here + x + 1] = sums[above + x + 1] + acc;
      }
    }

    // Fenster: etwa ein Dreißigstel der Bildbreite. Breiter als der
    // breiteste Strich muss es sein, sonst verschwindet der Strich in
    // seinem eigenen Mittelwert; viel breiter darf es sein, ohne dass
    // es schadet.
    const r = Math.max(4, (W / 30) | 0);
    // Ein Hauch Vorspannung, damit gleichmäßig helle Flächen (die
    // Ruhezone!) weiß bleiben und nicht in Rauschen zerfallen.
    const bias = 4;

    for (let y = 0; y < H; y++) {
      const y0 = y - r < 0 ? 0 : y - r;
      const y1 = y + r + 1 > H ? H : y + r + 1;
      const a = y0 * row, b = y1 * row;
      for (let x = 0; x < W; x++) {
        const x0 = x - r < 0 ? 0 : x - r;
        const x1 = x + r + 1 > W ? W : x + r + 1;
        const area = (y1 - y0) * (x1 - x0);
        const sum = sums[b + x1] - sums[a + x1] - sums[b + x0] + sums[a + x0];
        const v = gray[y * W + x] * area < sum - bias * area ? 0 : 255;
        const i = (y * W + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
    return img;
  }

  /* ---------- Die Leser ---------- */

  /* Ein leeres weißes Bild für die Probe. Es muss ein echtes ImageData
     sein: BarcodeDetector nimmt nur, was der Browser als Bildquelle
     kennt, und weist ein nachgebautes Objekt zurück. */
  function blank() {
    const px = new Uint8ClampedArray(16 * 16 * 4);
    px.fill(255);
    return typeof ImageData !== 'undefined'
      ? new ImageData(px, 16, 16)
      : { data: px, width: 16, height: 16 };
  }

  function best(results) {
    let top = null;
    for (const r of results || []) {
      const text = r && r.text ? String(r.text).replace(/\s/g, '') : '';
      if (!text) continue;
      const lines = r.lineCount || 0;
      if (!top || lines > top.lines) top = { code: text, lines };
    }
    return top;
  }

  /* ZXing-C++ als WebAssembly. Der Aufwärmlauf ist Absicht: er zwingt
     das Modul, sich jetzt zu laden und einmal zu laufen. Ohne ihn
     fiele die Ladezeit auf das erste Kamerabild — genau in dem
     Augenblick, in dem jemand draufhält. */
  async function zxing(wasmUrl) {
    const Z = typeof self !== 'undefined' ? self.ZXingWASM : null;
    if (!Z || typeof Z.readBarcodes !== 'function') return null;
    try {
      if (wasmUrl && typeof Z.prepareZXingModule === 'function') {
        await Z.prepareZXingModule({
          overrides: { locateFile: (path, prefix) => path.endsWith('.wasm') ? wasmUrl : prefix + path },
          fireImmediately: true
        });
      }
      await Z.readBarcodes(blank(), READER);
    } catch (e) {
      console.warn('ZXing nicht verfügbar:', e);
      return null;
    }
    return {
      name: 'ZXing C++ (WASM)',
      rotate: true,
      sure: SURE_LINES,
      decode: async img => best(await Z.readBarcodes(img, READER))
    };
  }

  /* Was der Browser selbst mitbringt (Android/Chrome). Steht bereit,
     ohne dass etwas geladen werden muss — damit schon gescannt werden
     kann, während das WebAssembly noch unterwegs ist. */
  async function builtInBrowser() {
    const BD = typeof self !== 'undefined' ? self.BarcodeDetector : null;
    if (!BD) return null;
    try {
      const want = ['ean_13', 'ean_8', 'upc_a'];
      const have = await BD.getSupportedFormats();
      const use = want.filter(f => have.includes(f));
      if (!use.length) return null;
      const det = new BD({ formats: use });
      await det.detect(blank());          // Probe: läuft er überhaupt?
      return {
        name: 'BarcodeDetector',
        rotate: true,
        sure: 0,                          // meldet keine Zeilenzahl
        decode: async img => {
          const found = await det.detect(img);
          if (!found || !found.length) return null;
          return { code: String(found[0].rawValue).replace(/\s/g, ''), lines: 0 };
        }
      };
    } catch (e) {
      return null;
    }
  }

  /* Der eigene Leser aus ean.js. Letzte Rückfallebene: ohne WebAssembly,
     ohne Browser-Hilfe, ohne Netz. Er liest von sich aus schräg, deshalb
     bekommt er das Bild ungedreht und dafür Winkel mitgeteilt. */
  function builtIn() {
    if (typeof EAN === 'undefined') return null;
    return {
      name: 'EAN (eingebaut)',
      rotate: false,
      sure: 0,
      decode: (img, pass) => {
        const code = EAN.decode(img, { angles: pass.angles, lines: 13, spread: 0.22 });
        return code ? { code, lines: 0 } : null;
      }
    };
  }

  /**
   * Sucht den besten verfügbaren Leser. onEngine(name) wird gerufen,
   * sobald überhaupt einer bereitsteht — und noch einmal, wenn ein
   * besserer nachrückt.
   *
   * Erst das, was sofort da ist: der Leser des Browsers, sonst der
   * eigene aus ean.js. Damit wird vom ersten Kamerabild an gesucht,
   * auch wenn das WebAssembly beim allerersten Mal noch unterwegs
   * ist. Kommt es an, übernimmt es.
   */
  async function prepare(opts) {
    const o = opts || {};
    const quick = (await builtInBrowser()) || builtIn();
    if (quick) { engine = quick; if (o.onEngine) o.onEngine(quick.name); }

    const zx = await zxing(o.wasmUrl);
    if (zx) { engine = zx; if (o.onEngine) o.onEngine(zx.name); }
    return engine ? engine.name : null;
  }

  /**
   * Liest ein Bild. `source` ist alles, was auf eine Zeichenfläche darf
   * (ImageBitmap, <video>, <canvas>), `index` zählt die Bilder hoch und
   * wählt damit den Durchgang.
   * Gibt { code, lines, pass, sure } zurück oder null.
   */
  async function read(source, vw, vh, index) {
    if (!engine || !vw || !vh) return null;
    const pass = PASSES[((index % PASSES.length) + PASSES.length) % PASSES.length];
    const img = shot(source, vw, vh, pass, engine.rotate);
    if (pass.bin) binarize(img);
    const hit = await engine.decode(img, pass);
    if (!hit || !hit.code) return null;
    return { code: hit.code, lines: hit.lines || 0, pass: pass.id, sure: engine.sure };
  }

  /* ---------- Wann gilt ein Code? ----------

     Eine Prüfziffer allein lässt jeden zehnten Zufallstreffer durch.
     Deshalb: entweder der Fund steht auf vielen übereinstimmenden
     Zeilen (dann sofort), oder derselbe Code kommt in einem zweiten
     Bild noch einmal. Weil die Durchgänge reihum wechseln, ist die
     zweite Lesung meist eine ganz anders aufbereitete — das fängt
     auch den Fehlgriff ab, der sich in einem stehenden Bild sonst
     jedes Mal gleich wiederholen würde. */
  function tally() {
    const seen = new Map();
    return {
      add(code, lines, sure) {
        if (!code) return false;
        if (sure && lines >= sure) return true;
        const n = (seen.get(code) || 0) + 1;
        seen.set(code, n);
        return n >= 2;
      },
      clear() { seen.clear(); }
    };
  }

  return {
    prepare, read, tally, binarize,
    passes: PASSES,
    get engine() { return engine ? engine.name : null; },
    // für den Prüflauf
    FORMATS, SURE_LINES
  };
})();

if (typeof module !== 'undefined') module.exports = ScanEngine;
