import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import { useEffect } from 'react';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { LanesModel, LanesQuery } from '@teambit/lanes.ui.lanes';
import { gql, QueryResult } from '@apollo/client';

const GET_LANES = gql`
  query Lanes($extensionId: String) {
    lanes {
      id
      list {
        id
        remote
        isMerged
        readmeComponent {
          id {
            name
            scope
            version
          }
        }
        components {
          id {
            name
            scope
            version
          }
        }
      }
      current {
        id
      }
    }
    getHost(id: $extensionId) {
      id
    }
  }
`;

export function useLanes(viewedLaneId?: string): { lanes?: LanesModel } & Omit<QueryResult<LanesQuery>, 'data'> {
  const { data, ...rest } = useDataQuery(GET_LANES);
  const { scope, loading } = useScopeQuery();
  const lanes = data && LanesModel.from({ data, host: data?.getHost?.id, scope, viewedLaneId });

  useEffect(() => {
    lanes?.setViewedLane(viewedLaneId);
  }, [lanes, viewedLaneId]);

  return {
    ...rest,
    loading: rest.loading || !!loading,
    lanes,
  };
}
