import { extractCodeBlock } from './extract-code-block';

describe('extractCodeBlock', () => {
  it('should extract code block with language specifier', () => {
    const text = '```typescript\nconst foo = "bar";\n```';
    const result = extractCodeBlock(text);
    expect(result).toEqual({ lang: 'typescript', code: 'const foo = "bar";' });
  });

  it('should extract code block with language specifier without immediate newline', () => {
    const text = '```ts registerComponentAgg([\n name: \'test\'\n]);```';
    const result = extractCodeBlock(text);
    expect(result).toEqual({ lang: 'ts', code: 'registerComponentAgg([\n name: \'test\'\n]);' });
  });

  it('should extract code block without language specifier', () => {
    const text = '```\nconst foo = "bar";\n```';
    const result = extractCodeBlock(text);
    expect(result).toEqual({ lang: '', code: 'const foo = "bar";' });
  });

  it('should return null if no code block is found', () => {
    const text = 'const foo = "bar";';
    const result = extractCodeBlock(text);
    expect(result).toBeNull();
  });

  it('should handle multiline code blocks properly', () => {
    const text = '```ts\nregisterComponentAgg([\n {\n  name: \'namespaces\',\n displayName: \'Namespace\',\n}\n]);```';
    const result = extractCodeBlock(text);
    expect(result).toEqual({ 
      lang: 'ts', 
      code: 'registerComponentAgg([\n {\n  name: \'namespaces\',\n displayName: \'Namespace\',\n}\n]);'
    });
  });
});