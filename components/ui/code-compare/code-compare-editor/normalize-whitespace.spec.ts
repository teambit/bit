import { normalizeWhitespace } from './normalize-whitespace';

describe('normalizeWhitespace', () => {
  it('ignores indentation-only and trailing-whitespace changes', () => {
    expect(normalizeWhitespace('  const answer = 42;  ', true)).toBe('const answer = 42;');
  });

  it('preserves substantive internal spacing', () => {
    expect(normalizeWhitespace('const  answer = 42;', true)).toBe('const  answer = 42;');
  });

  it('returns content unchanged when whitespace is significant', () => {
    expect(normalizeWhitespace('  const answer = 42;  ')).toBe('  const answer = 42;  ');
  });
});
