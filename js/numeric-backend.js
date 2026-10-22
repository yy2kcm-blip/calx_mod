// Shared decimal arithmetic policy.
export class JsNumberBackend {
  // Literal loading does not normalize. Arithmetic methods, memory writes and
  // display formatting each apply their own measured precision boundary.
  roundWorking(x) { return x; }

  roundSignificant(x, digits = 15) {
    if (!Number.isFinite(x) || x === 0) return x;
    return Number(x.toPrecision(digits));
  }

  add(a, b) { return a + b; }
  sub(a, b) { return a - b; }
  expressionAdd(a, b) { return this.add(a, b); }
  expressionSub(a, b) { return this.sub(a, b); }
  mul(a, b) { return a * b; }
  div(a, b) { return a / b; }
  pow(a, b) { return Math.pow(a, b); }
  sqrt(a) { return Math.sqrt(a); }

  displayRound(x, setup) {
    if (setup.disp === 'Fix') return decimalRoundFixed(x, setup.digits);
    if (setup.disp === 'Sci') return decimalRoundSignificant(x, setup.digits === 0 ? 10 : setup.digits);
    return decimalRoundSignificant(x, 10);
  }
}

// Use each stored Number's shortest decimal spelling for exact add/sub before
// rounding. This is a measured improvement, not a complete Casio BCD model.
export function decimalParts(value) {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
  const negative = mantissa.startsWith('-');
  const digits = negative ? mantissa.slice(1) : mantissa;
  const point = digits.indexOf('.');
  const fraction = point < 0 ? 0 : digits.length - point - 1;
  const coefficient = BigInt(digits.replace('.', '')) * (negative ? -1n : 1n);
  return { coefficient, scale: fraction - Number(exponent) };
}

export function decimalAdd(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a + b;
  const left = decimalParts(a), right = decimalParts(b);
  const scale = Math.max(left.scale, right.scale);
  if (scale - Math.min(left.scale, right.scale) > 1000) return a + b;
  const sum = left.coefficient * 10n ** BigInt(scale - left.scale) +
    right.coefficient * 10n ** BigInt(scale - right.scale);
  return Number(`${sum}e${-scale}`);
}

// Calibrated accumulator: align operands to 16 decimal positions relative to
// the larger operand, truncating each toward zero before addition. The result
// then passes through the existing 15-digit working-result boundary. Applying
// the same rule to explicit and internal sums avoids binary carry before the
// decimal cut. This is a measured approximation, not a firmware reconstruction.
function workingDecimalAdd(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a + b;
  const left = decimalParts(a), right = decimalParts(b);
  const scale = a === 0 || b === 0
    ? Math.max(left.scale, right.scale)
    : 15 - Math.max(decimalExponent(a), decimalExponent(b));
  const align = ({coefficient, scale: sourceScale}) => sourceScale <= scale
    ? coefficient * 10n ** BigInt(scale - sourceScale)
    : coefficient / 10n ** BigInt(sourceScale - scale);
  return truncateCoefficient(align(left) + align(right), scale);
}

// Measured in CMPLX/Norm 2: 1 + 1E-12 retains the increment, while
// 1 + 1E-13, 1 + 1E-14 and 1 - 1E-14 absorb it before later cancellation.
// Additional measured cancellation probes retain a difference 12 decimal
// positions below the operands, but lose differences 13 or more positions
// below them (including short-input products and sqrt-based expressions).
// Model alignment and cancellation separately; retain guard digits in other
// results. This does not imply 13-digit precision for every operation/memory.
export function alignedDecimalAdd(a, b) {
  const add = workingDecimalAdd;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) {
    return add(a, b);
  }
  const exponent = (value) => {
    const {coefficient, scale} = decimalParts(value);
    const magnitude = coefficient < 0n ? -coefficient : coefficient;
    return magnitude.toString().length - 1 - scale;
  };
  const leftExponent = exponent(a), rightExponent = exponent(b);
  if (Math.abs(leftExponent - rightExponent) >= 13) {
    return leftExponent > rightExponent ? a : b;
  }
  const sum = add(a, b);
  if (sum !== 0 && Math.sign(a) !== Math.sign(b) &&
      Math.max(leftExponent, rightExponent) - exponent(sum) >= 13) {
    return 0;
  }
  return sum;
}

function decimalExponent(value) {
  const {coefficient, scale} = decimalParts(value);
  return (coefficient < 0n ? -coefficient : coefficient).toString().length - 1 - scale;
}

function truncateCoefficient(coefficient, scale) {
  const magnitude = coefficient < 0n ? -coefficient : coefficient;
  const drop = Math.max(0, magnitude.toString().length - 15);
  return Number(`${coefficient / 10n ** BigInt(drop)}e${drop - scale}`);
}

// Measured operation results retain 15 decimal digits, with normalization near
// an 11-digit target. The distance must be strictly below 1E-13 at magnitude 1;
// use decimal exponents so this scales correctly across powers of ten.
// This bounded calibration does not claim to reproduce the complete firmware.
function finishArithmetic(value) {
  if (!Number.isFinite(value) || value === 0) return value;
  const {coefficient, scale} = decimalParts(value);
  const cut = truncateCoefficient(coefficient, scale);
  const target = decimalRoundSignificant(cut, 11);
  const delta = decimalAdd(cut, -target);
  if (delta === 0) return cut;
  // Use the pre-normalization magnitude: crossing a power of ten must not
  // enlarge the normalization window. Confirmed by two-sided boundary probes.
  return decimalExponent(cut) - decimalExponent(delta) >= 14
    ? target : cut;
}

function decimalProduct(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) return a * b;
  const left = decimalParts(a), right = decimalParts(b);
  // Cut the decimal product before converting it back to binary Number.
  return truncateCoefficient(left.coefficient * right.coefficient, left.scale + right.scale);
}

function decimalQuotient(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) return a / b;
  const left = decimalParts(a), right = decimalParts(b);
  // Number's shortest decimal coefficient has at most 17 digits. Forty extra
  // places leave enough quotient digits for the 15-digit cut, even at 1 / 1E16.
  const extra = 40;
  const quotient = left.coefficient * 10n ** BigInt(extra) / right.coefficient;
  return truncateCoefficient(quotient, left.scale - right.scale + extra);
}

export class DecimalCandidateBackend extends JsNumberBackend {
  expressionAdd(a, b) { return this.add(a, b); }
  expressionSub(a, b) { return this.sub(a, b); }
  roundSignificant(x, digits = 15) { return super.roundSignificant(x, digits); }
  add(a, b) { return finishArithmetic(alignedDecimalAdd(a, b)); }
  sub(a, b) { return finishArithmetic(alignedDecimalAdd(a, -b)); }
  mul(a, b) { return finishArithmetic(decimalProduct(a, b)); }
  div(a, b) { return finishArithmetic(decimalQuotient(a, b)); }
  pow(a, b) { return finishArithmetic(Math.pow(a, b)); }
  sqrt(a) { return finishArithmetic(Math.sqrt(a)); }
}

export const numeric = new DecimalCandidateBackend();

// Round the stored decimal spelling to a fixed number of places. Half-way
// values round away from zero; avoid binary toFixed tie misclassification.
export function decimalRoundFixed(x, digits) {
  if (!Number.isFinite(x) || x === 0) return x;
  if (!Number.isInteger(digits) || digits < 0 || digits > 100) throw new RangeError('Invalid decimal places');
  const {coefficient, scale} = decimalParts(x);
  if (scale <= digits) return x;
  const divisor = 10n ** BigInt(scale - digits);
  const negative = coefficient < 0n;
  const magnitude = negative ? -coefficient : coefficient;
  let rounded = magnitude / divisor;
  if ((magnitude % divisor) * 2n >= divisor) rounded++;
  return Number((negative ? '-' : '') + rounded + 'e-' + digits);
}

// Display/Rnd rounding in decimal; internal arithmetic keeps its own precision.
export function decimalRoundSignificant(x, digits) {
  if (!Number.isFinite(x) || x === 0) return x;
  if (!Number.isInteger(digits) || digits < 1 || digits > 100) throw new RangeError('Invalid significant digits');
  const {coefficient, scale} = decimalParts(x);
  const negative = coefficient < 0n;
  const magnitude = negative ? -coefficient : coefficient;
  const drop = magnitude.toString().length - digits;
  if (drop <= 0) return x;
  const divisor = 10n ** BigInt(drop);
  let rounded = magnitude / divisor;
  if ((magnitude % divisor) * 2n >= divisor) rounded++;
  return Number((negative ? '-' : '') + rounded + 'e' + (drop - scale));
}
