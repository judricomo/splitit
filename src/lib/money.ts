// All money is an integer in minor units. No floats anywhere.

/** ISO 4217 exponents, with COP treated as 0 decimals (spec §4.1 recommendation). */
const EXPONENTS: Record<string, number> = {
  COP: 0,
  CLP: 0,
  JPY: 0,
  KRW: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
  MXN: 2,
  BRL: 2,
  ARS: 2,
  CAD: 2,
  AUD: 2,
  CHF: 2,
};

export const SUPPORTED_CURRENCIES = Object.keys(EXPONENTS).sort();

export function exponentFor(code: string): number {
  return EXPONENTS[code.toUpperCase()] ?? 2;
}

export function formatMinor(
  amountMinor: number,
  currency: string,
  exponent: number,
  opts: { signed?: boolean | undefined; abs?: boolean | undefined } = {},
): string {
  const value = (opts.abs ? Math.abs(amountMinor) : amountMinor) / 10 ** exponent;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(value);
  if (opts.signed && amountMinor > 0) return `+${formatted}`;
  return formatted;
}

/** Parse user input ("120.500" / "1,200.50") into minor units. Returns null if invalid. */
export function parseToMinor(input: string, exponent: number): number | null {
  const cleaned = input.replace(/[\s,]/g, "").trim();
  if (cleaned === "") return null;
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [whole = "0", frac = ""] = cleaned.replace("-", "").split(".");
  const padded = (frac + "0".repeat(exponent)).slice(0, exponent);
  const digits = `${whole || "0"}${padded}`.replace(/^0+(?=\d)/, "");
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Minor units -> plain editable string, e.g. 33333 with exponent 2 -> "333.33". */
export function minorToInput(amountMinor: number, exponent: number): string {
  if (exponent === 0) return String(amountMinor);
  const negative = amountMinor < 0;
  const digits = String(Math.abs(amountMinor)).padStart(exponent + 1, "0");
  const whole = digits.slice(0, digits.length - exponent);
  const frac = digits.slice(digits.length - exponent);
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Percentages are stored as integer basis points: 100% = 10000. */
export function parseToBasisPoints(input: string): number | null {
  const cleaned = input.replace(/[\s,%]/g, "").trim();
  if (cleaned === "") return null;
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  return parseToMinor(cleaned, 2);
}

export function basisPointsToInput(bp: number): string {
  return minorToInput(bp, 2).replace(/\.?0+$/, "");
}
