import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql, QueryResult } from '@apollo/client';
import { LaneModel, LanesModel, LanesQueryResult } from '@teambit/lanes.ui.lanes';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import { ComponentModel } from '@teambit/component';

const GET_LANES = gql`
  query Lanes($extensionId: String) {
    lanes {
      id
      remote
      isMerged
      components {
        id {
          name
          scope
          version
        }
      }
      currentLane {
        id
      }
    }
    getHost(id: $extensionId) {
      id
    }
  }
`;
const laneComponentFields = gql`
  fragment componentFields on Component {
    id {
      name
      version
      scope
    }
    aspects(include: ["teambit.preview/preview", "teambit.pipelines/builder", "teambit.envs/envs"]) {
      # 'id' property in gql refers to a *global* identifier and used for caching.
      # this makes aspect data cache under the same key, even when they are under different components.
      # renaming the property fixes that.
      aspectId: id
      aspectData: data
    }
    packageName
    elementsUrl
    description
    labels
    displayName
    latest
    server {
      env
      url
    }
    buildStatus
    compositions {
      identifier
      displayName
    }
    tags {
      version
    }
    env {
      id
      icon
    }

    preview {
      includesEnvTemplate
    }
  }
`;
const GET_LANE_COMPONENTS = gql`
  query LaneComponent($id: String, $extensionId: String) {
    lanes(id: $id) {
      id
      remote
      isMerged
      components {
        ...componentFields
      }
      currentLane {
        id
      }
    }
    getHost(id: $extensionId) {
      id
    }
  }
  ${laneComponentFields}
`;

export function useLanesQuery(host: string): { lanes?: LanesModel } & Omit<QueryResult<LanesQueryResult>, 'data'> {
  const { data, ...rest } = useDataQuery<LanesQueryResult>(GET_LANES, { variables: { extensionId: host } });
  const { scope, loading } = useScopeQuery();
  const lanes = data && LanesModel.from({ data, host, scope });
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
  components?: Array<ComponentModel>;
} & Omit<QueryResult<LanesQueryResult>, 'data'> {
  const { data, ...rest } = useDataQuery(GET_LANE_COMPONENTS, {
    variables: { id: lane.name, extensionId: host },
  });

  const components: Array<ComponentModel> = data?.lanes[0].components.map((component) =>
    ComponentModel.from({ ...component, host: data.getHost.id })
  );

  return {
    ...rest,
    components,
  };
}
