// Human-readable program text <-> calculator token IDs.
// The Studio deliberately uses the calculator's own symbols so copied programs
// remain useful outside this page and can be pasted back without a private format.

import { K, TOK, tok, bytesOf } from './tokens.js';

const ASCII_ALIASES = [
  ['whileend', 'pWhileEnd'], ['whlend', 'pWhileEnd'],
  ['clrmemory', 'pClrMemory'], ['clrmem', 'pClrMemory'], ['clrstat', 'pClrStat'],
  ['freqoff', 'pFreqOff'], ['freqon', 'pFreqOn'], ['ifend', 'pIfEnd'],
  ['npr', 'nPr'], ['ncr', 'nCr'],
  ['sinh^-1(', 'asinh'], ['cosh^-1(', 'acosh'], ['tanh^-1(', 'atanh'],
  ['sin^-1(', 'asin'], ['cos^-1(', 'acos'], ['tan^-1(', 'atan'],
  ['sqrt(', 'sqrt'], ['cbrt(', 'cbrt'], ['pi', 'pi'],
  ['->', 'pAsg'], ['=>', 'pJump']
];

const AMBIGUOUS_IDS = new Set([
  'neg', 'sub', 'mul', 'div', 'pow', 'EXP',
  'hexA', 'hexB', 'hexC', 'hexD', 'hexE', 'hexF',
  'varA', 'varB', 'varC', 'varD', 'varX', 'varY', 'varM',
  'regA', 'regB', 'regC', 'regR', 'Sn', 'dms', 'degU'
]);

function aliases() {
  const out = ASCII_ALIASES.map(([label, id]) => ({ label, id }));
  for (const [id, spec] of Object.entries(TOK)) {
    const label = spec.s.trim();
    if (AMBIGUOUS_IDS.has(id) || label.length < 2) continue;
    out.push({ label, id });
    // "y with macron" has two Unicode spellings: U+0233 and y+U+0304. The
    // token table keeps the decomposed one, but pages, phone keyboards and
    // most editors produce the precomposed one, so take both.
    const folded = label.normalize('NFC');
    if (folded !== label && folded.length >= 2) out.push({ label: folded, id });
  }
  const seen = new Set();
  return out
    .sort((a, b) => b.label.length - a.label.length)
    .filter(({ label }) => {
      const key = label.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function singleToken(ch, mode, previous) {
  if (ch >= '0' && ch <= '9') return ch;
  if (ch === '.') return '.';
  if (ch === '+') return 'add';
  if (ch === '×' || ch === '*') return 'mul';
  if (ch === '÷' || ch === '/') return 'div';
  if (ch === '^') return 'pow';
  if (ch === '(' || ch === ')' || ch === ',' || ch === ';' || ch === ':') return ch;
  if (ch === '→') return 'pAsg';
  if (ch === '⇒') return 'pJump';
  if (ch === '?' || ch === '◢') return ch === '?' ? 'pIn' : 'pOut';
  if (ch === 'π') return 'pi';
  if (ch === '⌐' || ch === '┘') return 'frac';
  if (ch === '²') return 'sqr';
  if (ch === '³') return 'cube';
  if (ch === '%') return 'pct';
  if (ch === '=') return 'eq';
  if (ch === '≠') return 'ne';
  if (ch === '>') return 'gt';
  if (ch === '<') return 'lt';
  if (ch === '≥') return 'ge';
  if (ch === '≤') return 'le';
  if (ch === 'E') return mode === 'BASE' ? 'hexE' : 'EXP';

  if ('ABCDXYM'.includes(ch)) {
    if (mode === 'BASE' && 'ABCDEF'.includes(ch)) return 'hex' + ch;
    return 'var' + ch;
  }
  if (mode === 'BASE' && 'F'.includes(ch)) return 'hexF';
  if (mode === 'REG' && 'abcr'.includes(ch)) return 'reg' + ch.toUpperCase();
  if ((mode === 'SD' || mode === 'REG') && ch === 'n') return 'Sn';
  if (mode === 'BASE' && 'dhbo'.includes(ch)) return 'base' + ch.toUpperCase();
  if (ch === 'e') return 'napier';
  if (ch === 'i') return 'imag';

  if (ch === '-') {
    const unary = !previous || [K.OPEN, K.SEP, K.INFIX, K.POW, K.FN, K.PRE, K.PROG].includes(previous.k);
    return unary ? 'neg' : 'sub';
  }

  const exact = Object.entries(TOK).find(([id, spec]) =>
    !AMBIGUOUS_IDS.has(id) &&
    (spec.s === ch || spec.s.normalize('NFC') === ch.normalize('NFC')));
  return exact?.[0] || null;
}

/** Parse a copyable Program Studio string into calculator tokens. */
export function parseProgramText(source, mode = 'COMP') {
  // Normalize the pasted text first: a program copied from a web page or a
  // phone spells the statistical symbols in the precomposed Unicode form,
  // while the calculator's own symbol table uses the decomposed one.
  const text = String(source || '').replace(/\r\n?/g, '\n').normalize('NFC');
  const tokenIds = [];
  const errors = [];
  const words = aliases();
  let i = 0;

  const push = (id) => {
    if (id === ':' && tokenIds[tokenIds.length - 1] === ':') return;
    tokenIds.push(id);
  };

  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n') {
      // An output marker is itself a statement separator.
      if (tokenIds.length && tokenIds[tokenIds.length - 1] !== 'pOut') push(':');
      i++;
      continue;
    }
    if (/\s/u.test(ch)) { i++; continue; }

    let matched = false;
    for (const entry of words) {
      const candidate = text.slice(i, i + entry.label.length);
      if (candidate.normalize('NFC').toLocaleLowerCase() !== entry.label.normalize('NFC').toLocaleLowerCase()) continue;
      const next = text[i + entry.label.length] || '';
      if ((entry.id === 'pMplus' || entry.id === 'pMminus') &&
          next && !/[\s:◢→]/u.test(next)) continue;
      // Calculator tokens need no word spaces: Ans², 3⁻¹arg(M and Norm2
      // are valid concatenations, including output from formatProgramText.
      push(entry.id);
      i += entry.label.length;
      matched = true;
      break;
    }
    if (matched) continue;

    const previous = tokenIds.length ? tok(tokenIds[tokenIds.length - 1]) : null;
    const id = singleToken(ch, mode, previous);
    if (id) {
      push(id);
      i += ch === '^' && text[i + 1] === '(' ? 2 : 1;
      continue;
    }

    errors.push({ index: i, character: ch });
    i++;
  }

  if (tokenIds[tokenIds.length - 1] === ':') tokenIds.pop();
  let tokens = [];
  try { tokens = tokenIds.map(tok); }
  catch (error) { errors.push({ index: -1, character: '', message: error.message }); }
  return { tokenIds, tokens, bytes: bytesOf(tokens), errors };
}

/** One calculator statement per line, with native symbols retained. */
export function formatProgramText(tokens) {
  return (tokens || [])
    .map((token, index, list) => token.id === ':' ? '\n' :
      token.id === 'pOut' && index < list.length - 1 && list[index + 1].id !== ':'
        ? token.s + '\n' : token.s)
    .join('')
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
}
