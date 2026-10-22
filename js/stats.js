// stats.js — SD (single variable) and REG (paired variable) calculations.
//
// Samples are stored untransformed.  The regression type decides how x and y
// are mapped before the sums are taken, which is why switching type inside REG
// mode re-derives everything from the same data instead of losing it.

import {decimalParts} from './numeric-backend.js';

export const REG_TYPES = ['Lin', 'Log', 'Exp', 'Pwr', 'Inv', 'Quad', 'AB-Exp'];

const MathErr = () => { const e = new Error('Math ERROR'); e.mathError = true; throw e; };
const frequency = (f) => {
  // Frequencies are weights: physical entry and editing both retain 1.5.
  if (!Number.isFinite(f) || f <= 0) MathErr();
  return f;
};

// Convert an exact decimal ratio only after cancellation has been resolved.
// Keeping twenty quotient digits avoids first overflowing Number(n)/Number(d).
function decimalRatio(n, d, exponent = 0) {
  if (n === 0n) return 0;
  const negative = (n < 0n) !== (d < 0n);
  if (n < 0n) n = -n;
  if (d < 0n) d = -d;
  const places = 20 - (String(n).length - String(d).length);
  const q = places >= 0 ? n * 10n ** BigInt(places) / d : n / (d * 10n ** BigInt(-places));
  return Number(`${negative ? '-' : ''}${q}e${exponent - places}`);
}

function mapX(type, x) {
  if (type === 'Log' || type === 'Pwr') { if (x <= 0) MathErr(); return Math.log(x); }
  if (type === 'Inv') { if (x === 0) MathErr(); return 1 / x; }
  return x;
}
function mapY(type, y) {
  if (type === 'Exp' || type === 'Pwr' || type === 'AB-Exp') {
    if (y <= 0) MathErr();
    return Math.log(y);
  }
  return y;
}

export class StatStore {
  constructor() { this.clear(); }

  clear() { this.clearSamples(); this.type = 'Lin'; }

  // ClrStat deletes data; the selected regression model is a separate setting.
  clearSamples() { this.data = []; }

  get n() { return this.data.reduce((s, d) => s + d.f, 0); }
  get count() { return this.data.length; }

  add(x, y = 0, f = 1) {
    this.data.push({ x, y, f: frequency(f) });
  }
  setFrequencyAt(i, f) { this.data[i].f = frequency(f); }
  removeAt(i) { this.data.splice(i, 1); }

  /**
   * Accumulate sample data.
   *
   * S-SUM, S-VAR and MINMAX always operate on the values the user entered.
   * Non-linear regression coefficients, however, are calculated from the
   * guide's linearised coordinates (ln x, ln y or 1/x). Keep those two views
   * explicit so selecting a regression type never changes the sample stats.
   */
  sums(paired, transformed = false) {
    const t = this.type;
    const s = {
      n: 0, x: 0, x2: 0, y: 0, y2: 0, xy: 0, x3: 0, x4: 0, x2y: 0,
      minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity
    };
    for (const d of this.data) {
      const x = paired && transformed ? mapX(t, d.x) : d.x;
      const y = paired ? (transformed ? mapY(t, d.y) : d.y) : 0;
      const f = d.f;
      s.n += f;
      s.x += f * x; s.x2 += f * x * x; s.x3 += f * x ** 3; s.x4 += f * x ** 4;
      s.y += f * y; s.y2 += f * y * y; s.xy += f * x * y; s.x2y += f * x * x * y;
      s.minX = Math.min(s.minX, x); s.maxX = Math.max(s.maxX, x);
      s.minY = Math.min(s.minY, y); s.maxY = Math.max(s.maxY, y);
    }
    return s;
  }

  // Work with offsets from an actual sample, then centre those offsets.
  // Subtracting two raw squared sums loses the spread of nearby large values.
  // This improves numerical stability without claiming a firmware precision
  // model; raw S-SUM values remain separate.
  moments(paired, transformed = false) {
    if (!this.data.length) MathErr();
    const rows = this.data.map(d => ({
      x: paired && transformed ? mapX(this.type, d.x) : d.x,
      y: paired ? (transformed ? mapY(this.type, d.y) : d.y) : 0,
      f: d.f
    }));
    const originX = rows[0].x, originY = rows[0].y;
    let n = 0, sumX = 0, sumY = 0;
    for (const d of rows) {
      n += d.f;
      sumX += d.f * (d.x - originX);
      sumY += d.f * (d.y - originY);
    }
    const offsetX = sumX / n, offsetY = sumY / n;
    let xx = 0, yy = 0, xy = 0;
    for (const d of rows) {
      const dx = (d.x - originX) - offsetX;
      const dy = (d.y - originY) - offsetY;
      xx += d.f * dx * dx;
      yy += d.f * dy * dy;
      xy += d.f * dx * dy;
    }
    return { n, meanX: originX + offsetX, meanY: originY + offsetY, xx, yy, xy };
  }

  quadraticFit(raw = this.sums(true, true)) {
    // Work in sample-relative coordinates, not x^4 sums. Physical samples
    // (10001,1), (10002,4), (10003,9) determine (x-10000)^2; subtracting the
    // original fourth moments incorrectly makes that full-rank fit singular.
    if (new Set(this.data.map(d => d.x)).size < 3) MathErr();
    // Keep the old raw-moment overflow/underflow boundary. Hardware evidence
    // here covers cancellation in ordinary inputs, not an enlarged range.
    if (this.data.some(d => ![d.x,d.y,d.f].every(Number.isFinite)) ||
        !Object.values(raw).every(Number.isFinite)) MathErr();
    const oldXX=raw.x2-raw.x*raw.x/raw.n;
    const oldXX2=raw.x3-raw.x*raw.x2/raw.n;
    const oldX2X2=raw.x4-raw.x2*raw.x2/raw.n;
    const oldFirst=oldXX*oldX2X2, oldSecond=oldXX2*oldXX2;
    if (![oldXX,oldXX2,oldX2X2,oldFirst,oldSecond].every(Number.isFinite) ||
        (oldXX !== 0 && oldX2X2 !== 0 && oldFirst === 0) ||
        (oldXX2 !== 0 && oldSecond === 0) ||
        this.data.some(d => d.x !== 0 && d.x ** 4 === 0)) MathErr();
    // Decimal integer coordinates preserve exact zeros without an epsilon
    // clamp, including linear/constant fits and genuinely small curvature.
    // This is a local solver repair, not a claim about the firmware's BCD.
    const parts = this.data.map(d => ({x:decimalParts(d.x),y:decimalParts(d.y),f:decimalParts(d.f)}));
    const xs = Math.max(...parts.map(d => d.x.scale));
    const ys = Math.max(...parts.map(d => d.y.scale));
    const fs = Math.max(...parts.map(d => d.f.scale));
    // Finite Number spellings fit within this span; reject malformed imported
    // state before constructing unbounded powers. Live REG has at most 40 rows.
    if (parts.some(d => xs-d.x.scale>640 || ys-d.y.scale>640 || fs-d.f.scale>640)) MathErr();
    const integer = (p, scale) => p.coefficient * 10n ** BigInt(scale - p.scale);
    const originX = integer(parts[0].x, xs), originY = integer(parts[0].y, ys);
    let n=0n, sx=0n, sx2=0n, sx3=0n, sx4=0n, sy=0n, sxy=0n, sx2y=0n;
    for (const d of parts) {
      const x=integer(d.x,xs)-originX, y=integer(d.y,ys)-originY, f=integer(d.f,fs), x2=x*x;
      n+=f; sx+=f*x; sx2+=f*x2; sx3+=f*x2*x; sx4+=f*x2*x2;
      sy+=f*y; sxy+=f*x*y; sx2y+=f*x2*y;
    }
    const xx=n*sx2-sx*sx, xx2=n*sx3-sx*sx2, x2x2=n*sx4-sx2*sx2;
    const xy=n*sxy-sx*sy, x2y=n*sx2y-sx2*sy;
    const den=xx*x2x2-xx2*xx2;
    if (den === 0n) MathErr();
    const bn=xy*x2x2-x2y*xx2, cn=x2y*xx-xy*xx2;
    const an=sy*den-bn*sx-cn*sx2, common=n*den;
    const a=decimalRatio(an+(originY*den-bn*originX+cn*originX*originX)*n,common,-ys);
    const b=decimalRatio(bn-2n*cn*originX,den,xs-ys);
    const c=decimalRatio(cn,den,2*xs-ys);
    return {a,b,c,origin:this.data[0].x,originY:this.data[0].y,scale:1,
      alpha:decimalRatio(an,common,-ys),beta:decimalRatio(bn,den,xs-ys),gamma:c};
  }

  value(name, paired) {
    const s = this.sums(paired);
    if (s.n === 0 && !['Sx', 'Sx2', 'Sy', 'Sy2', 'Sxy', 'Sx3', 'Sx4', 'Sx2y'].includes(name)) {
      MathErr();
    }

    switch (name) {
      case 'n': return s.n;
      case 'Sx': return s.x;
      case 'Sx2': return s.x2;
      case 'Sy': return s.y;
      case 'Sy2': return s.y2;
      case 'Sxy': return s.xy;
      case 'Sx3': return s.x3;
      case 'Sx4': return s.x4;
      case 'Sx2y': return s.x2y;
      case 'xbar': return s.x / s.n;
      case 'ybar': return s.y / s.n;
      case 'xsn': return Math.sqrt(this.moments(paired).xx / s.n);
      case 'ysn': return Math.sqrt(this.moments(paired).yy / s.n);
      case 'xsn1': {
        if (s.n < 2) MathErr();
        return Math.sqrt(this.moments(paired).xx / (s.n - 1));
      }
      case 'ysn1': {
        if (s.n < 2) MathErr();
        return Math.sqrt(this.moments(paired).yy / (s.n - 1));
      }
      case 'minX': return s.minX;
      case 'maxX': return s.maxX;
      case 'minY': return s.minY;
      case 'maxY': return s.maxY;
      default: return this.coef(name, this.sums(true, true));
    }
  }

  coef(name, s) {
    const t = this.type;
    if (t === 'Quad') {
      const { a, b, c } = this.quadraticFit(s);
      if (name === 'a') return a;
      if (name === 'b') return b;
      if (name === 'c') return c;
      MathErr();
    }
    const m = this.moments(true, true);
    if (m.xx === 0) MathErr();
    if (name === 'r') {
      if (m.yy === 0) MathErr();
      return m.xy / Math.sqrt(m.xx * m.yy);
    }
    const b = m.xy / m.xx;
    const a = m.meanY - b * m.meanX;
    if (name === 'a') return t === 'Exp' || t === 'Pwr' || t === 'AB-Exp' ? Math.exp(a) : a;
    if (name === 'b') return t === 'AB-Exp' ? Math.exp(b) : b;
    if (name === 'c') MathErr();
    MathErr();
    return 0;
  }

  /** Estimated values: 'x', 'y', 'x1', 'x2'. */
  estimate(kind, v) {
    const t = this.type;
    const s = this.sums(true, true);
    if (t === 'Quad') {
      const { origin, originY, scale, alpha, beta, gamma } = this.quadraticFit(s);
      if (kind === 'y') {
        const u = (v - origin) / scale;
        return originY + alpha + u * (beta + gamma * u);
      }
      const disc = beta * beta - 4 * gamma * ((originY - v) + alpha);
      if (disc < 0 || gamma === 0) MathErr();
      const rt = Math.sqrt(disc);
      return origin + scale * (kind === 'x1' ? (-beta + rt) / (2 * gamma) : (-beta - rt) / (2 * gamma));
    }
    const a = this.coef('a', s), b = this.coef('b', s);
    if (kind === 'y') {
      switch (t) {
        case 'Lin': return a + b * v;
        case 'Log': { if (v <= 0) MathErr(); return a + b * Math.log(v); }
        case 'Exp': return a * Math.exp(b * v);
        case 'AB-Exp': return a * Math.pow(b, v);
        case 'Pwr': { if (v < 0) MathErr(); return a * Math.pow(v, b); }
        case 'Inv': { if (v === 0) MathErr(); return a + b / v; }
      }
    }
    if (kind === 'x') {
      switch (t) {
        case 'Lin': { if (b === 0) MathErr(); return (v - a) / b; }
        case 'Log': { if (b === 0) MathErr(); return Math.exp((v - a) / b); }
        case 'Exp': { if (v <= 0 || a <= 0 || b === 0) MathErr(); return (Math.log(v) - Math.log(a)) / b; }
        case 'AB-Exp': {
          if (v <= 0 || a <= 0 || b <= 0) MathErr();
          return (Math.log(v) - Math.log(a)) / Math.log(b);
        }
        case 'Pwr': { if (v <= 0 || a <= 0 || b === 0) MathErr(); return Math.exp((Math.log(v) - Math.log(a)) / b); }
        case 'Inv': { if (v === a) MathErr(); return b / (v - a); }
      }
    }
    MathErr();
    return 0;
  }
}
