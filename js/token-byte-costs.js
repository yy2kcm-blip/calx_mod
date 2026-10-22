// Program token storage costs, independent of display spelling.
const LEGACY_ONE_BYTE_IDS = `
  0 1 2 3 4 5 6 7 8 9 . EXP hexA hexB hexC hexD hexE hexF
  pi napier imag varA varB varC varD varX varY varM
  ( ) , ; : sqr cube fact dms degU radU graU pct neg
  baseD baseH baseB baseO frac add sub mul div nPr nCr angle
  eq ne gt lt ge le Sn regA regB regC regR estY
  pIn pAsg pOut pJump
`.trim().split(/\s+/);

const LEGACY_TWO_BYTE_IDS = `
  Ans Ran sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh
  log ln exp10 expe sqrt cbrt Abs arg Conjg Pol Rec Rnd Not Neg
  recip pow xroot and or xor xnor Sx2 Sx Sy2 Sy Sxy Sx2y Sx3 Sx4
  xbar xsn xsn1 ybar ysn ysn1 minX maxX minY maxY estX estX1 estX2
  toRect toPolar pGoto pLbl pIf pThen pElse pIfEnd pFor pTo pStep
  pNext pWhile pWhileEnd pBreak pDeg pRad pGra pFix pSci pNorm
  pFreqOn pFreqOff pClrMemory pClrStat pMplus pMminus pDec pHex
  pBin pOct pDT
`.trim().split(/\s+/);

export const LEGACY_BYTE_COST = Object.freeze(Object.fromEntries([
  ...LEGACY_ONE_BYTE_IDS.map((id) => [id, 1]),
  ...LEGACY_TWO_BYTE_IDS.map((id) => [id, 2])
]));


const STORAGE_COST = Object.freeze({ ...LEGACY_BYTE_COST,
  "(": 1,
  "0": 1,
  "1": 1,
  "2": 1,
  "3": 1,
  ":": 1,
  "Abs": 1,
  "Ans": 1,
  "Conjg": 1,
  "Rnd": 1,
  "add": 1,
  "arg": 1,
  "cube": 1,
  "exp10": 1,
  "imag": 1,
  "neg": 1,
  "pAsg": 1,
  "pFix": 1,
  "pIn": 1,
  "pMminus": 1,
  "pNorm": 1,
  "pOut": 1,
  "pWhile": 1,
  "pWhileEnd": 1,
  "recip": 1,
  "sin": 1,
  "sqrt": 1,
  "sub": 1,
  "tan": 1,
  "varA": 1,
  "varB": 1,
  "varD": 1,
  "varM": 1,
  "varX": 1,
  "varY": 1,
});
export function byteCost(id) { return STORAGE_COST[id] ?? inputByteCost(id); }
export function inputByteCost(id) {
  if (Object.hasOwn(LEGACY_BYTE_COST, id)) return LEGACY_BYTE_COST[id];
  if (id.startsWith("CONST_") || id.startsWith("fv_")) return id.startsWith("fv_") ? 1 : 2;
  throw new Error(`missing byte cost for token ${id}`);
}
