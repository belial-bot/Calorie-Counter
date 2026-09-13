/* =========================================================
   barcode-image.js — Barcodes malen, wie sie im Regal aussehen

   Für den Prüflauf: ein EAN-13 wird aus den Ziffern erzeugt und in
   ein Bild gezeichnet, das man verbiegen, verwackeln, beschatten und
   verrauschen kann. Damit lässt sich ohne Kamera und ohne Packung
   nachmessen, was der Leser aushält.

   Die Fehler sind den echten nachgebaut:

   curve    zylindrische Wölbung — eine Flasche, eine Dose. Zum Rand
            hin werden die Striche schmaler, weil sie schräg zur
            Blickrichtung stehen.
   wrinkle  eine Falte: die Striche werden örtlich gestaucht und
            gedehnt. Das ist der Fehler, an dem Breitenmessung stirbt.
   blur     unscharf, weil die Kamera zu nah dran ist.
   glare    ein Glanzfleck auf der Folie.
   shadow   halb im Schatten — der Fall, an dem ein einziger
            Schwellwert fürs ganze Bild scheitert.
   noise    wenig Licht.
   ========================================================= */

const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

/** Prüfziffer zu zwölf Ziffern. */
function checkDigit(twelve) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+twelve[i]) * (i % 2 ? 3 : 1);
  return String((10 - sum % 10) % 10);
}

/** Zwölf oder dreizehn Ziffern hinein, Strichmuster und volle Nummer heraus. */
function ean13(code) {
  if (code.length === 12) code += checkDigit(code);
  const par = PARITY[+code[0]];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? L : G)[+code[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[+code[i]];
  bits += '101';
  return { code, bits };
}

/** Immer dieselben Zufallszahlen — ein Prüflauf soll nicht würfeln. */
function seeded(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function randomCode(rnd) {
  let d = '';
  for (let i = 0; i < 12; i++) d += Math.floor(rnd() * 10);
  return d;
}

function boxBlur(buf, W, H, r) {
  r = Math.max(1, Math.round(r));
  const tmp = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += buf[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = sum / (2 * r + 1);
      sum += buf[y * W + Math.min(W - 1, x + r + 1)] - buf[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      buf[y * W + x] = sum / (2 * r + 1);
      sum += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
}

/**
 * Malt den Code in ein ImageData-artiges Objekt.
 * opts: width, height, module (Bildpunkte je Modul), barH (Anteil der
 * Höhe), angle (Grad), curve, wrinkle, wrinkleLen, blur, noise,
 * contrast, glare, shadow, cx, cy, quiet (Module Ruhezone), seed.
 */
function render(code, o = {}) {
  const rnd = seeded(o.seed || 1);
  const W = o.width || 960, H = o.height || 540;
  const { bits } = ean13(code);
  const quiet = o.quiet == null ? 8 : o.quiet;
  const modules = bits.length + 2 * quiet;
  const m = o.module || 3;
  const bw = modules * m;
  const bh = Math.round(H * (o.barH || 0.45));
  const ang = (o.angle || 0) * Math.PI / 180;
  const ca = Math.cos(-ang), sa = Math.sin(-ang);
  const cx = W * (o.cx == null ? 0.5 : o.cx), cy = H * (o.cy == null ? 0.5 : o.cy);
  const wrinkleA = (o.wrinkle || 0) * m;
  const wrinkleL = (o.wrinkleLen || 40) * m;
  const phiMax = (o.curve || 0) * 1.2;
  const Rad = phiMax > 1e-6 ? (bw / 2) / Math.sin(phiMax) : 0;

  const S = 3;                                   // Überabtastung: weiche Kanten wie in echt
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S - 0.5 - cx;
          const py = y + (sy + 0.5) / S - 0.5 - cy;
          let u = px * ca - py * sa;
          const v = px * sa + py * ca;
          if (Math.abs(v) > bh / 2) { acc += 1; continue; }
          if (Rad) {
            if (Math.abs(u) >= Rad) { acc += 1; continue; }
            u = Rad * Math.asin(u / Rad);
          }
          if (wrinkleA) u += wrinkleA * Math.sin(2 * Math.PI * u / wrinkleL + v * 0.01);
          const idx = Math.floor(u / m + modules / 2) - quiet;
          if (idx < 0 || idx >= bits.length) { acc += 1; continue; }
          acc += bits[idx] === '1' ? 0 : 1;
        }
      }
      out[y * W + x] = (acc / (S * S)) * 255;
    }
  }

  if (o.blur) boxBlur(out, W, H, o.blur);

  const contrast = o.contrast == null ? 1 : o.contrast;
  const glare = o.glare || 0, shadow = o.shadow || 0;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 128 + (out[y * W + x] - 128) * contrast;
      if (glare) {
        const dx = (x - W * 0.62) / (W * 0.22), dy = (y - H * 0.42) / (H * 0.3);
        v += (255 - v) * Math.exp(-(dx * dx + dy * dy)) * glare;
      }
      if (shadow) {
        v *= 1 - shadow * Math.max(0, Math.min(1, (x / W - 0.35) * 2.2));
      }
      if (o.noise) v += (rnd() - 0.5) * 2 * o.noise;
      const i = (y * W + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

module.exports = { render, ean13, checkDigit, seeded, randomCode };
