import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql, QueryResult } from '@apollo/client';
import { LaneModel, LanesQuery } from '@teambit/lanes.ui.lanes';
import { ComponentModel, componentOverviewFields } from '@teambit/component';

const GET_LANE_COMPONENTS = gql`
  query LaneComponent($ids: [String!], $extensionId: String) {
    lanes {
      id
      list(ids: $ids) {
        id
        remote
        isMerged
        components {
          ...componentOverviewFields
        }
        readmeComponent {
          ...componentOverviewFields
        }
      }
    }
    getHost(id: $extensionId) {
      id
    }
  }
  ${componentOverviewFields}
`;

export function useLaneComponents(lane: LaneModel): {
  components?: Array<ComponentModel>;
} & Omit<QueryResult<LanesQuery>, 'data'> {
  const { data, ...rest } = useDataQuery(GET_LANE_COMPONENTS, {
    variables: { ids: [lane.name] },
  });

  const components = data?.lanes.list[0].components.map((component) => {
    const componentModel = ComponentModel.from({ ...component, host: data.getHost.id });
    return componentModel;
  });

  return {
    ...rest,
    components,
  };
}
