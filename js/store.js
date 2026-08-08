/* =========================================================
   store.js — alles, was gespeichert wird
   Liegt ausschließlich im localStorage dieses Geräts.
   ========================================================= */

const Store = (() => {
  const KEY = 'zettel.v1';

  const DEFAULTS = {
    goals: { kcal: 2100, protein: 150, carbs: 210, fat: 70 },
    days: {},   // 'JJJJ-MM-TT' -> [eintrag]
    foods: [],  // eigene Lebensmittel
    cache: {},  // Barcode -> Produkt (damit ein zweiter Scan offline klappt)
    scache: {}, // Suchbegriff -> Treffer, damit dieselbe Suche nicht zweimal ins Netz geht
    lang: null, // null = Sprache des Geräts übernehmen
    region: null // null = Region aus den Geräteeinstellungen ableiten
  };

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      return {
        goals: Object.assign({}, DEFAULTS.goals, parsed.goals),
        days:  parsed.days  || {},
        foods: parsed.foods || [],
        cache:  parsed.cache  || {},
        scache: parsed.scache || {},
        lang:   parsed.lang   || null,
        region: parsed.region || null
      };
    } catch (e) {
      console.warn('Gespeicherte Daten unlesbar, starte leer.', e);
      return structuredClone(DEFAULTS);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Speichern fehlgeschlagen', e);
      return false;
    }
  }

  /* ---------- Datum ---------- */

  function dayKey(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function keyToDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function shiftKey(key, delta) {
    const d = keyToDate(key);
    d.setDate(d.getDate() + delta);
    return dayKey(d);
  }

  /* ---------- Einträge ---------- */

  function entries(key) {
    return data.days[key] || [];
  }

  function addEntry(key, entry) {
    if (!data.days[key]) data.days[key] = [];
    entry.id = entry.id || uid();
    entry.ts = entry.ts || Date.now();
    data.days[key].push(entry);
    save();
    return entry;
  }

  function updateEntry(key, id, patch) {
    const list = data.days[key] || [];
    const i = list.findIndex(e => e.id === id);
    if (i < 0) return null;
    list[i] = Object.assign({}, list[i], patch);
    save();
    return list[i];
  }

  function removeEntry(key, id) {
    const list = data.days[key];
    if (!list) return;
    data.days[key] = list.filter(e => e.id !== id);
    if (!data.days[key].length) delete data.days[key];
    save();
  }

  /* ---------- Summen ---------- */

  function entryTotals(e) {
    const f = (e.grams || 0) / 100;
    const p = e.per100 || {};
    return {
      kcal:    (p.kcal || 0) * f,
      protein: (p.protein || 0) * f,
      carbs:   (p.carbs || 0) * f,
      fat:     (p.fat || 0) * f
    };
  }

  function dayTotals(key) {
    return entries(key).reduce((sum, e) => {
      const t = entryTotals(e);
      sum.kcal += t.kcal; sum.protein += t.protein;
      sum.carbs += t.carbs; sum.fat += t.fat;
      return sum;
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  }

  /* ---------- Sprache ---------- */

  function lang() {
    if (data.lang) return data.lang;
    const nav = (navigator.language || 'de').slice(0, 2).toLowerCase();
    return nav === 'de' ? 'de' : 'en';
  }

  function setLang(l) {
    data.lang = l;
    save();
  }

  /* ---------- Region ----------
     Bestimmt, aus welchem Land die Suche Produkte bevorzugt. */

  const REGIONS = ['world','de','at','ch','fr','it','es','nl','be','pl','dk','se','gb','us','ca'];

  function region() {
    if (data.region) return data.region;
    // Aus der Gerätesprache ableiten: "de-DE" -> "de", "de-AT" -> "at"
    const tag = (navigator.language || '').toLowerCase();
    const country = tag.split('-')[1];
    if (country && REGIONS.includes(country)) return country;
    if (tag.startsWith('de')) return 'de';
    return 'world';
  }

  function setRegion(r) {
    data.region = REGIONS.includes(r) ? r : 'world';
    data.scache = {};      // gespeicherte Treffer gelten nur für die alte Region
    save();
  }

  /* ---------- Ziele ---------- */

  function goals() { return data.goals; }

  function setGoals(patch) {
    Object.assign(data.goals, patch);
    save();
  }

  /* ---------- Eigene Lebensmittel ---------- */

  function foods() { return data.foods; }

  function saveFood(food) {
    const i = data.foods.findIndex(f =>
      (food.barcode && f.barcode === food.barcode) ||
      f.name.toLowerCase() === food.name.toLowerCase()
    );
    const rec = Object.assign({ id: uid() }, food);
    if (i >= 0) { rec.id = data.foods[i].id; data.foods[i] = rec; }
    else data.foods.unshift(rec);
    save();
    return rec;
  }

  function removeFood(id) {
    data.foods = data.foods.filter(f => f.id !== id);
    save();
  }

  function searchFoods(q) {
    const s = q.trim().toLowerCase();
    if (!s) return data.foods.slice(0, 8);
    return data.foods.filter(f =>
      f.name.toLowerCase().includes(s) ||
      (f.brand || '').toLowerCase().includes(s)
    ).slice(0, 12);
  }

  /* ---------- Produkt-Cache ---------- */

  function cacheProduct(code, product) {
    data.cache[code] = product;
    const codes = Object.keys(data.cache);
    if (codes.length > 300) delete data.cache[codes[0]];
    save();
  }
  function cachedProduct(code) { return data.cache[code] || null; }

  /* Suchtreffer einen Tag lang aufheben */
  const SEARCH_TTL = 24 * 60 * 60 * 1000;

  function cacheSearch(key, list) {
    data.scache[key] = { at: Date.now(), list };
    const keys = Object.keys(data.scache);
    if (keys.length > 60) delete data.scache[keys[0]];
    save();
  }

  function cachedSearch(key) {
    const hit = data.scache[key];
    if (!hit) return null;
    if (Date.now() - hit.at > SEARCH_TTL) { delete data.scache[key]; return null; }
    return hit.list;
  }

  /* ---------- Kopie sichern / laden ---------- */

  function exportAll() {
    return JSON.stringify({ app: 'zettel', version: 1, exported: new Date().toISOString(), data }, null, 2);
  }

  function importAll(json) {
    const parsed = JSON.parse(json);
    const d = parsed.data || parsed;
    if (!d || typeof d !== 'object' || !d.days) throw new Error('NOT_ZETTEL');
    data = {
      goals: Object.assign({}, DEFAULTS.goals, d.goals),
      days:  d.days  || {},
      foods: d.foods || [],
      cache:  d.cache  || {},
      scache: d.scache || {},
      lang:   d.lang   || null,
      region: d.region || null
    };
    save();
  }

  /* ---------- Statistik ---------- */

  function recentDays(n) {
    const out = [];
    let k = dayKey();
    for (let i = 0; i < n; i++) {
      out.push({ key: k, totals: dayTotals(k), count: entries(k).length });
      k = shiftKey(k, -1);
    }
    return out;
  }

  function isFresh() {
    return Object.keys(data.days).length === 0;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  return {
    dayKey, keyToDate, shiftKey,
    entries, addEntry, updateEntry, removeEntry,
    entryTotals, dayTotals,
    goals, setGoals, lang, setLang, region, setRegion, REGIONS,
    foods, saveFood, removeFood, searchFoods,
    cacheProduct, cachedProduct, cacheSearch, cachedSearch,
    exportAll, importAll, recentDays, isFresh, uid
  };
})();
