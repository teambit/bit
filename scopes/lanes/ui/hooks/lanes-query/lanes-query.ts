import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql, QueryResult } from '@apollo/client';
import { LanesModel, LanesQueryResult } from '@teambit/lanes.ui.lanes';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';

const GET_LANES = gql`
  {
    lanes {
      getLanes {
        name
        remote
        isMerged
        components {
          id {
            name
            scope
          }
          head
        }
      }
      getCurrentLaneName
    }
  }
`;

export function useLanes(): { lanesModel: LanesModel } & QueryResult<LanesQueryResult> {
  const { data, ...rest } = useDataQuery<LanesQueryResult>(GET_LANES);
  const { scope, loading } = useScopeQuery();
  return {
    ...rest,
    loading: rest.loading || !!loading,
    data,
    lanesModel: (data && LanesModel.from(data, scope)) || new LanesModel({ lanes: [] }),
  };
}
