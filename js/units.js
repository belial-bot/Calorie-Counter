/* =========================================================
   units.js — Mengen in Stück, Löffeln und Gläsern

   Die App rechnet intern weiter in Gramm (bei Getränken in
   Millilitern). Hier steht nur, wie man von "2 Äpfel" dorthin
   kommt: jedes Maß kennt sein Grundgewicht, der Rest ist eine
   Multiplikation.

   Woher die Gewichte kommen
   -------------------------
   1. Aus der Packung selbst. Open Food Facts liefert zu vielen
      Produkten eine Portion ("serving_size"). Steht dort
      "2 Kekse (25 g)", dann wiegt ein Keks 12,5 g — das ist die
      beste Quelle, weil sie vom Hersteller stammt.
   2. Aus der Tabelle unten, für alles ohne Packung. Ein Apfel hat
      keinen Strichcode und steht in keiner Produktdatenbank. Die
      Gewichte sind die typischen Haushaltsmaße des USDA
      (FoodData Central, "foodPortions": 1 medium apple = 182 g) —
      gemeinfrei und seit Jahrzehnten die Grundlage dafür, was
      andere Zähler unter "1 mittlerer Apfel" verstehen.
   3. Vom Nutzer, wenn er beim Anlegen ein Stückgewicht einträgt.

   Ein Apfel wiegt mal 150 und mal 210 Gramm. Das ist hier kein
   Fehler, sondern der Punkt: wer nicht wiegen will, bekommt eine
   gute Schätzung statt gar keines Eintrags.
   ========================================================= */

const Units = (() => {

  const norm = s => (typeof Rank !== 'undefined' ? Rank.norm(s) : String(s || '')
    .toLowerCase().replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim());

  const T = (key, vars) => (typeof I18n !== 'undefined' ? I18n.t(key, vars) : key);
  const lang = () => (typeof I18n !== 'undefined' && I18n.lang === 'en' ? 'en' : 'de');

  /* ---------- Die Tabelle ----------
     [ Kennung, "Einzahl|Mehrzahl" (de), "Einzahl|Mehrzahl" (en),
       Gramm (mittel), "klein,groß" oder "", zusätzliche Suchwörter ]

     Alle Gewichte sind essbarer Anteil: der Apfel ohne Kerngehäuse,
     das Ei ohne Schale, die Banane ohne Schale. */

  const TABLE = [
    // Obst
    ['apple',     'Apfel|Äpfel',              'apple|apples',              182, '149,223', 'Äpfel'],
    ['banana',    'Banane|Bananen',           'banana|bananas',            118, '101,136', ''],
    ['orange',    'Orange|Orangen',           'orange|oranges',            131, '96,184',  'apfelsine apfelsinen'],
    ['mandarin',  'Mandarine|Mandarinen',     'mandarin|mandarins',         74, '',        'clementine clementinen satsuma'],
    ['pear',      'Birne|Birnen',             'pear|pears',                178, '148,230', ''],
    ['peach',     'Pfirsich|Pfirsiche',       'peach|peaches',             150, '',        ''],
    ['nectarine', 'Nektarine|Nektarinen',     'nectarine|nectarines',      142, '',        ''],
    ['plum',      'Pflaume|Pflaumen',         'plum|plums',                 66, '',        'zwetschge zwetschgen'],
    ['apricot',   'Aprikose|Aprikosen',       'apricot|apricots',           35, '',        'marille marillen'],
    ['kiwi',      'Kiwi|Kiwis',               'kiwi|kiwis',                 69, '',        ''],
    ['strawberry','Erdbeere|Erdbeeren',       'strawberry|strawberries',    12, '',        ''],
    ['grape',     'Weintraube|Weintrauben',   'grape|grapes',                5, '',        'traube trauben'],
    ['cherry',    'Kirsche|Kirschen',         'cherry|cherries',             8, '',        ''],
    ['fig',       'Feige|Feigen',             'fig|figs',                   50, '',        ''],
    ['date',      'Dattel|Datteln',           'date|dates',                 24, '',        ''],
    ['avocado',   'Avocado|Avocados',         'avocado|avocados',          136, '',        ''],
    ['mango',     'Mango|Mangos',             'mango|mangos',              207, '',        'mangoes'],
    ['lemon',     'Zitrone|Zitronen',         'lemon|lemons',               84, '',        ''],
    ['lime',      'Limette|Limetten',         'lime|limes',                 67, '',        ''],

    // Gemüse
    ['tomato',    'Tomate|Tomaten',           'tomato|tomatoes',           123, '',        ''],
    ['ctomato',   'Cherrytomate|Cherrytomaten','cherry tomato|cherry tomatoes', 17, '',    'kirschtomate kirschtomaten'],
    ['potato',    'Kartoffel|Kartoffeln',     'potato|potatoes',           173, '92,299',  'Erdapfel Erdäpfel'],
    ['carrot',    'Karotte|Karotten',         'carrot|carrots',             61, '',        'Möhre Möhren Mohrrübe'],
    ['onion',     'Zwiebel|Zwiebeln',         'onion|onions',              110, '',        ''],
    ['pepper',    'Paprika|Paprika',          'bell pepper|bell peppers',  119, '',        'paprikaschote'],
    ['cucumber',  'Gurke|Gurken',             'cucumber|cucumbers',        300, '',        'salatgurke salatgurken'],
    ['gherkin',   'Gewürzgurke|Gewürzgurken', 'gherkin|gherkins',           35, '',        'essiggurke essiggurken'],
    ['zucchini',  'Zucchini|Zucchini',        'zucchini|zucchini',         196, '',        ''],
    ['eggplant',  'Aubergine|Auberginen',     'eggplant|eggplants',        458, '',        ''],
    ['garlic',    'Knoblauchzehe|Knoblauchzehen','garlic clove|garlic cloves', 3, '',      ''],
    ['mushroom',  'Champignon|Champignons',   'mushroom|mushrooms',         18, '',        'pilz pilze'],
    ['corn',      'Maiskolben|Maiskolben',    'corn cob|corn cobs',         90, '',        ''],
    ['radish',    'Radieschen|Radieschen',    'radish|radishes',             4.5, '',      ''],
    ['olive',     'Olive|Oliven',             'olive|olives',                4, '',        ''],

    // Ei und Milchiges
    ['egg',       'Ei|Eier',                  'egg|eggs',                   50, '43,58',   'Hühnerei Hühnereier Frühstücksei'],
    ['cheesesl',  'Scheibe Käse|Scheiben Käse','cheese slice|cheese slices', 25, '',       'Scheibenkäse Schnittkäse'],
    ['yogurtcup', 'Becher|Becher',            'pot|pots',                  150, '',        'joghurt jogurt quark skyr'],

    // Backwaren
    ['breadsl',   'Scheibe|Scheiben',         'slice|slices',               45, '',        'brot mischbrot vollkornbrot roggenbrot graubrot'],
    ['toastsl',   'Scheibe|Scheiben',         'slice|slices',               25, '',        'toast toastbrot'],
    ['roll',      'Brötchen|Brötchen',        'roll|rolls',                 55, '',        'Semmel Semmeln Weckerl'],
    ['croissant', 'Croissant|Croissants',     'croissant|croissants',       57, '',        'Hörnchen'],
    ['bagel',     'Bagel|Bagels',             'bagel|bagels',               98, '',        ''],
    ['crisp',     'Knäckebrot|Knäckebrote',   'crispbread|crispbreads',     10, '',        ''],
    ['tortilla',  'Tortilla|Tortillas',       'tortilla|tortillas',         45, '',        'wrap wraps'],
    ['pita',      'Fladenbrot|Fladenbrote',   'pita|pitas',                 60, '',        ''],
    ['pretzel',   'Brezel|Brezeln',           'pretzel|pretzels',           80, '',        'breze brezn'],
    ['muffin',    'Muffin|Muffins',           'muffin|muffins',            113, '',        ''],
    ['pancake',   'Pfannkuchen|Pfannkuchen',  'pancake|pancakes',           77, '',        'eierkuchen'],
    ['waffle',    'Waffel|Waffeln',           'waffle|waffles',             75, '',        ''],

    // Süßes und Knabberei
    ['cookie',    'Keks|Kekse',               'cookie|cookies',             12, '',        'Plätzchen biscuit biscuits'],
    ['cracker',   'Cracker|Cracker',          'cracker|crackers',            3, '',        ''],
    ['chocsq',    'Stück|Stücke',             'square|squares',              5, '',        'schokolade schokoladentafel vollmilchschokolade zartbitterschokolade'],
    ['bar',       'Riegel|Riegel',            'bar|bars',                   25, '',        'Müsliriegel Proteinriegel'],
    ['praline',   'Praline|Pralinen',         'praline|pralines',           12, '',        ''],
    ['scoop',     'Kugel|Kugeln',             'scoop|scoops',               50, '',        'eis speiseeis'],
    ['donut',     'Donut|Donuts',             'donut|donuts',               60, '',        'berliner krapfen'],

    // Herzhaftes
    ['chicken',   'Filet|Filets',             'fillet|fillets',            170, '',        'Hähnchenbrust Hühnerbrust Hähnchenbrustfilet'],
    ['hamsl',     'Scheibe|Scheiben',         'slice|slices',               28, '',        'schinken kochschinken'],
    ['salamisl',  'Scheibe|Scheiben',         'slice|slices',                5, '',        'salami'],
    ['sausage',   'Würstchen|Würstchen',      'sausage|sausages',           50, '',        'wiener wuerstchen frankfurter'],
    ['brat',      'Bratwurst|Bratwürste',     'bratwurst|bratwursts',      100, '',        ''],
    ['patty',     'Frikadelle|Frikadellen',   'patty|patties',              80, '',        'bulette buletten fleischpflanzerl'],
    ['fishstick', 'Fischstäbchen|Fischstäbchen','fish finger|fish fingers',  30, '',       ''],
    ['baconsl',   'Scheibe|Scheiben',         'rasher|rashers',             12, '',        'Speck Frühstücksspeck bacon'],
    ['schnitzel', 'Schnitzel|Schnitzel',      'schnitzel|schnitzels',      150, '',        ''],

    // Nüsse
    ['almond',    'Mandel|Mandeln',           'almond|almonds',              1.2, '',      ''],
    ['walnut',    'Walnusshälfte|Walnusshälften','walnut half|walnut halves', 2.5, '',     'Walnuss Walnüsse'],
    ['hazelnut',  'Haselnuss|Haselnüsse',     'hazelnut|hazelnuts',          1, '',        'Haselnüsse'],
    ['cashew',    'Cashew|Cashews',           'cashew|cashews',              1.5, '',      'cashewkern cashewkerne'],
    ['brazilnut', 'Paranuss|Paranüsse',       'brazil nut|brazil nuts',      5, '',        'Paranüsse']
  ];

  /* Wörter, bei denen das Stück nichts mehr taugt: "Apfelmus" wird
     nicht in Äpfeln gegessen, "Joghurt mit Erdbeere" nicht in
     Erdbeeren, und getrocknete Aprikosen wiegen ein Zehntel. */
  const GUARDS = new Set(norm(
    'mit with und and ohne without Geschmack flavour flavor Aroma flavoured flavored ' +
    'Saft juice Nektar nectar Mus Püree puree Sauce Soße Sirup syrup Konzentrat ' +
    'Pulver powder getrocknet getrocknete dried trocken gefriergetrocknet ' +
    'Creme cream Aufstrich spread Marmelade Konfitüre Gelee jam Extrakt extract ' +
    'Schnitze Stücke Stücken Würfel gewürfelt geschnitten ' +
    'Chips sticks Ringe Likör Wein wine Bier beer'
  ).split(' '));

  /* Löffelgewichte: ein Esslöffel Öl wiegt nicht so viel wie ein
     Esslöffel Mehl. Ohne Eintrag hier gibt es keinen Löffel — bei
     Hackfleisch wäre er Unsinn. (Gramm je EL / je TL.) */
  const SPOONS = [
    [['Öl', 'Olivenöl', 'Rapsöl', 'Sonnenblumenöl', 'Kokosöl', 'Leinöl', 'oil', 'olive oil'], 14, 5],
    [['Honig', 'honey'], 21, 7],
    [['Zucker', 'sugar', 'Rohrzucker', 'Puderzucker'], 12.5, 4],
    [['Mehl', 'flour', 'Weizenmehl', 'Dinkelmehl'], 8, 3],
    [['Butter'], 14, 5],
    [['Margarine'], 14, 5],
    [['Erdnussbutter', 'Erdnussmus', 'peanut butter', 'Mandelmus', 'Nussmus'], 16, 5.5],
    [['Marmelade', 'Konfitüre', 'jam', 'Gelee'], 20, 7],
    [['Ketchup'], 17, 6],
    [['Mayonnaise', 'mayo'], 14, 5],
    [['Senf', 'mustard'], 16, 5],
    [['Frischkäse', 'cream cheese'], 15, 5],
    [['Sahne', 'Schlagsahne', 'cream'], 15, 5],
    [['Haferflocken', 'oats', 'oat flakes'], 9, 3],
    [['Kakao', 'Kakaopulver', 'cocoa'], 5, 2],
    [['Sojasoße', 'Sojasauce', 'soy sauce'], 16, 5],
    [['Essig', 'vinegar', 'Balsamico'], 15, 5],
    [['Pesto'], 16, 5],
    [['Tahini', 'Sesammus'], 15, 5],
    [['Ahornsirup', 'maple syrup', 'Agavendicksaft'], 20, 7]
  ];

  /* Eine Handvoll — für alles, was man nicht einzeln zählt. */
  const HANDFUL = norm(
    'Nüsse Nuss Mandeln Mandel Walnüsse Haselnüsse Cashews Cashewkerne ' +
    'Erdnüsse Pistazien Paranüsse Studentenfutter Rosinen Sultaninen ' +
    'Sonnenblumenkerne Kürbiskerne nuts almonds walnuts raisins trailmix'
  ).split(' ');

  /* ---------- Tabelle einlesen ---------- */

  const PIECES = TABLE.map(([id, de, en, grams, sizes, extra]) => {
    const [de1, de2] = de.split('|');
    const [en1, en2] = en.split('|');
    const keys = new Set();
    [de1, de2, en1, en2].concat(String(extra || '').split(' '))
      .forEach(w => { const n = norm(w); if (n) keys.add(n); });
    const [small, large] = String(sizes || '').split(',').map(Number);
    return {
      id, grams, keys,
      label: { de: [de1, de2 || de1], en: [en1, en2 || en1] },
      small: small || 0,
      large: large || 0
    };
  });

  /* ---------- Namen prüfen ----------
     Gesucht wird nur als ganzes Wort. "Apfel" trifft "Bio Apfel" und
     "Äpfel", aber nicht "Apfelsaft" — im Deutschen steckt das
     Grundwort hinten, und ein zusammengeschriebenes Wort ist eben ein
     anderes Lebensmittel. Und es muss das letzte Wort sein:
     "Apfeljoghurt" ist Joghurt, "Bio-Apfel" ein Apfel. */

  function matchPiece(name) {
    const words = norm(name).split(' ').filter(Boolean);
    if (!words.length) return null;
    if (words.some(w => GUARDS.has(w))) return null;

    // Das letzte Wort entscheidet, und zwar allein: "Apfeljoghurt"
    // ist Joghurt, "Apfel Joghurt" auch. Erst wenn es in der Tabelle
    // gar nicht vorkommt, darf das davor einspringen — für "Apfel
    // Braeburn" und "Äpfel, rot".
    const hit = w => PIECES.find(p => p.keys.has(w)) || null;
    const last = hit(words[words.length - 1]);
    if (last) return last;
    if (words.length > 1 && words.length <= 3) return hit(words[words.length - 2]);
    return null;
  }

  function matchList(name, list) {
    const words = norm(name).split(' ').filter(Boolean);
    return list.some(k => words.includes(k));
  }

  function matchSpoon(name) {
    const words = norm(name).split(' ').filter(Boolean);
    for (const [keys, el, tl] of SPOONS) {
      for (const k of keys) {
        const parts = norm(k).split(' ');
        const hit = parts.length === 1
          ? words.includes(parts[0])
          : parts.every(p => words.includes(p));
        if (hit) return { el, tl };
      }
    }
    return null;
  }

  /* ---------- Die Portionsangabe der Packung lesen ----------
     "2 Kekse (25 g)" oder "25 g (2 Kekse)" oder "1 Riegel (21,5 g)".
     Zurück kommt, wie viele Stück eine Portion sind — das Gewicht
     eines Stücks ergibt sich dann aus der Portion. */

  const MASS = /^(g|gr|gramm|grams?|kg|ml|cl|dl|l|liter|litre|oz|floz|fl\.?\s?oz|lb)$/i;
  const VAGUE = /^(portion|portionen|serving|servings|serving size|stueck|stuck|piece|pieces|einheit|einheiten|unit|units|st|pc|pcs|packung|package|pack|beutel|sachet)$/i;

  function parseServingPieces(text) {
    const s = String(text || '').trim();
    if (!s) return null;

    // Der Teil in Klammern und der Teil davor/danach — einer von
    // beiden nennt das Stück, der andere das Gewicht.
    const m = s.match(/^([^(]*)\(([^)]*)\)\s*$/);
    const parts = m ? [m[1], m[2]] : [s];

    for (const part of parts) {
      const hit = String(part).trim()
        .match(/^([\d]+(?:[.,][\d]+)?)\s*[x×*]?\s*([\p{L}][\p{L}\s.'’-]{1,24})$/u);
      if (!hit) continue;
      const count = parseFloat(hit[1].replace(',', '.'));
      const word = hit[2].trim().replace(/\.$/, '');
      if (!Number.isFinite(count) || count <= 0 || count > 50) continue;
      if (MASS.test(word) || VAGUE.test(norm(word).replace(/\s+/g, ''))) continue;
      if (VAGUE.test(word)) continue;
      return { count, label: word };
    }
    return null;
  }

  /* ---------- Maße bauen ----------
     Ein Maß ist { id, label, plural, base, step, pref }:
     "base" ist, wie viel Gramm (oder Milliliter) ein Stück wiegt.
     "pref" entscheidet nur, was ohne Vorgeschichte vorausgewählt ist. */

  function measure(id, label, base, opts) {
    return Object.assign({
      id, label, plural: label, base, step: 1, pref: 0
    }, opts || {});
  }

  function measuresFor(food) {
    if (!food) return [measure('base', 'g', 1, { step: 10, pref: 10 })];
    const unit = food.unit === 'ml' ? 'ml' : 'g';
    const out = [measure('base', unit, 1, { step: 10, pref: 10 })];
    const seen = new Set(['base']);
    const add = m => {
      if (seen.has(m.id) || !(m.base > 0)) return;
      seen.add(m.id);
      out.push(m);
    };

    const name = [food.name, food.brand].filter(Boolean).join(' ');
    const l = lang();

    // 1. Das Stück aus der Portionsangabe der Packung
    const serving = Number(food.servingGrams) || 0;
    if (serving > 0) {
      const piece = parseServingPieces(food.servingText);
      if (piece && serving / piece.count >= 0.5) {
        add(measure('serving-piece', piece.label, serving / piece.count, {
          plural: piece.label, step: 1, pref: 90
        }));
      }
    }

    // 2. Das Stück, das der Nutzer selbst eingetragen hat
    if (food.piece && food.piece.grams > 0) {
      add(measure('own-piece', food.piece.label || T('unit.piece'),
        food.piece.grams, { plural: food.piece.plural || food.piece.label || T('unit.pieces'), pref: 85 }));
    }

    // 3. Das typische Stück aus der Tabelle
    const p = matchPiece(name);
    if (p) {
      // Bei einem Markenprodukt mit eigener Portionsangabe ist die
      // Packung näher dran als die Tabelle.
      const pref = food.barcode ? 60 : 80;
      add(measure('piece', p.label[l][0], p.grams, { plural: p.label[l][1], pref }));
      if (p.small) {
        add(measure('piece-s', `${p.label[l][0]} (${T('unit.small')})`, p.small,
          { plural: `${p.label[l][1]} (${T('unit.small')})`, pref: 1 }));
      }
      if (p.large) {
        add(measure('piece-l', `${p.label[l][0]} (${T('unit.large')})`, p.large,
          { plural: `${p.label[l][1]} (${T('unit.large')})`, pref: 1 }));
      }
    }

    // 4. Portion und Packung, wie sie schon bisher als Vorschlag kamen
    // Eine 1000-g-Packung ist keine sinnvolle Standardmenge: sie steht
    // zur Wahl, aber vorausgewählt wird sie nicht.
    (food.portions || []).forEach((por, i) => {
      if (!(por.grams > 0)) return;
      const sane = por.grams >= 5 && por.grams <= 400;
      add(measure('portion-' + i, por.label, por.grams, {
        plural: por.label, pref: sane ? 70 : 5
      }));
    });

    // 5. Löffel und Gläser
    const spoon = matchSpoon(name);
    if (unit === 'ml') {
      add(measure('glass', T('unit.glass'), 200, { plural: T('unit.glasses'), pref: 30 }));
      add(measure('cup', T('unit.cup'), 150, { plural: T('unit.cups'), pref: 2 }));
      add(measure('mug', T('unit.mug'), 250, { plural: T('unit.mugs'), pref: 2 }));
      add(measure('tbsp', T('unit.tbsp'), 15, { plural: T('unit.tbsp'), pref: 2 }));
      add(measure('tsp', T('unit.tsp'), 5, { plural: T('unit.tsp'), pref: 2 }));
    } else if (spoon) {
      add(measure('tbsp', T('unit.tbsp'), spoon.el, { plural: T('unit.tbsp'), pref: 40 }));
      add(measure('tsp', T('unit.tsp'), spoon.tl, { plural: T('unit.tsp'), pref: 2 }));
    }
    if (unit === 'g' && matchList(name, HANDFUL)) {
      add(measure('handful', T('unit.handful'), 30, { plural: T('unit.handfuls'), pref: 45 }));
    }

    return out;
  }

  /* ---------- Auswahl und Umrechnung ---------- */

  function byId(measures, id) {
    return measures.find(m => m.id === id) || null;
  }

  /* Ohne Vorgeschichte: das Maß mit der höchsten Vorliebe. */
  function preferred(measures) {
    return measures.reduce((best, m) => (m.pref > best.pref ? m : best), measures[0]);
  }

  /* Halbe Äpfel ja, drittel Äpfel nein; Gramm auf ganze Zahlen. */
  function tidy(value, m) {
    if (!(value > 0)) return 0;
    if (m.id === 'base') return value >= 20 ? Math.round(value) : Math.round(value * 10) / 10;
    const r = Math.round(value * 2) / 2;
    return r < 0.5 ? 0.5 : r;
  }

  function convert(qty, from, to) {
    const grams = (Number(qty) || 0) * from.base;
    return tidy(grams / to.base, to);
  }

  /* Die Schrittweite von + und −: bei Gramm in Zehnern, bei Stücken
     einzeln — und unterhalb eines Stücks in halben. */
  function stepFor(m, qty) {
    if (m.id === 'base') return (Number(qty) || 0) <= 20 ? 5 : 10;
    return (Number(qty) || 0) >= 1 ? 1 : 0.5;
  }

  /* Die Richtung entscheidet mit: von 1 nach oben ist der nächste
     Halt 2, nach unten ein halbes Stück. Und es wird auf das Raster
     gerundet, damit aus 105 g nicht 115 g wird, sondern 110 g. */
  function nudge(qty, m, dir) {
    const cur = Math.max(0, Number(qty) || 0);
    const step = dir > 0 ? stepFor(m, cur) : stepFor(m, cur - 1e-9);
    const next = dir > 0
      ? (Math.floor(cur / step + 1e-9) + 1) * step
      : (Math.ceil(cur / step - 1e-9) - 1) * step;
    const floor = m.id === 'base' ? 1 : 0.5;
    return Math.max(floor, Math.round(next * 100) / 100);
  }

  /* "2 Äpfel", "1 Apfel", "150 g" */
  function label(m, qty) {
    return Number(qty) === 1 ? m.label : (m.plural || m.label);
  }

  return {
    measuresFor, byId, preferred, convert, stepFor, nudge, label, tidy,
    parseServingPieces, matchPiece, matchSpoon, PIECES, SPOONS
  };
})();

if (typeof module !== 'undefined') module.exports = Units;
