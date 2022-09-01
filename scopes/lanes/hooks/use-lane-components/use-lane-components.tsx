import { useDataQuery, DataQueryResult } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { LanesQuery } from '@teambit/lanes.ui.models.lanes-model';
import { ComponentModel, componentOverviewFields } from '@teambit/component';
import { LaneId } from '@teambit/lane-id';

const GET_LANE_COMPONENTS = gql`
  query LaneComponent($ids: [String!], $extensionId: String) {
    lanes {
      id
      list(ids: $ids) {
        id {
          name
          scope
        }
        hash
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

export function useLaneComponents(laneId?: LaneId): {
  components?: Array<ComponentModel>;
} & Omit<DataQueryResult<LanesQuery, { ids: (string | undefined)[] }>, 'data'> {
  const { data, ...rest } = useDataQuery(GET_LANE_COMPONENTS, {
    variables: { ids: [laneId?.toString()] },
    skip: !laneId,
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
