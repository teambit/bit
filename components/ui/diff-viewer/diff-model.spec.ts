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
