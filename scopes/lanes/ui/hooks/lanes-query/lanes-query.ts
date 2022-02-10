import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { LanesModel, LanesQueryResult, mapToLanesModel } from '@teambit/lanes.lanes.ui';
import { useScope } from '@teambit/scope.ui.hooks.scope-context';

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

export function useLanes(): LanesModel & { loading: boolean } {
  const { data, loading } = useDataQuery<LanesQueryResult>(GET_LANES);
  const scope = useScope();
  const lanesModels = (data && mapToLanesModel(data, scope)) || {};
  return { ...lanesModels, loading };
}
