import { useDataQuery } from '@teambit/ui';
import { gql } from 'apollo-boost';
import { useMemo } from 'react';

import { ComponentModel } from './component-model';
import { ComponentError } from './component-error';

const GET_COMPONENT = gql`
  query Component($id: String!, $extensionId: String!) {
    getHost(id: $extensionId) {
      get(id: $id) {
        id {
          name
          version
          scope
        }
        displayName
        server {
          env
          url
        }
        compositions {
          identifier
        }
        tags {
          version
          snap {
            hash
            timestamp
            message
          }
        }
      }
    }
  }
`;

/** provides data to component ui page, making sure both variables and return value are safely typed and memoized */
export function useComponentQuery(componentId: string, host: string) {
  const { data, error } = useDataQuery(GET_COMPONENT, {
    variables: { id: componentId, extensionId: host },
  });

  const rawComponent = data?.getHost?.get;

  return useMemo(() => {
    return {
      component: rawComponent ? ComponentModel.from(rawComponent) : undefined,
      error: error ? new ComponentError(500, error.message) : undefined,
    };
  }, [rawComponent, error]);
}
