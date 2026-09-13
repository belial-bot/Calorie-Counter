/* =========================================================
   fixtures.js — Testdaten

   Zwei Sorten:

   1. FOODS — schon aufbereitete Lebensmittel, wie sie die
      Wertung in search.js zu sehen bekommt. Nachempfunden dem,
      was in deutschen Supermärkten im Regal steht.
   2. RAW_* — Rohantworten, wie sie von Open Food Facts
      hereinkommen. Die neue Suche und die alte liefern
      dieselbe Angabe in unterschiedlicher Form; genau daran
      ist schon einmal die ganze Trefferliste zerbrochen.
   ========================================================= */

/* Kurzschreibweise: n(name, marke, kcal, {…}) */
function f(name, brand, kcal, extra = {}) {
  return Object.assign({
    name,
    brand,
    barcode: null,
    unit: 'g',
    per100: { kcal, protein: extra.protein || 0, carbs: extra.carbs || 0, fat: extra.fat || 0 },
    portions: [],
    scans: extra.scans || 0,
    cats: extra.cats || [],
    local: extra.local || false,
    source: extra.source || 'off'
  }, extra.own || {});
}

/* ---------- Obst und Gemüse ---------- */

const FOODS = [
  f('Apfel', '', 52, { carbs: 14, cats: ['en:plant-based-foods', 'en:fruits', 'en:fresh-fruits'], scans: 900 }),
  f('Äpfel', 'Rewe Bio', 54, { carbs: 14, cats: ['en:fruits', 'en:fresh-fruits'], scans: 120 }),
  f('Apfelsaft', 'Albi', 46, { carbs: 11, cats: ['en:beverages', 'en:fruit-juices'], scans: 400 }),
  f('Apfelmus', 'Mango', 74, { carbs: 17, cats: ['en:desserts'], scans: 150 }),
  f('Apfelkuchen', 'Coppenrath', 251, { carbs: 33, cats: ['en:desserts', 'en:biscuits-and-cakes'], scans: 60 }),
  f('Veganer Apfelkuchen mit Zimt', 'Bäckerei Meyer', 288, { carbs: 38, cats: ['en:desserts', 'en:biscuits-and-cakes'] }),
  f('Banane', '', 89, { carbs: 21, cats: ['en:fruits', 'en:fresh-fruits'], scans: 700 }),
  f('Tomate', '', 18, { carbs: 3, cats: ['en:vegetables', 'en:fresh-vegetables'], scans: 300 }),
  f('Tomaten geschält', 'Mutti', 22, { carbs: 4, cats: ['en:vegetables'], scans: 200 }),

  /* ---------- Eier ---------- */
  f('Eier', 'Goldähren', 137, { protein: 12, cats: ['en:eggs'], scans: 250 }),
  f('Frische Eier aus Bodenhaltung', 'Rewe', 139, { protein: 13, cats: ['en:eggs'], scans: 180 }),
  f('Eiernudeln', 'Birkel', 362, { carbs: 70, cats: ['en:cereals'], scans: 90 }),
  f('Eiersalat', 'Popp', 380, { fat: 37, cats: ['en:spreads'], scans: 40 }),

  /* ---------- Milch und Molkerei ---------- */
  f('Milch 3,5%', 'Milsani', 64, { protein: 3.4, fat: 3.5, cats: ['en:dairies', 'en:milks'], scans: 800, local: true }),
  f('Vollmilch 3,5 %', 'Milbona', 65, { protein: 3.4, fat: 3.5, cats: ['en:dairies', 'en:milks'], scans: 600, local: true }),
  f('Haltbare fettarme Milch 1,5%', 'ja!', 47, { protein: 3.4, fat: 1.5, cats: ['en:dairies', 'en:milks'], scans: 300 }),
  f('Milchschnitte', 'Ferrero', 417, { fat: 25, cats: ['en:desserts', 'en:sweet-snacks'], scans: 1200 }),
  f('Skyr', 'Milsani', 63, { protein: 11, carbs: 4, cats: ['en:dairies', 'en:plain-yogurts'], scans: 500, local: true }),
  f('Skyr Natur', 'Milbona', 62, { protein: 11, carbs: 4, cats: ['en:dairies', 'en:plain-yogurts'], scans: 450, local: true }),
  f('Skyr Vanille', 'Arla', 78, { protein: 9, carbs: 9, cats: ['en:dairies'], scans: 380 }),
  f('Joghurt mild', 'Zott', 67, { protein: 3.3, cats: ['en:dairies'], scans: 420 }),
  f('Butter', 'Milsani', 741, { fat: 82, cats: ['en:dairies'], scans: 500, local: true }),
  f('Gouda jung gerieben', 'Milsani', 356, { protein: 25, fat: 28, cats: ['en:dairies'], scans: 220, local: true }),

  /* ---------- Fleisch ---------- */
  f('Hähnchenbrust Filet', 'Meine Metzgerei', 105, { protein: 23, cats: ['en:meats', 'en:poultry'], scans: 260, local: true }),
  f('Hähnchenbrustfilet natur', 'Wiesenhof', 108, { protein: 23, cats: ['en:meats', 'en:poultry'], scans: 340 }),
  f('Hähnchenschenkel', 'Gut Langenhof', 180, { protein: 18, cats: ['en:meats', 'en:poultry'], scans: 80 }),
  f('Rinderhackfleisch', 'Meine Metzgerei', 200, { protein: 20, cats: ['en:meats'], scans: 170, local: true }),

  /* ---------- Müsli, Getreide, Brot ---------- */
  f('Müsli Frucht', 'Knusperone', 358, { carbs: 62, cats: ['en:cereals'], scans: 210, local: true }),
  f('Fruchtmüsli', 'Kölln', 365, { carbs: 61, cats: ['en:cereals'], scans: 390 }),
  f('Schokomüsli', 'Knusperone', 430, { carbs: 60, cats: ['en:cereals', 'en:sweet-snacks'], scans: 160, local: true }),
  f('Hafer Flocken kernig', 'Kölln', 372, { carbs: 59, cats: ['en:cereals'], scans: 480 }),
  f('Haferflocken zart', 'Goldähren', 370, { carbs: 59, cats: ['en:cereals'], scans: 520, local: true }),
  f('Weißbrot', 'Goldähren', 265, { carbs: 49, cats: ['en:cereals'], scans: 140, local: true }),
  f('Vollkornbrot', 'Harry', 210, { carbs: 38, cats: ['en:cereals'], scans: 230 }),
  f('Brötchen', 'Bäckerei Meyer', 280, { carbs: 54, cats: ['en:cereals'], scans: 70 }),

  /* ---------- Süßes und Getränke (soll bei Grundnahrung hinten stehen) ---------- */
  f('Schokolade Vollmilch', 'Moser Roth', 546, { fat: 32, cats: ['en:snacks', 'en:sweet-snacks', 'en:candies'], scans: 1500 }),
  f('Fanta Orange', 'Coca-Cola', 38, { carbs: 9, cats: ['en:beverages', 'en:sodas', 'en:sweetened-beverages'], scans: 3000 }),
  f('Orange', '', 47, { carbs: 9, cats: ['en:fruits', 'en:fresh-fruits'], scans: 260 }),
  f('Orangensaft', 'Hohes C', 45, { carbs: 10, cats: ['en:beverages', 'en:fruit-juices'], scans: 800 }),
  f('Nüsse gemischt', 'Alesto', 620, { fat: 55, cats: ['en:nuts'], scans: 280, local: true }),
  f('Olivenöl nativ extra', 'Bellasan', 824, { fat: 91, cats: ['en:fats'], scans: 300, local: true })
];

/* ---------- Rohantworten der neuen Suche (search-a-licious) ----------
   Mehrsprachige Felder kommen hier als Objekt zurück, die Marke als
   Liste. Genau dieses Format muss off.js verkraften. */

const RAW_SEARCH_HITS = [
  {
    code: '4061458123456',
    product_name: { main: 'Skyr', de: 'Skyr', en: 'Skyr' },
    generic_name: { de: 'Frischkäsezubereitung nach isländischer Art' },
    brands: ['Milsani', 'Aldi'],
    nutriments: {
      'energy-kcal_100g': 63, 'proteins_100g': 11, 'carbohydrates_100g': 4, 'fat_100g': 0.2
    },
    serving_size: '150 g', serving_quantity: 150,
    quantity: '500 g', product_quantity: 500, product_quantity_unit: 'g',
    unique_scans_n: 512,
    countries_tags: ['en:germany'],
    categories_tags: ['en:dairies', 'en:plain-yogurts']
  },
  {
    code: '20047286',
    product_name: { main: 'Vollmilch 3,5 %', de: 'Vollmilch 3,5 %' },
    brands: 'Milbona',
    nutriments: {
      'energy-kcal_100g': 65, 'proteins_100g': 3.4, 'carbohydrates_100g': 4.8, 'fat_100g': 3.5
    },
    quantity: '1 l', product_quantity: 1000, product_quantity_unit: 'l',
    unique_scans_n: 604,
    countries_tags: ['en:germany', 'en:austria'],
    categories_tags: ['en:dairies', 'en:milks']
  },
  {
    /* Nur ein englischer Name vorhanden — darf trotzdem nicht verloren gehen */
    code: '30000123',
    product_name: { main: 'Rolled Oats', en: 'Rolled Oats' },
    brands: ['Kölln'],
    nutriments: { 'energy-kcal_100g': 372, 'proteins_100g': 13, 'carbohydrates_100g': 59, 'fat_100g': 7 },
    unique_scans_n: 88,
    countries_tags: ['en:germany'],
    categories_tags: ['en:cereals']
  },
  {
    /* Marke fehlt, nur brands_tags ist da */
    code: '40001111',
    product_name: { de: 'Haferflocken zart' },
    brands_tags: ['goldahren', 'aldi'],
    nutriments: { 'energy-kcal_100g': 370, 'proteins_100g': 13, 'carbohydrates_100g': 59, 'fat_100g': 7 },
    unique_scans_n: 140,
    countries_tags: ['en:germany'],
    categories_tags: ['en:cereals']
  },
  {
    /* Ohne Nährwerte — fliegt zu Recht raus */
    code: '40002222',
    product_name: { de: 'Irgendwas ohne Werte' },
    brands: 'Nix',
    nutriments: {},
    countries_tags: ['en:germany'],
    categories_tags: []
  },
  {
    /* Energie nur in Kilojoule */
    code: '40003333',
    product_name: { de: 'Butter' },
    brands: ['Milsani'],
    nutriments: { 'energy-kj_100g': 3100, 'proteins_100g': 0.7, 'carbohydrates_100g': 0.6, 'fat_100g': 82 },
    unique_scans_n: 300,
    countries_tags: ['en:germany'],
    categories_tags: ['en:dairies']
  }
];

/* ---------- Rohantworten der alten Suche (cgi/search.pl) ----------
   Hier ist alles flach: Namen als Zeichenkette, Marken mit Komma. */

const RAW_LEGACY_PRODUCTS = [
  {
    code: '4061458123456',
    product_name: 'Skyr',
    product_name_de: 'Skyr',
    brands: 'Milsani,Aldi',
    nutriments: { 'energy-kcal_100g': 63, 'proteins_100g': 11, 'carbohydrates_100g': 4, 'fat_100g': 0.2 },
    serving_size: '150 g', serving_quantity: 150,
    quantity: '500 g', product_quantity: 500,
    unique_scans_n: 512,
    countries_tags: ['en:germany'],
    categories_tags: ['en:dairies']
  },
  {
    code: '40004444',
    product_name: 'Hähnchenbrustfilet natur',
    product_name_de: 'Hähnchenbrustfilet natur',
    brands: 'Wiesenhof',
    nutriments: { 'energy-kcal_100g': 108, 'proteins_100g': 23, 'carbohydrates_100g': 0, 'fat_100g': 1.4 },
    unique_scans_n: 340,
    countries_tags: ['en:germany'],
    categories_tags: ['en:meats', 'en:poultry']
  }
];

module.exports = { f, FOODS, RAW_SEARCH_HITS, RAW_LEGACY_PRODUCTS };
