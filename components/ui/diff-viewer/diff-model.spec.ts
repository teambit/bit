import { buildSections, computeDiffLines, gapStatesFor } from './diff-model';

describe('buildSections', () => {
  it('shows a complete unchanged file when context covers the file', () => {
    const items = computeDiffLines('one\ntwo\nthree', 'one\ntwo\nthree');
    expect(buildSections(items, Number.MAX_SAFE_INTEGER)).toEqual([{ kind: 'lines', items }]);
  });

  it('collapses a complete unchanged file when context is limited', () => {
    const items = computeDiffLines('one\ntwo\nthree', 'one\ntwo\nthree');
    expect(buildSections(items, 1)).toEqual([{ kind: 'gap', id: 'gap-all', hidden: items }]);
  });

  it('keeps an anchored unchanged line and its context visible', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `l${i + 1}`).join('\n');
    const items = computeDiffLines(lines, lines);
    const sections = buildSections(items, 2, (item) => item.newLn === 15);
    const visible = sections.flatMap((section) => (section.kind === 'lines' ? section.items : []));

    expect(visible.map((item) => item.newLn)).toEqual([13, 14, 15, 16, 17]);
  });

  it('keeps an anchored line between two changes from collapsing into a gap', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `l${i + 1}`);
    const changed = [...lines];
    changed[0] = 'first';
    changed[39] = 'last';
    const items = computeDiffLines(lines.join('\n'), changed.join('\n'));
    const sections = buildSections(items, 2, (item) => item.newLn === 20);
    const visible = sections.flatMap((section) => (section.kind === 'lines' ? section.items : []));

    expect(visible.some((item) => item.newLn === 20 && item.type === 'context')).toBe(true);
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

describe('gapStatesFor', () => {
  const lines = Array.from({ length: 40 }, (_, i) => `l${i + 1}`);
  const changed = [...lines];
  changed[0] = 'first';
  const items = computeDiffLines(lines.join('\n'), changed.join('\n'));

  it('keeps revealed lines open when an anchor rebuilds the sections', () => {
    const before = buildSections(items, 2);
    const gap = before.find((section) => section.kind === 'gap');
    if (!gap || gap.kind !== 'gap') throw new Error('expected a gap');
    // the reader revealed the first 5 and the last 3 lines of the gap
    const revealed = new Set([...gap.hidden.slice(0, 5), ...gap.hidden.slice(-3)]);
    expect(gapStatesFor(before, revealed)[gap.id]).toEqual({ top: 5, bottom: 3 });

    // a comment lands in the middle of that gap and splits it: the lower part is a new gap
    const after = buildSections(items, 2, (item) => item.newLn === 20);
    const gaps = after.filter((section) => section.kind === 'gap');
    expect(gaps).toHaveLength(2);
    expect(gaps.map((g) => g.id)).not.toContain(undefined);
    const states = gapStatesFor(after, revealed);
    expect(states[gaps[0].id]).toEqual({ top: 5, bottom: 0 });
    expect(gaps[1].id).not.toBe(gap.id);
    expect(states[gaps[1].id]).toEqual({ top: 0, bottom: 3 });
  });

  it('reports nothing when no line was revealed', () => {
    expect(gapStatesFor(buildSections(items, 2), new Set())).toEqual({});
  });
});
