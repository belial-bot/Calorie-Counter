/* =========================================================
   search.test.js — die Suche auf den Zahn gefühlt

   Läuft ohne alles: node test/search.test.js

   Geprüft wird, was sich ohne Netz prüfen lässt:
   die Wertung (search.js), das Einlesen der Antworten und
   das Bauen der Abfragen (off.js).
   ========================================================= */

const path = require('path');
const { FOODS, RAW_SEARCH_HITS, RAW_LEGACY_PRODUCTS } = require('./fixtures.js');

/* ---------- ein sehr kleines Testgerüst ---------- */

let passed = 0, failed = 0, current = '';
const failures = [];

function test(name, fn) {
  current = name;
  try { fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}\n    ${e.message}`); }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'erwartet: wahr');
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || ''}\n    ist:  ${a}\n    soll: ${b}`);
}

/* ---------- Umgebung für die Module ---------- */

global.Rank = require(path.join(__dirname, '..', 'js', 'search.js'));

let lang = 'de';
global.I18n = {
  get lang() { return lang; },
  t: (key, vars) => {
    const s = { 'off.portion': 'Portion ({label})', 'off.pack': 'Packung ({g} g)' }[key] || key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)) : s;
  }
};

let region = 'de';
const searchCache = {};
global.Store = {
  region: () => region,
  cachedProduct: () => null,
  cacheProduct: () => {},
  cachedSearch: key => searchCache[key] || null,
  cacheSearch: (key, list) => { searchCache[key] = list; }
};

const OFF = require(path.join(__dirname, '..', 'js', 'off.js'));
const Rank = global.Rank;

/* ---------- Hilfen ---------- */

/* So ruft app.js die Wertung auf: eigene Treffer plus Fundstücke,
   alles unter 0 fliegt raus. */
function ranked(query, items = FOODS) {
  return Rank.rank(items, query, { min: 0 }).map(x => x.name);
}

function pos(list, name) {
  const i = list.indexOf(name);
  return i < 0 ? Infinity : i;
}

/* "a steht vor b" */
function before(list, a, b, query) {
  const ia = pos(list, a), ib = pos(list, b);
  ok(ia < ib, `bei "${query}": "${a}" (Platz ${ia}) sollte vor "${b}" (Platz ${ib}) stehen\n    Reihenfolge: ${list.slice(0, 8).join(' | ')}`);
}

function found(list, name, query) {
  ok(pos(list, name) !== Infinity,
    `bei "${query}": "${name}" fehlt in den Treffern\n    gefunden: ${list.slice(0, 8).join(' | ') || '(nichts)'}`);
}

function top(list, name, query) {
  eq(list[0], name, `bei "${query}" sollte "${name}" ganz oben stehen\n    Reihenfolge: ${list.slice(0, 6).join(' | ')}`);
}

/* =========================================================
   1. Grundlagen: was getippt wird, muss gefunden werden
   ========================================================= */

test('Apfel findet den Apfel und nicht den Kuchen', () => {
  const r = ranked('Apfel');
  top(r, 'Apfel', 'Apfel');
  before(r, 'Apfel', 'Apfelsaft', 'Apfel');
  before(r, 'Apfel', 'Apfelkuchen', 'Apfel');
  before(r, 'Apfel', 'Veganer Apfelkuchen mit Zimt', 'Apfel');
});

test('Eier findet die Eier und nicht den Eiersalat', () => {
  const r = ranked('Eier');
  top(r, 'Eier', 'Eier');
  before(r, 'Eier', 'Eiernudeln', 'Eier');
  before(r, 'Eier', 'Eiersalat', 'Eier');
});

test('Milch findet Milch, nicht Milchschnitte', () => {
  const r = ranked('Milch');
  found(r, 'Milch 3,5%', 'Milch');
  before(r, 'Milch 3,5%', 'Milchschnitte', 'Milch');
});

test('Vollmilch findet die Vollmilch', () => {
  const r = ranked('Vollmilch');
  found(r, 'Vollmilch 3,5 %', 'Vollmilch');
});

test('Orange schlägt Fanta Orange', () => {
  const r = ranked('Orange');
  before(r, 'Orange', 'Fanta Orange', 'Orange');
  before(r, 'Orange', 'Orangensaft', 'Orange');
});

test('Unpassendes fliegt raus', () => {
  const r = ranked('Apfel');
  ok(pos(r, 'Schokolade Vollmilch') === Infinity, 'Schokolade hat mit Apfel nichts zu tun');
  ok(pos(r, 'Butter') === Infinity, 'Butter hat mit Apfel nichts zu tun');
});

/* =========================================================
   2. Umlaute — ohne die geht im Deutschen nichts
   ========================================================= */

test('Müsli mit Umlaut findet Müsli', () => {
  const r = ranked('Müsli');
  found(r, 'Müsli Frucht', 'Müsli');
  found(r, 'Fruchtmüsli', 'Müsli');
});

test('Musli ohne Umlaut findet Müsli genauso', () => {
  const r = ranked('Musli');
  found(r, 'Müsli Frucht', 'Musli');
  found(r, 'Fruchtmüsli', 'Musli');
});

test('Apfel findet auch Äpfel', () => {
  found(ranked('Apfel'), 'Äpfel', 'Apfel');
});

test('Weissbrot mit ss findet Weißbrot', () => {
  found(ranked('Weissbrot'), 'Weißbrot', 'Weissbrot');
});

test('Olivenöl findet das Olivenöl', () => {
  found(ranked('Olivenöl'), 'Olivenöl nativ extra', 'Olivenöl');
  found(ranked('Olivenol'), 'Olivenöl nativ extra', 'Olivenol');
});

/* =========================================================
   3. Zusammensetzungen — das deutsche Kernproblem
   ========================================================= */

test('Hähnchenbrustfilet am Stück findet den getrennt geschriebenen Namen', () => {
  const r = ranked('Hähnchenbrustfilet');
  found(r, 'Hähnchenbrust Filet', 'Hähnchenbrustfilet');
  found(r, 'Hähnchenbrustfilet natur', 'Hähnchenbrustfilet');
});

test('Haferflocken am Stück findet Hafer Flocken', () => {
  const r = ranked('Haferflocken');
  found(r, 'Haferflocken zart', 'Haferflocken');
  found(r, 'Hafer Flocken kernig', 'Haferflocken');
});

test('Hähnchenbrust findet das Filet', () => {
  const r = ranked('Hähnchenbrust');
  found(r, 'Hähnchenbrust Filet', 'Hähnchenbrust');
  found(r, 'Hähnchenbrustfilet natur', 'Hähnchenbrust');
});

test('Getrennt getippt findet zusammengeschrieben', () => {
  const r = ranked('Hafer Flocken');
  found(r, 'Haferflocken zart', 'Hafer Flocken');
  found(r, 'Hafer Flocken kernig', 'Hafer Flocken');
});

test('Fruchtmüsli findet beide Schreibweisen', () => {
  const r = ranked('Fruchtmüsli');
  found(r, 'Fruchtmüsli', 'Fruchtmüsli');
  found(r, 'Müsli Frucht', 'Fruchtmüsli');
});

test('Vollkornbrot findet das Vollkornbrot', () => {
  found(ranked('Vollkornbrot'), 'Vollkornbrot', 'Vollkornbrot');
});

/* =========================================================
   4. Ein- und Mehrzahl
   ========================================================= */

test('Tomaten findet die Tomate', () => {
  const r = ranked('Tomaten');
  found(r, 'Tomate', 'Tomaten');
  found(r, 'Tomaten geschält', 'Tomaten');
});

test('Nuss findet Nüsse', () => {
  found(ranked('Nüsse'), 'Nüsse gemischt', 'Nüsse');
  found(ranked('Nuss'), 'Nüsse gemischt', 'Nuss');
});

test('Brötchen bleibt Brötchen', () => {
  found(ranked('Brötchen'), 'Brötchen', 'Brötchen');
});

/* =========================================================
   5. Marken — "milsani skyr"
   ========================================================= */

test('Marke und Sorte zusammen: milsani skyr', () => {
  const r = ranked('milsani skyr');
  top(r, 'Skyr', 'milsani skyr');
  before(r, 'Skyr', 'Skyr Natur', 'milsani skyr');
  before(r, 'Skyr', 'Skyr Vanille', 'milsani skyr');
});

test('Marke allein findet die Produkte der Marke', () => {
  const r = ranked('Milsani');
  found(r, 'Skyr', 'Milsani');
  found(r, 'Butter', 'Milsani');
  found(r, 'Milch 3,5%', 'Milsani');
});

test('Sorte und Marke in anderer Reihenfolge: skyr milsani', () => {
  const r = ranked('skyr milsani');
  top(r, 'Skyr', 'skyr milsani');
});

test('Marke mit Ausrufezeichen: ja milch', () => {
  const r = ranked('ja milch');
  found(r, 'Haltbare fettarme Milch 1,5%', 'ja milch');
});

test('Milbona Skyr findet den Milbona-Skyr, nicht den von Milsani', () => {
  const r = ranked('milbona skyr');
  top(r, 'Skyr Natur', 'milbona skyr');
});

test('Marke plus Zusammensetzung: knusperone schokomüsli', () => {
  const r = ranked('knusperone schokomüsli');
  top(r, 'Schokomüsli', 'knusperone schokomüsli');
});

/* =========================================================
   6. Vertipper
   ========================================================= */

test('Jogurt findet Joghurt', () => {
  found(ranked('Jogurt'), 'Joghurt mild', 'Jogurt');
});

test('Haferfloken findet Haferflocken', () => {
  found(ranked('Haferfloken'), 'Haferflocken zart', 'Haferfloken');
});

test('Bannane findet Banane', () => {
  found(ranked('Bannane'), 'Banane', 'Bannane');
});

/* =========================================================
   7. Eigenes und zuletzt Gegessenes steht vorn
   ========================================================= */

test('Eigenes Lebensmittel schlägt den Fremdtreffer', () => {
  const mine = Object.assign({}, FOODS.find(x => x.name === 'Skyr Vanille'), { source: 'mine' });
  const list = FOODS.filter(x => x.name !== 'Skyr Vanille').concat([mine]);
  const r = Rank.rank(list, 'skyr vanille', { min: 0 }).map(x => x.name);
  top(r, 'Skyr Vanille', 'skyr vanille (eigenes)');
});

test('Ein schwacher eigener Treffer überholt den genauen nicht', () => {
  const mine = Object.assign({}, FOODS.find(x => x.name === 'Apfelkuchen'), { source: 'mine' });
  const list = FOODS.filter(x => x.name !== 'Apfelkuchen').concat([mine]);
  const r = Rank.rank(list, 'apfel', { min: 0 }).map(x => x.name);
  top(r, 'Apfel', 'apfel (mit eigenem Apfelkuchen)');
});

/* =========================================================
   8. Grundnahrung vor Verarbeitetem
   ========================================================= */

test('Bei Milch steht Trinkmilch vor Schokolade', () => {
  const r = ranked('Vollmilch');
  before(r, 'Vollmilch 3,5 %', 'Schokolade Vollmilch', 'Vollmilch');
});

test('Mengenangaben im Namen stören nicht', () => {
  const r = ranked('Milch 3,5');
  found(r, 'Milch 3,5%', 'Milch 3,5');
  before(r, 'Milch 3,5%', 'Milchschnitte', 'Milch 3,5');
});

/* =========================================================
   9. Antworten einlesen — beide Formate von Open Food Facts
   ========================================================= */

test('Neue Suche: Name als Objekt wird gelesen', () => {
  const p = OFF.normalise(RAW_SEARCH_HITS[0], 'de');
  ok(p, 'Der Treffer darf nicht verloren gehen');
  eq(p.name, 'Skyr', 'Name aus dem mehrsprachigen Feld');
  eq(p.brand, 'Milsani', 'Marke aus der Liste');
  eq(p.per100.kcal, 63, 'Kalorien');
  eq(p.local, true, 'in Deutschland zu kaufen');
});

test('Neue Suche: kein Treffer geht verloren', () => {
  const list = OFF.normaliseAll(RAW_SEARCH_HITS, 'de');
  const names = list.map(x => x.name);
  // Nur der Eintrag ohne Nährwerte darf fehlen.
  eq(list.length, RAW_SEARCH_HITS.length - 1, `eingelesen: ${names.join(' | ')}`);
  ok(names.includes('Vollmilch 3,5 %'), 'Vollmilch fehlt');
  ok(names.includes('Haferflocken zart'), 'Haferflocken fehlen');
  ok(names.includes('Butter'), 'Butter fehlt');
});

test('Neue Suche: nur englischer Name ist besser als gar keiner', () => {
  const p = OFF.normalise(RAW_SEARCH_HITS[2], 'de');
  ok(p, 'Der Treffer darf nicht verloren gehen');
  eq(p.name, 'Rolled Oats', 'Rückfall auf den vorhandenen Namen');
});

test('Neue Suche: Marke notfalls aus brands_tags', () => {
  const p = OFF.normalise(RAW_SEARCH_HITS[3], 'de');
  ok(p, 'Der Treffer darf nicht verloren gehen');
  ok(p.brand && p.brand.toLowerCase().startsWith('goldahren'), `Marke aus brands_tags, ist: "${p.brand}"`);
});

test('Ohne Nährwerte kein Treffer', () => {
  eq(OFF.normalise(RAW_SEARCH_HITS[4], 'de'), null, 'Eintrag ohne Werte fliegt raus');
});

test('Kilojoule werden zu Kilokalorien', () => {
  const p = OFF.normalise(RAW_SEARCH_HITS[5], 'de');
  ok(p && Math.abs(p.per100.kcal - 741) < 2, `3100 kJ sind rund 741 kcal, sind: ${p && p.per100.kcal}`);
});

test('Alte Suche: flache Felder werden weiter gelesen', () => {
  const list = OFF.normaliseAll(RAW_LEGACY_PRODUCTS, 'de');
  eq(list.length, 2, 'beide Einträge');
  eq(list[0].name, 'Skyr', 'Name');
  eq(list[0].brand, 'Milsani', 'erste Marke aus der Komma-Liste');
  eq(list[1].name, 'Hähnchenbrustfilet natur', 'Name mit Umlaut');
});

test('Portionen werden übernommen', () => {
  const p = OFF.normalise(RAW_SEARCH_HITS[0], 'de');
  ok(p.portions.length >= 1, 'mindestens die Portion');
  ok(p.portions.some(x => x.grams === 150), 'Portion mit 150 g');
});

/* =========================================================
   10. Die Abfrage an Open Food Facts
   ========================================================= */

test('Umlaute gehen so raus, wie sie getippt wurden', () => {
  const q = OFF.buildQuery('Müsli', { region: 'de', strict: false });
  ok(/müsli/i.test(q), `Der Volltext braucht den Umlaut, ist: ${q}`);
});

test('Die Region steht in der Abfrage', () => {
  const q = OFF.buildQuery('Apfel', { region: 'de', strict: false });
  ok(q.includes('countries_tags:"en:germany"'), `Regionsfilter fehlt, ist: ${q}`);
});

test('Weltweit heißt ohne Länderfilter', () => {
  const q = OFF.buildQuery('Apfel', { region: 'de', strict: false, everywhere: true });
  ok(!q.includes('countries_tags'), `Kein Länderfilter erwartet, ist: ${q}`);
});

test('Der harte Filter fragt Name und Marke ab', () => {
  const q = OFF.buildQuery('skyr', { region: 'de', strict: true });
  ok(q.includes('product_name'), `Name fehlt, ist: ${q}`);
  ok(q.includes('brands'), `Marke fehlt, ist: ${q}`);
});

test('Platzhalter bleiben ohne Umlaut, weil der Index sie so ablegt', () => {
  const q = OFF.buildQuery('Müsli', { region: 'de', strict: true });
  ok(q.includes('*musli*'), `Platzhalter ohne Umlaut erwartet, ist: ${q}`);
});

test('Kurze Wörter öffnen nur nach hinten', () => {
  const q = OFF.buildQuery('ja', { region: 'de', strict: true });
  ok(!q.includes('*ja*'), `"ja" darf nicht beidseitig geöffnet werden, ist: ${q}`);
});

test('Leere Eingabe ergibt keine Abfrage', () => {
  eq(OFF.buildQuery('', { region: 'de', strict: true }), null, 'nichts zu suchen');
});

/* =========================================================
   11. Wann muss weiter gesucht werden?
   ========================================================= */

test('Ein guter Treffer reicht', () => {
  const hits = OFF.normaliseAll(RAW_SEARCH_HITS, 'de');
  ok(!Rank.needsMore(hits, 'skyr'), 'Skyr steht drin, das genügt');
});

test('Viele schlechte Treffer sind nicht genug', () => {
  const junk = [];
  for (let i = 0; i < 40; i++) junk.push(FOODS.find(x => x.name === 'Apfelkuchen'));
  ok(Rank.needsMore(junk, 'apfel'), 'Nur Kuchen: da muss weiter gesucht werden');
});

test('Gar nichts heißt auf jeden Fall weiter', () => {
  ok(Rank.needsMore([], 'apfel'), 'Leer ist nie genug');
});

/* =========================================================
   12. Der ganze Ablauf — mit nachgemachtem Netz

   Hier hängt kein echtes Open Food Facts dran. Geprüft wird,
   was die App aus den Antworten macht: wann sie sich mit dem
   Gefundenen zufriedengibt, wann sie noch einmal weiter
   greift, und was passiert, wenn der Dienst schweigt.
   ========================================================= */

/* Baut einen Rohtreffer im Format der neuen Suche */
function hit(name, brand, kcal, extra = {}) {
  return {
    code: extra.code || String(Math.random()).slice(2, 12),
    product_name: { main: name, de: name },
    brands: brand,
    nutriments: { 'energy-kcal_100g': kcal, 'proteins_100g': 1, 'carbohydrates_100g': 1, 'fat_100g': 1 },
    unique_scans_n: extra.scans || 10,
    countries_tags: ['en:germany'],
    categories_tags: extra.cats || []
  };
}

let calls = [];

/* handler(url, nr) liefert die Antwort — oder 'tot' für eine Absage */
function mockNet(handler) {
  calls = [];
  global.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    calls.push(u);
    const out = handler(u, calls.length);
    // Eine Zeitüberschreitung bricht die Wiederholungen sofort ab,
    // sonst wartet der Test die Bedenkzeiten mit aus.
    if (out === 'tot') throw new Error('TIMEOUT');
    return { ok: true, json: async () => out };
  };
}

function resetCache() {
  Object.keys(searchCache).forEach(k => delete searchCache[k]);
}

const isLegacy = u => u.includes('cgi/search.pl');
/* Achtung: "countries_tags" steht auch in der Feldliste jeder Abfrage.
   Gemeint ist hier der Filter, und der hat einen Wert hinter sich. */
const hasRegion = u => /countries_tags[:=]"?en:/.test(u) || u.includes('tag_0=germany');

/* Die Tests hier sind asynchron; sie werden gesammelt und am
   Ende der Reihe nach abgearbeitet. */
const asyncTests = [];
function atest(name, fn) { asyncTests.push([name, fn]); }

atest('Eine volle Liste mit gutem Treffer genügt — eine Anfrage, fertig', async () => {
  resetCache();
  const good = [hit('Skyr', 'Milsani', 63, { cats: ['en:dairies', 'en:plain-yogurts'], scans: 500 })];
  for (let i = 0; i < 11; i++) good.push(hit('Skyr Sorte ' + i, 'Arla', 70, { cats: ['en:dairies'] }));
  mockNet(() => ({ hits: good }));
  const list = await OFF.search('skyr');
  eq(calls.length, 1, `es sollte bei einer Anfrage bleiben, waren: ${calls.length}`);
  ok(list.some(x => x.name === 'Skyr'), 'Skyr sollte dabei sein');
});

atest('Eine dünne Liste wird weiter aufgefüllt', async () => {
  resetCache();
  mockNet((u, n) => (n === 1
    ? { hits: [hit('Skyr', 'Milsani', 63, { cats: ['en:dairies'] })] }
    : { hits: [hit('Skyr Natur', 'Milbona', 62, { cats: ['en:dairies'] })] }));
  const list = await OFF.search('skyr');
  ok(calls.length > 1, 'Ein einziger Treffer ist noch keine Auswahl');
  ok(list.some(x => x.name === 'Skyr Natur'), 'Die zweite Runde bringt Alternativen');
});

atest('Lauter Beifang: es wird weiter gesucht, bis der Apfel da ist', async () => {
  resetCache();
  const junk = [];
  for (let i = 0; i < 50; i++) {
    junk.push(hit('Apfelkuchen Sorte ' + i, 'Bäckerei', 250, { cats: ['en:desserts', 'en:biscuits-and-cakes'] }));
  }
  mockNet((u, n) => {
    if (n === 1) return { hits: junk };               // voll, aber nutzlos
    return { hits: [hit('Apfel', '', 52, { cats: ['en:fruits'], scans: 900 })] };
  });
  const list = await OFF.search('Apfel');
  ok(calls.length > 1, 'Fünfzig Kuchen sind keine Antwort auf "Apfel" — es muss weitergehen');
  ok(list.some(x => x.name === 'Apfel'), 'Der Apfel sollte am Ende dabei sein');
  // Und die Wertung sortiert ihn dann auch nach vorn.
  const r = Rank.rank(list, 'Apfel', { min: 0 });
  eq(r[0].name, 'Apfel', 'Der Apfel gehört nach oben');
});

atest('Der zweite Anlauf lässt den Länderfilter weg', async () => {
  resetCache();
  mockNet((u, n) => (n === 1 ? { hits: [] } : { hits: [hit('Skyr', 'Milsani', 63)] }));
  await OFF.search('skyr');
  ok(hasRegion(calls[0]), 'Der erste Griff fragt in der Region');
  ok(calls.length > 1 && !hasRegion(calls[1]), 'Der zweite Griff fragt weltweit');
});

atest('Schweigt die neue Suche, springt die alte ein', async () => {
  resetCache();
  mockNet(u => (isLegacy(u) ? { products: RAW_LEGACY_PRODUCTS } : 'tot'));
  const list = await OFF.search('skyr');
  ok(calls.some(isLegacy), 'Die alte Suche muss gefragt werden');
  ok(list.some(x => x.name === 'Skyr'), 'Und sie liefert den Skyr');
});

atest('Dieselbe Suche zweimal geht nur einmal ins Netz', async () => {
  resetCache();
  mockNet(() => ({ hits: [hit('Skyr', 'Milsani', 63, { cats: ['en:dairies'] })] }));
  await OFF.search('skyr');
  const first = calls.length;
  await OFF.search('skyr');
  eq(calls.length, first, 'Der zweite Aufruf kommt aus dem Zwischenspeicher');
});

atest('Zwei Buchstaben lösen noch keine Suche aus', async () => {
  resetCache();
  mockNet(() => ({ hits: [] }));
  const list = await OFF.search('a');
  eq(list, [], 'Ein Buchstabe ergibt nichts');
  eq(calls.length, 0, 'und fragt auch nicht nach');
});

atest('Umlaute stehen roh in der Abfrage', async () => {
  resetCache();
  mockNet(() => ({ hits: [hit('Müsli Frucht', 'Knusperone', 358, { cats: ['en:cereals'] })] }));
  await OFF.search('Müsli');
  ok(/m(ü|%C3%BC)sli/i.test(calls[0]), `Der Volltext braucht den Umlaut, war: ${calls[0]}`);
  ok(calls[0].includes('*musli*'), 'Der Platzhalter bleibt geebnet');
});

atest('Marke und Sorte finden das richtige Produkt', async () => {
  resetCache();
  mockNet(() => ({
    hits: [
      hit('Skyr Vanille', 'Arla', 78, { cats: ['en:dairies'], scans: 900 }),
      hit('Skyr', 'Milsani', 63, { cats: ['en:dairies', 'en:plain-yogurts'], scans: 400 }),
      hit('Skyr Natur', 'Milbona', 62, { cats: ['en:dairies'], scans: 450 })
    ]
  }));
  const list = await OFF.search('milsani skyr');
  const r = Rank.rank(list, 'milsani skyr', { min: 0 });
  eq(r[0].name, 'Skyr', `Der Milsani-Skyr gehört nach oben, war: ${r.map(x => x.name).join(' | ')}`);
  eq(r[0].brand, 'Milsani', 'und zwar der von Milsani');
});

/* =========================================================
   13. Der Durchgang: einmal quer durch den Einkaufskorb

   Eine Liste echter Eingaben mit dem, was oben stehen soll.
   Nicht einzelne Sonderfälle, sondern die Breite — damit eine
   Verbesserung an einer Ecke nicht drei andere umwirft.
   ========================================================= */

/* [Eingabe, was oben stehen soll, was außerdem dabei sein muss] */
const KORB = [
  ['Apfel', 'Apfel', ['Äpfel']],
  ['Äpfel', 'Äpfel', ['Apfel']],
  ['apfelsaft', 'Apfelsaft'],
  ['Apfelmus', 'Apfelmus'],
  ['Banane', 'Banane'],
  ['Bananen', 'Banane'],
  ['Tomate', 'Tomate', ['Tomaten geschält']],
  ['Tomaten', 'Tomate', ['Tomaten geschält']],
  ['Eier', 'Eier'],
  ['Frische Eier', 'Frische Eier aus Bodenhaltung'],
  ['Eiernudeln', 'Eiernudeln'],
  ['Milch', 'Milch 3,5%'],
  ['Vollmilch', 'Vollmilch 3,5 %'],
  ['fettarme milch', 'Haltbare fettarme Milch 1,5%'],
  ['ja milch', 'Haltbare fettarme Milch 1,5%'],
  ['Skyr', 'Skyr'],
  ['milsani skyr', 'Skyr'],
  ['milbona skyr', 'Skyr Natur'],
  ['skyr vanille', 'Skyr Vanille'],
  ['Joghurt', 'Joghurt mild'],
  ['jogurt', 'Joghurt mild'],
  ['Butter', 'Butter'],
  ['Gouda', 'Gouda jung gerieben'],
  ['gouda gerieben', 'Gouda jung gerieben'],
  ['Hähnchenbrust', 'Hähnchenbrust Filet', ['Hähnchenbrustfilet natur']],
  ['Hähnchenbrustfilet', 'Hähnchenbrustfilet natur', ['Hähnchenbrust Filet']],
  ['Hackfleisch', 'Rinderhackfleisch'],
  ['Müsli', 'Müsli Frucht', ['Fruchtmüsli', 'Schokomüsli']],
  ['Fruchtmüsli', 'Fruchtmüsli', ['Müsli Frucht']],
  ['Schokomüsli', 'Schokomüsli'],
  ['knusperone müsli', 'Müsli Frucht', ['Schokomüsli']],
  ['Haferflocken', 'Haferflocken zart', ['Hafer Flocken kernig']],
  ['Hafer Flocken', 'Hafer Flocken kernig', ['Haferflocken zart']],
  ['haferfloken', 'Haferflocken zart'],
  ['Vollkornbrot', 'Vollkornbrot'],
  ['Weißbrot', 'Weißbrot'],
  ['Brötchen', 'Brötchen'],
  ['Nüsse', 'Nüsse gemischt'],
  ['Olivenöl', 'Olivenöl nativ extra'],
  ['Orange', 'Orange'],
  ['Orangensaft', 'Orangensaft'],
  ['Schokolade', 'Schokolade Vollmilch'],
  ['Fanta', 'Fanta Orange'],
  ['Wiesenhof', 'Hähnchenbrustfilet natur'],
  ['Rewe Äpfel', 'Äpfel']
];

let ersterPlatz = 0;
KORB.forEach(([query, want, auch]) => {
  test(`Korb: "${query}" führt zu "${want}"`, () => {
    const r = ranked(query);
    const at = pos(r, want);
    ok(at < 3, `"${want}" steht auf Platz ${at === Infinity ? '—' : at + 1}\n    Reihenfolge: ${r.slice(0, 5).join(' | ') || '(nichts)'}`);
    if (at === 0) ersterPlatz++;
    // Und die andere Schreibweise darf nicht unter den Tisch fallen:
    // wer "Haferflocken" tippt, will auch die "Hafer Flocken" sehen.
    (auch || []).forEach(name => found(r, name, query));
  });
});

test('Der Korb trifft meistens auf Anhieb', () => {
  const quote = Math.round((ersterPlatz / KORB.length) * 100);
  ok(quote >= 85, `nur ${quote} % auf Platz 1 (${ersterPlatz}/${KORB.length})`);
  console.log(`    Korb: ${ersterPlatz}/${KORB.length} sofort auf Platz 1 (${quote} %)`);
});

/* ---------- Ergebnis ---------- */

(async () => {
  for (const [name, fn] of asyncTests) {
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
