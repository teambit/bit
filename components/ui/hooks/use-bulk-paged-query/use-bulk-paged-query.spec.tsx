import React from 'react';
import { renderHook } from '@testing-library/react';
import { gql } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing';
import { useBulkPagedQuery } from './use-bulk-paged-query.js';

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
