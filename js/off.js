/* =========================================================
   off.js — Nährwerte von Open Food Facts
   Offene Datenbank, kein Schlüssel, keine Anmeldung.
   https://world.openfoodfacts.org

   Drei Dienste sind im Spiel:

   1. api/v2/product/<code>  — ein Produkt über seinen Barcode.
   2. search.openfoodfacts.org — die neue Volltextsuche
      ("search-a-licious", Elasticsearch dahinter). Schnell, versteht
      Lucene-Syntax, und nur sie kann gezielt gefragt werden.
   3. cgi/search.pl — die alte Suche. Langsam und streng
      rate-limitiert, aber sie läuft auf einem anderen Server. Als
      Auffangnetz ist sie deshalb Gold wert.

   Jede Antwort landet im Zwischenspeicher.
   ========================================================= */

const OFF = (() => {

  const SEARCH_URL = 'https://search.openfoodfacts.org/search';

  /* Die Felder, die hier gebraucht werden — mehr nicht.
     Alle drei Dienste verstehen dieselbe Liste und lassen weg, was sie
     nicht kennen; eine Abfrage scheitert daran nicht. Ohne die Liste
     schickt die Suche zu jedem Treffer Bilder, Zutaten und Ökobilanz
     mit: ein halbes Megabyte, von dem hier nichts gebraucht wird. */
  function fields() {
    const l = I18n.lang === 'de' ? 'de' : 'en';
    return [
      'code', 'product_name', `product_name_${l}`, 'generic_name', `generic_name_${l}`,
      'brands', 'nutriments', 'serving_size', 'serving_quantity',
      'quantity', 'product_quantity', 'product_quantity_unit',
      'unique_scans_n', 'countries_tags', 'categories_tags'
    ].join(',');
  }

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

  /* Dieselbe Angabe kommt je nach Dienst als Liste oder als Zeichenkette
     mit Kommas: die Suche schickt ["Milbona","Lidl"], die Produkt-API
     "Milbona,Lidl". Beides muss hier durch — ein blindes .split() auf der
     Liste hat früher die ganze Trefferliste zu Fall gebracht. */
  function firstOf(v) {
    if (Array.isArray(v)) v = v.join(',');
    return String(v == null ? '' : v).split(',')[0].trim();
  }

  function text(v) {
    return typeof v === 'string' ? v.trim() : '';
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
    const l = I18n.lang === 'de' ? 'de' : 'en';
    return text(p['product_name_' + l]) || text(p.product_name)
        || text(p['generic_name_' + l]) || text(p.generic_name);
  }

  /* "500 g", "1,5 l", "6 x 33 cl" — die Suche liefert die Packungsgröße
     nur als Text. Für den Vorschlag "ganze Packung" reicht das. */
  function packSize(s) {
    const m = String(s || '').toLowerCase().replace(/\s+/g, '')
      .match(/([\d.,]+)(kg|g|l|cl|ml)(?![a-z])/);
    if (!m) return null;
    const n = num(m[1]);
    if (n === null) return null;
    return n * { kg: 1000, g: 1, l: 1000, cl: 10, ml: 1 }[m[2]];
  }

  function portions(p) {
    const out = [];
    const serving = num(p.serving_quantity);
    if (serving && serving > 0 && serving < 2000) {
      const label = text(p.serving_size) || `${Math.round(serving)} g`;
      out.push({ label: I18n.t('off.portion', { label }), grams: serving });
    }
    const pack = num(p.product_quantity) || packSize(p.quantity);
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
      brand: firstOf(p.brands),
      unit,
      per100: nutr,
      portions: portions(p),
      scans: num(p.unique_scans_n) || 0,
      cats: Array.isArray(p.categories_tags) ? p.categories_tags : [],
      local: !!(tag && Array.isArray(p.countries_tags) && p.countries_tags.includes(tag)),
      source: 'off'
    };
  }

  /* Ein einziges seltsames Produkt darf nicht die ganze Trefferliste
     mitreißen. Was sich nicht lesen lässt, fällt einzeln raus. */
  function normaliseAll(list, region) {
    const out = [];
    for (const p of list) {
      let f = null;
      try { f = normalise(p, region); } catch (e) { console.warn('Produkt unlesbar', e); }
      if (f) out.push(f);
    }
    return out;
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
    const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields()}`;
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

  /* ---------- Die Abfrage ----------

     Der Suchdienst versteht Lucene-Syntax, und darin steckt der ganze
     Hebel. Zwei Arten von Wörtern:

       milch                    — ohne Feldnamen: Volltextsuche über
                                  Name, Gattung, Kategorie und Marke.
                                  Bestimmt die Reihenfolge.
       product_name.de:(*milch*) — mit Feldnamen: ein harter Filter.
                                  Bestimmt, wer überhaupt dabei ist.

     Ohne Filter gewinnt bei "Milch" ein geriebener Mozzarella, weil das
     Wort irgendwo in seinen Kategorien steht — nachgeprüft, genau so
     kommt es zurück. Mit Filter bleiben nur Produkte übrig, die das Wort
     im Namen oder in der Marke tragen, und innerhalb dieser Auswahl
     sortiert der Dienst nach Relevanz weiter.

     Der Stern vorn und hinten ist für das Deutsche nötig: der Index
     zerlegt keine Zusammensetzungen. Ohne ihn findet "Milch" keine
     "Vollmilch" — nur zwei Dutzend Produkte, bei denen beide Wörter
     zufällig getrennt nebeneinander stehen.

     Drei Felder je Suchwort:
       product_name.main — der Name in der Sprache des Produkts
       product_name.de   — der Name in der Sprache des Nutzers
       brands            — die Marke, damit "skyr ja" den Skyr von ja!
                           findet, obwohl "ja" nicht im Namen steht.

     Die Umlaute dürfen dabei wegfallen: der Index legt "Olivenöl" als
     "olivenol" ab. Wer ohne Umlaut tippt, findet es trotzdem.

     Tippfehler fängt das nicht ab — Lucenes ~1 arbeitet auf den
     gestemmten Wortformen und geht bei zusammengesetzten Wörtern ins
     Leere (nachgeprüft: haferflocken~1 findet keine Haferflocken).
     Dafür ist der weite Durchgang unten da. */

  function terms(q) {
    return Rank.tokens(q).filter(t => t.length > 1).slice(0, 6);
  }

  function clause(t, lang) {
    // Kurze Wörter nur nach vorn öffnen. "*ja*" fände jedes Joghurt,
    // jede Marmelade und jede Paprika mit — "ja*" findet ja!.
    const pat = t.length >= 4 ? `*${t}*` : `${t}*`;
    return `(product_name.main:(${pat})`
         + ` OR product_name.${lang}:(${pat})`
         + ` OR brands:(${pat}))`;
  }

  function buildQuery(q, opts) {
    const lang = I18n.lang === 'de' ? 'de' : 'en';
    const tk = terms(q);
    if (!tk.length) return null;

    const parts = [tk.join(' ')];
    if (opts.strict) tk.forEach(t => parts.push(clause(t, lang)));
    const tag = opts.everywhere ? null : COUNTRIES[opts.region];
    if (tag) parts.push(`countries_tags:"${tag}"`);
    return parts.join(' ');
  }

  /* ---------- Suchdienst 1: die neue Suche ----------
     region  = wonach der Nutzer sucht (färbt "gibt es hier zu kaufen")
     strict  = mit Namens- und Markenfilter
     everywhere = ohne Länderfilter */

  async function searchFast(q, region, opts = {}) {
    const query = buildQuery(q, { region, strict: opts.strict, everywhere: opts.everywhere });
    if (!query) return [];
    const params = new URLSearchParams({
      q: query,
      page_size: '50',
      fields: fields(),
      langs: I18n.lang === 'de' ? 'de,en' : 'en,de'
    });
    const json = await fetchJSON(SEARCH_URL + '?' + params, 7000);
    const hits = (json && (json.hits || json.products)) || [];
    return normaliseAll(hits, region);
  }

  /* ---------- Suchdienst 2: das Auffangnetz ----------
     Anderer Server, andere Technik. Wenn die neue Suche streikt,
     steht meistens noch diese. */

  async function searchLegacy(q, region, opts = {}) {
    const params = new URLSearchParams({
      search_terms: q, search_simple: '1', action: 'process', json: '1',
      page_size: '40', fields: fields(), sort_by: 'unique_scans_n',
      lc: I18n.lang === 'de' ? 'de' : 'en'
    });
    const tag = opts.everywhere ? null : COUNTRIES[region];
    if (tag) {
      params.set('tagtype_0', 'countries');
      params.set('tag_contains_0', 'contains');
      params.set('tag_0', tag.replace('en:', ''));
    }
    const json = await fetchJSON('https://world.openfoodfacts.org/cgi/search.pl?' + params, 9000);
    return normaliseAll((json && json.products) || [], region);
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

  /* ---------- Suchen ---------- */

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* Läuft dieselbe Suche schon, hängt sich der zweite Aufrufer an das
     laufende Versprechen. Sonst schickt ein Enter direkt nach dem Tippen
     eine zweite Anfrage los, die im Rate-Limit landet — und die erste,
     erfolgreiche Antwort wird verworfen. */
  const inflight = new Map();

  /* Die Fassung im Schlüssel sorgt dafür, dass nach einer Änderung an der
     Abfrage nicht noch einen Tag lang die alten Treffer erscheinen. */
  const cacheKey = (region, q) => 'v2|' + region + '|' + Rank.norm(q);

  function search(query) {
    const q = query.trim();
    if (q.length < 2) return Promise.resolve([]);

    const region = Store.region();
    const key = cacheKey(region, q);
    const cached = Store.cachedSearch(key);
    if (cached) return Promise.resolve(cached);
    if (inflight.has(key)) return inflight.get(key);

    const job = runSearch(q, region, key).finally(() => inflight.delete(key));
    inflight.set(key, job);
    return job;
  }

  function running(query) {
    return inflight.has(cacheKey(Store.region(), String(query || '').trim()));
  }

  /* Der genaue Griff zuerst, die weite Kelle nur bei Bedarf.
     Im Regelfall ist das genau eine Anfrage. */

  async function runSearch(q, region, key) {
    let list = [];
    let reached = false;

    // 1. Genau: Suchwörter im Namen oder in der Marke, Region beachtet.
    //    Der erste Aufruf schlägt gelegentlich fehl (Kaltstart, kurzer
    //    Aussetzer, Rate-Limit). Zwei weitere Anläufe sind billiger als
    //    der Rückfall aufs langsame Auffangnetz.
    for (let attempt = 0; attempt < 3 && !reached; attempt++) {
      try { list = await searchFast(q, region, { strict: true }); reached = true; }
      catch (e) {
        if (attempt === 2 || e.message === 'TIMEOUT') break;
        const throttled = /\b(429|503)\b/.test(e.message || '');
        await sleep(throttled ? 1200 : 450);
      }
    }

    // 2. Zu wenig? Dann derselbe genaue Griff, nur ohne Länderfilter.
    //    Die Region bleibt in der Wertung als Bonus erhalten.
    if (reached && list.length < 8 && region !== 'world') {
      try { list = merge(list, await searchFast(q, region, { strict: true, everywhere: true })); }
      catch (e) { /* nicht schlimm */ }
    }

    // 3. Immer noch dünn? Jetzt die weite Suche: sie greift auch über
    //    Kategorien und Gattungsnamen und findet damit, was anders heißt,
    //    als der Nutzer getippt hat. Sie holt viel Beifang mit — deshalb
    //    zuletzt, und die Wertung in search.js sortiert ihn nach hinten.
    if (reached && list.length < 5) {
      try { list = merge(list, await searchFast(q, region, { everywhere: true })); }
      catch (e) { /* nicht schlimm */ }
    }

    // 4. Der neue Dienst ist nicht erreichbar: der alte muss ran.
    if (!reached) {
      try { list = await searchLegacy(q, region); reached = true; }
      catch (e) { /* weiter unten */ }
    }
    if (!reached) {
      if (region === 'world') throw new Error('OFFLINE');
      list = await searchLegacy(q, region, { everywhere: true });  // wirft, wenn auch das scheitert
    }

    if (list.length) Store.cacheSearch(key, list);
    return list;
  }

  return { lookup, search, running, normalise, per100, buildQuery, COUNTRIES };
})();
