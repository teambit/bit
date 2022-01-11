import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';

const GET_LANES = gql`
  {
    lanes {
      getLanes {
        name
      }
    }
  }
`;

// const GET_CURRENT_LANE_NAME = gql`
//   {
//     lanes {
//       getCurrentLaneName
//     }
//   }
// `;

export function getLanesQuery(): { lanes?: LaneData[] } {
  const { data, loading } = useDataQuery(GET_LANES);
  if (!data || loading) {
    return {};
  }

  const lanes = data?.lanes?.getLanes || [];

  return { lanes };
}
