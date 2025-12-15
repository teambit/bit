import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';

import { ComponentHostModel } from './component-host-model';

const COMPONENT_HOST = gql`
  {
    getHost {
      id # used for GQL caching
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
