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

  it('keeps the anchor line and every line of its range visible', () => {
    const index = buildAnnotationIndex([
      { line: 3, range: { start: 3, end: 5 } },
      { line: 7, side: 'old', gutter: 'b' },
    ]);
    expect([...index.anchored].sort()).toEqual(['new:3', 'new:4', 'new:5', 'old:7']);
  });

  it('falls back to the anchor line for a range that is not finite, reversed or too long', () => {
    const index = buildAnnotationIndex([
      { line: 1, range: { start: 1, end: Number.POSITIVE_INFINITY } },
      { line: 5, range: { start: 6, end: 2 } },
      { line: 9, range: { start: 9, end: 1e9 } },
      { line: Number.NaN },
    ]);
    expect(index.range.size).toBe(0);
    expect([...index.anchored].sort()).toEqual(['new:1', 'new:5', 'new:9']);
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
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.innerHTML = '';
  });

  /**
   * rows as the viewer renders them: the line number on the row, the source in the row's own `<code>`
   * cell. `badge` puts a `<code>` inside the gutter too, like a host-supplied annotation could.
   */
  function mountRows(rows: Array<{ new?: number; old?: number; text: string; badge?: boolean }>) {
    document.body.innerHTML = rows
      .map((row) => {
        const attrs = [
          row.old !== undefined ? `${lineAttribute('old')}="${row.old}"` : '',
          row.new !== undefined ? `${lineAttribute('new')}="${row.new}"` : '',
        ].join(' ');
        const gutter = row.badge ? '<span><code>badge</code></span>' : `<span>${row.old ?? row.new}</span>`;
        return `<div ${attrs}>${gutter}<code>${row.text}</code></div>`;
      })
      .join('');
    return document.body;
  }

  /** select from `startOffset` in the code of row `startRow` to `endOffset` in the code of row `endRow`. */
  function select(startRow: number, startOffset: number, endRow: number, endOffset: number) {
    const codes = Array.from(document.body.children).map((row) => row.querySelector(':scope > code') as Element);
    const range = document.createRange();
    range.setStart(codes[startRow].firstChild as Node, startOffset);
    range.setEnd(codes[endRow].firstChild as Node, endOffset);
    const selection = window.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  it('resolves a multi-line selection to its first and last line and the selected text', () => {
    const root = mountRows([
      { new: 10, text: 'ten' },
      { new: 11, text: 'eleven' },
      { new: 12, text: 'twelve' },
      { new: 13, text: 'thirteen' },
    ]);
    select(1, 3, 2, 3);

    expect(captureDiffSelection('new', root)).toEqual({ startLine: 11, endLine: 12, text: 'ven\ntwe' });
  });

  it('keeps a blank line the selection covers', () => {
    const root = mountRows([
      { new: 1, text: 'one' },
      { new: 2, text: '' },
      { new: 3, text: 'three' },
    ]);
    select(0, 0, 2, 5);

    expect(captureDiffSelection('new', root)).toEqual({ startLine: 1, endLine: 3, text: 'one\n\nthree' });
  });

  it('reads the source cell, not a `<code>` inside a gutter badge', () => {
    const root = mountRows([
      { new: 1, text: 'one', badge: true },
      { new: 2, text: 'two' },
    ]);
    select(0, 1, 1, 2);

    expect(captureDiffSelection('new', root)).toEqual({ startLine: 1, endLine: 2, text: 'ne\ntw' });
  });

  it('ignores a selection confined to a single line', () => {
    const root = mountRows([
      { new: 1, text: 'one' },
      { new: 2, text: 'two' },
    ]);
    select(0, 0, 0, 3);

    expect(captureDiffSelection('new', root)).toBeUndefined();
  });

  it('does not count a line where the selection only ends at its start', () => {
    const root = mountRows([
      { new: 1, text: 'one' },
      { new: 2, text: 'two' },
    ]);
    select(0, 0, 1, 0);

    expect(captureDiffSelection('new', root)).toBeUndefined();
  });

  it('leaves out the lines and text of the other side in a unified diff', () => {
    const root = mountRows([
      { old: 1, new: 1, text: 'same' },
      { old: 2, text: 'removed' },
      { new: 2, text: 'added' },
    ]);
    select(0, 0, 2, 5);

    expect(captureDiffSelection('new', root)).toEqual({ startLine: 1, endLine: 2, text: 'same\nadded' });
    expect(captureDiffSelection('old', root)).toEqual({ startLine: 1, endLine: 2, text: 'same\nremoved' });
  });

  it('returns the selection only when it covers the acted-on line', () => {
    const root = mountRows([
      { new: 10, text: 'ten' },
      { new: 11, text: 'eleven' },
      { new: 12, text: 'twelve' },
      { new: 13, text: 'thirteen' },
    ]);
    select(1, 0, 2, 6);

    expect(captureDiffSelection('new', root, 12)).toEqual({ startLine: 11, endLine: 12, text: 'eleven\ntwelve' });
    expect(captureDiffSelection('new', root, 13)).toBeUndefined();
  });

  it('ignores a collapsed or whitespace-only selection', () => {
    const root = mountRows([
      { new: 1, text: '  ' },
      { new: 2, text: '  ' },
    ]);
    select(0, 1, 0, 1);
    expect(captureDiffSelection('new', root)).toBeUndefined();

    select(0, 0, 1, 2);
    expect(captureDiffSelection('new', root)).toBeUndefined();
  });
});
