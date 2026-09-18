import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.node';
import { CodeCompareView } from './code-compare-view';

// jest hoists `jest.mock` above the imports, so anything its factory closes over has to be
// `mock`-prefixed to be allowed out of scope.

/**
 * Captures the props the view hands to the editor, so the tests assert on the decision the view
 * makes rather than on rendered markup.
 */
const mockEditorProps: Array<Record<string, any>> = [];
const mockUseCodeCompare = jest.fn();
const mockUseComponentCompare = jest.fn();

jest.mock('../code-compare-editor', () => ({
  CodeCompareEditor: (props: Record<string, any>) => {
    mockEditorProps.push(props);
    return null;
  },
}));

// the chrome around the editor is irrelevant here and pulls a large dependency graph
jest.mock('../code-compare-navigation', () => ({ CodeCompareNavigation: () => null }));
jest.mock('../code-compare-editor-settings', () => ({ CodeCompareEditorSettings: () => null }));

// the view only needs `langFromFileName` from diff-viewer; importing it for real pulls shiki's ESM
// entry points into the jest transform for no benefit here.
jest.mock('@teambit/code.ui.diff-viewer', () => ({ langFromFileName: () => 'typescript' }));

jest.mock('../use-code-compare', () => ({ useCodeCompare: () => mockUseCodeCompare() }));
jest.mock('@teambit/component.ui.component-compare.context', () => ({
  useComponentCompare: () => mockUseComponentCompare(),
}));

const FILE = 'index.ts';

function renderWithStatus(status?: string) {
  mockEditorProps.length = 0;

  mockUseCodeCompare.mockReturnValue({
    baseId: undefined,
    compareId: undefined,
    originalFileContent: 'same\n',
    modifiedFileContent: 'same\n',
    originalPath: `base-${FILE}`,
    modifiedPath: `compare-${FILE}`,
    loading: false,
  });

  mockUseComponentCompare.mockReturnValue({
    fileCompareDataByName: new Map(status ? [[FILE, { status }]] : []),
  });

  renderToStaticMarkup(<CodeCompareView fileName={FILE} files={[FILE]} getHref={() => ''} />);

  return mockEditorProps[0];
}

describe('CodeCompareView', () => {
  it('turns diff-only off for an unchanged file so its contents are rendered', () => {
    // diff-only would collapse 100% of a file with no changes, leaving a pane that contains only an
    // "Expand N unchanged lines" button and no content.
    expect(renderWithStatus('UNCHANGED').diffOnly).toBe(false);
  });

  it('keeps diff-only on for a file that has changes', () => {
    expect(renderWithStatus('MODIFIED').diffOnly).toBe(true);
  });

  it('keeps diff-only on when the file has no status information', () => {
    expect(renderWithStatus(undefined).diffOnly).toBe(true);
  });
});
