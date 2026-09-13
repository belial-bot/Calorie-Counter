/* =========================================================
   scan-worker.js — die Erkennung läuft nebenan

   Ein Kamerabild zu durchsuchen dauert ein paar Dutzend
   Millisekunden. Im Haupt-Faden fehlen die genau dort, wo das
   Bild gezeichnet wird: das Sucherbild ruckelt, und weil beides
   um dieselbe Zeit streitet, wird auch seltener gesucht.

   Hier läuft es daneben. Das Bild kommt als ImageBitmap herüber
   (übergeben, nicht kopiert), die Antwort geht als Nummer zurück.
   ========================================================= */

let ready = false;

try {
  importScripts('../vendor/zxing/zxing_reader.js');
} catch (e) {
  // Ohne ZXing geht es weiter — dann eben mit dem, was der Browser
  // mitbringt, oder mit dem eingebauten Leser.
  console.warn('ZXing nicht geladen:', e);
}
importScripts('ean.js', 'scan-engine.js');

const WASM = new URL('../vendor/zxing/zxing_reader.wasm', self.location.href).href;

self.onmessage = async ev => {
  const msg = ev.data || {};

  if (msg.type === 'prepare') {
    try {
      const name = await ScanEngine.prepare({
        wasmUrl: WASM,
        onEngine: engine => {
          ready = true;
          self.postMessage({ type: 'ready', engine });
        }
      });
      if (!name) self.postMessage({ type: 'fail', reason: 'nodecoder' });
    } catch (e) {
      self.postMessage({ type: 'fail', reason: 'nodecoder', detail: String(e) });
    }
    return;
  }

  if (msg.type === 'frame') {
    const bitmap = msg.bitmap;
    if (!ready) { if (bitmap && bitmap.close) bitmap.close(); self.postMessage({ type: 'idle' }); return; }
    try {
      const hit = await ScanEngine.read(bitmap, msg.rect, msg.index);
      self.postMessage({ type: 'hit', hit: hit });
    } catch (e) {
      self.postMessage({ type: 'fail', reason: 'crash', detail: String(e && e.message || e) });
    } finally {
      if (bitmap && bitmap.close) bitmap.close();
    }
  }
};
