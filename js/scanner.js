/* =========================================================
   scanner.js — Barcode über die Kamera

   Diese Datei kümmert sich um die Kamera und um den Takt; gelesen
   wird in scan-engine.js, und zwar möglichst in einem eigenen
   Arbeiter (scan-worker.js).

   Was den Unterschied zwischen „draufhalten und fertig" und
   „draufhalten und warten" ausmacht:

   - Kamera und Leser starten gleichzeitig, nicht nacheinander. Und
     der Leser wird schon beim Öffnen der App vorgewärmt, damit beim
     ersten Antippen nichts mehr zu laden ist.
   - Gesucht wird in jedem Kamerabild, nicht alle 110 ms eins. Über
     requestVideoFrameCallback kommt genau dann ein Bild, wenn die
     Kamera eines geliefert hat — kein Bild wird zweimal durchsucht,
     keines ausgelassen.
   - Die Suche läuft nebenan, deshalb bleibt das Sucherbild flüssig.
   - Immer nur ein Bild unterwegs. Wer nachschiebt, was der Leser
     nicht abarbeiten kann, sucht am Ende in Bildern von vorgestern.

   Braucht HTTPS. Auf file:// oder http:// bleibt die Kamera zu.
   ========================================================= */

const Scanner = (() => {

  const ZXING_SRC = './vendor/zxing/zxing_reader.js';
  const WASM_SRC  = './vendor/zxing/zxing_reader.wasm';

  let stream = null;
  let track = null;
  let running = false;
  let worker = null;
  let workerReady = false;
  let workerDead = false;
  let preparing = null;
  let engineName = '—';
  let torchOn = false;
  let canTorch = false;
  let mainReady = false;
  let listening = null;          // der Zuhörer der laufenden Sitzung
  let epoch = 0;                 // zählt die Sitzungen, siehe start()

  function unlisten() {
    if (worker && listening) worker.removeEventListener('message', listening);
    listening = null;
  }

  /* ---------- Der Arbeiter ---------- */

  function spawn() {
    if (worker || workerDead) return worker;
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' ||
        typeof createImageBitmap === 'undefined') {
      workerDead = true;
      return null;
    }
    try {
      worker = new Worker('./js/scan-worker.js');
    } catch (e) {
      workerDead = true;
      return null;
    }
    worker.onerror = () => { workerDead = true; workerReady = false; worker = null; };
    return worker;
  }

  /* Leser bereitstellen. Darf früh und darf mehrfach gerufen werden —
     beim zweiten Mal ist schon alles da. */
  function prime() {
    if (preparing) return preparing;
    preparing = new Promise(done => {
      const w = spawn();
      if (!w) { primeMain().then(done); return; }

      // Geht der Arbeiter unter — und sei es beim Laden seiner eigenen
      // Skripte —, darf das Versprechen nicht offen bleiben: dann
      // stünde der Scanner mit laufender Kamera da und täte nichts.
      const giveUp = () => {
        if (workerReady) return;
        w.removeEventListener('message', onMessage);
        workerDead = true;
        worker = null;
        primeMain().then(done);
      };

      const onMessage = ev => {
        const msg = ev.data || {};
        if (msg.type === 'ready') {
          workerReady = true;
          engineName = msg.engine;
          done(true);                       // weitere 'ready' rücken nur nach
        } else if (msg.type === 'fail') {
          giveUp();
        }
      };
      w.addEventListener('message', onMessage);
      w.addEventListener('error', giveUp);
      setTimeout(giveUp, 8000);
      w.postMessage({ type: 'prepare' });
    });
    return preparing;
  }

  /* Ohne Arbeiter: derselbe Leser, nur im Haupt-Faden. */
  function loadScript(src) {
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = ok;
      s.onerror = () => no(new Error('Skript nicht geladen: ' + src));
      document.head.appendChild(s);
    });
  }

  async function primeMain() {
    if (mainReady) return true;
    if (typeof ScanEngine === 'undefined') return false;
    if (!window.ZXingWASM) {
      try { await loadScript(ZXING_SRC); } catch (e) { /* dann ohne */ }
    }
    const name = await ScanEngine.prepare({
      wasmUrl: new URL(WASM_SRC, document.baseURI).href,
      onEngine: n => { engineName = n; }
    });
    mainReady = !!name;
    return mainReady;
  }

  /**
   * Vorwärmen, solange niemand wartet: Arbeiter starten, WebAssembly
   * holen, einmal leer durchlaufen lassen. Danach ist das Antippen von
   * „Scannen" nur noch die Kamera.
   */
  function warmup() {
    if (!window.isSecureContext) return;
    const go = () => prime().catch(() => {});
    if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 4000 });
    else setTimeout(go, 1200);
  }

  /* ---------- Kamera ----------

     Eine einzige Anfrage mit Wunschwerten statt einer Leiter aus
     Versuchen: jeder abgelehnte Versuch kostet spürbar Zeit, und
     „ideal" heißt ohnehin „nimm, was am nächsten dran ist". Die
     Leiter bleibt nur für den Fall, dass ein Browser sich quer legt. */

  const LADDER = [
    {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 }, height: { ideal: 1080 },
      frameRate: { ideal: 30 }
    },
    { facingMode: { ideal: 'environment' } },
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
  async function tune(t) {
    canTorch = false;
    if (!t || !t.applyConstraints) return;
    let caps = {};
    try { caps = t.getCapabilities ? t.getCapabilities() : {}; } catch (e) { return; }
    canTorch = !!caps.torch;

    const advanced = [];
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
      advanced.push({ focusMode: 'continuous' });
    }
    if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) {
      advanced.push({ exposureMode: 'continuous' });
    }
    if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) {
      advanced.push({ whiteBalanceMode: 'continuous' });
    }
    if (!advanced.length) return;
    try { await t.applyConstraints({ advanced }); } catch (e) { /* dann eben nicht */ }
  }

  /** Licht an oder aus, wo die Kamera das hergibt. */
  async function torch(on) {
    if (!track || !canTorch) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: !!on }] });
      torchOn = !!on;
      return true;
    } catch (e) {
      canTorch = false;
      return false;
    }
  }

  /* ---------- Suchen ---------- */

  /**
   * Startet die Kamera und ruft onCode(code) beim ersten bestätigten
   * Treffer. onStatus(key, vars) meldet Hinweise, während gesucht wird.
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

    // Wer das Blatt zumacht, während die Kamera noch anläuft, soll
    // nicht mit laufender Kamera dastehen. Jede Sitzung bekommt eine
    // Nummer; stop() zählt sie weiter, und nach jedem Warten wird
    // nachgesehen, ob es noch dieselbe ist.
    const mine = ++epoch;
    const mineStill = () => epoch === mine;

    // Beides gleichzeitig: die Kamera fragt den Benutzer, der Leser
    // lädt. Nacheinander wäre es die Summe aus beidem.
    const decoder = prime();

    try {
      stream = await openCamera();
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      throw Object.assign(new Error('Kamera nicht verfügbar'), { kind: denied ? 'denied' : 'nocamera' });
    }

    if (!mineStill()) { stop(video); return; }

    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    try { await video.play(); } catch (e) { /* iOS spielt manchmal erst nach den Metadaten */ }
    track = stream.getVideoTracks()[0];
    await tune(track);

    const engineUp = await decoder;
    if (!mineStill()) { stop(video); return; }
    if (!engineUp) {
      stop(video);
      throw Object.assign(new Error('Keine Barcode-Erkennung verfügbar'), { kind: 'nodecoder' });
    }

    running = true;
    torchOn = false;

    const votes = ScanEngine.tally();
    const began = Date.now();
    let index = 0, busy = false, done = false, grabFails = 0, sent = 0;
    let toldTip = false, toldDiag = false;

    const finish = code => {
      done = true;
      running = false;
      unlisten();
      if (navigator.vibrate) navigator.vibrate(40);
      onCode(code);
    };

    let toldHold = false;
    const consider = hit => {
      if (!hit || done) return;
      if (votes.add(hit.code, hit.lines, hit.sure)) { finish(hit.code); return; }
      // Etwas gelesen, aber noch nicht bestätigt: eine Handbreit
      // Stillhalten, und das zweite Bild bringt es.
      if (!toldHold) { toldHold = true; say('scan.hold'); }
    };

    const hints = () => {
      const secs = (Date.now() - began) / 1000;
      if (!toldTip && secs > 5) {
        toldTip = true;
        say('scan.tip');
      }
      if (!toldDiag && secs > 14) {
        toldDiag = true;
        say('scan.diag', { info: `${video.videoWidth}×${video.videoHeight} · ${engineName}` });
      }
    };

    /* Der Arbeiter antwortet auf jedes Bild genau einmal — erst danach
       wird das nächste hinübergereicht. */
    const onMessage = ev => {
      const msg = ev.data || {};
      if (msg.type === 'hit') { busy = false; consider(msg.hit); }
      else if (msg.type === 'idle') { busy = false; }
      else if (msg.type === 'fail' && msg.reason === 'crash') {
        busy = false;
        console.error('Barcode-Erkennung abgestürzt:', msg.detail);
        running = false;
        unlisten();
        say('scan.err.nodecoder');
      }
    };
    unlisten();
    if (worker && workerReady) { listening = onMessage; worker.addEventListener('message', onMessage); }

    const pump = async () => {
      if (!running || done) return;
      // Antwortet der Arbeiter nach zwei Sekunden nicht, ist er weg.
      // Dann lieber im Haupt-Faden weitersuchen als still stehen.
      if (busy && Date.now() - sent > 2000) {
        busy = false;
        unlisten();
        workerReady = false;
        workerDead = true;
        await primeMain();
      }
      if (busy || !video.videoWidth) { next(); return; }
      busy = true;
      sent = Date.now();
      const at = index++;

      try {
        if (worker && workerReady) {
          const bitmap = await createImageBitmap(video);
          worker.postMessage({ type: 'frame', bitmap, index: at }, [bitmap]);
          // busy wird in onMessage zurückgesetzt
        } else {
          const hit = await ScanEngine.read(video, video.videoWidth, video.videoHeight, at);
          busy = false;
          consider(hit);
        }
      } catch (e) {
        busy = false;
        if (worker && workerReady && ++grabFails >= 3) {
          // Dieser Browser mag kein createImageBitmap vom Video —
          // dann eben im Haupt-Faden weiter.
          unlisten();
          workerReady = false;
          workerDead = true;
          await primeMain();
        } else if (!worker || !workerReady) {
          console.error('Barcode-Erkennung abgestürzt:', e);
          running = false;
          say('scan.err.nodecoder');
          return;
        }
      }

      hints();
      next();
    };

    /* requestVideoFrameCallback gibt es genau dann ein Bild, wenn die
       Kamera eines geliefert hat. Sonst tut es der Zeichentakt. */
    const rvfc = typeof video.requestVideoFrameCallback === 'function';
    const beat = () => pump().catch(e => {
      busy = false;
      console.error('Scan-Takt gestolpert:', e);
      next();
    });
    const next = () => {
      if (!running || done) return;
      if (rvfc) video.requestVideoFrameCallback(beat);
      else requestAnimationFrame(beat);
    };
    next();
  }

  function stop(video) {
    running = false;
    epoch++;
    unlisten();
    if (canTorch && torchOn) torch(false);
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    track = null;
    canTorch = false;
    if (video) video.srcObject = null;
  }

  return {
    start, stop, warmup, torch,
    get engine() { return engineName; },
    get hasTorch() { return canTorch; },
    get torchOn() { return torchOn; }
  };
})();
