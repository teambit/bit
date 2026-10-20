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
