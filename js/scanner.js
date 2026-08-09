/* =========================================================
   scanner.js — Barcode über die Kamera

   Erst die eingebaute Erkennung (Android/Chrome), sonst der eigene
   Leser, sonst ZXing. Braucht HTTPS. Auf file:// oder http:// bleibt
   die Kamera zu.

   Zwei Dinge entscheiden, ob eine zerknitterte Packung gelesen wird:

   1. Wie viele Bildpunkte auf einen Strich fallen. Bei zwei Punkten je
      Modul reicht ein Hauch Unschärfe, und der Code ist weg; bei vier
      übersteht er sie. Deshalb wird die Kamera so hoch aufgelöst wie
      möglich angefordert und der Ausschnitt so wenig wie möglich
      kleingerechnet.
   2. Unter welchem Winkel gelesen wird. Der eigene Leser kann schräg
      lesen — welche Winkel er versucht, steht unten im Plan. Über
      mehrere Bilder verteilt kommt er einmal um die Uhr, ohne dass ein
      einzelnes Bild zu lange dauert.

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

  /* Der Ausschnitt in der Mitte. Höher als früher, damit ein hochkant
     gehaltener Code hineinpasst, und mit viel größerer Obergrenze:
     ein 1080p-Bild auf 1280 herunterzurechnen kostet ein Viertel der
     Bildpunkte je Strich — genau das, woran die Erkennung hängt. */
  const BAND = { w: 0.92, h: 0.58, cap: 1920 };
  const FULL = { cap: 1280 };

  /* Was in welchem Durchgang versucht wird — ein Durchgang je Bild. Bei
     etwa neun Bildern in der Sekunde ist der Plan nach gut einer Sekunde
     einmal herum, ohne dass ein einzelnes Bild zu lange dauert.

     Die Winkel liegen 24 Grad auseinander, denn so viel Schräglage
     verkraftet ein Schnitt noch (nachgemessen: unter 12 Grad Restwinkel
     ändert sich fast nichts). Waagerecht und senkrecht kommen doppelt
     vor, weil so die allermeisten Codes gehalten werden.

     Schräge Winkel streuen eng: ein schräger Schnitt wandert über die
     Länge des Codes aus dem Strichfeld heraus, deshalb müssen die
     Schnitte dicht an der Mitte liegen. Für Codes, die gar nicht in der
     Mitte sind, gibt es die Durchgänge über das ganze Bild. */
  const PLAN = [
    { mode: 'band', angles: [0],       lines: 15, spread: 0.22 },
    { mode: 'band', angles: [90],      lines: 15, spread: 0.22 },
    { mode: 'band', angles: [12, -12], lines: 13, spread: 0.12 },
    { mode: 'full', angles: [0, 90],   lines: 13, spread: 0.40 },
    { mode: 'band', angles: [0],       lines: 15, spread: 0.22 },
    { mode: 'band', angles: [24, -24], lines: 13, spread: 0.12 },
    { mode: 'band', angles: [48, -48], lines: 13, spread: 0.12 },
    { mode: 'band', angles: [72, -72], lines: 13, spread: 0.12 },
    { mode: 'full', angles: [24, -24], lines: 9,  spread: 0.30 }
  ];

  /* Wie oft derselbe Code gelesen werden muss, bevor er gilt. Die
     Prüfziffer allein lässt jeden zehnten Zufallstreffer durch, und es
     wird jetzt viel aggressiver gesucht als früher: schräg, mehrfach,
     an jedem Randmuster. Zwei übereinstimmende Lesungen kosten ein
     Zehntel Sekunde und schließen den Zufall praktisch aus. */
  const CONFIRM = 2;

  let stream = null;
  let running = false;
  let cvBand = null, cvFull = null;
  let engine = '—';
  let native = false;

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
    try { await fn(blankCanvas(), PLAN[0]); return true; }
    catch (e) {
      if (!broken(e)) return true;
      console.warn('Dekodierer unbrauchbar:', e);
      return false;
    }
  }

  /* ---------- Den besten verfügbaren Dekodierer finden ---------- */

  async function buildDecoder() {
    const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

    // 1. Vom Browser mitgeliefert (Android/Chrome; Safari kann das nicht).
    //    Das ist mit Abstand der beste Weg: dahinter steckt ein trainiertes
    //    Modell, das auch mit verbogenen Codes zurechtkommt.
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
          if (await usable(fn)) { engine = 'BarcodeDetector'; native = true; return fn; }
        }
      } catch (e) { /* weiter zu ZXing */ }
    }

    // 2. Der eigene Leser. Braucht kein Internet, kein CDN, keine
    //    fremde API — und ist der einzige Zweig, der hier geprüft werden
    //    konnte. Deckt EAN-13, EAN-8 und UPC-A ab; mehr trägt kein
    //    Lebensmittel.
    if (typeof EAN !== 'undefined') {
      const fn = (canvas, plan) => {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return EAN.decode(img, plan);
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
     Der mittlere Streifen wird in voller Auflösung ausgeschnitten. Ein
     EAN-13 besteht aus 95 Modulen — je mehr Bildpunkte auf ein Modul
     fallen, desto sicherer die Erkennung, und heruntergerechnet wird
     erst, wenn es sein muss. */

  function prepare(video, mode, contrast) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;

    let sx, sy, sw, sh, cap;
    if (mode === 'band') {
      sw = Math.round(vw * BAND.w);
      sh = Math.round(vh * BAND.h);
      sx = Math.round((vw - sw) / 2);
      sy = Math.round((vh - sh) / 2);
      cap = BAND.cap;
    } else {
      sx = 0; sy = 0; sw = vw; sh = vh;
      cap = FULL.cap;
    }

    const scale = Math.min(1, cap / sw);
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));

    let c = mode === 'band' ? cvBand : cvFull;
    if (!c) {
      c = document.createElement('canvas');
      if (mode === 'band') cvBand = c; else cvFull = c;
    }
    if (c.width !== dw || c.height !== dh) { c.width = dw; c.height = dh; }

    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
    if (contrast) stretch(ctx, dw, dh);
    return c;
  }

  /* Graustufen mit gespreiztem Kontrast: hilft bei mattem Licht und
     glänzenden Verpackungen spürbar.

     Die dunkelsten und hellsten zwei Prozent bleiben dabei außen vor.
     Sonst genügt ein einziger Glanzpunkt auf der Folie, um das Bild
     nach oben, und ein Schatten, um es nach unten auszureizen — die
     Spanne ist dann voll, und gespreizt wird gar nichts. Genau so
     sehen die Bilder aus, um die es hier geht. */
  function stretch(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const hist = new Int32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      d[i] = v;
      hist[v]++;
    }

    const skip = Math.max(1, ((d.length >> 2) * 0.02) | 0);
    let lo = 0, hi = 255, seen = 0;
    for (let v = 0; v < 256; v++) { seen += hist[v]; if (seen > skip) { lo = v; break; } }
    seen = 0;
    for (let v = 255; v >= 0; v--) { seen += hist[v]; if (seen > skip) { hi = v; break; } }

    const span = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      let v = ((d[i] - lo) * 255 / span) | 0;
      if (v < 0) v = 0; else if (v > 255) v = 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ---------- Kamera öffnen ----------
     Von hoch aufgelöst und rückseitig abwärts, bis eine Fassung greift.
     Die Auflösung steht bewusst ganz oben: sie ist der wirksamste
     einzelne Hebel für die Erkennung. */

  const LADDER = [
    { facingMode: { exact: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
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

  /* Dauerhaften Autofokus einschalten, wo es ihn gibt. Ohne ihn stellt
     die Kamera einmal beim Start scharf und bleibt dann stehen — auf
     einer Packung, die zehn Zentimeter näher gehalten wird, liest dann
     niemand mehr etwas. Alles hier ist freiwillig: kann die Kamera es
     nicht, bleibt es eben, wie es ist. */
  async function tune(track) {
    if (!track || !track.applyConstraints) return;
    let caps = {};
    try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (e) { return; }

    const advanced = [];
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
      advanced.push({ focusMode: 'continuous' });
    }
    if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) {
      advanced.push({ exposureMode: 'continuous' });
    }
    if (!advanced.length) return;
    try { await track.applyConstraints({ advanced }); } catch (e) { /* dann eben nicht */ }
  }

  /**
   * Startet die Kamera und ruft onCode(code) beim ersten bestätigten Treffer.
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
    await tune(stream.getVideoTracks()[0]);

    native = false;
    const decode = await buildDecoder();
    if (!decode) {
      stop(video);
      throw Object.assign(new Error('Keine Barcode-Erkennung verfügbar'), { kind: 'nodecoder' });
    }

    running = true;
    let last = 0, pass = 0, done = false;
    const began = Date.now();
    const seen = new Map();
    let toldTip = false, toldDiag = false;

    const tick = async now => {
      if (!running) return;

      if (now - last > 110) {
        last = now;
        const plan = PLAN[pass++ % PLAN.length];

        // Die eingebaute Erkennung bekommt das Videobild unbeschnitten:
        // sie sucht sich den Code selbst und arbeitet auf der vollen
        // Auflösung besser als auf einem nachbearbeiteten Ausschnitt.
        // Nur jedes zweite Bild bekommt sie den Ausschnitt — der hilft,
        // wenn der Code klein und weit weg ist.
        const frame = native
          ? ((pass & 1) ? video : prepare(video, 'band', false))
          : prepare(video, plan.mode, true);

        if (frame) {
          try {
            const code = await decode(frame, plan);
            if (code && !done) {
              const clean = String(code).replace(/\s/g, '');
              const n = (seen.get(clean) || 0) + 1;
              seen.set(clean, n);
              if (n >= CONFIRM) {
                done = true; running = false;
                if (navigator.vibrate) navigator.vibrate(40);
                onCode(clean);
                return;
              }
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
