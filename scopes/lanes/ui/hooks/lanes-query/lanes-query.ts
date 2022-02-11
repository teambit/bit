import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { LanesModel, LanesQueryResult } from '@teambit/lanes.lanes.ui';
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

export function useLanes(): { lanesModel: LanesModel; loading?: boolean } {
  const { data, loading } = useDataQuery<LanesQueryResult>(GET_LANES);
  const scope = useScope();
  return {
    loading,
    lanesModel: (data && LanesModel.from(data, scope)) || new LanesModel({ lanes: [] }),
  };
}
