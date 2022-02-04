import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { LanesHost, LanesModel, LanesQueryResult, mapToLanesModel } from '@teambit/lanes.lanes.ui';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import { ComponentID, ComponentModel } from '@teambit/component';
import { flatMap } from 'lodash';

const GET_LANES = gql`
  {
    lanes {
      getLanes {
        name
        remote
        isMerged
        components {
          id
          head
        }
      }
      getCurrentLaneName
    }
  }
`;

const GET_LANE_COMPONENTS = gql`
  query LaneComponents($ids: [String]!) {
    getHost {
      id # used for GQL caching
      name
      getMany(ids: $ids) {
        id {
          name
          version
          scope
        }
        compositions {
          identifier
        }
        description
        deprecation {
          isDeprecate
        }
        env {
          id
          icon
        }
      }
    }
  }
`;

export function useLanes(host: LanesHost): LanesModel {
  const { data: laneData, loading } = useDataQuery<LanesQueryResult>(GET_LANES);
  const { scope } = useScopeQuery();

  if (!laneData || !scope || loading) {
    return {};
  }

  const lanesModels = mapToLanesModel(laneData, scope, host);
  console.dir(lanesModels);
  return lanesModels;
}

// export function useLaneComponents(componentIdsByLaneName: Map<string, string[]>) {
//   const ids = flatMap([...componentIdsByLaneName.values()]);
//   console.log(ids);
//   const { data } = useDataQuery(GET_LANE_COMPONENTS, { variables: { ids } });
//   console.dir(data);
// }

export function useLaneComponents(ids: string[]) {
  // console.log(ids);
  const { data } = useDataQuery(GET_LANE_COMPONENTS, { variables: { ids } });
  // console.dir(data);
}
