import { buildSections, computeDiffLines, revealInGaps } from './diff-model';

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

describe('revealInGaps', () => {
  const lines = Array.from({ length: 40 }, (_, i) => `l${i + 1}`);
  const changed = [...lines];
  changed[0] = 'first';
  const items = computeDiffLines(lines.join('\n'), changed.join('\n'));
  const visibleLines = (sections: ReturnType<typeof buildSections>) =>
    sections.flatMap((section) => (section.kind === 'lines' ? section.items : [])).map((item) => item.newLn);

  it('keeps revealed lines visible when a comment splits their gap', () => {
    const before = buildSections(items, 2);
    const gap = before.find((section) => section.kind === 'gap');
    if (!gap || gap.kind !== 'gap') throw new Error('expected a gap');
    const revealed = new Set([...gap.hidden.slice(0, 5), ...gap.hidden.slice(-3)]);

    // a comment lands in the middle of that gap and splits it
    const after = revealInGaps(buildSections(items, 2, (item) => item.newLn === 20), revealed);
    for (const item of revealed) expect(visibleLines(after)).toContain(item.newLn);
  });

  it('keeps revealed lines visible when removing a comment merges two gaps around them', () => {
    const withComment = buildSections(items, 2, (item) => item.newLn === 20);
    const gaps = withComment.filter((section) => section.kind === 'gap');
    if (gaps[0]?.kind !== 'gap') throw new Error('expected a gap');
    // the reader revealed the bottom of the first gap, just above the comment
    const revealed = new Set(gaps[0].hidden.slice(-4));

    // the comment is removed: the two gaps merge and the revealed lines are now in its middle
    const merged = revealInGaps(buildSections(items, 2), revealed);
    for (const item of revealed) expect(visibleLines(merged)).toContain(item.newLn);
    // lines around them are still collapsed
    expect(merged.filter((section) => section.kind === 'gap')).toHaveLength(2);
  });

  it('returns the sections unchanged when nothing was revealed', () => {
    const sections = buildSections(items, 2);
    expect(revealInGaps(sections, new Set())).toBe(sections);
  });
});
