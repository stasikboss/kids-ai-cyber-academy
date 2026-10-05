import { describe, expect, it } from 'vitest';
import { isValidIsraeliId, passesLuhn } from '../supabase/functions/_shared/israeli-id.ts';
import { detectPii, piiKinds, redact } from '../supabase/functions/_shared/pii.ts';

const kindsOf = (text: string, schoolNames?: string[]) => piiKinds(detectPii(text, { schoolNames }));

describe('Israeli ID check digit', () => {
  it('accepts valid numbers and rejects invalid ones', () => {
    expect(isValidIsraeliId('123456782')).toBe(true);
    expect(isValidIsraeliId('000000018')).toBe(true);
    expect(isValidIsraeliId('123456789')).toBe(false);
    expect(isValidIsraeliId('000000000')).toBe(false);
    expect(isValidIsraeliId('1234')).toBe(false);
  });

  it('runs the Luhn check used by cards', () => {
    expect(passesLuhn('4111111111111111')).toBe(true);
    expect(passesLuhn('4111111111111112')).toBe(false);
  });
});

describe('detectPii blocks', () => {
  it.each([
    ['my number is 050-1234567', 'phone'],
    ['call me at +972 52 123 4567', 'phone'],
    ['הטלפון של אמא 03-5551234', 'phone'],
    ['תעודת הזהות שלי 123456782', 'israeli_id'],
    ['card 4111 1111 1111 1111', 'card_number'],
    ['write to noa.levi@example.com', 'email'],
    ['אני גר ברחוב הרצל 12 בחיפה', 'address'],
    ['הכתובת שלי היא שד׳ בן גוריון 5', 'address'],
    ['I live at 42 Maple Street', 'address'],
    ['my address is near the park', 'address'],
    ['we live on Herzl Street 7', 'address'],
    ['אני לומד בבית ספר אלונים', 'school'],
    ['I go to Hillcrest', 'school'],
    ['Oakwood Elementary School is great', 'school'],
    ['my name is noa levi', 'full_name'],
    ["I'm Daniel Cohen and I like robots", 'full_name'],
    ['קוראים לי נועה לוי', 'full_name'],
    ['my roblox username is dragonfan99', 'social_handle'],
    ['add me @cool_kid_22', 'social_handle'],
    ['שם המשתמש שלי הוא שומרסייבר', 'social_handle'],
  ])('%s → %s', (text, kind) => {
    expect(kindsOf(text)).toContain(kind);
  });

  it('blocks names from a configured school list', () => {
    expect(kindsOf('I am in Rimon class', ['Rimon'])).toContain('school');
  });
});

describe('detectPii lets ordinary questions through', () => {
  it.each([
    'What is AI?',
    'מה זה בינה מלאכותית?',
    'How many is 1000000?',
    'Is 2026 a leap year?',
    'קוראים לי נועה ואני אוהבת רובוטים',
    'בית הספר שלי נגמר בשתיים',
    'בבית ספר יסודי לומדים על סיסמאות?',
    'Why should a password have 12 characters?',
    'I am happy today',
    'Can a chatbot be wrong?',
    'my name is Noa',
  ])('%s', (text) => {
    expect(detectPii(text)).toEqual([]);
  });
});

describe('redact', () => {
  it('replaces each finding with its label', () => {
    expect(redact('call 050-1234567 or mail a@b.co')).toBe('call ⟦phone⟧ or mail ⟦email⟧');
  });
});
