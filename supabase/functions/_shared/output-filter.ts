import { detectPii } from './pii.ts';

/**
 * Fast per-sentence check on tutor output, run before a sentence is forwarded to the
 * child. It catches the obvious failures cheaply; the model-based output classifier
 * still reviews the whole answer afterwards.
 */

export type OutputBlockReason =
  | 'personal_info'
  | 'link'
  | 'contact_request'
  | 'secrecy'
  | 'denied_term';

interface Rule {
  reason: OutputBlockReason;
  regex: RegExp;
}

const RULES: Rule[] = [
  { reason: 'link', regex: /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co\.il|org\.il|gg|app)\b/i },

  // Asking the child for details or to meet.
  {
    reason: 'contact_request',
    regex: /\b(?:send|tell|give|share)\s+me\s+(?:your|ur)\s+(?:address|phone|number|photo|picture|pic|password|username|school|full name)\b/i,
  },
  { reason: 'contact_request', regex: /\b(?:meet (?:me|up)|add me on|dm me|message me on)\b/i },
  {
    reason: 'contact_request',
    regex: /(?:שלח|שלחי|תשלח|תשלחי|תן|תני|תגיד|תגידי|כתוב|כתבי)\s+לי\s+(?:את\s+)?(?:הכתובת|הטלפון|המספר|תמונה|הסיסמה|שם המשתמש|בית הספר)/u,
  },
  { reason: 'contact_request', regex: /(?:בוא|בואי|בואו)\s+ניפגש|נדבר בפרטי|תוסיף אותי|תוסיפי אותי/u },

  // Secrets kept from parents.
  { reason: 'secrecy', regex: /\b(?:don'?t|do not)\s+tell\s+(?:your\s+)?(?:parents?|mom|mum|dad|anyone|grown-?ups?)\b/i },
  // "Keep your password a secret" is fine; secrets shared with the tutor are not.
  { reason: 'secrecy', regex: /\bour (?:little )?secret\b|\bsecret between us\b|\bjust between us\b/i },
  { reason: 'secrecy', regex: /אל\s+(?:תספר|תספרי|תספרו)\s+(?:להורים|לאמא|לאבא|לאף אחד)|סוד בינינו|שיישאר בינינו/u },

  // Topics a tutor for this audience never needs.
  {
    reason: 'denied_term',
    regex: /\b(?:sex|sexy|sexual|porn\w*|nude|naked|suicide|kill (?:yourself|myself)|self[- ]harm|cocaine|heroin|meth|gun|guns|bomb|bombs)\b/i,
  },
  // Substring matches (Hebrew has no \b); avoid stems like מיני that also start מינימום.
  { reason: 'denied_term', regex: /סקס|פורנו|עירום|התאבד|לפגוע בעצמ|סמים|קוקאין|הרואין|אקדח|פצצה|פצצות/u },
];

export function checkOutputSentence(sentence: string): { ok: true } | { ok: false; reason: OutputBlockReason } {
  for (const rule of RULES) {
    if (rule.regex.test(sentence)) return { ok: false, reason: rule.reason };
  }
  // The tutor must never write out phone numbers, addresses, emails or similar.
  if (detectPii(sentence).length > 0) return { ok: false, reason: 'personal_info' };
  return { ok: true };
}
