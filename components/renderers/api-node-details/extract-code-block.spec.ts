import { extractCodeBlock } from './extract-code-block';

describe('extractCodeBlock', () => {
  it('should extract code block with language specifier', () => {
    const text = '```typescript\nconst foo = "bar";\n```';
    const result = extractCodeBlock(text);
    expect(result).toEqual({ lang: 'typescript', code: 'const foo = "bar";\n' });
  });

  it('should extract code block without language specifier', () => {
    const text = '```\nconst foo = "bar";\n```';
    const result = extractCodeBlock(text);
    expect(result).toEqual({ lang: '', code: 'const foo = "bar";\n' });
  });

  it('should return null if no code block is found', () => {
    const text = 'const foo = "bar";';
    const result = extractCodeBlock(text);
    expect(result).toBeNull();
  });
});
