import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql, QueryResult } from '@apollo/client';
import { LaneModel, LanesQuery } from '@teambit/lanes.ui.lanes';
import { componentFields, ComponentModel } from '@teambit/component';

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
        id
        remote
        isMerged
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

export function useLaneReadme(lane: LaneModel): {
  component: ComponentModel;
} & Omit<QueryResult<LanesQuery>, 'data'> {
  const { data, ...rest } = useDataQuery(GET_LANE_README_COMPONENT, {
    variables: { ids: [lane.name] },
    skip: !lane.readmeComponent,
  });

  const readmeComponentFromQuery = data?.lanes.list[0]?.readmeComponent;

  const component =
    readmeComponentFromQuery && ComponentModel.from({ ...readmeComponentFromQuery, host: data.getHost.id });

  return {
    ...rest,
    component,
  };
}
