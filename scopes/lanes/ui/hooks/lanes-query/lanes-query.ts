import { useEffect } from 'react';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql, QueryResult } from '@apollo/client';
import { LaneModel, LanesModel, LanesQuery } from '@teambit/lanes.ui.lanes';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import { ComponentModel, componentOverviewFields } from '@teambit/component';

const GET_LANES = gql`
  query Lanes($extensionId: String) {
    lanes {
      id
      list {
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
      }
      current {
        id
      }
    }
    getHost(id: $extensionId) {
      id
    }
  }
`;

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
      }
    }
    getHost(id: $extensionId) {
      id
    }
  }
  ${componentOverviewFields}
`;

export function useLanesQuery(viewedLaneId?: string): { lanes?: LanesModel } & Omit<QueryResult<LanesQuery>, 'data'> {
  const { data, ...rest } = useDataQuery(GET_LANES);
  const { scope, loading } = useScopeQuery();
  const lanes = data && LanesModel.from({ data, host: data?.getHost?.id, scope, viewedLaneId });

  useEffect(() => {
    lanes?.setViewedLane(viewedLaneId);
  }, [lanes, viewedLaneId]);

  return {
    ...rest,
    loading: rest.loading || !!loading,
    lanes,
  };
}

export function useLaneComponentsQuery(lane: LaneModel): {
  components?: Array<ComponentModel>;
} & Omit<QueryResult<LanesQuery>, 'data'> {
  const { data, ...rest } = useDataQuery(GET_LANE_COMPONENTS, {
    variables: { ids: [lane.name] },
  });

  const components: Array<ComponentModel> = data?.lanes.list[0].components.map((component) =>
    ComponentModel.from({ ...component, host: data.getHost.id })
  );

  return {
    ...rest,
    components,
  };
}
