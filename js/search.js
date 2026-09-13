/* =========================================================
   search.js — Treffer sortieren

   Ein Gedanke trägt alles: wie gut deckt sich die Eingabe mit
   dem Produkt? "Apfel" deckt "Apfel" vollständig, "Apfelsaft"
   nur halb und "Veganer Apfelkuchen" noch weniger.

   Das ergibt 0 bis 1000 Punkte. Alles Weitere — Eigenes,
   Zuletzt-Gegessenes, Region, Kategorie, Beliebtheit — sind
   Korrekturen von höchstens ein paar hundert Punkten. Sie
   entscheiden bei ähnlich guten Treffern, können eine klar
   bessere Übereinstimmung aber nicht überholen.
   ========================================================= */

const Rank = (() => {

  /* ---------- Text einebnen ---------- */

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/œ/g, 'oe')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function tokens(s) {
    return norm(s).split(' ').filter(Boolean);
  }

  /* Füllsel, das über den Inhalt nichts aussagt: "3,5%" in "Milch 3,5%" */
  function content(list) {
    return list.filter(w => w.length > 1 && !/^\d+$/.test(w));
  }

  /* Levenshtein mit Abbruch — für Tippfehler wie "jogurt"/"joghurt" */
  function lev(a, b, max) {
    if (a === b) return 0;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let prev = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      const cur = new Array(lb + 1);
      cur[0] = i;
      let best = cur[0];
      for (let j = 1; j <= lb; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[lb];
  }

  function fuzzyOk(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 4) return false;
    const max = n >= 7 ? 2 : 1;
    return lev(a, b, max) <= max;
  }

  /* ---------- Ein- und Mehrzahl ----------
     Tomate/Tomaten, Nuss/Nüsse, Brot/Brote: im Deutschen hängt die
     Mehrzahl hinten dran. Ein grober Schnitt reicht, solange er auf
     beiden Seiten gleich grob ist — er zählt ohnehin nur als
     Rückfall, hinter der genauen Übereinstimmung. */

  function stem(w) {
    if (w.length > 5 && w.endsWith('ern')) return w.slice(0, -3);
    if (w.length > 4 && /(en|er|es|em|se)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /[ens]$/.test(w)) return w.slice(0, -1);
    return w;
  }

  /* ---------- Zusammensetzungen ----------
     "Hähnchenbrustfilet" ist "Hähnchenbrust" und "Filet". Mal steht
     es im Namen zusammen, mal getrennt — und wie der Nutzer es
     tippt, ist noch einmal eine dritte Sache. Zerlegt wird deshalb
     in beide Richtungen: Wie viel des getippten Wortes lässt sich
     aus den Wörtern des Namens zusammensetzen?

     Ohne das fiel bisher jede zusammengeschriebene Eingabe durch:
     "Haferflocken" traf "Hafer Flocken" mit null Punkten und flog
     damit ganz aus der Liste. */

  function compound(qt, words) {
    if (qt.length < 6) return null;
    let covered = 0;
    const used = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.length >= 4 && qt.includes(w)) { covered += w.length; used.push(i); }
    }
    if (!used.length) return null;
    return { score: Math.min(1, covered / qt.length), used };
  }

  /* ---------- Der Kern: ein Suchwort gegen ein Wort im Namen ----------
     Ein ganzes Wort zählt voll. Ein Wortanfang zählt halb, denn im
     Deutschen fängt "Eis" mit "Ei" an und "Orangensaft" mit "Orange" —
     das ist ein Hinweis, aber kein Treffer. Ein Wortende dagegen ist ein
     starker Hinweis, denn dort steht im Deutschen das Grundwort. Unter
     vier Zeichen zählt beides nicht, sonst findet "Ei" lauter Eiscreme. */

  function wordMatch(q, w) {
    if (q === w) return 1;
    if (fuzzyOk(q, w)) return 0.85;
    // Mehrzahl und Fälle: Tomaten ist Tomate. Zählt fast voll, aber
    // eben nicht ganz — wer genau tippt, soll genau finden.
    if (q.length >= 3 && w.length >= 3 && stem(q) === stem(w)) return 0.8;
    // Im Deutschen steht das Grundwort hinten: Vollmilch ist Milch,
    // Milchschnitte ist eine Schnitte. Ein Wortende wiegt deshalb
    // deutlich schwerer als ein Wortanfang.
    if (q.length >= 3 && w.endsWith(q)) return 0.7;
    if (q.length >= 3 && w.startsWith(q)) return 0.5;
    if (q.length >= 4 && w.includes(q)) return 0.3;
    // Und dieselbe Überlegung andersherum, denn das längere Wort
    // steht mal in der Eingabe und mal im Namen: wer "Hähnchenbrust"
    // tippt, meint auch das "Hähnchenbrustfilet".
    if (w.length >= 4 && q.endsWith(w)) return 0.6;
    if (w.length >= 4 && q.startsWith(w)) return 0.45;
    return 0;
  }

  /**
   * Deckung in beide Richtungen.
   * qCover: wie viel der Eingabe steckt im Produkt?
   * nCover: wie viel des Produktnamens ist durch die Eingabe erklärt?
   * Erst beides zusammen trennt "Apfel" von "Veganer Apfelkuchen".
   */
  function coverage(qTokens, nameTokens, brandTokens) {
    const nameC = content(nameTokens);
    const hit = new Array(nameC.length).fill(0);
    let sum = 0;

    for (const qt of qTokens) {
      let best = 0, at = -1;
      for (let i = 0; i < nameC.length; i++) {
        const v = wordMatch(qt, nameC[i]);
        if (v > best) { best = v; at = i; }
      }
      for (const bt of brandTokens) {
        // Die Marke zählt fast so viel wie der Name: "skyr ja" soll den
        // Skyr von ja! finden, ohne dass "ja" im Produktnamen steht.
        const v = wordMatch(qt, bt) * 0.95;
        if (v > best) { best = v; at = -1; }
      }

      // Lässt sich das getippte Wort aus mehreren Wörtern des Namens
      // zusammensetzen, zählen die alle als getroffen. Der Abschlag
      // hält die zerlegte Schreibweise hinter der wörtlichen: wer
      // "Hähnchenbrustfilet" tippt, bekommt zuerst das Produkt, das
      // auch so heißt — das getrennt geschriebene gleich dahinter.
      const comp = compound(qt, nameC);
      if (comp && comp.score * 0.75 > best) {
        best = comp.score * 0.75;
        at = -1;
        comp.used.forEach(i => { hit[i] = Math.max(hit[i], best); });
      }

      sum += best;
      if (at >= 0) hit[at] = Math.max(hit[at], best);
    }

    return {
      q: qTokens.length ? sum / qTokens.length : 0,
      n: nameC.length ? hit.reduce((a, b) => a + b, 0) / nameC.length : 0
    };
  }

  /* ---------- Kategorien ----------
     Open Food Facts hängt an jedes Produkt Kategorien. Je weniger davon,
     desto grundlegender das Lebensmittel: "Orange" hat eine Handvoll,
     "Fanta Orange" ein Dutzend. Dazu zwei kurze Listen für die Fälle,
     wo die Zählung allein nicht reicht. */

  const BASIC = [
    'en:fruits', 'en:vegetables', 'en:fresh-fruits', 'en:fresh-vegetables',
    'en:eggs', 'en:meats', 'en:poultry', 'en:fishes', 'en:legumes', 'en:nuts',
    'en:cereals', 'en:milks', 'en:plain-yogurts', 'en:dairies', 'en:fresh-foods'
  ];
  const PROCESSED = [
    'en:beverages', 'en:sodas', 'en:sweetened-beverages', 'en:fruit-juices',
    'en:desserts', 'en:snacks', 'en:sweet-snacks', 'en:candies', 'en:ice-creams',
    'en:biscuits-and-cakes', 'en:spreads', 'en:sauces', 'en:alcoholic-beverages'
  ];

  function categoryScore(cats) {
    if (!cats || !cats.length) return 0;
    const has = list => cats.some(c => list.indexOf(c) >= 0);
    let s = 0;
    if (has(BASIC)) s += 100;
    if (has(PROCESSED)) s -= 110;
    s += Math.max(-40, 70 - cats.length * 9);   // wenige Kategorien = grundlegender
    return Math.max(-150, Math.min(160, s));
  }

  /* ---------- Gesamtwertung ---------- */

  function score(item, q) {
    // "Milch 3,5" sucht Milch. Die nackte Zahl sagt über das
    // Lebensmittel nichts und würde die Deckung nur verwässern.
    const qt = q.content || content(q.tokens);
    const cov = coverage(qt.length ? qt : q.tokens, tokens(item.name), tokens(item.brand));
    if (cov.q <= 0) return -Infinity;      // kein Suchwort getroffen: raus

    // Die Deckung trägt die Rangfolge. Was in der Eingabe steht, muss im
    // Produkt vorkommen (cov.q); und je weniger sonst noch im Namen steht,
    // desto besser passt es (cov.n).
    let s = 1000 * cov.q * (0.4 + 0.6 * cov.n);

    // Ab hier nur noch Feinabstimmung.
    if (item.source === 'mine') s += 250;                 // selbst angelegt
    if (item.source === 'log') s += 200;                  // zuletzt gegessen
    if (item.local) s += 60;                              // gibt es hier zu kaufen
    s += categoryScore(item.cats);
    s += Math.min(80, Math.log10(1 + (item.scans || 0)) * 28);
    if (item.per100 && item.per100.kcal) s += 20;

    return s;
  }

  /* Trifft jedes Suchwort? Entscheidet, ob ein eigenes Lebensmittel
     überhaupt in der Trefferliste auftaucht. */
  function matches(item, query) {
    const qt = tokens(query);
    if (!qt.length) return false;
    const nameC = content(tokens(item.name));
    const brandT = tokens(item.brand);
    return qt.every(x =>
      nameC.some(w => wordMatch(x, w) > 0) ||
      brandT.some(w => wordMatch(x, w) > 0) ||
      !!compound(x, nameC));
  }

  function prepare(query) {
    const tk = tokens(query);
    return { norm: norm(query), tokens: tk, content: content(tk) };
  }

  /**
   * Lohnt ein weiterer Anlauf bei Open Food Facts?
   *
   * Nicht die Zahl der Treffer entscheidet das, sondern ihre Güte.
   * Fünfzig Sorten Apfelkuchen sind keine Antwort auf "Apfel" — und
   * solange nur sie im Korb liegen, hat die nächste Runde etwas zu
   * holen. Umgekehrt reicht ein einziger genauer Treffer.
   */
  function needsMore(items, query, opts = {}) {
    const min = opts.min === undefined ? 620 : opts.min;
    const q = prepare(query);
    if (!q.tokens.length) return false;
    if (!items.length) return true;
    let best = -Infinity;
    for (const it of items) {
      const s = score(it, q);
      if (s > best) best = s;
    }
    return best < min;
  }

  /**
   * Sortiert absteigend. min = Punkteschwelle, darunter fliegt der Treffer raus.
   */
  function rank(items, query, opts = {}) {
    const q = prepare(query);
    if (!q.tokens.length) return items.slice();
    const min = opts.min === undefined ? -Infinity : opts.min;
    return items
      .map(it => ({ it, s: score(it, q) }))
      .filter(x => x.s >= min)
      .sort((a, b) => b.s - a.s)
      .map(x => Object.assign({ _score: Math.round(x.s) }, x.it));
  }

  return { rank, matches, needsMore, norm, tokens, lev, score, coverage, stem, compound };
})();

if (typeof module !== 'undefined') module.exports = Rank;
