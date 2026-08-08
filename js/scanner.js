/* =========================================================
   scanner.js — Barcode über die Kamera

   Erst die eingebaute Erkennung (Android/Chrome), sonst ZXing.
   Braucht HTTPS. Auf file:// oder http:// bleibt die Kamera zu.

   Wichtig: ein Dekodierer wird beim Einrichten einmal zur Probe
   ausgeführt. Nur wenn er sauber "nichts gefunden" meldet, gilt er
   als brauchbar. Sonst läuft der Scanner endlos, ohne je etwas zu
   finden — und niemand erfährt, warum.
   ========================================================= */

const Scanner = (() => {

  const ZXING_SRC = [
    'https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js',
    'https://cdn.jsdelivr.net/npm/@zxing/library@0.19.1/umd/index.min.js'
  ];

  let stream = null;
  let running = false;
  let cvBand = null, cvFull = null;
  let engine = '—';

  /* ---------- ZXing nachladen ---------- */

  function loadScript(src) {
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = ok;
      s.onerror = () => no(new Error('Skript nicht geladen: ' + src));
      document.head.appendChild(s);
    });
  }

  async function getZXing() {
    if (window.ZXing) return window.ZXing;
    for (const src of ZXING_SRC) {
      try { await loadScript(src); if (window.ZXing) return window.ZXing; }
      catch (e) { /* nächste Quelle */ }
    }
    return null;
  }

  function blankCanvas() {
    const c = document.createElement('canvas');
    c.width = 60; c.height = 40;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 60, 40);
    return c;
  }

  /* ZXings Ausnahmen erben nicht von Error und tragen kein .name — sie
     haben ein eigenes "kind". Deshalb wird andersherum geprüft: nur echte
     JavaScript-Laufzeitfehler bedeuten "der Dekodierer ist kaputt".
     Alles andere ist die übliche Art zu sagen "hier ist nichts". */
  function broken(e) {
    return e instanceof TypeError || e instanceof ReferenceError || e instanceof SyntaxError;
  }

  async function usable(fn) {
    try { await fn(blankCanvas()); return true; }
    catch (e) {
      if (!broken(e)) return true;
      console.warn('Dekodierer unbrauchbar:', e);
      return false;
    }
  }

  /* ---------- Den besten verfügbaren Dekodierer finden ---------- */

  async function buildDecoder() {
    const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

    // 1. Vom Browser mitgeliefert (Android/Chrome; Safari kann das nicht)
    if ('BarcodeDetector' in window) {
      try {
        const have = await window.BarcodeDetector.getSupportedFormats();
        const use = want.filter(f => have.includes(f));
        if (use.length) {
          const det = new window.BarcodeDetector({ formats: use });
          const fn = async src => {
            const found = await det.detect(src);
            return found.length ? found[0].rawValue : null;
          };
          if (await usable(fn)) { engine = 'BarcodeDetector'; return fn; }
        }
      } catch (e) { /* weiter zu ZXing */ }
    }

    // 2. Der eigene Leser. Braucht kein Internet, kein CDN, keine
    //    fremde API — und ist der einzige Zweig, der hier geprüft werden
    //    konnte. Deckt EAN-13, EAN-8 und UPC-A ab; mehr trägt kein
    //    Lebensmittel.
    if (typeof EAN !== 'undefined') {
      const fn = canvas => {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return EAN.decode(img, { rotate: canvas.width <= 1100 });
      };
      if (await usable(fn)) { engine = 'EAN (eingebaut)'; return fn; }
    }

    // 3. ZXing als Zugabe, falls doch einmal ein anderer Code auftaucht
    const ZX = await getZXing();
    if (!ZX) return null;

    const hints = new Map();
    if (ZX.DecodeHintType && ZX.BarcodeFormat) {
      hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [
        ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8,
        ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E,
        ZX.BarcodeFormat.CODE_128, ZX.BarcodeFormat.CODE_39, ZX.BarcodeFormat.ITF
      ]);
      hints.set(ZX.DecodeHintType.TRY_HARDER, true);
    }

    // 3a. ZXing über die einfachen Bausteine — die gibt es in jeder Fassung
    if (ZX.MultiFormatReader && ZX.HTMLCanvasElementLuminanceSource &&
        ZX.HybridBinarizer && ZX.BinaryBitmap) {
      const reader = new ZX.MultiFormatReader();
      if (reader.setHints) reader.setHints(hints);
      const fn = canvas => {
        const src = new ZX.HTMLCanvasElementLuminanceSource(canvas);
        const bmp = new ZX.BinaryBitmap(new ZX.HybridBinarizer(src));
        try {
          const res = reader.decode(bmp);
          return res ? res.getText() : null;
        } catch (e) {
          if (reader.reset) reader.reset();
          if (broken(e)) throw e;
          return null;                       // nichts gefunden, ganz normal
        }
      };
      if (await usable(fn)) { engine = 'ZXing (MultiFormatReader)'; return fn; }
    }

    // 3b. ZXing über den bequemen Weg, falls es ihn hier gibt
    if (ZX.BrowserMultiFormatReader) {
      const br = new ZX.BrowserMultiFormatReader(hints);
      if (typeof br.decodeFromCanvas === 'function') {
        const fn = canvas => {
          try {
            const res = br.decodeFromCanvas(canvas);
            return res ? res.getText() : null;
          } catch (e) {
            if (broken(e)) throw e;
            return null;                     // nichts gefunden, ganz normal
          }
        };
        if (await usable(fn)) { engine = 'ZXing (BrowserMultiFormatReader)'; return fn; }
      }
    }

    return null;
  }

  /* ---------- Bild vorbereiten ----------
     Statt das ganze Bild kleinzurechnen wird der mittlere Streifen in
     voller Auflösung ausgeschnitten. Ein EAN-13 besteht aus 95 Strichen —
     je mehr Bildpunkte auf einen Strich fallen, desto sicherer die
     Erkennung. Dazu wird der Kontrast gespreizt. */

  function prepare(video, mode) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;

    let sx, sy, sw, sh, cap;
    if (mode === 'band') {
      sw = Math.round(vw * 0.88);
      sh = Math.round(vh * 0.42);
      sx = Math.round((vw - sw) / 2);
      sy = Math.round((vh - sh) / 2);
      cap = 1280;
    } else {
      sx = 0; sy = 0; sw = vw; sh = vh;
      cap = 1024;
    }

    const scale = Math.min(1, cap / sw);
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));

    let c = mode === 'band' ? cvBand : cvFull;
    if (!c) {
      c = document.createElement('canvas');
      if (mode === 'band') cvBand = c; else cvFull = c;
    }
    c.width = dw; c.height = dh;

    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
    if (mode === 'band') stretch(ctx, dw, dh);
    return c;
  }

  /* Graustufen mit gespreiztem Kontrast: hilft bei mattem Licht
     und glänzenden Verpackungen spürbar. */
  function stretch(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    let lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      d[i] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      const v = ((d[i] - lo) * 255 / span) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ---------- Kamera öffnen ----------
     Von hoch aufgelöst und rückseitig abwärts, bis eine Fassung greift. */

  const LADDER = [
    { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { facingMode: 'environment' },
    true
  ];

  async function openCamera() {
    let last = null;
    for (const video of LADDER) {
      try { return await navigator.mediaDevices.getUserMedia({ video, audio: false }); }
      catch (e) {
        last = e;
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) break;
      }
    }
    throw last || new Error('keine Kamera');
  }

  /**
   * Startet die Kamera und ruft onCode(code) beim ersten Treffer.
   * onStatus(key, vars) meldet Hinweise, während gesucht wird.
   * Wirft mit .kind = 'insecure' | 'unsupported' | 'denied' | 'nocamera' | 'nodecoder'
   */
  async function start(video, onCode, onStatus) {
    if (running) return;
    const say = onStatus || function () {};

    if (!window.isSecureContext) {
      throw Object.assign(new Error('Kamera braucht HTTPS'), { kind: 'insecure' });
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw Object.assign(new Error('Kein Kamerazugriff im Browser'), { kind: 'unsupported' });
    }

    try {
      stream = await openCamera();
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      throw Object.assign(new Error('Kamera nicht verfügbar'), { kind: denied ? 'denied' : 'nocamera' });
    }

    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    try { await video.play(); } catch (e) { /* iOS spielt manchmal erst nach den Metadaten */ }

    const decode = await buildDecoder();
    if (!decode) {
      stop(video);
      throw Object.assign(new Error('Keine Barcode-Erkennung verfügbar'), { kind: 'nodecoder' });
    }

    running = true;
    let last = 0, pass = 0, done = false;
    const began = Date.now();
    let toldTip = false, toldDiag = false;

    const tick = async now => {
      if (!running) return;

      if (now - last > 110) {
        last = now;
        // Meist den scharfen Ausschnitt, jeder dritte Durchgang das ganze
        // Bild — falls der Barcode neben dem Sucherfenster liegt.
        const mode = (pass++ % 3 === 2) ? 'full' : 'band';
        const frame = prepare(video, mode);
        if (frame) {
          try {
            const code = await decode(frame);
            if (code && !done) {
              done = true; running = false;
              if (navigator.vibrate) navigator.vibrate(40);
              onCode(String(code).replace(/\s/g, ''));
              return;
            }
          } catch (e) {
            // Ein echter Fehler, nicht bloß "nichts gefunden": abbrechen
            // statt endlos weiterzusuchen.
            running = false;
            console.error('Barcode-Erkennung abgestürzt:', e);
            say('scan.err.nodecoder');
            return;
          }
        }

        const secs = (Date.now() - began) / 1000;
        if (!toldTip && secs > 6) {
          toldTip = true;
          say('scan.tip');
        }
        if (!toldDiag && secs > 15) {
          toldDiag = true;
          say('scan.diag', { info: `${video.videoWidth}×${video.videoHeight} · ${engine}` });
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function stop(video) {
    running = false;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (video) video.srcObject = null;
  }

  return { start, stop, get engine() { return engine; } };
})();
