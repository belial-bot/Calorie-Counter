/* =========================================================
   off.js — Nährwerte von Open Food Facts
   Offene Datenbank, kein Schlüssel, keine Anmeldung.
   https://world.openfoodfacts.org

   Zwei Suchdienste stehen zur Verfügung. Der neue ist schnell,
   der alte gründlicher, aber langsam und streng rate-limitiert.
   Deshalb: neuer zuerst, alter nur als Auffangnetz, und jede
   Antwort landet im Zwischenspeicher.
   ========================================================= */

const OFF = (() => {

  /* Nur für den Abruf über Barcode — dort sind alle Feldnamen gültig */
  const FIELDS = [
    'code', 'product_name', 'product_name_de', 'generic_name_de', 'generic_name',
    'brands', 'nutriments', 'serving_size', 'serving_quantity',
    'quantity', 'product_quantity', 'product_quantity_unit',
    'unique_scans_n', 'countries_tags', 'categories_tags'
  ].join(',');

  /* Regionen für die Suche. Schlüssel = ISO-Code, Wert = Tag in der Datenbank. */
  const COUNTRIES = {
    de: 'en:germany',        at: 'en:austria',       ch: 'en:switzerland',
    fr: 'en:france',         it: 'en:italy',         es: 'en:spain',
    nl: 'en:netherlands',    be: 'en:belgium',       pl: 'en:poland',
    dk: 'en:denmark',        se: 'en:sweden',
    gb: 'en:united-kingdom', us: 'en:united-states', ca: 'en:canada'
  };

  function num(v) {
    const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
    return Number.isFinite(n) ? n : null;
  }

  function per100(n = {}) {
    let kcal = num(n['energy-kcal_100g']);
    if (kcal === null) {
      const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
      if (kj !== null) kcal = kj / 4.184;
    }
    return {
      kcal:    kcal === null ? 0 : Math.round(kcal * 10) / 10,
      protein: num(n['proteins_100g']) ?? 0,
      carbs:   num(n['carbohydrates_100g']) ?? 0,
      fat:     num(n['fat_100g']) ?? 0
    };
  }

  function pickName(p) {
    return (p.product_name_de || p.product_name || p.generic_name_de || p.generic_name || '').trim();
  }

  function portions(p) {
    const out = [];
    const serving = num(p.serving_quantity);
    if (serving && serving > 0 && serving < 2000) {
      const label = (p.serving_size || '').trim() || `${Math.round(serving)} g`;
      out.push({ label: I18n.t('off.portion', { label }), grams: serving });
    }
    const pack = num(p.product_quantity);
    if (pack && pack > 0 && pack <= 5000 && pack !== serving) {
      out.push({ label: I18n.t('off.pack', { g: Math.round(pack) }), grams: pack });
    }
    return out;
  }

  function normalise(p, region) {
    if (!p) return null;
    const name = pickName(p);
    if (!name) return null;
    const nutr = per100(p.nutriments);
    if (!nutr.kcal && !nutr.protein && !nutr.carbs && !nutr.fat) return null;
    const unit = (p.product_quantity_unit === 'ml' || /\bml\b|\bl\b/i.test(p.quantity || '')) ? 'ml' : 'g';
    const tag = COUNTRIES[region];
    return {
      barcode: p.code || null,
      name,
      brand: (p.brands || '').split(',')[0].trim(),
      unit,
      per100: nutr,
      portions: portions(p),
      scans: num(p.unique_scans_n) || 0,
      cats: Array.isArray(p.categories_tags) ? p.categories_tags : [],
      local: !!(tag && Array.isArray(p.countries_tags) && p.countries_tags.includes(tag)),
      source: 'off'
    };
  }

  async function fetchJSON(url, ms) {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      // Eine Zeitüberschreitung heißt: die Leitung ist zäh. Da hilft kein
      // schneller zweiter Anlauf, sondern nur der nächste Dienst.
      throw timedOut ? new Error('TIMEOUT') : e;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- Barcode nachschlagen ---------- */

  async function lookup(barcode) {
    const code = String(barcode).replace(/\D/g, '');
    if (!code) return null;

    const cached = Store.cachedProduct(code);
    const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`;
    try {
      const json = await fetchJSON(url, 9000);
      const prod = normalise(json && json.product, Store.region());
      if (prod) Store.cacheProduct(code, prod);
      return prod || cached;
    } catch (e) {
      if (cached) return cached;
      throw e;
    }
  }

  /* ---------- Suchdienst 1: schnell ----------
     Bewusst ohne fields-Parameter. Ein einziger Feldname, den dieser
     Dienst nicht kennt, lässt die ganze Abfrage scheitern — und dann
     rutscht jede Suche ins langsame Auffangnetz. Genau das war der
     Grund für die sprunghaften "nicht erreichbar"-Meldungen. */

  async function searchFast(q, region) {
    const tag = COUNTRIES[region];
    const params = new URLSearchParams({
      q: tag ? `${q} countries_tags:"${tag}"` : q,
      page_size: '50',
      langs: I18n.lang === 'de' ? 'de,en' : 'en,de'
    });
    const json = await fetchJSON('https://search.openfoodfacts.org/search?' + params, 6000);
    const hits = (json && (json.hits || json.products)) || [];
    return hits.map(p => normalise(p, region)).filter(Boolean);
  }

  /* ---------- Suchdienst 2: das Auffangnetz ---------- */

  async function searchLegacy(q, region) {
    const params = new URLSearchParams({
      search_terms: q, search_simple: '1', action: 'process', json: '1',
      page_size: '40', fields: FIELDS, sort_by: 'unique_scans_n',
      lc: I18n.lang === 'de' ? 'de' : 'en'
    });
    if (COUNTRIES[region]) {
      params.set('tagtype_0', 'countries');
      params.set('tag_contains_0', 'contains');
      params.set('tag_0', COUNTRIES[region].replace('en:', ''));
    }
    const json = await fetchJSON('https://world.openfoodfacts.org/cgi/search.pl?' + params, 9000);
    return ((json && json.products) || []).map(p => normalise(p, region)).filter(Boolean);
  }

  function merge(a, b) {
    const seen = new Set(a.map(x => x.barcode || x.name));
    return a.concat(b.filter(x => {
      const id = x.barcode || x.name;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }));
  }

  /* ---------- Suchen ----------
     Erst regional und schnell. Zu wenige Treffer → weltweit nachlegen.
     Dienst nicht erreichbar → Auffangnetz. */

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* Läuft dieselbe Suche schon, hängt sich der zweite Aufrufer an das
     laufende Versprechen. Sonst schickt ein Enter direkt nach dem Tippen
     eine zweite Anfrage los, die im Rate-Limit landet — und die erste,
     erfolgreiche Antwort wird verworfen. */
  const inflight = new Map();

  function search(query) {
    const q = query.trim();
    if (q.length < 2) return Promise.resolve([]);

    const region = Store.region();
    const key = region + '|' + Rank.norm(q);
    const cached = Store.cachedSearch(key);
    if (cached) return Promise.resolve(cached);
    if (inflight.has(key)) return inflight.get(key);

    const job = runSearch(q, region, key).finally(() => inflight.delete(key));
    inflight.set(key, job);
    return job;
  }

  function running(query) {
    return inflight.has(Store.region() + '|' + Rank.norm(String(query || '').trim()));
  }

  async function runSearch(q, region, key) {
    let list = [];
    let reached = false;

    // Der erste Aufruf schlägt gelegentlich fehl (Kaltstart, kurzer Aussetzer,
    // Rate-Limit). Zwei weitere Anläufe sind billiger als der Rückfall aufs
    // langsame Auffangnetz — bei einer Drosselung mit längerer Pause.
    for (let attempt = 0; attempt < 3 && !reached; attempt++) {
      try { list = await searchFast(q, region); reached = true; }
      catch (e) {
        if (attempt === 2 || e.message === 'TIMEOUT') break;
        const throttled = /\b(429|503)\b/.test(e.message || '');
        await sleep(throttled ? 1200 : 450);
      }
    }

    if (reached && list.length < 6 && region !== 'world') {
      try { list = merge(list, await searchFast(q, 'world')); } catch (e) { /* nicht schlimm */ }
    }

    if (!reached) {
      try { list = await searchLegacy(q, region); reached = true; }
      catch (e) { /* weiter unten */ }
    }

    if (!reached) {
      if (region === 'world') throw new Error('OFFLINE');
      list = await searchLegacy(q, 'world');   // wirft, wenn auch das scheitert
    }

    if (list.length) Store.cacheSearch(key, list);
    return list;
  }

  return { lookup, search, running, normalise, per100, COUNTRIES };
})();
