import { useDataQuery, DataQueryResult } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { LanesQuery } from '@teambit/lanes.ui.models.lanes-model';
import { componentFields, ComponentModel } from '@teambit/component';
import { LaneId } from '@teambit/lane-id';

const GET_LANE_README_COMPONENT = gql`
  query LaneReadmeComponent(
    $ids: [String!]
    $extensionId: String
    $logType: String
    $logOffset: Int
    $logLimit: Int
    $logHead: String
    $logSort: String
  ) {
    lanes {
      id
      list(ids: $ids) {
        id {
          name
          scope
        }
        hash
        readmeComponent {
          ...componentFields
        }
      }
    }
    getHost(id: $extensionId) {
      id
    }
  }
  ${componentFields}
`;

export function useLaneReadme(
  laneId: LaneId,
  skip?: boolean
): {
  component: ComponentModel;
} & Omit<DataQueryResult<LanesQuery, { ids: string[] }>, 'data'> {
  const { data, ...rest } = useDataQuery(GET_LANE_README_COMPONENT, {
    variables: { ids: [laneId.name] },
    skip,
  });

  const readmeComponentFromQuery = data?.lanes.list[0]?.readmeComponent;

  const component =
    readmeComponentFromQuery && ComponentModel.from({ ...readmeComponentFromQuery, host: data.getHost.id });

  return {
    ...rest,
    component,
  };
}
