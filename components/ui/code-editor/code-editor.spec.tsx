import React from 'react';
import { render } from '@testing-library/react';
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
    const { container } = render(
      <CodeEditorProvider>
        <CodeEditor filePath="example.ts" fileContent="export const answer = 42;" />
      </CodeEditorProvider>
    );

    const renderer = container.querySelector('[data-code-renderer="shiki"]');
    expect(renderer).toBeInTheDocument();
    expect(renderer).toHaveTextContent('export const answer = 42;');
  });
});
