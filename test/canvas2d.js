/* =========================================================
   canvas2d.js — eine sehr kleine Zeichenfläche für den Prüflauf

   scan-engine.js schneidet, verkleinert und dreht über eine
   Zeichenfläche. In node gibt es keine. Statt die Prüfung um genau
   diesen Teil herumzubauen — und damit ausgerechnet die Geometrie
   ungeprüft zu lassen, in der sich Fehler am leisesten verstecken —
   steht hier das Wenige nach, was gebraucht wird:

     setTransform, translate, rotate, fillRect, drawImage, getImageData

   Gerechnet wird rückwärts: für jeden Zielpunkt wird durch die
   umgekehrte Abbildung nachgesehen, welcher Quellpunkt dort landet,
   und zwischen den Nachbarn gemittelt. Das ist, was ein Browser an
   dieser Stelle auch tut.
   ========================================================= */

class Ctx2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#fff';
    this.setTransform(1, 0, 0, 1, 0, 0);
  }

  setTransform(a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; }

  translate(x, y) {
    const [a, b, c, d, e, f] = this.m;
    this.m = [a, b, c, d, e + a * x + c * y, f + b * x + d * y];
  }

  rotate(rad) {
    const [a, b, c, d, e, f] = this.m;
    const co = Math.cos(rad), si = Math.sin(rad);
    this.m = [a * co + c * si, b * co + d * si, a * -si + c * co, b * -si + d * co, e, f];
  }

  _invert() {
    const [a, b, c, d, e, f] = this.m;
    const det = a * d - b * c;
    if (!det) return null;
    return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
  }

  fillRect(x, y, w, h) {
    const px = this.fillStyle === '#fff' ? 255 : 0;
    const { data, width, height } = this.canvas;
    const [, , , , e, f] = this.m;                 // nur verschoben, nicht gedreht
    const x0 = Math.max(0, Math.round(x + e)), y0 = Math.max(0, Math.round(y + f));
    const x1 = Math.min(width, Math.round(x + e + w)), y1 = Math.min(height, Math.round(y + f + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * width + xx) * 4;
        data[i] = data[i + 1] = data[i + 2] = px;
        data[i + 3] = 255;
      }
    }
  }

  drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) {
    const inv = this._invert();
    if (!inv) return;
    const { data, width, height } = this.canvas;
    const [ia, ib, ic, id, ie, iff] = inv;
    for (let Y = 0; Y < height; Y++) {
      for (let X = 0; X < width; X++) {
        const px = X + 0.5, py = Y + 0.5;
        const u = ia * px + ic * py + ie;          // zurück in die Zielmaße
        const v = ib * px + id * py + iff;
        if (u < dx || v < dy || u >= dx + dw || v >= dy + dh) continue;
        const fx = sx + (u - dx) / dw * sw;
        const fy = sy + (v - dy) / dh * sh;
        const c = sample(src, fx - 0.5, fy - 0.5);
        const i = (Y * width + X) * 4;
        data[i] = data[i + 1] = data[i + 2] = c;
        data[i + 3] = 255;
      }
    }
  }

  getImageData(x, y, w, h) {
    const { data, width } = this.canvas;
    if (x === 0 && y === 0 && w === width && h === this.canvas.height) {
      return { data, width: w, height: h };
    }
    const out = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) {
      const from = ((y + yy) * width + x) * 4;
      out.set(data.subarray(from, from + w * 4), yy * w * 4);
    }
    return { data: out, width: w, height: h };
  }
}

/* Grauwert an einer gebrochenen Stelle, zwischen den Nachbarn gemittelt. */
function sample(img, x, y) {
  const W = img.width, H = img.height, d = img.data;
  if (x < 0) x = 0; else if (x > W - 1) x = W - 1;
  if (y < 0) y = 0; else if (y > H - 1) y = H - 1;
  const xi = x | 0, yi = y | 0;
  const x1 = Math.min(W - 1, xi + 1), y1 = Math.min(H - 1, yi + 1);
  const fx = x - xi, fy = y - yi;
  const at = (px, py) => d[(py * W + px) * 4];
  const top = at(xi, yi) + (at(x1, yi) - at(xi, yi)) * fx;
  const bot = at(xi, y1) + (at(x1, y1) - at(xi, y1)) * fx;
  return (top + (bot - top) * fy) | 0;
}

class Canvas2D {
  constructor(w, h) {
    this._w = 0; this._h = 0;
    this.data = new Uint8ClampedArray(0);
    this.width = w || 1;
    this.height = h || 1;
  }
  get width() { return this._w; }
  set width(v) { this._w = v; this._alloc(); }
  get height() { return this._h; }
  set height(v) { this._h = v; this._alloc(); }
  _alloc() {
    const need = this._w * this._h * 4;
    if (need && this.data.length !== need) this.data = new Uint8ClampedArray(need);
    this._ctx = null;
  }
  getContext() {
    if (!this._ctx) this._ctx = new Ctx2D(this);
    return this._ctx;
  }
}

module.exports = { Canvas2D };
