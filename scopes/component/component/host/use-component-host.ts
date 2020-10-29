import { useDataQuery } from '@teambit/ui';
import gql from 'graphql-tag';

import { ComponentHostModel } from './component-host-model';

const COMPONENT_HOST = gql`
  {
    getHost {
      name
      list {
        id {
          name
          version
          scope
        }
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

export function useComponentHost() {
  const { data, loading } = useDataQuery(COMPONENT_HOST);

  if (!data || loading) {
    return {};
  }

  const host = ComponentHostModel.from(data);

  return { host };
}
