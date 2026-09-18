import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { gql } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing';
import { useBulkPagedQuery } from './use-bulk-paged-query';

const QUERY = gql`
  query TestBulk($pairs: [ComponentComparePair!]!, $offset: Int, $limit: Int, $host: String) {
    getHost(id: $host) {
      id
    }
  }
`;

it('settles immediately and reports no data when skipped', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MockedProvider mocks={[]}>{children}</MockedProvider>
  );
  const { result } = renderHook(
    () => useBulkPagedQuery({ query: QUERY, resultField: 'items', pairs: [], pageSize: 25, skip: true }),
    { wrapper }
  );

  // no pairs + skip → paging is done up front: not loading, nothing loaded, and an unknown id is
  // "not in this list" (undefined), never a spurious failure (null).
  expect(result.current.loading).toBe(false);
  expect(result.current.loadedCount).toBe(0);
  expect(result.current.lookupByCompareId('missing')).toBeUndefined();
});

const SINGLE_QUERY = gql`
  query TestSingle($baseId: String!, $compareId: String!, $host: String) {
    getHost(id: $host) {
      id
      item(baseId: $baseId, compareId: $compareId) {
        id
      }
    }
  }
`;

const PAIRS = [
  { baseId: 'scope/a@1', compareId: 'scope/a@2' },
  { baseId: 'scope/b@1', compareId: 'scope/b@2' },
];

/** how a GraphQL server rejects a field its schema does not declare — a validation error, not a fetch failure */
const fieldMissing = {
  request: { query: QUERY, variables: { pairs: PAIRS, offset: 0, limit: 25, host: undefined } },
  result: {
    errors: [{ message: 'Cannot query field "items" on type "ComponentHost". Did you mean "item"?' } as any],
  },
};

const singleMock = (pair: { baseId: string; compareId: string }) => ({
  request: { query: SINGLE_QUERY, variables: { baseId: pair.baseId, compareId: pair.compareId, host: undefined } },
  result: { data: { getHost: { id: 'host', item: { id: pair.compareId } } } },
});

function renderWithFallback(mocks: any[]) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MockedProvider mocks={mocks}>{children}</MockedProvider>
  );
  return renderHook(
    () =>
      useBulkPagedQuery<{ id: string }>({
        query: QUERY,
        resultField: 'items',
        pairs: PAIRS,
        pageSize: 25,
        fallbackQuery: SINGLE_QUERY,
        fallbackResultField: 'item',
      }),
    { wrapper }
  );
}

describe('when the host schema has no bulk field', () => {
  it('falls back to one request per pair and still resolves every pair', async () => {
    // bit.cloud implements the bulk resolver but serves it through a bit whose schema predates the
    // field; without this path the whole compare surface renders empty there.
    const { result } = renderWithFallback([fieldMissing, ...PAIRS.map(singleMock)]);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loadedCount).toBe(2);
    expect(result.current.lookupByCompareId('scope/a@2')).toEqual({ id: 'scope/a@2' });
    expect(result.current.lookupByCompareId('scope/b@2')).toEqual({ id: 'scope/b@2' });
  });

  it('reports a pair that fails on the fallback path as failed, not pending', async () => {
    const { result } = renderWithFallback([
      fieldMissing,
      singleMock(PAIRS[0]),
      { request: singleMock(PAIRS[1]).request, error: new Error('boom') },
    ]);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.lookupByCompareId('scope/a@2')).toEqual({ id: 'scope/a@2' });
    // null, not undefined: it was asked for and will never resolve
    expect(result.current.lookupByCompareId('scope/b@2')).toBeNull();
  });
});
