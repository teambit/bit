import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql, QueryResult } from '@apollo/client';
import { LanesModel, LanesQueryResult } from '@teambit/lanes.ui.lanes';
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

export function useLanes(): { lanesModel: LanesModel } & QueryResult<LanesQueryResult> {
  const { data, ...rest } = useDataQuery<LanesQueryResult>(GET_LANES);
  const scope = useScope();
  return {
    ...rest,
    data,
    lanesModel: (data && LanesModel.from(data, scope)) || new LanesModel({ lanes: [] }),
  };
}
