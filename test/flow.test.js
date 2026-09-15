/* =========================================================
   flow.test.js — der Weg vom Lebensmittel zur Buchung

   Läuft ohne alles: node test/flow.test.js

   Hier läuft die echte app.js gegen ein nachgebautes Dokument
   (test/dom.js) auf der echten index.html. Geprüft wird das,
   was sich mit Einheitenwahl und Schrittknöpfen ändert: dass
   ein Apfel als Apfel voreingestellt ist, dass zwei Äpfel
   doppelt zählen, dass die Buchungszeile das Stück nennt und
   dass ein alter Eintrag ohne Maß weiter stimmt.
   ========================================================= */

const path = require('path');
const fs = require('fs');

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

/* ---------- Die App hochfahren ---------- */

const root = path.join(__dirname, '..');
const dom = require(path.join(__dirname, 'dom.js'));
dom.install(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));

// Der Scanner braucht Kamera und WebAssembly — beides gibt es hier
// nicht, und für den Weg zur Buchung ist er auch nicht nötig.
global.Scanner = {
  warmup() {}, start: async () => {}, stop() {}, torch: async () => false,
  hasTorch: false, torchOn: false
};

function load(file) {
  const src = fs.readFileSync(path.join(root, 'js', file), 'utf8');
  // Die Dateien sind Skripte, keine Module: sie legen ihre Namen
  // global ab. Genau so lädt der Browser sie auch.
  (0, eval)(src + `\n;if (typeof Store !== 'undefined') global.Store = Store;` +
    `\nif (typeof I18n !== 'undefined') global.I18n = I18n;` +
    `\nif (typeof Rank !== 'undefined') global.Rank = Rank;` +
    `\nif (typeof Units !== 'undefined') global.Units = Units;` +
    `\nif (typeof OFF !== 'undefined') global.OFF = OFF;`);
}

['store.js', 'i18n.js', 'search.js', 'units.js', 'off.js'].forEach(load);

const appLoaded = (() => {
  try { load('app.js'); return null; }
  catch (e) { return e; }
})();

const $ = sel => document.querySelector(sel);
const text = sel => ($(sel) ? $(sel).textContent : null);

/* ---------- Hilfen ---------- */

const APPLE = {
  name: 'Apfel', brand: '', barcode: null, unit: 'g',
  per100: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 }, portions: []
};

function pickResult(food) {
  // Die Trefferliste hängt am Netz; der Weg dahinter nicht. Die Karte
  // wird deshalb direkt gebaut und angeklickt, so wie die Suche es täte.
  const box = $('#results');
  box.innerHTML = '<button class="res" data-i="0"></button>';
  box._items = [food];
  return box;
}

function today() { return Store.dayKey(); }

function clearDay() {
  Store.entries(today()).slice().forEach(e => Store.removeEntry(today(), e.id));
  render();
}

/* Die Buchungsliste wird beim Wechsel auf "Heute" neu gezeichnet —
   dasselbe, was ein Tippen auf den Reiter auslöst. */
function render() {
  document.querySelector('.tab[data-view="today"]').dispatch('click');
}

/* =========================================================
   1. Überhaupt erst einmal starten
   ========================================================= */

test('app.js läuft ohne Fehler durch', () => {
  if (appLoaded) throw new Error(appLoaded.stack || String(appLoaded));
});

test('Die Oberfläche steht', () => {
  ok($('#qty-measure'), 'das Auswahlfeld für die Einheit fehlt');
  ok($('#qty-minus') && $('#qty-plus'), 'die Schrittknöpfe fehlen');
  ok($('#qty-base'), 'die Zeile mit dem Gewicht fehlt');
  ok($('#n-unit-seg'), 'die Umschaltung g/ml fehlt');
  ok($('#n-piece'), 'das Feld für den Namen des Stücks fehlt');
});

/* =========================================================
   2. Ein Apfel wird als Apfel eingetragen
   ========================================================= */

test('Ein Apfel ist mit einem Stück voreingestellt', () => {
  clearDay();
  $('#log').dispatch('click', { target: $('#log') });   // kein Treffer: nichts passiert
  const box = pickResult(APPLE);
  box.dispatch('click', { target: box.querySelector('.res') });

  ok(!$('#sheet-qty').hidden, 'die Mengenauswahl ist zu');
  eq($('#qty-amount').value, '1', 'die Menge steht auf 1');
  const sel = $('#qty-measure');
  ok(/Apfel/.test(sel.innerHTML), `im Auswahlfeld steht kein Apfel: ${sel.innerHTML}`);
  ok(/182/.test(sel.innerHTML), 'das angenommene Gewicht steht nicht dabei');
  ok(/182/.test(text('#qty-base')), `die Gewichtszeile fehlt: ${text('#qty-base')}`);
});

test('Plus macht aus einem Apfel zwei', () => {
  $('#qty-plus').dispatch('click');
  eq($('#qty-amount').value, '2', 'zwei Äpfel');
  ok(/364/.test(text('#qty-base')), `364 g erwartet, ist: ${text('#qty-base')}`);
});

test('Minus geht wieder zurück und dann in halbe', () => {
  $('#qty-minus').dispatch('click');
  eq($('#qty-amount').value, '1', 'ein Apfel');
  $('#qty-minus').dispatch('click');
  eq($('#qty-amount').value, '0,5', 'ein halber Apfel');
  $('#qty-plus').dispatch('click');
  eq($('#qty-amount').value, '1', 'und wieder ein ganzer');
});

test('Zwei Äpfel landen als 364 g im Tag', () => {
  $('#qty-plus').dispatch('click');          // 2 Äpfel
  $('#qty-confirm').dispatch('click');

  const list = Store.entries(today());
  eq(list.length, 1, 'eine Buchung');
  const e = list[0];
  near(e.grams, 364, 'Gewicht');
  eq(e.qty, 2, 'Menge');
  eq(e.measure.id, 'piece', 'Maß');
  eq(e.measure.plural, 'Äpfel', 'Mehrzahl');
  near(Store.entryTotals(e).kcal, 189.28, 'Kalorien');
});

test('Die Buchungszeile nennt das Stück und das Gewicht', () => {
  const sub = $('#log').querySelector('.log-sub');
  ok(sub, 'keine Buchungszeile');
  ok(/2 Äpfel/.test(sub.textContent), `„2 Äpfel“ erwartet, ist: ${sub.textContent}`);
  ok(/364 g/.test(sub.textContent), `„364 g“ erwartet, ist: ${sub.textContent}`);
});

/* =========================================================
   3. Wieder aufmachen, ändern, löschen
   ========================================================= */

test('Beim Ändern stehen wieder zwei Äpfel da, nicht 364 g', () => {
  const row = $('#log').querySelector('.log-row');
  $('#log').dispatch('click', { target: row });
  ok(!$('#sheet-qty').hidden, 'die Mengenauswahl ist zu');
  eq($('#qty-amount').value, '2', 'zwei');
  const sel = $('#qty-measure');
  ok(/selected/.test(sel.innerHTML.split('\n').find(l => /Apfel ·/.test(l)) || sel.innerHTML),
    'der Apfel ist nicht vorausgewählt');
});

test('Auf Gramm umstellen behält die Menge', () => {
  const sel = $('#qty-measure');
  sel.value = 'base';
  sel.dispatch('change');
  eq($('#qty-amount').value, '364', '364 g statt 2 Äpfel');
  eq(text('#qty-base'), '', 'bei Gramm braucht es keine Umrechnungszeile');
});

test('Geändert wird, was drinsteht', () => {
  $('#qty-amount').value = '200';
  $('#qty-confirm').dispatch('click');
  const e = Store.entries(today())[0];
  near(e.grams, 200, 'Gewicht');
  eq(e.measure.id, 'base', 'jetzt in Gramm');
  const sub = $('#log').querySelector('.log-sub');
  ok(!/Äpfel/.test(sub.textContent), `in Gramm gebucht bleibt es kurz: ${sub.textContent}`);
});

test('Gelöscht ist gelöscht', () => {
  const row = $('#log').querySelector('.log-row');
  $('#log').dispatch('click', { target: row });
  $('#qty-delete').dispatch('click');
  eq(Store.entries(today()).length, 0, 'nichts mehr da');
});

/* =========================================================
   4. Das zweite Mal geht schneller
   ========================================================= */

test('Was zuletzt in Stück gebucht war, kommt in Stück zurück', () => {
  clearDay();
  let box = pickResult(APPLE);
  box.dispatch('click', { target: box.querySelector('.res') });
  $('#qty-plus').dispatch('click');            // 2 Äpfel
  $('#qty-confirm').dispatch('click');

  // Noch einmal dasselbe Lebensmittel, diesmal aus "zuletzt eingetragen"
  const e = Store.entries(today())[0];
  const again = {
    name: e.name, brand: e.brand, barcode: e.barcode, unit: e.unit,
    per100: e.per100, portions: e.portions,
    lastGrams: e.grams, lastQty: e.qty, lastMeasure: e.measure, source: 'log'
  };
  box = pickResult(again);
  box.dispatch('click', { target: box.querySelector('.res') });
  eq($('#qty-amount').value, '2', 'wieder zwei');
  ok(/Apfel/.test($('#qty-measure').innerHTML), 'wieder in Äpfeln');
  $('#sheet-qty').hidden = true;
  clearDay();
});

/* =========================================================
   5. Was vorher gebucht wurde, bleibt richtig
   ========================================================= */

test('Ein alter Eintrag ohne Maß rechnet und zeigt sich weiter', () => {
  clearDay();
  Store.addEntry(today(), {
    name: 'Skyr', brand: 'Arla', barcode: '123', grams: 150, unit: 'g',
    per100: { kcal: 63, protein: 11, carbs: 4, fat: 0.2 }, portions: []
  });
  const e = Store.entries(today())[0];
  near(Store.entryTotals(e).kcal, 94.5, 'Kalorien');

  render();
  const row = $('#log').querySelector('.log-row');
  ok(row, 'keine Buchungszeile');
  const sub = $('#log').querySelector('.log-sub');
  ok(/150 g/.test(sub.textContent), `„150 g“ erwartet, ist: ${sub.textContent}`);

  // und er lässt sich ohne Murren wieder öffnen
  $('#log').dispatch('click', { target: row });
  eq($('#qty-amount').value, '150', 'die alte Menge steht da');
  $('#sheet-qty').hidden = true;
  clearDay();
});

/* =========================================================
   6. Getränke in Millilitern
   ========================================================= */

test('Ein Getränk zählt in ml und kennt das Glas', () => {
  clearDay();
  const box = pickResult({
    name: 'Orangensaft', brand: '', barcode: null, unit: 'ml',
    per100: { kcal: 45, protein: 0.7, carbs: 10, fat: 0.2 }, portions: []
  });
  box.dispatch('click', { target: box.querySelector('.res') });
  const sel = $('#qty-measure');
  ok(/ml/.test(sel.innerHTML), `ml fehlt: ${sel.innerHTML}`);
  ok(/Glas/.test(sel.innerHTML), `Glas fehlt: ${sel.innerHTML}`);
  $('#qty-confirm').dispatch('click');
  const e = Store.entries(today())[0];
  eq(e.unit, 'ml', 'in Millilitern gebucht');
  near(e.grams, 200, 'ein Glas sind 200 ml');
  clearDay();
});

/* =========================================================
   7. Selbst angelegt: eigenes Stück, eigene Grundeinheit
   ========================================================= */

test('Ein selbst angelegtes Stück wird zum Maß', () => {
  clearDay();
  $('#act-manual').dispatch('click');
  ok(!$('#sheet-new').hidden, 'das Formular ist zu');

  $('#n-name').value = 'Proteinriegel Eigenbau';
  $('#n-kcal').value = '380';
  $('#n-protein').value = '30';
  $('#n-carbs').value = '30';
  $('#n-fat').value = '12';
  $('#n-portion').value = '60';
  $('#n-piece').value = 'Riegel';
  $('#n-save').dispatch('click');

  ok(!$('#sheet-qty').hidden, 'es geht nicht zur Menge weiter');
  eq($('#qty-amount').value, '1', 'ein Riegel');
  ok(/Riegel/.test($('#qty-measure').innerHTML), `„Riegel“ fehlt: ${$('#qty-measure').innerHTML}`);
  ok(/60/.test(text('#qty-base')), `60 g erwartet, ist: ${text('#qty-base')}`);

  $('#qty-plus').dispatch('click');
  $('#qty-confirm').dispatch('click');
  const e = Store.entries(today())[0];
  near(e.grams, 120, 'zwei Riegel sind 120 g');
  eq(e.measure.label, 'Riegel', 'Maß');
  near(Store.entryTotals(e).kcal, 456, 'Kalorien');
  clearDay();
});

test('Auf ml umgestellt wird in ml gebucht', () => {
  clearDay();
  $('#act-manual').dispatch('click');
  const ml = $('#n-unit-seg').querySelectorAll('.seg-btn').find(b => b.dataset.unit === 'ml');
  $('#n-unit-seg').dispatch('click', { target: ml });
  ok(ml.classList.contains('is-on'), 'ml ist nicht ausgewählt');
  ok(/ml/.test($('#n-portion-unit').textContent), `die Einheit am Feld folgt nicht: ${$('#n-portion-unit').textContent}`);

  $('#n-name').value = 'Selbstgemachte Limo';
  $('#n-kcal').value = '30';
  $('#n-save').dispatch('click');

  ok(/ml/.test($('#qty-measure').innerHTML), `ml fehlt: ${$('#qty-measure').innerHTML}`);
  $('#qty-confirm').dispatch('click');
  const e = Store.entries(today())[0];
  eq(e.unit, 'ml', 'in Millilitern gebucht');
  clearDay();
});

/* ---------- Ergebnis ---------- */

console.log('');
failures.forEach(f => console.log('  ✗ ' + f + '\n'));
console.log(`${passed}/${passed + failed} Prüfungen bestanden`);
process.exit(failed ? 1 : 0);
