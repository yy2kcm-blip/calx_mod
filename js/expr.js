// expr.js — number model, parser and evaluator.
//
// The parser is recursive descent laid out in exactly the priority order the
// user's guide prints (1 = tightest):
//   1 parenthetical functions   2 postfix / ^( / xroot( / %   3 fractions
//   4 prefix (-) and base tags  5 statistical estimated values
//   6 nPr nCr ∠                 7 omitted × before explicit × ÷           8 + -
//   9 relational               10 and                        11 or xor xnor

import { K } from './tokens.js';
import { numeric } from './numeric-backend.js';

export class CalcError extends Error {
  constructor(kind, at = -1) {
    super(kind + ' ERROR');
    this.kind = kind;
    this.at = at;
  }
}
const err = (kind, at) => { throw new CalcError(kind, at); };

// ---------------------------------------------------------------------------
// Values are always complex; the imaginary part is 0 for real results.
export const C = (re, im = 0) => ({ re, im });
export const isReal = (z) => Math.abs(z.im) < 1e-300;
export const asComplex = (value) => typeof value === 'number' ? C(value) : C(value.re, value.im);

/** Working precision through the active backend (historical function name). */
export function r15(x) {
  return numeric.roundWorking(x);
}
// Keep real memories as Numbers for existing modes, and retain both parts in CMPLX.
export function storedValue(value) {
  const z = asComplex(value);
  const re = numeric.roundSignificant(z.re), im = numeric.roundSignificant(z.im);
  return im === 0 ? re : C(re, im);
}
const rz = (z) => C(r15(z.re), r15(z.im));

const cadd = (a, b) => C(numeric.expressionAdd(a.re, b.re), numeric.expressionAdd(a.im, b.im));
const csub = (a, b) => C(numeric.expressionSub(a.re, b.re), numeric.expressionSub(a.im, b.im));
const cmul = (a, b) => C(
  numeric.sub(numeric.mul(a.re, b.re), numeric.mul(a.im, b.im)),
  numeric.add(numeric.mul(a.re, b.im), numeric.mul(a.im, b.re))
);
function cdiv(a, b) {
  // Axis denominators use direct division. Squaring them in the general
  // formula changes calibrated guard digits and can introduce extra overflow.
  if (b.im === 0) {
    if (b.re === 0) err('Math');
    return C(numeric.div(a.re, b.re), numeric.div(a.im, b.re));
  }
  if (b.re === 0) return C(numeric.div(a.im, b.im), -numeric.div(a.re, b.im));
  const d = numeric.add(numeric.mul(b.re, b.re), numeric.mul(b.im, b.im));
  if (d === 0) err('Math');
  return C(
    numeric.div(numeric.add(numeric.mul(a.re, b.re), numeric.mul(a.im, b.im)), d),
    numeric.div(numeric.sub(numeric.mul(a.im, b.re), numeric.mul(a.re, b.im)), d)
  );
}
// A result that has drifted onto the axes by less than the unit's 15-digit
// working resolution is put back on them, so 5∠90 is 5i and not
// 3.061616998e-16+5i.
function snapAxis(z) {
  const scale = Math.max(Math.abs(z.re), Math.abs(z.im));
  if (scale === 0) return z;
  const tol = scale * 1e-14;
  return C(Math.abs(z.re) < tol ? 0 : z.re, Math.abs(z.im) < tol ? 0 : z.im);
}

const cabs = (z) => Math.hypot(z.re, z.im);
const carg = (z) => Math.atan2(z.im, z.re);

// ---------------------------------------------------------------------------
// Angle handling
const ANG = { Deg: Math.PI / 180, Rad: 1, Gra: Math.PI / 200 };
const toRad = (x, unit) => x * ANG[unit];
const fromRad = (x, unit) => x / ANG[unit];

// ---------------------------------------------------------------------------
// Base-n word sizes.  The guide gives 10 binary digits, 10 octal digits and a
// 32-bit signed decimal/hex range, so each base has its own word width.
export const WORD_BITS = { 2: 10, 8: 30, 10: 32, 16: 32 };

export function wrapWord(n, base) {
  const bits = WORD_BITS[base] || 32;
  const m = 2 ** bits;
  let v = ((Math.trunc(n) % m) + m) % m;
  if (v >= m / 2) v -= m;
  return v;
}
export function toWord(n, base) {
  const bits = WORD_BITS[base] || 32;
  const m = 2 ** bits;
  return ((Math.trunc(n) % m) + m) % m;
}

// ---------------------------------------------------------------------------
// Parser
class Parser {
  constructor(tokens, ctx) {
    this.ts = tokens;
    this.i = 0;
    this.ctx = ctx;
    this.depth = 0;
  }
  peek(o = 0) { return this.ts[this.i + o]; }
  next() { return this.ts[this.i++]; }
  at(kind) { const t = this.peek(); return t && t.k === kind; }
  isId(...ids) { const t = this.peek(); return t && ids.includes(t.id); }

  parse() {
    if (!this.ts.length) err('Syntax', 0);
    const v = this.pOr();
    if (this.i < this.ts.length) {
      const t = this.peek();
      if (t.k === K.CONV) { this.next(); return { t: 'conv', conv: t.conv, a: v }; }
      err('Syntax', this.i);
    }
    return v;
  }

  binaryLevel(nextFn, prio) {
    let left = nextFn.call(this);
    for (;;) {
      const t = this.peek();
      if (!t || t.k !== K.INFIX || t.p !== prio) return left;
      this.next();
      const right = nextFn.call(this);
      left = { t: 'bin', f: t.f, a: left, b: right, at: this.i };
    }
  }

  pOr() { return this.binaryLevel(this.pAnd, 11); }
  pAnd() { return this.binaryLevel(this.pRel, 10); }
  pRel() { return this.binaryLevel(this.pAdd, 9); }
  pAdd() { return this.binaryLevel(this.pMul, 8); }

  // Explicit multiplication/division stay left-associative. Juxtaposed
  // factors bind within each operand before explicit multiplication/division.
  pMul() { return this.binaryLevel(this.pImplicit, 7); }

  pImplicit() {
    let left = this.pPerm();
    while (this.startsImplicitFactor()) {
      left = { t: 'bin', f: 'mul', a: left, b: this.pPerm(), at: this.i };
    }
    return left;
  }

  // The multiplication sign may be dropped before a parenthesis, a
  // parenthetical function, a variable, a constant or a base tag.
  startsImplicitFactor() {
    const t = this.peek();
    if (!t) return false;
    if (t.k === K.OPEN || t.k === K.FN) return true;
    if (t.k === K.CONST) return true;
    if (t.k === K.PRE && t.base) return true;
    return false;
  }

  pPerm() { return this.binaryLevel(this.pEst, 6); }

  pEst() {
    let v = this.pUnary();
    while (this.at(K.EST)) {
      const t = this.next();
      v = { t: 'est', est: t.est, a: v };
    }
    return v;
  }

  pUnary() {
    const t = this.peek();
    // Measured: SUB can negate a number, function or another negative operand
    // after ADD as well as SUB: 3+-2 = 1, 3+-sqrt(4) = 1, 3+-[NEG]2 = 5.
    // Keep unary priority below squaring.
    // Measured: 3++2 = 5 and 3-+2 = 1.
    if (t && t.id === 'add') {
      this.next();
      return this.pUnary();
    }
    if (t && t.id === 'sub') {
      this.next();
      return { t: 'neg', a: this.pUnary() };
    }
    if (t && t.k === K.PRE) {
      this.next();
      if (t.base) return { t: 'based', base: t.base, a: this.pUnary() };
      return { t: 'neg', a: this.pUnary() };
    }
    return this.pFrac();
  }

  pFrac() {
    const parts = [this.pPower()];
    while (this.at(K.FRAC)) { this.next(); parts.push(this.pPower()); }
    if (parts.length === 1) return parts[0];
    if (parts.length > 3) err('Syntax', this.i);
    return { t: 'frac', parts };
  }

  pPower() {
    let v = this.pAtom();
    for (;;) {
      const t = this.peek();
      if (t && t.id === 'dms') {
        // {degrees}°{minutes}°{seconds}° — each element is its own atom
        this.next();
        const parts = [v];
        while (parts.length < 3 && this.at(K.DIGIT)) {
          parts.push(this.pAtom());
          if (this.isId('dms')) this.next();
          else break;
        }
        v = { t: 'dmsval', parts };
      } else if (t && t.k === K.POST) {
        this.next();
        v = { t: 'post', f: t.f, a: v };
      } else if (t && t.k === K.POW) {
        this.next();
        const arg = this.parenBody(1)[0];
        v = { t: 'bin', f: t.f, a: v, b: arg };
      } else {
        return v;
      }
    }
  }

  // Reads arguments up to the matching ')'.  A closing parenthesis at the very
  // end of the input may be omitted, as on the real machine.
  parenBody(minArgs, maxArgs = minArgs) {
    const args = [];
    if (this.i >= this.ts.length) err('Syntax', this.i);
    for (;;) {
      args.push(this.pOr());
      const t = this.peek();
      if (t && t.k === K.SEP && t.s === ',') { this.next(); continue; }
      break;
    }
    const t = this.peek();
    if (t && t.k === K.CLOSE) this.next();
    else if (this.i < this.ts.length) err('Syntax', this.i);
    if (args.length < minArgs || args.length > maxArgs) err('Arg', this.i);
    return args;
  }

  pAtom() {
    const t = this.peek();
    if (!t) err('Syntax', this.i);

    if (t.k === K.DIGIT) return this.number();

    if (t.k === K.OPEN) {
      this.next();
      const v = this.parenBody(1, 1)[0];
      return v;
    }

    if (t.k === K.FN) {
      this.next();
      let args;
      if (t.f === 'log') args = this.parenBody(1, 2);
      else if (t.f === 'Pol' || t.f === 'Rec') args = this.parenBody(2, 2);
      else args = this.parenBody(1, 1);
      return { t: 'call', f: t.f, args };
    }

    if (t.k === K.CONST) {
      this.next();
      return { t: 'val', tok: t };
    }

    err('Syntax', this.i);
    return null;
  }

  number() {
    let s = '';
    let expPart = null;
    while (this.at(K.DIGIT)) {
      const t = this.next();
      if (t.id === 'EXP') {
        if (expPart !== null) err('Syntax', this.i);
        expPart = '';
        // EXP accepts the subtraction key too; consecutive negative signs
        // cancel (measured 1 EXP [NEG] [NEG] 2 = 100).
        let negative = false;
        while (this.isId('neg') || this.isId('sub') || this.isId('add')) {
          if (this.next().id !== 'add') negative = !negative;
        }
        expPart = negative ? '-' : '';
        continue;
      }
      if (t.id === '.' && (expPart !== null || s.includes('.'))) err('Syntax', this.i - 1);
      if (expPart !== null) expPart += t.s;
      else s += t.s;
    }
    if (s === '' && expPart === null) err('Syntax', this.i);
    // EXP requires exponent digits, including when a negative sign was entered.
    if (expPart !== null && !/^-?\d+$/.test(expPart)) err('Syntax', this.i);
    // A bare decimal point is a zero mantissa on the physical calculator.
    return { t: 'num', s: s === '.' ? '0' : (s || '1'), exp: expPart };
  }
}

export function parse(tokens, ctx) {
  const ast = new Parser(tokens, ctx).parse();
  // fx-50FH II physical probes: six nested i values succeed; seven produce
  // Stack ERROR. Related-model five-value limits do not match this device.
  const numericLimit = ctx.mode === 'CMPLX' ? 6 : 10;
  if (numericStackNeed(ast) > numericLimit || commandStackPeak(tokens) > 24) err('Stack');
  return ast;
}

// Values are evaluated left-to-right. While the right operand is evaluated,
// the completed left value remains on the numeric stack. This reproduces the
// five occupied numeric slots in the guide's stack illustration.
function numericStackNeed(node) {
  if (!node) return 0;
  if (node.t === 'num' || node.t === 'val') return 1;
  if (node.t === 'bin') {
    return Math.max(numericStackNeed(node.a), 1 + numericStackNeed(node.b));
  }
  const children = node.args || node.parts || (node.a ? [node.a] : []);
  let peak = 1;
  children.forEach((child, i) => { peak = Math.max(peak, i + numericStackNeed(child)); });
  return peak;
}

// Priority-aware operator scan for the calculator's 24-level command stack.
// Parenthetical function tokens include their opening parenthesis and occupy a
// single command slot, matching the key-operation storage model.
function commandStackPeak(tokens) {
  const stack = [];
  let peak = 0;
  const note = () => { peak = Math.max(peak, stack.length); };
  const pushOp = (p) => {
    while (stack.length && !stack[stack.length - 1].open && stack[stack.length - 1].p <= p) stack.pop();
    stack.push({ p });
    note();
  };
  for (const t of tokens) {
    if (t.k === K.OPEN || t.k === K.FN || t.k === K.POW) {
      stack.push({ open: true });
      note();
    } else if (t.k === K.CLOSE) {
      while (stack.length && !stack[stack.length - 1].open) stack.pop();
      if (stack.length) stack.pop();
    } else if (t.k === K.SEP) {
      while (stack.length && !stack[stack.length - 1].open) stack.pop();
    } else if (t.k === K.INFIX) {
      pushOp(t.p);
    } else if (t.k === K.FRAC) {
      pushOp(3);
    } else if (t.k === K.PRE) {
      stack.push({ p: 4 });
      note();
    } else if (t.k === K.POST || t.k === K.EST || t.k === K.CONV) {
      peak = Math.max(peak, stack.length + 1);
    }
  }
  return peak;
}

// ---------------------------------------------------------------------------
// Evaluator
//
// ctx supplies:
//   mode 'COMP'|'CMPLX'|'BASE'|'SD'|'REG'|'PRGM'
//   angle 'Deg'|'Rad'|'Gra'
//   base  (BASE mode only)
//   vars  {A,B,C,D,X,Y,M}
//   ans   value
//   sci(key), stat(name), est(kind, value)
//   fvars {a,b,c,r,t,v,ρ,θ}
//   fixDigits / sciDigits / dispMode  (for Rnd)

const FACT_MAX = 69;

export function evaluate(node, ctx) {
  return checkedEvaluate(node, ctx, true);
}

function checkedScalar(value) {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e100) err('Math');
  return Math.abs(value) < 1e-99 ? 0 : value;
}

function checkedEvaluate(node, ctx, final) {
  const z = evaluateNode(node, ctx);
  if (!z) err('Math');
  const re = checkedScalar(z.re), im = checkedScalar(z.im);
  if (final && ctx.mode === 'BASE') {
    const bits = WORD_BITS[ctx.base] || 32;
    if (!Number.isInteger(z.re) || z.re < -(2 ** (bits - 1)) || z.re > 2 ** (bits - 1) - 1) err('Math');
  }
  // Measured: (1E-99 / 10) * 10 and (1E-99 / 10) * 1E99 both
  // return zero. Flush underflow at each evaluated step, before its parent
  // operation can amplify it. Copy rather than mutate a referenced value.
  return { ...z, re, im };
}

function coordinateResult(x, y, ctx) {
  // Validate both outputs before committing either memory. Apply the same
  // range/underflow policy as the returned value, preserving working digits.
  // Otherwise Pol overflow leaves an invalid X after Math ERROR, and tiny
  // Rec components can disagree with the zero returned in Ans.
  const checkedX = checkedScalar(x), checkedY = checkedScalar(y);
  ctx.setVar('X', checkedX); ctx.setVar('Y', checkedY);
  return C(checkedX);
}

function evaluateNode(node, ctx) {
  const E = (n) => checkedEvaluate(n, ctx, false);
  const real = (n) => {
    const z = E(n);
    if (!isReal(z)) err('Math');
    return z.re;
  };

  switch (node.t) {
    case 'num': {
      if (ctx.mode === 'BASE') return C(parseBaseDigits(node.s, ctx.base));
      let x = Number(node.s === '' ? '0' : node.s);
      if (node.exp !== null && node.exp !== undefined && node.exp !== '') {
        x = Number(node.s + 'e' + node.exp);
      } else if (node.exp === '') {
        x = Number(node.s);
      }
      if (!isFinite(x)) err('Math');
      return C(x);
    }

    case 'based':
      return C(parseBaseDigits(collectDigits(node.a), node.base));

    case 'val': return valueOf(node.tok, ctx);

    case 'neg': {
      const z = E(node.a), result = C(-z.re, -z.im);
      if (z.complexFraction) result.complexFraction = { ...z.complexFraction };
      return result;
    }

    case 'frac': {
      const values = node.parts.length === 2 ? node.parts.map(E) : null;
      // Physical CMPLX probe: (3+6i) [a b/c] 3 = 1+2i. A two-part
      // fraction with complex operands follows ordinary complex division.
      // Three-part mixed fractions still require real elements; their
      // complex sign convention has not been physically established.
      if (values && values.some((z) => !isReal(z))) {
        const [a, b] = values;
        if (b.re === 0 && b.im === 0) err('Math');
        return complexOperationResult(cdiv(a, b), [a, b]);
      }
      const p = values ? values.map((z) => z.re) : node.parts.map(real);
      if (p.some((x) => !Number.isInteger(x))) {
        // non-integer elements degrade to a plain division, as documented
        return C(p.length === 2 ? p[0] / p[1] : p[0] + p[1] / p[2]);
      }
      if (p.length === 2) {
        if (p[1] === 0) err('Math');
        return C(r15(p[0] / p[1]));
      }
      if (p[2] === 0) err('Math');
      const sign = p[0] < 0 ? -1 : 1;
      return C(r15(sign * (Math.abs(p[0]) + p[1] / p[2])));
    }

    case 'dmsval': {
      const p = node.parts.map((x) => real(x));
      const d = p[0], m = p[1] || 0, s = p[2] || 0;
      if (m < 0 || s < 0) err('Math');
      return C(r15(dmsToDecimal(d, m, s)));
    }

    case 'post': return postfix(node.f, node, ctx, E, real);

    case 'bin': return binary(node.f, node, ctx, E, real);

    case 'call': return callFn(node.f, node.args, ctx, E, real);

    case 'est': {
      const x = real(node.a);
      return C(ctx.est(node.est, x));
    }

    case 'conv': {
      const z = E(node.a);
      z.forceFormat = node.conv;
      return z;
    }
  }
  err('Syntax');
  return null;
}

function collectDigits(node) {
  if (node.t === 'num') return node.s;
  err('Syntax');
  return '';
}

export function parseBaseDigits(s, base) {
  if (!s.length) err('Syntax');
  const digits = '0123456789ABCDEF'.slice(0, base);
  let v = 0;
  for (const ch of s) {
    const d = digits.indexOf(ch.toUpperCase());
    if (d < 0) err('Syntax');
    v = v * base + d;
  }
  if (base === 10) {
    if (v > 2 ** 31 - 1) err('Math');
    return v;
  }
  if (v >= 2 ** WORD_BITS[base]) err('Math');
  return wrapWord(v, base);
}

function valueOf(t, ctx) {
  if (t.id === 'pi') return C(3.14159265358980);
  if (t.id === 'napier') return C(2.71828182845904);
  if (t.id === 'Ans') {
    const z = ctx.ans ? C(ctx.ans.re, ctx.ans.im) : C(0);
    if (ctx.ans?.complexFraction) z.complexFraction = { ...ctx.ans.complexFraction };
    return z;
  }
  if (t.id === 'Ran') return C(Math.floor(Math.random() * 1000) / 1000);
  if (t.id === 'imag') {
    if (ctx.mode !== 'CMPLX') err('Syntax');
    return C(0, 1);
  }
  if (t.v) return asComplex(ctx.vars[t.v] || 0);
  if (t.sci) return C(ctx.sci(t.sci));
  if (t.fv) return C(ctx.fvars ? (ctx.fvars[t.fv] || 0) : 0);
  if (t.stat) return C(ctx.stat(t.stat));
  err('Syntax');
  return null;
}

function axisAwareCube(z) {
  // Dedicated cube on a pure axis bypasses the separately normalized square.
  // Explicit z²×z still follows the two-operation path, as measured on hardware.
  if (z.im === 0) return C(numeric.pow(z.re, 3));
  if (z.re === 0) return C(0, -numeric.pow(z.im, 3));
  return cmul(cmul(z, z), z);
}

function postfix(f, node, ctx, E, real) {
  if (f === 'sqr') { const z = E(node.a); return rz(cmul(z, z)); }
  if (f === 'cube') { const z = E(node.a); return rz(axisAwareCube(z)); }
  if (f === 'recip') {
    const z = E(node.a);
    if (z.re === 0 && z.im === 0) err('Math');
    return complexOperationResult(cdiv(C(1), z), [z]);
  }
  if (f === 'fact') {
    const x = real(node.a);
    if (!Number.isInteger(x) || x < 0 || x > FACT_MAX) err('Math');
    let r = 1;
    for (let i = 2; i <= x; i++) r *= i;
    return C(r15(r));
  }
  if (f === 'pct') return C(r15(real(node.a) / 100));
  if (f === 'toDeg') return C(r15(fromRad(toRad(real(node.a), 'Deg'), ctx.angle)));
  if (f === 'toRad') return C(r15(fromRad(real(node.a), ctx.angle)));
  if (f === 'toGra') return C(r15(fromRad(toRad(real(node.a), 'Gra'), ctx.angle)));
  if (f === 'dms') return E(node.a);
  err('Syntax');
  return null;
}

// Presentation hint only: measured complex division/reciprocal results use
// fractions even when the imaginary component cancels. Literal a+bi entry
// does not. Extension to other complex powers is an inferred display model.
// The hint is intentionally not stored in Ans or numeric variables.
function complexOperationResult(value, operands, introduceFraction = true) {
  const z = rz(value);
  const introduce = introduceFraction && operands.some((operand) => !isReal(operand));
  z.complexFraction = Object.fromEntries(['re', 'im'].map((part) =>
    [part, introduce || operands.some((operand) => operand.complexFraction?.[part])]));
  return z;
}

function complexSumResult(value, a, b) {
  const z = rz(value);
  // Measured: adding real 0.1 changes only the real component to decimal;
  // adding integer 0 preserves both fractions. Other sums/differences use
  // this inferred per-component rule until further physical calibration.
  z.complexFraction = Object.fromEntries(['re', 'im'].map((part) => [part,
    Boolean(a.complexFraction?.[part] || b.complexFraction?.[part]) &&
    [a, b].every((operand) => operand.complexFraction?.[part] || Number.isInteger(operand[part]))
  ]));
  return z;
}

function complexProductResult(a, b) {
  const z = rz(cmul(a, b));
  // Follow ac-bd and ad+bc so presentation moves with the contributing
  // components. Multiplication by i is physically measured; the general
  // mixed-product propagation remains an inferred presentation model.
  const term = (p, q) => ({
    value: numeric.mul(a[p], b[q]),
    fraction: a[p] !== 0 && b[q] !== 0 &&
      Boolean(a.complexFraction?.[p] || b.complexFraction?.[q]) &&
      (a.complexFraction?.[p] || Number.isInteger(a[p])) &&
      (b.complexFraction?.[q] || Number.isInteger(b[q]))
  });
  const combine = (terms) => terms.some((t) => t.fraction) &&
    terms.every((t) => t.fraction || Number.isInteger(t.value));
  z.complexFraction = {
    re: combine([term('re', 're'), term('im', 'im')]),
    im: combine([term('re', 'im'), term('im', 're')])
  };
  return z;
}

function binary(f, node, ctx, E, real) {
  if (f === 'add' || f === 'sub' || f === 'mul' || f === 'div') {
    const a = E(node.a), b = E(node.b);
    if (ctx.mode === 'BASE') {
      const x = a.re, y = b.re;
      let v;
      if (f === 'add') v = x + y;
      else if (f === 'sub') v = x - y;
      else if (f === 'mul') v = x * y;
      else { if (y === 0) err('Math', node.at); v = Math.trunc(x / y); }
      const bits = WORD_BITS[ctx.base] || 32;
      const min = -(2 ** (bits - 1));
      const max = 2 ** (bits - 1) - 1;
      if (v < min || v > max) err('Math');
      return C(Math.trunc(v));
    }
    if (f === 'add') return complexSumResult(cadd(a, b), a, b);
    if (f === 'sub') return complexSumResult(csub(a, b), a, b);
    if (f === 'mul') return complexProductResult(a, b);
    if (b.re === 0 && b.im === 0) err('Math', node.at);
    return complexOperationResult(cdiv(a, b), [a, b]);
  }
  if (f === 'pow') {
    const a = E(node.a), b = E(node.b);
    if (a.re === 0 && a.im === 0 && b.re === 0 && b.im === 0) err('Math');
    if (!isReal(b)) err('Math');
    if (isReal(a)) {
      if (a.re < 0 && !Number.isInteger(b.re)) {
        // In CMPLX the result is the principal value, so (-1)^0.5 is i.
        if (ctx.mode === 'CMPLX') {
          const r = numeric.pow(-a.re, b.re);
          if (!isFinite(r)) err('Math');
          const th = Math.PI * b.re;
          const q = th / (Math.PI / 2);
          if (Math.abs(q - Math.round(q)) < 1e-12) {
            const k = ((Math.round(q) % 4) + 4) % 4;
            const c = [1, 0, -1, 0][k], s = [0, 1, 0, -1][k];
            return rz(C(r * c, r * s));
          }
          return rz(snapAxis(C(r * Math.cos(th), r * Math.sin(th))));
        }
        // A reduced odd denominator admits a real result. The numerator's
        // parity determines its sign; 2/5 must give a positive result.
        const fraction = toFraction(b.re, 15);
        if (!fraction || fraction.d % 2 === 0 ||
            Math.abs(fraction.sign * fraction.n / fraction.d - b.re) > 1e-12) err('Math');
        const sign = fraction.n % 2 === 0 ? 1 : -1;
        const value = sign * numeric.pow(-a.re, b.re);
        if (!Number.isFinite(value)) err('Math');
        return C(r15(value));
      }
      const v = numeric.pow(a.re, b.re);
      if (!isFinite(v)) err('Math');
      return C(r15(v));
    }
    // Physical generic-power probes accept 2, 3 and -1, but reject 0, 1,
    // 4 and -2. A domain limited to the three supported operations is the
    // current INFERRED model; other exponents still need physical measurements.
    // Algebraic operations avoid log/exp introducing a false real/imaginary
    // component for a purely imaginary base. Do not clamp small components.
    if (b.re === 2) return complexOperationResult(cmul(a, a), [a]);
    if (b.re === 3) return complexOperationResult(axisAwareCube(a), [a]);
    if (b.re === -1) return complexOperationResult(cdiv(C(1), a), [a]);
    err('Math');
  }
  if (f === 'xroot') {
    const m = real(node.a), n = E(node.b);
    if (m === 0) err('Math');
    if (!isReal(n)) err('Math');
    if (n.re < 0) {
      if (!Number.isInteger(m) || m % 2 === 0) err('Math');
      return C(r15(-numeric.pow(-n.re, 1 / m)));
    }
    return C(r15(numeric.pow(n.re, 1 / m)));
  }
  if (f === 'nPr' || f === 'nCr') {
    const n = real(node.a), r = real(node.b);
    if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || n >= 1e10 || r < 0 || r > n) err('Math');
    if (f === 'nCr') {
      const k = Math.min(r, n - r);
      // Symmetry avoids forming a factorial-sized numerator when the answer
      // is small. With n >= 2k each factor (n-k+i)/i is >= 2, so
      // C(n,k) >= 2^k. Since 2^333 > 1E100, no representable answer is lost
      // by rejecting k >= 333 before entering the loop.
      if (k >= 333) err('Math');
      const limit = 10n ** 100n;
      let value = 1n;
      for (let i = 1; i <= k; i++) {
        // This is C(n-k+i,i): every division is exact, and the sequence is
        // nondecreasing. No factorial or binary intermediate can overflow.
        value = value * BigInt(n - k + i) / BigInt(i);
        if (value >= limit) err('Math');
      }
      return C(r15(Number(value)));
    }
    let v = 1;
    for (let i = 0; i < r; i++) {
      v *= (n - i);
      // All factors are positive integers. Once the product leaves the
      // calculator's range it cannot recover, so huge r cannot block the UI.
      if (!isFinite(v) || v >= 1e100) err('Math');
    }
    return C(r15(v));
  }
  if (f === 'angle') {
    if (ctx.mode !== 'CMPLX') err('Syntax');
    const r = real(node.a), th = toRad(real(node.b), ctx.angle);
    // Right angles land exactly on an axis, as they do on the unit.
    const q = th / (Math.PI / 2);
    if (Math.abs(q - Math.round(q)) < 1e-12) {
      const k = ((Math.round(q) % 4) + 4) % 4;
      const c = [1, 0, -1, 0][k], s = [0, 1, 0, -1][k];
      return rz(C(r * c, r * s));
    }
    return rz(snapAxis(C(r * Math.cos(th), r * Math.sin(th))));
  }
  if (f === 'eq' || f === 'ne') {
    const a = E(node.a), b = E(node.b);
    const equal = a.re === b.re && a.im === b.im;
    return C((f === 'eq' ? equal : !equal) ? 1 : 0);
  }
  if (['gt', 'lt', 'ge', 'le'].includes(f)) {
    const a = real(node.a), b = real(node.b);
    const ok = { eq: a === b, ne: a !== b, gt: a > b, lt: a < b, ge: a >= b, le: a <= b }[f];
    return C(ok ? 1 : 0);
  }
  if (['and', 'or', 'xor', 'xnor'].includes(f)) {
    const base = ctx.mode === 'BASE' ? ctx.base : 10;
    const a = toWord(real(node.a), base), b = toWord(real(node.b), base);
    const bits = WORD_BITS[base] || 32;
    let v = 0;
    for (let i = 0; i < bits; i++) {
      const x = Math.floor(a / 2 ** i) % 2, y = Math.floor(b / 2 ** i) % 2;
      let r;
      if (f === 'and') r = x & y;
      else if (f === 'or') r = x | y;
      else if (f === 'xor') r = x ^ y;
      else r = 1 - (x ^ y);
      v += r * 2 ** i;
    }
    return C(wrapWord(v, base));
  }
  err('Syntax');
  return null;
}

function callFn(f, args, ctx, E, real) {
  const one = () => E(args[0]);
  const oneR = () => real(args[0]);

  switch (f) {
    case 'sin': case 'cos': case 'tan': {
      const z = one();
      if (!isReal(z)) err('Math');
      const limit = ctx.angle === 'Deg' ? 9e9
        : ctx.angle === 'Gra' ? 1e10 : 157079632.7;
      if (Math.abs(z.re) >= limit) err('Math');
      const x = toRad(z.re, ctx.angle);
      if (f === 'tan') {
        const q = z.re / (ctx.angle === 'Deg' ? 90 : ctx.angle === 'Gra' ? 100 : Math.PI / 2);
        if (Math.abs(q - Math.round(q)) < 1e-12 && Math.round(q) % 2 !== 0) err('Math');
      }
      return C(r15(Math[f](x)));
    }
    case 'asin': case 'acos': {
      const x = oneR();
      if (Math.abs(x) > 1) err('Math');
      return C(r15(fromRad(Math[f](x), ctx.angle)));
    }
    case 'atan': return C(r15(fromRad(Math.atan(oneR()), ctx.angle)));
    case 'sinh': {
      const x = oneR();
      if (Math.abs(x) >= 230.2585092) err('Math');
      return C(r15(Math.sinh(x)));
    }
    case 'cosh': {
      const x = oneR();
      if (Math.abs(x) >= 230.2585092) err('Math');
      return C(r15(Math.cosh(x)));
    }
    case 'tanh': return C(r15(Math.tanh(oneR())));
    case 'asinh': return C(r15(Math.asinh(oneR())));
    case 'acosh': { const x = oneR(); if (x < 1) err('Math'); return C(r15(Math.acosh(x))); }
    case 'atanh': { const x = oneR(); if (Math.abs(x) >= 1) err('Math'); return C(r15(Math.atanh(x))); }
    case 'log': {
      if (args.length === 2) {
        const b = real(args[0]), x = real(args[1]);
        if (b <= 0 || b === 1 || x <= 0) err('Math');
        return C(r15(Math.log(x) / Math.log(b)));
      }
      const x = oneR();
      if (x <= 0) err('Math');
      return C(r15(Math.log10(x)));
    }
    case 'ln': { const x = oneR(); if (x <= 0) err('Math'); return C(r15(Math.log(x))); }
    case 'exp10': {
      const x = oneR();
      if (x >= 100) err('Math');
      const v = numeric.pow(10, x);
      if (!isFinite(v)) err('Math');
      return C(r15(v));
    }
    case 'expe': {
      const x = oneR();
      if (x >= 230.2585092) err('Math');
      const v = Math.exp(x);
      if (!isFinite(v)) err('Math');
      return C(r15(v));
    }
    case 'sqrt': {
      const z = one();
      if (isReal(z)) {
        if (z.re < 0) {
          if (ctx.mode !== 'CMPLX') err('Math');
          return C(0, r15(numeric.sqrt(-z.re)));
        }
        return C(r15(numeric.sqrt(z.re)));
      }
      err('Math');
      return null;
    }
    case 'cbrt': return C(r15(Math.cbrt(oneR())));
    case 'Abs': { const z = one(); return C(r15(cabs(z))); }
    case 'arg': {
      if (ctx.mode !== 'CMPLX') err('Syntax');
      const z = one();
      if (z.re === 0 && z.im === 0) err('Math');
      // Unary negation can produce -0i; the measured negative real axis is +180°.
      const angle = z.im === 0 && z.re < 0 ? Math.PI : carg(z);
      return C(r15(fromRad(angle, ctx.angle)));
    }
    case 'Conjg': { const z = one(); return C(z.re, -z.im); }
    case 'Pol': {
      const x = real(args[0]), y = real(args[1]);
      const r = r15(Math.hypot(x, y));
      const th = r15(fromRad(Math.atan2(y, x), ctx.angle));
      return coordinateResult(r, th, ctx);
    }
    case 'Rec': {
      const r = real(args[0]), th = toRad(real(args[1]), ctx.angle);
      const x = r15(r * Math.cos(th)), y = r15(r * Math.sin(th));
      return coordinateResult(x, y, ctx);
    }
    case 'Rnd': return C(ctx.roundToDisplay(oneR()));
    case 'Not': {
      const base = ctx.mode === 'BASE' ? ctx.base : 10;
      const bits = WORD_BITS[base] || 32;
      return C(wrapWord(2 ** bits - 1 - toWord(oneR(), base), base));
    }
    case 'Neg': {
      const base = ctx.mode === 'BASE' ? ctx.base : 10;
      return C(wrapWord(-oneR(), base));
    }
  }
  err('Syntax');
  return null;
}

// ---------------------------------------------------------------------------
// Sexagesimal helpers used by the °′″ key and the decimal/DMS toggle.
export function dmsToDecimal(d, m, s) {
  const sign = d < 0 ? -1 : 1;
  return sign * (Math.abs(d) + m / 60 + s / 3600);
}
export function decimalToDms(x) {
  const sign = x < 0 ? -1 : 1;
  let v = Math.abs(x);
  let d = Math.floor(v);
  let rest = (v - d) * 60;
  let m = Math.floor(rest + 1e-9);
  let s = (rest - m) * 60;
  s = Math.round(s * 100) / 100;
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; d += 1; }
  return { d: d * sign, m, s, sign };
}

// Decimal -> fraction, used when toggling a result to fraction form.
export function toFraction(x, maxElems = 10) {
  if (!isFinite(x)) return null;
  const sign = x < 0 ? -1 : 1;
  let v = Math.abs(x);
  let bestN = 0, bestD = 1;
  let h1 = 1, h2 = 0, k1 = 0, k2 = 1, b = v;
  for (let i = 0; i < 32; i++) {
    const a = Math.floor(b);
    const h = a * h1 + h2, k = a * k1 + k2;
    if (k > 1e9) break;
    h2 = h1; h1 = h; k2 = k1; k1 = k;
    bestN = h; bestD = k;
    if (Math.abs(h / k - v) < 1e-11 * Math.max(1, v)) break;
    const f = b - a;
    if (f < 1e-12) break;
    b = 1 / f;
  }
  if (!bestD || Math.abs(bestN / bestD - v) > 1e-9 * Math.max(1, v)) return null;
  const int = Math.floor(bestN / bestD);
  const num = bestN - int * bestD;
  const elems = (int ? String(int).length + 1 : 0) + String(num || bestN).length +
    String(bestD).length + 1;
  if (elems > maxElems) return null;
  return { sign, n: bestN, d: bestD, int, num };
}
