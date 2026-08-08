/* =========================================================
   scanner.js — Barcode über die Kamera
   Erst die eingebaute Erkennung (Android/Chrome), sonst ZXing.
   Braucht HTTPS. Auf file:// oder http:// bleibt die Kamera zu.
   ========================================================= */

const Scanner = (() => {

  const ZXING_SRC = [
    'https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js',
    'https://cdn.jsdelivr.net/npm/@zxing/library@0.19.1/umd/index.min.js'
  ];

  let stream = null;
  let running = false;
  let canvas = null;
  let zxReader = null;

  function loadScript(src) {
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = ok;
      s.onerror = () => no(new Error('Skript nicht geladen: ' + src));
      document.head.appendChild(s);
    });
  }

  async function getZXing() {
    if (window.ZXing) return window.ZXing;
    for (const src of ZXING_SRC) {
      try {
        await loadScript(src);
        if (window.ZXing) return window.ZXing;
      } catch (e) { /* nächste Quelle */ }
    }
    return null;
  }

  /* Liefert eine Funktion, die aus einem Bild einen Code macht — oder null */
  async function buildDetector() {
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const use = formats.filter(f => supported.includes(f));
        if (use.length) {
          const det = new window.BarcodeDetector({ formats: use });
          return async (source) => {
            const found = await det.detect(source);
            return found.length ? found[0].rawValue : null;
          };
        }
      } catch (e) { /* weiter zu ZXing */ }
    }

    const ZX = await getZXing();
    if (!ZX || !ZX.BrowserMultiFormatReader) return null;

    const hints = new Map();
    hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [
      ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8,
      ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E,
      ZX.BarcodeFormat.CODE_128, ZX.BarcodeFormat.CODE_39, ZX.BarcodeFormat.ITF
    ]);
    hints.set(ZX.DecodeHintType.TRY_HARDER, true);
    zxReader = new ZX.BrowserMultiFormatReader(hints);

    return async (source) => {
      try {
        const res = zxReader.decodeFromCanvas(source);
        return res ? res.getText() : null;
      } catch (e) {
        return null; // nichts gefunden, ganz normal
      }
    };
  }

  function frameToCanvas(video) {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, 1000 / Math.max(w, h));
    if (!canvas) canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d', { willReadFrequently: true })
          .drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /**
   * Startet die Kamera und ruft onCode(code) beim ersten Treffer.
   * Wirft mit .kind = 'insecure' | 'unsupported' | 'denied' | 'nocamera' | 'nodecoder'
   */
  async function start(video, onCode) {
    if (running) return;

    if (!window.isSecureContext) {
      throw Object.assign(new Error('Kamera braucht HTTPS'), { kind: 'insecure' });
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw Object.assign(new Error('Kein Kamerazugriff im Browser'), { kind: 'unsupported' });
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
    } catch (e) {
      const kind = (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) ? 'denied' : 'nocamera';
      throw Object.assign(new Error('Kamera nicht verfügbar'), { kind });
    }

    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    try { await video.play(); } catch (e) { /* iOS spielt manchmal erst nach Metadaten */ }

    const detect = await buildDetector();
    if (!detect) {
      stop(video);
      throw Object.assign(new Error('Keine Barcode-Erkennung verfügbar'), { kind: 'nodecoder' });
    }

    running = true;
    let last = 0;
    let done = false;

    const tick = async (now) => {
      if (!running) return;
      if (now - last > 120) {
        last = now;
        const frame = frameToCanvas(video);
        if (frame) {
          try {
            const code = await detect(frame);
            if (code && !done) {
              done = true;
              running = false;
              if (navigator.vibrate) navigator.vibrate(40);
              onCode(String(code).replace(/\s/g, ''));
              return;
            }
          } catch (e) { /* weiterprobieren */ }
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

  return { start, stop };
})();
