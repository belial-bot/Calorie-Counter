/* =========================================================
   scanner.test.js — dem Scanner auf den Zahn gefühlt

   Läuft ohne alles: node test/scanner.test.js

   Geprüft wird die ganze Kette, wie sie später auf dem Handy läuft:
   ein gemaltes Kamerabild (test/barcode-image.js) geht in
   scan-engine.js, wird zugeschnitten, gedreht, binarisiert und von
   dem ZXing-C++ aus vendor/zxing/ gelesen — denselben Dateien, die
   ausgeliefert werden. Nur die Zeichenfläche ist nachgebaut
   (test/canvas2d.js), weil node keine hat.

   Der Korb enthält die Fälle, an denen der alte Leser gescheitert
   ist: Wölbung, Falten, Schräglage, Glanz, halber Schatten, wenig
   Licht. Jeder muss gefunden werden, und zwar in wenigen Bildern —
   ein Scanner, der nach zwei Sekunden Recht bekommt, ist keiner.
   ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { Canvas2D } = require('./canvas2d.js');
const { render, ean13, checkDigit, seeded, randomCode } = require('./barcode-image.js');

const ROOT = path.join(__dirname, '..');

/* ---------- ein sehr kleines Testgerüst ---------- */

let passed = 0, failed = 0;
const failures = [];
const tests = [];

function test(name, fn) { tests.push([name, fn]); }

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'erwartet: wahr');
}

function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || ''}\n    ist:  ${actual}\n    soll: ${expected}`);
}

/* ---------- Umgebung für die Module ---------- */

global.self = global;
global.OffscreenCanvas = Canvas2D;
global.EAN = require(path.join(ROOT, 'js', 'ean.js'));

/* ZXing so laden, wie es der Browser täte: die ausgelieferte Datei,
   in einem eigenen Bereich, mit dem ausgelieferten WebAssembly. */
function loadZXing() {
  const js = fs.readFileSync(path.join(ROOT, 'vendor', 'zxing', 'zxing_reader.js'), 'utf8');
  const bin = fs.readFileSync(path.join(ROOT, 'vendor', 'zxing', 'zxing_reader.wasm'));
  const box = {
    console, URL, TextDecoder, TextEncoder, WebAssembly, performance,
    setTimeout, clearTimeout, Date, Math, Uint8Array, Uint8ClampedArray, Promise
  };
  box.globalThis = box;
  box.self = box;
  vm.createContext(box);
  vm.runInContext(js, box);
  const Z = box.ZXingWASM;
  Z.prepareZXingModule({
    overrides: { wasmBinary: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) },
    fireImmediately: true
  });
  return Z;
}

global.ZXingWASM = loadZXing();
const ScanEngine = require(path.join(ROOT, 'js', 'scan-engine.js'));

/* ---------- Hilfen ---------- */

const W = 960, H = 540;

function frame(code, opts, n) {
  // Ein Bild aus einer Sitzung: die Hand zittert ein wenig.
  const jit = seeded(4000 + n * 37);
  return render(code, Object.assign({
    width: W, height: H, module: 3.6, noise: 6, seed: n + 1
  }, opts, {
    angle: (opts.angle || 0) + (jit() - 0.5) * 4,
    cx: (opts.cx == null ? 0.5 : opts.cx) + (jit() - 0.5) * 0.02,
    cy: (opts.cy == null ? 0.5 : opts.cy) + (jit() - 0.5) * 0.02
  }));
}

/* Eine Scan-Sitzung nachspielen: Bild für Bild, Durchgang für
   Durchgang, mit derselben Bestätigungsregel wie im Scanner.
   Gibt zurück, was herausgekommen ist und nach wie vielen Bildern. */
async function session(code, opts, limit) {
  const votes = ScanEngine.tally();
  const wrong = [];
  for (let i = 0; i < (limit || 8); i++) {
    const img = frame(code, opts, i);
    const hit = await ScanEngine.read(img, img.width, img.height, i);
    if (!hit) continue;
    if (hit.code !== code) wrong.push(`${hit.code} (${hit.pass}, ${hit.lines} Zeilen)`);
    if (votes.add(hit.code, hit.lines, hit.sure)) return { code: hit.code, frames: i + 1, wrong };
  }
  return { code: null, frames: limit || 8, wrong };
}

/* ---------- Der Korb ---------- */

const BASKET = [
  ['sauber, nah',             { module: 4.2 }],
  ['klein / weit weg',        { module: 2.0 }],
  ['unscharf',                { module: 4.2, blur: 2 }],
  ['schräg 20°',              { module: 4.2, angle: 20 }],
  ['schräg 45°',              { module: 3.6, angle: 45 }],
  ['schräg 65°',              { module: 3.6, angle: 65 }],
  ['hochkant 90°',            { module: 4.2, angle: 90 }],
  ['gewölbt (Flasche)',       { module: 4.2, curve: 0.55 }],
  ['stark gewölbt (Dose)',    { module: 4.2, curve: 0.85 }],
  ['zerknittert (Tüte)',      { module: 4.2, wrinkle: 0.30, wrinkleLen: 25 }],
  ['Glanz auf Folie',         { module: 4.2, glare: 0.85, contrast: 0.55 }],
  ['halb im Schatten',        { module: 4.2, shadow: 0.75 }],
  ['wenig Licht, Rauschen',   { module: 4.2, contrast: 0.45, noise: 28 }],
  ['außermittig',             { module: 3.6, cx: 0.28, cy: 0.32 }],
  ['gewölbt + schräg + unscharf', { module: 4.2, curve: 0.5, angle: 26, blur: 1.5 }],
  ['knittrig + Glanz',        { module: 4.2, wrinkle: 0.25, wrinkleLen: 30, glare: 0.7, blur: 1 }],
  ['Schatten + schräg',       { module: 4.2, shadow: 0.7, angle: 32 }],
  ['knappe Ruhezone',         { module: 4.2, quiet: 3 }]
];

/* ---------- Prüfungen ---------- */

test('Die Prüfziffer stimmt mit ean.js überein', () => {
  eq(checkDigit('400638133393'), '1', 'Ritter Sport');
  eq(ean13('400638133393').code, '4006381333931');
  ok(EAN.checksumOk('4006381333931'), 'ean.js hält die Nummer für gültig');
  ok(!EAN.checksumOk('4006381333932'), 'eine falsche Prüfziffer fällt durch');
});

test('Der Plan hat alles, was gebraucht wird', () => {
  const ids = ScanEngine.passes.map(p => p.id);
  eq(ids.length, 4, 'vier Durchgänge');
  ok(ScanEngine.passes.some(p => p.bin), 'einer binarisiert');
  ok(ScanEngine.passes.some(p => p.rot === 45), 'einer dreht um 45 Grad');
  ok(ScanEngine.passes.every(p => Array.isArray(p.angles) && p.angles.length),
    'jeder sagt dem Ersatzleser, unter welchem Winkel er suchen soll');
  ok(!ScanEngine.FORMATS.includes('UPC-E'),
    'UPC-E bleibt draußen: sechs Ziffern lassen sich zu leicht in Falten hineinlesen');
});

test('Ein Fund gilt erst, wenn er belegt ist', () => {
  const v = ScanEngine.tally();
  ok(!v.add('4006381333931', 3, 24), 'eine dünne Lesung allein zählt nicht');
  ok(!v.add('4006381333930', 3, 24), 'eine andere Nummer hilft nicht nach');
  ok(v.add('4006381333931', 3, 24), 'dieselbe Nummer ein zweites Mal: gilt');

  const w = ScanEngine.tally();
  ok(w.add('4006381333931', 80, 24), 'viele übereinstimmende Zeilen gelten sofort');

  const x = ScanEngine.tally();
  ok(!x.add('4006381333931', 80, 0), 'ohne Zeilenzahl gibt es kein Sofort');
  ok(x.add('4006381333931', 80, 0), '… dafür die zweite Lesung');

  const y = ScanEngine.tally();
  ok(!y.add(null, 99, 24), 'nichts gelesen ist kein Fund');
});

test('Der ausgelieferte ZXing-Leser steht bereit', async () => {
  const name = await ScanEngine.prepare({});
  eq(name, 'ZXing C++ (WASM)', 'es ist der mitgelieferte Leser');
});

test('Der Korb wird gefunden — jeder Fall, in wenigen Bildern', async () => {
  const rnd = seeded(77);
  let total = 0, misread = 0;
  const slow = [];
  for (const [name, opts] of BASKET) {
    const code = ean13(randomCode(rnd)).code;
    const r = await session(code, opts, 8);
    misread += r.wrong.length;
    ok(r.code === code, `${name}: ${r.code ? 'gelesen als ' + r.code : 'nicht gefunden'}`);
    total += r.frames;
    if (r.frames > 4) slow.push(`${name} (${r.frames})`);
  }
  const avg = total / BASKET.length;
  console.log(`    Korb: ${BASKET.length}/${BASKET.length} gefunden, im Mittel ${avg.toFixed(1)} Bilder`);
  ok(misread === 0, `${misread} Fehlgriffe`);
  ok(avg <= 2.5, `im Mittel ${avg.toFixed(1)} Bilder — zu langsam`);
  ok(!slow.length, 'zu langsam: ' + slow.join(', '));
});

test('Der Schatten-Durchgang verdient seinen Platz', async () => {
  const code = ean13(randomCode(seeded(5))).code;
  const img = frame(code, { module: 4.2, shadow: 0.8 }, 0);
  const raw = await ScanEngine.read(img, img.width, img.height, 0);   // band, roh
  const bin = await ScanEngine.read(img, img.width, img.height, 1);   // band, binarisiert
  ok(!raw, `roh wurde etwas gelesen (${raw && raw.code}) — dann fehlt der Beleg für diesen Durchgang`);
  ok(bin && bin.code === code, 'binarisiert kommt der Code heraus');
});

test('Der Diagonal-Durchgang verdient seinen Platz', async () => {
  const code = ean13(randomCode(seeded(6))).code;
  const img = frame(code, { module: 3.6, angle: 45 }, 0);
  const raw = await ScanEngine.read(img, img.width, img.height, 0);   // band, ungedreht
  const rot = await ScanEngine.read(img, img.width, img.height, 2);   // um 45 Grad gedreht
  ok(!raw || raw.code !== code, 'ungedreht liest ZXing keine Diagonale');
  ok(rot && rot.code === code, 'gedreht kommt der Code heraus');
});

test('Binarisieren macht aus einem Bild Schwarz und Weiß', () => {
  const code = ean13(randomCode(seeded(8))).code;
  const img = frame(code, { module: 4.2, shadow: 0.7 }, 0);
  const copy = { data: Uint8ClampedArray.from(img.data), width: img.width, height: img.height };
  ScanEngine.binarize(copy);
  let other = 0, black = 0, white = 0;
  for (let i = 0; i < copy.data.length; i += 4) {
    const v = copy.data[i];
    if (v === 0) black++; else if (v === 255) white++; else other++;
  }
  eq(other, 0, 'nur noch 0 und 255');
  ok(black > 1000 && white > 1000, 'beide Farben kommen vor');
  // Die Ruhezone ist gleichmäßig hell — sie darf nicht in Rauschen zerfallen
  let edge = 0;
  for (let x = 0; x < 40; x++) if (copy.data[(20 * copy.width + x) * 4] === 0) edge++;
  eq(edge, 0, 'die leere Ecke bleibt weiß');
});

test('Der eingebaute Ersatzleser kommt ohne ZXing aus', () => {
  const rnd = seeded(99);
  const cases = [
    ['sauber', { module: 4.2 }],
    ['gewölbt', { module: 4.2, curve: 0.7 }],
    ['zerknittert', { module: 4.2, wrinkle: 0.3, wrinkleLen: 25 }],
    ['schräg 30°', { module: 4.2, angle: 30 }],
    ['wenig Licht', { module: 4.2, contrast: 0.5, noise: 20 }]
  ];
  for (const [name, opts] of cases) {
    const code = ean13(randomCode(rnd)).code;
    const img = frame(code, opts, 0);
    const hit = EAN.decode(img, { angles: [0, 30, -30, 90], lines: 15, spread: 0.22 });
    eq(hit, code, name);
  }
});

/* ---------- Ergebnis ---------- */

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; }
    catch (e) { failed++; failures.push(`${name}\n    ${e.message}`); }
  }
  const total = passed + failed;
  console.log(`\n${passed}/${total} Prüfungen bestanden\n`);
  if (failures.length) {
    console.log('Durchgefallen:\n');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}\n`));
  }
  process.exit(failed ? 1 : 0);
})();
