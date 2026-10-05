import { isValidIsraeliId, passesLuhn } from './israeli-id.ts';

/**
 * Deterministic personal-information check that runs before any tutor message reaches
 * the model. It is tuned to over-block: a false positive costs a child one retyped
 * question, a false negative sends a child's details to a third party.
 */

export type PiiKind =
  | 'phone'
  | 'israeli_id'
  | 'card_number'
  | 'long_number'
  | 'email'
  | 'address'
  | 'school'
  | 'full_name'
  | 'social_handle';

export interface PiiFinding {
  kind: PiiKind;
  start: number;
  end: number;
}

const HEB = '\\u0590-\\u05FF';
const HEB_WORD = `[${HEB}"'׳״-]{2,}`;

// Words that commonly follow a first name in Hebrew and are not surnames.
const HEBREW_NAME_STOPWORDS = new Set([
  'ואני', 'אני', 'ואתה', 'ואת', 'ויש', 'וזה', 'ואנחנו', 'כי', 'אבל', 'אז', 'גם',
  'בכיתה', 'מכיתה', 'ואוהב', 'ואוהבת', 'ורציתי', 'ורוצה', 'שלום', 'היי',
]);

// Words that follow "בית ספר" without naming a school.
const HEBREW_SCHOOL_STOPWORDS = new Set([
  'שלי', 'שלנו', 'שלך', 'יסודי', 'תיכון', 'חדש', 'גדול', 'היום', 'מחר', 'אתמול',
  'זה', 'הזה', 'כזה', 'אחר', 'כמו', 'עם', 'של', 'ביום', 'בבוקר', 'נגמר', 'מתחיל',
]);

interface PatternRule {
  kind: PiiKind;
  regex: RegExp;
  /** Optional extra check on the match; return false to ignore it. */
  accept?: (match: RegExpExecArray) => boolean;
}

const PATTERN_RULES: PatternRule[] = [
  { kind: 'email', regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },

  // "username is ...", "שם המשתמש שלי ...", or a bare @handle.
  {
    kind: 'social_handle',
    regex: new RegExp(
      `(?:user\\s?name|handle|gamer\\s?tag|שם\\s(?:ה)?משתמש)\\s*(?:is|שלי|הוא|:)?\\s*@?[\\w.${HEB}]{3,}`,
      'giu',
    ),
  },
  { kind: 'social_handle', regex: /(?:^|\s)@[A-Za-z0-9_.]{3,}/g },

  // Hebrew street names with a house number: "רחוב הרצל 12", "שד' בן גוריון 5".
  {
    kind: 'address',
    regex: new RegExp(`(?:רחוב|רח['׳]|שדרות|שד['׳])\\s*[${HEB}"'׳״ -]{2,30}?\\s\\d{1,4}`, 'gu'),
  },
  // "הכתובת שלי ...", "אני גר/גרה ב... 12".
  {
    kind: 'address',
    regex: new RegExp(`(?:הכתובת שלי|אני גר(?:ה)? ב|אנחנו גרים ב)[${HEB}"'׳״ -]{2,40}?\\s\\d{1,4}`, 'gu'),
  },
  { kind: 'address', regex: /\bmy (?:home )?address\b/gi },
  {
    kind: 'address',
    regex: /\b\d{1,5}\s+[A-Za-z][A-Za-z ]{1,30}?\s(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln)\b/gi,
  },
  { kind: 'address', regex: /\b[A-Za-z]+\s(?:street|road|avenue|boulevard)\s+\d{1,4}\b/gi },

  // Hebrew "בית ספר <name>", skipping generic words.
  {
    kind: 'school',
    regex: new RegExp(`בית[\\s-]?ה?ספר\\s+(${HEB_WORD})`, 'gu'),
    accept: (m) => !HEBREW_SCHOOL_STOPWORDS.has(m[1] ?? ''),
  },
  { kind: 'school', regex: /\b(?:my school is|i go to|i study at)\s+[a-z][\w'-]+/gi },
  { kind: 'school', regex: /\b[A-Z][\w'-]+\s+(?:Elementary|Primary|Middle|High)\s+School\b/g },

  // "my name is Noa Levi" (any case), "I'm Noa Levi" (capitalised).
  { kind: 'full_name', regex: /\bmy (?:full )?name is\s+[a-z][a-z'-]+\s+[a-z][a-z'-]+/gi },
  { kind: 'full_name', regex: /\b(?:I am|I'm|call me)\s+[A-Z][a-z'-]+\s+[A-Z][a-z'-]+/g },
  {
    kind: 'full_name',
    regex: new RegExp(`(?:קוראים לי|השם המלא שלי(?: הוא)?|השם שלי(?: הוא)?|שמי)\\s+(${HEB_WORD})\\s+(${HEB_WORD})`, 'gu'),
    accept: (m) => !HEBREW_NAME_STOPWORDS.has(m[2] ?? ''),
  },
];

// Runs of digits possibly broken by spaces, dashes, dots or brackets, with optional +.
const NUMBER_CANDIDATE = /\+?\d[\d\s\-().]{5,}\d/g;

function classifyNumber(raw: string): PiiKind | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;

  if (/^05\d{7,9}$/.test(digits)) return 'phone';            // mobile, incl. one-digit typos
  if (/^0[2-489]\d{7}$/.test(digits)) return 'phone';         // landline
  if (/^07\d{8}$/.test(digits)) return 'phone';               // VoIP
  if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) return 'card_number';
  if ((digits.length === 8 || digits.length === 9) && isValidIsraeliId(digits)) return 'israeli_id';
  if (digits.length >= 10) return 'long_number';
  return null;
}

export function detectPii(text: string, options: { schoolNames?: string[] } = {}): PiiFinding[] {
  const findings: PiiFinding[] = [];

  for (const match of text.matchAll(NUMBER_CANDIDATE)) {
    const kind = classifyNumber(match[0]);
    if (kind) findings.push({ kind, start: match.index, end: match.index + match[0].length });
  }

  for (const rule of PATTERN_RULES) {
    rule.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.regex.exec(text)) !== null) {
      if (!rule.accept || rule.accept(match)) {
        findings.push({ kind: rule.kind, start: match.index, end: match.index + match[0].length });
      }
      if (match[0].length === 0) rule.regex.lastIndex++;
    }
  }

  const lower = text.toLocaleLowerCase();
  for (const name of options.schoolNames ?? []) {
    const needle = name.trim().toLocaleLowerCase();
    if (needle.length < 3) continue;
    let from = 0;
    let index: number;
    while ((index = lower.indexOf(needle, from)) !== -1) {
      findings.push({ kind: 'school', start: index, end: index + needle.length });
      from = index + needle.length;
    }
  }

  return mergeOverlapping(findings);
}

function mergeOverlapping(findings: PiiFinding[]): PiiFinding[] {
  const sorted = [...findings].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: PiiFinding[] = [];
  for (const f of sorted) {
    const last = merged.at(-1);
    if (last && f.start < last.end) {
      last.end = Math.max(last.end, f.end);
    } else {
      merged.push({ ...f });
    }
  }
  return merged;
}

export function piiKinds(findings: PiiFinding[]): PiiKind[] {
  return [...new Set(findings.map((f) => f.kind))].sort();
}

/** Replaces every finding with a label such as ⟦phone⟧. */
export function redact(text: string, findings: PiiFinding[] = detectPii(text)): string {
  let out = '';
  let cursor = 0;
  for (const f of findings) {
    out += text.slice(cursor, f.start) + `⟦${f.kind}⟧`;
    cursor = f.end;
  }
  return out + text.slice(cursor);
}
