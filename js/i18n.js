/* =========================================================
   i18n.js — alle Texte an einer Stelle
   Neue Sprache: DICT um einen Block ergänzen, LOCALES um
   einen Eintrag, und in index.html einen Knopf zu #lang-seg.
   ========================================================= */

const I18n = (() => {

  const LOCALES = { de: 'de-DE', en: 'en-GB' };

  const DICT = {
    de: {
      'app.name': 'Zettel',

      'tab.today': 'Heute',
      'tab.history': 'Verlauf',
      'tab.goals': 'Ziele',

      'day.today': 'Heute',
      'day.yesterday': 'Gestern',
      'day.tomorrow': 'Morgen',
      'nav.prevDay': 'Vorheriger Tag',
      'nav.nextDay': 'Nächster Tag',

      'tally.left': 'Übrig',
      'tally.over': 'Darüber',
      'tally.sub': 'von {goal} kcal · {used} gegessen',
      'log.empty': 'Noch nichts eingetragen.',
      'log.emptyFirst': 'Los geht\u2019s.',
      'log.emptyHint': 'Unten auf Eintragen tippen — oder eine Packung scannen. Deine Tagesziele stellst du unter Ziele ein.',
      'receipt.pos': 'POS',

      'macro.protein': 'Eiweiß',
      'macro.carbs': 'Kohlenhydrate',
      'macro.fat': 'Fett',
      'macro.protein.short': 'E',
      'macro.carbs.short': 'KH',
      'macro.fat.short': 'F',
      'macro.protein.abbr': 'Eiweiß',
      'macro.carbs.abbr': 'KH',
      'macro.fat.abbr': 'Fett',

      'action.scan': 'Scannen',
      'action.add': 'Eintragen',
      'action.manual': 'Selbst anlegen',

      'search.placeholder': 'Lebensmittel suchen',
      'search.clear': 'Suche leeren',
      'search.recent': 'Zuletzt eingetragen',
      'search.mine': 'Meine Lebensmittel',
      'search.running': 'Suche läuft …',
      'search.none': 'Nichts gefunden. Leg es dir unten selbst an.',
      'search.offline': 'Die Datenbank hat nicht geantwortet.',
      'search.retry': 'Nochmal versuchen',
      'search.worldwide': 'Weltweit suchen',
      'search.inRegion': 'Treffer aus {region}',
      'search.few': 'Wenig gefunden in {region}. Weltweit suchen?',
      'tag.mine': 'Meins',
      'tag.recent': 'Zuletzt',
      'res.per': 'je 100 {unit}',

      'qty.per100': 'Pro 100 {unit}',
      'qty.save': 'In „Meine Lebensmittel“ merken',
      'qty.delete': 'Löschen',
      'qty.confirm': 'Eintragen',
      'qty.update': 'Ändern',
      'qty.badAmount': 'Bitte eine Menge über 0 eintragen.',
      'toast.added': '{name} eingetragen.',
      'toast.updated': 'Geändert.',
      'toast.deleted': 'Gelöscht.',

      'new.title': 'Neues Lebensmittel',
      'new.note': 'Nährwerte pro 100 g oder 100 ml — so stehen sie auf fast jeder Verpackung.',
      'new.namePlaceholder': 'z. B. Skyr natur',
      'new.save': 'Weiter zur Menge',
      'new.noName': 'Der Name fehlt noch.',
      'field.name': 'Name',
      'field.kcal': 'Kalorien',
      'field.portion': 'Portion',
      'field.portionUnit': 'g je Stück',
      'field.optional': 'optional',
      'food.piece': '1 Stück ({g} g)',
      'off.portion': 'Portion ({label})',
      'off.pack': 'Packung ({g} g)',

      'scan.hint': 'Barcode ins Feld halten',
      'scan.tip': 'Etwas weiter weg halten, bis der Barcode scharf ist — und auf Licht achten.',
      'scan.diag': 'Klappt nicht? Kamera: {info}. Tipp mit auf „Nummer tippen“.',
      'scan.cancel': 'Abbrechen',
      'scan.manual': 'Nummer tippen',
      'scan.prompt': 'Nummer unter dem Barcode eintippen:',
      'scan.found': 'Gefunden: {code} — wird nachgeschlagen …',
      'scan.err.insecure': 'Die Kamera geht nur über HTTPS. Öffne die App über ihre Web-Adresse, nicht als lokale Datei.',
      'scan.err.unsupported': 'Dieser Browser gibt keine Kamera frei. Probier Safari oder Chrome.',
      'scan.err.denied': 'Kamerazugriff ist abgelehnt. In den Einstellungen für diese Seite wieder erlauben.',
      'scan.err.nocamera': 'Keine Kamera gefunden.',
      'scan.err.nodecoder': 'Die Barcode-Erkennung ließ sich nicht laden. Beim ersten Mal braucht sie kurz Internet.',
      'scan.err.generic': 'Die Kamera lässt sich gerade nicht starten.',
      'toast.notFound': 'Dieses Produkt steht nicht in der Datenbank.',
      'toast.lookupFail': 'Nachschlagen fehlgeschlagen — bist du online?',

      'hist.eyebrow': 'Die letzten 30 Tage',
      'hist.title': 'Verlauf',
      'hist.avg': 'Schnitt kcal',
      'hist.days': 'Tage notiert',

      'goals.eyebrow': 'Dein Tagesbudget',
      'goals.title': 'Ziele',
      'goals.noKcal': 'Trag oben dein Kalorienziel ein.',
      'goals.match': 'Deine Makros ergeben {n} kcal — das passt zum Kalorienziel.',
      'goals.diff': 'Deine Makros ergeben {n} kcal, also {d} kcal {dir} als dein Kalorienziel.',
      'goals.more': 'mehr',
      'goals.less': 'weniger',

      'my.title': 'Meine Lebensmittel',
      'my.note': 'Alles, was du von Hand angelegt oder gespeichert hast. Beim Eintragen findest du es sofort über die Suche.',
      'my.empty': 'Noch nichts gespeichert.',
      'my.delete': 'Löschen',

      'lang.title': 'Sprache',
      'region.title': 'Region',
      'region.note': 'Die Suche zeigt zuerst Produkte, die es hier zu kaufen gibt.',
      'region.world': 'Weltweit',

      'data.title': 'Daten',
      'data.note': 'Alles liegt nur auf diesem Gerät. Sicher dir ab und zu eine Kopie — beim Löschen der Website-Daten wäre sonst alles weg.',
      'data.export': 'Kopie sichern',
      'data.import': 'Kopie laden',
      'data.confirmImport': 'Die geladene Kopie ersetzt alles, was gerade in der App steht. Fortfahren?',
      'data.badFile': 'Diese Datei ließ sich nicht lesen.',
      'data.notZettel': 'Das sieht nicht nach einer Zettel-Kopie aus.',
      'toast.imported': 'Kopie geladen.',
      'version': 'Zettel 1.0 · Nährwerte von Open Food Facts (ODbL)'
    },

    en: {
      'app.name': 'Zettel',

      'tab.today': 'Today',
      'tab.history': 'History',
      'tab.goals': 'Goals',

      'day.today': 'Today',
      'day.yesterday': 'Yesterday',
      'day.tomorrow': 'Tomorrow',
      'nav.prevDay': 'Previous day',
      'nav.nextDay': 'Next day',

      'tally.left': 'Left',
      'tally.over': 'Over',
      'tally.sub': 'of {goal} kcal · {used} eaten',
      'log.empty': 'Nothing logged yet.',
      'log.emptyFirst': 'Here we go.',
      'log.emptyHint': 'Tap Add food below — or scan a package. Your daily targets live under Goals.',
      'receipt.pos': 'ITEMS',

      'macro.protein': 'Protein',
      'macro.carbs': 'Carbohydrates',
      'macro.fat': 'Fat',
      'macro.protein.short': 'P',
      'macro.carbs.short': 'C',
      'macro.fat.short': 'F',
      'macro.protein.abbr': 'Protein',
      'macro.carbs.abbr': 'Carbs',
      'macro.fat.abbr': 'Fat',

      'action.scan': 'Scan',
      'action.add': 'Add food',
      'action.manual': 'Add it myself',

      'search.placeholder': 'Search foods',
      'search.clear': 'Clear search',
      'search.recent': 'Recently logged',
      'search.mine': 'My foods',
      'search.running': 'Searching …',
      'search.none': 'Nothing found. Add it yourself below.',
      'search.offline': "The database didn't answer.",
      'search.retry': 'Try again',
      'search.worldwide': 'Search worldwide',
      'search.inRegion': 'Results from {region}',
      'search.few': 'Not much in {region}. Search worldwide?',
      'tag.mine': 'Mine',
      'tag.recent': 'Recent',
      'res.per': 'per 100 {unit}',

      'qty.per100': 'Per 100 {unit}',
      'qty.save': 'Save to My foods',
      'qty.delete': 'Delete',
      'qty.confirm': 'Add',
      'qty.update': 'Update',
      'qty.badAmount': 'Enter an amount above 0.',
      'toast.added': '{name} added.',
      'toast.updated': 'Updated.',
      'toast.deleted': 'Deleted.',

      'new.title': 'New food',
      'new.note': "Nutrition per 100 g or 100 ml — the way it's printed on the packaging.",
      'new.namePlaceholder': 'e.g. plain skyr',
      'new.save': 'Next: amount',
      'new.noName': 'The name is still missing.',
      'field.name': 'Name',
      'field.kcal': 'Calories',
      'field.portion': 'Portion',
      'field.portionUnit': 'g per piece',
      'field.optional': 'optional',
      'food.piece': '1 piece ({g} g)',
      'off.portion': 'Serving ({label})',
      'off.pack': 'Package ({g} g)',

      'scan.hint': 'Hold the barcode inside the frame',
      'scan.tip': 'Move a little further back until the barcode looks sharp — and mind the light.',
      'scan.diag': 'Still nothing? Camera: {info}. Fall back to "Type the number".',
      'scan.cancel': 'Cancel',
      'scan.manual': 'Type the number',
      'scan.prompt': 'Type the number printed under the barcode:',
      'scan.found': 'Found: {code} — looking it up …',
      'scan.err.insecure': 'The camera only works over HTTPS. Open the app at its web address, not as a local file.',
      'scan.err.unsupported': "This browser won't give up the camera. Try Safari or Chrome.",
      'scan.err.denied': 'Camera access is blocked. Allow it again in the settings for this site.',
      'scan.err.nocamera': 'No camera found.',
      'scan.err.nodecoder': "The barcode reader didn't load. The first time round it needs a moment of internet.",
      'scan.err.generic': "The camera won't start right now.",
      'toast.notFound': "This product isn't in the database.",
      'toast.lookupFail': 'Lookup failed — are you online?',

      'hist.eyebrow': 'The last 30 days',
      'hist.title': 'History',
      'hist.avg': 'Avg kcal',
      'hist.days': 'Days logged',

      'goals.eyebrow': 'Your daily budget',
      'goals.title': 'Goals',
      'goals.noKcal': 'Enter your calorie goal above.',
      'goals.match': 'Your macros add up to {n} kcal — that matches your calorie goal.',
      'goals.diff': 'Your macros add up to {n} kcal, {d} kcal {dir} your calorie goal.',
      'goals.more': 'more than',
      'goals.less': 'less than',

      'my.title': 'My foods',
      'my.note': 'Everything you added or saved by hand. It turns up right away when you search.',
      'my.empty': 'Nothing saved yet.',
      'my.delete': 'Delete',

      'lang.title': 'Language',
      'region.title': 'Region',
      'region.note': 'Search puts products sold here at the top.',
      'region.world': 'Worldwide',

      'data.title': 'Data',
      'data.note': 'Everything lives on this device only. Save a copy now and then — clearing website data would wipe it.',
      'data.export': 'Save a copy',
      'data.import': 'Load a copy',
      'data.confirmImport': 'The copy you load replaces everything currently in the app. Continue?',
      'data.badFile': "This file couldn't be read.",
      'data.notZettel': "That doesn't look like a Zettel backup.",
      'toast.imported': 'Copy loaded.',
      'version': 'Zettel 1.0 · Nutrition data from Open Food Facts (ODbL)'
    }
  };

  let lang = Store.lang();
  if (!DICT[lang]) lang = 'de';

  let fmt = makeFormats(lang);

  function makeFormats(l) {
    const loc = LOCALES[l] || 'de-DE';
    return {
      loc,
      n0: new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }),
      n1: new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }),
      date: new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'long' }),
      region: (() => {
        try { return new Intl.DisplayNames([loc], { type: 'region' }); } catch (e) { return null; }
      })(),
      short: new Intl.DateTimeFormat(loc, { weekday: 'short', day: '2-digit', month: '2-digit' })
    };
  }

  /* Ländername in der aktuellen Sprache, z. B. "de" -> "Deutschland" / "Germany" */
  function country(code) {
    if (code === 'world') return t('region.world');
    try { return fmt.region ? fmt.region.of(code.toUpperCase()) : code.toUpperCase(); }
    catch (e) { return code.toUpperCase(); }
  }

  function t(key, vars) {
    let s = (DICT[lang] && DICT[lang][key]);
    if (s === undefined) s = (DICT.de[key] !== undefined ? DICT.de[key] : key);
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return s;
  }

  /* Statische Texte im Markup ersetzen */
  function apply(root = document) {
    root.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    root.querySelectorAll('[data-t-ph]').forEach(el => { el.placeholder = t(el.dataset.tPh); });
    root.querySelectorAll('[data-t-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.tAria)); });
    document.documentElement.lang = lang;
    document.title = t('app.name');
  }

  function set(next) {
    if (!DICT[next] || next === lang) return false;
    lang = next;
    fmt = makeFormats(lang);
    Store.setLang(lang);
    apply();
    return true;
  }

  return {
    t, apply, set, country,
    get lang() { return lang; },
    get fmt() { return fmt; },
    available: Object.keys(DICT)
  };
})();
