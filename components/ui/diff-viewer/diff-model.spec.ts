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
});
