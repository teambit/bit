import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.node';
import { DiffViewer } from './diff-viewer';

jest.mock('./highlighter', () => ({
  useHighlightedLines: () => null,
}));

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('DiffViewer', () => {
  it('keeps unified lines longer than 400 characters horizontally reachable', () => {
    const longLine = 'x'.repeat(500);
    const markup = renderToStaticMarkup(
      <DiffViewer fileName="long.ts" oldContent="" newContent={longLine} view="unified" />
    );

    expect(markup).toContain('--diff-code-width:500ch');
    expect(markup).toContain(longLine);
  });

  describe('annotations', () => {
    const oldContent = 'one\ntwo\nthree\n';
    const newContent = 'one\ntwo changed\nthree\n';

    it('tags rows with their line numbers so a selection can be resolved back to lines', () => {
      const markup = renderToStaticMarkup(
        <DiffViewer fileName="a.ts" oldContent={oldContent} newContent={newContent} view="unified" />
      );

      expect(markup).toContain('data-diff-old-line="1"');
      expect(markup).toContain('data-diff-new-line="1"');
    });

    it('tags each split cell with only its own side\'s line number', () => {
      const markup = renderToStaticMarkup(
        <DiffViewer fileName="a.ts" oldContent={oldContent} newContent={newContent} view="split" />
      );

      expect(markup).toContain('data-diff-old-line="2"');
      expect(markup).toContain('data-diff-new-line="2"');
    });

    it('renders host gutter content on the annotated line', () => {
      const markup = renderToStaticMarkup(
        <DiffViewer
          fileName="a.ts"
          oldContent={oldContent}
          newContent={newContent}
          view="unified"
          annotations={[{ line: 2, gutter: <span>avatar</span> }]}
        />
      );

      expect(markup).toContain('avatar');
    });

    it('renders an under-line widget beneath its line', () => {
      const markup = renderToStaticMarkup(
        <DiffViewer
          fileName="a.ts"
          oldContent={oldContent}
          newContent={newContent}
          view="unified"
          annotations={[{ line: 2, widget: <form>compose</form> }]}
        />
      );

      expect(markup).toContain('<form>compose</form>');
    });

    it('offers the add-affordance only when the host handles line actions', () => {
      const withoutHandler = renderToStaticMarkup(
        <DiffViewer fileName="a.ts" oldContent={oldContent} newContent={newContent} view="unified" />
      );
      expect(withoutHandler).not.toContain('aria-label="Comment on this line"');

      const withHandler = renderToStaticMarkup(
        <DiffViewer
          fileName="a.ts"
          oldContent={oldContent}
          newContent={newContent}
          view="unified"
          onLineAction={() => {}}
        />
      );
      expect(withHandler).toContain('aria-label="Comment on this line"');
    });

    it('keeps an already-annotated gutter showing its badge instead of the add-affordance', () => {
      // an unchanged unified line offers "+" only in its new-side gutter, which here shows the badge
      const oneSide = renderToStaticMarkup(
        <DiffViewer
          fileName="a.ts"
          oldContent="same\n"
          newContent="same\n"
          view="unified"
          onLineAction={() => {}}
          annotations={[{ line: 1, gutter: <span>avatar</span> }]}
        />
      );

      expect(oneSide).toContain('avatar');
      expect(countOccurrences(oneSide, 'aria-label="Comment on this line"')).toBe(0);

      const bothSides = renderToStaticMarkup(
        <DiffViewer
          fileName="a.ts"
          oldContent="same\n"
          newContent="same\n"
          view="unified"
          onLineAction={() => {}}
          annotations={[
            { line: 1, side: 'old', gutter: <span>was-here</span> },
            { line: 1, side: 'new', gutter: <span>avatar</span> },
          ]}
        />
      );

      expect(bothSides).not.toContain('aria-label="Comment on this line"');
    });

    it('offers one add-affordance per unified line: new side, or old side for a removed line', () => {
      const markup = renderToStaticMarkup(
        <DiffViewer
          fileName="a.ts"
          oldContent={'same\nremoved\n'}
          newContent={'same\nadded\n'}
          view="unified"
          onLineAction={() => {}}
        />
      );

      // three rows (unchanged, removed, added), one "+" each
      expect(countOccurrences(markup, 'aria-label="Comment on this line"')).toBe(3);
    });

    it('keeps an annotated unchanged line visible when unchanged code collapses', () => {
      const lines = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
      const content = `${lines.join('\n')}\n`;
      const markup = renderToStaticMarkup(
        <DiffViewer
          fileName="a.ts"
          oldContent={content}
          newContent={content.replace('line 1\n', 'line one\n')}
          view="unified"
          contextLines={3}
          annotations={[{ line: 30, gutter: <span>comment-on-30</span> }]}
        />
      );

      expect(markup).toContain('comment-on-30');
      expect(markup).toContain('line 30');
      // the lines around it stay collapsed
      expect(markup).not.toContain('>line 20<');
    });

    it('renders annotations in split view on the side they belong to', () => {
      const markup = renderToStaticMarkup(
        <DiffViewer
          fileName="a.ts"
          oldContent={oldContent}
          newContent={newContent}
          view="split"
          annotations={[
            { line: 2, side: 'old', gutter: <span>on-base</span> },
            { line: 2, side: 'new', gutter: <span>on-compare</span> },
          ]}
        />
      );

      expect(markup).toContain('on-base');
      expect(markup).toContain('on-compare');
    });
  });
});
