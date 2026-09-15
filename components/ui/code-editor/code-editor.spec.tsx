import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CodeEditor } from './code-editor';
import { CodeEditorProvider } from './code-editor.provider';

jest.mock('@teambit/code.ui.diff-viewer', () => ({
  langFromFileName: () => 'typescript',
  normalizeLanguage: (language?: string) => language,
  resolveTokenColor: () => undefined,
  useHighlightedLines: () => null,
}));

describe('CodeEditor', () => {
  it('renders code without an injected editor or CDN runtime', () => {
    const markup = renderToStaticMarkup(
      <CodeEditorProvider>
        <CodeEditor filePath="example.ts" fileContent="export const answer = 42;" />
      </CodeEditorProvider>
    );

    expect(markup).toContain('data-code-renderer="shiki"');
    expect(markup).toContain('export const answer = 42;');
  });
});
