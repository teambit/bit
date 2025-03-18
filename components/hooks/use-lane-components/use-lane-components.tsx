import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { ComponentID, ComponentModel, componentOverviewFields } from '@teambit/component';
import { LaneId } from '@teambit/lane-id';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { compact } from 'lodash';

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
  componentDescriptors?: Array<ComponentDescriptor>;
  loading?: boolean;
};

export function useLaneComponents(laneId?: LaneId): UseLaneComponentsResult {
  // @ts-ignore
  const { data, loading } = useDataQuery(GET_LANE_COMPONENTS, {
    variables: { ids: [laneId?.toString()], skipList: laneId?.isDefault() },
    skip: !laneId,
  });

  const rawComps = data?.lanes.list && data?.lanes.list.length > 0 ? data?.lanes.list[0] : data?.lanes.default;

  const components = rawComps?.components?.map((component) => {
    const componentModel = ComponentModel.from({ ...component, host: data.getHost.id });
    return componentModel;
  });

  const componentDescriptors: ComponentDescriptor[] = compact(
    rawComps?.components?.map((rawComponent) => {
      const id = rawComponent ? ComponentID.fromObject(rawComponent.id) : undefined;
      const aspectList = {
        entries: rawComponent?.aspects.map((aspectObject) => {
          return {
            ...aspectObject,
            aspectId: aspectObject.id,
            aspectData: aspectObject.data,
          };
        }),
      };
      return id ? ComponentDescriptor.fromObject({ id: id.toString(), aspectList }) : undefined;
    })
  );

  return {
    loading,
    components,
    componentDescriptors,
  };
}
