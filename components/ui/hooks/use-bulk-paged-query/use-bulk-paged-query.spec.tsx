import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { gql } from '@apollo/client';
import { GraphQLError } from 'graphql';
import { MockedProvider } from '@apollo/client/testing';
import { useBulkPagedQuery, isUnsupportedQueryError } from './use-bulk-paged-query';

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
    // the rejection was recovered from, so it is not reported as unsupported
    expect(result.current.unsupported).toBe(false);
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

describe('isUnsupportedQueryError', () => {
  const schemaMessage = 'Cannot query field "apiDiffs" on type "ComponentHost". Did you mean "apiDiff"?';

  it('recognizes a schema mismatch reported as a GraphQL error', () => {
    expect(isUnsupportedQueryError({ graphQLErrors: [{ message: schemaMessage }] })).toBe(true);
  });

  it('recognizes a schema mismatch reported in a 400 network error', () => {
    expect(isUnsupportedQueryError({ networkError: { result: { errors: [{ message: schemaMessage }] } } })).toBe(true);
  });

  it('recognizes a 400 response whose server message was dropped by the client', () => {
    // Bit Cloud's error link turns the 400 into a GraphQL error carrying only Apollo's message.
    expect(isUnsupportedQueryError({ graphQLErrors: [{ message: 'Response not successful: Received status code 400' }] })).toBe(true);
    expect(isUnsupportedQueryError({ networkError: { statusCode: 400 } })).toBe(true);
  });

  it('does not treat other failures as a schema mismatch', () => {
    expect(isUnsupportedQueryError({ graphQLErrors: [{ message: 'timeout' }] })).toBe(false);
    expect(isUnsupportedQueryError({ networkError: new Error('Failed to fetch') })).toBe(false);
    expect(isUnsupportedQueryError({ graphQLErrors: [{ message: 'Response not successful: Received status code 500' }] })).toBe(false);
    expect(isUnsupportedQueryError(undefined)).toBe(false);
  });
});

it('stops at once and reports unsupported when the server schema lacks the query', async () => {
  const pairs = [
    { baseId: 'a@1', compareId: 'a@2' },
    { baseId: 'b@1', compareId: 'b@2' },
  ];
  const mocks = [
    {
      request: { query: QUERY, variables: { pairs, offset: 0, limit: 25, host: undefined } },
      result: { errors: [new GraphQLError('Cannot query field "items" on type "ComponentHost".')] },
    },
  ];
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MockedProvider mocks={mocks}>{children}</MockedProvider>
  );
  const { result } = renderHook(
    () => useBulkPagedQuery({ query: QUERY, resultField: 'items', pairs, pageSize: 25 }),
    { wrapper }
  );

  await waitFor(() => expect(result.current.unsupported).toBe(true));
  expect(result.current.loading).toBe(false);
  // requested pairs read as failed (null): the data will never come from this server.
  expect(result.current.lookupByCompareId('a@2')).toBeNull();
});

it('keeps loaded results and retries when a later page fails', async () => {
  const pairs = [
    { baseId: 'a@1', compareId: 'a@2' },
    { baseId: 'b@1', compareId: 'b@2' },
  ];
  const PAGED = gql`
    query TestPaged($pairs: [ComponentComparePair!]!, $offset: Int, $limit: Int, $host: String) {
      getHost(id: $host) {
        id
        items(pairs: $pairs, offset: $offset, limit: $limit) {
          name
        }
      }
    }
  `;
  const mocks = [
    {
      request: { query: PAGED, variables: { pairs, offset: 0, limit: 1, host: undefined } },
      result: { data: { getHost: { __typename: 'ComponentHost', id: 'h', items: [{ __typename: 'Item', name: 'a' }] } } },
    },
    // the second page fails with a 400: that is not a schema mismatch, the first page worked.
    {
      request: { query: PAGED, variables: { pairs, offset: 1, limit: 1, host: undefined } },
      result: { errors: [new GraphQLError('Response not successful: Received status code 400')] },
    },
  ];
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MockedProvider mocks={mocks}>{children}</MockedProvider>
  );
  const { result } = renderHook(
    () => useBulkPagedQuery<{ name: string }>({ query: PAGED, resultField: 'items', pairs, pageSize: 1 }),
    { wrapper }
  );

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.unsupported).toBe(false);
  expect(result.current.lookupByCompareId('a@2')).toEqual({ __typename: 'Item', name: 'a' });
});
