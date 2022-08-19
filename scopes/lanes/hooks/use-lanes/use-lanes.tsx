import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import { useEffect } from 'react';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { LanesModel, LanesQuery } from '@teambit/lanes.ui.models.lanes-model';
import { gql, QueryResult } from '@apollo/client';
import { useLanesContext } from './lanes-context';

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

export function useLanes(
  getViewedLaneId?: () => string | undefined
): { lanesModel?: LanesModel } & Omit<QueryResult<LanesQuery>, 'data'> {
  const lanesContext = useLanesContext();
  const skip = !!lanesContext;

  const { data, ...rest } = useDataQuery(GET_LANES, { skip });
  const { scope, loading } = useScopeQuery(skip);

  let lanesModel: LanesModel;
  if (lanesContext) lanesModel = lanesContext;
  else
    lanesModel = data && LanesModel.from({ data, host: data?.getHost?.id, scope, viewedLaneId: getViewedLaneId?.() });

  useEffect(() => {
    if (getViewedLaneId) {
      const viewedLaneId = getViewedLaneId();
      lanesModel?.setViewedLane(viewedLaneId);
    }
  }, [lanesModel, getViewedLaneId]);

  return {
    ...rest,
    loading: rest.loading || !!loading,
    lanesModel,
  };
}
