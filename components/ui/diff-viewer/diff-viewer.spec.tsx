import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiffViewer } from './diff-viewer';

jest.mock('./highlighter', () => ({
  useHighlightedLines: () => null,
}));

describe('DiffViewer', () => {
  it('keeps unified lines longer than 400 characters horizontally reachable', () => {
    const longLine = 'x'.repeat(500);
    const markup = renderToStaticMarkup(
      <DiffViewer fileName="long.ts" oldContent="" newContent={longLine} view="unified" />
    );

    expect(markup).toContain('--diff-code-width:500ch');
    expect(markup).toContain(longLine);
  });
});
