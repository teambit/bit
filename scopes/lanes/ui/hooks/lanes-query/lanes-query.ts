import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { LanesHost, LanesModel, LanesQueryResult, mapToLanesModel } from '@teambit/lanes.lanes.ui';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';

const GET_LANES = gql`
  {
    lanes {
      getLanes {
        name
        remote
        isMerged
        components {
          id
          head
        }
      }
      getCurrentLaneName
    }
  }
`;

export function useLanes(host: LanesHost): LanesModel {
  const { data: laneData, loading } = useDataQuery<LanesQueryResult>(GET_LANES);
  const { scope } = useScopeQuery();

  if (!laneData || !scope || loading) {
    return {};
  }

  const lanesModels = mapToLanesModel(laneData, scope, host);
  return lanesModels;
}
