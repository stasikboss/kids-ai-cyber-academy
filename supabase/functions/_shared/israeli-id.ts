/**
 * Israeli ID number (Teudat Zehut) check digit: digits are multiplied alternately by
 * 1 and 2, products above 9 have their digits summed, and the total must divide by 10.
 * Shorter numbers are left-padded with zeros to 9 digits.
 */
export function isValidIsraeliId(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 5 || digits.length > 9) return false;
  const padded = digits.padStart(9, '0');
  if (padded === '000000000') return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let step = Number(padded[i]) * ((i % 2) + 1);
    if (step > 9) step -= 9;
    sum += step;
  }
  return sum % 10 === 0;
}

/** Luhn check used by payment cards. */
export function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}
