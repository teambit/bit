import { useEffect } from 'react';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql, QueryResult } from '@apollo/client';
import { LaneModel, LanesModel, LanesQuery } from '@teambit/lanes.ui.lanes';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import { componentFields, ComponentModel, componentOverviewFields } from '@teambit/component';
import { ComponentDescriptor } from '@teambit/component-descriptor';

const GET_LANES = gql`
  query Lanes($extensionId: String) {
    lanes {
      id
      list {
        id
        remote
        isMerged
        readmeComponent {
          id {
            name
            scope
            version
          }
        }
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
  components?: Array<{ model: ComponentModel; descriptor: ComponentDescriptor }>;
} & Omit<QueryResult<LanesQuery>, 'data'> {
  const { data, ...rest } = useDataQuery(GET_LANE_COMPONENTS, {
    variables: { ids: [lane.name] },
  });

  const components = data?.lanes.list[0].components.map((component) => {
    const componentModel = ComponentModel.from({ ...component, host: data.getHost.id });
    const aspectList = {
      entries: component?.aspects,
    };

    const componentDescriptor = ComponentDescriptor.fromObject({ id: componentModel.id.toString(), aspectList });
    return { model: componentModel, descriptor: componentDescriptor };
  });

  return {
    ...rest,
    components,
  };
}

const GET_LANE_README_COMPONENT = gql`
  query LaneReadmeComponent($ids: [String!], $extensionId: String) {
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

export function useLaneReadmeQuery(lane: LaneModel): {
  model: ComponentModel;
  descriptor: ComponentDescriptor;
} & Omit<QueryResult<LanesQuery>, 'data'> {
  const { data, ...rest } = useDataQuery(GET_LANE_README_COMPONENT, {
    variables: { ids: [lane.name] },
  });
  const readmeComponentFromQuery = data?.lanes.list[0].readmeComponent;

  const model = readmeComponentFromQuery && ComponentModel.from({ ...readmeComponentFromQuery, host: data.getHost.id });

  const aspectList = {
    entries: readmeComponentFromQuery?.aspects,
  };

  const descriptor = model && ComponentDescriptor.fromObject({ id: model.id.toString(), aspectList });

  return {
    ...rest,
    model,
    descriptor,
  };
}
