import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { LanesModel, LanesQuery } from '@teambit/lanes.ui.models.lanes-model';
import { gql, QueryResult } from '@apollo/client';
import { LanesContextModel, useLanesContext } from './lanes-context';

const GET_LANES = gql`
  query Lanes($extensionId: String) {
    lanes {
      id
      list {
        id {
          name
          scope
        }
        hash
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
        id {
          name
          scope
        }
      }
    }
    getHost(id: $extensionId) {
      id
    }
  }
`;

export function useLanes(
  targetLanes?: LanesModel
): LanesContextModel & Omit<QueryResult<LanesQuery & { getHost: { id: string } }>, 'data'> {
  const lanesContext = useLanesContext();
  const shouldSkip = !!targetLanes || !!lanesContext;

  const { data, loading, ...rest } = useDataQuery<LanesQuery & { getHost: { id: string } }>(GET_LANES, {
    skip: shouldSkip,
  });

  let lanesModel: LanesModel | undefined;
  if (lanesContext) lanesModel = lanesContext.lanesModel;
  else lanesModel = (data && LanesModel.from({ data, host: data?.getHost?.id })) || targetLanes;

  return {
    ...rest,
    ...(lanesContext || {}),
    loading,
    lanesModel,
  };
}
