import { buildSections, computeDiffLines } from './diff-model';

describe('buildSections', () => {
  it('shows a complete unchanged file when context covers the file', () => {
    const items = computeDiffLines('one\ntwo\nthree', 'one\ntwo\nthree');
    expect(buildSections(items, Number.MAX_SAFE_INTEGER)).toEqual([{ kind: 'lines', items }]);
  });

  it('collapses a complete unchanged file when context is limited', () => {
    const items = computeDiffLines('one\ntwo\nthree', 'one\ntwo\nthree');
    expect(buildSections(items, 1)).toEqual([{ kind: 'gap', id: 'gap-all', hidden: items }]);
  });
});

describe('computeDiffLines', () => {
  it('ignores edge whitespace for matching while preserving both rendered sources', () => {
    const items = computeDiffLines('  const answer = 42;  \n', 'const answer = 42;\n', {
      ignoreTrimWhitespace: true,
    });

    expect(items).toEqual([
      {
        type: 'context',
        oldLn: 1,
        newLn: 1,
        text: 'const answer = 42;',
        oldText: '  const answer = 42;  ',
        newText: 'const answer = 42;',
      },
    ]);
  });

  it('preserves substantive internal-space changes', () => {
    const items = computeDiffLines('const answer = 42;\n', 'const  answer = 42;\n', {
      ignoreTrimWhitespace: true,
    });
    expect(items.map(({ type }) => type)).toEqual(['del', 'add']);
  });

  it('normalizes CRLF lines without trimming other whitespace', () => {
    const items = computeDiffLines('const answer = 41;\r\n  next();\r\n', 'const answer = 42;\r\n  next();\r\n');

    expect(items.map(({ type, text }) => ({ type, text }))).toEqual([
      { type: 'del', text: 'const answer = 41;' },
      { type: 'add', text: 'const answer = 42;' },
      { type: 'context', text: '  next();' },
    ]);
    expect(
      items.every(({ text, oldText, newText }) => ![text, oldText, newText].some((line) => line?.includes('\r')))
    ).toBe(true);
  });

  it('normalizes unchanged CRLF lines', () => {
    const items = computeDiffLines('one\r\ntwo\r\n', 'one\r\ntwo\r\n');

    expect(items.map(({ text, oldText, newText }) => ({ text, oldText, newText }))).toEqual([
      { text: 'one', oldText: 'one', newText: 'one' },
      { text: 'two', oldText: 'two', newText: 'two' },
    ]);
  });
});
