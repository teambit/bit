import {
  buildAnnotationIndex,
  captureDiffSelection,
  lineAttribute,
  lineKey,
  EMPTY_ANNOTATION_INDEX,
} from './annotations';

describe('buildAnnotationIndex', () => {
  it('returns the shared empty index when there is nothing to annotate', () => {
    expect(buildAnnotationIndex()).toBe(EMPTY_ANNOTATION_INDEX);
    expect(buildAnnotationIndex([])).toBe(EMPTY_ANNOTATION_INDEX);
    expect(EMPTY_ANNOTATION_INDEX.hasWidgets).toBe(false);
  });

  it('defaults an annotation to the new side and buckets gutter content by line', () => {
    const index = buildAnnotationIndex([{ line: 12, gutter: 'badge' }]);

    expect(index.gutter.get(lineKey('new', 12))).toEqual(['badge']);
    expect(index.gutter.has(lineKey('old', 12))).toBe(false);
  });

  it('keeps old-side and new-side annotations on the same line number apart', () => {
    const index = buildAnnotationIndex([
      { line: 3, side: 'old', gutter: 'was-here' },
      { line: 3, side: 'new', gutter: 'now-here' },
    ]);

    expect(index.gutter.get(lineKey('old', 3))).toEqual(['was-here']);
    expect(index.gutter.get(lineKey('new', 3))).toEqual(['now-here']);
  });

  it('stacks multiple annotations that land on one line', () => {
    const index = buildAnnotationIndex([
      { line: 7, gutter: 'first' },
      { line: 7, gutter: 'second' },
    ]);

    expect(index.gutter.get(lineKey('new', 7))).toEqual(['first', 'second']);
  });

  it('flags widgets so the viewer can opt out of fixed-row virtualization', () => {
    expect(buildAnnotationIndex([{ line: 1, gutter: 'x' }]).hasWidgets).toBe(false);
    expect(buildAnnotationIndex([{ line: 1, widget: 'form' }]).hasWidgets).toBe(true);
  });

  it('expands a range into every line it covers', () => {
    const index = buildAnnotationIndex([{ line: 4, range: { start: 4, end: 6 } }]);

    expect([...index.range]).toEqual([lineKey('new', 4), lineKey('new', 5), lineKey('new', 6)]);
  });

  it('marks only the anchor line when an active annotation has no range', () => {
    const index = buildAnnotationIndex([{ line: 9, active: true }]);

    expect([...index.active]).toEqual([lineKey('new', 9)]);
    expect(index.range.size).toBe(0);
  });

  it('marks the whole range active when an active annotation spans lines', () => {
    const index = buildAnnotationIndex([{ line: 2, range: { start: 2, end: 4 }, active: true }]);

    expect([...index.active]).toEqual([lineKey('new', 2), lineKey('new', 3), lineKey('new', 4)]);
  });
});

describe('captureDiffSelection', () => {
  const originalGetSelection = window.getSelection;

  afterEach(() => {
    window.getSelection = originalGetSelection;
    document.body.innerHTML = '';
  });

  function mountRows(lines: number[], side: 'old' | 'new' = 'new') {
    document.body.innerHTML = lines
      .map((line) => `<div ${lineAttribute(side)}="${line}">${line}</div>`)
      .join('');
    return document.body;
  }

  function stubSelection(text: string, covered: (node: Node) => boolean) {
    window.getSelection = (() => ({
      rangeCount: 1,
      isCollapsed: false,
      toString: () => text,
      containsNode: (node: Node) => covered(node),
    })) as unknown as typeof window.getSelection;
  }

  it('resolves a multi-line selection to its first and last line on the requested side', () => {
    const root = mountRows([10, 11, 12, 13]);
    stubSelection('two lines', (node) => ['11', '12'].includes((node as Element).textContent ?? ''));

    expect(captureDiffSelection('new', root)).toEqual({ startLine: 11, endLine: 12, text: 'two lines' });
  });

  it('ignores a selection confined to a single line', () => {
    const root = mountRows([1, 2, 3]);
    stubSelection('one line', (node) => (node as Element).textContent === '2');

    expect(captureDiffSelection('new', root)).toBeUndefined();
  });

  it('ignores rows belonging to the other side', () => {
    const root = mountRows([4, 5, 6], 'old');
    stubSelection('some text', () => true);

    expect(captureDiffSelection('new', root)).toBeUndefined();
    expect(captureDiffSelection('old', root)).toEqual({ startLine: 4, endLine: 6, text: 'some text' });
  });

  it('ignores a collapsed or whitespace-only selection', () => {
    const root = mountRows([1, 2]);

    window.getSelection = (() => ({
      rangeCount: 1,
      isCollapsed: true,
      toString: () => '',
      containsNode: () => true,
    })) as unknown as typeof window.getSelection;
    expect(captureDiffSelection('new', root)).toBeUndefined();

    stubSelection('   \n  ', () => true);
    expect(captureDiffSelection('new', root)).toBeUndefined();
  });
});
