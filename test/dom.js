/* =========================================================
   dom.js — gerade so viel Browser, dass app.js läuft

   node hat kein Dokument. Statt eine ganze Bibliothek
   mitzuschleppen, steht hier das Stück davon, das die App
   anfasst: ein Baum aus index.html und die Handvoll
   Eigenschaften, die der Code liest und setzt.

   Wie test/canvas2d.js beim Scanner: nachgebaut ist nur die
   Zeichenfläche, geprüft wird der echte Code.
   ========================================================= */

/* ---------- Ein sehr kleiner HTML-Leser ---------- */

const VOID = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'path']);

function parse(html) {
  const root = el('#root');
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z0-9-]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s">]+))?)*)\s*(\/?)>/g;
  let m, at = 0;
  const flush = upto => {
    const raw = html.slice(at, upto);
    at = upto;
    if (raw) stack[stack.length - 1]._text += unescape(raw);
  };
  while ((m = re.exec(html))) {
    flush(m.index);
    at = re.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    const [, close, tag, attrText, selfClose] = m;
    const name = tag.toLowerCase();
    if (close) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === name) { stack.length = i; break; }
      }
      continue;
    }
    const node = el(name);
    for (const a of attrText.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+)))?/g)) {
      if (!a[1]) continue;
      node.setAttribute(a[1].toLowerCase(), a[2] !== undefined ? a[2] : (a[3] !== undefined ? a[3] : (a[4] || '')));
    }
    stack[stack.length - 1].appendChild(node);
    if (!selfClose && !VOID.has(name)) stack.push(node);
  }
  flush(html.length);
  return root;
}

function unescape(s) {
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) =>
    ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }[e]));
}

/* ---------- Das Element ---------- */

function el(tag) {
  const node = {
    tag,
    attrs: {},
    children: [],
    parent: null,
    _text: '',
    _html: '',
    _listeners: {},
    value: '',
    checked: false,
    disabled: false,
    style: {},
    options: [],

    get hidden() { return this.attrs.hidden !== undefined; },
    set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; },

    get textContent() {
      return this._text + this.children.map(c => c.textContent).join('');
    },
    set textContent(v) { this._text = String(v); this.children = []; this._html = ''; },

    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = String(v);
      // Für die Tests reicht der Baum daraus; Text bleibt der Rohtext.
      const sub = parse(this._html);
      this.children = sub.children;
      this.children.forEach(c => { c.parent = this; });
    },

    get className() { return this.attrs.class || ''; },
    set className(v) { this.attrs.class = String(v); },

    get dataset() {
      const d = {};
      for (const k of Object.keys(this.attrs)) {
        if (!k.startsWith('data-')) continue;
        d[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = this.attrs[k];
      }
      return d;
    },

    classList: null,

    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    hasAttribute(k) { return this.attrs[k] !== undefined; },

    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    focus() {},
    blur() {},
    scrollIntoView() {},
    click() { this.dispatch('click', { target: this }); },

    addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      this._listeners[type] = (this._listeners[type] || []).filter(f => f !== fn);
    },
    dispatch(type, ev) {
      const e = Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, ev || {});
      (this._listeners[type] || []).forEach(fn => fn.call(this, e));
      return e;
    },

    closest(sel) {
      let n = this;
      while (n) { if (matches(n, sel)) return n; n = n.parent; }
      return null;
    },
    querySelector(sel) { return find(this, sel, true)[0] || null; },
    querySelectorAll(sel) { return find(this, sel, false); },
    get firstElementChild() { return this.children[0] || null; }
  };

  node.classList = {
    contains: c => (node.attrs.class || '').split(/\s+/).includes(c),
    add(...cs) {
      const set = new Set((node.attrs.class || '').split(/\s+/).filter(Boolean));
      cs.forEach(c => set.add(c));
      node.attrs.class = [...set].join(' ');
    },
    remove(...cs) {
      const set = new Set((node.attrs.class || '').split(/\s+/).filter(Boolean));
      cs.forEach(c => set.delete(c));
      node.attrs.class = [...set].join(' ');
    },
    toggle(c, on) {
      const has = node.classList.contains(c);
      const want = on === undefined ? !has : !!on;
      if (want) node.classList.add(c); else node.classList.remove(c);
      return want;
    }
  };

  if (tag.startsWith('#')) node.tag = 'root';
  return node;
}

/* ---------- Auswählen ----------
   Getragen wird, was app.js braucht: "#id", ".klasse", "tag",
   "[attr]", "tag[attr=\"wert\"]" und die beiden Kombinationen
   ".a .b" (irgendwo darunter) und ".a > b" (direkt darunter). */

function matchSimple(node, sel) {
  const parts = sel.match(/^([a-zA-Z0-9-]+)?((?:[.#][\w-]+|\[[^\]]+\])*)$/);
  if (!parts) return false;
  if (parts[1] && node.tag !== parts[1].toLowerCase()) return false;
  for (const bit of parts[2].match(/[.#][\w-]+|\[[^\]]+\]/g) || []) {
    if (bit[0] === '.') { if (!node.classList.contains(bit.slice(1))) return false; }
    else if (bit[0] === '#') { if (node.attrs.id !== bit.slice(1)) return false; }
    else {
      const a = bit.slice(1, -1).match(/^([^=]+)(?:=["']?([^"']*)["']?)?$/);
      if (!a) return false;
      if (node.attrs[a[1]] === undefined) return false;
      if (a[2] !== undefined && node.attrs[a[1]] !== a[2]) return false;
    }
  }
  return true;
}

function matches(node, sel) {
  return sel.split(',').some(s => matchSimple(node, s.trim()));
}

function walk(node, fn) {
  node.children.forEach(c => { fn(c); walk(c, fn); });
}

function find(root, sel, first) {
  const out = [];
  for (const one of sel.split(',')) {
    const steps = one.trim().split(/\s+/);
    let level = [root];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step === '>') continue;
      const direct = steps[i - 1] === '>';
      const next = [];
      level.forEach(n => {
        if (direct) n.children.forEach(c => { if (matchSimple(c, step)) next.push(c); });
        else walk(n, c => { if (matchSimple(c, step)) next.push(c); });
      });
      level = next;
    }
    level.forEach(n => { if (!out.includes(n)) out.push(n); });
    if (first && out.length) break;
  }
  return out;
}

/* ---------- Die Umgebung aufbauen ---------- */

function install(html) {
  const root = parse(html);
  const documentElement = el('html');
  const body = root.querySelector('body') || root;

  const document = {
    documentElement,
    body,
    title: '',
    querySelector: sel => root.querySelector(sel),
    querySelectorAll: sel => root.querySelectorAll(sel),
    getElementById: id => root.querySelector('#' + id),
    createElement: tag => el(tag),
    addEventListener() {},
    removeEventListener() {},
    dispatch: (type, ev) => root.dispatch(type, ev),
    _root: root,
    get visibilityState() { return 'visible'; }
  };

  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear()
  };

  const define = (name, value) =>
    Object.defineProperty(global, name, { value, writable: true, configurable: true });

  define('document', document);
  define('localStorage', localStorage);
  // Ohne Schlüssel "serviceWorker" überspringt die App den ganzen
  // Block — wie in einem Browser, der ihn nicht kennt.
  define('navigator', { language: 'de-DE', languages: ['de-DE'] });
  define('location', { href: 'http://localhost/', reload() {}, protocol: 'http:' });
  define('window', {
    addEventListener() {}, removeEventListener() {},
    scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    document, localStorage, navigator: global.navigator, location: global.location,
    setTimeout, clearTimeout, requestAnimationFrame: fn => setTimeout(fn, 0)
  });
  define('self', global.window);
  define('alert', () => {});
  define('confirm', () => true);

  return { document, root, el };
}

module.exports = { install, parse, el };
