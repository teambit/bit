import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.node';
import { CodeCompareEditor } from './code-compare-editor';

/** Captures the props the editor hands to the diff viewer. */
const mockViewerProps: Array<Record<string, any>> = [];

jest.mock('@teambit/code.ui.diff-viewer', () => ({
  DiffViewer: (props: Record<string, any>) => {
    mockViewerProps.push(props);
    return null;
  },
}));

function renderWith(lines: number, fullScreen = false, wordWrap = false) {
  mockViewerProps.length = 0;
  const content = Array.from({ length: lines }, (_, i) => `line ${i}`).join('\n');
  renderToStaticMarkup(
    <CodeCompareEditor
      Loader={null}
      originalPath="base-a.ts"
      modifiedPath="compare-a.ts"
      originalFileContent={content}
      modifiedFileContent={content}
      fullScreen={fullScreen}
      editorViewMode="split"
      wordWrap={wordWrap}
      ignoreWhitespace={false}
    />
  );
  return mockViewerProps[0];
}

describe('CodeCompareEditor', () => {
  it('lets an inline diff of a regular file size to its content', () => {
    expect(renderWith(200).virtualize).toBe(false);
  });

  it('virtualizes an inline diff of a large file', () => {
    expect(renderWith(5000).virtualize).toBe(true);
  });

  it('virtualizes in fullscreen', () => {
    expect(renderWith(10, true).virtualize).toBe(true);
  });

  it('turns soft wrap off for a large file so its rows can be windowed', () => {
    expect(renderWith(5000, false, true).wrap).toBe(false);
    expect(renderWith(200, false, true).wrap).toBe(true);
  });
});
