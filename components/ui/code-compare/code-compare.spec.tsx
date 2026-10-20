import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.node';
import { CodeCompare } from './code-compare';

// jest hoists `jest.mock` above the imports, so anything its factory closes over has to be
// `mock`-prefixed to be allowed out of scope.

/** Captures the props the compare hands to its code view, so the tests assert on its decisions. */
const mockViewProps: Array<Record<string, any>> = [];
const mockUseComponentCompare = jest.fn();
const mockUseCode = jest.fn();

jest.mock('./code-compare-view', () => ({
  CodeCompareView: (props: Record<string, any>) => {
    mockViewProps.push(props);
    return null;
  },
}));
jest.mock('./code-compare-tree', () => ({ CodeCompareTree: () => null }));
jest.mock('./code-compare.widgets', () => ({ Widget: () => null }));
jest.mock('@teambit/base-ui.surfaces.split-pane.hover-splitter', () => ({ HoverSplitter: () => null }));
// no JSX inside mock factories: compiled, it references the JSX runtime, which jest forbids there.
jest.mock('@teambit/base-ui.surfaces.split-pane.split-pane', () => ({
  SplitPane: ({ children }: { children?: unknown }) => children,
  Pane: ({ children }: { children?: unknown }) => children,
  Layout: { row: 'row', right: 'right' },
}));
jest.mock('@teambit/component.ui.component-compare.context', () => ({
  useComponentCompare: () => mockUseComponentCompare(),
}));
jest.mock('@teambit/component.ui.component-compare.hooks.use-component-compare-url', () => ({
  useCompareQueryParam: () => undefined,
  useUpdatedUrlFromQuery: () => '',
}));
jest.mock('@teambit/code.ui.queries.get-component-code', () => ({
  useCode: (id?: string) => mockUseCode(id),
}));
jest.mock('@teambit/base-react.navigation.link', () => ({ useLocation: () => ({ pathname: '/' }) }));
jest.mock('@teambit/ui-foundation.ui.react-router.use-query', () => ({ useQuery: () => new URLSearchParams() }));

type Files = Record<string, string | undefined>;

/** Renders the compare for one base tree, one compare tree and per-file statuses. */
function render({ base, compare, statuses, mainFile }: { base?: string[]; compare: string[]; statuses: Files; mainFile: string }) {
  mockViewProps.length = 0;
  mockUseCode.mockImplementation((id?: string) => {
    if (id === 'base') return { fileTree: base, mainFile, loading: false };
    if (id === 'compare') return { fileTree: compare, mainFile, loading: false };
    return { loading: false };
  });
  mockUseComponentCompare.mockReturnValue({
    base: base ? { model: { id: 'base' } } : undefined,
    compare: { model: { id: 'compare' } },
    fileCompareDataByName: new Map(Object.entries(statuses).map(([file, status]) => [file, { status }])),
  });

  renderToStaticMarkup(<CodeCompare />);
  return mockViewProps[mockViewProps.length - 1];
}

describe('CodeCompare', () => {
  it('opens the main file of a new component, where every file is new', () => {
    const files = ['a.composition.tsx', 'index.ts', 'z.tsx'];
    const props = render({
      compare: files,
      statuses: { 'a.composition.tsx': 'NEW', 'index.ts': 'NEW', 'z.tsx': 'NEW' },
      mainFile: 'index.ts',
    });

    expect(props.fileName).toBe('index.ts');
  });

  it('opens the first changed file when the main file did not change', () => {
    const files = ['index.ts', 'a.tsx', 'b.tsx'];
    const props = render({
      base: files,
      compare: files,
      statuses: { 'index.ts': 'UNCHANGED', 'a.tsx': 'UNCHANGED', 'b.tsx': 'MODIFIED' },
      mainFile: 'index.ts',
    });

    expect(props.fileName).toBe('b.tsx');
  });

  it('lists changed files first and keeps the tree order inside each group', () => {
    const files = ['a.tsx', 'b.tsx', 'c.tsx', 'd.tsx'];
    const props = render({
      base: files,
      compare: files,
      statuses: { 'a.tsx': 'UNCHANGED', 'b.tsx': 'MODIFIED', 'c.tsx': 'UNCHANGED', 'd.tsx': 'MODIFIED' },
      mainFile: 'a.tsx',
    });

    expect(props.files).toEqual(['b.tsx', 'd.tsx', 'a.tsx', 'c.tsx']);
  });

  it('holds the file list back while the compare data loads', () => {
    mockViewProps.length = 0;
    mockUseCode.mockReturnValue({ fileTree: ['a.tsx'], mainFile: 'a.tsx', loading: false });
    mockUseComponentCompare.mockReturnValue({
      base: { model: { id: 'base' } },
      compare: { model: { id: 'compare' } },
      fileCompareDataByName: undefined,
    });

    renderToStaticMarkup(<CodeCompare />);

    expect(mockViewProps[0].files).toEqual([]);
  });
});
