import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { LanesState, mapToLanesState } from '@teambit/lanes.lanes.ui';

const GET_LANES = gql`
  {
    lanes {
      getLanes {
        name
        remote
        isMerged
      }
      getCurrentLaneName
    }
  }
`;

export function getAllLanesQuery(): Partial<LanesState> {
  const { data, loading } = useDataQuery(GET_LANES);
  if (!data || loading) {
    return {};
  }

  const lanes = data?.lanes?.getLanes || [];
  const selectedLaneName = data?.lanes?.getCurrentLaneName;
  return mapToLanesState(lanes, selectedLaneName);
}
