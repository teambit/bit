import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql, QueryResult } from '@apollo/client';
import { LaneModel, LanesModel, LanesQueryResult } from '@teambit/lanes.ui.lanes';
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
            version
          }
          head
        }
      }
      getCurrentLaneName
    }
  }
`;

export function useLanesQuery(): { lanes?: LaneModel[]; checkedoutLane?: string } & Omit<
  QueryResult<LanesQueryResult>,
  'data'
> {
  const { data, ...rest } = useDataQuery<LanesQueryResult>(GET_LANES);
  const { scope, loading } = useScopeQuery();
  return {
    ...rest,
    loading: rest.loading || !!loading,
    lanes: data && LanesModel.from(data, scope),
    checkedoutLane: data?.lanes?.getCurrentLaneName,
  };
}
