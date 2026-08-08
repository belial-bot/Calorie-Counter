/* =========================================================
   app.js — Oberfläche und Abläufe
   ========================================================= */

(() => {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const t = I18n.t;
  const nf0 = v => I18n.fmt.n0.format(v);
  const nf1 = v => I18n.fmt.n1.format(v);
  const dfDate  = d => I18n.fmt.date.format(d);
  const dfShort = d => I18n.fmt.short.format(d);

  // Ohne Tausenderpunkt, dafür mit schmalem Leerzeichen: 1 487 statt 1.487
  const bigNum = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');

  const MACROS = [{ k: 'protein' }, { k: 'carbs' }, { k: 'fat' }];

  let day = Store.dayKey();     // angezeigter Tag
  let pending = null;           // Lebensmittel, das gerade eingetragen wird
  let editing = null;           // Eintrag, der gerade geändert wird
  let searchSeq = 0;
  let lastQuery = '';
  let followToday = true;      // springt um Mitternacht mit, bis der Nutzer blättert

  /* ================= Hilfsmittel ================= */

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2400);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function pct(a, b) {
    if (!b) return 0;
    return Math.max(0, Math.min(100, (a / b) * 100));
  }

  function g(v) { return v >= 10 ? nf0(v) : nf1(v); }

  /* ================= Ansicht wechseln ================= */

  function show(view) {
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
    $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.view === view));
    window.scrollTo(0, 0);
    if (view === 'today')   renderToday();
    if (view === 'history') renderHistory();
    if (view === 'goals')   renderGoals();
  }

  $$('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));

  /* ================= Heute ================= */

  function renderToday() {
    const goals = Store.goals();
    const tot = Store.dayTotals(day);
    const list = Store.entries(day);
    const today = Store.dayKey();

    // Kopf
    const d = Store.keyToDate(day);
    $('#day-date').textContent = dfDate(d);
    $('#day-label').textContent =
      day === today ? t('day.today')
      : day === Store.shiftKey(today, -1) ? t('day.yesterday')
      : day === Store.shiftKey(today, 1) ? t('day.tomorrow')
      : String(d.getFullYear());
    $('#day-next').disabled = day >= today;

    // Kalorien
    const left = goals.kcal - tot.kcal;
    const over = left < 0;
    const tally = $('.tally');
    tally.classList.toggle('is-over', over);
    $('#tally-label').textContent = over ? t('tally.over') : t('tally.left');
    $('#kcal-left').textContent = bigNum(Math.abs(left));
    $('#tally-sub').textContent = t('tally.sub', {
      goal: nf0(goals.kcal), used: nf0(Math.round(tot.kcal))
    });
    $('#bar-kcal').style.width = pct(tot.kcal, goals.kcal) + '%';

    // Makros
    MACROS.forEach(m => {
      const row = $(`.macro[data-k="${m.k}"]`);
      const have = tot[m.k], want = goals[m.k];
      row.classList.toggle('is-full', want > 0 && have >= want);
      $('.meter > i', row).style.width = pct(have, want) + '%';
      $('.macro-name', row).textContent = t('macro.' + m.k);
      $('.macro-val b', row).textContent = g(have);
      $('.macro-goal', row).textContent = `/${nf0(want)} g`;
    });

    // Buchungen
    const log = $('#log');
    if (!list.length) {
      log.innerHTML = Store.isFresh()
        ? `<p class="log-empty">${esc(t('log.emptyFirst'))}
             <span class="log-empty-hint">${esc(t('log.emptyHint'))}</span></p>`
        : `<p class="log-empty">${esc(t('log.empty'))}</p>`;
    } else {
      log.innerHTML = list.map(e => {
        const sums = Store.entryTotals(e);
        const macros = MACROS.map(m => `${t('macro.' + m.k + '.short')} ${g(sums[m.k])}`).join(' · ');
        return `<button class="log-row" data-id="${e.id}">
          <span class="log-name">${esc(e.name)}
            <span class="log-sub">${nf0(e.grams)} ${e.unit || 'g'} · ${macros}</span>
          </span>
          <span class="log-kcal">${nf0(Math.round(sums.kcal))}</span>
        </button>`;
      }).join('');
    }

    $('#rc-code').textContent = `${day.replace(/-/g, ' ')} · ${list.length} ${t('receipt.pos')}`;
  }

  $('#day-prev').addEventListener('click', () => { day = Store.shiftKey(day, -1); followToday = false; renderToday(); });
  $('#day-next').addEventListener('click', () => {
    if (day >= Store.dayKey()) return;
    day = Store.shiftKey(day, 1);
    followToday = day === Store.dayKey();
    renderToday();
  });

  $('#log').addEventListener('click', ev => {
    const row = ev.target.closest('.log-row');
    if (!row) return;
    const entry = Store.entries(day).find(e => e.id === row.dataset.id);
    if (entry) openQty(entry, true);
  });

  /* ================= Suchen ================= */

  const sheetAdd = $('#sheet-add');
  const qInput = $('#q');

  function openAdd() {
    sheetAdd.hidden = false;
    qInput.value = '';
    $('#q-clear').hidden = true;
    renderResults(recentFoods(), t('search.recent'));
    setTimeout(() => qInput.focus(), 120);
  }

  function recentFoods() {
    const seen = new Set();
    const out = [];
    let k = Store.dayKey();
    for (let i = 0; i < 21 && out.length < 12; i++) {
      const list = Store.entries(k).slice().reverse();
      for (const e of list) {
        const id = (e.barcode || e.name).toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({
          barcode: e.barcode, name: e.name, brand: e.brand,
          unit: e.unit, per100: e.per100, portions: e.portions || [],
          lastGrams: e.grams, source: 'log'
        });
        if (out.length >= 12) break;
      }
      k = Store.shiftKey(k, -1);
    }
    Store.foods().forEach(f => {
      const id = (f.barcode || f.name).toLowerCase();
      if (!seen.has(id)) { seen.add(id); out.push(Object.assign({ source: 'mine' }, f)); }
    });
    return out;
  }

  /* Alles, was ohne Netz durchsuchbar ist */
  function localFoods() {
    const recent = recentFoods();
    const seen = new Set(recent.map(f => (f.barcode || f.name).toLowerCase()));
    const mine = Store.foods()
      .filter(f => !seen.has((f.barcode || f.name).toLowerCase()))
      .map(f => Object.assign({ source: 'mine' }, f));
    return recent.concat(mine);
  }

  /* Eigene und zuletzt gegessene Lebensmittel, die wirklich zum Begriff passen */
  function localMatches(q) {
    return Rank.rank(localFoods().filter(x => Rank.matches(x, q)), q).slice(0, 6);
  }

  function renderResults(items, heading, opts = {}) {
    const box = $('#results');
    const note = opts.note ? `<p class="res-msg">${esc(opts.note)}</p>` : '';
    const retry = opts.retry
      ? `<button class="btn btn--ghost btn--wide" id="res-retry">${esc(t('search.retry'))}</button>` : '';
    if (!items.length) {
      box.innerHTML = note || `<p class="res-msg">${esc(t('search.none'))}</p>`;
      box.insertAdjacentHTML('beforeend', retry);
      box._items = [];
      return;
    }
    const head = heading ? `<p class="eyebrow" style="margin:.75rem 0 .25rem">${esc(heading)}</p>` : '';
    box.innerHTML = note + retry + head + items.map((f, i) => {
      const tag = heading ? ''
                : f.source === 'mine' ? `<span class="res-tag">${esc(t('tag.mine'))}</span>`
                : f.source === 'log'  ? `<span class="res-tag">${esc(t('tag.recent'))}</span>` : '';
      const sub = f.brand || '';
      return `<button class="res" data-i="${i}">
        <span class="res-name">${esc(f.name)}${tag}
          ${sub ? `<span class="res-sub">${esc(sub)}</span>` : ''}
        </span>
        <span class="res-kcal">${nf0(Math.round(f.per100.kcal))}<span>${esc(t('res.per', { unit: f.unit || 'g' }))}</span></span>
      </button>`;
    }).join('');
    box._items = items;
  }

  $('#results').addEventListener('click', ev => {
    const btn = ev.target.closest('.res');
    if (!btn) return;
    const f = $('#results')._items[Number(btn.dataset.i)];
    if (f) { sheetAdd.hidden = true; openQty(f, false); }
  });

  let searchTimer;
  qInput.addEventListener('input', () => {
    const q = qInput.value.trim();
    $('#q-clear').hidden = !q;
    clearTimeout(searchTimer);
    if (!q) { renderResults(recentFoods(), t('search.recent')); return; }

    const mine = localMatches(q);
    if (mine.length) renderResults(mine, t('search.mine'));
    searchTimer = setTimeout(() => runSearch(q, mine), 380);
  });

  qInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    qInput.blur();                       // Tastatur zu, Platz für die Treffer
    const q = qInput.value.trim();
    if (!q) return;
    // Läuft für genau diesen Begriff schon eine Suche, dann läuft sie.
    // Enter darf sie nicht abwürgen und neu starten.
    if (OFF.running(q) && lastQuery === q) return;
    clearTimeout(searchTimer);
    runSearch(q, localMatches(q));
  });

  $('#q-clear').addEventListener('click', () => {
    qInput.value = '';
    $('#q-clear').hidden = true;
    renderResults(recentFoods(), t('search.recent'));
    qInput.focus();
  });

  async function runSearch(q, mine) {
    const seq = ++searchSeq;
    lastQuery = q;
    $('#results').classList.add('is-busy');
    if (!mine.length) $('#results').innerHTML = `<p class="res-msg">${esc(t('search.running'))}</p>`;

    let found = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      try { found = await OFF.search(q); break; }
      catch (e) {
        if (seq !== searchSeq) return;
        // Kam die Absage im Bruchteil einer Sekunde zurück, war es eine
        // Abfuhr und keine tote Leitung — dann lohnt ein stiller zweiter
        // Anlauf. Hat es lange gedauert, ist wirklich nichts zu holen.
        if (attempt === 0 && Date.now() - started < 4000) {
          await new Promise(r => setTimeout(r, 900));
          if (seq !== searchSeq) return;
          continue;
        }
        break;
      }
    }

    if (seq !== searchSeq) return;
    $('#results').classList.remove('is-busy');

    if (found) {
      // Sortiert wird hier, nicht von der Datenbank: exakter Name vor
      // beiläufiger Erwähnung, häufig Gescanntes vor Karteileichen.
      // min: 0 wirft raus, was kein einziges Suchwort trifft
      renderResults(Rank.rank(mine.concat(found), q, { min: 0 }).slice(0, 30), null);
    } else {
      renderResults(mine, mine.length ? t('search.mine') : null,
        { note: t('search.offline'), retry: true });
    }
  }

  $('#results').addEventListener('click', ev => {
    if (!ev.target.closest('#res-retry')) return;
    if (lastQuery) runSearch(lastQuery, localMatches(lastQuery));
  });

  /* ================= Menge ================= */

  const sheetQty = $('#sheet-qty');
  const amountIn = $('#qty-amount');

  function openQty(food, isEdit) {
    pending = food;
    editing = isEdit ? food : null;

    $('#qty-brand').textContent = food.brand || food.barcode || t('qty.per100', { unit: food.unit || 'g' });
    $('#qty-name').textContent = food.name;
    $('#qty-unit').textContent = food.unit || 'g';
    // Eine 1000-g-Packung ist keine sinnvolle Standardmenge. Nur Angaben,
    // die nach einer Portion aussehen, werden vorgeschlagen.
    const sane = (food.portions || []).find(p => p.grams >= 5 && p.grams <= 400);
    amountIn.value = isEdit ? food.grams
      : food.lastGrams ? food.lastGrams
      : sane ? sane.grams
      : 100;

    // Schnellwahl
    const chips = [];
    (food.portions || []).forEach(p => chips.push({ label: p.label, grams: p.grams }));
    [50, 100, 200].forEach(n => {
      if (!chips.some(c => c.grams === n)) chips.push({ label: n + ' ' + (food.unit || 'g'), grams: n });
    });
    $('#qty-chips').innerHTML = chips.slice(0, 4)
      .map(c => `<button class="chip" data-g="${c.grams}">${esc(c.label)}</button>`).join('');

    $('#qty-savewrap').hidden = isEdit || food.source === 'mine';
    $('#qty-save').checked = false;
    $('#qty-delete').hidden = !isEdit;
    $('#qty-confirm').textContent = isEdit ? t('qty.update') : t('qty.confirm');

    renderPreview();
    sheetQty.hidden = false;
  }

  function renderPreview() {
    if (!pending) return;
    const grams = parseFloat(String(amountIn.value).replace(',', '.')) || 0;
    const f = grams / 100;
    const p = pending.per100;
    $('#qty-preview').innerHTML = `
      <div class="pv"><b>${nf0(Math.round(p.kcal * f))}</b><span>kcal</span></div>` +
      MACROS.map(m => `<div class="pv" data-k="${m.k}"><b>${g(p[m.k] * f)}</b><span>${esc(t('macro.' + m.k + '.abbr'))}</span></div>`).join('');
  }

  amountIn.addEventListener('input', renderPreview);
  amountIn.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#qty-confirm').click(); }
  });

  $('#qty-chips').addEventListener('click', ev => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    amountIn.value = chip.dataset.g;
    renderPreview();
  });

  $('#qty-confirm').addEventListener('click', () => {
    const grams = parseFloat(String(amountIn.value).replace(',', '.')) || 0;
    if (grams <= 0) { toast(t('qty.badAmount')); return; }

    if (editing) {
      Store.updateEntry(day, editing.id, { grams });
      toast(t('toast.updated'));
    } else {
      if ($('#qty-save').checked) {
        Store.saveFood({
          name: pending.name, brand: pending.brand, barcode: pending.barcode,
          unit: pending.unit || 'g', per100: pending.per100, portions: pending.portions || []
        });
      }
      Store.addEntry(day, {
        name: pending.name, brand: pending.brand || '', barcode: pending.barcode || null,
        grams, unit: pending.unit || 'g', per100: pending.per100, portions: pending.portions || []
      });
      toast(t('toast.added', { name: pending.name }));
    }
    sheetQty.hidden = true;
    pending = editing = null;
    renderToday();
  });

  $('#qty-delete').addEventListener('click', () => {
    if (!editing) return;
    Store.removeEntry(day, editing.id);
    sheetQty.hidden = true;
    pending = editing = null;
    renderToday();
    toast(t('toast.deleted'));
  });

  /* ================= Selbst anlegen ================= */

  const sheetNew = $('#sheet-new');

  $('#act-manual').addEventListener('click', () => {
    sheetAdd.hidden = true;
    ['#n-name', '#n-kcal', '#n-protein', '#n-carbs', '#n-fat', '#n-portion'].forEach(s => { $(s).value = ''; });
    $('#n-name').value = qInput.value.trim();
    sheetNew.hidden = false;
    setTimeout(() => $('#n-name').focus(), 120);
  });

  $('#n-save').addEventListener('click', () => {
    const numOf = s => parseFloat(String($(s).value).replace(',', '.')) || 0;
    const name = $('#n-name').value.trim();
    if (!name) { toast(t('new.noName')); return; }
    const portion = numOf('#n-portion');
    const food = {
      name,
      brand: '',
      barcode: null,
      unit: 'g',
      per100: { kcal: numOf('#n-kcal'), protein: numOf('#n-protein'), carbs: numOf('#n-carbs'), fat: numOf('#n-fat') },
      portions: portion > 0 ? [{ label: t('food.piece', { g: nf0(portion) }), grams: portion }] : [],
      source: 'new'
    };
    sheetNew.hidden = true;
    openQty(food, false);
    $('#qty-savewrap').hidden = false;
    $('#qty-save').checked = true;
  });

  /* ================= Scannen ================= */

  const sheetScan = $('#sheet-scan');
  const video = $('#scan-video');

  $('#act-scan').addEventListener('click', startScan);

  async function startScan() {
    sheetScan.hidden = false;
    $('.scan-wrap').classList.remove('is-error');
    $('#scan-hint').textContent = t('scan.hint');
    try {
      await Scanner.start(video, onBarcode);
    } catch (e) {
      const known = ['insecure', 'unsupported', 'denied', 'nocamera', 'nodecoder'];
      $('.scan-wrap').classList.add('is-error');
      $('#scan-hint').textContent = t(known.includes(e.kind) ? 'scan.err.' + e.kind : 'scan.err.generic');
    }
  }

  function stopScan() {
    Scanner.stop(video);
    sheetScan.hidden = true;
  }

  async function onBarcode(code) {
    $('#scan-hint').textContent = t('scan.found', { code });
    stopScan();
    await lookupAndOpen(code);
  }

  async function lookupAndOpen(code) {
    try {
      const food = await OFF.lookup(code);
      if (!food) {
        toast(t('toast.notFound'));
        sheetAdd.hidden = false;
        qInput.value = '';
        renderResults(recentFoods(), t('search.recent'));
        return;
      }
      openQty(food, false);
    } catch (e) {
      toast(t('toast.lookupFail'));
    }
  }

  $('#scan-manual').addEventListener('click', () => {
    stopScan();
    const code = prompt(t('scan.prompt'));
    if (code && code.trim()) lookupAndOpen(code.trim());
  });

  /* ================= Ziele ================= */

  const GOAL_FIELDS = ['kcal', 'protein', 'carbs', 'fat'];

  function renderGoals() {
    const goals = Store.goals();
    GOAL_FIELDS.forEach(k => { $('#g-' + k).value = goals[k]; });
    goalCheck();
    renderMyFoods();
  }

  function goalCheck() {
    const goals = Store.goals();
    const fromMacros = goals.protein * 4 + goals.carbs * 4 + goals.fat * 9;
    const diff = Math.round(fromMacros - goals.kcal);
    const el = $('#goal-check');
    if (!goals.kcal) { el.textContent = t('goals.noKcal'); return; }
    const n = nf0(Math.round(fromMacros));
    el.textContent = Math.abs(diff) <= 40
      ? t('goals.match', { n })
      : t('goals.diff', { n, d: nf0(Math.abs(diff)), dir: t(diff > 0 ? 'goals.more' : 'goals.less') });
  }

  GOAL_FIELDS.forEach(k => {
    $('#g-' + k).addEventListener('input', () => {
      const v = Math.max(0, parseFloat(String($('#g-' + k).value).replace(',', '.')) || 0);
      Store.setGoals({ [k]: v });
      goalCheck();
    });
  });

  function renderMyFoods() {
    const list = Store.foods();
    const box = $('#mylist');
    if (!list.length) {
      box.innerHTML = `<p class="note">${esc(t('my.empty'))}</p>`;
      return;
    }
    box.innerHTML = list.map(f => `<div class="my-row">
      <span class="my-name">${esc(f.name)}</span>
      <span class="my-kcal">${nf0(Math.round(f.per100.kcal))} kcal/100 ${f.unit || 'g'}</span>
      <button class="my-del" data-id="${f.id}" aria-label="${esc(t('my.delete'))}">×</button>
    </div>`).join('');
  }

  $('#mylist').addEventListener('click', ev => {
    const btn = ev.target.closest('.my-del');
    if (!btn) return;
    Store.removeFood(btn.dataset.id);
    renderMyFoods();
  });

  /* ================= Verlauf ================= */

  function renderHistory() {
    const days = Store.recentDays(30);
    const goals = Store.goals();
    const filled = days.filter(d => d.count > 0);
    const avg = filled.length
      ? filled.reduce((s, d) => s + d.totals.kcal, 0) / filled.length : 0;

    $('#hist-summary').innerHTML = `
      <div class="hs"><b>${filled.length ? nf0(Math.round(avg)) : '—'}</b><span>${esc(t('hist.avg'))}</span></div>
      <div class="hs"><b>${filled.length}</b><span>${esc(t('hist.days'))}</span></div>`;

    $('#hist').innerHTML = days.map(d => {
      const kcal = Math.round(d.totals.kcal);
      const cls = !d.count ? 'is-empty' : (kcal > goals.kcal ? 'is-over' : '');
      return `<button class="h-row ${cls}" data-key="${d.key}">
        <span class="h-day">${dfShort(Store.keyToDate(d.key))}</span>
        <span class="meter"><i style="width:${pct(kcal, goals.kcal)}%"></i></span>
        <span class="h-kcal">${d.count ? nf0(kcal) : '–'}</span>
      </button>`;
    }).join('');
  }

  $('#hist').addEventListener('click', ev => {
    const row = ev.target.closest('.h-row');
    if (!row) return;
    day = row.dataset.key;
    followToday = day === Store.dayKey();
    show('today');
    renderToday();
  });

  /* ================= Kopie sichern / laden ================= */

  $('#act-export').addEventListener('click', async () => {
    const json = Store.exportAll();
    const name = `zettel-${Store.dayKey()}.json`;
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  $('#act-import').addEventListener('click', () => $('#file-import').click());

  $('#file-import').addEventListener('change', ev => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (!confirm(t('data.confirmImport'))) return;
        Store.importAll(String(reader.result));
        day = Store.dayKey();
        I18n.set(Store.lang());
        renderAll();
        toast(t('toast.imported'));
      } catch (e) {
        toast(t(e.message === 'NOT_ZETTEL' ? 'data.notZettel' : 'data.badFile'));
      }
    };
    reader.readAsText(file);
    ev.target.value = '';
  });

  /* ================= Sheets schließen ================= */

  document.addEventListener('click', ev => {
    const closer = ev.target.closest('[data-close]');
    if (!closer) return;
    const sheet = closer.closest('.sheet');
    if (!sheet) return;
    if (sheet.id === 'sheet-scan') stopScan();
    else sheet.hidden = true;
  });

  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    const open = $$('.sheet').filter(s => !s.hidden).pop();
    if (!open) return;
    if (open.id === 'sheet-scan') stopScan(); else open.hidden = true;
  });

  $('#act-add').addEventListener('click', openAdd);

  /* ================= Sprache ================= */

  function renderRegion() {
    const sel = $('#region-select');
    const cur = Store.region();
    sel.innerHTML = Store.REGIONS
      .map(r => `<option value="${r}"${r === cur ? ' selected' : ''}>${esc(I18n.country(r))}</option>`)
      .join('');
  }

  $('#region-select').addEventListener('change', ev => {
    Store.setRegion(ev.target.value);
    renderRegion();
  });

  function renderLang() {
    $$('#lang-seg .seg-btn').forEach(b =>
      b.classList.toggle('is-on', b.dataset.lang === I18n.lang));
  }

  function renderAll() {
    I18n.apply();
    renderLang();
    renderRegion();
    renderToday();
    renderGoals();
    renderHistory();
  }

  $('#lang-seg').addEventListener('click', ev => {
    const btn = ev.target.closest('.seg-btn');
    if (!btn) return;
    if (I18n.set(btn.dataset.lang)) renderAll();
  });

  /* ================= Start ================= */

  // Tageswechsel merken, falls die App über Mitternacht offen bleibt
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (followToday) day = Store.dayKey();
    renderToday();
  });

  I18n.apply();
  renderLang();
  renderRegion();
  renderToday();

  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;   // erste Installation nicht neu laden
      reloaded = true;
      window.location.reload();
    });
  }

})();
