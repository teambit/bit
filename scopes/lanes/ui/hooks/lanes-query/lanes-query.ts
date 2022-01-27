import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { LanesModel, LanesQueryResult, mapToLanesState } from '@teambit/lanes.lanes.ui';

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

export function getAllLanesQuery(): LanesModel {
  const { data, loading } = useDataQuery<LanesQueryResult>(GET_LANES);
  if (!data || loading) {
    return {};
  }

  return mapToLanesState(data);
}
