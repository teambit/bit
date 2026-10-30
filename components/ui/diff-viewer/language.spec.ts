import { langFromFileName, normalizeLanguage } from './language';

describe('language normalization', () => {
  const aliases = [
    ['ts', 'typescript'],
    ['JS', 'javascript'],
    ['sh', 'shellscript'],
    ['yml', 'yaml'],
  ];

  aliases.forEach(([input, expected]) => {
    it(`maps ${input} to the supported ${expected} grammar`, () => {
      expect(normalizeLanguage(input)).toBe(expected);
    });
  });

  it('normalizes file extensions through the same alias map', () => {
    expect(langFromFileName('example.TS')).toBe('typescript');
  });
});
