import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { ComponentModel, componentOverviewFields } from '@teambit/component';
import { LaneId } from '@teambit/lane-id';

const GET_LANE_COMPONENTS = gql`
  query LaneComponent($ids: [String!], $extensionId: String, $skipList: Boolean!) {
    lanes {
      id
      list(ids: $ids) @skip(if: $skipList) {
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
      default {
        id {
          name
          scope
        }
        hash
        components {
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

export type UseLaneComponentsResult = {
  components?: Array<ComponentModel>;
  loading?: boolean;
};

export function useLaneComponents(laneId?: LaneId): UseLaneComponentsResult {
  const { data, loading } = useDataQuery(GET_LANE_COMPONENTS, {
    variables: { ids: [laneId?.toString()], skipList: laneId?.isDefault() },
    skip: !laneId,
  });

  const rawComps = data?.lanes.list && data?.lanes.list.length > 0 ? data?.lanes.list[0] : data?.lanes.default;

  const components = rawComps?.components?.map((component) => {
    const componentModel = ComponentModel.from({ ...component, host: data.getHost.id });
    return componentModel;
  });

  return {
    loading,
    components,
  };
}
