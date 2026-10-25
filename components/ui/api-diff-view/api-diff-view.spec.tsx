import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.node';
import { renderHook, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { GraphQLError } from 'graphql';
import { ComponentApiDiffSection } from './component-api-diff-section';
import { useApiDiff, API_DIFF_QUERY } from './use-api-diff';
import { ApiDiffDataProvider, useApiDiffData } from './api-diff-data-context';
import { UNSUPPORTED_API_DIFF, isApiDiffUnsupported } from './api-diff-model';

// the section only needs these from diff-viewer; importing it for real pulls shiki's ESM entry points
// into the jest transform. No JSX in mock factories: compiled, it would reference the JSX runtime.
jest.mock('@teambit/code.ui.diff-viewer', () => ({
  useHighlightedLines: () => null,
  resolveTokenColor: () => undefined,
  computeDiffLines: () => [],
}));

// the provider test stubs the paging hook (its unsupported detection has its own tests) so it covers the
// provider's mapping only, and does not render through a second copy of the hook's React.
const mockUseBulkPagedQuery = jest.fn();
jest.mock('@teambit/ui-foundation.ui.hooks.use-bulk-paged-query', () => ({
  ...jest.requireActual('@teambit/ui-foundation.ui.hooks.use-bulk-paged-query'),
  useBulkPagedQuery: (...args: unknown[]) => mockUseBulkPagedQuery(...args),
}));

const SCHEMA_ERROR = 'Cannot query field "status" on type "APIDiffResult".';

function renderSection(result: Parameters<typeof ComponentApiDiffSection>[0]['result']) {
  return renderToStaticMarkup(
    <ComponentApiDiffSection componentIdStr="org.scope/button" displayName="org.scope/button" result={result} />
  );
}

describe('ComponentApiDiffSection', () => {
  it('shows a neutral notice when the server has no API diff support', () => {
    const markup = renderSection(UNSUPPORTED_API_DIFF);
    expect(markup).toContain("API diff isn&#x27;t available");
    expect(markup).not.toContain('API diff failed');
  });

  it('still reports a failure when the server could not compute the diff', () => {
    expect(renderSection(null)).toContain('API diff failed');
  });
});

describe('useApiDiff', () => {
  it('returns the unsupported result when the server schema lacks API diff fields', async () => {
    const mocks = [
      {
        request: { query: API_DIFF_QUERY, variables: { baseId: 'a@1', compareId: 'a@2', host: undefined } },
        result: { errors: [new GraphQLError(SCHEMA_ERROR)] },
      },
    ];
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MockedProvider mocks={mocks}>{children}</MockedProvider>
    );
    const { result } = renderHook(() => useApiDiff('a@1', 'a@2'), { wrapper });

    await waitFor(() => expect(result.current.unsupported).toBe(true));
    expect(isApiDiffUnsupported(result.current.result)).toBe(true);
    expect(result.current.error).toBeUndefined();
  });
});

describe('ApiDiffDataProvider', () => {
  it('reads every requested pair as unsupported when the server lacks the bulk query', () => {
    const pairs = [{ baseId: 'a@1', compareId: 'a@2' }];
    // what the paging hook reports for a server without `apiDiffs`: done, every requested pair null.
    mockUseBulkPagedQuery.mockReturnValue({
      lookupByCompareId: (compareId: string) => (compareId === 'a@2' ? null : undefined),
      loading: false,
      loadedCount: 0,
      unsupported: true,
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ApiDiffDataProvider pairs={pairs} active>
        {children}
      </ApiDiffDataProvider>
    );
    const { result } = renderHook(() => useApiDiffData(), { wrapper });

    expect(result.current?.unsupported).toBe(true);
    expect(result.current?.loading).toBe(false);
    expect(isApiDiffUnsupported(result.current?.apiDiffFor('a@2'))).toBe(true);
    // a pair that was never requested is still "not in this list"
    expect(result.current?.apiDiffFor('other@1')).toBeUndefined();
  });
});
