import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql, QueryResult } from '@apollo/client';
import { LaneModel, LanesModel, LanesQueryResult, LaneComponentModel } from '@teambit/lanes.ui.lanes';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import { ComponentID, ComponentModel } from '@teambit/component';

const GET_LANES = gql`
  {
    getLanes {
      name
      remote
      isMerged
      components {
        id {
          name
          scope
          version
        }
        head
      }
    }
    getCurrentLaneName
  }
`;

const GET_LANE_COMPONENTS = gql`
  query LaneComponent($name: String) {
    getLaneComponents(name: $name) {
      id {
        name
        version
        scope
      }
      compositions {
        filepath
        identifier
        displayName
      }
      preview {
        includesEnvTemplate
      }
    }
  }
`;

export function useLanesQuery(): { lanes?: LaneModel[] } & Omit<QueryResult<LanesQueryResult>, 'data'> {
  const { data, ...rest } = useDataQuery<LanesQueryResult>(GET_LANES);
  const { scope, loading } = useScopeQuery();
  const lanes = data && LanesModel.from(data, scope);
  return {
    ...rest,
    loading: rest.loading || !!loading,
    lanes,
  };
}

export function useLaneComponentsQuery(
  lane: LaneModel,
  host: string
): {
  components?: Array<LaneComponentModel>;
} & Omit<QueryResult<LanesQueryResult>, 'data'> {
  const { data, ...rest } = useDataQuery(GET_LANE_COMPONENTS, {
    variables: { name: lane.name },
  });

  const components: Array<LaneComponentModel> = data?.getLaneComponents.map((component) => {
    const id = component && ComponentID.fromObject(component.id);

    return {
      model: ComponentModel.from({ ...component, host }),
      url: LanesModel.getLaneComponentUrl(id, lane.id),
    };
  });

  return {
    ...rest,
    components,
  };
}
