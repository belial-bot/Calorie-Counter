/* =========================================================
   units.test.js — Stück, Löffel und Gläser

   Läuft ohne alles: node test/units.test.js

   Geprüft wird das, woran die Sache scheitert, wenn sie
   scheitert: dass "Apfelsaft" keine Äpfel zählt, dass aus
   "2 Kekse (25 g)" ein Keks von 12,5 g wird, und dass ein
   Wechsel der Einheit die Menge nicht verändert.
   ========================================================= */

const path = require('path');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}\n    ${e.message}`); }
}

function ok(cond, msg) { if (!cond) throw new Error(msg || 'erwartet: wahr'); }

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || ''}\n    ist:  ${a}\n    soll: ${b}`);
}

function near(actual, expected, msg) {
  if (Math.abs(actual - expected) > 0.01) {
    throw new Error(`${msg || ''}\n    ist:  ${actual}\n    soll: ${expected}`);
  }
}

/* ---------- Umgebung ---------- */

global.Rank = require(path.join(__dirname, '..', 'js', 'search.js'));

let lang = 'de';
const WORDS = {
  de: {
    'unit.piece': 'Stück', 'unit.pieces': 'Stück',
    'unit.small': 'klein', 'unit.large': 'groß',
    'unit.glass': 'Glas', 'unit.glasses': 'Gläser',
    'unit.cup': 'Tasse', 'unit.cups': 'Tassen',
    'unit.mug': 'Becher', 'unit.mugs': 'Becher',
    'unit.tbsp': 'EL', 'unit.tsp': 'TL',
    'unit.handful': 'Handvoll', 'unit.handfuls': 'Handvoll'
  },
  en: {
    'unit.piece': 'piece', 'unit.pieces': 'pieces',
    'unit.small': 'small', 'unit.large': 'large',
    'unit.glass': 'glass', 'unit.glasses': 'glasses',
    'unit.cup': 'cup', 'unit.cups': 'cups',
    'unit.mug': 'mug', 'unit.mugs': 'mugs',
    'unit.tbsp': 'tbsp', 'unit.tsp': 'tsp',
    'unit.handful': 'handful', 'unit.handfuls': 'handfuls'
  }
};
global.I18n = {
  get lang() { return lang; },
  t: key => (WORDS[lang] && WORDS[lang][key]) || key
};

const Units = require(path.join(__dirname, '..', 'js', 'units.js'));

/* ---------- Hilfen ---------- */

const food = extra => Object.assign({
  name: 'Etwas', unit: 'g', per100: { kcal: 100, protein: 1, carbs: 1, fat: 1 }, portions: []
}, extra);

const ids = ms => ms.map(m => m.id);
const find = (ms, id) => ms.find(m => m.id === id);

/* =========================================================
   1. Die Tabelle trifft das Richtige — und sonst nichts
   ========================================================= */

test('Ein Apfel ist ein Apfel', () => {
  const m = Units.matchPiece('Apfel');
  ok(m && m.id === 'apple', `Apfel nicht erkannt: ${m && m.id}`);
  eq(m.grams, 182, 'Ein mittlerer Apfel wiegt 182 g (USDA)');
});

test('Mehrzahl und Umlaut zählen mit', () => {
  ok(Units.matchPiece('Äpfel'), 'Äpfel');
  ok(Units.matchPiece('Bio-Apfel'), 'Bio-Apfel');
  ok(Units.matchPiece('Apfel Braeburn'), 'Apfel Braeburn');
  ok(Units.matchPiece('apples'), 'apples');
});

test('Apfelsaft ist kein Apfel', () => {
  // Der Kern der Sache: im Deutschen steckt das Grundwort hinten,
  // und "Apfelsaft" ist ein anderes Lebensmittel als "Apfel".
  eq(Units.matchPiece('Apfelsaft'), null, 'Apfelsaft');
  eq(Units.matchPiece('Apfelmus'), null, 'Apfelmus');
  eq(Units.matchPiece('Apfelschorle'), null, 'Apfelschorle');
  eq(Units.matchPiece('Apfelkuchen'), null, 'Apfelkuchen');
});

test('Was danebensteht, zählt auch nicht', () => {
  eq(Units.matchPiece('Joghurt mit Erdbeere'), null, '„mit“ heißt: eine Zutat, keine Portion');
  eq(Units.matchPiece('Getrocknete Aprikosen'), null, 'getrocknet wiegt ein Zehntel');
  eq(Units.matchPiece('Bananensaft'), null, 'Bananensaft');
  eq(Units.matchPiece('Tomatensauce'), null, 'Tomatensauce');
  // Das letzte Wort entscheidet: hier wird Joghurt gegessen, kein Apfel.
  eq(Units.matchPiece('Apfel Joghurt').id, 'yogurtcup', 'Joghurt steht hinten, also ist es Joghurt');
  eq(Units.matchPiece('Apfeljoghurt'), null, 'zusammengeschrieben ist es ein eigenes Wort');
});

test('Ei, Brot und Schinken kommen über ihre Wörter', () => {
  eq(Units.matchPiece('Ei').id, 'egg', 'Ei');
  eq(Units.matchPiece('Eier').id, 'egg', 'Eier');
  eq(Units.matchPiece('Vollkornbrot').id, 'breadsl', 'Vollkornbrot als Scheibe');
  eq(Units.matchPiece('Kochschinken').id, 'hamsl', 'Schinken als Scheibe');
  eq(Units.matchPiece('Eiweiß'), null, 'Eiweiß ist kein Ei');
  ok(Units.matchPiece('Eis').id !== 'egg', 'Eis ist kein Ei — Eis kommt in Kugeln');
});

test('Die Löffeltabelle greift nur, wo ein Löffel Sinn ergibt', () => {
  const oil = Units.matchSpoon('Olivenöl');
  ok(oil && oil.el === 14, `Ein EL Öl wiegt 14 g, ist: ${oil && oil.el}`);
  ok(Units.matchSpoon('Honig'), 'Honig');
  eq(Units.matchSpoon('Hackfleisch'), null, 'Hackfleisch löffelt niemand');
});

/* =========================================================
   2. Die Portionsangabe der Packung lesen
   ========================================================= */

test('"2 Kekse (25 g)" macht einen Keks von 12,5 g', () => {
  const p = Units.parseServingPieces('2 Kekse (25 g)');
  ok(p, 'nichts gelesen');
  eq(p.count, 2, 'Anzahl');
  eq(p.label, 'Kekse', 'Wort');
});

test('Die Klammer darf auch andersherum stehen', () => {
  const p = Units.parseServingPieces('25 g (2 Kekse)');
  ok(p && p.count === 2, `ist: ${JSON.stringify(p)}`);
});

test('Ein einzelner Riegel wird gelesen', () => {
  const p = Units.parseServingPieces('1 Riegel (21,5 g)');
  ok(p && p.count === 1 && p.label === 'Riegel', `ist: ${JSON.stringify(p)}`);
});

test('Reines Gewicht ist kein Stück', () => {
  eq(Units.parseServingPieces('30 g'), null, '30 g');
  eq(Units.parseServingPieces('250 ml'), null, '250 ml');
  eq(Units.parseServingPieces(''), null, 'leer');
  eq(Units.parseServingPieces('1 Portion (30 g)'), null, '„Portion“ sagt nichts über ein Stück');
  eq(Units.parseServingPieces('1 Stück (30 g)'), null, '„Stück“ ebenso wenig');
});

/* =========================================================
   3. Die Maße, die am Ende zur Wahl stehen
   ========================================================= */

test('Ohne alles bleibt es bei Gramm', () => {
  const ms = Units.measuresFor(food({ name: 'Hackfleisch gemischt' }));
  eq(ids(ms), ['base'], 'nur die Grundeinheit');
  eq(ms[0].label, 'g', 'g');
});

test('Ein Apfel bringt klein, mittel und groß mit', () => {
  const ms = Units.measuresFor(food({ name: 'Apfel' }));
  ok(ids(ms).includes('piece'), 'das Stück fehlt');
  eq(find(ms, 'piece').label, 'Apfel', 'Einzahl');
  eq(find(ms, 'piece').plural, 'Äpfel', 'Mehrzahl');
  eq(find(ms, 'piece-s').base, 149, 'klein');
  eq(find(ms, 'piece-l').base, 223, 'groß');
  eq(Units.preferred(ms).id, 'piece', 'vorausgewählt ist das Stück');
});

test('Die Packung schlägt die Tabelle', () => {
  // Steht auf der Packung, was eine Portion ist, dann ist das näher
  // dran als ein Mittelwert aus der Tabelle.
  const ms = Units.measuresFor(food({
    name: 'Kekse', barcode: '4000000000000',
    servingText: '2 Kekse (25 g)', servingGrams: 25
  }));
  const piece = find(ms, 'serving-piece');
  ok(piece, 'das Stück von der Packung fehlt');
  near(piece.base, 12.5, 'ein Keks');
  eq(Units.preferred(ms).id, 'serving-piece', 'vorausgewählt');
});

test('Getränke bekommen Glas und Löffel, feste Sachen nicht', () => {
  const drink = ids(Units.measuresFor(food({ name: 'Orangensaft', unit: 'ml' })));
  ok(drink.includes('glass'), 'Glas fehlt');
  ok(drink.includes('tbsp'), 'EL fehlt');
  eq(Units.measuresFor(food({ name: 'Orangensaft', unit: 'ml' }))[0].label, 'ml', 'Grundeinheit ml');

  const solid = ids(Units.measuresFor(food({ name: 'Hackfleisch' })));
  ok(!solid.includes('glass'), 'ein Glas Hackfleisch gibt es nicht');
});

test('Öl bekommt den Esslöffel, nicht das Glas', () => {
  const ms = Units.measuresFor(food({ name: 'Olivenöl' }));
  ok(find(ms, 'tbsp'), 'EL fehlt');
  near(find(ms, 'tbsp').base, 14, 'ein EL Öl');
  ok(!find(ms, 'glass'), 'kein Glas Öl');
  eq(Units.preferred(ms).id, 'tbsp', 'vorausgewählt ist der Löffel');
});

test('Eine große Packung wird nicht vorausgewählt', () => {
  const ms = Units.measuresFor(food({
    name: 'Haferflocken', barcode: '1',
    portions: [{ label: 'Packung (1000 g)', grams: 1000 }]
  }));
  ok(find(ms, 'portion-0'), 'die Packung steht zur Wahl');
  ok(Units.preferred(ms).id !== 'portion-0', 'aber sie ist nicht die Vorgabe');
});

test('Das selbst eingetragene Stück gilt', () => {
  const ms = Units.measuresFor(food({
    name: 'Proteinriegel Eigenbau',
    piece: { label: 'Riegel', plural: 'Riegel', grams: 60 }
  }));
  const own = find(ms, 'own-piece');
  ok(own && own.base === 60, `ist: ${JSON.stringify(own)}`);
  eq(Units.preferred(ms).id, 'own-piece', 'vorausgewählt');
});

test('Auf Englisch heißen die Stücke englisch', () => {
  lang = 'en';
  const ms = Units.measuresFor(food({ name: 'apple' }));
  eq(find(ms, 'piece').label, 'apple', 'Einzahl');
  eq(find(ms, 'piece').plural, 'apples', 'Mehrzahl');
  eq(find(ms, 'piece-s').label, 'apple (small)', 'klein');
  lang = 'de';
});

/* =========================================================
   4. Rechnen, Umschalten, Schritte
   ========================================================= */

test('Der Wechsel der Einheit lässt die Menge, wie sie ist', () => {
  const ms = Units.measuresFor(food({ name: 'Apfel' }));
  const base = find(ms, 'base'), piece = find(ms, 'piece');
  eq(Units.convert(182, base, piece), 1, '182 g sind ein Apfel');
  eq(Units.convert(2, piece, base), 364, 'zwei Äpfel sind 364 g');
  eq(Units.convert(100, base, piece), 0.5, '100 g sind ein halber Apfel');
});

test('Halbe Stücke ja, Drittel nein', () => {
  const ms = Units.measuresFor(food({ name: 'Apfel' }));
  const base = find(ms, 'base'), piece = find(ms, 'piece');
  eq(Units.convert(60, base, piece), 0.5, 'weniger als ein halber bleibt ein halber');
  eq(Units.convert(250, base, piece), 1.5, '250 g sind anderthalb');
});

test('Plus und Minus zählen in Stücken, nicht in Gramm', () => {
  const ms = Units.measuresFor(food({ name: 'Apfel' }));
  const base = find(ms, 'base'), piece = find(ms, 'piece');
  eq(Units.nudge(1, piece, 1), 2, '1 → 2 Äpfel');
  eq(Units.nudge(2, piece, -1), 1, '2 → 1 Apfel');
  eq(Units.nudge(1, piece, -1), 0.5, 'unter einem Stück in halben');
  eq(Units.nudge(0.5, piece, -1), 0.5, 'weiter runter geht es nicht');
  eq(Units.nudge(100, base, 1), 110, 'Gramm in Zehnern');
  eq(Units.nudge(10, base, -1), 5, 'kleine Mengen in Fünfern');
});

test('Minus landet nie im Nichts', () => {
  const ms = Units.measuresFor(food({ name: 'Apfel' }));
  const base = find(ms, 'base');
  ok(Units.nudge(1, base, -1) > 0, 'Gramm bleiben über null');
  ok(Units.nudge(0, base, -1) > 0, 'auch von null aus');
});

test('Der Name im Text folgt der Anzahl', () => {
  const ms = Units.measuresFor(food({ name: 'Apfel' }));
  const piece = find(ms, 'piece');
  eq(Units.label(piece, 1), 'Apfel', 'einer');
  eq(Units.label(piece, 2), 'Äpfel', 'zwei');
  eq(Units.label(piece, 0.5), 'Äpfel', 'ein halber ist auch nicht „ein Apfel“');
});

/* =========================================================
   5. Dass die Rechnung am Ende stimmt
   ========================================================= */

test('Zwei Äpfel sind doppelt so viele Kalorien wie einer', () => {
  const f = food({ name: 'Apfel', per100: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 } });
  const piece = find(Units.measuresFor(f), 'piece');
  const kcal = qty => (qty * piece.base / 100) * f.per100.kcal;
  near(kcal(1), 94.64, 'ein Apfel');
  near(kcal(2), 189.28, 'zwei Äpfel');
});

test('Kein Maß hat ein Gewicht von null', () => {
  const names = ['Apfel', 'Ei', 'Olivenöl', 'Orangensaft', 'Kekse', 'Mandeln', 'Vollkornbrot'];
  names.forEach(n => {
    ['g', 'ml'].forEach(u => {
      Units.measuresFor(food({ name: n, unit: u })).forEach(m => {
        ok(m.base > 0, `${n} (${u}): ${m.id} wiegt ${m.base}`);
        ok(m.label && m.plural, `${n} (${u}): ${m.id} ohne Namen`);
      });
    });
  });
});

test('Kein Maß kommt doppelt vor', () => {
  const ms = Units.measuresFor(food({
    name: 'Kekse', servingText: '2 Kekse (25 g)', servingGrams: 25,
    portions: [{ label: 'Portion (25 g)', grams: 25 }, { label: 'Packung (300 g)', grams: 300 }]
  }));
  eq(ids(ms).length, new Set(ids(ms)).size, 'doppelte Kennung');
});

/* ---------- Ergebnis ---------- */

console.log('');
failures.forEach(f => console.log('  ✗ ' + f + '\n'));
console.log(`${passed}/${passed + failed} Prüfungen bestanden`);
process.exit(failed ? 1 : 0);
