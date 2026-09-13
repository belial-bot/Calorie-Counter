/* =========================================================
   store.js — alles, was gespeichert wird
   Liegt ausschließlich im localStorage dieses Geräts.

   Zwei Schubladen, und das mit Absicht:

   zettel.v1        das Tagebuch, die Ziele, die eigenen Lebensmittel.
                    Ein paar Kilobyte, unersetzlich.
   zettel.cache.v1  was von Open Food Facts nachgeschlagen wurde.
                    Schnell ein Megabyte, und jederzeit entbehrlich.

   Zusammen in einer Schublade hieße: jeder eingetragene Apfel
   schreibt ein Megabyte neu — und wenn der Speicher voll ist,
   lässt sich der Apfel nicht mehr eintragen, weil tausend
   Suchtreffer den Platz belegen. Getrennt kostet ein Eintrag ein
   paar Kilobyte, und im Zweifel fliegt der Zwischenspeicher.
   ========================================================= */

const Store = (() => {
  const KEY = 'zettel.v1';
  const CACHE_KEY = 'zettel.cache.v1';

  const DEFAULTS = {
    goals: { kcal: 2100, protein: 150, carbs: 210, fat: 70 },
    days: {},   // 'JJJJ-MM-TT' -> [eintrag]
    foods: [],  // eigene Lebensmittel
    lang: null, // null = Sprache des Geräts übernehmen
    region: null // null = Region aus den Geräteeinstellungen ableiten
  };

  let data = load();
  let onError = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      // Ältere Fassungen hatten cache und scache hier mit drin. Sie
      // werden hier nicht übernommen und beim ersten Speichern still
      // ausgebucht — nachschlagen lässt sich alles davon wieder.
      return {
        goals: Object.assign({}, DEFAULTS.goals, parsed.goals),
        days:  parsed.days  || {},
        foods: parsed.foods || [],
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
      // Speicher voll. Der Zwischenspeicher ist ersetzbar, das
      // Tagebuch nicht: ausräumen und noch einmal versuchen.
      dropCache();
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch (e2) {
        console.error('Speichern fehlgeschlagen', e2);
        if (onError) onError(e2);
        return false;
      }
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
    // Nachgeschlagenes trägt die alte Region in sich — die Trefferliste
    // sowieso, und bei den Produkten das „gibt es hier zu kaufen".
    dropCache();
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

  function updateFood(id, patch) {
    const i = data.foods.findIndex(f => f.id === id);
    if (i < 0) return null;
    data.foods[i] = Object.assign({}, data.foods[i], patch, { id });
    save();
    return data.foods[i];
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

  /* ---------- Nachgeschlagenes ----------

     Wird erst gelesen, wenn zum ersten Mal gesucht oder gescannt wird:
     beim Start der App wäre es nur Wartezeit für etwas, das vielleicht
     gar nicht gebraucht wird.

     Geschrieben wird gesammelt. Ein Suchlauf bringt bis zu fünfzig
     Produkte mit; sie bei jedem Tastendruck neu zu verschriftlichen
     wäre die teuerste Stelle der ganzen App. Geht dabei einmal etwas
     verloren, ist es ein Zwischenspeicher — es lässt sich nachladen. */

  const MAX_PRODUCTS = 250;
  const MAX_SEARCHES = 24;
  const MAX_HITS = 40;                          // je Suche aufgehoben
  const SEARCH_TTL = 24 * 60 * 60 * 1000;       // einen Tag lang gültig
  const WRITE_DELAY = 1500;

  let cache = null;
  let cacheDirty = false;
  let cacheTimer = null;

  function shelf() {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      cache = { p: (parsed && parsed.p) || {}, s: (parsed && parsed.s) || {} };
    } catch (e) {
      cache = { p: {}, s: {} };
    }
    return cache;
  }

  function saveCacheSoon() {
    cacheDirty = true;
    if (!cacheTimer) cacheTimer = setTimeout(flushCache, WRITE_DELAY);
  }

  function flushCache() {
    clearTimeout(cacheTimer);
    cacheTimer = null;
    if (!cacheDirty || !cache) return;
    cacheDirty = false;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
    catch (e) { dropCache(); }      // voll: lieber leer als im Weg
  }

  function dropCache() {
    cache = { p: {}, s: {} };
    cacheDirty = false;
    clearTimeout(cacheTimer);
    cacheTimer = null;
    try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* dann eben nicht */ }
  }

  /* Das Älteste zuerst — nicht das Erstbeste. Reihenfolge nach
     Einfügen gibt es bei Zahlen-Schlüsseln (ein EAN-8 ist einer)
     nämlich nicht: die sortiert JavaScript von sich aus nach Größe. */
  function evict(map, max) {
    const keys = Object.keys(map);
    if (keys.length <= max) return;
    keys.sort((a, b) => (map[a].at || 0) - (map[b].at || 0));
    for (let i = 0; i < keys.length - max; i++) delete map[keys[i]];
  }

  function cacheProduct(code, product) {
    const c = shelf();
    c.p[code] = { at: Date.now(), v: product };
    evict(c.p, MAX_PRODUCTS);
    saveCacheSoon();
  }

  function cachedProduct(code) {
    const hit = shelf().p[code];
    return hit ? hit.v : null;
  }

  function cacheSearch(key, list) {
    const c = shelf();
    c.s[key] = { at: Date.now(), list: list.slice(0, MAX_HITS) };
    evict(c.s, MAX_SEARCHES);
    saveCacheSoon();
  }

  function cachedSearch(key) {
    const c = shelf();
    const hit = c.s[key];
    if (!hit) return null;
    if (Date.now() - hit.at > SEARCH_TTL) { delete c.s[key]; saveCacheSoon(); return null; }
    return hit.list;
  }

  /* Wer die App weglegt, soll den Zwischenspeicher nicht verlieren.
     pagehide ist auf dem iPhone das einzige Ereignis, auf das dabei
     Verlass ist — unload kommt dort nie. */
  if (typeof addEventListener === 'function') {
    addEventListener('pagehide', flushCache);
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushCache();
    });
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
    foods, saveFood, updateFood, removeFood, searchFoods,
    cacheProduct, cachedProduct, cacheSearch, cachedSearch,
    exportAll, importAll, recentDays, isFresh, uid,
    onSaveError(fn) { onError = fn; }
  };
})();
